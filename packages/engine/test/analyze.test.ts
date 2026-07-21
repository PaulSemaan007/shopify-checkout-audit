import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze.js';

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
