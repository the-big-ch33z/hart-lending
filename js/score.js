/* =========================================================================
   HART LENDING — Finance Finder (multi-product readiness scores)
   Loan-type chooser → per-product quiz → scoring engine → roadmap → PDF.
   Vanilla JS, no build step. Reuses the site's design tokens & form styles.
   One engine drives every product: each finance type is a config block in
   the PRODUCTS registry (its own pillars + questions). The wizard, scoring,
   gauge, lead-capture and PDF all read from the `active` product.
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
     HOME product — pillars + questions.
     Pillars: internal 0–100 each, combined by weight into the /100 score.
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
     REFINANCE product — "Refinance Health".
     ---------------------------------------------------------------------- */
  var REFI_PILLARS = [
    { key: "equity",    label: "Equity position",   weight: 26 },
    { key: "rate",      label: "Rate competitiveness", weight: 24 },
    { key: "credit",    label: "Repayment history", weight: 20 },
    { key: "repayment", label: "Serviceability",    weight: 18 },
    { key: "readiness", label: "Switch readiness",  weight: 12 }
  ];
  var REFI_QUESTIONS = [
    {
      id: "rvalue", step: "Your loan",
      label: "Roughly what's your property worth today?",
      help: "A ballpark is fine — it just sets the scale for your equity.",
      type: "radio",
      options: [
        { label: "Under $500k",        value: 425000 },
        { label: "$500k – $750k",      value: 625000 },
        { label: "$750k – $1M",        value: 875000 },
        { label: "$1M – $1.5M",        value: 1250000 },
        { label: "$1.5M+",             value: 1700000 }
      ]
    },
    {
      id: "rbalance", step: "Your loan",
      label: "And how much do you still owe on it?",
      help: "Your current loan balance across any splits.",
      type: "money",
      compute: function (a) {
        var val = Number(a.rvalue) || 0;
        var bal = Number(a.rbalance) || 0;
        if (!val) return null;
        var lvr = bal >= val ? 100 : bal / val * 100;
        var pts;
        if (lvr <= 50) pts = 60;
        else if (lvr <= 60) pts = 52;
        else if (lvr <= 70) pts = 44;
        else if (lvr <= 80) pts = 34;
        else if (lvr <= 90) pts = 22;
        else pts = 10;
        var tip = null;
        if (lvr <= 80) {
          var usable = Math.max(0, Math.round((val * 0.8 - bal) / 1000) * 1000);
          if (usable >= 20000) {
            tip = { pillar: "equity", title: "You may have usable equity to put to work", impact: 4,
              why: "With your loan comfortably under 80% of the value, lenders can often release equity for renovations, an investment deposit, or to consolidate other debts.",
              action: "You could have roughly " + fmtMoney(usable) + " in usable equity (to 80%). We'll show you how to access it cleanly when you refinance." };
          }
        } else if (lvr > 90) {
          tip = { pillar: "equity", title: "Lift your equity before switching", impact: 5,
            why: "Above 90% of the property value, refinancing options narrow and Lenders Mortgage Insurance can apply again on the new loan.",
            action: "Extra repayments — or a small rise in your property's value — that get you under 90%, then 80%, open up far more lenders and sharper rates." };
        }
        return { scores: { equity: pts }, max: { equity: 60 }, tip: tip };
      }
    },
    {
      id: "rrate", step: "Your rate",
      label: "What interest rate are you on right now?",
      help: "Close enough is fine — it's the rough band that matters.",
      type: "radio",
      options: [
        { label: "Under 5.5%",       value: "lt55", score: { rate: 60 } },
        { label: "5.5% – 6%",        value: "55_6", score: { rate: 50 } },
        { label: "6% – 6.5%",        value: "6_65", score: { rate: 36 },
          tip: { pillar: "rate", title: "Your rate looks a touch high", impact: 4,
            why: "Many borrowers in this band are paying noticeably more than today's sharpest advertised rates — over a typical loan that's thousands a year.",
            action: "A quick rate review shows exactly what you could be on. If the gap is real, switching (or a pricing request to your current lender) is usually straightforward." } },
        { label: "6.5% – 7%",        value: "65_7", score: { rate: 22 },
          tip: { pillar: "rate", title: "You're likely paying well above market", impact: 7,
            why: "Rates in this range are some of the highest going. The saving from moving to a competitive lender is often the single biggest lever you have.",
            action: "Let's compare your rate against current offers. On most loan sizes the monthly saving is significant — we'll quantify it before you do anything." } },
        { label: "Over 7%",          value: "gt7",  score: { rate: 10 },
          tip: { pillar: "rate", title: "This rate is well above today's market", impact: 8,
            why: "An interest rate over 7% is far above competitive offers right now — you could be paying many thousands more each year than you need to.",
            action: "This is the priority. A refinance review will show your potential saving in dollars per month, and we'll handle the switch end-to-end." } },
        { label: "Not sure",         value: "unsure", score: { rate: 28 },
          tip: { pillar: "rate", title: "Find out your exact rate first", impact: 5,
            why: "You can't tell if you're being overcharged until you know your number — and lenders rarely volunteer that you've drifted onto a higher rate.",
            action: "Check your latest statement or app for the current rate. Send it to us and we'll benchmark it against the market in minutes." } }
      ]
    },
    {
      id: "rtype", step: "Your rate",
      label: "Is your loan variable or fixed?",
      type: "radio",
      options: [
        { label: "Variable",                       value: "var",   score: { readiness: 18 } },
        { label: "Fixed — ending within 12 months", value: "fixsoon", score: { readiness: 15 } },
        { label: "Split (part fixed, part variable)", value: "split", score: { readiness: 14 } },
        { label: "Not sure",                        value: "unsure", score: { readiness: 10 } },
        { label: "Fixed — locked in for a while",   value: "fixlock", score: { readiness: 7 },
          tip: { pillar: "readiness", title: "Check your fixed-rate break costs", impact: 3,
            why: "Breaking a fixed loan early can trigger a break fee, which sometimes outweighs the saving from switching now.",
            action: "We'll ask your lender for the exact break cost and only recommend moving if you're clearly in front — otherwise we plan the switch for when your fixed term ends." } }
      ]
    },
    {
      id: "rhistory", step: "Your history",
      label: "How have your repayments gone over the last 12 months?",
      type: "radio",
      options: [
        { label: "Always on time, no issues",    value: "clean", score: { credit: 60 } },
        { label: "One or two late payments",     value: "late",  score: { credit: 42 },
          tip: { pillar: "credit", title: "Keep the next few months spotless", impact: 4,
            why: "Refinancing lenders look closely at recent conduct — a clean run of on-time repayments makes approval smoother and unlocks sharper pricing.",
            action: "Set up automatic payments a few days after payday so nothing slips, and give it 3–6 clean months before applying if you can." } },
        { label: "Behind / missed several",      value: "behind", score: { credit: 24 },
          tip: { pillar: "credit", title: "Steady the ship before you switch", impact: 6,
            why: "Recent missed payments are the most common reason a refinance gets declined, even when the rate saving is obvious.",
            action: "Bring everything current and keep it that way for a few months. If hardship is involved, talk to us early — there are specialist options." } },
        { label: "There's a default or arrears", value: "default", score: { credit: 10 },
          tip: { pillar: "credit", title: "Plan around the credit listing", impact: 5,
            why: "A default narrows your lender choice, but it doesn't make refinancing impossible — timing and lender selection matter a lot.",
            action: "We'll check when the listing clears and match you with lenders that assess the full story, not just the score." } }
      ]
    },
    {
      id: "rincome", step: "Your income",
      label: "What's your income situation?",
      type: "radio",
      options: [
        { label: "PAYG, secure and ongoing",        value: "payg",  score: { repayment: 20 } },
        { label: "Self-employed, 2+ years",         value: "self2", score: { repayment: 18 } },
        { label: "Casual or contract",              value: "casual", score: { repayment: 13 },
          tip: { pillar: "repayment", title: "Have your income evidence ready", impact: 3,
            why: "Casual and contract income is accepted, but lenders want to see it's consistent — usually 6–12 months in the same line of work.",
            action: "Gather recent payslips and a couple of years of tax returns. We'll match you with lenders comfortable with your work pattern." } },
        { label: "Self-employed, under 2 years",    value: "self1", score: { repayment: 10 },
          tip: { pillar: "repayment", title: "Newer self-employed? Choose the right lender", impact: 4,
            why: "Some lenders want two full years of figures; others will work with one year or accountant-prepared statements.",
            action: "We'll point you to lenders that accept shorter trading histories so a refinance isn't held up unnecessarily." } },
        { label: "Income changed recently",         value: "changed", score: { repayment: 9 },
          tip: { pillar: "repayment", title: "Let your new income settle", impact: 3,
            why: "A very recent change of job or income can make serviceability harder to evidence right now.",
            action: "If you can wait until you're past probation or have a few payslips at the new figure, approval is far simpler." } }
      ]
    },
    {
      id: "rsurplus", step: "Your income",
      label: "After your mortgage and bills, how's your monthly cashflow?",
      type: "radio",
      options: [
        { label: "Comfortable surplus",          value: "comfortable", score: { repayment: 20 } },
        { label: "Manageable",                   value: "manageable",  score: { repayment: 15 } },
        { label: "Tight most months",            value: "tight",       score: { repayment: 9 },
          tip: { pillar: "repayment", title: "A lower rate directly eases the squeeze", impact: 4,
            why: "If cashflow is tight, the repayment drop from a sharper rate is exactly what creates breathing room — and lenders assess your surplus too.",
            action: "We'll model the new repayment so you can see the monthly difference before committing, and structure the loan to maximise your surplus." } },
        { label: "Negative / relying on credit", value: "negative",    score: { repayment: 3 },
          tip: { pillar: "repayment", title: "Address cashflow before adding to the loan", impact: 5,
            why: "If you're going backwards each month, lenders will be cautious — and rolling more debt into the mortgage without a plan can deepen the hole.",
            action: "Let's look at the whole picture. Sometimes consolidating into the mortgage at a lower rate genuinely helps; sometimes a budget reset comes first. We'll be straight with you." } }
      ]
    },
    {
      id: "rtime", step: "Your history",
      label: "How long have you had this loan?",
      type: "radio",
      options: [
        { label: "3+ years",        value: "3y",  score: { readiness: 12 } },
        { label: "1 – 3 years",     value: "13y", score: { readiness: 10 } },
        { label: "6 – 12 months",   value: "612m", score: { readiness: 7 } },
        { label: "Under 6 months",  value: "lt6m", score: { readiness: 4 },
          tip: { pillar: "readiness", title: "Early days — but a health check still pays", impact: 2,
            why: "You can refinance at any time, though some lenders prefer a short history on the current loan and a few may have early-discharge costs.",
            action: "We'll confirm there are no exit fees and benchmark your rate now, so you switch the moment it's worthwhile." } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     VEHICLE & EQUIPMENT product.
     ---------------------------------------------------------------------- */
  var VEHICLE_PILLARS = [
    { key: "repayment", label: "Repayment capacity", weight: 28 },
    { key: "credit",    label: "Credit profile",     weight: 24 },
    { key: "deposit",   label: "Deposit / trade-in", weight: 16 },
    { key: "approval",  label: "Approval readiness", weight: 18 },
    { key: "assetfit",  label: "Asset fit",          weight: 14 }
  ];
  var VEHICLE_QUESTIONS = [
    {
      id: "vasset", step: "What you need",
      label: "What are you looking to finance?",
      type: "radio",
      options: [
        { label: "A new car",                    value: "newcar", score: { assetfit: 50 } },
        { label: "A used car (under ~7 years)",  value: "used",   score: { assetfit: 44 } },
        { label: "Business equipment / machinery", value: "equip", score: { assetfit: 42 } },
        { label: "A truck or commercial vehicle", value: "truck", score: { assetfit: 38 } },
        { label: "Motorbike, caravan or boat",   value: "leisure", score: { assetfit: 34 } },
        { label: "An older / high-km vehicle",   value: "older",  score: { assetfit: 26 },
          tip: { pillar: "assetfit", title: "Match older assets to the right lender", impact: 3,
            why: "Once a vehicle is older or very high-km, some lenders cap the term or the amount, or decline — it's about choosing a lender that suits the asset.",
            action: "Tell us the year and odometer and we'll go straight to lenders comfortable with it, so the asset itself doesn't slow approval." } }
      ]
    },
    {
      id: "vamount", step: "What you need",
      label: "Roughly how much do you need to borrow?",
      help: "A ballpark is fine — it just helps size things up.",
      type: "money"
    },
    {
      id: "vincome", step: "Your income",
      label: "What's your employment situation?",
      type: "radio",
      options: [
        { label: "PAYG, permanent",          value: "payg",  score: { repayment: 24 } },
        { label: "Self-employed, 2+ years",  value: "self2", score: { repayment: 22 } },
        { label: "Casual or part-time",      value: "casual", score: { repayment: 16 },
          tip: { pillar: "repayment", title: "Show steady casual income", impact: 3,
            why: "Casual income is accepted for car and equipment loans when it's consistent — lenders typically want around 6 months in the role.",
            action: "Have your recent payslips ready. We'll match you to lenders that treat steady casual work fairly." } },
        { label: "Self-employed, under 2 years", value: "self1", score: { repayment: 12 },
          tip: { pillar: "repayment", title: "Low-doc options suit newer ABNs", impact: 3,
            why: "Newer businesses can struggle to show two years of figures, but plenty of asset lenders offer low-doc options against the vehicle or equipment.",
            action: "We'll point you to lenders that accept a shorter trading history with the asset as security." } },
        { label: "Centrelink / other",       value: "other", score: { repayment: 10 },
          tip: { pillar: "repayment", title: "Let's find a lender that fits your income", impact: 3,
            why: "Some income types narrow the lender pool, but options still exist — it comes down to matching the right lender.",
            action: "Tell us your income sources and we'll find a lender comfortable with them." } }
      ]
    },
    {
      id: "vcommit", step: "Your income",
      label: "Roughly your existing monthly loan and card repayments?",
      type: "radio",
      options: [
        { label: "Under $250",        value: "lt250", score: { repayment: 24 } },
        { label: "$250 – $600",       value: "250_600", score: { repayment: 18 } },
        { label: "$600 – $1,200",     value: "600_1200", score: { repayment: 12 },
          tip: { pillar: "repayment", title: "Trim commitments before you apply", impact: 3,
            why: "Existing repayments reduce how much you can comfortably borrow, since lenders count them against your income.",
            action: "Clearing a small card or personal loan before applying can lift both your approval odds and your limit." } },
        { label: "Over $1,200",       value: "gt1200", score: { repayment: 6 },
          tip: { pillar: "repayment", title: "Reduce other repayments first", impact: 4,
            why: "Above roughly $1,200 a month in commitments, serviceability becomes the main thing limiting a vehicle or equipment loan.",
            action: "Paying down or consolidating existing debts frees up borrowing capacity. We can look at whether consolidating helps." } }
      ]
    },
    {
      id: "vdeposit", step: "Your contribution",
      label: "Have you got a deposit or a trade-in?",
      type: "radio",
      options: [
        { label: "20%+ deposit or solid trade-in", value: "20", score: { deposit: 40 } },
        { label: "10 – 20%",                        value: "10", score: { deposit: 30 } },
        { label: "Under 10%",                       value: "lt10", score: { deposit: 18 },
          tip: { pillar: "deposit", title: "Even a small deposit helps", impact: 3,
            why: "A deposit or trade-in lowers the amount financed, which can sharpen your rate and improve approval — many asset loans don't require one, but it helps.",
            action: "If you have a trade-in or can add a little cash, we'll show how it changes your repayment and rate." } },
        { label: "Nothing yet",                     value: "none", score: { deposit: 8 },
          tip: { pillar: "deposit", title: "No deposit? Still very doable", impact: 2,
            why: "Plenty of vehicle and equipment loans are available with no deposit, though a contribution can earn a better rate.",
            action: "We'll quote both ways — nothing down, and with a small deposit — so you can see the difference." } }
      ]
    },
    {
      id: "vcredit", step: "Your credit",
      label: "How would you rate your credit history?",
      type: "radio",
      options: [
        { label: "Excellent — nothing negative", value: "excellent", score: { credit: 50 } },
        { label: "Good",                          value: "good",  score: { credit: 38 } },
        { label: "A few late payments",           value: "fair",  score: { credit: 24 },
          tip: { pillar: "credit", title: "Tidy up small blemishes", impact: 3,
            why: "A few late payments won't sink an asset loan, but a cleaner file earns a sharper rate.",
            action: "Bring any overdue accounts current and avoid new credit applications in the weeks before you apply." } },
        { label: "A default or arrears in 2 yrs", value: "default", score: { credit: 10 },
          tip: { pillar: "credit", title: "Specialist lenders can still help", impact: 4,
            why: "A recent default narrows mainstream options, but asset finance has specialist lenders who assess the whole picture.",
            action: "We'll match you with a lender that looks past the listing — often with the vehicle or equipment as security." } },
        { label: "Not sure",                      value: "unsure", score: { credit: 28 },
          tip: { pillar: "credit", title: "Know your credit position", impact: 2,
            why: "Knowing your score and any listings up front means no surprises at application.",
            action: "Grab a free credit report. We'll read it with you and plan the application around it." } }
      ]
    },
    {
      id: "vdocs", step: "Your readiness",
      label: "Do you have your paperwork ready (payslips, ID — plus ABN/GST if business)?",
      type: "radio",
      options: [
        { label: "Yes, all ready",  value: "all",  score: { approval: 24 } },
        { label: "Some of it",      value: "some", score: { approval: 15 },
          tip: { pillar: "approval", title: "Pull the rest together", impact: 2,
            why: "Having documents ready means an asset loan can settle in days rather than weeks.",
            action: "We'll send a short checklist so you have payslips, ID and (if business) your ABN and BAS on hand." } },
        { label: "Not yet",         value: "none", score: { approval: 7 },
          tip: { pillar: "approval", title: "Get your documents in order", impact: 3,
            why: "Missing paperwork is the most common cause of delay once you've found the vehicle or equipment.",
            action: "Grab a one-page checklist from us and you'll be ready to move the moment you're set." } }
      ]
    },
    {
      id: "vtime", step: "Your readiness",
      label: "When do you need the funds?",
      type: "radio",
      options: [
        { label: "Ready now",          value: "now",   score: { approval: 18 } },
        { label: "Within a few weeks", value: "weeks", score: { approval: 15 } },
        { label: "1 – 3 months",       value: "13m",   score: { approval: 11 } },
        { label: "Just exploring",     value: "explore", score: { approval: 7 } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     PERSONAL LOAN product.
     ---------------------------------------------------------------------- */
  var PERSONAL_PILLARS = [
    { key: "repayment", label: "Repayment capacity", weight: 26 },
    { key: "credit",    label: "Credit profile",     weight: 26 },
    { key: "income",    label: "Income strength",    weight: 18 },
    { key: "debtload",  label: "Existing debt load", weight: 18 },
    { key: "fit",       label: "Loan fit",           weight: 12 }
  ];
  var PERSONAL_QUESTIONS = [
    {
      id: "ppurpose", step: "What you need",
      label: "What's the loan for?",
      type: "radio",
      options: [
        { label: "Home renovation",            value: "reno",   score: { fit: 30 } },
        { label: "A vehicle or major purchase", value: "purchase", score: { fit: 28 } },
        { label: "Medical or dental",          value: "medical", score: { fit: 26 } },
        { label: "Wedding, travel or life event", value: "event", score: { fit: 24 } },
        { label: "Consolidating other debts",  value: "consolidate", score: { fit: 22 },
          tip: { pillar: "fit", title: "Consolidation might suit a different product", impact: 3,
            why: "If the main goal is to simplify existing debts, a structured consolidation (sometimes into your mortgage) can beat a standard personal loan.",
            action: "Try our debt-consolidation check too — we'll compare it against a personal loan and recommend whichever costs you less." } },
        { label: "Something else",             value: "other",  score: { fit: 24 } }
      ]
    },
    {
      id: "pamount", step: "What you need",
      label: "Roughly how much do you need?",
      help: "A ballpark is fine.",
      type: "money"
    },
    {
      id: "pincome", step: "Your income",
      label: "What's your annual income (before tax)?",
      type: "radio",
      options: [
        { label: "$120k+",         value: "120", score: { income: 40 } },
        { label: "$90k – $120k",   value: "90",  score: { income: 34 } },
        { label: "$60k – $90k",    value: "60",  score: { income: 26 } },
        { label: "$40k – $60k",    value: "40",  score: { income: 18 } },
        { label: "Under $40k",     value: "u40", score: { income: 10 },
          tip: { pillar: "income", title: "Match the loan size to your income", impact: 3,
            why: "Lenders cap personal loans against income — a smaller amount or a co-applicant can make the difference between approved and declined.",
            action: "Tell us the amount and we'll confirm what's realistic, or look at a secured option that lets you borrow a bit more." } }
      ]
    },
    {
      id: "pemploy", step: "Your income",
      label: "What's your employment type?",
      type: "radio",
      options: [
        { label: "PAYG permanent, 12+ months", value: "payg",  score: { repayment: 26 } },
        { label: "Self-employed",              value: "self",  score: { repayment: 20 } },
        { label: "PAYG under 12 months / probation", value: "new", score: { repayment: 18 },
          tip: { pillar: "repayment", title: "Probation can wait a beat", impact: 3,
            why: "Some lenders decline during probation; clearing it makes approval simpler and rates sharper.",
            action: "If you're close to passing probation, waiting a few weeks can widen your options — or we'll find a lender that accepts it." } },
        { label: "Casual or contract",         value: "casual", score: { repayment: 16 },
          tip: { pillar: "repayment", title: "Evidence steady casual income", impact: 3,
            why: "Consistent casual income is fine for personal loans; lenders want to see it's regular.",
            action: "Have 2–3 recent payslips ready and we'll match you to a suitable lender." } },
        { label: "Not currently working",      value: "none", score: { repayment: 8 },
          tip: { pillar: "repayment", title: "An income source is the first step", impact: 4,
            why: "Unsecured personal loans need a demonstrable way to repay; without income, approval is very unlikely.",
            action: "Let's talk through your situation — a secured option or a co-applicant may open a path." } }
      ]
    },
    {
      id: "pdebts", step: "Your commitments",
      label: "Your existing loan and card repayments per month?",
      type: "radio",
      options: [
        { label: "None",            value: "none",   score: { debtload: 40 } },
        { label: "Under $500",      value: "lt500",  score: { debtload: 32 } },
        { label: "$500 – $1,000",   value: "500_1000", score: { debtload: 22 },
          tip: { pillar: "debtload", title: "Lighten existing repayments", impact: 3,
            why: "Each existing repayment reduces what a lender will add on top, since it all counts against your income.",
            action: "Clearing a small balance before applying can lift your borrowing power and your approval odds." } },
        { label: "$1,000 – $2,000", value: "1000_2000", score: { debtload: 12 },
          tip: { pillar: "debtload", title: "Existing debt is the main limiter", impact: 4,
            why: "Above $1,000 a month in commitments, serviceability becomes the thing holding back a new loan.",
            action: "Consolidating or paying down first usually beats stacking another loan on top — we'll check which is cheaper for you." } },
        { label: "Over $2,000",     value: "gt2000", score: { debtload: 5 },
          tip: { pillar: "debtload", title: "Tackle the debt load before borrowing more", impact: 5,
            why: "A high level of existing repayments makes a new unsecured loan hard to service and risky to add.",
            action: "A consolidation review may cut your total repayments. Start there before taking on anything new — we'll guide it." } }
      ]
    },
    {
      id: "pcredit", step: "Your credit",
      label: "How would you rate your credit history?",
      type: "radio",
      options: [
        { label: "Excellent — nothing negative", value: "excellent", score: { credit: 52 } },
        { label: "Good",                          value: "good",  score: { credit: 40 } },
        { label: "Fair — some late payments",     value: "fair",  score: { credit: 24 },
          tip: { pillar: "credit", title: "A cleaner file sharpens your rate", impact: 3,
            why: "Personal-loan pricing is heavily credit-based; tidying late payments can move you to a much better rate.",
            action: "Bring overdue accounts current and avoid new applications for a couple of months before applying." } },
        { label: "A default or arrears",          value: "default", score: { credit: 10 },
          tip: { pillar: "credit", title: "Specialist lenders assess the full story", impact: 4,
            why: "A default limits mainstream personal loans but doesn't rule out finance — lender choice and timing matter.",
            action: "We'll match you with a lender that looks beyond the score, and plan around when the listing clears." } },
        { label: "Not sure",                      value: "unsure", score: { credit: 30 },
          tip: { pillar: "credit", title: "Check your credit before applying", impact: 2,
            why: "Knowing your score and any listings avoids surprise declines, which themselves leave a mark.",
            action: "Pull a free credit report and we'll read it with you to target the right lender first time." } }
      ]
    },
    {
      id: "psecured", step: "Your loan",
      label: "Would the loan be secured against an asset (like a car)?",
      help: "Secured loans usually mean a lower rate; unsecured means no asset at risk.",
      type: "radio",
      options: [
        { label: "Yes, secured against an asset", value: "secured", score: { fit: 18 } },
        { label: "No, unsecured",                 value: "unsecured", score: { fit: 12 } },
        { label: "Not sure",                      value: "unsure", score: { fit: 10 },
          tip: { pillar: "fit", title: "Secured vs unsecured changes your rate", impact: 2,
            why: "Securing the loan against a vehicle or asset typically earns a lower rate; unsecured is faster and keeps the asset free.",
            action: "We'll quote both so you can weigh the rate saving against the flexibility." } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     DEBT CONSOLIDATION product.
     ---------------------------------------------------------------------- */
  var DEBT_PILLARS = [
    { key: "debtload",      label: "Debt load",         weight: 24 },
    { key: "serviceability", label: "Serviceability",   weight: 22 },
    { key: "credit",        label: "Credit profile",    weight: 20 },
    { key: "security",      label: "Security available", weight: 20 },
    { key: "behaviour",     label: "Spending habits",   weight: 14 }
  ];
  var DEBT_QUESTIONS = [
    {
      id: "dtotal", step: "Your debts",
      label: "Roughly how much do you owe across all your debts?",
      help: "Credit cards, personal loans, BNPL, car loans — a ballpark total.",
      type: "money"
    },
    {
      id: "dcount", step: "Your debts",
      label: "How many separate debts or repayments do you juggle?",
      type: "radio",
      options: [
        { label: "1 – 2",  value: "12", score: { debtload: 26 } },
        { label: "3 – 4",  value: "34", score: { debtload: 18 },
          tip: { pillar: "debtload", title: "Rolling several into one simplifies life", impact: 3,
            why: "Multiple due dates and rates make it hard to get ahead — one repayment at one rate is easier to manage and often cheaper.",
            action: "We'll map your debts and show a single consolidated repayment so you can compare it against what you pay now." } },
        { label: "5 – 6",  value: "56", score: { debtload: 10 },
          tip: { pillar: "debtload", title: "Several debts — consolidation likely helps", impact: 4,
            why: "Juggling five or more repayments usually means paying more interest than you need to and risking a missed payment.",
            action: "A consolidation review combines them into one manageable repayment. We'll quantify the saving before you decide." } },
        { label: "7 or more", value: "7", score: { debtload: 5 },
          tip: { pillar: "debtload", title: "Simplifying is the priority", impact: 5,
            why: "With this many debts, the admin alone makes slips likely, and high-rate cards quietly compound.",
            action: "Let's consolidate to a single repayment and a clear payoff date. This is exactly the situation consolidation is built for." } }
      ]
    },
    {
      id: "dtypes", step: "Your debts",
      label: "What makes up most of the debt?",
      type: "radio",
      options: [
        { label: "Car / asset loans",     value: "car",   score: { behaviour: 26 } },
        { label: "Personal loans",        value: "personal", score: { behaviour: 22 } },
        { label: "Credit cards",          value: "cards", score: { behaviour: 18 },
          tip: { pillar: "behaviour", title: "Move high-rate card debt first", impact: 4,
            why: "Credit cards carry some of the highest rates around, so they're usually where consolidation saves the most.",
            action: "We'll prioritise shifting card balances into a lower-rate facility, then help you keep the cards from creeping back up." } },
        { label: "A mix of everything",   value: "mix",   score: { behaviour: 16 },
          tip: { pillar: "behaviour", title: "A mix is a strong consolidation case", impact: 3,
            why: "Different debt types at different rates are the classic case for combining into one structured repayment.",
            action: "Send us the list and we'll design the cleanest single structure across all of them." } },
        { label: "Tax / ATO debt",        value: "ato",   score: { behaviour: 14 },
          tip: { pillar: "behaviour", title: "ATO debt needs the right approach", impact: 3,
            why: "Tax debt can affect your credit and serviceability differently to consumer debt and not every lender will refinance it.",
            action: "We'll match you with a lender that can incorporate ATO debt, or structure around it sensibly." } },
        { label: "Buy-now-pay-later",     value: "bnpl",  score: { behaviour: 12 },
          tip: { pillar: "behaviour", title: "Wind back BNPL accounts", impact: 4,
            why: "Lenders treat Afterpay/Zip as ongoing liabilities, and frequent use signals reliance on credit for everyday spending.",
            action: "Clear and close BNPL accounts as part of consolidating, and switch day-to-day spending back to your own funds." } }
      ]
    },
    {
      id: "downer", step: "Your security",
      label: "Do you own property?",
      type: "radio",
      options: [
        { label: "Yes, with decent equity",  value: "equity", score: { security: 50 },
          tip: { pillar: "security", title: "Consolidating into your mortgage could cut repayments sharply", impact: 6,
            why: "Home-loan rates are far lower than card and personal-loan rates, so rolling debts into your mortgage often slashes the monthly repayment — just keep the term in check so you don't pay more over time.",
            action: "We'll model rolling your debts into the home loan versus a standalone consolidation loan, and show the repayment and lifetime-cost of each so you choose with eyes open." } },
        { label: "Yes, but limited equity",  value: "little", score: { security: 32 },
          tip: { pillar: "security", title: "Even some equity widens your options", impact: 3,
            why: "A little equity can still let you secure a consolidation loan at a better rate than unsecured options.",
            action: "We'll check how much usable equity you have and whether securing the loan improves your rate." } },
        { label: "No, I rent",               value: "rent",  score: { security: 12 },
          tip: { pillar: "security", title: "Unsecured consolidation can still work", impact: 3,
            why: "Without property to secure against, options narrow a little, but unsecured consolidation loans are still very much available.",
            action: "We'll find the sharpest unsecured consolidation rate your profile supports and compare it to your current repayments." } }
      ]
    },
    {
      id: "dincome", step: "Your income",
      label: "What's your combined household income (before tax)?",
      type: "radio",
      options: [
        { label: "$120k+",        value: "120", score: { serviceability: 40 } },
        { label: "$90k – $120k",  value: "90",  score: { serviceability: 32 } },
        { label: "$60k – $90k",   value: "60",  score: { serviceability: 24 } },
        { label: "$40k – $60k",   value: "40",  score: { serviceability: 16 } },
        { label: "Under $40k",    value: "u40", score: { serviceability: 8 },
          tip: { pillar: "serviceability", title: "Lower income? Structure matters more", impact: 3,
            why: "With a tighter income, the key is a consolidated repayment that genuinely fits your budget, not just a lower rate.",
            action: "We'll build the plan around an affordable monthly figure first, then find the lender to match." } }
      ]
    },
    {
      id: "drepay", step: "Your income",
      label: "What do all those debts cost you in repayments each month right now?",
      type: "radio",
      options: [
        { label: "Under $500",       value: "lt500", score: { serviceability: 20 } },
        { label: "$500 – $1,500",    value: "500_1500", score: { serviceability: 15 } },
        { label: "$1,500 – $3,000",  value: "1500_3000", score: { serviceability: 9 },
          tip: { pillar: "serviceability", title: "There's real room to cut this", impact: 4,
            why: "When repayments are this high, much of it is often interest — consolidating to one lower rate can free up meaningful cashflow.",
            action: "We'll show your potential new single repayment side-by-side with today's total so the saving is concrete." } },
        { label: "Over $3,000",      value: "gt3000", score: { serviceability: 4 },
          tip: { pillar: "serviceability", title: "Easing the monthly load is urgent", impact: 5,
            why: "Repayments at this level strain any budget and make a single missed payment costly.",
            action: "Consolidation to one structured repayment is exactly the fix. Let's quantify the relief and get it organised." } }
      ]
    },
    {
      id: "dmissed", step: "Your credit",
      label: "Have you missed any payments in the last 6 months?",
      type: "radio",
      options: [
        { label: "None",            value: "none",   score: { credit: 50 } },
        { label: "One or two",      value: "12",     score: { credit: 32 },
          tip: { pillar: "credit", title: "Act before more slip", impact: 4,
            why: "A couple of recent missed payments are an early warning lenders notice — consolidating now, while your file is still strong, keeps your options open.",
            action: "Let's consolidate before the misses build up, and set the new repayment at a level you won't miss." } },
        { label: "Several",         value: "several", score: { credit: 16 },
          tip: { pillar: "credit", title: "Steady things, then consolidate", impact: 5,
            why: "Several recent misses narrow lender choice, but consolidation can still be the circuit-breaker that stops the cycle.",
            action: "We'll find a lender that assesses your situation fairly and structure a repayment built to be sustainable." } },
        { label: "Behind on most",  value: "most",   score: { credit: 8 },
          tip: { pillar: "credit", title: "Let's talk early — options still exist", impact: 4,
            why: "Falling behind on most debts is stressful and limits mainstream lenders, but specialist and hardship pathways exist.",
            action: "Reach out and we'll look at the whole picture honestly, including hardship options if they fit." } }
      ]
    },
    {
      id: "dusing", step: "Your habits",
      label: "Are you still using credit cards or BNPL regularly?",
      type: "radio",
      options: [
        { label: "No, it's under control",  value: "no",  score: { behaviour: 18 } },
        { label: "Occasionally",            value: "some", score: { behaviour: 12 },
          tip: { pillar: "behaviour", title: "Pause new credit while you consolidate", impact: 3,
            why: "Consolidation only works if the old accounts don't fill back up — occasional use can quietly undo the benefit.",
            action: "Switch everyday spending to your own funds and we'll set the consolidation up to close the paid-out accounts." } },
        { label: "Yes, regularly",          value: "yes", score: { behaviour: 5 },
          tip: { pillar: "behaviour", title: "Break the reliance to make it stick", impact: 4,
            why: "If cards and BNPL are funding everyday life, consolidating without changing the habit usually leads straight back to the same debt.",
            action: "We'll pair the consolidation with a simple plan to close the accounts and reset spending, so it actually solves the problem." } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     COMMERCIAL PROPERTY product.
     ---------------------------------------------------------------------- */
  var COMMERCIAL_PILLARS = [
    { key: "deposit",   label: "Deposit / equity",   weight: 24 },
    { key: "income",    label: "Business serviceability", weight: 22 },
    { key: "approval",  label: "Financials ready",   weight: 20 },
    { key: "credit",    label: "Credit & ATO standing", weight: 18 },
    { key: "assetrisk", label: "Asset profile",      weight: 16 }
  ];
  var COMMERCIAL_QUESTIONS = [
    {
      id: "cprice", step: "The property",
      label: "Roughly the purchase price?",
      help: "A ballpark is fine — it sets the scale for your deposit.",
      type: "radio",
      options: [
        { label: "Under $750k",        value: 600000 },
        { label: "$750k – $1.5M",      value: 1100000 },
        { label: "$1.5M – $3M",        value: 2200000 },
        { label: "$3M – $5M",          value: 4000000 },
        { label: "$5M+",               value: 6000000 }
      ]
    },
    {
      id: "cdeposit", step: "The property",
      label: "How much deposit or equity can you contribute?",
      help: "Commercial lending usually needs more than a home loan — often 30%+.",
      type: "money",
      compute: function (a) {
        var price = Number(a.cprice) || 0;
        var dep = Number(a.cdeposit) || 0;
        if (!price) return null;
        var lvr = dep >= price ? 0 : (price - dep) / price * 100;
        var pts;
        if (lvr <= 60) pts = 60;
        else if (lvr <= 65) pts = 52;
        else if (lvr <= 70) pts = 42;
        else if (lvr <= 75) pts = 28;
        else if (lvr <= 80) pts = 16;
        else pts = 8;
        var tip = null;
        var dep30 = price * 0.30;
        if (dep < dep30) {
          var gap = Math.max(5000, Math.round((dep30 - dep) / 5000) * 5000);
          tip = { pillar: "deposit", title: "Build your deposit toward 30%", impact: lvr > 80 ? 8 : lvr > 75 ? 6 : 4,
            why: "Most commercial lenders cap lending around 70% of the property value (sometimes less for specialised assets), so a 30%+ contribution is usually the entry point.",
            action: "You're roughly " + fmtMoney(gap) + " short of a 30% deposit on a " + fmtMoney(price) +
                    " purchase. Equity in other property or business assets can often count — we'll work out the cleanest way to get there." };
        }
        return { scores: { deposit: pts }, max: { deposit: 60 }, tip: tip };
      }
    },
    {
      id: "cuse", step: "The property",
      label: "Will your business occupy it, or is it an investment?",
      type: "radio",
      options: [
        { label: "Owner-occupied by my business", value: "owner", score: { assetrisk: 40 } },
        { label: "Investment, leased to tenants", value: "leased", score: { assetrisk: 32 } },
        { label: "Mixed — part occupy, part lease", value: "mixed", score: { assetrisk: 28 } },
        { label: "Investment, currently vacant",  value: "vacant", score: { assetrisk: 18 },
          tip: { pillar: "assetrisk", title: "A tenant or plan strengthens a vacant asset", impact: 3,
            why: "Lenders assess a vacant commercial property on its likely income — a lease or a credible leasing plan materially improves terms.",
            action: "If a tenant is lined up, share the lease. If not, we'll target lenders comfortable lending on vacant possession and factor it in." } }
      ]
    },
    {
      id: "ctype", step: "The property",
      label: "What type of property is it?",
      type: "radio",
      options: [
        { label: "Standard office or retail",  value: "office", score: { assetrisk: 20 } },
        { label: "Industrial / warehouse",     value: "industrial", score: { assetrisk: 18 } },
        { label: "Mixed-use",                  value: "mixed", score: { assetrisk: 16 } },
        { label: "Specialised (childcare, pub, etc.)", value: "specialised", score: { assetrisk: 8 },
          tip: { pillar: "assetrisk", title: "Specialised assets need a specialist lender", impact: 4,
            why: "Going-concern or specialised properties often face lower maximum LVRs and a smaller pool of willing lenders.",
            action: "We'll match you with lenders experienced in your asset class so the property type doesn't undercut your terms." } }
      ]
    },
    {
      id: "ctrading", step: "Your business",
      label: "How long has the business been trading?",
      type: "radio",
      options: [
        { label: "3+ years, profitable",   value: "3y", score: { income: 40 } },
        { label: "2 – 3 years",            value: "23y", score: { income: 32 } },
        { label: "1 – 2 years",            value: "12y", score: { income: 20 },
          tip: { pillar: "income", title: "Shorter history? The right lender still lends", impact: 3,
            why: "Two full years of figures is the comfort zone; with less, lenders lean more on projections and the strength of the deal.",
            action: "We'll present your trading story to lenders that accept shorter histories, supported by your figures to date." } },
        { label: "Under 1 year / startup",  value: "startup", score: { income: 10 },
          tip: { pillar: "income", title: "Early-stage needs a stronger deposit or security", impact: 4,
            why: "Newer businesses can still secure commercial finance, but usually with a larger contribution or additional security.",
            action: "We'll look at what equity or security you can bring and target lenders open to earlier-stage businesses." } }
      ]
    },
    {
      id: "cserv", step: "Your business",
      label: "How's the business's cashflow and ability to service the loan?",
      type: "radio",
      options: [
        { label: "Strong — well above costs",  value: "strong", score: { income: 22 } },
        { label: "Steady",                     value: "steady", score: { income: 16 } },
        { label: "Tight",                      value: "tight",  score: { income: 9 },
          tip: { pillar: "income", title: "Show serviceability clearly", impact: 3,
            why: "Commercial approval hinges on the business comfortably covering repayments plus its own costs.",
            action: "We'll help present add-backs and the full income picture so serviceability is assessed at its strongest." } },
        { label: "Variable / seasonal",        value: "seasonal", score: { income: 12 },
          tip: { pillar: "income", title: "Frame seasonal income properly", impact: 3,
            why: "Lumpy or seasonal revenue can read as risky unless it's presented across a full cycle.",
            action: "We'll use annualised figures and history to show the underlying strength to lenders that understand your industry." } }
      ]
    },
    {
      id: "ccredit", step: "Your standing",
      label: "How's your business and personal credit — including any ATO position?",
      type: "radio",
      options: [
        { label: "All clean",                  value: "clean", score: { credit: 50 } },
        { label: "Minor issues, all up to date", value: "minor", score: { credit: 38 } },
        { label: "Small ATO payment plan",     value: "ato",   score: { credit: 22 },
          tip: { pillar: "credit", title: "An ATO plan needs the right lender", impact: 4,
            why: "An active ATO payment arrangement affects serviceability and not every lender will proceed with one in place.",
            action: "We'll target lenders comfortable with a managed ATO plan, or look at clearing it as part of the deal." } },
        { label: "Arrears or defaults",        value: "default", score: { credit: 10 },
          tip: { pillar: "credit", title: "Specialist commercial lenders assess the story", impact: 4,
            why: "Adverse credit narrows mainstream commercial options, but specialist lenders weigh the deal and security, not just the listing.",
            action: "We'll match you with a lender that assesses the whole picture and structure the deal to mitigate the credit history." } }
      ]
    },
    {
      id: "cfin", step: "Your standing",
      label: "Are your financials and BAS up to date?",
      type: "radio",
      options: [
        { label: "Yes — last 2 years ready",   value: "all",  score: { approval: 50 } },
        { label: "Mostly — about one year",    value: "one",  score: { approval: 32 },
          tip: { pillar: "approval", title: "Get the second year together", impact: 3,
            why: "Full-doc commercial deals usually want two years of financials and recent BAS — having both unlocks the best terms.",
            action: "We'll give you a clear document checklist; your accountant can often turn the rest around quickly." } },
        { label: "Low-doc — prefer not to provide full financials", value: "lowdoc", score: { approval: 20 },
          tip: { pillar: "approval", title: "Low-doc is an option with trade-offs", impact: 3,
            why: "Low-doc commercial lending exists but typically means a larger deposit and a slightly higher rate.",
            action: "We'll compare low-doc against full-doc so you can weigh the convenience against the cost." } },
        { label: "Not really up to date",      value: "none", score: { approval: 14 },
          tip: { pillar: "approval", title: "Bring the paperwork current first", impact: 4,
            why: "Out-of-date financials are the most common cause of commercial delays and declines.",
            action: "Prioritise getting your accountant to finalise recent financials and BAS — we'll tell you exactly what's needed." } }
      ]
    }
  ];

  /* ----------------------------------------------------------------------
     PRODUCT REGISTRY — one config per finance type. The engine reads the
     `active` product's pillars + questions; bandFor() is shared by all.
     ---------------------------------------------------------------------- */
  function disc(noun) {
    return "This " + noun + " is an educational, illustrative indicator only. It is not a credit " +
      "assessment, a pre-approval, or financial or credit advice, and does not take into account your full " +
      "financial situation. Hart Lending is a Credit Representative authorised under an Australian Credit " +
      "Licence. Lending criteria, terms, fees and charges apply. Always seek tailored advice before acting.";
  }

  var PRODUCTS = {
    home: {
      id: "home", pillarsNoun: "seven pillars",
      pdfTitle: "Property Readiness", pdfFilename: "Hart-Lending-Property-Readiness-Report.pdf",
      tagline: "Know where you stand before you fall in love with a property.",
      disclaimer: disc("Property Readiness Score"),
      pillars: PILLARS, questions: QUESTIONS
    },
    refi: {
      id: "refi", pillarsNoun: "five pillars",
      pdfTitle: "Refinance Health", pdfFilename: "Hart-Lending-Refinance-Health-Report.pdf",
      tagline: "Make sure your home loan is still working as hard as you are.",
      disclaimer: disc("Refinance Health Score"),
      pillars: REFI_PILLARS, questions: REFI_QUESTIONS
    },
    vehicle: {
      id: "vehicle", pillarsNoun: "five pillars",
      pdfTitle: "Vehicle & Equipment Finance", pdfFilename: "Hart-Lending-Vehicle-Finance-Report.pdf",
      tagline: "Get the wheels or gear you need on the right terms.",
      disclaimer: disc("Vehicle & Equipment Finance Score"),
      pillars: VEHICLE_PILLARS, questions: VEHICLE_QUESTIONS
    },
    personal: {
      id: "personal", pillarsNoun: "five pillars",
      pdfTitle: "Personal Loan Readiness", pdfFilename: "Hart-Lending-Personal-Loan-Report.pdf",
      tagline: "See how ready you are for a personal loan that fits.",
      disclaimer: disc("Personal Loan Readiness Score"),
      pillars: PERSONAL_PILLARS, questions: PERSONAL_QUESTIONS
    },
    debt: {
      id: "debt", pillarsNoun: "five pillars",
      pdfTitle: "Debt Consolidation Readiness", pdfFilename: "Hart-Lending-Debt-Consolidation-Report.pdf",
      tagline: "One repayment, one plan — see if consolidating is your move.",
      disclaimer: disc("Debt Consolidation Readiness Score"),
      pillars: DEBT_PILLARS, questions: DEBT_QUESTIONS
    },
    commercial: {
      id: "commercial", pillarsNoun: "five pillars",
      pdfTitle: "Commercial Finance Readiness", pdfFilename: "Hart-Lending-Commercial-Finance-Report.pdf",
      tagline: "Position your business to fund the right premises.",
      disclaimer: disc("Commercial Finance Readiness Score"),
      pillars: COMMERCIAL_PILLARS, questions: COMMERCIAL_QUESTIONS
    }
  };

  /* Chooser cards — the loan-type-first entry point. Home sub-intents reuse
     the home engine with a seeded answer so we never ask "what's it for" twice. */
  var ICONS = {
    home:    "M3 11l9-8 9 8M5 10v10h14V10",
    chart:   "M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3",
    compass: "M12 3a9 9 0 100 18 9 9 0 000-18zM15 9l-2 4-4 2 2-4z",
    refresh: "M20 11A8 8 0 006 6L3 9M3 9V4M3 9h5M4 13a8 8 0 0014 5l3-3M21 15v5M21 15h-5",
    car:     "M5 13l1.6-4.6A2 2 0 018.5 7h7a2 2 0 011.9 1.4L19 13M5 13h14v4H5zM7.5 17v1.5M16.5 17v1.5",
    wallet:  "M3 7h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h11v3M17 13h.01",
    layers:  "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
    building:"M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M14 21V9h4a2 2 0 012 2v10M8 7h2M8 11h2M8 15h2"
  };
  var CHOOSER = [
    { label: "Buying my first home", desc: "Your first place to live", icon: "home", product: "home", seed: { purpose: "first" } },
    { label: "Buying my next home", desc: "Upsizing, downsizing or moving", icon: "home", product: "home", seed: { purpose: "next" } },
    { label: "Investing in property", desc: "Build your portfolio", icon: "chart", product: "home", seed: { purpose: "invest" } },
    { label: "Just exploring", desc: "See how much you could borrow", icon: "compass", product: "home", seed: { purpose: "unsure" } },
    { label: "Refinancing", desc: "Check you're on a sharp rate", icon: "refresh", product: "refi" },
    { label: "Car, vehicle or equipment", desc: "Personal or business assets", icon: "car", product: "vehicle" },
    { label: "A personal loan", desc: "Renovation, travel, life events", icon: "wallet", product: "personal" },
    { label: "Consolidating debt", desc: "Simplify into one repayment", icon: "layers", product: "debt" },
    { label: "Commercial property", desc: "Premises or commercial investment", icon: "building", product: "commercial" }
  ];

  /* ----------------------------------------------------------------------
     Scoring engine — pure functions, deterministic from answers.
     ---------------------------------------------------------------------- */
  function computeScores(answers) {
    var raw = {}, max = {}, tips = [];
    var pillarDefs = active.pillars, questionDefs = active.questions;
    pillarDefs.forEach(function (p) { raw[p.key] = 0; max[p.key] = 0; });

    questionDefs.forEach(function (q) {
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

    var pillars = pillarDefs.map(function (p) {
      var value = max[p.key] ? clamp(Math.round(100 * raw[p.key] / max[p.key])) : 0;
      return { key: p.key, label: p.label, weight: p.weight, value: value };
    });
    var weightSum = pillarDefs.reduce(function (s, p) { return s + p.weight; }, 0);
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
  var active = null;   // the chosen product config
  var flow = [];       // questions the wizard walks through (seeded ones removed)

  var quizEl = el("#quiz");
  var cardEl = el("#quiz-card");
  var progressFill = el("#progress-fill");
  var progressLabel = el("#progress-label");
  var backBtn = el("#quiz-back");
  var nextBtn = el("#quiz-next");

  function renderQuestion() {
    var q = flow[index];
    var pct = Math.round((index) / flow.length * 100);
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressLabel) progressLabel.textContent = "Question " + (index + 1) + " of " + flow.length + " · " + q.step;

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
    nextBtn.textContent = index === flow.length - 1 ? "See my score" : "Next";
  }

  function answered() {
    var q = flow[index];
    if (q.type === "money") return answers[q.id] != null && answers[q.id] > 0;
    return answers[q.id] != null && answers[q.id] !== "";
  }

  function updateNav() { nextBtn.disabled = !answered(); }

  function next() {
    if (!answered()) {
      if (flow[index].type === "money") el("#quiz-error").textContent = "Please enter an amount to continue.";
      return;
    }
    if (index < flow.length - 1) { index++; renderQuestion(); scrollToTool(); }
    else finish();
  }
  function back() { if (index > 0) { index--; renderQuestion(); scrollToTool(); } }

  function scrollToTool() {
    var anchor = el(".score-tool") || quizEl;
    if (!anchor) return;
    var top = anchor.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: top, behavior: prefersReduced ? "auto" : "smooth" });
  }

  if (nextBtn) nextBtn.addEventListener("click", next);
  if (backBtn) backBtn.addEventListener("click", back);

  /* ----------------------------------------------------------------------
     Chooser — loan-type-first entry point. Picks a product, optionally
     seeds an answer, and launches that product's quiz.
     ---------------------------------------------------------------------- */
  function renderChooser() {
    var grid = el("#finder-grid");
    if (!grid) return;
    grid.innerHTML = CHOOSER.map(function (c, i) {
      return '<button type="button" class="finder-card" data-i="' + i + '">' +
        '<span class="finder-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + ICONS[c.icon] + '"/></svg></span>' +
        '<span class="finder-card__label">' + c.label + "</span>" +
        '<span class="finder-card__desc">' + c.desc + "</span></button>";
    }).join("");
    grid.querySelectorAll(".finder-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        startProduct(CHOOSER[Number(btn.getAttribute("data-i"))]);
      });
    });
  }

  function startProduct(choice) {
    active = PRODUCTS[choice.product];
    var seed = choice.seed || null;
    answers = {};
    if (seed) for (var k in seed) answers[k] = seed[k];
    flow = seed
      ? active.questions.filter(function (q) { return !(q.id in seed); })
      : active.questions;
    index = 0;
    result = null;

    // reset any prior results/unlock state (in case of a restart)
    var locked = el("#roadmap-locked"); if (locked) locked.classList.remove("unlocked");
    var done = el("#unlock-done"); if (done) done.hidden = true;
    var cta = el("#post-cta"); if (cta) cta.hidden = true;
    var lock = el("#lock-card"); if (lock) lock.hidden = false;
    var resultsEl = el("#results"); if (resultsEl) resultsEl.hidden = true;
    var chooser = el("#chooser"); if (chooser) chooser.hidden = true;
    if (quizEl) quizEl.hidden = false;

    renderQuestion();
    scrollToTool();
  }

  function showChooser() {
    if (quizEl) quizEl.hidden = true;
    var resultsEl = el("#results"); if (resultsEl) resultsEl.hidden = true;
    var chooser = el("#chooser"); if (chooser) chooser.hidden = false;
    scrollToTool();
  }

  var restartBtn = el("#quiz-restart");
  if (restartBtn) restartBtn.addEventListener("click", function (e) { e.preventDefault(); showChooser(); });
  var resultsRestart = el("#results-restart");
  if (resultsRestart) resultsRestart.addEventListener("click", function (e) { e.preventDefault(); showChooser(); });

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

    // pillar heading reflects the active product's pillar count
    var ph = el("#pillars-heading");
    if (ph && active) ph.textContent = "Your " + active.pillarsNoun;

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
        fd.append("finance_type", active.id);
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
        '<div class="p-meta">' + esc(active.pdfTitle) + " Report<br>" + dateStr + "</div>" +
      "</div>" +
      '<h1 class="p-title">' + (fullName ? esc(fullName) + "&rsquo;s" : "Your") + " " + esc(active.pdfTitle) + " Score</h1>" +
      '<p class="p-tagline">' + esc(active.tagline) + "</p>" +
      '<div class="p-score"><div class="p-score-num">' + result.overall + '<small>/100</small></div>' +
        '<div class="p-score-band"><strong>' + result.band.name + "</strong><span>" + target + "</span></div></div>" +
      '<div class="p-section"><h3>Your ' + esc(active.pillarsNoun) + "</h3>" + pbars + "</div>" +
      '<div class="p-section p-roadmap"><h3>Your step-by-step improvement plan</h3><ol>' + roadmap + "</ol></div>" +
      '<div class="p-cta"><strong>Ready to talk it through?</strong> Book a free 20-minute chat with Kim Hart — ' +
        'no credit check, no obligation.<br>0422 066 339 &nbsp;·&nbsp; kim@hartlending.com &nbsp;·&nbsp; hartlending.com</div>' +
      '<p class="p-disclaimer">' + esc(active.disclaimer) + "</p>";

    var opt = {
      margin: [10, 10, 12, 10],
      filename: active.pdfFilename,
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
  if (el("#finder-grid")) renderChooser();
})();
