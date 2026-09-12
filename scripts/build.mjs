#!/usr/bin/env node
/**
 * build.mjs — собирает ОДИН самодостаточный HTML-файл в ./dist.
 *
 * Никаких bundlers: инлайним CSS и ESM-модули, вырезая import-строки.
 * На входе — 4 файла, на выходе — index.html, который можно открыть с флешки.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'app');
const OUT = join(ROOT, 'dist');

const stripImports = (js) =>
  js.replace(/^\s*import\s[^;]*?from\s*['"][^'"]+['"];?\s*$/gm, '').replace(/^\s*['"]use strict['"];\s*$/gm, '');

/** Убираем экспорты — в едином скоупе они не нужны. */
const stripExports = (js) => js.replace(/^export\s+(?=(function|const|let|var|class))/gm, '');

const human = (bytes) => `${(bytes / 1024).toFixed(1)} КиБ`;

const build = async () => {
  await mkdir(OUT, { recursive: true });

  const html = await readFile(join(SRC, 'index.html'), 'utf8');
  const css = await readFile(join(SRC, 'styles.css'), 'utf8');
  const libs = ['lib/markdown.js', 'lib/stats.js'];
  const [libCode, appCode] = await Promise.all([
    Promise.all(libs.map(async (f) => stripExports(stripImports(await readFile(join(SRC, f), 'utf8'))))),
    stripImports(await readFile(join(SRC, 'app.js'), 'utf8')),
  ]);

  const bundle = [
    '/* --- app/lib (сгенерировано scripts/build.mjs, не редактировать) --- */',
    ...libCode,
    '/* --- app.js --- */',
    appCode,
  ].join('\n');

  const single = html
    .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
    .replace(/\s*<script type="module" src="\.\/app\.js"><\/script>/, '')
    .replace(
      '</head>',
      `  <style>\n${css.trimEnd()}\n  </style>\n</head>`
    )
    .replace('</body>', `  <script>\n${bundle.trim()}\n  </script>\n</body>`);

  const target = join(OUT, 'index.html');
  await writeFile(target, single, 'utf8');

  const size = (await stat(target)).size;
  const gzip = gzipSync(single).length;
  console.log(`
  ✦ build → dist/index.html
    размер:      ${human(size)}
    gzip:        ${human(gzip)}
    инлайн:      CSS + ${libs.length + 1} JS-модуля
    зависимостей: 0
`);
};

build().catch((error) => {
  console.error('Сборка упала:', error);
  process.exit(1);
});
