import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze.js';
import { SIGNATURES, STRUCTURAL_FLAGS } from '../src/signatures.js';

/** Fixed clock so deadline assertions don't rot. 37 days before the cutover. */
const NOW = new Date('2026-07-20T00:00:00Z');

/**
 * A realistic Additional Scripts blob. This is the shape the box actually takes
 * on a mid-size DTC store that has been running for a few years: several ad
 * platforms, an affiliate network, an email platform, some session recording,
 * and one piece of hand-rolled DOM code nobody remembers adding.
 */
const REALISTIC_BLOB = `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-123456789"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-123456789');
  gtag('config', 'G-ABC1234567');
  gtag('event', 'conversion', {
    'send_to': 'AW-123456789/AbC-D_efG',
    'value': {{ checkout.total_price | divided_by: 100.0 }},
    'currency': '{{ checkout.currency }}',
    'transaction_id': '{{ checkout.order_number }}'
  });
</script>

<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});})(window,document,'script','dataLayer','GTM-ABCD123');</script>

<!-- Meta Pixel -->
<script>
  !function(f,b,e,v,n,t,s){...}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1234567890123456');
  fbq('track', 'Purchase', {value: {{ checkout.total_price | divided_by: 100.0 }}, currency: '{{ checkout.currency }}'});
</script>

<!-- Klaviyo -->
<script src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=ABC123"></script>
<script>
  var _learnq = _learnq || [];
  _learnq.push(['track', 'Placed Order', { '$value': {{ checkout.total_price }} }]);
</script>

<!-- ShareASale -->
<img src="https://www.shareasale.com/sale.cfm?amount={{ checkout.total_price }}&merchantID=12345" width="1" height="1">

<!-- Hotjar -->
<script>
  (function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
  h._hjSettings={hjid:1234567,hjsv:6};})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
</script>

<!-- Post-purchase survey banner (added by agency, 2021) -->
<script>
  var el = document.getElementById('main-content');
  if (el) { el.innerHTML += '<div class="survey">How did you hear about us?</div>'; }
</script>
`;

describe('analyze — realistic store', () => {
  const report = analyze({ additionalScripts: REALISTIC_BLOB, now: NOW });
  const ids = report.findings.map((f) => f.vendorId);

  it('detects the major ad platforms', () => {
    expect(ids).toContain('google-ads');
    expect(ids).toContain('ga4');
    expect(ids).toContain('gtm');
    expect(ids).toContain('meta-pixel');
  });

  it('detects the affiliate network, which creates commercial liability when it breaks', () => {
    expect(ids).toContain('shareasale');
    const finding = report.findings.find((f) => f.vendorId === 'shareasale');
    expect(finding?.impact).toBe('critical');
    expect(finding?.category).toBe('affiliate');
  });

  it('detects the email platform', () => {
    expect(ids).toContain('klaviyo');
  });

  it('flags Liquid checkout object usage as critical — the strongest breakage predictor', () => {
    const liquid = report.findings.find((f) => f.vendorId === 'liquid-checkout-object');
    expect(liquid).toBeDefined();
    expect(liquid?.impact).toBe('critical');
  });

  it('routes DOM manipulation to a UI extension, not a pixel', () => {
    const dom = report.findings.find((f) => f.vendorId === 'dom-manipulation');
    expect(dom).toBeDefined();
    // This distinction is the difference between a 20-minute fix and hiring a
    // developer, so getting it wrong would materially mislead the merchant.
    expect(dom?.migration).toBe('ui-extension');
  });

  it('marks session recording as unrecoverable rather than migratable', () => {
    const hotjar = report.findings.find((f) => f.vendorId === 'hotjar');
    expect(hotjar?.migration).toBe('unsupported');
  });

  it('extracts account IDs so the merchant recognises their own setup', () => {
    const googleAds = report.findings.find((f) => f.vendorId === 'google-ads');
    expect(googleAds?.accountId).toBe('AW-123456789');
    const meta = report.findings.find((f) => f.vendorId === 'meta-pixel');
    expect(meta?.accountId).toBe('1234567890123456');
  });

  it('sorts critical findings first', () => {
    const impacts = report.findings.map((f) => f.impact);
    const firstMedium = impacts.indexOf('medium');
    const lastCritical = impacts.lastIndexOf('critical');
    if (firstMedium !== -1 && lastCritical !== -1) {
      expect(lastCritical).toBeLessThan(firstMedium);
    }
  });

  it('produces a maxed risk score for a store this exposed', () => {
    expect(report.riskScore).toBe(100);
  });

  it('counts down to the deadline', () => {
    expect(report.daysUntilDeadline).toBe(37);
    expect(report.deadlinePassed).toBe(false);
  });

  it('writes a headline naming the stakes', () => {
    expect(report.headline).toMatch(/will stop working in 37 days/);
    expect(report.headline).toMatch(/critical/);
  });

  it('reports each finding with a consequence and a remedy', () => {
    for (const f of report.findings) {
      expect(f.consequence.length).toBeGreaterThan(20);
      expect(f.remedy.length).toBeGreaterThan(20);
    }
  });
});

