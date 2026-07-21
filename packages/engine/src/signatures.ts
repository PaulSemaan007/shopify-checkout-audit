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
    remedy:
      'Keep FullStory on the rest of the storefront and accept that the order page is now a blind spot. Do not spend developer time attempting a pixel-based replacement — the sandbox has no access to the page, so it cannot be done.',
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
  {
    id: 'intercom',
    name: 'Intercom messenger',
    category: 'support',
    patterns: [/intercom/i, /widget\.intercom\.io/i],
    migration: 'ui-extension',
    impact: 'low',
    consequence: 'The messenger disappears from the order status page, diverting post-purchase questions to email.',
    remedy: 'Accept the change on this page, or build a checkout UI extension.',
  },
  {
    id: 'tidio-crisp-tawk',
    name: 'Live chat widget (Tidio / Crisp / Tawk.to / LiveChat)',
    category: 'support',
    patterns: [/tidio/i, /crisp\.chat/i, /tawk\.to/i, /livechatinc/i, /drift\.com/i],
    migration: 'ui-extension',
    impact: 'low',
    consequence: 'The chat widget stops appearing on the order status page.',
    remedy: 'Accept the change, or use the vendor’s Shopify app if it supports checkout extensibility.',
  },

  // ---------------------------------------------------------------------------
  // Consent banners. These matter disproportionately: they render UI, so they
  // CANNOT become pixels, and merchants tend to assume anything privacy-related
  // is handled automatically.
  // ---------------------------------------------------------------------------
  {
    id: 'consent-banner',
    name: 'Cookie consent banner (Cookiebot / OneTrust / Osano / Termly / iubenda)',
    category: 'personalization',
    patterns: [
      /cookiebot/i,
      /onetrust/i,
      /osano/i,
      /termly/i,
      /iubenda/i,
      /cookieconsent/i,
      /cookieyes/i,
    ],
    migration: 'ui-extension',
    impact: 'high',
    consequence:
      'A hand-rolled consent banner stops rendering on the order page. Beyond the missing UI, this can break consent signalling for every other tag that depends on it — and in the EU/UK that has compliance implications, not just measurement ones.',
    remedy:
      'Do not attempt to rebuild this in a pixel; it renders UI and cannot work there. Use a Shopify consent app that integrates with the Customer Privacy API, which is the supported route and also carries consent into the checkout sandbox correctly.',
    docs: 'https://shopify.dev/docs/api/customer-privacy',
  },
  {
    id: 'consentmo-pandectes',
    name: 'Shopify consent app script (Consentmo / Pandectes)',
    category: 'personalization',
    patterns: [/consentmo/i, /pandectes/i, /gdpr.*consent/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence:
      'A manually pasted snippet from a consent app stops running. The app itself usually keeps working through its own integration, so this is often a leftover rather than a live dependency.',
    remedy:
      'Confirm the app is on its Checkout Extensibility integration, then delete this snippet — duplicated consent logic causes banners to double-fire.',
  },

  // ---------------------------------------------------------------------------
  // Post-purchase surveys. These live specifically on the Thank You page, which
  // is exactly the page being replaced, and they are pure UI.
  // ---------------------------------------------------------------------------
  {
    id: 'post-purchase-survey',
    name: 'Post-purchase survey (Fairing / Enquire / KnoCommerce / Grapevine)',
    category: 'personalization',
    patterns: [/fairing/i, /enquirelabs/i, /knocommerce/i, /grapevine.*survey/i, /getfairing/i],
    migration: 'ui-extension',
    impact: 'high',
    consequence:
      'Your "how did you hear about us?" survey stops appearing. This is often the only zero-party attribution a store has — the one source that survives iOS restrictions — so losing it silently degrades channel attribution in a way no ad platform will replace.',
    remedy:
      'Use the vendor’s official Shopify app, which renders through a supported checkout UI extension. A pixel cannot display a survey under any circumstances.',
  },

  // ---------------------------------------------------------------------------
  // Order tracking and post-purchase upsells — also Thank You / Order Status
  // page specific.
  // ---------------------------------------------------------------------------
  {
    id: 'order-tracking',
    name: 'Order tracking widget (AfterShip / Route / ParcelPanel / Track123)',
    category: 'personalization',
    patterns: [/aftership/i, /route\.com|routeapp/i, /parcelpanel/i, /track123/i, /rush.*tracking/i],
    migration: 'ui-extension',
    impact: 'medium',
    consequence:
      'The embedded tracking widget disappears from the order status page, so customers who came to check delivery status contact support instead.',
    remedy: 'Install the vendor’s Shopify app, which renders via a supported UI extension.',
  },
  {
    id: 'post-purchase-upsell',
    name: 'Post-purchase upsell (ReConvert / AfterSell / Zipify OCU)',
    category: 'personalization',
    patterns: [/reconvert/i, /aftersell/i, /zipify/i, /onecheckoutupsell/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Post-purchase offers stop rendering — direct, immediate revenue loss rather than a measurement gap. Note these apps also shift when checkout_completed fires, so their presence changes how your conversion tracking behaves.',
    remedy:
      'Use the vendor’s official app on its post-purchase extension. Remove any manual snippet; both running at once can double-charge or double-render offers.',
  },

  // ---------------------------------------------------------------------------
  // A/B testing — rewriting page content is the entire point, so none of it can
  // survive in a sandbox.
  // ---------------------------------------------------------------------------
  {
    id: 'ab-testing',
    name: 'A/B testing (Optimizely / VWO / Convert / Intelligems)',
    category: 'personalization',
    patterns: [/optimizely/i, /visualwebsiteoptimizer|vwo\.com/i, /convert\.com\/.*js/i, /intelligems/i],
    migration: 'unsupported',
    impact: 'medium',
    consequence:
      'Experiments stop running on the order page, and any test measuring post-purchase behaviour loses its exposure event — which quietly invalidates the results rather than obviously breaking them.',
    remedy:
      'Client-side experimentation cannot run in the pixel sandbox. Move post-purchase tests to a server-side or app-based approach, and treat any in-flight test spanning the upgrade as compromised.',
  },

  // ---------------------------------------------------------------------------
  // Product analytics and CDPs.
  // ---------------------------------------------------------------------------
  {
    id: 'segment',
    name: 'Segment (Twilio CDP)',
    category: 'analytics',
    patterns: [/segment\.com\/analytics\.js/i, /analytics\.track\s*\(/i, /cdn\.segment\.com/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence:
      'The Order Completed event stops reaching Segment — and because Segment fans out to every downstream destination, one break here can silently stop several tools at once.',
    remedy:
      'Rebuild the track call inside a custom pixel from the checkout_completed payload, or move to Segment’s server-side integration, which is more robust across changes like this one.',
  },
  {
    id: 'product-analytics',
    name: 'Product analytics (Mixpanel / Amplitude / Heap / PostHog)',
    category: 'analytics',
    patterns: [/mixpanel/i, /amplitude/i, /heap\.io|heapanalytics/i, /posthog/i],
    migration: 'custom-pixel',
    impact: 'medium',
    consequence: 'Purchase events stop reaching your product analytics, so funnel and cohort reports under-report conversions.',
    remedy: 'Rebuild the purchase event in a custom pixel subscribing to checkout_completed.',
  },
  {
    id: 'privacy-analytics',
    name: 'Privacy-focused analytics (Matomo / Plausible / Fathom)',
    category: 'analytics',
    patterns: [/matomo|piwik/i, /plausible\.io/i, /usefathom/i],
    migration: 'custom-pixel',
    impact: 'low',
    consequence: 'Order page views and goal completions stop being recorded.',
    remedy: 'Rebuild as a custom pixel, or accept the gap if the order page is not central to your reporting.',
  },

  // ---------------------------------------------------------------------------
  // Additional ad networks.
  // ---------------------------------------------------------------------------
  {
    id: 'linkedin-insight',
    name: 'LinkedIn Insight Tag',
    category: 'ad-conversion',
    patterns: [/_linkedin_partner_id/i, /snap\.licdn\.com/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'LinkedIn stops recording conversions, breaking campaign reporting and optimisation — usually significant for B2B stores.',
    remedy: 'Rebuild the conversion event in a custom pixel subscribing to checkout_completed.',
  },
  {
    id: 'taboola-outbrain',
    name: 'Native advertising (Taboola / Outbrain)',
    category: 'ad-conversion',
    patterns: [/taboola/i, /outbrain/i, /_tfa\b/],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'Native ad conversions stop being recorded, so spend continues against unreported results.',
    remedy: 'Rebuild the conversion tag inside a custom pixel and verify with a test order.',
  },
  {
    id: 'quora-nextdoor',
    name: 'Quora / Nextdoor pixel',
    category: 'ad-conversion',
    patterns: [/qp\s*\(|q\.quora\.com/i, /nextdoor.*pixel|ndp\s*\(/i],
    migration: 'custom-pixel',
    impact: 'medium',
    consequence: 'Conversions stop being attributed on these channels.',
    remedy: 'Rebuild in a custom pixel subscribing to checkout_completed.',
  },
  {
    id: 'amazon-attribution',
    name: 'Amazon Attribution tag',
    category: 'attribution',
    patterns: [/amazon-adsystem/i, /amazon.*attribution/i],
    migration: 'custom-pixel',
    impact: 'medium',
    consequence: 'Off-Amazon conversions stop being attributed, so DSP and sponsored-brand reporting under-counts.',
    remedy: 'Rebuild the tag in a custom pixel.',
  },

  // ---------------------------------------------------------------------------
  // Additional attribution platforms.
  // ---------------------------------------------------------------------------
  {
    id: 'hyros',
    name: 'Hyros',
    category: 'attribution',
    patterns: [/hyros/i, /t\.hyros\.com/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'Hyros loses purchase data, corrupting the attribution model used to allocate ad spend.',
    remedy: 'Rebuild the Hyros purchase call in a custom pixel, or use their supported Shopify integration.',
  },
  {
    id: 'rockerbox-wicked',
    name: 'Rockerbox / Wicked Reports',
    category: 'attribution',
    patterns: [/rockerbox/i, /wickedreports/i],
    migration: 'custom-pixel',
    impact: 'high',
    consequence: 'Conversion data stops flowing, so multi-touch attribution silently degrades while still producing confident-looking reports.',
    remedy: 'Rebuild in a custom pixel, or switch to the vendor’s server-side integration.',
  },

  // ---------------------------------------------------------------------------
  // Additional lifecycle, reviews, loyalty and subscriptions.
  // ---------------------------------------------------------------------------
  {
    id: 'omnisend-drip-mailchimp',
    name: 'Email marketing (Omnisend / Drip / Mailchimp / Sendlane)',
    category: 'email-sms',
    patterns: [/omnisend/i, /getdrip|drip\.com/i, /mailchimp|chimpstatic/i, /sendlane/i],
    migration: 'app-pixel',
    impact: 'high',
    consequence:
      'Order events stop reaching your email platform, so post-purchase flows, receipts and win-back campaigns stop triggering. This is direct revenue, not just reporting.',
    remedy: 'Verify the vendor’s official Shopify app is installed and tracking orders server-side, then remove the manual snippet.',
  },
  {
    id: 'okendo-stamped-loox',
    name: 'Reviews (Okendo / Stamped / Loox / Fera)',
    category: 'reviews',
    patterns: [/okendo/i, /stamped\.io/i, /loox\.io|loox\.app/i, /fera\.ai/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Review requests stop being triggered by orders, so review volume declines gradually and without an obvious cause.',
    remedy: 'Verify the vendor’s official app is installed and tracking orders.',
  },
  {
    id: 'rivo-growave',
    name: 'Loyalty (Rivo / Growave / Yotpo Loyalty)',
    category: 'loyalty',
    patterns: [/rivo\.io/i, /growave/i, /swellrewards/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Points stop being awarded on purchase, producing customer complaints and manual support work.',
    remedy: 'Verify the official app is installed and awarding points server-side.',
  },
  {
    id: 'referral',
    name: 'Referral programme (ReferralCandy / Friendbuy)',
    category: 'loyalty',
    patterns: [/referralcandy/i, /friendbuy/i],
    migration: 'custom-pixel',
    impact: 'medium',
    consequence: 'Referral conversions stop being credited, so advocates go unrewarded and the programme quietly stalls.',
    remedy: 'Use the vendor’s Shopify app where available, otherwise rebuild the conversion call in a custom pixel.',
  },
  {
    id: 'skio-loop-bold',
    name: 'Subscriptions (Skio / Loop / Bold)',
    category: 'subscription',
    patterns: [/skio/i, /loopsubscriptions|loopwork/i, /boldapps|bold.*subscription/i],
    migration: 'app-pixel',
    impact: 'medium',
    consequence: 'Subscription messaging or management links stop appearing on the order page.',
    remedy: 'Verify the app is on its Checkout Extensibility integration.',
  },
  {
    id: 'rebuy-nosto',
    name: 'Personalisation (Rebuy / Nosto / Dynamic Yield)',
    category: 'personalization',
    patterns: [/rebuyengine/i, /nosto/i, /dynamicyield/i],
    migration: 'ui-extension',
    impact: 'medium',
    consequence: 'Personalised recommendations stop rendering on the order page — a direct loss of post-purchase revenue.',
    remedy: 'Use the vendor’s official app with a supported checkout UI extension. Recommendations render UI and cannot live in a pixel.',
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
  {
    id: 'checkout-step-gating',
    name: 'Checkout step gating',
    category: 'unknown',
    patterns: [
      /Shopify\s*\.\s*Checkout\s*\.\s*step/i,
      /Shopify\s*\.\s*Checkout\s*\.\s*page/i,
      /Shopify\s*\.\s*Checkout\s*\.\s*OrderStatus/i,
      /['"]thank_you['"]/,
      /order_status_url/i,
    ],
    migration: 'custom-pixel',
    impact: 'critical',
    consequence:
      'This code checks which checkout step it is on before running — the classic `Shopify.Checkout.step === "thank_you"` guard. That object does not exist on the upgraded page, so the condition never becomes true and the script inside never executes. It fails completely and silently: no error, just a block of code that stops doing anything.',
    remedy:
      'Delete the step check entirely rather than porting it. In a custom pixel you subscribe to the `checkout_completed` event, which only fires at that point anyway — the gate becomes unnecessary rather than needing a replacement. Note the event is `checkout_completed`, not `purchase`; there is no `purchase` event in Shopify’s API and assuming there is is the single most common migration bug.',
    docs: 'https://shopify.dev/docs/api/web-pixels-api/standard-events/checkout_completed',
  },
  {
    id: 'jquery-dependency',
    name: 'jQuery dependency',
    category: 'unknown',
    patterns: [/\$\s*\(\s*document\s*\)/, /jQuery\s*\(/, /\$\s*\.\s*(ajax|get|post)\s*\(/],
    migration: 'unsupported',
    impact: 'high',
    consequence:
      'This code assumes jQuery is loaded on the page. Web pixels run in an isolated sandbox with no page libraries available, so every jQuery call throws immediately and the whole script dies at the first line that uses it — including any tracking further down the same block.',
    remedy:
      'Rewrite the logic in plain JavaScript using the event payload. Do not attempt to load jQuery inside the pixel: even if it loads, there is no DOM for it to operate on, so the rewrite is unavoidable.',
  },
  {
    id: 'dom-lifecycle',
    name: 'Page lifecycle event listener',
    category: 'unknown',
    patterns: [
      /DOMContentLoaded/i,
      /window\s*\.\s*onload/i,
      /addEventListener\s*\(\s*['"]load['"]/i,
      /\$\s*\(\s*function\s*\(/,
    ],
    migration: 'custom-pixel',
    impact: 'high',
    consequence:
      'This code waits for a page-load event before running. The pixel sandbox has no page lifecycle to wait for, so the listener never fires and everything inside it is dead code — again with no error to notice.',
    remedy:
      'Remove the wrapper and run the logic directly inside your `analytics.subscribe()` callback. The event firing is already the signal that the data is ready, which is what the load listener was standing in for.',
  },
];
