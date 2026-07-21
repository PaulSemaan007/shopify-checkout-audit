/**
 * Core types for the PixelSentry audit engine.
 *
 * The engine is deliberately PURE: it takes a snapshot of a store's tracking
 * configuration and returns findings. It performs no I/O. That keeps the
 * valuable part — the classification knowledge — testable against fixtures and
 * independent of however we happen to acquire the data (Admin API, merchant
 * paste-in, or storefront inspection).
 */

/** How badly the merchant is hurt when this specific tracking breaks. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** What kind of job the detected script is doing. */
export type Category =
  | 'ad-conversion' // Bidding/optimization signal to an ad network
  | 'analytics' // Measurement and reporting
  | 'attribution' // Multi-touch attribution platforms
  | 'affiliate' // Partner/affiliate networks that pay on conversion
  | 'email-sms' // Post-purchase lifecycle messaging
  | 'reviews' // Review solicitation
  | 'loyalty' // Loyalty/referral programs
  | 'subscription' // Subscription management
  | 'session-recording' // Heatmaps/replay
  | 'support' // Helpdesk/chat widgets
  | 'personalization'
  | 'unknown';

/**
 * Where this tracking needs to end up after the Thank You / Order Status page
 * upgrade. Ordered roughly from cheapest to most expensive for the merchant.
 */
export type MigrationPath =
  /** Vendor ships an official Shopify app/app pixel. Install it; delete the script. */
  | 'app-pixel'
  /** Reimplement as a custom web pixel using analytics.subscribe(). */
  | 'custom-pixel'
  /**
   * Cannot live in a pixel. Web pixels run in a sandboxed iframe with no access
   * to the parent DOM, so anything that changes what the customer SEES on the
   * page needs a checkout UI extension instead.
   */
  | 'ui-extension'
  /** Depends on capabilities the new architecture does not expose at all. */
  | 'unsupported'
  /** Custom or unrecognised code. A human has to read it. */
  | 'manual-review'
  /** Detected, but unaffected by the upgrade. */
  | 'no-action';

export interface VendorSignature {
  id: string;
  /** Human-readable vendor name, as a merchant would recognise it. */
  name: string;
  category: Category;
  /** Any match marks this vendor as present. */
  patterns: RegExp[];
  /** Optional extractor for the account/tag/pixel ID, for the report. */
  idPattern?: RegExp;
  migration: MigrationPath;
  /** Impact if this silently stops firing. */
  impact: Severity;
  /** Plain-English explanation of what the merchant loses. Shown in the report. */
  consequence: string;
  /** Concrete next step. */
  remedy: string;
  /** Official documentation, where one exists. */
  docs?: string;
}

/** A script tag registered via the ScriptTag API. */
export interface ScriptTagInput {
  id?: string;
  src: string;
  displayScope?: string;
}

/** A web pixel already installed on the store. */
export interface WebPixelInput {
  id?: string;
  /** 'app' for app-owned pixels, 'custom' for merchant-authored ones. */
  type?: 'app' | 'custom';
  name?: string;
  settings?: Record<string, unknown>;
}

export interface AnalysisInput {
  /**
   * Raw contents of the legacy `Additional Scripts` box, if we can obtain it.
   * May be undefined when the API does not expose it and the merchant has not
   * pasted it in — the report degrades gracefully rather than failing.
   */
  additionalScripts?: string | undefined;
  scriptTags?: ScriptTagInput[] | undefined;
  webPixels?: WebPixelInput[] | undefined;
  /**
   * Whether the store's Thank You / Order Status pages are already on
   * Checkout Extensibility. undefined = unknown.
   */
  checkoutUpgraded?: boolean | undefined;
  /** Shopify plan, if known. Plus stores have a different deadline posture. */
  isPlus?: boolean | undefined;
  /** Analysis date, injected for deterministic testing. */
  now?: Date | undefined;
}

export interface Finding {
  vendorId: string;
  vendorName: string;
  category: Category;
  migration: MigrationPath;
  impact: Severity;
  consequence: string;
  remedy: string;
  docs?: string | undefined;
  /** Where we saw it. */
  source: 'additional-scripts' | 'script-tag' | 'web-pixel';
  /** Extracted account/tag ID, when we could find one. */
  accountId?: string | undefined;
  /** Trimmed snippet of the matching code, for merchant recognition. */
  evidence?: string | undefined;
}

export interface AnalysisReport {
  /** 0 (nothing at risk) to 100 (severe, broad breakage imminent). */
  riskScore: number;
  /** One-line verdict suitable for an email subject or dashboard header. */
  headline: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  /** Days until the Aug 26 2026 auto-upgrade. Negative once it has passed. */
  daysUntilDeadline: number;
  deadlinePassed: boolean;
  /**
   * Things the engine could not determine, stated plainly. We show these to the
   * merchant rather than implying a clean bill of health we cannot support.
   */
  blindSpots: string[];
}