describe('analyze — honesty about what it cannot see', () => {
  it('does not imply a clean bill of health when it read nothing', () => {
    const report = analyze({ now: NOW });
    expect(report.findings).toHaveLength(0);
    expect(report.riskScore).toBe(0);
    // The critical behaviour: an empty finding list must NOT read as "you're fine".
    expect(report.blindSpots.some((s) => /could not read the legacy Additional Scripts/i.test(s))).toBe(
      true,
    );
    expect(report.blindSpots.some((s) => /script tags/i.test(s))).toBe(true);
    expect(report.blindSpots.some((s) => /web pixels/i.test(s))).toBe(true);
  });

  it('confirms an empty scripts field as genuinely empty', () => {
    const report = analyze({ additionalScripts: '   ', now: NOW });
    expect(report.blindSpots.some((s) => /was empty/i.test(s))).toBe(true);
  });

  it('flags unattributed external scripts for human review', () => {
    const report = analyze({
      additionalScripts: '<script src="https://cdn.some-unknown-vendor.io/t.js"></script>',
      now: NOW,
    });
    expect(report.findings.some((f) => f.migration === 'manual-review')).toBe(true);
    expect(report.blindSpots.some((s) => /could not be attributed/i.test(s))).toBe(true);
  });
});

describe('analyze — already-upgraded stores', () => {
  it('reframes from future risk to present loss', () => {
    const report = analyze({
      additionalScripts: REALISTIC_BLOB,
      checkoutUpgraded: true,
      now: NOW,
    });
    expect(report.headline).toMatch(/already been upgraded/);
    expect(report.headline).toMatch(/no longer firing/);
    // This is the reframe that makes the product robust regardless of how many
    // stores have already migrated: if you migrated, you are already losing data.
    expect(report.riskScore).toBeGreaterThan(0);
  });

  it('gives a clean verdict when an upgraded store really has nothing legacy', () => {
    const report = analyze({
      additionalScripts: '',
      scriptTags: [],
      webPixels: [],
      checkoutUpgraded: true,
      now: NOW,
    });
    expect(report.findings).toHaveLength(0);
    expect(report.headline).toMatch(/No legacy tracking detected/);
  });
});

describe('analyze — deduplication and coverage', () => {
  it('reports a vendor once even when it appears in several places', () => {
    const report = analyze({
      additionalScripts: "fbq('init', '1234567890123456'); fbq('track', 'Purchase');",
      scriptTags: [{ src: 'https://connect.facebook.net/en_US/fbevents.js' }],
      now: NOW,
    });
    expect(report.findings.filter((f) => f.vendorId === 'meta-pixel')).toHaveLength(1);
  });

  it('detects tracking injected via script tags', () => {
    const report = analyze({
      scriptTags: [{ src: 'https://static.hotjar.com/c/hotjar-1234567.js' }],
      now: NOW,
    });
    expect(report.findings.map((f) => f.vendorId)).toContain('hotjar');
  });
});

