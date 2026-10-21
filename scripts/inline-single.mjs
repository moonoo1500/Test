/**
 * Inlines the built assets into a single, self contained HTML document.
 *
 * Usage: node scripts/inline-single.mjs [outDir] [outFile]
 */
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'dist-single');
const outFile = resolve(process.argv[3] ?? join(outDir, 'liminal-drift.html'));
const indexPath = join(outDir, 'index.html');

if (!existsSync(indexPath)) {
  console.error(`[single] ${indexPath} not found — run "vite build --config vite.config.single.ts" first`);
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf8');

/** inlines every <link rel="stylesheet" href="..."> */
html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
  const match = /href=["']([^"']+)["']/i.exec(tag);
  if (!match) return tag;
  const cssPath = join(outDir, match[1].replace(/^\.?\//, ''));
  if (!existsSync(cssPath)) {
    console.warn(`[single] stylesheet ${match[1]} not found, keeping the tag`);
    return tag;
  }
  const css = readFileSync(cssPath, 'utf8').replace(/<\/style>/gi, '<\\/style>');
  return `<style>${css}</style>`;
});

/** inlines every <script src="..."> */
html = html.replace(/<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi, (tag, before, src, after) => {
  const jsPath = join(outDir, src.replace(/^\.?\//, ''));
  if (!existsSync(jsPath)) {
    console.warn(`[single] script ${src} not found, keeping the tag`);
    return tag;
  }
  const js = readFileSync(jsPath, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  // a classic script (no type=module) also runs from file:// on mobile browsers
  const attrs = `${before}${after}`.replace(/\stype=["'][^"']*["']/gi, '');
  return `<script${attrs}>${js}</script>`;
});

writeFileSync(outFile, html, 'utf8');

const size = Buffer.byteLength(html, 'utf8');
const leftovers = readdirSync(outDir).filter((f) => f !== 'index.html');

// the bundled assets are no longer needed
for (const file of leftovers) {
  rmSync(join(outDir, file), { recursive: true, force: true });
}

console.log(`[single] ${outFile} — ${(size / 1024).toFixed(0)} KB, single self contained document`);
