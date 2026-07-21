/**
 * The analyzer. Pure function, no I/O.
 *
 * Design note on honesty: this engine reports what it can actually see and
 * states plainly what it cannot. A merchant acting on a false "all clear" is
 * worse off than one who got no report at all, so `blindSpots` is a first-class
 * part of the output rather than a footnote.
 */

import { SIGNATURES, STRUCTURAL_FLAGS } from './signatures.js';
import type {
  AnalysisInput,
  AnalysisReport,
  Finding,
  Severity,
  VendorSignature,
} from './types.js';

/** The date Shopify auto-upgrades Thank You / Order Status pages on non-Plus stores. */
export const AUTO_UPGRADE_DEADLINE = new Date('2026-08-26T00:00:00Z');

/**
 * Contribution of each severity to the risk score. Critical findings dominate
 * deliberately: one broken Google Ads conversion tag matters more to a merchant
 * than a dozen missing chat widgets.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
};

const MS_PER_DAY = 86_400_000;

/** Pull a short, readable snippet around a regex match for merchant recognition. */
function extractEvidence(haystack: string, pattern: RegExp): string | undefined {
  // Clone without /g so lastIndex state can't leak between calls.
  const flags = pattern.flags.replace('g', '');
  const match = new RegExp(pattern.source, flags).exec(haystack);
  if (!match) return undefined;

  const start = Math.max(0, match.index - 50);
  const end = Math.min(haystack.length, match.index + match[0].length + 50);
  const snippet = haystack.slice(start, end).replace(/\s+/g, ' ').trim();

  return `${start > 0 ? '…' : ''}${snippet}${end < haystack.length ? '…' : ''}`;
}

/** First pattern that matches, or undefined. */
function firstMatch(haystack: string, patterns: RegExp[]): RegExp | undefined {
  return patterns.find((p) => new RegExp(p.source, p.flags.replace('g', '')).test(haystack));
}

function extractAccountId(haystack: string, sig: VendorSignature): string | undefined {
  if (!sig.idPattern) return undefined;
  const flags = sig.idPattern.flags.replace('g', '');
  const match = new RegExp(sig.idPattern.source, flags).exec(haystack);
  if (!match) return undefined;
  // Prefer an explicit capture group; fall back to the whole match.
  return match[1] ?? match[0];
}

function toFinding(
  sig: VendorSignature,
  source: Finding['source'],
  haystack: string,
  matched: RegExp,
): Finding {
  return {
    vendorId: sig.id,
    vendorName: sig.name,
    category: sig.category,
    migration: sig.migration,
    impact: sig.impact,
    consequence: sig.consequence,
    remedy: sig.remedy,
    docs: sig.docs,
    source,
    accountId: extractAccountId(haystack, sig),
    evidence: extractEvidence(haystack, matched),
  };
}

function scan(haystack: string, sigs: VendorSignature[], source: Finding['source']): Finding[] {
  const found: Finding[] = [];
  for (const sig of sigs) {
    const matched = firstMatch(haystack, sig.patterns);
    if (matched) found.push(toFinding(sig, source, haystack, matched));
  }
  return found;
}

/** Every distinct account/tag ID present for a vendor, in document order. */
function collectAccountIds(haystack: string, sig: VendorSignature): string[] {
  if (!sig.idPattern) return [];

  const flags = sig.idPattern.flags.includes('g') ? sig.idPattern.flags : `${sig.idPattern.flags}g`;
  const re = new RegExp(sig.idPattern.source, flags);
  const ids = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    ids.add(match[1] ?? match[0]);
    // A zero-length match would loop forever otherwise.
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }

  return [...ids];
}

/**
 * Detect more than one distinct account for the same vendor.
 *
 * This is a different failure from the migration itself, and it is already
 * costing the merchant money today. The usual cause is an agency handover where
 * the previous pixel was never removed: both fire on every purchase, so
 * conversions are counted twice. Reported ROAS looks better than reality, and
 * bidding on that inflated number means overspending.
 *
 * Note this correctly ignores a single ID appearing several times — Google Ads
 * legitimately repeats its AW- identifier in both `config` and `send_to`.
 */
function detectDuplicateAccounts(haystack: string, sigs: VendorSignature[]): Finding[] {
  const findings: Finding[] = [];

  for (const sig of sigs) {
    if (!sig.idPattern) continue;
    if (!firstMatch(haystack, sig.patterns)) continue;

    const ids = collectAccountIds(haystack, sig);
    if (ids.length < 2) continue;

    const isAdConversion = sig.category === 'ad-conversion';

    findings.push({
      vendorId: `duplicate-${sig.id}`,
      vendorName: `Duplicate ${sig.name} accounts`,
      category: sig.category,
      migration: 'manual-review',
      impact: isAdConversion ? 'high' : 'medium',
      consequence: isAdConversion
        ? `${ids.length} different accounts are configured (${ids.join(', ')}). Both fire on every purchase, so conversions are counted more than once. Reported return on ad spend looks better than it is, and any bidding decision made on that number overspends. This is usually a leftover from an agency handover where the previous tag was never removed — and it is costing money now, independently of the migration.`
        : `${ids.length} different accounts are configured (${ids.join(', ')}). Events are being sent to all of them, so reports double-count and any downstream dashboard built on this data is wrong.`,
      remedy:
        'Confirm which account is the live one, then delete the others from Additional Scripts. If both are genuinely wanted, keep exactly one in the migrated setup and route the second deliberately — duplicated tags carried into the new pixel reproduce the double-counting rather than fixing it.',
      source: 'additional-scripts',
      accountId: ids.join(', '),
    });
  }

  return findings;
}

