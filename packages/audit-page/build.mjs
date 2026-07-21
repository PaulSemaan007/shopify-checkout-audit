/**
 * Bundles the audit UI + the real engine into a single self-contained HTML file.
 *
 * The point of bundling rather than hand-copying the rules into the page is that
 * the shipped tool and the tested engine can never drift apart. Every rule the
 * page applies is covered by the engine's test suite.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [join(here, 'src/app.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text;

const template = await readFile(join(here, 'template.html'), 'utf8');

if (!template.includes('/*__APP_JS__*/')) {
  throw new Error('template.html is missing the /*__APP_JS__*/ injection point');
}

// Guard against breaking out of the <script> element.
if (js.includes('</script')) {
  throw new Error('Bundle contains a literal </script sequence; escape it before inlining.');
}

const html = template.replace('/*__APP_JS__*/', () => js);

await mkdir(join(here, 'dist'), { recursive: true });
await writeFile(join(here, 'dist/audit.html'), html, 'utf8');

console.log(`Built dist/audit.html — ${(html.length / 1024).toFixed(1)} KB (JS ${(js.length / 1024).toFixed(1)} KB)`);
