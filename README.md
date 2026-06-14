# Hart Lending — Website

A world-class, lead-generating marketing site for **Hart Lending**, a Sunshine Coast mortgage broking practice. Built as a **zero-build static site** (plain HTML, CSS, JS) — no framework, no build step, no `node_modules`. It deploys anywhere and loads fast.

## Pages
- `index.html` — Home (hero, trust bar, services, The Hart Difference, Borrowing Confidence Score, about teaser, testimonials, CTA)
- `services.html` — Services + How It Works timeline + enquiry form
- `about.html` — Brand story, values, team, lender panel
- `contact.html` — Contact form, sidebar, booking, FAQ

## View it locally
Just open `index.html` in a browser, or run a tiny static server (better — keeps relative paths and forms clean):

```bash
cd hart-lending
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Deploy
Drag the folder onto **Netlify**, or with **Vercel**:

```bash
npx vercel --prod
```

No configuration needed — it's static.

## Things to wire up before launch
These are intentionally left as easy one-line edits:

1. **Form delivery.** Each form has a `data-endpoint=""` attribute (in `services.html` and `contact.html`). Drop in a [Formspree](https://formspree.io) URL, a CRM/Mailchimp webhook, or your own endpoint. With it blank, forms still validate and show the success state (great for previewing). A honeypot field (`name="company"`) blocks basic spam bots.
2. **Booking link.** On `contact.html`, replace the "Book a Free Chat" `mailto:` link with your **Calendly / Cal.com** URL (or embed their widget).
3. **Social links.** Update the Instagram / Facebook / LinkedIn `href="#"` placeholders in `contact.html`.
4. **Photography.** Swap the `.media-fallback` placeholders (home about-teaser, team photo `initials`) for real warm, natural images. Save as WebP/AVIF in `assets/` and use `<img loading="lazy">`.
5. **Reviews count.** Update the Google reviews number/rating in `index.html` and the `aggregateRating` in its JSON-LD once live.
6. **Domain.** All canonical URLs / Open Graph / sitemap use `https://hartlending.com` — change if your domain differs.
7. **OG image.** Add `assets/og-image.jpg` (1200×630) for nice link previews.
8. **Analytics.** Add your GA4 + Microsoft Clarity snippets before `</head>`.

## Brand system (in `css/styles.css` as CSS variables)
- Deep Forest `#162626` · Sage `#7B8C6F` · Warm Cream `#F0EBE0` · Muted Sage `#8B9878` · Pale Sage `#C5D4BE` · White `#FFFFFF` · Dark Teal `#1C3030`
- Headings: Cormorant Garamond · Body: DM Sans

## Built in
Accessibility (WCAG-minded: semantic HTML, focus styles, ARIA, keyboard nav, `prefers-reduced-motion`), mobile-first responsive layout, sticky mobile CTA, scroll-reveal animations, inline form validation, JSON-LD (FinancialService, BreadcrumbList, FAQPage), sitemap + robots.