describe('analyze — the scripts that cannot be migrated at all', () => {
  /**
   * This category is the product's whole differentiator: Shopify's own upgrade
   * guide lists scripts and suggests apps, but does not flag the ones with no
   * migration target. Anything that renders UI is in that group, because web
   * pixels are sandboxed and cannot draw.
   */
  const cannotBecomeAPixel = (id: string, scripts: string): void => {
    const report = analyze({ additionalScripts: scripts, now: NOW });
    const finding = report.findings.find((f) => f.vendorId === id);
    expect(finding, `expected to detect ${id}`).toBeDefined();
    expect(['ui-extension', 'unsupported']).toContain(finding!.migration);
  };

  it('flags a cookie consent banner', () => {
    cannotBecomeAPixel('consent-banner', '<script src="https://consent.cookiebot.com/uc.js"></script>');
  });

  it('flags a post-purchase survey', () => {
    // Often a store's only zero-party attribution, so losing it silently is
    // worse than losing a redundant ad pixel.
    cannotBecomeAPixel('post-purchase-survey', '<script src="https://ce.getfairing.com/f.js"></script>');
  });

  it('flags an A/B testing tool', () => {
    cannotBecomeAPixel('ab-testing', '<script src="https://cdn.optimizely.com/js/12345.js"></script>');
  });

  it('flags an order tracking widget', () => {
    cannotBecomeAPixel('order-tracking', '<script src="https://button.aftership.com/all.js"></script>');
  });

  it('flags a personalisation widget', () => {
    cannotBecomeAPixel('rebuy-nosto', '<script src="https://cdn.rebuyengine.com/onsite/js/rebuy.js"></script>');
  });

  it('flags a live chat widget', () => {
    cannotBecomeAPixel('tidio-crisp-tawk', '<script src="https://code.tidio.co/abc.js"></script>');
  });

  it('rates consent banner breakage above a chat widget', () => {
    // Consent affects other tags and carries compliance weight; a missing chat
    // bubble is cosmetic.
    const consent = SIGNATURES.find((s) => s.id === 'consent-banner')!;
    const chat = SIGNATURES.find((s) => s.id === 'tidio-crisp-tawk')!;
    expect(consent.impact).toBe('high');
    expect(chat.impact).toBe('low');
  });
});

