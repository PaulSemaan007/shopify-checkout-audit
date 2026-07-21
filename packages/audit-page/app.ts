/**
 * The audit page UI.
 *
 * Everything here runs in the visitor's browser. The page makes no network
 * requests of any kind — which is not incidental, it is the reason a merchant
 * or agency is willing to paste live tracking code into a stranger's tool.
 *
 * Multi-store is the point, not a bonus. Shopify's own upgrade guide already
 * classifies Additional Scripts — but one admin at a time. An agency with forty
 * clients cannot use it to answer "which of my clients should I worry about
 * first?", and that question is the whole reason this exists.
 */

import { analyze, AUTO_UPGRADE_DEADLINE } from '@pixelsentry/engine';
import type { AnalysisReport, Finding, MigrationPath, Severity } from '@pixelsentry/engine';

// The `<\/script>` escapes keep this sample from terminating the inlined
// <script> element it ships inside.
const SAMPLE = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-123456789"><\/script>
<script>
  gtag('config', 'AW-123456789');
  gtag('config', 'G-ABC1234567');
  gtag('event', 'conversion', {
    'send_to': 'AW-123456789/AbC-D_efG',
    'value': {{ checkout.total_price | divided_by: 100.0 }},
    'currency': '{{ checkout.currency }}',
    'transaction_id': '{{ checkout.order_number }}'
  });
<\/script>

<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});})(window,document,'script','dataLayer','GTM-ABCD123');<\/script>

<!-- Meta Pixel -->
<script>
  fbq('init', '1234567890123456');
  fbq('track', 'Purchase', {
    value: {{ checkout.total_price | divided_by: 100.0 }},
    currency: '{{ checkout.currency }}'
  });
<\/script>

<!-- Klaviyo -->
<script src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=ABC123"><\/script>
<script>
  var _learnq = _learnq || [];
  _learnq.push(['track', 'Placed Order', { '$value': {{ checkout.total_price }} }]);
<\/script>

<!-- ShareASale -->
<img src="https://www.shareasale.com/sale.cfm?amount={{ checkout.total_price }}&merchantID=12345" width="1" height="1">

<!-- Hotjar -->
<script>
  h._hjSettings={hjid:1234567,hjsv:6};
  (function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};})(window,document);
<\/script>

<!-- Post-purchase survey banner (added by agency, 2021) -->
<script>
  var el = document.getElementById('main-content');
  if (el) { el.innerHTML += '<div class="survey">How did you hear about us?</div>'; }
