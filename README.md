# Shopify Checkout Script Audit

[![CI](https://github.com/PaulSemaan007/shopify-checkout-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/PaulSemaan007/shopify-checkout-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Which of your checkout scripts can't survive the 26 August 2026 upgrade?**

On 26 August 2026, Shopify auto-upgrades the Thank You and Order Status pages on every non-Plus
store. Anything in the legacy `Additional Scripts` field is *replaced, not migrated* — it stops
firing. Nothing errors. Orders keep arriving. Only the data goes wrong.

This is a static classifier for those scripts. Paste them in, find out what breaks and what
replaces it. It runs entirely in your browser — **no network requests, no signup, nothing
uploaded.**

### → [Run the audit](https://paulsemaan007.github.io/shopify-checkout-audit/)

---

## Why this exists when Shopify already has an upgrade guide

Shopify's built-in guide is good and you should use it. It lists your Additional Scripts,
categorises them, and recommends a matching app where one exists.

It does not tell you **which scripts have no migration path at all** — and that is the finding
that costs money.

Web pixels run in a sandboxed iframe with no access to the parent page. So anything that *renders*
something to the customer has no equivalent to migrate to:

| Script does this | Can it become a pixel? |
|---|---|
| Sends a conversion event | Yes — often an official app already does it |
| Reads order data via Liquid or `Shopify.checkout` | Rebuild against `checkout_completed` |
| Inserts a survey, banner, upsell, or trust badge | **No.** Needs a checkout UI extension |
| Records sessions / heatmaps | **No.** Not recoverable at all |

That third row is the difference between a twenty-minute fix and a quoted rebuild. Nothing else
maps a real store's scripts onto that wall, so people discover it after the deadline instead of
before it.

It also handles a whole client list at once. Shopify's guide is one admin at a time, which doesn't
help if you manage forty stores.

## What it knows

Roughly 50 vendor signatures across the categories that actually turn up in Additional Scripts:

- **Ad conversion** — Google Ads, GA4, GTM, Meta, TikTok, Microsoft Ads, Pinterest, Snapchat, X,
  Reddit, Criteo, LinkedIn, Taboola, Outbrain, Quora, Nextdoor, Amazon Attribution
- **Affiliate** — ShareASale, Awin, Impact, CJ, Rakuten, Refersion *(breakage here is a commercial
  dispute, not just a data gap: partners go unpaid and escalate)*
- **Attribution** — Triple Whale, Northbeam, Elevar, Hyros, Rockerbox, Wicked Reports
- **Analytics & CDP** — Segment, Mixpanel, Amplitude, Heap, PostHog, Matomo, Plausible, Fathom
- **Lifecycle** — Klaviyo, Attentive, Postscript, Omnisend, Drip, Mailchimp, Sendlane
- **Cannot be migrated** — consent banners (Cookiebot, OneTrust, Osano, Termly, iubenda),
  post-purchase surveys (Fairing, KnoCommerce, Grapevine), order tracking widgets (AfterShip,
  Route, ParcelPanel), personalisation (Rebuy, Nosto, Dynamic Yield), A/B testing (Optimizely,
  VWO, Convert, Intelligems), live chat, session recording
- **Reviews, loyalty, subscriptions** — Yotpo, Okendo, Stamped, Loox, Judge.me, Smile, LoyaltyLion,
  Rivo, Growave, Recharge, Skio, Loop, ReferralCandy, Friendbuy
- **Post-purchase upsells** — ReConvert, AfterSell, Zipify OCU *(these also change when
  `checkout_completed` fires, which quietly alters how your conversion tracking behaves)*

Plus structural flags that apply regardless of vendor: Liquid `checkout.*` usage, DOM manipulation,
and unattributed third-party scripts.

For each one it reports what you lose in business terms, not just that it exists:

> **Google Tag Manager container** — the entire container stops loading on the order page, and
> every tag inside it goes with it. One broken container can take down Google Ads, GA4, Meta,
> affiliate and partner tags simultaneously, with no visible symptom.

## For agencies

Add a row per client store and it ranks the whole list worst-first, with a **Can't migrate** column
so you know which clients need developer time budgeted rather than a config change.

**Copy report as Markdown** exports the whole thing — paste it straight into a client email, a
ticket, or a proposal. The data never leaves your machine; there's no share link and nothing is
uploaded.

## Accuracy and limits

The audit reads only what you paste. It cannot see scripts injected by installed apps — Shopify's
`scriptTags` API returns only tags created by the querying app, so no tool can enumerate another
app's tracking. It also cannot confirm whether any given tag is currently firing on your live
store; proving that requires watching real orders against real events over time.

Findings are reported with what the engine could *not* determine, deliberately, so an empty result
is never mistaken for a clean bill of health.

## Install and build

```bash
pnpm install
pnpm verify        # build + typecheck + 20 tests
pnpm build:site    # regenerates docs/index.html
```

The published page is a single self-contained HTML file: the classification engine is bundled into
it at build time rather than duplicated, so the shipped tool and the tested logic cannot drift.

## Structure

```
packages/engine/       Classification engine. Pure, no I/O, fully tested.
  src/signatures.ts    The knowledge base — vendors, consequences, migration paths.
  src/analyze.ts       Detection, scoring, and honest blind-spot reporting.
packages/audit-page/   Bundles the engine into one self-contained HTML file.
docs/index.html        The published page.
```

The engine is the interesting part and it's deliberately dependency-free and side-effect-free —
useful on its own if you're building something adjacent.

## Contributing

Missing a vendor, or seen a migration path reported wrongly? Open an issue with the script pattern
(redact your IDs) and what actually happened. Real-world failure cases are far more valuable here
than feature requests.

## Licence

MIT.