describe('analyze — expanded vendor coverage', () => {
  it.each([
    ['Segment', 'segment', '<script src="https://cdn.segment.com/analytics.js/v1/KEY/analytics.min.js"></script>'],
    ['LinkedIn Insight', 'linkedin-insight', '<script>_linkedin_partner_id = "123456";</script>'],
    ['Hyros', 'hyros', '<script src="https://t.hyros.com/v1/lst/universal-script?ph=abc"></script>'],
    ['Omnisend', 'omnisend-drip-mailchimp', '<script>omnisend.push(["track","$placedOrder"]);</script>'],
    ['Okendo', 'okendo-stamped-loox', '<script src="https://cdn-static.okendo.io/reviews.js"></script>'],
    ['Mixpanel', 'product-analytics', '<script>mixpanel.track("Purchase");</script>'],
    ['Taboola', 'taboola-outbrain', '<script>_tfa.push({notify: "event", name: "purchase"});</script>'],
    ['post-purchase upsell', 'post-purchase-upsell', '<script src="https://cdn.reconvert.io/rc.js"></script>'],
  ])('detects %s', (_label, id, script) => {
    const report = analyze({ additionalScripts: script, now: NOW });
    expect(report.findings.map((f) => f.vendorId)).toContain(id);
  });

  it('gives every signature a consequence and a remedy worth reading', () => {
    for (const sig of [...SIGNATURES, ...STRUCTURAL_FLAGS]) {
      expect(sig.consequence.length, `${sig.id} consequence`).toBeGreaterThan(40);
      expect(sig.remedy.length, `${sig.id} remedy`).toBeGreaterThan(30);
    }
  });

  it('uses no duplicate signature ids', () => {
    const ids = [...SIGNATURES, ...STRUCTURAL_FLAGS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('analyze — structural failure patterns', () => {
  /**
   * These predict breakage regardless of vendor, and each fails silently — the
   * code stays on the page and simply stops executing, which is why merchants
   * discover it weeks later rather than immediately.
   */
  it('flags checkout step gating as critical', () => {
    const report = analyze({
      additionalScripts: `
        if (Shopify.Checkout.step === 'thank_you') {
          fbq('track', 'Purchase');
        }`,
      now: NOW,
    });

    const finding = report.findings.find((f) => f.vendorId === 'checkout-step-gating');
    expect(finding).toBeDefined();
    expect(finding?.impact).toBe('critical');
    // The remedy must say to delete the gate, not port it.
    expect(finding?.remedy).toMatch(/delete the step check/i);
  });

  it('warns that there is no purchase event, only checkout_completed', () => {
    const report = analyze({
      additionalScripts: "if (Shopify.Checkout.step === 'thank_you') { doThing(); }",
      now: NOW,
    });
    const finding = report.findings.find((f) => f.vendorId === 'checkout-step-gating');
    // The single most common migration bug.
    expect(finding?.remedy).toMatch(/not `?purchase`?/i);
  });

  it('flags a jQuery dependency as unrecoverable', () => {
    const report = analyze({
      additionalScripts: "$(document).ready(function(){ ga('send','pageview'); });",
      now: NOW,
    });

    const finding = report.findings.find((f) => f.vendorId === 'jquery-dependency');
    expect(finding).toBeDefined();
    // No page libraries exist in the sandbox, so this cannot be ported as-is.
    expect(finding?.migration).toBe('unsupported');
  });

  it('flags page lifecycle listeners as dead code in a pixel', () => {
    const report = analyze({
      additionalScripts:
        "document.addEventListener('DOMContentLoaded', function(){ fbq('track','Purchase'); });",
      now: NOW,
    });

    expect(report.findings.map((f) => f.vendorId)).toContain('dom-lifecycle');
  });

  it('flags order status URL references', () => {
    const report = analyze({
      additionalScripts: "var u = '{{ order.order_status_url }}';",
      now: NOW,
    });
    expect(report.findings.map((f) => f.vendorId)).toContain('checkout-step-gating');
  });
});

describe('analyze — duplicate accounts', () => {
  /**
   * A separate failure from the migration, and one that is already costing the
   * merchant money. Two pixels both fire, conversions double-count, reported
   * ROAS is inflated, and bids placed on that number overspend.
   */
  it('flags two different Meta pixel IDs', () => {
    const report = analyze({
      additionalScripts: `
        fbq('init', '1111111111111111');
        fbq('init', '2222222222222222');
        fbq('track', 'Purchase');`,
      now: NOW,
    });

    const dup = report.findings.find((f) => f.vendorId === 'duplicate-meta-pixel');
    expect(dup).toBeDefined();
    expect(dup?.impact).toBe('high');
    expect(dup?.accountId).toContain('1111111111111111');
    expect(dup?.accountId).toContain('2222222222222222');
    expect(dup?.consequence).toMatch(/counted more than once/i);
  });

  it('does NOT flag a single ID that legitimately appears twice', () => {
    // Google Ads repeats its AW- identifier in both config and send_to. Treating
    // that as a duplicate would fire on almost every correctly configured store.
    const report = analyze({
      additionalScripts: `
        gtag('config', 'AW-123456789');
        gtag('event', 'conversion', { 'send_to': 'AW-123456789/AbC-D_efG' });`,
      now: NOW,
    });

    expect(report.findings.find((f) => f.vendorId === 'duplicate-google-ads')).toBeUndefined();
  });

  it('flags two different Google Ads conversion accounts', () => {
    const report = analyze({
      additionalScripts: `
        gtag('config', 'AW-111111111');
        gtag('config', 'AW-222222222');`,
      now: NOW,
    });

    expect(report.findings.find((f) => f.vendorId === 'duplicate-google-ads')).toBeDefined();
  });

  it('flags two GA4 properties at lower severity than an ad platform', () => {
    const report = analyze({
      additionalScripts: `
        gtag('config', 'G-AAAAAAAAAA');
        gtag('config', 'G-BBBBBBBBBB');`,
      now: NOW,
    });

    const dup = report.findings.find((f) => f.vendorId === 'duplicate-ga4');
    expect(dup).toBeDefined();
    // Double-counted analytics is wrong data; double-counted ad conversions
    // actively misdirect spend.
    expect(dup?.impact).toBe('medium');
  });

  it('stays silent when a vendor is absent entirely', () => {
    const report = analyze({ additionalScripts: '<script>console.log(1);</script>', now: NOW });
    expect(report.findings.filter((f) => f.vendorId.startsWith('duplicate-'))).toHaveLength(0);
  });

  it('routes duplicates to manual review rather than guessing which to keep', () => {
    const report = analyze({
      additionalScripts: "fbq('init','1111111111111111'); fbq('init','2222222222222222');",
      now: NOW,
    });
    const dup = report.findings.find((f) => f.vendorId === 'duplicate-meta-pixel');
    // Only the merchant knows which account is live.
    expect(dup?.migration).toBe('manual-review');
  });
});

describe('analyze — after the deadline', () => {
  it('switches to past tense once the cutover has happened', () => {
    const report = analyze({
      additionalScripts: "gtag('event', 'conversion', {'send_to': 'AW-123456789'});",
      now: new Date('2026-09-15T00:00:00Z'),
    });
    expect(report.deadlinePassed).toBe(true);
    expect(report.daysUntilDeadline).toBeLessThan(0);
    expect(report.headline).toMatch(/deadline has passed/);
  });
});
