import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, escapeHtml, isSafeUrl, slugify } from '../app/lib/markdown.js';

test('escapeHtml: экранирует опасные символы', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
});

test('пустой вход даёт пустой выход', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown('   \n  '), '');
  assert.equal(renderMarkdown(undefined), '');
});

test('абзацы и перенос строк', () => {
  assert.equal(renderMarkdown('привет'), '<p>привет</p>');
  assert.match(renderMarkdown('раз\nдва'), /<p>раз<br>два<\/p>/);
  assert.match(renderMarkdown('раз\n\nдва'), /<p>раз<\/p>\n<p>два<\/p>/);
});

test('заголовки всех шести уровней', () => {
  for (let level = 1; level <= 6; level += 1) {
    const hashes = '#'.repeat(level);
    assert.equal(renderMarkdown(`${hashes} Title`), `<h${level} id="title">Title</h${level}>`);
  }
});

test('заголовок: хэши в конце обрезаются', () => {
  assert.match(renderMarkdown('## Заголовок ##'), /^<h2 id="заголовок">Заголовок<\/h2>$/);
});

test('инлайн-разметка', () => {
  assert.match(renderMarkdown('**bold**'), /<strong>bold<\/strong>/);
  assert.match(renderMarkdown('*em*'), /<em>em<\/em>/);
  assert.match(renderMarkdown('_em_'), /<em>em<\/em>/);
  assert.match(renderMarkdown('***both***'), /<strong><em>both<\/em><\/strong>/);
  assert.match(renderMarkdown('~~gone~~'), /<del>gone<\/del>/);
  assert.match(renderMarkdown('`x = 1`'), /<code>x = 1<\/code>/);
});

test('ссылка: текст, href, rel для внешних', () => {
  const html = renderMarkdown('[Docs](https://example.com "Подсказка")');
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /title="Подсказка"/);
});

test('ссылка: опасные схемы отклоняются', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeUrl('vbscript:msgbox'), false);
  assert.equal(isSafeUrl('https://ok.dev'), true);
  assert.equal(isSafeUrl('#anchor'), true);
  assert.equal(isSafeUrl('./relative.md'), true);
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(html, /<a /);
});

test('ссылка: ampersand в URL не экранируется дважды', () => {
  const html = renderMarkdown('[u](https://example.com/?a=1&b=2)');
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(html, /&amp;amp;/);
});

test('изображения рендерятся с lazy-загрузкой', () => {
  const html = renderMarkdown('![логотип](https://example.com/a.png)');
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="логотип" loading="lazy">/);
});

test('fenced-блок кода сохраняется как есть', () => {
  const html = renderMarkdown('```js\nconst a = "<b>";\n```');
  assert.match(html, /<pre><code class="language-js">const a = &quot;&lt;b&gt;&quot;;\n<\/code><\/pre>/);
});

test('блок кода не парится как Markdown', () => {
  const html = renderMarkdown('```\n# не заголовок\n**текст**\n```');
  assert.doesNotMatch(html, /<h1/);
  assert.doesNotMatch(html, /<strong>/);
});

test('маркированный и нумерованный списки', () => {
  assert.match(renderMarkdown('- a\n- b'), /^<ul><li>a<\/li><li>b<\/li><\/ul>$/);
  assert.match(renderMarkdown('1. a\n2. b'), /^<ol><li>a<\/li><li>b<\/li><\/ol>$/);
  assert.match(renderMarkdown('* a\n+ b'), /<ul>/);
});

test('task-list в стиле GitHub', () => {
  const html = renderMarkdown('- [x] готово\n- [ ] план');
  assert.match(html, /<ul class="contains-task-list">/);
  assert.match(html, /<li class="task"><input type="checkbox" disabled checked> готово<\/li>/);
  assert.match(html, /<li class="task"><input type="checkbox" disabled> план<\/li>/);
});

test('цитата поддерживает вложенные блоки', () => {
  const html = renderMarkdown('> важно\n> **сильно**');
  assert.match(html, /^<blockquote><p>важно<br><strong>сильно<\/strong><\/p><\/blockquote>$/);
});

test('горизонтальная линия', () => {
  assert.equal(renderMarkdown('---'), '<hr>');
  assert.equal(renderMarkdown('* * *'), '<hr>');
});

test('таблица с выравниванием колонок', () => {
  const html = renderMarkdown('| a | b |\n| :- | --: |\n| 1 | 2 |');
  assert.match(html, /<table><thead>/);
  assert.match(html, /<th style="text-align:left">a<\/th>/);
  assert.match(html, /<th style="text-align:right">b<\/th>/);
  assert.match(html, /<td style="text-align:right">2<\/td>/);
});

test('сырой HTML в выводе невозможен', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  // Никаких живых тегов — только текст, который браузер отобразит буквально.
  assert.doesNotMatch(html, /<(script|img|iframe)\b/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /onerror=alert\(1\)&gt;/); // текст остался текстом, а не атрибутом
});

test('CRLF-переносы нормализуются', () => {
  assert.match(renderMarkdown('a\r\nb'), /a<br>b/);
});

test('slugify: юникод и пробелы', () => {
  assert.equal(slugify('Привет Мир!'), 'привет-мир');
  assert.equal(slugify('Hello, World — v2'), 'hello-world--v2'.replace('--', '-'));
  assert.equal(slugify('  Обрезка  '), 'обрезка');
});

test('заголовки не ломают последующие абзацы', () => {
  const html = renderMarkdown('# A\n\nпараграф\n\n## B');
  assert.equal((html.match(/<p>/g) ?? []).length, 1);
});