<\/script>`;

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const MIGRATION_LABEL: Record<MigrationPath, string> = {
  'app-pixel': 'Install the official app',
  'custom-pixel': 'Rebuild as a custom pixel',
  'ui-extension': 'Needs a UI extension',
  unsupported: 'Cannot be migrated',
  'manual-review': 'Needs manual review',
  'no-action': 'No action needed',
};

const MIGRATION_EFFORT: Record<MigrationPath, string> = {
  'app-pixel': 'Minutes',
  'custom-pixel': 'Developer task',
  'ui-extension': 'Rebuild required',
  unsupported: 'Not recoverable',
  'manual-review': 'Investigate',
  'no-action': '—',
};

/**
 * Scripts with no migration target at all. This is the number Shopify's own
 * guide does not give you, and the one that turns a tidy migration into a
 * quoted rebuild — so it gets its own column.
 */
function blockedCount(report: AnalysisReport): number {
  return report.findings.filter((f) => f.migration === 'ui-extension' || f.migration === 'unsupported')
    .length;
}

function band(score: number): string {
  return score >= 60 ? 'critical' : score >= 25 ? 'high' : score > 0 ? 'medium' : 'clear';
}

interface StoreEntry {
  id: number;
  label: string;
  scripts: string;
  upgraded: boolean;
}

interface StoreResult {
  label: string;
  report: AnalysisReport;
}

let entries: StoreEntry[] = [];
let nextId = 1;
/** Kept so the export buttons can render whatever is currently on screen. */
let lastResults: StoreResult[] = [];

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent, never innerHTML — this page handles pasted third-party code
  // and must never execute or inject it.
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// Input rows
// ---------------------------------------------------------------------------

function addStoreRow(entry: StoreEntry): void {
  const container = $('stores');
  const row = el('div', 'store-row');
  row.dataset['entryId'] = String(entry.id);

  const head = el('div', 'store-row-head');

  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'store-label';
  label.placeholder = `Store name or domain (e.g. client-${entry.id}.myshopify.com)`;
  label.value = entry.label;
  label.addEventListener('input', () => {
    entry.label = label.value;
  });

  const toggle = el('label', 'toggle') as HTMLLabelElement;
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = entry.upgraded;
  check.addEventListener('change', () => {
    entry.upgraded = check.checked;
  });
  toggle.appendChild(check);
  toggle.appendChild(document.createTextNode('already upgraded'));

  head.appendChild(label);
  head.appendChild(toggle);

  const remove = el('button', 'btn-remove', 'Remove') as HTMLButtonElement;
  remove.type = 'button';
  remove.addEventListener('click', () => {
    // Always leave one row, so the page never becomes unusable.
    if (entries.length <= 1) return;
    entries = entries.filter((e) => e.id !== entry.id);
    row.remove();
    syncRemoveButtons();
  });
  head.appendChild(remove);

  const textarea = document.createElement('textarea');
  textarea.spellcheck = false;
  textarea.placeholder = 'Paste the full contents of Additional Scripts here.';
  textarea.value = entry.scripts;
  textarea.addEventListener('input', () => {
    entry.scripts = textarea.value;
  });
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
  });

  row.appendChild(head);
  row.appendChild(textarea);
  container.appendChild(row);

  syncRemoveButtons();
}

/** Hide the remove control when there's only one row left. */
function syncRemoveButtons(): void {
  const buttons = $('stores').querySelectorAll<HTMLButtonElement>('.btn-remove');
  buttons.forEach((b) => {
    b.hidden = entries.length <= 1;
  });
}

function newEntry(): StoreEntry {
  const entry: StoreEntry = { id: nextId++, label: '', scripts: '', upgraded: false };
  entries.push(entry);
  addStoreRow(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderMeter(container: HTMLElement, score: number): void {
  container.replaceChildren();
  const SEGMENTS = 24;
  const lit = Math.round((score / 100) * SEGMENTS);
  for (let i = 0; i < SEGMENTS; i += 1) {
    const seg = el('span', 'seg');
    if (i < lit) {
      const ratio = i / SEGMENTS;
      seg.classList.add('on', ratio > 0.66 ? 'sev-critical' : ratio > 0.33 ? 'sev-high' : 'sev-medium');
    }
    container.appendChild(seg);
  }
}

function renderFinding(f: Finding, index: number): HTMLElement {
  const row = el('article', `finding sev-${f.impact}`);
  row.style.setProperty('--i', String(index));

  const head = el('header', 'finding-head');

  const left = el('div', 'finding-id');
  left.appendChild(el('span', 'sev-tag', SEVERITY_LABEL[f.impact]));
  left.appendChild(el('h3', 'finding-name', f.vendorName));
  if (f.accountId) left.appendChild(el('code', 'account', f.accountId));

  const right = el('div', 'finding-path');
  right.appendChild(el('span', 'path-label', MIGRATION_LABEL[f.migration]));
  right.appendChild(el('span', 'path-effort', MIGRATION_EFFORT[f.migration]));

  head.appendChild(left);
  head.appendChild(right);
  row.appendChild(head);

  const body = el('div', 'finding-body');

  const what = el('div', 'block');
  what.appendChild(el('span', 'block-label', 'What you lose'));
  what.appendChild(el('p', 'block-text', f.consequence));
  body.appendChild(what);

  const fix = el('div', 'block');
  fix.appendChild(el('span', 'block-label', 'What to do'));
  fix.appendChild(el('p', 'block-text', f.remedy));
  body.appendChild(fix);

  if (f.evidence) {
    const ev = el('div', 'block');
    ev.appendChild(el('span', 'block-label', 'Found in these scripts'));
    const pre = el('pre', 'evidence');
    pre.appendChild(el('code', undefined, f.evidence));
    ev.appendChild(pre);
    body.appendChild(ev);
  }

  if (f.docs) {
    const link = document.createElement('a');
    link.className = 'docs-link';
    link.href = f.docs;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Reference documentation →';
    body.appendChild(link);
  }

  row.appendChild(body);
  return row;
}

/** One store's full report: verdict, findings, blind spots. */
function renderReportBlock(report: AnalysisReport, heading?: string): HTMLElement {
  const wrap = el('section', 'report-block');

  if (heading !== undefined) wrap.appendChild(el('h2', 'store-heading', heading));

  const verdict = el('div', 'verdict');
  verdict.setAttribute('data-band', band(report.riskScore));

  const scoreBlock = el('div', 'score-block');
  scoreBlock.appendChild(el('span', 'score-value', String(report.riskScore)));
  const meter = el('div', 'meter');
  renderMeter(meter, report.riskScore);
  scoreBlock.appendChild(meter);
  scoreBlock.appendChild(el('span', 'score-caption', 'Exposure score'));

  const text = el('div', 'verdict-text');
  text.appendChild(el('h3', 'verdict-headline', report.headline));

  const tally = el('div', 'tally');
  (['critical', 'high', 'medium', 'low'] as Severity[]).forEach((sev) => {
    const n = report.counts[sev];
    if (n === 0) return;
    const chip = el('div', `tally-chip sev-${sev}`);
    chip.appendChild(el('span', 'tally-n', String(n)));
    chip.appendChild(el('span', 'tally-label', SEVERITY_LABEL[sev]));
    tally.appendChild(chip);
  });
  text.appendChild(tally);

  verdict.appendChild(scoreBlock);
  verdict.appendChild(text);
  wrap.appendChild(verdict);

  wrap.appendChild(el('h3', 'section-title', 'Findings'));
  const list = el('div', 'findings');
  if (report.findings.length === 0) {
    list.appendChild(el('p', 'empty', 'No known tracking vendors were found in what you pasted.'));
  } else {
    report.findings.forEach((f, i) => list.appendChild(renderFinding(f, i)));
  }
  wrap.appendChild(list);

  if (report.blindSpots.length > 0) {
    wrap.appendChild(el('h3', 'section-title', 'What this audit could not see'));
    const ul = el('ul', 'blind-list');
    report.blindSpots.forEach((s) => ul.appendChild(el('li', undefined, s)));
    wrap.appendChild(ul);
  }

  return wrap;
}

/** The cross-store triage table — the thing Shopify's admin cannot give you. */
function renderPortfolio(results: StoreResult[]): void {
  const container = $('portfolio');
  container.replaceChildren();
  container.hidden = false;

  container.appendChild(el('h2', 'section-title', 'Client list — worst first'));

  const scroll = el('div', 'portfolio-scroll');
  const table = document.createElement('table');
  table.className = 'portfolio-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const columns: Array<[string, boolean]> = [
    ['Store', false],
    ['Exposure', true],
    ['Critical', true],
    ["Can't migrate", true],
    ['Most urgent', false],
  ];
  for (const [name, numeric] of columns) {
    const th = document.createElement('th');
    th.textContent = name;
    if (numeric) th.className = 'num';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const sorted = [...results].sort((a, b) => b.report.riskScore - a.report.riskScore);

  for (const { label, report } of sorted) {
    const tr = document.createElement('tr');

    const store = document.createElement('td');
    store.appendChild(el('div', 'pf-store', label));
    tr.appendChild(store);

    const score = document.createElement('td');
    score.className = 'num';
    score.appendChild(el('span', `pf-score band-${band(report.riskScore)}`, String(report.riskScore)));
    tr.appendChild(score);

    const crit = document.createElement('td');
    crit.className = 'num';
    crit.textContent = String(report.counts.critical);
    tr.appendChild(crit);

    const blocked = blockedCount(report);
    const blockedCell = document.createElement('td');
    blockedCell.className = 'num';
    blockedCell.appendChild(
      el('span', blocked > 0 ? 'pf-blocked' : 'pf-blocked none', String(blocked)),
    );
    tr.appendChild(blockedCell);

    const top = document.createElement('td');
    // Findings are already sorted worst-first by the engine.
    top.appendChild(el('div', 'pf-top', report.findings[0]?.vendorName ?? '—'));
    tr.appendChild(top);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  scroll.appendChild(table);
  container.appendChild(scroll);

  const totalBlocked = results.reduce((n, r) => n + blockedCount(r.report), 0);
  const note = el(
    'p',
    'portfolio-note',
    totalBlocked > 0
      ? `${totalBlocked} script${totalBlocked === 1 ? '' : 's'} across these stores have no migration path at all — they cannot become pixels and need a UI extension or a replacement app. Budget developer time for those; everything else is configuration.`
      : 'Nothing in these stores is structurally blocked. Every finding has a migration path, so this is configuration work rather than a rebuild.',
  );
  container.appendChild(note);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Render the whole audit as Markdown.
 *
 * This is the agency workflow: triage a client list, then paste the result into
 * a client email, a ticket, or a proposal. Markdown survives that trip intact,
 * where a PDF or a screenshot doesn't — and it keeps the data on their machine
 * rather than routing it through a share link.
 */
function toMarkdown(results: StoreResult[]): string {
  const lines: string[] = [];
  const deadline = AUTO_UPGRADE_DEADLINE.toISOString().slice(0, 10);

  lines.push('# Shopify checkout tracking audit', '');
  lines.push(
    `Shopify replaces the Thank You and Order Status pages on non-Plus stores on ${deadline}. ` +
      'Scripts in the legacy Additional Scripts field are not migrated — they stop firing silently.',
    '',
  );

  if (results.length > 1) {
    lines.push('## Client list — worst first', '');
    lines.push('| Store | Exposure | Critical | Can\'t migrate | Most urgent |');
    lines.push('|---|---:|---:|---:|---|');
    for (const { label, report } of [...results].sort((a, b) => b.report.riskScore - a.report.riskScore)) {
      lines.push(
        `| ${label} | ${report.riskScore} | ${report.counts.critical} | ${blockedCount(report)} | ${
          report.findings[0]?.vendorName ?? '—'
        } |`,
      );
    }
    lines.push('');

    const totalBlocked = results.reduce((n, r) => n + blockedCount(r.report), 0);
    if (totalBlocked > 0) {
      lines.push(
        `**${totalBlocked} script${totalBlocked === 1 ? '' : 's'} across these stores have no migration path at all.** ` +
          'They cannot become pixels and need a UI extension or a replacement app. Budget developer time for those; ' +
          'everything else is configuration.',
        '',
      );
    }
  }

  for (const { label, report } of [...results].sort((a, b) => b.report.riskScore - a.report.riskScore)) {
    lines.push(`## ${label}`, '');
    lines.push(`**${report.headline}**`, '');
    lines.push(`Exposure score: ${report.riskScore}/100`, '');

    if (report.findings.length === 0) {
      lines.push('No known tracking vendors detected.', '');
    }

    for (const f of report.findings) {
      lines.push(`### ${f.vendorName}${f.accountId ? ` (\`${f.accountId}\`)` : ''}`, '');
      lines.push(`- **Severity:** ${SEVERITY_LABEL[f.impact]}`);
      lines.push(`- **Action:** ${MIGRATION_LABEL[f.migration]} — ${MIGRATION_EFFORT[f.migration]}`);
      lines.push('', `**What you lose.** ${f.consequence}`, '');
      lines.push(`**What to do.** ${f.remedy}`, '');
      if (f.docs) lines.push(`Reference: ${f.docs}`, '');
    }

    if (report.blindSpots.length > 0) {
      lines.push('**What this audit could not see**', '');
      for (const spot of report.blindSpots) lines.push(`- ${spot}`);
      lines.push('');
    }
  }

  lines.push('---', '');
  lines.push(
    'Generated with the Shopify checkout script audit — https://paulsemaan007.github.io/shopify-checkout-audit/',
  );

  return lines.join('\n');
}

async function copyMarkdown(results: StoreResult[]): Promise<void> {
  const status = $('copy-status');
  const markdown = toMarkdown(results);

  try {
    await navigator.clipboard.writeText(markdown);
    status.textContent = 'Copied';
  } catch {
    // Clipboard access can be denied or unavailable over insecure origins.
    // Fall back to a selection the user can copy manually rather than failing.
    const area = document.createElement('textarea');
    area.value = markdown;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.('copy') ?? false;
    area.remove();
    status.textContent = ok ? 'Copied' : 'Press Ctrl+C to copy';
  }

  window.setTimeout(() => {
    status.textContent = '';
  }, 2600);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function run(): void {
  const active = entries.filter((e) => e.scripts.trim() !== '');
  const detail = $('detail');
  const portfolio = $('portfolio');

  if (active.length === 0) {
    $('results').hidden = false;
    portfolio.hidden = true;
    $('toolbar').hidden = true;
    lastResults = [];
    detail.replaceChildren(
      el('p', 'empty', 'Paste the contents of at least one store’s Additional Scripts field, then run the audit.'),
    );
    return;
  }

  const results: StoreResult[] = active.map((entry, i) => ({
    label: entry.label.trim() || `Store ${i + 1}`,
    report: analyze({
      additionalScripts: entry.scripts,
      checkoutUpgraded: entry.upgraded ? true : undefined,
    }),
  }));

  lastResults = results;
  $('results').hidden = false;
  $('toolbar').hidden = false;
  detail.replaceChildren();

  if (results.length > 1) {
    renderPortfolio(results);
    const sorted = [...results].sort((a, b) => b.report.riskScore - a.report.riskScore);
    for (const { label, report } of sorted) {
      detail.appendChild(renderReportBlock(report, label));
    }
  } else {
    portfolio.hidden = true;
    detail.appendChild(renderReportBlock(results[0]!.report));
  }

  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initCountdown(): void {
  const days = Math.ceil((AUTO_UPGRADE_DEADLINE.getTime() - Date.now()) / 86_400_000);
  const node = $('countdown');
  if (days > 0) {
    node.textContent = `${days} ${days === 1 ? 'day' : 'days'} until auto-upgrade`;
  } else {
    node.textContent = 'Auto-upgrade date has passed';
    node.classList.add('past');
  }
}

function init(): void {
  initCountdown();
  newEntry();

  $('analyze').addEventListener('click', run);
  $('add-store').addEventListener('click', () => {
    newEntry();
  });

  $('copy-md').addEventListener('click', () => {
    if (lastResults.length > 0) void copyMarkdown(lastResults);
  });
  $('print').addEventListener('click', () => window.print());

  $('sample').addEventListener('click', () => {
    // Demonstrate the multi-store view, since that's the part that matters to
    // an agency and the part no other tool does.
    const first = entries[0]!;
    first.label = 'northbound.co';
    first.scripts = SAMPLE;

    const second = newEntry();
    second.label = 'harbourgoods.myshopify.com';
    second.scripts = "fbq('init', '9988776655443322');\nfbq('track', 'Purchase');";

    const third = newEntry();
    third.label = 'quietmakers.myshopify.com';
    third.scripts =
      "<script src=\"https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=XYZ789\"><\/script>";

    // Re-render rows so the pasted values appear.
    $('stores').replaceChildren();
    for (const entry of entries) addStoreRow(entry);

    run();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
