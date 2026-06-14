/* =========================================================================
   HART LENDING — Property Readiness Score
   Self-contained quiz → scoring engine → roadmap → results → PDF.
   Vanilla JS, no build step. Reuses the site's design tokens & form styles.
   The only external dependency is the locally-vendored html2pdf bundle
   (js/vendor/html2pdf.bundle.min.js), loaded by score.html before this file.
   ========================================================================= */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */
  function el(sel, ctx) { return (ctx || document).querySelector(sel); }
  function clamp(n) { return Math.max(0, Math.min(100, n)); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-AU"); }
  function fmtMoney(n) { return "$" + fmt(Math.round(n)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ----------------------------------------------------------------------
     Pillars — internal 0–100 each, combined by weight into the /100 score.
     Weights reflect what actually drives an Australian home-loan approval.
     ---------------------------------------------------------------------- */
  var PILLARS = [
    { key: "deposit",  label: "Deposit strength",   weight: 20 },
    { key: "income",   label: "Income stability",   weight: 18 },
    { key: "expenses", label: "Living expenses",    weight: 14 },
    { key: "credit",   label: "Credit profile",     weight: 18 },
    { key: "lender",   label: "Lender fit",         weight: 10 },
    { key: "property", label: "Property risk",      weight: 8  },
    { key: "approval", label: "Approval readiness", weight: 12 }
  ];

  /* ----------------------------------------------------------------------
     Questions — data-driven. Each option carries per-pillar points and an
     optional improvement tip. A pillar's internal score = its raw points
     normalised against the maximum points achievable for that pillar.
     ---------------------------------------------------------------------- */
  var QUESTIONS = [
    {
      id: "price", step: "Your purchase",
      label: "Roughly what price range are you looking at?",
      help: "A ballpark is fine — it just sets the scale for your deposit.",
      type: "radio",
      options: [
        { label: "Under $400k",        value: 350000 },
        { label: "$400k – $650k",      value: 525000 },
        { label: "$650k – $900k",      value: 775000 },
        { label: "$900k – $1.2M",      value: 1050000 },
        { label: "$1.2M+",             value: 1400000 }
      ]
    },
    {
      id: "deposit", step: "Your purchase",
      label: "How much deposit have you saved so far?",
      help: "Include savings, the First Home Super Saver, and any gift you'll receive.",
      type: "money",
      compute: function (a) {
        var price = Number(a.price) || 0;
        var dep = Number(a.deposit) || 0;
        if (!price) return null;
        var lvr = dep >= price ? 0 : (price - dep) / price * 100;
        var pts;
        if (lvr <= 80) pts = 70;
        else if (lvr <= 85) pts = 58;
        else if (lvr <= 90) pts = 45;
        else if (lvr <= 95) pts = 30;
        else pts = 15;

        var tip = null;
        var dep20 = price * 0.20;
        if (dep < dep20) {
          var gap = Math.max(1000, Math.round((dep20 - dep) / 1000) * 1000);
          tip = {
            pillar: "deposit",
            title: "Build your deposit toward 20%",
            impact: lvr > 95 ? 9 : lvr > 90 ? 7 : 5,
            why: "A 20% deposit (an 80% loan) avoids Lenders Mortgage Insurance — often several thousand dollars added straight onto your loan.",
            action: "You're about " + fmtMoney(gap) + " away from a 20% deposit on a " + fmtMoney(price) +
                    " purchase. Even reaching 10–15% widens your lender choice, and the federal Home Guarantee Scheme may let you in sooner with a smaller deposit and no LMI."
          };
        }
        return { scores: { deposit: pts }, max: { deposit: 70 }, tip: tip };
      }
    },
    {
      id: "genuine", step: "Your purchase",
      label: "How much of that deposit is genuine savings you've built yourself?",
      help: "Many lenders want to see 5% saved steadily over 3+ months — not just a lump sum gift.",
      type: "radio",
      options: [
        { label: "All of it — saved over time",      value: "all",   score: { deposit: 30 } },
        { label: "Most of it",                        value: "most",  score: { deposit: 24 } },
        { label: "About half",                        value: "half",  score: { deposit: 16 } },
        { label: "A little — mostly a gift",          value: "some",  score: { deposit: 8 },
          tip: { pillar: "deposit", title: "Show a track record of genuine savings", impact: 4,
            why: "Most lenders treat 5% of the price, saved steadily, as proof you can manage repayments. A pure gift doesn't count as 'genuine savings' for many products.",
            action: "Set up an automatic transfer to a dedicated savings account and let it build for at least 3 months — it both grows your deposit and ticks the genuine-savings box." } },
        { label: "It's a gift or inheritance",        value: "gift",  score: { deposit: 4 },
          tip: { pillar: "deposit", title: "Build some genuine savings alongside your gift", impact: 4,
            why: "A gifted deposit is fine, but several lenders still want to see 5% you've saved yourself before they'll approve.",
            action: "Start a regular automatic transfer now so you have 3+ months of genuine savings on record by the time you apply." } }
      ]
    },
    {
      id: "employment", step: "Your income",
      label: "What best describes your main employment?",
      help: "If you have two incomes, answer for the stronger one.",
      type: "radio",
      options: [
        { label: "Permanent full-time",              value: "permft",  score: { income: 60 } },
        { label: "Permanent part-time",              value: "permpt",  score: { income: 50 } },
        { label: "Self-employed, 2+ years",          value: "self2",   score: { income: 48 } },
        { label: "Contract / fixed-term",            value: "contract",score: { income: 40 } },
        { label: "Casual",                           value: "casual",  score: { income: 32 },
          tip: { pillar: "income", title: "Strengthen how your income reads to lenders", impact: 4,
            why: "Casual income is often only counted after 6–12 months in the same job, and sometimes shaded down.",
            action: "Staying put builds history. If a permanent role is on the table, even part-time, it can lift your borrowing power noticeably." } },
        { label: "Self-employed, under 2 years",     value: "self1",   score: { income: 22 },
          tip: { pillar: "income", title: "Time your application around your tax returns", impact: 5,
            why: "Most lenders want two years of business financials, though some accept one full year with the right paperwork.",
            action: "Keep your BAS and tax lodgements up to date — and ask us about lenders that accept one year of returns or alternative-doc loans." } },
        { label: "Between jobs right now",           value: "none",    score: { income: 6 },
          tip: { pillar: "income", title: "Secure stable income before applying", impact: 7,
            why: "Lenders assess your ability to repay from current, ongoing income — a gap makes approval very difficult.",
            action: "Once you're settled in a new role, even a few weeks of payslips changes the picture. Let's plan the timing together." } }
      ]
    },
    {
      id: "tenure", step: "Your income",
      label: "How long have you been in your current job or business?",
      type: "radio",
      options: [
        { label: "2+ years",            value: "2y",     score: { income: 40 } },
        { label: "1 – 2 years",         value: "12y",    score: { income: 32 } },
        { label: "6 – 12 months",       value: "612m",   score: { income: 22 } },
        { label: "Under 6 months (on probation)", value: "prob", score: { income: 10 },
          tip: { pillar: "income", title: "Get past probation before you apply", impact: 6,
            why: "Many lenders won't count income while you're on probation; finishing it can unlock more lenders and a higher loan amount.",
            action: "If you're close, waiting a few weeks to clear probation can be the single biggest lift to your borrowing power." } }
      ]
    },
    {
      id: "dependants", step: "Your spending",
      label: "How many dependants do you support?",
      help: "Children or others who rely on your income.",
      type: "radio",
      options: [
        { label: "None",    value: "0",  score: { expenses: 30 } },
        { label: "One",     value: "1",  score: { expenses: 22 } },
        { label: "Two",     value: "2",  score: { expenses: 15 } },
        { label: "Three or more", value: "3", score: { expenses: 8 } }
      ]
    },
    {
      id: "debts", step: "Your spending",
      label: "Roughly what do your other loan and card repayments total each month?",
      help: "Car loans, personal loans, HECS, credit-card minimums — not rent.",
      type: "radio",
      options: [
        { label: "None",            value: "0",    score: { expenses: 45 } },
        { label: "Under $500",      value: "u500", score: { expenses: 36 } },
        { label: "$500 – $1,000",   value: "1k",   score: { expenses: 26 },
          tip: { pillar: "expenses", title: "Trim monthly commitments before applying", impact: 4,
            why: "Every dollar of repayments reduces how much a lender will lend you — often by far more than the dollar itself.",
            action: "Paying out or consolidating a small personal or car loan can lift your borrowing power more than you'd expect." } },
        { label: "$1,000 – $2,000", value: "2k",   score: { expenses: 14 },
          tip: { pillar: "expenses", title: "Reduce existing debt to free up borrowing power", impact: 6,
            why: "High monthly commitments are the most common reason a loan amount comes in lower than hoped.",
            action: "Prioritise clearing the smallest debts first. We can model exactly how much each one is costing your borrowing capacity." } },
        { label: "$2,000+",         value: "2kplus", score: { expenses: 5 },
          tip: { pillar: "expenses", title: "Tackle high monthly repayments", impact: 7,
            why: "Above roughly $2,000/month in commitments, serviceability becomes the main thing holding your approval back.",
            action: "Let's build a debt-reduction plan — consolidating or clearing the right debts can transform what you're able to borrow." } }
      ]
    },
    {
      id: "bnpl", step: "Your spending",
      label: "How often do you use Buy-Now-Pay-Later (Afterpay, Zip, etc.)?",
      type: "radio",
      options: [
        { label: "Never",       value: "never",  score: { expenses: 25 } },
        { label: "Rarely",      value: "rare",   score: { expenses: 18 } },
        { label: "Most months", value: "month",  score: { expenses: 10 },
          tip: { pillar: "expenses", title: "Wind down Buy-Now-Pay-Later accounts", impact: 4,
            why: "Lenders increasingly read BNPL as a sign of stretched cash flow and may count the limits as liabilities.",
            action: "Clear and close your Afterpay/Zip accounts a couple of months before applying — it tidies both your statements and your liabilities." } },
        { label: "Regularly",   value: "often",  score: { expenses: 4 },
          tip: { pillar: "expenses", title: "Close out regular BNPL use", impact: 6,
            why: "Frequent BNPL activity on your bank statements is a red flag for many credit assessors.",
            action: "Stop using BNPL now and close the accounts — lenders typically look back over 3 months of statements." } }
      ]
    },
    {
      id: "creditself", step: "Your credit",
      label: "How would you rate your credit history?",
      type: "radio",
      options: [
        { label: "Excellent",  value: "exc",  score: { credit: 40 } },
        { label: "Good",       value: "good", score: { credit: 32 } },
        { label: "Fair",       value: "fair", score: { credit: 20 },
          tip: { pillar: "credit", title: "Polish your credit profile", impact: 4,
            why: "A fair score can still mean a higher rate or fewer lender options.",
            action: "Pay every bill on time for the next few months, keep card balances low, and avoid new applications — scores recover faster than people expect." } },
        { label: "Not sure",   value: "unsure", score: { credit: 18 },
          tip: { pillar: "credit", title: "Check your credit report (it's free)", impact: 3,
            why: "You can't fix what you can't see — and errors on credit files are common.",
            action: "Pull a free copy from Equifax, Experian or illion. We'll help you read it and tidy up anything that's dragging you down." } },
        { label: "Poor",       value: "poor", score: { credit: 8 },
          tip: { pillar: "credit", title: "Rebuild your credit before applying", impact: 7,
            why: "A poor history limits you to specialist lenders at higher rates — but it's very fixable with time.",
            action: "Set up automatic payments so nothing is ever late, reduce balances below 30% of limits, and give it a few months. We'll map a realistic timeline." } }
      ]
    },
    {
      id: "arrears", step: "Your credit",
      label: "Any defaults, arrears or missed repayments in the last 2 years?",
      type: "radio",
      options: [
        { label: "None",                value: "none", score: { credit: 40 } },
        { label: "One missed payment",  value: "one",  score: { credit: 26 },
          tip: { pillar: "credit", title: "Keep a clean run from here", impact: 3,
            why: "A single recent slip fades quickly if everything else stays on time.",
            action: "Automate your payments so there are no more, and the impact shrinks month by month." } },
        { label: "A few late payments", value: "few",  score: { credit: 16 },
          tip: { pillar: "credit", title: "Let recent late payments age", impact: 5,
            why: "Lenders weigh the most recent 6–12 months most heavily.",
            action: "A clean stretch with no late payments noticeably improves your standing — consistency is the lever here." } },
        { label: "A default or two",    value: "default", score: { credit: 6 },
          tip: { pillar: "credit", title: "Resolve and age any defaults", impact: 7,
            why: "Paid defaults look far better than unpaid ones, and their impact lessens as they age.",
            action: "Pay out any listed defaults so they're marked 'paid', then let time pass. We know which lenders are most forgiving of past defaults." } },
        { label: "Yes, several",        value: "several", score: { credit: 2 },
          tip: { pillar: "credit", title: "Build a recovery plan for your credit file", impact: 8,
            why: "Multiple recent issues need a deliberate plan, but they don't lock you out forever.",
            action: "Let's prioritise which listings to clear first and set a realistic 6–12 month runway to a much stronger file." } }
      ]
    },
    {
      id: "cards", step: "Your credit",
      label: "What do your credit cards look like?",
      help: "Lenders count your full limit as a liability — even if you pay it off.",
      type: "radio",
      options: [
        { label: "None, or always paid in full", value: "none", score: { credit: 20 } },
        { label: "One card, modest limit",       value: "one",  score: { credit: 16 } },
        { label: "A couple of cards",            value: "two",  score: { credit: 10 },
          tip: { pillar: "credit", title: "Reduce your total card limits", impact: 4,
            why: "Lenders assess the full limit on every card as if it were fully drawn — even unused limits cut your borrowing power.",
            action: "Lower the limits on cards you don't need, or close one entirely before applying." } },
        { label: "High limits / I carry balances", value: "high", score: { credit: 4 },
          tip: { pillar: "credit", title: "Cut card limits and clear balances", impact: 6,
            why: "High limits and carried balances hit both your borrowing power and your credit score.",
            action: "Pay balances down below 30% of the limit, then reduce or close limits you don't use. This is one of the fastest wins available." } }
      ]
    },
    {
      id: "residency", step: "Your fit",
      label: "What's your residency status?",
      type: "radio",
      options: [
        { label: "Australian citizen",        value: "citizen", score: { lender: 60 } },
        { label: "Permanent resident",        value: "pr",      score: { lender: 55 } },
        { label: "NZ citizen (subclass 444)", value: "nz",      score: { lender: 44 } },
        { label: "Temporary or work visa",    value: "temp",    score: { lender: 26 },
          tip: { pillar: "lender", title: "Match yourself to visa-friendly lenders", impact: 4,
            why: "Many lenders restrict or decline temporary-visa applicants, and FIRB rules may apply — but specialist lenders exist.",
            action: "This is exactly where a broker earns their keep. We'll point you to lenders comfortable with your visa and explain any FIRB steps." } },
        { label: "Other / not sure",          value: "other",   score: { lender: 20 },
          tip: { pillar: "lender", title: "Confirm your lending eligibility", impact: 3,
            why: "Your residency status shapes which lenders and schemes you can use.",
            action: "A quick chat will clarify exactly where you stand and which lenders fit." } }
      ]
    },
    {
      id: "purpose", step: "Your fit",
      label: "What's the loan for?",
      type: "radio",
      options: [
        { label: "A first home to live in", value: "first",  score: { lender: 40 } },
        { label: "My next home to live in", value: "next",   score: { lender: 38 } },
        { label: "Refinancing an existing loan", value: "refi", score: { lender: 36 } },
        { label: "An investment property",  value: "invest", score: { lender: 30 } },
        { label: "Not sure yet",            value: "unsure", score: { lender: 24 } }
      ]
    },
    {
      id: "propertytype", step: "Your fit",
      label: "What kind of property are you considering?",
      type: "radio",
      options: [
        { label: "A house",                 value: "house",   score: { property: 100 } },
        { label: "A townhouse",             value: "town",    score: { property: 88 } },
        { label: "A standard apartment / unit", value: "unit", score: { property: 74 } },
        { label: "Off-the-plan",            value: "otp",     score: { property: 52 },
          tip: { pillar: "property", title: "Plan ahead for off-the-plan risk", impact: 4,
            why: "Valuations can come in under the contract price at settlement, and finance usually can't be locked until completion.",
            action: "Keep a deposit buffer for a possible valuation shortfall, and we'll line up finance ready for settlement." } },
        { label: "A small unit / studio (<50sqm)", value: "studio", score: { property: 40 },
          tip: { pillar: "property", title: "Choose a lender comfortable with small dwellings", impact: 4,
            why: "Many lenders cap their loan-to-value ratio (or decline) on apartments under 50sqm.",
            action: "We'll steer you to lenders happy with compact dwellings so the property type doesn't sink your approval." } },
        { label: "Rural / acreage",         value: "rural",   score: { property: 48 },
          tip: { pillar: "property", title: "Use a lender that suits rural property", impact: 4,
            why: "Acreage and rural zoning often mean lower maximum LVRs and fewer willing lenders.",
            action: "Let us match you with lenders that lend well on rural and lifestyle properties." } },
        { label: "Not sure yet",            value: "unsure",  score: { property: 70 } }
      ]
    },
    {
      id: "preapproval", step: "Your readiness",
      label: "Where are you with pre-approval?",
      type: "radio",
      options: [
        { label: "Already pre-approved",        value: "have",  score: { approval: 45 } },
        { label: "Started the process",         value: "started", score: { approval: 32 } },
        { label: "Not yet, but ready to start", value: "ready", score: { approval: 22 },
          tip: { pillar: "approval", title: "Get a pre-approval before you shop", impact: 6,
            why: "A real pre-approval tells you your true budget and lets you bid or offer with confidence instead of crossed fingers.",
            action: "This is the natural next step — a free 20-minute chat starts it. You'll know exactly what you can spend." } },
        { label: "Just exploring for now",      value: "explore", score: { approval: 14 },
          tip: { pillar: "approval", title: "Turn exploring into a real plan", impact: 5,
            why: "Knowing your numbers early means you're ready to move the moment the right property appears.",
            action: "Even if you're months away from buying, a pre-approval and a plan put you ahead of most buyers." } }
      ]
    },
    {
      id: "docs", step: "Your readiness",
      label: "Do you have your documents ready (payslips, ID, bank statements)?",
      type: "radio",
      options: [
        { label: "Yes, all ready",  value: "all",  score: { approval: 30 } },
        { label: "Some of them",    value: "some", score: { approval: 18 },
          tip: { pillar: "approval", title: "Gather the rest of your paperwork", impact: 3,
            why: "Having everything ready speeds up approval and avoids last-minute scrambles when you find a property.",
            action: "Pull together your last two payslips, ID, and 3 months of bank and loan statements. We'll send you a simple checklist." } },
        { label: "Not yet",         value: "none", score: { approval: 8 },
          tip: { pillar: "approval", title: "Get your documents in order", impact: 5,
            why: "Missing paperwork is the most common cause of delays once you're ready to apply.",
            action: "We'll give you a one-page checklist so you can have everything ready before you need it." } }
      ]
    },
    {
      id: "timeline", step: "Your readiness",
      label: "When are you hoping to buy?",
      type: "radio",
      options: [
        { label: "I'm ready now",   value: "now",   score: { approval: 25 } },
        { label: "1 – 3 months",    value: "13m",   score: { approval: 22 } },
        { label: "3 – 6 months",    value: "36m",   score: { approval: 16 } },
        { label: "6 – 12 months",   value: "612m",  score: { approval: 12 } },
        { label: "Just exploring",  value: "explore", score: { approval: 8 } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     Scoring engine — pure functions, deterministic from answers.
     ---------------------------------------------------------------------- */
  function computeScores(answers) {
    var raw = {}, max = {}, tips = [];
    PILLARS.forEach(function (p) { raw[p.key] = 0; max[p.key] = 0; });

    QUESTIONS.forEach(function (q) {
      if (q.compute) {
        var c = q.compute(answers);
        if (!c) return;
        if (c.scores) for (var k in c.scores) raw[k] += c.scores[k];
        if (c.max) for (var m in c.max) max[m] += c.max[m];
        if (c.tip) tips.push(c.tip);
        return;
      }
      if (!q.options) return;
      // per-question maximum for each pillar = best option for that pillar
      var qmax = {};
      q.options.forEach(function (o) {
        if (!o.score) return;
        for (var k in o.score) qmax[k] = Math.max(qmax[k] || 0, o.score[k]);
      });
      for (var mk in qmax) max[mk] += qmax[mk];

      var chosen = null, val = answers[q.id];
      q.options.forEach(function (o) { if (String(o.value) === String(val)) chosen = o; });
      if (!chosen) return;
      if (chosen.score) for (var sk in chosen.score) raw[sk] += chosen.score[sk];
      if (chosen.tip) tips.push(chosen.tip);
    });

    var pillars = PILLARS.map(function (p) {
      var value = max[p.key] ? clamp(Math.round(100 * raw[p.key] / max[p.key])) : 0;
      return { key: p.key, label: p.label, weight: p.weight, value: value };
    });
    var weightSum = PILLARS.reduce(function (s, p) { return s + p.weight; }, 0);
    var overall = Math.round(pillars.reduce(function (s, p) { return s + p.value * p.weight; }, 0) / weightSum);

    // Roadmap: highest-impact tips first (impact ≈ weight × the gap it closes)
    tips.sort(function (a, b) { return (b.impact || 0) - (a.impact || 0); });

    return { overall: overall, pillars: pillars, roadmap: tips, band: bandFor(overall) };
  }

  function bandFor(o) {
    if (o < 50) return { name: "Foundation", target: 50,
      blurb: "You're laying the groundwork. A few focused moves will lift you quickly." };
    if (o < 70) return { name: "Developing", target: 70,
      blurb: "You're on your way. Closing a couple of gaps puts real options on the table." };
    if (o < 85) return { name: "Approach-ready", target: 85,
      blurb: "You're close. A little fine-tuning unlocks sharper rates and more lenders." };
    return { name: "Lender-ready", target: 100,
      blurb: "You're in a strong position to act. Let's make sure you get the sharpest deal." };
  }

  /* ----------------------------------------------------------------------
     Quiz UI — render one question at a time with a progress bar.
     ---------------------------------------------------------------------- */
  var answers = {};
  var index = 0;
  var result = null;

  var quizEl = el("#quiz");
  var cardEl = el("#quiz-card");
  var progressFill = el("#progress-fill");
  var progressLabel = el("#progress-label");
  var backBtn = el("#quiz-back");
  var nextBtn = el("#quiz-next");

  function renderQuestion() {
    var q = QUESTIONS[index];
    var pct = Math.round((index) / QUESTIONS.length * 100);
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressLabel) progressLabel.textContent = "Question " + (index + 1) + " of " + QUESTIONS.length + " · " + q.step;

    var html = "";
    html += '<span class="eyebrow">' + q.step + "</span>";
    html += '<h2 class="quiz-q">' + q.label + "</h2>";
    if (q.help) html += '<p class="quiz-help">' + q.help + "</p>";

    if (q.type === "money") {
      var cur = answers[q.id] != null ? answers[q.id] : "";
      html += '<div class="money-field"><span class="money-prefix">$</span>' +
        '<input id="money-input" type="text" inputmode="numeric" autocomplete="off" ' +
        'placeholder="e.g. 80,000" value="' + (cur !== "" ? fmt(cur) : "") + '"></div>';
      html += '<p class="quiz-error" id="quiz-error" role="alert"></p>';
    } else {
      html += '<div class="opt-list" role="radiogroup" aria-label="' + q.label.replace(/"/g, "&quot;") + '">';
      q.options.forEach(function (o, i) {
        var checked = String(answers[q.id]) === String(o.value);
        html += '<button type="button" class="opt' + (checked ? " selected" : "") +
          '" role="radio" aria-checked="' + (checked ? "true" : "false") +
          '" data-value="' + o.value + '">' +
          '<span class="opt-dot" aria-hidden="true"></span><span>' + o.label + "</span></button>";
      });
      html += "</div>";
    }
    cardEl.innerHTML = html;
    cardEl.classList.remove("card-in"); void cardEl.offsetWidth; cardEl.classList.add("card-in");

    // wire interactions
    if (q.type === "money") {
      var input = el("#money-input");
      input.addEventListener("input", function () {
        var digits = input.value.replace(/[^0-9]/g, "");
        input.value = digits ? fmt(Number(digits)) : "";
        answers[q.id] = digits ? Number(digits) : null;
        el("#quiz-error").textContent = "";
        updateNav();
      });
      setTimeout(function () { input.focus(); }, 50);
    } else {
      cardEl.querySelectorAll(".opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          cardEl.querySelectorAll(".opt").forEach(function (b) {
            b.classList.remove("selected"); b.setAttribute("aria-checked", "false");
          });
          btn.classList.add("selected"); btn.setAttribute("aria-checked", "true");
          var raw = btn.getAttribute("data-value");
          answers[q.id] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
          updateNav();
        });
      });
    }
    updateNav();
    backBtn.style.visibility = index === 0 ? "hidden" : "visible";
    nextBtn.textContent = index === QUESTIONS.length - 1 ? "See my score" : "Next";
  }

  function answered() {
    var q = QUESTIONS[index];
    if (q.type === "money") return answers[q.id] != null && answers[q.id] > 0;
    return answers[q.id] != null && answers[q.id] !== "";
  }

  function updateNav() { nextBtn.disabled = !answered(); }

  function next() {
    if (!answered()) {
      if (QUESTIONS[index].type === "money") el("#quiz-error").textContent = "Please enter your deposit amount.";
      return;
    }
    if (index < QUESTIONS.length - 1) { index++; renderQuestion(); scrollToTool(); }
    else finish();
  }
  function back() { if (index > 0) { index--; renderQuestion(); scrollToTool(); } }

  function scrollToTool() {
    var top = quizEl.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: top, behavior: prefersReduced ? "auto" : "smooth" });
  }

  if (nextBtn) nextBtn.addEventListener("click", next);
  if (backBtn) backBtn.addEventListener("click", back);

  /* ----------------------------------------------------------------------
     Results
     ---------------------------------------------------------------------- */
  function finish() {
    result = computeScores(answers);
    quizEl.hidden = true;
    var resultsEl = el("#results");
    resultsEl.hidden = false;
    renderResults(result);
    var top = resultsEl.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: top, behavior: prefersReduced ? "auto" : "smooth" });
    resultsEl.setAttribute("tabindex", "-1");
    resultsEl.focus();
  }

  function barsHTML(pillars) {
    return pillars.map(function (p) {
      return '<div class="score-row"><span>' + p.label + "</span>" +
        '<div class="score-bar"><i data-fill="' + p.value + '"></i></div>' +
        '<b class="score-val">' + p.value + "</b></div>";
    }).join("");
  }

  function tipHTML(t, n) {
    return '<li class="step-item"><div class="step-badge">' + n + "</div>" +
      '<div class="step-body"><h4>' + t.title + ' <span class="step-impact">+' + (t.impact || 1) + ' pts</span></h4>' +
      "<p>" + t.action + '</p><p class="step-why"><strong>Why it matters:</strong> ' + t.why + "</p></div></li>";
  }

  function renderResults(r) {
    // headline
    var msg;
    if (r.band.name === "Lender-ready") {
      msg = "You're <strong>" + r.overall + "/100</strong> — " + r.band.name + ". " + r.band.blurb;
    } else {
      msg = "You're <strong>" + r.overall + "/100</strong> — " + r.band.name +
        ". At <strong>" + r.band.target + "/100</strong> you'll qualify for noticeably better options. Here's your roadmap.";
    }
    el("#result-message").innerHTML = msg;

    // bars
    el("#result-bars").innerHTML = barsHTML(r.pillars);

    // gauge + bar fills
    animateGauge(r.overall);
    var bars = el("#result-bars").querySelectorAll(".score-bar i");
    if (prefersReduced) {
      bars.forEach(function (b) { b.style.width = b.getAttribute("data-fill") + "%"; });
    } else {
      setTimeout(function () {
        bars.forEach(function (b) { b.style.width = b.getAttribute("data-fill") + "%"; });
      }, 250);
    }

    // roadmap teaser — first 3 free, rest locked until capture
    var tips = r.roadmap.slice(0, 6);
    var freeEl = el("#roadmap-free");
    var lockedEl = el("#roadmap-locked");
    if (tips.length === 0) {
      freeEl.innerHTML = '<li class="step-item step-item--clear"><div class="step-body"><h4>You\'re in great shape</h4>' +
        "<p>Nothing major is holding you back. The next step is simply making sure you're matched to the sharpest rate and the right lender — that's where we come in.</p></div></li>";
      lockedEl.innerHTML = "";
      el("#lock-card").hidden = true;
      el("#unlock-form-wrap").querySelector(".unlock-lead").textContent =
        "Want it in writing? Pop your details in and we'll send your full readiness report as a PDF.";
    } else {
      freeEl.innerHTML = tips.slice(0, 3).map(function (t, i) { return tipHTML(t, i + 1); }).join("");
      var locked = tips.slice(3);
      lockedEl.innerHTML = locked.map(function (t, i) { return tipHTML(t, i + 4); }).join("");
      el("#lock-card").hidden = locked.length === 0;
      el("#locked-count").textContent = locked.length;
    }

    // next-target callout
    if (r.band.name === "Lender-ready") {
      el("#target-callout").innerHTML = "<strong>You're ready to act.</strong> " + r.band.blurb;
    } else {
      var gap = r.band.target - r.overall;
      el("#target-callout").innerHTML = "You're <strong>" + gap + " point" + (gap === 1 ? "" : "s") +
        "</strong> away from the next level (<strong>" + r.band.target + "/100</strong>). The steps below are ordered by the difference they'll make.";
    }
  }

  function animateGauge(target) {
    var ring = el("#gauge-ring");
    var num = el("#gauge-num");
    var bandLabel = el("#gauge-band");
    if (bandLabel) bandLabel.textContent = result.band.name;
    if (!ring || !num) return;
    var r = ring.r.baseVal.value;
    var C = 2 * Math.PI * r;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C;

    if (prefersReduced) {
      ring.style.transition = "none";
      ring.style.strokeDashoffset = C * (1 - target / 100);
      num.textContent = target;
      return;
    }
    // fill ring
    setTimeout(function () {
      ring.style.transition = "stroke-dashoffset 1.3s var(--ease, ease)";
      ring.style.strokeDashoffset = C * (1 - target / 100);
    }, 150);
    // count up
    var start = null, dur = 1300;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      num.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
      else num.textContent = target;
    }
    requestAnimationFrame(tick);
  }

  /* ----------------------------------------------------------------------
     Lead capture (score-first gating) + PDF generation
     Handled here (not via main.js's data-ajax) so we can drive the PDF.
     ---------------------------------------------------------------------- */
  function validateField(field) {
    var input = field.querySelector("input, select, textarea");
    if (!input) return true;
    var val = (input.value || "").trim();
    var ok = true, msg = "";
    if (input.hasAttribute("required") && !val) { ok = false; msg = "This field is required."; }
    else if (input.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { ok = false; msg = "Please enter a valid email address."; }
    else if (input.type === "tel" && val && val.replace(/[^0-9]/g, "").length < 8) { ok = false; msg = "Please enter a valid phone number."; }
    var err = field.querySelector(".error");
    if (err) err.textContent = msg;
    field.classList.toggle("show-error", !ok);
    input.classList.toggle("invalid", !ok);
    input.setAttribute("aria-invalid", ok ? "false" : "true");
    return ok;
  }

  var form = el("#unlock-form");
  if (form) {
    form.querySelectorAll(".field").forEach(function (field) {
      var input = field.querySelector("input, select, textarea");
      if (!input) return;
      input.addEventListener("blur", function () { validateField(field); });
      input.addEventListener("input", function () {
        if (field.classList.contains("show-error")) validateField(field);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hp = form.querySelector('input[name="company"]');
      if (hp && hp.value) return; // bot
      var valid = true;
      form.querySelectorAll(".field").forEach(function (f) { if (!validateField(f)) valid = false; });
      if (!valid) {
        var bad = form.querySelector(".show-error input");
        if (bad) bad.focus();
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.innerHTML : "";
      if (btn) { btn.disabled = true; btn.innerHTML = "Preparing your report…"; }

      var nameVal = (form.querySelector('[name="name"]') || {}).value || "there";
      var firstName = nameVal.trim().split(" ")[0] || "there";

      // POST to endpoint if configured (Formspree / CRM webhook). Non-blocking.
      var endpoint = form.getAttribute("data-endpoint");
      if (endpoint && /^https?:\/\//.test(endpoint)) {
        var fd = new FormData(form);
        fd.append("readiness_score", result.overall + "/100");
        fd.append("readiness_band", result.band.name);
        result.pillars.forEach(function (p) { fd.append("pillar_" + p.key, p.value); });
        fd.append("answers", JSON.stringify(answers));
        fetch(endpoint, { method: "POST", headers: { Accept: "application/json" }, body: fd })["catch"](function () {});
      }

      // Unlock everything on-page
      unlockResults(firstName);

      // Generate & download the PDF
      generatePDF(nameVal.trim()).then(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = "Download my report again"; }
      })["catch"](function () {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      });
    });
  }

  function unlockResults(firstName) {
    var lock = el("#lock-card");
    if (lock) lock.hidden = true;
    var locked = el("#roadmap-locked");
    if (locked) locked.classList.add("unlocked");
    var done = el("#unlock-done");
    if (done) {
      el("#unlock-name").textContent = firstName;
      done.hidden = false;
    }
    var cta = el("#post-cta");
    if (cta) cta.hidden = false;
  }

  /* ---- Build the branded PDF report and download it ---- */
  function generatePDF(fullName) {
    var node = el("#pdf-report");
    if (!node || typeof window.html2pdf === "undefined") {
      return Promise.reject(new Error("pdf unavailable"));
    }
    var d = new Date();
    var dateStr = d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

    var roadmap = result.roadmap.length
      ? result.roadmap.map(function (t, i) {
          return '<li><div class="p-step-no">' + (i + 1) + "</div><div><h4>" + t.title +
            ' <em>+' + (t.impact || 1) + ' pts</em></h4><p>' + t.action +
            '</p><p class="p-why"><strong>Why:</strong> ' + t.why + "</p></div></li>";
        }).join("")
      : "<li><div><h4>You're in great shape</h4><p>Nothing major is holding you back — the next step is matching you to the sharpest rate and the right lender.</p></div></li>";

    var pbars = result.pillars.map(function (p) {
      return '<div class="p-bar-row"><span>' + p.label + '</span><div class="p-bar"><i style="width:' +
        p.value + '%"></i></div><b>' + p.value + "</b></div>";
    }).join("");

    var target = result.band.name === "Lender-ready"
      ? "You're in a strong position to act."
      : "At " + result.band.target + "/100 you'll qualify for noticeably better options.";

    node.innerHTML =
      '<div class="p-head">' +
        '<div class="p-brand"><span class="p-logo">&#10084;</span><span>HART<small>LENDING</small></span></div>' +
        '<div class="p-meta">Property Readiness Report<br>' + dateStr + "</div>" +
      "</div>" +
      '<h1 class="p-title">' + (fullName ? esc(fullName) + "&rsquo;s" : "Your") + " Property Readiness Score</h1>" +
      '<p class="p-tagline">Know where you stand before you fall in love with a property.</p>' +
      '<div class="p-score"><div class="p-score-num">' + result.overall + '<small>/100</small></div>' +
        '<div class="p-score-band"><strong>' + result.band.name + "</strong><span>" + target + "</span></div></div>" +
      '<div class="p-section"><h3>Your seven pillars</h3>' + pbars + "</div>" +
      '<div class="p-section p-roadmap"><h3>Your step-by-step improvement plan</h3><ol>' + roadmap + "</ol></div>" +
      '<div class="p-cta"><strong>Ready to talk it through?</strong> Book a free 20-minute chat with Kim Hart — ' +
        'no credit check, no obligation.<br>0422 066 339 &nbsp;·&nbsp; kim@hartlending.com &nbsp;·&nbsp; hartlending.com</div>' +
      '<p class="p-disclaimer">This Property Readiness Score is an educational, illustrative indicator only. It is not a credit ' +
        'assessment, a pre-approval, or financial or credit advice, and does not take into account your full financial situation. ' +
        'Hart Lending is a Credit Representative authorised under an Australian Credit Licence. Lending criteria, terms, fees and ' +
        'charges apply. Always seek tailored advice before acting.</p>';

    var opt = {
      margin: [10, 10, 12, 10],
      filename: "Hart-Lending-Readiness-Report.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    return window.html2pdf().set(opt).from(node).save();
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  if (quizEl && cardEl) renderQuestion();
})();
