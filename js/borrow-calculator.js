/* =========================================================================
   HART LENDING — Borrowing Power Calculator
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

  /* ---- DOM refs ---- */
  var fGrossIncome   = document.getElementById("gross-income");
  var fPartnerIncome = document.getElementById("partner-income");
  var fPartnerField  = document.getElementById("partner-income-field");
  var fLiving        = document.getElementById("monthly-living");
  var fRepayments    = document.getElementById("other-repayments");
  var fCreditCard    = document.getElementById("credit-card-limit");
  var fDependants    = document.getElementById("dependants");

  var rBorrowPower  = document.getElementById("r-borrow-power");
  var rRepayment    = document.getElementById("r-repayment");
  var rNetIncome    = document.getElementById("r-net-income");
  var rAvailable    = document.getElementById("r-available");
  var rInsufficient = document.getElementById("r-insufficient");
  var btnExport     = document.getElementById("btn-export-pdf");

  var paygFields   = document.getElementById("payg-fields");
  var selfEmpPanel = document.getElementById("self-emp-panel");
  var resultsMain  = document.getElementById("results-main");

  if (!fGrossIncome) return;

  /* ====================================================================
     CHART — Monthly income breakdown stacked bar
     Segments: Living | Repayments | Cards | Available for mortgage
  ==================================================================== */
  var borrowChart = document.getElementById("borrow-chart");
  var _bSegs   = null;
  var _bAnimId = null;
  var _bDpr    = 1;

  function bRRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  function bDraw(progress) {
    if (!borrowChart || !_bSegs) return;
    var ctx = borrowChart.getContext("2d");
    var W   = Math.round(borrowChart.width  / _bDpr);
    var H   = Math.round(borrowChart.height / _bDpr);

    ctx.save();
    ctx.scale(_bDpr, _bDpr);
    ctx.clearRect(0, 0, W, H);

    var BAR_H = 38;
    var BAR_Y = 2;
    var LBL_Y = BAR_Y + BAR_H + 7;
    var total = _bSegs.reduce(function (s, g) { return s + g.value; }, 0);
    if (total <= 0) { ctx.restore(); return; }

    ctx.save();
    bRRect(ctx, 0, BAR_Y, W * progress, BAR_H, 8);
    ctx.clip();
    var x = 0;
    _bSegs.forEach(function (seg) {
      var sw = seg.value / total * W;
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, BAR_Y, sw + 1, BAR_H);
      x += sw;
    });
    ctx.restore();

    if (progress > 0.88) {
      ctx.globalAlpha = Math.min(1, (progress - 0.88) / 0.12);
      x = 0;
      _bSegs.forEach(function (seg) {
        var sw = seg.value / total * W;
        var cx = x + sw / 2;
        if (sw > 42) {
          ctx.textAlign    = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle    = "rgba(197,212,190,0.45)";
          ctx.font         = "10px DM Sans, system-ui, sans-serif";
          ctx.fillText(seg.label, cx, LBL_Y);
          ctx.fillStyle    = "rgba(240,235,224,0.6)";
          ctx.font         = "600 10px DM Sans, system-ui, sans-serif";
          ctx.fillText("$" + Math.round(seg.value).toLocaleString("en-AU"), cx, LBL_Y + 13);
        }
        x += sw;
      });
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function bAnimate() {
    if (!borrowChart) return;
    if (_bAnimId) { cancelAnimationFrame(_bAnimId); _bAnimId = null; }
    _bDpr = window.devicePixelRatio || 1;
    var W = borrowChart.parentElement ? borrowChart.parentElement.offsetWidth : 300;
    var H = 72;
    borrowChart.style.width  = W + "px";
    borrowChart.style.height = H + "px";
    borrowChart.width  = Math.round(W * _bDpr);
    borrowChart.height = Math.round(H * _bDpr);
    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var t = Math.min((ts - t0) / 750, 1);
      bDraw(1 - Math.pow(1 - t, 3));
      if (t < 1) _bAnimId = requestAnimationFrame(frame); else _bAnimId = null;
    }
    _bAnimId = requestAnimationFrame(frame);
  }

  function bClear() {
    _bSegs = null;
    if (_bAnimId) { cancelAnimationFrame(_bAnimId); _bAnimId = null; }
    if (!borrowChart) return;
    borrowChart.getContext("2d").clearRect(0, 0, borrowChart.width, borrowChart.height);
  }

  function bSetSegs(living, repay, card, avail) {
    _bSegs = [
      { label: "Living",     value: living, color: "rgba(192,86,63,0.6)"    },
      { label: "Repayments", value: repay,  color: "rgba(240,235,224,0.22)" },
      { label: "Cards",      value: card,   color: "rgba(240,235,224,0.14)" },
      { label: "Available",  value: avail,  color: "rgba(197,212,190,0.72)" }
    ].filter(function (s) { return s.value > 1; });
    bAnimate();
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
    doc.text("BORROWING POWER CALCULATOR", PW - M, 15, { align: "right" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(139, 152, 120);
    var dateStr = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    doc.text("Generated " + dateStr, PW - M, 22, { align: "right" });
    doc.setFontSize(7);
    doc.text("Finance, done with heart.", M, 37);

    /* ── Financial Profile ───────────────────────────────────────────── */
    y = 54;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("YOUR FINANCIAL PROFILE", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var inputs = [
      ["Applicants",          d.applicants === "couple" ? "Couple" : "Single"],
      ["Loan purpose",        d.purpose === "owner" ? "Owner-occupier" : "Investment"],
      ["Gross annual income", "$" + fmt(d.grossIncome) + " /yr"]
    ];
    if (d.applicants === "couple" && d.partnerIncome > 0) {
      inputs.push(["Partner income", "$" + fmt(d.partnerIncome) + " /yr"]);
    }
    inputs.push(["Monthly living",   "$" + fmt(d.monthlyLiving) + " /mo"]);
    inputs.push(["Other repayments", "$" + fmt(d.otherRepayments) + " /mo"]);
    if (d.creditCardLimit > 0) inputs.push(["Credit card limit", "$" + fmt(d.creditCardLimit)]);
    if (d.dependants > 0)      inputs.push(["Dependants",        String(d.dependants)]);

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

    /* ── Borrowing Power Hero ─────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("YOUR ESTIMATED BORROWING POWER", M, y);
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
    doc.text("Estimated borrowing power", M + 6, y + 8);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.maxLoan), M + 6, y + 21);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Assessed at 9% p.a. (APRA serviceability buffer)", M + 6, y + 29);

    var rx = M + CW / 2 + 8;
    doc.setFontSize(7);
    doc.setTextColor(123, 140, 111);
    doc.text("Monthly repayment at 6% p.a.", rx, y + 8);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(240, 235, 224);
    doc.text("$" + fmt(d.monthlyRepayment) + "/mo", rx, y + 19);
    doc.setDrawColor(197, 212, 190);
    doc.setLineWidth(0.15);
    doc.line(rx, y + 22, PW - M - 6, y + 22);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(123, 140, 111);
    doc.text("Net monthly income:  $" + fmt(d.netMonthly) + "/mo",    rx, y + 29);
    doc.text("Available for repayments:  $" + fmt(d.available) + "/mo", rx, y + 36);

    y += boxH + 10;

    /* ── Income Breakdown Chart ───────────────────────────────────────── */
    if (borrowChart && _bSegs) {
      if (_bAnimId) { cancelAnimationFrame(_bAnimId); _bAnimId = null; }
      bDraw(1);

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(123, 140, 111);
      doc.text("MONTHLY INCOME BREAKDOWN", M, y);
      doc.setDrawColor(123, 140, 111);
      doc.setLineWidth(0.25);
      doc.line(M, y + 1.5, PW - M, y + 1.5);
      y += 7;

      var cxW    = borrowChart.width  / _bDpr;
      var cxH    = borrowChart.height / _bDpr;
      var chartH = Math.min(CW * cxH / cxW, 22);
      doc.setFillColor(26, 42, 42);
      doc.roundedRect(M, y, CW, chartH + 4, 3, 3, "F");
      doc.addImage(borrowChart.toDataURL("image/png"), "PNG", M + 2, y + 2, CW - 4, chartH);
      y += chartH + 14;
    }

    /* ── Breakdown table ─────────────────────────────────────────────── */
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(123, 140, 111);
    doc.text("MONTHLY INCOME DETAIL", M, y);
    doc.setDrawColor(123, 140, 111);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;

    var rows = [
      ["Net monthly income (approx. 72% of gross)",     "$" + fmt(d.netMonthly) + "/mo"],
      ["Less: Living expenses (incl. HEM benchmark)",   "−$" + fmt(d.actualLiving) + "/mo"],
      ["Less: Other loan repayments",                   "−$" + fmt(d.otherRepayments) + "/mo"],
      ["Less: Credit card limit assessment",            "−$" + fmt(d.cardHit) + "/mo"],
      ["Available for mortgage repayments",             "$" + fmt(d.available) + "/mo"]
    ];
    rows.forEach(function (row, i) {
      var ry     = y + i * 8;
      var isLast = (i === rows.length - 1);
      if (i > 0 && !isLast) {
        doc.setDrawColor(220, 218, 212);
        doc.setLineWidth(0.1);
        doc.line(M, ry - 2, PW - M, ry - 2);
      }
      if (isLast) {
        doc.setFillColor(26, 42, 42);
        doc.rect(M, ry - 2.5, CW, 9.5, "F");
        doc.setTextColor(197, 212, 190);
      } else {
        doc.setTextColor(22, 38, 38);
      }
      doc.setFontSize(7);
      doc.setFont("helvetica", isLast ? "bold" : "normal");
      doc.text(row[0], M + 4, ry + 3);
      doc.text(row[1], PW - M - 4, ry + 3, { align: "right" });
    });
    y += rows.length * 8 + 10;

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
    doc.save("hart-lending-borrowing-power.pdf");
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

  /* ---- Core math ---- */
  function calculate() {
    var applicants      = getRadio("applicants") || "single";
    var purpose         = getRadio("purpose")    || "owner";
    var grossIncome     = getNum(fGrossIncome);
    var partnerIncome   = (applicants === "couple") ? getNum(fPartnerIncome) : 0;
    var monthlyLiving   = getNum(fLiving);
    var otherRepayments = getNum(fRepayments);
    var creditCardLimit = getNum(fCreditCard);
    var dependants      = parseInt(fDependants ? fDependants.value : 0) || 0;

    if (grossIncome <= 0) { setEmpty(); return; }

    var totalGross = grossIncome + partnerIncome;
    var netMonthly = totalGross / 12 * 0.72;

    var hemFloor = applicants === "couple" ? 3500 : 2000;
    hemFloor += dependants * 600;
    var actualLiving = Math.max(monthlyLiving, hemFloor);

    var cardHit  = creditCardLimit * 0.031 / 12;
    var available = netMonthly - actualLiving - otherRepayments - cardHit;

    bSetSegs(actualLiving, otherRepayments, cardHit, Math.max(0, available));

    if (available <= 0) { setInsufficient(netMonthly, actualLiving); return; }

    var stressRate       = 0.09 / 12;
    var n                = 360;
    var maxLoan          = available * (1 - Math.pow(1 + stressRate, -n)) / stressRate;
    var displayRate      = 0.06 / 12;
    var monthlyRepayment = maxLoan * displayRate / (1 - Math.pow(1 + displayRate, -n));

    _pdfData = {
      applicants: applicants, purpose: purpose,
      grossIncome: grossIncome, partnerIncome: partnerIncome,
      monthlyLiving: monthlyLiving, otherRepayments: otherRepayments,
      creditCardLimit: creditCardLimit, dependants: dependants,
      maxLoan: maxLoan, monthlyRepayment: monthlyRepayment,
      netMonthly: netMonthly, available: available,
      actualLiving: actualLiving, cardHit: cardHit
    };
    if (btnExport) btnExport.disabled = false;

    updateDOM(maxLoan, monthlyRepayment, netMonthly, available);
  }

  function updateDOM(maxLoan, monthlyRepayment, netMonthly, available) {
    if (rInsufficient) rInsufficient.classList.remove("show");
    if (rBorrowPower) { rBorrowPower.textContent  = fmtDollar(maxLoan);                  rBorrowPower.classList.remove("is-empty"); }
    if (rRepayment)   { rRepayment.textContent    = fmtDollar(monthlyRepayment) + "/mo"; rRepayment.classList.remove("is-empty"); }
    if (rNetIncome)   { rNetIncome.textContent    = fmtDollar(netMonthly) + "/mo";       rNetIncome.classList.remove("is-empty"); }
    if (rAvailable)   { rAvailable.textContent    = fmtDollar(available) + "/mo";        rAvailable.classList.remove("is-empty"); }
  }

  function setEmpty() {
    bClear();
    _pdfData = null;
    if (btnExport) btnExport.disabled = true;
    if (rInsufficient) rInsufficient.classList.remove("show");
    [rBorrowPower, rRepayment, rNetIncome, rAvailable].forEach(function (el) {
      if (!el) return;
      el.textContent = "—";
      el.classList.add("is-empty");
    });
  }

  function setInsufficient(netMonthly, actualLiving) {
    _pdfData = null;
    if (btnExport) btnExport.disabled = true;
    if (rInsufficient) rInsufficient.classList.add("show");
    if (rBorrowPower) { rBorrowPower.textContent = "$0"; rBorrowPower.classList.remove("is-empty"); }
    if (rRepayment)   { rRepayment.textContent   = "—";  rRepayment.classList.add("is-empty"); }
    if (rNetIncome)   { rNetIncome.textContent   = fmtDollar(netMonthly) + "/mo"; rNetIncome.classList.remove("is-empty"); }
    if (rAvailable)   { rAvailable.textContent   = "—";  rAvailable.classList.add("is-empty"); }
  }

  /* ---- Employment type toggle ---- */
  function updateEmploymentType() {
    var isSelfEmployed = getRadio("employment") === "self-employed";
    if (paygFields)   paygFields.hidden   = isSelfEmployed;
    if (selfEmpPanel) selfEmpPanel.hidden = !isSelfEmployed;
    if (resultsMain)  resultsMain.hidden  = isSelfEmployed;
    if (isSelfEmployed) {
      bClear();
      _pdfData = null;
      if (btnExport) btnExport.disabled = true;
    } else {
      calculate();
    }
  }

  document.querySelectorAll('input[name="employment"]').forEach(function (radio) {
    radio.addEventListener("change", updateEmploymentType);
  });

  /* ---- Partner income toggle ---- */
  function updatePartnerVisibility() {
    var applicants = getRadio("applicants") || "single";
    if (fPartnerField) fPartnerField.hidden = (applicants !== "couple");
    calculate();
  }

  document.querySelectorAll('input[name="applicants"]').forEach(function (radio) {
    radio.addEventListener("change", updatePartnerVisibility);
  });

  var allInputs = [fGrossIncome, fPartnerIncome, fLiving, fRepayments, fCreditCard, fDependants];
  allInputs.forEach(function (el) {
    if (!el) return;
    el.addEventListener("input",  calculate);
    el.addEventListener("change", calculate);
  });
  document.querySelectorAll('input[name="purpose"]').forEach(function (radio) {
    radio.addEventListener("change", calculate);
  });

  if (fGrossIncome) {
    fGrossIncome.addEventListener("blur", function () {
      validateField("gross-income", getNum(fGrossIncome) > 0, "Please enter your gross annual income.");
    });
  }

  window.addEventListener("resize", function () {
    if (_bSegs && !_bAnimId) bAnimate();
  });

  updatePartnerVisibility();
  updateEmploymentType();
})();
