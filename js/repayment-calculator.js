/* =========================================================================
   HART LENDING — Repayment Calculator
   Vanilla JS, no dependencies.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- Helpers ---- */
  function fmt(n) { return Math.round(n).toLocaleString("en-AU"); }
  function fmtDollar(n) { return "$" + fmt(n); }
  function getNum(el) { return parseFloat(el ? el.value : "") || 0; }
  function getRadio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  /* ---- Core math ---- */
  function periodsPerYear(freq) {
    return freq === "fortnightly" ? 26 : freq === "weekly" ? 52 : 12;
  }

  function calcRepayment(principal, annualRate, termYrs, loanType, frequency) {
    if (principal <= 0 || termYrs <= 0) return 0;
    var ppy = periodsPerYear(frequency);
    var r   = annualRate / 100 / ppy;
    var n   = termYrs * ppy;
    if (loanType === "io") {
      return principal * (annualRate / 100) / ppy;
    }
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  /* Build yearly balance-over-time data (always monthly simulation) */
  function genChartData(principal, annualRate, termYrs, loanType) {
    var r = annualRate / 100 / 12;
    var n = termYrs * 12;
    var monthlyPmt;
    if (loanType === "io") {
      monthlyPmt = r > 0 ? principal * r : 0;
    } else {
      if (r === 0) monthlyPmt = principal / n;
      else monthlyPmt = principal * r / (1 - Math.pow(1 + r, -n));
    }

    /* index 0 = year 0 (start of loan) */
    var balance      = [principal];
    var cumPrincipal = [0];
    var bal = principal;

    for (var yr = 0; yr < termYrs; yr++) {
      for (var m = 0; m < 12; m++) {
        if (bal <= 0.01) break;
        var intPmt  = bal * r;
        var prinPmt = loanType === "io" ? 0 : Math.min(bal, Math.max(0, monthlyPmt - intPmt));
        bal -= prinPmt;
      }
      balance.push(Math.max(0, Math.round(bal)));
      cumPrincipal.push(Math.round(principal - Math.max(0, bal)));
      if (bal <= 0.01 && loanType !== "io") break;
    }

    return { n: balance.length, balance: balance, cumPrincipal: cumPrincipal, peak: principal };
  }

  /* ---- DOM refs ---- */
  var fLoanAmount  = document.getElementById("loan-amount");
  var fRate        = document.getElementById("interest-rate");
  var fTerm        = document.getElementById("loan-term");

  var rRepLabel    = document.getElementById("r-repayment-label");
  var rRepayment   = document.getElementById("r-repayment");
  var rRepSub      = document.getElementById("r-repayment-sub");
  var rTotalInt    = document.getElementById("r-total-interest");
  var rTotalRepaid = document.getElementById("r-total-repaid");
  var rIntPct      = document.getElementById("r-interest-pct");
  var rPandiComp   = document.getElementById("r-pandi-comp");
  var rLoanAmount  = document.getElementById("r-loan-amount");
  var rTotalIntBox = document.getElementById("r-total-int-box");
  var btnExport    = document.getElementById("btn-export-pdf");

  if (!fLoanAmount) return;

  /* ====================================================================
     CHART — Loan balance over time
     Two stacked areas that always sum to the original loan amount:
       Bottom (sage):  cumulative principal paid
       Top (muted):    remaining balance ("Owing")
  ==================================================================== */
  var chartCanvas  = document.getElementById("repayment-chart");
  var chartTooltip = document.getElementById("repayment-chart-tooltip");
  var _rData   = null;
  var _rAnimId = null;
  var _rDpr    = 1;
  var PAD      = { top: 16, right: 14, bottom: 30, left: 64 };

  function rResize() {
    if (!chartCanvas) return;
    _rDpr = window.devicePixelRatio || 1;
    var W = chartCanvas.parentElement ? chartCanvas.parentElement.offsetWidth : 300;
    var H = 170;
    chartCanvas.style.width  = W + "px";
    chartCanvas.style.height = H + "px";
    chartCanvas.width  = Math.round(W * _rDpr);
    chartCanvas.height = Math.round(H * _rDpr);
  }

  function rDraw(progress, hovIdx) {
    if (!chartCanvas || !_rData) return;
    var ctx  = chartCanvas.getContext("2d");
    var W    = Math.round(chartCanvas.width  / _rDpr);
    var H    = Math.round(chartCanvas.height / _rDpr);
    var data = _rData;
    var n    = data.n; /* includes year-0 point */

    ctx.save();
    ctx.scale(_rDpr, _rDpr);
    ctx.clearRect(0, 0, W, H);

    var plotW  = W - PAD.left - PAD.right;
    var plotH  = H - PAD.top  - PAD.bottom;
    var bottom = PAD.top + plotH;

    function xAt(i) { return PAD.left + (i / Math.max(n - 1, 1)) * plotW; }
    function yAt(v) { return PAD.top  + (1 - Math.min(v, data.peak) / data.peak) * plotH; }

    /* Grid lines + Y labels */
    ctx.font = "10px DM Sans, system-ui, sans-serif";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = PAD.top + f * plotH;
      var v = data.peak * (1 - f);
      ctx.strokeStyle = "rgba(197,212,190,0.07)";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
      ctx.fillStyle    = "rgba(197,212,190,0.3)";
      ctx.textAlign    = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1000) + "k", PAD.left - 5, y);
    });

    /* X axis labels — years */
    ctx.fillStyle    = "rgba(197,212,190,0.3)";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    var everyN = Math.ceil((n - 1) / 6);
    for (var i = 0; i < n; i++) {
      if (i === 0 || i % everyN === 0 || i === n - 1) {
        ctx.fillText(i + "yr", xAt(i), H - PAD.bottom + 5);
      }
    }

    /* Clip to animated progress */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PAD.left + plotW * progress + 4, H);
    ctx.clip();

    /* 1. Owing area (muted cream — remaining balance, top region) */
    ctx.beginPath();
    ctx.moveTo(xAt(0), bottom);
    ctx.lineTo(xAt(0), yAt(data.balance[0]));
    for (var i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(data.balance[i]));
    ctx.lineTo(xAt(n - 1), bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(240,235,224,0.13)";
    ctx.fill();

    /* 2. Principal paid area (sage — grows from bottom) */
    ctx.beginPath();
    ctx.moveTo(xAt(0), bottom);
    ctx.lineTo(xAt(0), yAt(data.cumPrincipal[0]));
    for (var i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(data.cumPrincipal[i]));
    ctx.lineTo(xAt(n - 1), bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(197,212,190,0.5)";
    ctx.fill();

    /* 3. Balance boundary line (top of owing) */
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      i === 0 ? ctx.moveTo(xAt(i), yAt(data.balance[i])) : ctx.lineTo(xAt(i), yAt(data.balance[i]));
    }
    ctx.strokeStyle = "rgba(240,235,224,0.25)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* 4. Cumulative-principal dividing line (sage) */
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      i === 0 ? ctx.moveTo(xAt(i), yAt(data.cumPrincipal[i])) : ctx.lineTo(xAt(i), yAt(data.cumPrincipal[i]));
    }
    ctx.strokeStyle = "#c5d4be";
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore(); /* unclip */

    /* Hover indicator */
    if (hovIdx != null && progress >= 1) {
      var hx   = xAt(hovIdx);
      var balY = yAt(data.balance[hovIdx]);
      var cpY  = yAt(data.cumPrincipal[hovIdx]);

      ctx.strokeStyle = "rgba(197,212,190,0.25)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, bottom); ctx.stroke();
      ctx.setLineDash([]);

      /* Dot on balance line */
      ctx.beginPath(); ctx.arc(hx, balY, 4, 0, 6.283);
      ctx.fillStyle = "rgba(240,235,224,0.4)"; ctx.fill();
      ctx.strokeStyle = "rgba(240,235,224,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();

      /* Dot on cumPrincipal line */
      ctx.beginPath(); ctx.arc(hx, cpY, 5, 0, 6.283);
      ctx.fillStyle = "#c5d4be"; ctx.fill();
      ctx.strokeStyle = "rgba(22,38,38,0.8)"; ctx.lineWidth = 1.5; ctx.stroke();
    }

    ctx.restore();
  }

  function rAnimate() {
    if (!chartCanvas) return;
    if (_rAnimId) { cancelAnimationFrame(_rAnimId); _rAnimId = null; }
    rResize();
    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var t = Math.min((ts - t0) / 900, 1);
      rDraw(1 - Math.pow(1 - t, 3));
      if (t < 1) _rAnimId = requestAnimationFrame(frame); else _rAnimId = null;
    }
    _rAnimId = requestAnimationFrame(frame);
  }

  function rClear() {
    _rData = null;
    if (_rAnimId) { cancelAnimationFrame(_rAnimId); _rAnimId = null; }
    if (!chartCanvas) return;
    rResize();
    chartCanvas.getContext("2d").clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  }

  /* ====================================================================
     PDF EXPORT
  ==================================================================== */
  var _pdfData = null;

  function makeLogoImg(markColor, textColor) {
    var c   = document.createElement("canvas");
    c.width = 360; c.height = 100;
    var ctx = c.getContext("2d");
    ctx.save();
    ctx.scale(0.88, 0.88);
    ctx.strokeStyle = markColor;
    ctx.lineWidth   = 3.5;
    ctx.lineJoin    = "round";
    ctx.stroke(new Path2D("M50 84C22 62 9 46 9 30C9 17 19 9 30 9C39 9 46 14 50 23C54 14 61 9 70 9C81 9 91 17 91 30C91 46 78 62 50 84Z"));
    ctx.lineWidth = 2.2;
    ctx.lineCap   = "round";
    ctx.stroke(new Path2D("M67 41C61 52 56 64 50 80M67 41C72 34 81 34 85 39C80 45 71 46 67 41ZM62 53C67 47 75 48 78 53C73 58 65 58 62 53ZM57 65C62 60 69 61 72 66C67 70 60 70 57 65ZM63 50C58 44 51 44 47 49C52 54 60 55 63 50ZM58 62C53 57 46 57 42 62C47 67 54 67 58 62Z"));
    ctx.restore();
    ctx.fillStyle    = textColor;
    ctx.textBaseline = "alphabetic";
    ctx.font         = "bold 40px \"DM Sans\", Helvetica, Arial, sans-serif";
    ctx.fillText("HART", 100, 53);
    ctx.globalAlpha  = 0.7;
    ctx.font         = "22px \"DM Sans\", Helvetica, Arial, sans-serif";
    ctx.fillText("Lending", 100, 78);
    ctx.globalAlpha  = 1;
    return c.toDataURL("image/png");
  }

  function doGeneratePDF() {
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF || !_pdfData) return;
    var d   = _pdfData;
    var doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    var PW  = 210, PH = 297, M = 18, CW = PW - M * 2;
    var y;

    /* ── Header ─────────────────────────────────────────────────────── */
    doc.setFillColor(22, 38, 38);
    doc.rect(0, 0, PW, 44, "F");
    var logoImg = makeLogoImg("#c5d4be", "#f0ebe0");
    doc.addImage(logoImg, "PNG", M, 8, 48, 13.3);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(197, 212, 190);
    doc.text("REPAYMENT CALCULATOR", PW - M, 15, { align: "right" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(139, 152, 120);
    var dateStr = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    doc.text("Generated " + dateStr, PW - M, 22, { align: "right" });
    doc.setFontSize(7);
    doc.text("Finance, done with heart.", M, 37);

    /* ── Loan Details ────────────────────────────────────────────────── */
    y = 54;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("YOUR LOAN DETAILS", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var freqLabel = d.frequency === "fortnightly" ? "Fortnightly" : d.frequency === "weekly" ? "Weekly" : "Monthly";
    var typeLabel = d.loanType === "io" ? "Interest only" : "Principal & interest";
    var inputs = [
      ["Loan amount",      "$" + fmt(d.loanAmount)],
      ["Interest rate",    d.rate + "% p.a."],
      ["Loan term",        d.term + " years"],
      ["Loan type",        typeLabel],
      ["Repayment freq.",  freqLabel]
    ];
    inputs.forEach(function (row, i) {
      var cx = (i % 2 === 0) ? M : M + CW / 2 + 5;
      var ry = y + Math.floor(i / 2) * 9;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(139, 152, 120);
      doc.text(row[0], cx, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 38, 38);
      doc.text(row[1], cx, ry + 4.5);
    });
    y += Math.ceil(inputs.length / 2) * 9 + 10;

    /* ── Repayment Summary ───────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("YOUR REPAYMENT SCHEDULE", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var boxH = 44;
    doc.setFillColor(26, 42, 42);
    doc.roundedRect(M, y, CW, boxH, 3, 3, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text(freqLabel + " repayment", M + 6, y + 7);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.repayment), M + 6, y + 20);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text(typeLabel + "  ·  " + d.term + " year term", M + 6, y + 28);
    if (d.loanType === "io") {
      doc.text("Balance of $" + fmt(d.loanAmount) + " remains at end of term", M + 6, y + 36);
    }

    var rx = M + CW / 2 + 8;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Total interest paid", rx, y + 7);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.totalInterest), rx, y + 18);
    doc.setDrawColor(197, 212, 190);
    doc.setLineWidth(0.15);
    doc.line(rx, y + 21, PW - M - 6, y + 21);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Total amount repaid", rx, y + 28);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.totalRepaid), rx, y + 37);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Interest: " + d.intPct + "% of loan amount", rx, y + 43);

    y += boxH + 10;

    /* ── Chart ───────────────────────────────────────────────────────── */
    if (chartCanvas && _rData) {
      if (_rAnimId) { cancelAnimationFrame(_rAnimId); _rAnimId = null; }
      rDraw(1);

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(123, 140, 111);
      doc.text("LOAN BALANCE OVER TIME", M, y);
      doc.setDrawColor(123, 140, 111);
      doc.setLineWidth(0.25);
      doc.line(M, y + 1.5, PW - M, y + 1.5);
      y += 7;

      var cxW    = chartCanvas.width  / _rDpr;
      var cxH    = chartCanvas.height / _rDpr;
      var chartH = Math.min(CW * cxH / cxW, 38);
      doc.setFillColor(26, 42, 42);
      doc.roundedRect(M, y, CW, chartH + 4, 3, 3, "F");
      doc.addImage(chartCanvas.toDataURL("image/png"), "PNG", M + 2, y + 2, CW - 4, chartH);
      y += chartH + 14;
    }

    /* ── Comparison ──────────────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("LOAN COST SUMMARY", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var halfW = (CW - 6) / 2;
    doc.setFillColor(244, 242, 237);
    doc.roundedRect(M, y, halfW, 22, 2, 2, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("LOAN AMOUNT", M + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(22, 38, 38);
    doc.text("$" + fmt(d.loanAmount), M + 4, y + 18);

    var col2 = M + halfW + 6;
    doc.setFillColor(26, 42, 42);
    doc.roundedRect(col2, y, halfW, 22, 2, 2, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(197, 212, 190);
    doc.text("TOTAL INTEREST", col2 + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(197, 212, 190);
    doc.text("$" + fmt(d.totalInterest), col2 + 4, y + 18);
    y += 30;

    /* ── Footer ──────────────────────────────────────────────────────── */
    var footerY = PH - 30;
    doc.setFillColor(22, 38, 38);
    doc.rect(0, footerY, PW, 30, "F");
    doc.addImage(makeLogoImg("#c5d4be", "#f0ebe0"), "PNG", M, footerY + 4, 34, 9.4);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(197, 212, 190);
    doc.text("kim@hartlending.com.au  •  0422 066 339  •  hartlending.com.au", PW / 2, footerY + 9, { align: "center" });
    doc.setFontSize(6);
    doc.setTextColor(139, 152, 120);
    doc.text("Sunshine Coast, QLD  —  Australia-wide service", PW / 2, footerY + 14, { align: "center" });
    doc.setFontSize(5.5);
    doc.setTextColor(100, 110, 95);
    doc.text("For illustration only — not financial advice. Speak with Kim for a personalised assessment. Hart Lending is a Credit Representative authorised under an Australian Credit Licence.", PW / 2, footerY + 21, { align: "center", maxWidth: CW + 10 });

    if (btnExport) { btnExport.disabled = false; }
    doc.save("hart-lending-repayment.pdf");
  }

  function generatePDF() {
    if (!_pdfData) return;
    if (window.jspdf && window.jspdf.jsPDF) { doGeneratePDF(); return; }
    if (btnExport) { btnExport.disabled = true; }
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = doGeneratePDF;
    s.onerror = function () {
      if (btnExport) { btnExport.disabled = false; }
      alert("Could not load the PDF library. Please check your internet connection and try again.");
    };
    document.head.appendChild(s);
  }

  if (btnExport) btnExport.addEventListener("click", generatePDF);

  /* ---- Validation ---- */
  function validateField(fieldId, condition, msg) {
    var wrap  = document.getElementById(fieldId + "-field");
    var errEl = wrap ? wrap.querySelector(".field-error") : null;
    if (!wrap) return condition;
    if (!condition) {
      wrap.classList.add("has-error");
      if (errEl) errEl.textContent = msg;
    } else {
      wrap.classList.remove("has-error");
      if (errEl) errEl.textContent = "";
    }
    return condition;
  }

  function validate() {
    var amount = getNum(fLoanAmount);
    var rate   = getNum(fRate);
    var term   = parseInt(fTerm ? fTerm.value : 0) || 0;
    var ok = true;
    if (!validateField("loan-amount",   amount > 0,              "Please enter your loan amount."))         ok = false;
    if (!validateField("interest-rate", rate >= 0.1 && rate <= 25, "Enter a rate between 0.1% and 25%.")) ok = false;
    if (!validateField("loan-term",     term > 0,                "Please select a loan term."))            ok = false;
    return ok;
  }

  /* ---- Main calculate ---- */
  function calculate() {
    var loanAmount = getNum(fLoanAmount);
    var rate       = getNum(fRate);
    var term       = parseInt(fTerm ? fTerm.value : 0) || 0;
    var loanType   = getRadio("loan-type") || "pandi";
    var frequency  = getRadio("frequency") || "monthly";

    if (loanAmount <= 0 || rate < 0.1 || term <= 0) { setEmpty(); return; }

    var repayment    = calcRepayment(loanAmount, rate, term, loanType, frequency);
    var ppy          = periodsPerYear(frequency);
    var totalRepaid  = repayment * term * ppy;
    var totalInterest = loanType === "io"
      ? totalRepaid
      : Math.max(0, totalRepaid - loanAmount);
    var intPct = Math.round(totalInterest / loanAmount * 100);

    var freqLabels = { monthly: "Monthly repayment", fortnightly: "Fortnightly repayment", weekly: "Weekly repayment" };
    var typeNote   = loanType === "io" ? "Interest only" : "Principal & interest";

    if (rRepLabel)    rRepLabel.textContent    = freqLabels[frequency] || "Repayment";
    if (rRepayment)   { rRepayment.textContent  = fmtDollar(repayment);       rRepayment.classList.remove("is-empty"); }
    if (rTotalInt)    { rTotalInt.textContent    = fmtDollar(totalInterest);   rTotalInt.classList.remove("is-empty"); }
    if (rTotalRepaid) { rTotalRepaid.textContent = fmtDollar(totalRepaid);     rTotalRepaid.classList.remove("is-empty"); }
    if (rIntPct)      { rIntPct.textContent      = intPct + "%";               rIntPct.classList.remove("is-empty"); }
    if (rLoanAmount)  { rLoanAmount.textContent  = fmtDollar(loanAmount);      rLoanAmount.classList.remove("is-empty"); }
    if (rTotalIntBox) { rTotalIntBox.textContent = fmtDollar(totalInterest);   rTotalIntBox.classList.remove("is-empty"); }

    if (loanType === "io") {
      if (rRepSub) rRepSub.textContent = "Interest only  ·  $" + fmt(loanAmount) + " balance remains at term end";
      if (rPandiComp) {
        var pandiPmt = calcRepayment(loanAmount, rate, term, "pandi", frequency);
        rPandiComp.textContent = "Equivalent P&I repayment: " + fmtDollar(pandiPmt) + " " + (frequency === "monthly" ? "per month" : frequency === "fortnightly" ? "per fortnight" : "per week");
        rPandiComp.style.display = "block";
      }
    } else {
      if (rRepSub) rRepSub.textContent = typeNote + "  ·  " + term + " year term";
      if (rPandiComp) rPandiComp.style.display = "none";
    }

    _pdfData = {
      loanAmount: loanAmount, rate: rate, term: term, loanType: loanType, frequency: frequency,
      repayment: repayment, totalRepaid: totalRepaid, totalInterest: totalInterest, intPct: intPct
    };
    if (btnExport) btnExport.disabled = false;

    _rData = genChartData(loanAmount, rate, term, loanType);
    rAnimate();
  }

  function setEmpty() {
    rClear();
    _pdfData = null;
    if (btnExport) btnExport.disabled = true;
    [rRepayment, rTotalInt, rTotalRepaid, rIntPct, rLoanAmount, rTotalIntBox].forEach(function (el) {
      if (!el) return;
      el.textContent = "—";
      el.classList.add("is-empty");
    });
    if (rRepLabel)  rRepLabel.textContent  = "Your repayment";
    if (rRepSub)    rRepSub.textContent    = "Enter your loan details to see results";
    if (rPandiComp) rPandiComp.style.display = "none";
  }

  /* ---- Wire events ---- */
  [fLoanAmount, fRate, fTerm].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input",  calculate);
    el.addEventListener("change", calculate);
  });
  [fLoanAmount, fRate, fTerm].forEach(function (el) {
    if (!el) return;
    el.addEventListener("blur", validate);
  });
  document.querySelectorAll('input[name="loan-type"], input[name="frequency"]').forEach(function (r) {
    r.addEventListener("change", calculate);
  });

  /* ---- Chart hover ---- */
  if (chartCanvas && chartTooltip) {
    var _hovIdx = null;

    chartCanvas.addEventListener("mousemove", function (e) {
      if (!_rData || _rAnimId) return;
      var rect  = chartCanvas.getBoundingClientRect();
      var n     = _rData.n;
      var plotW = chartCanvas.offsetWidth - PAD.left - PAD.right;
      var idx   = Math.round((e.clientX - rect.left - PAD.left) / plotW * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      if (idx !== _hovIdx) { _hovIdx = idx; rDraw(1, idx); }

      chartTooltip.textContent = "";
      var ttYear = document.createElement("strong");
      ttYear.textContent = "Year " + idx;
      chartTooltip.appendChild(ttYear);
      chartTooltip.appendChild(document.createElement("br"));
      var ttP = document.createElement("span"); ttP.style.color = "#c5d4be"; ttP.textContent = "Principal paid: ";
      chartTooltip.appendChild(ttP);
      chartTooltip.appendChild(document.createTextNode("$" + _rData.cumPrincipal[idx].toLocaleString("en-AU")));
      chartTooltip.appendChild(document.createElement("br"));
      var ttO = document.createElement("span"); ttO.style.opacity = "0.5"; ttO.textContent = "Owing: ";
      chartTooltip.appendChild(ttO);
      chartTooltip.appendChild(document.createTextNode("$" + _rData.balance[idx].toLocaleString("en-AU")));

      var xPx  = PAD.left + (idx / Math.max(n - 1, 1)) * plotW;
      var left = xPx + 10;
      if (left + 168 > chartCanvas.offsetWidth) left = xPx - 178;
      chartTooltip.style.left = Math.max(0, left) + "px";
      chartTooltip.classList.add("visible");
    });

    chartCanvas.addEventListener("mouseleave", function () {
      _hovIdx = null;
      chartTooltip.classList.remove("visible");
      if (_rData && !_rAnimId) rDraw(1);
    });
  }

  window.addEventListener("resize", function () {
    if (_rData && !_rAnimId) { rResize(); rDraw(1); }
  });

  setEmpty();
})();
