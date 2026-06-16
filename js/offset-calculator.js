/* =========================================================================
   HART LENDING — Offset Savings Calculator
   Vanilla JS, no dependencies.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- Helpers ---- */
  function fmt(n) { return Math.round(n).toLocaleString("en-AU"); }
  function fmtDollar(n) { return "$" + fmt(n); }
  function getNum(el) { return parseFloat(el ? el.value : "") || 0; }

  function fmtTimeSaved(months) {
    if (months <= 0) return null;
    var y = Math.floor(months / 12);
    var m = Math.round(months % 12);
    var parts = [];
    if (y > 0) parts.push(y + (y === 1 ? " year" : " years"));
    if (m > 0) parts.push(m + (m === 1 ? " month" : " months"));
    return parts.join(" & ");
  }

  /* ---- Core math ---- */
  function monthlyPayment(principal, annualRate, months) {
    if (principal <= 0 || months <= 0) return 0;
    var r = annualRate / 100 / 12;
    if (r === 0) return principal / months;
    return principal * r / (1 - Math.pow(1 + r, -months));
  }

  function totalInterestStandard(principal, annualRate, months) {
    var P = monthlyPayment(principal, annualRate, months);
    return Math.max(0, P * months - principal);
  }

  function simulateWithOffset(loanBalance, annualRate, months, offsetBalance, monthlyDeposit) {
    if (offsetBalance >= loanBalance) return { totalInterest: 0, monthsPaid: 0 };
    var r = annualRate / 100 / 12;
    var P = loanBalance * r / (1 - Math.pow(1 + r, -months));
    var balance = loanBalance;
    var offset = Math.min(offsetBalance, loanBalance);
    var totalInterest = 0;
    var monthsPaid = 0;
    for (var m = 0; m < months * 2; m++) {
      if (balance <= 0.01) break;
      var effective = Math.max(0, balance - offset);
      var interest = effective * r;
      var principal = P - interest;
      if (principal <= 0) principal = P;
      principal = Math.min(balance, principal);
      totalInterest += interest;
      balance -= principal;
      offset += monthlyDeposit;
      monthsPaid++;
    }
    return { totalInterest: totalInterest, monthsPaid: monthsPaid };
  }

  /* ---- DOM refs ---- */
  var fLoanBalance   = document.getElementById("loan-balance");
  var fRate          = document.getElementById("interest-rate");
  var fTerm          = document.getElementById("loan-term");
  var fOffset        = document.getElementById("offset-balance");
  var fDeposit       = document.getElementById("monthly-deposit");

  var rInterestSaved = document.getElementById("r-interest-saved");
  var rTimeSaved     = document.getElementById("r-time-saved");
  var rMonthly       = document.getElementById("r-monthly");
  var rWithout       = document.getElementById("r-without");
  var rWith          = document.getElementById("r-with");
  var rCard          = document.getElementById("results-card");
  var btnExport      = document.getElementById("btn-export-pdf");

  if (!fLoanBalance) return;

  /* ====================================================================
     CHART — "Principal remaining vs Time" filled-area chart
     Two filled areas: standard loan (outer, muted) + offset loan (inner).
     The gap between them shows interest and time saved.
  ==================================================================== */
  var chartCanvas  = document.getElementById("offset-chart");
  var chartTooltip = document.getElementById("offset-chart-tooltip");
  var _cData   = null;
  var _cAnimId = null;
  var _cDpr    = 1;
  var PAD      = { top: 16, right: 14, bottom: 30, left: 56 };

  function genChartData(balance, rate, termYrs, offsetBal, deposit) {
    var r = rate / 100 / 12;
    var P = monthlyPayment(balance, rate, termYrs * 12);
    var std = [balance];
    var off = [balance];
    var sB = balance;
    var oB = balance;
    var oA = Math.min(offsetBal, balance);
    for (var yr = 1; yr <= termYrs; yr++) {
      for (var m = 0; m < 12; m++) {
        var i1 = sB * r;
        sB = Math.max(0, sB - (P - i1));
        var eff  = Math.max(0, oB - oA);
        var i2   = eff * r;
        var prin = P - i2;
        if (prin <= 0) prin = P;
        oB = Math.max(0, oB - Math.min(oB, prin));
        oA += deposit;
      }
      std.push(Math.round(sB));
      off.push(Math.round(oB));
    }
    var paidAtYr = termYrs;
    for (var i = 1; i < off.length; i++) {
      if (off[i] <= 0) { paidAtYr = i; break; }
    }
    return { termYrs: termYrs, std: std, off: off, peak: balance, paidAtYr: paidAtYr };
  }

  function cResize() {
    if (!chartCanvas) return;
    _cDpr = window.devicePixelRatio || 1;
    var W = chartCanvas.parentElement ? chartCanvas.parentElement.offsetWidth : 300;
    var H = 170;
    chartCanvas.style.width  = W + "px";
    chartCanvas.style.height = H + "px";
    chartCanvas.width  = Math.round(W * _cDpr);
    chartCanvas.height = Math.round(H * _cDpr);
  }

  function cDraw(progress, hovIdx) {
    if (!chartCanvas || !_cData) return;
    var ctx  = chartCanvas.getContext("2d");
    var W    = Math.round(chartCanvas.width  / _cDpr);
    var H    = Math.round(chartCanvas.height / _cDpr);
    var data = _cData;
    var n    = data.std.length;

    ctx.save();
    ctx.scale(_cDpr, _cDpr);
    ctx.clearRect(0, 0, W, H);

    var plotW  = W - PAD.left - PAD.right;
    var plotH  = H - PAD.top  - PAD.bottom;
    var bottom = PAD.top + plotH;

    function xAt(i) { return PAD.left + (i / (n - 1)) * plotW; }
    function yAt(v) { return PAD.top  + (1 - Math.min(v, data.peak) / data.peak) * plotH; }

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

    ctx.fillStyle    = "rgba(197,212,190,0.3)";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    var everyN = Math.ceil(data.termYrs / 5);
    for (var i = 0; i < n; i++) {
      if (i === 0 || i % everyN === 0 || i === n - 1) {
        ctx.fillText(i + "yr", xAt(i), H - PAD.bottom + 5);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PAD.left + plotW * progress + 4, H);
    ctx.clip();

    /* Standard loan filled area (outer, lighter) */
    ctx.beginPath();
    ctx.moveTo(xAt(0), bottom);
    ctx.lineTo(xAt(0), yAt(data.std[0]));
    for (var i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(data.std[i]));
    ctx.lineTo(xAt(n - 1), bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(197,212,190,0.13)";
    ctx.fill();

    /* Offset loan filled area (inner, more prominent) */
    var paidN = Math.min(data.paidAtYr + 1, n);
    ctx.beginPath();
    ctx.moveTo(xAt(0), bottom);
    ctx.lineTo(xAt(0), yAt(data.off[0]));
    for (var i = 1; i < paidN; i++) ctx.lineTo(xAt(i), yAt(data.off[i]));
    ctx.lineTo(xAt(paidN - 1), bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(197,212,190,0.42)";
    ctx.fill();

    /* Standard loan line */
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      i === 0 ? ctx.moveTo(xAt(i), yAt(data.std[i])) : ctx.lineTo(xAt(i), yAt(data.std[i]));
    }
    ctx.strokeStyle = "rgba(240,235,224,0.2)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* Offset loan line */
    ctx.beginPath();
    for (var i = 0; i < paidN; i++) {
      i === 0 ? ctx.moveTo(xAt(i), yAt(data.off[i])) : ctx.lineTo(xAt(i), yAt(data.off[i]));
    }
    if (data.paidAtYr < data.termYrs) ctx.lineTo(xAt(paidN - 1), bottom);
    ctx.strokeStyle = "#c5d4be";
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();

    if (hovIdx != null && progress >= 1) {
      var hx     = xAt(hovIdx);
      var stdY   = yAt(data.std[hovIdx]);
      var offVal = hovIdx < paidN ? data.off[hovIdx] : 0;
      var offY   = yAt(offVal);

      ctx.strokeStyle = "rgba(197,212,190,0.25)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, bottom); ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.arc(hx, stdY, 4, 0, 6.283);
      ctx.fillStyle = "rgba(240,235,224,0.35)"; ctx.fill();

      ctx.beginPath(); ctx.arc(hx, offY, 5, 0, 6.283);
      ctx.fillStyle = "#c5d4be"; ctx.fill();
      ctx.strokeStyle = "rgba(22,38,38,0.8)"; ctx.lineWidth = 1.5; ctx.stroke();
    }

    ctx.restore();
  }

  function cAnimate() {
    if (!chartCanvas) return;
    if (_cAnimId) { cancelAnimationFrame(_cAnimId); _cAnimId = null; }
    cResize();
    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var t = Math.min((ts - t0) / 900, 1);
      cDraw(1 - Math.pow(1 - t, 3));
      if (t < 1) _cAnimId = requestAnimationFrame(frame); else _cAnimId = null;
    }
    _cAnimId = requestAnimationFrame(frame);
  }

  function cClear() {
    _cData = null;
    if (_cAnimId) { cancelAnimationFrame(_cAnimId); _cAnimId = null; }
    if (!chartCanvas) return;
    cResize();
    chartCanvas.getContext("2d").clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  }

  /* ====================================================================
     PDF EXPORT
  ==================================================================== */
  var _pdfData = null;

  /* Render the Hart Lending logo to an offscreen canvas and return a PNG dataURL */
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
    var d  = _pdfData;
    var doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    var PW = 210, PH = 297, M = 18, CW = PW - M * 2;
    var y;

    /* ── Header ─────────────────────────────────────────────────────── */
    doc.setFillColor(22, 38, 38);
    doc.rect(0, 0, PW, 44, "F");

    var logoImg = makeLogoImg("#c5d4be", "#f0ebe0");
    doc.addImage(logoImg, "PNG", M, 8, 48, 13.3);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(197, 212, 190);
    doc.text("OFFSET SAVINGS CALCULATOR", PW - M, 15, { align: "right" });
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

    var inputs = [
      ["Loan balance",   "$" + fmt(d.balance)],
      ["Interest rate",  d.rate + "% p.a."],
      ["Loan term",      d.term + " years"],
      ["Offset balance", "$" + fmt(d.offset)]
    ];
    if (d.deposit > 0) inputs.push(["Monthly deposit", "$" + fmt(d.deposit) + "/mo"]);
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

    /* ── Savings Panel ───────────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("YOUR ESTIMATED SAVINGS", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var boxH = 42;
    doc.setFillColor(26, 42, 42);
    doc.roundedRect(M, y, CW, boxH, 3, 3, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Interest saved with offset", M + 6, y + 8);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.interestSaved), M + 6, y + 21);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text(d.timeSavedStr || "", M + 6, y + 29);

    var rx = M + CW / 2 + 8;
    doc.setFontSize(7);
    doc.setTextColor(123, 140, 111);
    doc.text("Monthly repayment", rx, y + 8);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.payment) + "/mo", rx, y + 19);
    doc.setDrawColor(197, 212, 190);
    doc.setLineWidth(0.15);
    doc.line(rx, y + 22, PW - M - 6, y + 22);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Without offset:  $" + fmt(d.interestWithout), rx, y + 29);
    doc.text("With offset:       $" + fmt(d.interestWith),  rx, y + 36);

    y += boxH + 10;

    /* ── Chart ───────────────────────────────────────────────────────── */
    if (chartCanvas && _cData) {
      if (_cAnimId) { cancelAnimationFrame(_cAnimId); _cAnimId = null; }
      cDraw(1);

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(123, 140, 111);
      doc.text("LOAN BALANCE OVER TIME", M, y);
      doc.setDrawColor(123, 140, 111);
      doc.setLineWidth(0.25);
      doc.line(M, y + 1.5, PW - M, y + 1.5);
      y += 7;

      var cxW    = chartCanvas.width  / _cDpr;
      var cxH    = chartCanvas.height / _cDpr;
      var chartH = Math.min(CW * cxH / cxW, 46);
      doc.setFillColor(26, 42, 42);
      doc.roundedRect(M, y, CW, chartH + 4, 3, 3, "F");
      doc.addImage(chartCanvas.toDataURL("image/png"), "PNG", M + 2, y + 2, CW - 4, chartH);
      y += chartH + 14;
    }

    /* ── Comparison ──────────────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("TOTAL INTEREST COMPARISON", M, y);
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
    doc.text("WITHOUT OFFSET", M + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(22, 38, 38);
    doc.text("$" + fmt(d.interestWithout), M + 4, y + 18);

    var col2 = M + halfW + 6;
    doc.setFillColor(26, 42, 42);
    doc.roundedRect(col2, y, halfW, 22, 2, 2, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(197, 212, 190);
    doc.text("WITH OFFSET", col2 + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(197, 212, 190);
    doc.text("$" + fmt(d.interestWith), col2 + 4, y + 18);
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
    doc.save("hart-lending-offset-savings.pdf");
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
    var balance = getNum(fLoanBalance);
    var rate    = getNum(fRate);
    var term    = parseInt(fTerm ? fTerm.value : 0) || 0;
    var ok = true;
    if (!validateField("loan-balance",  balance > 0,               "Please enter your loan balance."))         ok = false;
    if (!validateField("interest-rate", rate >= 0.1 && rate <= 25, "Enter a rate between 0.1% and 25%."))      ok = false;
    if (!validateField("loan-term",     term > 0,                  "Please select a loan term."))              ok = false;
    return ok;
  }

  /* ---- Main calculate ---- */
  function calculate() {
    var balance = getNum(fLoanBalance);
    var rate    = getNum(fRate);
    var term    = parseInt(fTerm ? fTerm.value : 0) || 0;
    var offset  = getNum(fOffset);
    var deposit = getNum(fDeposit);

    if (balance <= 0 || rate < 0.1 || term <= 0) { setEmpty(); return; }

    var months          = term * 12;
    var payment         = monthlyPayment(balance, rate, months);
    var interestWithout = totalInterestStandard(balance, rate, months);
    var sim             = simulateWithOffset(balance, rate, months, offset, deposit);
    var interestWith    = sim.totalInterest;
    var saved           = Math.max(0, interestWithout - interestWith);
    var monthsSaved     = months - sim.monthsPaid;
    var timeSavedStr    = fmtTimeSaved(monthsSaved);

    var timeSavedLabel;
    if (offset > 0 || deposit > 0) {
      timeSavedLabel = timeSavedStr
        ? "Save " + timeSavedStr + " off your loan"
        : "Your offset fully covers the loan balance";
    } else {
      timeSavedLabel = "Add an offset balance to see your savings";
    }

    rCard.classList.remove("is-empty");
    rInterestSaved.textContent = fmtDollar(saved);           rInterestSaved.classList.remove("is-empty");
    rTimeSaved.textContent     = timeSavedLabel;
    rMonthly.textContent       = fmtDollar(payment) + "/mo"; rMonthly.classList.remove("is-empty");
    rWithout.textContent       = fmtDollar(interestWithout); rWithout.classList.remove("is-empty");
    rWith.textContent          = fmtDollar(interestWith);    rWith.classList.remove("is-empty");

    _pdfData = {
      balance: balance, rate: rate, term: term, offset: offset, deposit: deposit,
      interestSaved: saved, timeSavedStr: timeSavedLabel,
      payment: payment, interestWithout: interestWithout, interestWith: interestWith
    };
    if (btnExport) btnExport.disabled = false;

    _cData = genChartData(balance, rate, term, offset, deposit);
    cAnimate();
  }

  function setEmpty() {
    cClear();
    _pdfData = null;
    if (btnExport) btnExport.disabled = true;
    rInterestSaved.textContent = "—"; rInterestSaved.classList.add("is-empty");
    rTimeSaved.textContent     = "Enter your loan details to see savings";
    rMonthly.textContent       = "—"; rMonthly.classList.add("is-empty");
    rWithout.textContent       = "—"; rWithout.classList.add("is-empty");
    rWith.textContent          = "—"; rWith.classList.add("is-empty");
  }

  /* ---- Wire events ---- */
  [fLoanBalance, fRate, fTerm, fOffset, fDeposit].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input",  calculate);
    el.addEventListener("change", calculate);
  });
  [fLoanBalance, fRate, fTerm].forEach(function (el) {
    if (!el) return;
    el.addEventListener("blur", validate);
  });

  /* ---- Chart hover ---- */
  if (chartCanvas && chartTooltip) {
    var _hovIdx = null;

    chartCanvas.addEventListener("mousemove", function (e) {
      if (!_cData || _cAnimId) return;
      var rect  = chartCanvas.getBoundingClientRect();
      var n     = _cData.std.length;
      var plotW = chartCanvas.offsetWidth - PAD.left - PAD.right;
      var idx   = Math.round((e.clientX - rect.left - PAD.left) / plotW * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      if (idx !== _hovIdx) { _hovIdx = idx; cDraw(1, idx); }

      chartTooltip.textContent = "";
      var ttYear = document.createElement("strong");
      ttYear.textContent = "Year " + idx;
      chartTooltip.appendChild(ttYear);
      chartTooltip.appendChild(document.createElement("br"));
      var ttS1 = document.createElement("span"); ttS1.style.opacity = "0.5"; ttS1.textContent = "Standard: ";
      chartTooltip.appendChild(ttS1);
      chartTooltip.appendChild(document.createTextNode("$" + _cData.std[idx].toLocaleString("en-AU")));
      chartTooltip.appendChild(document.createElement("br"));
      var ttS2 = document.createElement("span"); ttS2.style.color = "#c5d4be"; ttS2.textContent = "With offset: ";
      chartTooltip.appendChild(ttS2);
      var offVal = (idx <= _cData.paidAtYr) ? _cData.off[idx] : 0;
      chartTooltip.appendChild(document.createTextNode("$" + offVal.toLocaleString("en-AU")));

      var xPx  = PAD.left + (idx / (n - 1)) * plotW;
      var left = xPx + 10;
      if (left + 168 > chartCanvas.offsetWidth) left = xPx - 178;
      chartTooltip.style.left = Math.max(0, left) + "px";
      chartTooltip.classList.add("visible");
    });

    chartCanvas.addEventListener("mouseleave", function () {
      _hovIdx = null;
      chartTooltip.classList.remove("visible");
      if (_cData && !_cAnimId) cDraw(1);
    });
  }

  window.addEventListener("resize", function () {
    if (_cData && !_cAnimId) { cResize(); cDraw(1); }
  });

  setEmpty();
})();
