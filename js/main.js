/* =========================================================================
   HART LENDING — Interactions
   Vanilla JS, no dependencies. Progressive enhancement, a11y-aware.
   ========================================================================= */
(function () {
  "use strict";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Header: transparent → solid on scroll ---- */
  var header = document.querySelector(".header");
  function onScroll() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    document.querySelectorAll(".mobile-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });
  }

  /* ---- Desktop nav dropdown: click / keyboard toggle ---- */
  var dropdownBtn = document.querySelector(".nav__dropdown-btn");
  var dropdownMenu = document.getElementById("calc-menu");
  var calcDropdown = document.getElementById("calc-dropdown");
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener("click", function () {
      var isOpen = dropdownMenu.classList.toggle("open");
      dropdownBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (calcDropdown && !calcDropdown.contains(e.target)) {
        dropdownMenu.classList.remove("open");
        dropdownBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dropdownMenu.classList.contains("open")) {
        dropdownMenu.classList.remove("open");
        dropdownBtn.setAttribute("aria-expanded", "false");
        dropdownBtn.focus();
      }
    });
  }

  /* ---- Mark Calculators dropdown active on calculator pages ---- */
  var calcPages = ["offset-calculator.html", "borrow-calculator.html"];
  var currentPage = window.location.pathname.split("/").pop() || "index.html";
  if (calcPages.indexOf(currentPage) !== -1) {
    if (calcDropdown) calcDropdown.classList.add("active");
    var menuLink = dropdownMenu ? dropdownMenu.querySelector('a[href="' + currentPage + '"]') : null;
    if (menuLink) menuLink.classList.add("active");
    document.querySelectorAll('.mobile-nav a[href="' + currentPage + '"]').forEach(function (a) {
      a.classList.add("active");
    });
  }

  /* ---- Scroll reveal via IntersectionObserver ---- */
  var reveals = document.querySelectorAll(".reveal");
  if (prefersReduced || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---- Confidence score meter animation ---- */
  var meter = document.querySelector(".score-meter");
  if (meter) {
    var fillBars = function () {
      meter.querySelectorAll(".score-bar i").forEach(function (bar) {
        bar.style.width = (bar.getAttribute("data-fill") || "70") + "%";
      });
    };
    if (prefersReduced || !("IntersectionObserver" in window)) {
      fillBars();
    } else {
      var mio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { fillBars(); mio.disconnect(); } });
      }, { threshold: 0.4 });
      mio.observe(meter);
    }
  }

  /* ---- Accordions ---- */
  document.querySelectorAll(".accordion__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".accordion__item");
      var panel = item.querySelector(".accordion__panel");
      var isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      panel.style.maxHeight = isOpen ? panel.scrollHeight + "px" : "0px";
    });
  });

  /* ---- Testimonial rotator (mobile single-view) ---- */
  // (Desktop shows a 3-up grid; no JS needed there.)

  /* ---- Form validation + AJAX submit ---- */
  function validateField(field) {
    var input = field.querySelector("input, select, textarea");
    if (!input) return true;
    var val = (input.value || "").trim();
    var ok = true;
    var msg = "";
    if (input.hasAttribute("required") && !val) {
      ok = false; msg = "This field is required.";
    } else if (input.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      ok = false; msg = "Please enter a valid email address.";
    } else if (input.type === "tel" && val && val.replace(/[^0-9]/g, "").length < 8) {
      ok = false; msg = "Please enter a valid phone number.";
    }
    var err = field.querySelector(".error");
    if (err) err.textContent = msg;
    field.classList.toggle("show-error", !ok);
    input.classList.toggle("invalid", !ok);
    input.setAttribute("aria-invalid", ok ? "false" : "true");
    return ok;
  }

  document.querySelectorAll("form[data-ajax]").forEach(function (form) {
    // inline validation as the user leaves a field
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
      // honeypot
      var hp = form.querySelector('input[name="company"]');
      if (hp && hp.value) return; // bot
      var fields = form.querySelectorAll(".field");
      var valid = true;
      fields.forEach(function (f) { if (!validateField(f)) valid = false; });
      if (!valid) {
        var firstBad = form.querySelector(".show-error input, .show-error select, .show-error textarea");
        if (firstBad) firstBad.focus();
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.innerHTML : "";
      if (btn) { btn.disabled = true; btn.innerHTML = "Sending…"; }

      var nameVal = (form.querySelector('[name="name"]') || {}).value || "there";
      var firstName = nameVal.trim().split(" ")[0] || "there";

      // ---- Submission target ----
      // Plug your endpoint into data-endpoint (Formspree / CRM webhook / Mailchimp).
      var endpoint = form.getAttribute("data-endpoint");

      function showSuccess() {
        var success = form.parentElement.querySelector(".form-success");
        if (success) {
          var nameSlot = success.querySelector("[data-name]");
          if (nameSlot) nameSlot.textContent = firstName;
          form.style.display = "none";
          success.classList.add("show");
          success.setAttribute("tabindex", "-1");
          success.focus();
        } else {
          if (btn) { btn.innerHTML = "Sent ✓"; }
        }
      }

      if (endpoint && /^https?:\/\//.test(endpoint)) {
        fetch(endpoint, {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: new FormData(form)
        }).then(function (r) {
          if (r.ok) { showSuccess(); }
          else throw new Error("bad response");
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          alert("Sorry — something went wrong sending your message. Please call or email us directly.");
        });
      } else {
        // No endpoint configured yet: simulate success so the UX is complete in preview.
        setTimeout(showSuccess, 600);
      }
    });
  });

  /* ---- Footer year ---- */
  var yr = document.querySelector("[data-year]");
  if (yr) yr.textContent = new Date().getFullYear();
})();
