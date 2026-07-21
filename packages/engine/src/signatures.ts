/**
 * Vendor signatures — the knowledge base at the heart of PixelSentry.
 *
 * Each entry answers three questions a merchant actually cares about:
 *   1. What is this bit of code?
 *   2. What do I lose, in money terms, if it silently stops firing?
 *   3. What specifically do I do about it?
 *
 * Migration path notes that inform the classifications below:
 *
 * - Web pixels run in a SANDBOXED iframe. They cannot touch the parent page's
 *   DOM. So anything that changes what the customer SEES cannot be a pixel —
 *   it needs a checkout UI extension. This distinction is the single most
 *   useful thing the engine tells a merchant, because it separates "20 minute
 *   fix" from "hire a developer".
 *
 * - Where a vendor ships an official Shopify app that installs its own app
 *   pixel, the correct advice is almost always "install the app and DELETE the
 *   hand-rolled script", because keeping both is the classic cause of
 *   double-counted conversions.
 */

import type { VendorSignature } from './types.js';

export const SIGNATURES: VendorSignature[] = [
  // ---------------------------------------------------------------------------
  // Ad network conversion tracking — highest impact. These directly drive
  // bidding algorithms, so breakage doesn't just lose reporting, it actively
  // degrades ad performance while spending real money.
  // ---------------------------------------------------------------------------
  {
    id: 'google-ads',
    name: 'Google Ads conversion tracking',
    category: 'ad-conversion',
    patterns: [
      /AW-\d{9,}/i,
      /googleadservices\.com\/pagead\/conversion/i,
      /gtag\s*\(\s*['"]event['"]\s*,\s*['"]conversion['"]/i,
      /google_conversion_id/i,
    ],
    idPattern: /AW-\d{9,}/i,
    migration: 'app-pixel',
    impact: 'critical',
    consequence:
      'Google Ads stops recording purchases. Smart Bidding and Performance Max lose the conversion signal they optimise against, so the algorithm keeps spending while flying blind. ROAS reporting silently goes to zero or undercounts, and campaigns are often paused or scaled down on the basis of numbers that were never real.',
    remedy:
      'Install the official Google & YouTube channel app, which registers its own app pixel and tracks purchases natively. Then DELETE this script — leaving both in place is the most common cause of double-counted conversions.',
    docs: 'https://apps.shopify.com/google',
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    category: 'analytics',
    patterns: [/G-[A-Z0-9]{8,}/, /googletagmanager\.com\/gtag\/js/i, /gtag\s*\(\s*['"]config['"]/i],
    idPattern: /G-[A-Z0-9]{8,}/,
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Purchase events stop reaching GA4. Ecommerce reports, channel attribution and any downstream Looker Studio dashboards under-report revenue. Historical comparisons break, which tends to be discovered weeks later during a monthly review.',
    remedy:
      'The Google & YouTube channel app handles GA4 purchase tracking. If you need custom parameters beyond what it sends, add a custom pixel subscribing to checkout_completed.',
    docs: 'https://apps.shopify.com/google',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager container',
    category: 'analytics',
    patterns: [/GTM-[A-Z0-9]{6,}/, /googletagmanager\.com\/gtm\.js/i, /dataLayer\s*\.\s*push/i],
    idPattern: /GTM-[A-Z0-9]{6,}/,
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'The entire GTM container stops loading on the order page — and every tag inside it goes with it. This is usually the worst single finding, because one broken container can take down Google Ads, GA4, Meta, affiliate and partner tags simultaneously, with no visible symptom.',
    remedy:
      'GTM cannot be dropped into the new order page as-is. Load it inside a custom pixel and rebuild the dataLayer from the checkout_completed event payload. Audit every tag in the container first — several are likely better replaced by native Shopify apps.',
    docs: 'https://shopify.dev/docs/api/web-pixels-api',
  },
  {
    id: 'meta-pixel',
    name: 'Meta (Facebook/Instagram) Pixel',
    category: 'ad-conversion',
    patterns: [
      /fbq\s*\(/,
      /connect\.facebook\.net\/[^/]+\/fbevents\.js/i,
      /facebook\.com\/tr\?id=/i,
    ],
    idPattern: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/,
    migration: 'app-pixel',
    impact: 'critical',
    consequence:
      'Meta stops receiving Purchase events. Ad set optimisation degrades, Advantage+ campaigns lose their training signal, and retargeting audiences built on purchasers stop refreshing — so you keep paying to re-target people who already bought.',
    remedy:
      'Install the official Facebook & Instagram app and enable its pixel plus the Conversions API. Delete the manual fbq snippet afterwards to avoid duplicate Purchase events inflating your reported ROAS.',
    docs: 'https://apps.shopify.com/facebook',
  },
  {
    id: 'tiktok-pixel',
    name: 'TikTok Pixel',
    category: 'ad-conversion',
    patterns: [/ttq\s*\.\s*(track|load|page)/i, /analytics\.tiktok\.com/i],
    migration: 'app-pixel',
    impact: 'critical',
    consequence:
      'TikTok stops recording CompletePayment events, so campaign optimisation and ROAS reporting break.',
    remedy: 'Install the official TikTok app, which registers its own app pixel. Remove the manual script.',
    docs: 'https://apps.shopify.com/tiktok',
  },
  {
    id: 'bing-uet',
    name: 'Microsoft Advertising UET tag',
    category: 'ad-conversion',
    patterns: [/uetq/i, /bat\.bing\.com\/bat\.js/i, /bat\.bing\.com\/action/i],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'Microsoft Ads (Bing) stops recording conversions, breaking bidding and revenue reporting on that channel.',
    remedy:
      'Use the Microsoft Channel app if it covers your setup, otherwise rebuild the UET purchase event inside a custom pixel from the checkout_completed payload.',
    docs: 'https://apps.shopify.com/microsoft-channel',
  },
  {
    id: 'pinterest-tag',
    name: 'Pinterest Tag',
    category: 'ad-conversion',
    patterns: [/pintrk\s*\(/, /s\.pinimg\.com\/ct\/core\.js/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Pinterest stops recording checkout conversions, degrading campaign optimisation and ROAS reporting.',
    remedy: 'Install the official Pinterest app and remove the manual tag.',
    docs: 'https://apps.shopify.com/pinterest',
  },
  {
    id: 'snapchat-pixel',
    name: 'Snapchat Pixel',
    category: 'ad-conversion',
    patterns: [/snaptr\s*\(/, /sc-static\.com\/scevent\.min\.js/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Snapchat stops recording PURCHASE events, breaking optimisation and reported return on ad spend.',
    remedy: 'Install the official Snapchat Ads app and remove the manual pixel.',
    docs: 'https://apps.shopify.com/snapchat-ads',
  },
  {
    id: 'twitter-pixel',
    name: 'X (Twitter) conversion tracking',
    category: 'ad-conversion',
    patterns: [/twq\s*\(/, /static\.ads-twitter\.com\/uwt\.js/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'X stops recording purchase conversions, so campaign reporting and optimisation break.',
    remedy: 'Rebuild the conversion event in a custom pixel subscribing to checkout_completed.',
  },
  {
    id: 'reddit-pixel',
    name: 'Reddit Pixel',
    category: 'ad-conversion',
    patterns: [/rdt\s*\(/, /redditstatic\.com\/ads\/pixel\.js/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'Reddit stops recording Purchase events, breaking conversion reporting and campaign optimisation.',
    remedy: 'Rebuild the Purchase event in a custom pixel subscribing to checkout_completed.',
  },
  {
    id: 'criteo',
    name: 'Criteo OneTag',
    category: 'ad-conversion',
    patterns: [/criteo/i, /dynamic\.criteo\.com/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Criteo stops receiving transaction data, which breaks both retargeting audiences and the commission/performance reporting the spend is billed against.',
    remedy: 'Use the official Criteo app where available, otherwise rebuild the sale tag in a custom pixel.',
  },

  // ---------------------------------------------------------------------------
  // Affiliate networks — distinctive because breakage causes a COMMERCIAL
  // dispute, not just bad data. Partners stop getting credited, escalate, and
  // may drop the merchant entirely.
  // ---------------------------------------------------------------------------
  {
    id: 'shareasale',
    name: 'ShareASale affiliate tracking',
    category: 'affiliate',
    patterns: [/shareasale/i, /shareasale\.com\/sale\.cfm/i],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'Affiliate sales stop being credited. Partners who drove real revenue go unpaid, raise disputes, and often leave the programme. Unlike an analytics gap this creates a direct commercial liability, and reconciling it after the fact is painful and manual.',
    remedy:
      'Rebuild the ShareASale conversion pixel inside a custom pixel using order total, order ID and currency from the checkout_completed event. Verify with a live test order before the changeover.',
  },
  {
    id: 'awin',
    name: 'Awin affiliate tracking',
    category: 'affiliate',
    patterns: [/awin/i, /dwin1\.com/i, /AWIN\.Tracking/i],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'Awin stops crediting affiliate-driven orders. Publishers go unpaid, disputes follow, and partners commonly deprioritise or drop the programme.',
    remedy: 'Rebuild the Awin conversion tag in a custom pixel and confirm with a test transaction.',
  },
  {
    id: 'impact-radius',
    name: 'Impact.com affiliate/partner tracking',
    category: 'affiliate',
    patterns: [/impactcdn\.com/i, /utt\.impactcdn\.com/i, /ire\s*\(/],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'Partner conversions stop being attributed, so partners are underpaid and the programme quietly degrades.',
    remedy: 'Rebuild the Impact conversion call inside a custom pixel and verify with a test order.',
  },
  {
    id: 'cj-affiliate',
    name: 'CJ Affiliate (Commission Junction)',
    category: 'affiliate',
    patterns: [/emjcd\.com/i, /cj\.com\/tags/i, /cjevent/i],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence: 'CJ stops recording sales, so publishers go uncredited and unpaid, creating disputes.',
    remedy: 'Rebuild the CJ conversion tag in a custom pixel and verify with a test order.',
  },
  {
    id: 'rakuten',
    name: 'Rakuten Advertising',
    category: 'affiliate',
    patterns: [/linksynergy/i, /rakuten.*track/i, /tag\.rmp\.rakuten\.com/i],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence: 'Rakuten stops crediting affiliate orders, leading to unpaid publishers and disputes.',
    remedy: 'Rebuild the Rakuten conversion tag in a custom pixel and verify with a test order.',
  },
  {
    id: 'refersion',
    name: 'Refersion affiliate tracking',
    category: 'affiliate',
    patterns: [/refersion/i, /pub\.refersion\.com/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Affiliate and ambassador conversions stop being tracked, so partners go uncredited.',
    remedy: 'Install the official Refersion app, which handles order tracking natively, then remove the manual script.',
    docs: 'https://apps.shopify.com/refersion',
  },

  // ---------------------------------------------------------------------------
  // Attribution platforms — merchants pay these specifically to be the source
  // of truth, so a silent gap is doubly damaging.
  // ---------------------------------------------------------------------------
  {
    id: 'triple-whale',
    name: 'Triple Whale',
    category: 'attribution',
    patterns: [/triplewhale/i, /TriplePixel/i, /triplepixel/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Triple Whale loses purchase data, so the attribution dashboard the team makes daily spend decisions from becomes wrong — while still looking authoritative.',
    remedy: 'Ensure the official Triple Whale app is installed and its pixel is active; remove the manual snippet.',
    docs: 'https://apps.shopify.com/triple-whale',
  },
  {
    id: 'northbeam',
    name: 'Northbeam',
    category: 'attribution',
    patterns: [/northbeam/i, /j\.northbeam\.io/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Northbeam loses conversion data, corrupting the multi-touch attribution model used to allocate budget.',
    remedy: 'Install/verify the official Northbeam app and remove the manual script.',
  },
  {
    id: 'elevar',
    name: 'Elevar',
    category: 'attribution',
    patterns: [/elevar/i, /shopify-gtm-suite/i, /getelevar\.com/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Elevar stops relaying server-side conversion data to downstream destinations, which can break several ad platforms at once.',
    remedy: 'Verify the Elevar app is installed and migrated to its Checkout Extensibility configuration.',
    docs: 'https://apps.shopify.com/elevar',
  },

  // ---------------------------------------------------------------------------
  // Lifecycle messaging — breakage here stops revenue-generating flows.
  // ---------------------------------------------------------------------------
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    category: 'email-sms',
    patterns: [/klaviyo/i, /_learnq/i, /static\.klaviyo\.com/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Klaviyo stops receiving Placed Order events. Post-purchase flows, review requests and replenishment reminders stop sending, and customer profiles go stale — a direct, measurable revenue loss.',
    remedy: 'The official Klaviyo app tracks orders server-side. Confirm the integration is active and remove the manual snippet.',
    docs: 'https://apps.shopify.com/klaviyo-email-marketing',
  },
  {
    id: 'attentive',
    name: 'Attentive',
    category: 'email-sms',
    patterns: [/attentive/i, /cdn\.attn\.tv/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Attentive stops recording purchases, so SMS post-purchase and win-back journeys stop firing correctly.',
    remedy: 'Verify the official Attentive app is installed and handling order events.',
  },
  {
    id: 'postscript',
    name: 'Postscript',
    category: 'email-sms',
    patterns: [/postscript/i, /sdk\.postscript\.io/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence: 'Postscript stops recording orders, breaking SMS automations tied to purchase behaviour.',
    remedy: 'Verify the official Postscript app is installed and receiving order events.',
  },

  // ---------------------------------------------------------------------------
  // Reviews / loyalty / subscriptions — real but less acute.
  // ---------------------------------------------------------------------------
  {
    id: 'yotpo',
    name: 'Yotpo',
    category: 'reviews',
    patterns: [/yotpo/i, /staticw2\.yotpo\.com/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Review request emails stop being triggered by orders, so review volume quietly declines over time.',
    remedy: 'Verify the official Yotpo app is installed and tracking orders.',
  },
  {
    id: 'judgeme',
    name: 'Judge.me',
    category: 'reviews',
    patterns: [/judge\.me/i, /judgeme/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Post-purchase review requests stop being triggered, reducing review collection.',
    remedy: 'Verify the official Judge.me app is installed; it tracks orders natively.',
  },
  {
    id: 'smile-io',
    name: 'Smile.io loyalty',
    category: 'loyalty',
    patterns: [/smile\.io/i, /smileio/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Loyalty points stop being awarded on purchase, which generates customer complaints and manual support work.',
    remedy: 'Verify the official Smile.io app is installed and awarding points server-side.',
  },
  {
    id: 'loyaltylion',
    name: 'LoyaltyLion',
    category: 'loyalty',
    patterns: [/loyaltylion/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Loyalty points stop accruing on orders, causing customer complaints and support load.',
    remedy: 'Verify the official LoyaltyLion app is installed and handling order events.',
  },
  {
    id: 'recharge',
    name: 'Recharge subscriptions',
    category: 'subscription',
    patterns: [/rechargepayments/i, /recharge.*subscription/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Subscription post-purchase messaging or upsell prompts may stop appearing on the order page.',
    remedy: 'Verify the Recharge app is on its Checkout Extensibility integration.',
  },

  // ---------------------------------------------------------------------------
  // Session recording — note these are often outright unsupported, because
  // replay fundamentally requires DOM access the sandbox does not grant.
  // ---------------------------------------------------------------------------
  {
    id: 'hotjar',
    name: 'Hotjar',
    category: 'session-recording',
    patterns: [/hotjar/i, /static\.hotjar\.com/i, /_hjSettings/i],
    migration: 'unsupported',
    impact: 'low',
    consequence:
      'Session recording and heatmaps stop working on the order page. Note this cannot be restored: web pixels are sandboxed and cannot capture the parent page DOM.',
    remedy:
      'Accept the loss of order-page recordings, or move the analysis upstream to pages you can still instrument. Do not spend developer time attempting to recreate this in a pixel — it is not possible.',
  },
  {
    id: 'clarity',
    name: 'Microsoft Clarity',
    category: 'session-recording',
    patterns: [/clarity\.ms/i, /clarity\s*\(/],
    migration: 'unsupported',
    impact: 'low',
    consequence: 'Session recordings and heatmaps stop on the order page and cannot be reinstated inside a sandboxed pixel.',
    remedy: 'Accept the gap on this page; keep Clarity running on the rest of the storefront.',
  },
  {
    id: 'fullstory',
    name: 'FullStory',
    category: 'session-recording',
    patterns: [/fullstory/i, /fs\.js/i, /FS\.identify/i],
    migration: 'unsupported',
    impact: 'low',
    consequence: 'Session replay stops on the order page and cannot be reproduced within the pixel sandbox.',
    remedy: 'Accept the gap on this page.',
  },

  // ---------------------------------------------------------------------------
  // Support widgets — usually low impact, but merchants panic when the chat
  // bubble vanishes, so it is worth naming explicitly.
  // ---------------------------------------------------------------------------
  {
    id: 'gorgias',
    name: 'Gorgias chat',
    category: 'support',
    patterns: [/gorgias/i],
    migration: 'ui-extension',
    impact: 'low',
    consequence: 'The chat widget disappears from the order status page, so post-purchase questions divert to email.',
    remedy: 'Use the Gorgias app’s supported integration, or accept the widget being absent from this page.',
  },
  {
    id: 'zendesk',
    name: 'Zendesk widget',
    category: 'support',
    patterns: [/zendesk/i, /zdassets\.com/i],
    migration: 'ui-extension',
    impact: 'low',
    consequence: 'The support widget stops rendering on the order status page.',
    remedy: 'Accept the change, or implement a supported checkout UI extension.',
  },
];

/**
 * Structural red flags — patterns that indicate code which CANNOT simply be
 * lifted into a pixel, regardless of vendor. These are what turn a "swap in the
 * app" job into "budget for a developer", so surfacing them early is the most
 * financially useful thing the report does.
 */
export const STRUCTURAL_FLAGS: VendorSignature[] = [
  {
    id: 'liquid-checkout-object',
    name: 'Liquid checkout object usage',
    category: 'unknown',
    patterns: [
      /\{\{\s*checkout\./i,
      /\{\%\s*if\s+checkout/i,
      /\{\{\s*order\./i,
      /Shopify\s*\.\s*checkout/i,
    ],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'This code reads order data through Liquid or the Shopify.checkout JavaScript object. Neither exists on the upgraded page. Any script depending on them fails immediately and completely — this is the single most reliable predictor that something will break on Aug 26.',
    remedy:
      'Rewrite to read from the checkout_completed event payload inside a custom pixel (event.data.checkout gives totals, line items, currency and order ID). The field names differ from the Liquid object, so map them explicitly rather than assuming.',
    docs: 'https://shopify.dev/docs/api/web-pixels-api/standard-events/checkout_completed',
  },
  {
    id: 'dom-manipulation',
    name: 'DOM manipulation on the order page',
    category: 'personalization',
    patterns: [
      /document\s*\.\s*(getElementById|querySelector|getElementsBy)/i,
      /\.innerHTML\s*=/i,
      /document\s*\.\s*write\s*\(/i,
      /\$\s*\(\s*['"]#/,
      /\.appendChild\s*\(/i,
    ],
    migration: 'ui-extension',
    impact: 'high',
    consequence:
      'This code modifies what the customer sees on the page — inserting banners, surveys, upsells or custom messaging. Web pixels run in a sandboxed iframe with no access to the parent DOM, so this CANNOT be migrated to a pixel under any circumstances.',
    remedy:
      'Rebuild as a checkout UI extension, or replace with an app that provides the same capability natively. Budget developer time for this one — it is genuinely a rebuild, not a copy-paste.',
    docs: 'https://shopify.dev/docs/api/checkout-ui-extensions',
  },
  {
    id: 'external-script-load',
    name: 'Third-party script loaded by URL',
    category: 'unknown',
    patterns: [/<script[^>]+src\s*=/i, /createElement\s*\(\s*['"]script['"]\s*\)/i],
    migration: 'manual-review',
    impact: 'medium',
    consequence:
      'An external script is loaded on the order page. Whether it survives depends entirely on what it does — and because the code lives on someone else’s server, its behaviour can change without notice.',
    remedy:
      'Identify the vendor and check whether they publish a Shopify app or an official web pixel. If neither exists, the script needs manual reimplementation inside a custom pixel.',
  },
];