/**
 * Build the one-line verdict. Wording changes materially depending on whether
 * the store has already been upgraded, because "will break" and "has already
 * broken" demand different urgency from the merchant.
 */
function buildHeadline(
  findings: Finding[],
  counts: Record<Severity, number>,
  upgraded: boolean | undefined,
  daysUntil: number,
): string {
  if (findings.length === 0) {
    return upgraded === true
      ? 'No legacy tracking detected. Your order page is on the current checkout architecture.'
      : 'No legacy tracking detected in what we were able to scan.';
  }

  const critical = counts.critical;
  const noun = findings.length === 1 ? 'tracking script' : 'tracking scripts';

  if (upgraded === true) {
    return critical > 0
      ? `Your order page has already been upgraded — ${critical} critical ${critical === 1 ? 'tracker is' : 'trackers are'} no longer firing.`
      : `Your order page has already been upgraded — ${findings.length} legacy ${noun} no longer running.`;
  }

  if (daysUntil > 0) {
    return critical > 0
      ? `${findings.length} ${noun} will stop working in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} — ${critical} ${critical === 1 ? 'is' : 'are'} critical.`
      : `${findings.length} ${noun} will stop working in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}.`;
  }

  return critical > 0
    ? `The upgrade deadline has passed — ${critical} critical ${critical === 1 ? 'tracker is' : 'trackers are'} at risk of having silently stopped.`
    : `The upgrade deadline has passed — ${findings.length} legacy ${noun} at risk.`;
}

/**
 * State clearly what we could not determine. This is what stops the report
 * implying a clean bill of health we cannot actually support.
 */
function buildBlindSpots(input: AnalysisInput, findings: Finding[]): string[] {
  const spots: string[] = [];

  if (input.additionalScripts === undefined) {
    spots.push(
      'We could not read the legacy Additional Scripts field. Anything pasted directly into that box is NOT covered by this report — paste its contents in to complete the audit.',
    );
  } else if (input.additionalScripts.trim() === '') {
    spots.push('The Additional Scripts field was empty, so nothing there is at risk.');
  }

  if (input.scriptTags === undefined) {
    spots.push('We could not enumerate script tags registered by apps, so app-injected tracking is not covered.');
  }

  if (input.webPixels === undefined) {
    spots.push(
      'We could not enumerate installed web pixels, so we cannot confirm which replacements are already in place.',
    );
  }

  if (input.checkoutUpgraded === undefined) {
    spots.push(
      'We could not determine whether your Thank You / Order Status pages have already been upgraded, so timing is estimated from the platform-wide deadline.',
    );
  }

  if (findings.some((f) => f.migration === 'manual-review')) {
    spots.push(
      'At least one script could not be attributed to a known vendor. Externally hosted code can change without notice, so it needs a human to review it.',
    );
  }

  return spots;
}

export function analyze(input: AnalysisInput): AnalysisReport {
  const now = input.now ?? new Date();
  const daysUntilDeadline = Math.ceil(
    (AUTO_UPGRADE_DEADLINE.getTime() - now.getTime()) / MS_PER_DAY,
  );

  const findings: Finding[] = [];

  if (input.additionalScripts && input.additionalScripts.trim() !== '') {
    findings.push(...scan(input.additionalScripts, SIGNATURES, 'additional-scripts'));
    findings.push(...scan(input.additionalScripts, STRUCTURAL_FLAGS, 'additional-scripts'));
    findings.push(...detectDuplicateAccounts(input.additionalScripts, SIGNATURES));
  }

  for (const tag of input.scriptTags ?? []) {
    if (!tag.src) continue;
    findings.push(...scan(tag.src, SIGNATURES, 'script-tag'));
  }

  // Vendors already covered by an installed web pixel are not at risk from the
  // upgrade — suppressing them keeps the report focused on real exposure and
  // avoids nagging merchants about work they have already done.
  const coveredVendors = new Set(
    (input.webPixels ?? [])
      .map((p) => `${p.name ?? ''} ${JSON.stringify(p.settings ?? {})}`.toLowerCase())
      .flatMap((blob) => SIGNATURES.filter((s) => firstMatch(blob, s.patterns)).map((s) => s.id)),
  );

  // Dedupe: the same vendor found in several places is one problem, not several.
  // Keep the first occurrence, which is the highest-signal source.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    if (seen.has(f.vendorId)) return false;
    if (coveredVendors.has(f.vendorId) && f.source !== 'additional-scripts') return false;
    seen.add(f.vendorId);
    return true;
  });

  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  deduped.sort((a, b) => severityRank[a.impact] - severityRank[b.impact]);

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of deduped) counts[f.impact] += 1;

  const rawScore = deduped.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.impact], 0);
  const riskScore = Math.min(100, rawScore);

  return {
    riskScore,
    headline: buildHeadline(deduped, counts, input.checkoutUpgraded, daysUntilDeadline),
    findings: deduped,
    counts,
    daysUntilDeadline,
    deadlinePassed: daysUntilDeadline <= 0,
    blindSpots: buildBlindSpots(input, deduped),
  };
}
