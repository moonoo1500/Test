import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countWords, countChars, readingTime, extractHeadings, diffLines } from '../app/lib/stats.js';

test('countWords: считает слова, игнорируя разметку', () => {
  assert.equal(countWords('раз два три'), 3);
  assert.equal(countWords('**два** слова'), 2);
  assert.equal(countWords(''), 0);
  assert.equal(countWords(undefined), 0);
});

test('countWords: вырезает блоки кода', () => {
  assert.equal(countWords('текст\n```\ncode code code\n```\nещё'), 2);
});

test('countChars: без пробелов и переводов строк', () => {
  assert.equal(countChars('a b\nc'), 3);
  assert.equal(countChars('   '), 0);
});

test('readingTime: пороги и округление', () => {
  assert.deepEqual(readingTime(''), { minutes: 0, label: 'пусто' });
  assert.equal(readingTime('один два').label, '< 1 мин');
  const long = Array.from({ length: 360 }, (_, i) => `w${i}`).join(' ');
  assert.equal(readingTime(long).label, '2 мин');
});

test('readingTime: учитывает custom speed', () => {
  const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
  assert.equal(readingTime(text, 100).minutes, 1);
  assert.equal(readingTime(text, 0).label, '< 1 мин');
});

test('extractHeadings: уровни и порядок', () => {
  const list = extractHeadings('# Один\nтекст\n### Три\n#### Четыре ##');
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], { level: 1, text: 'Один', line: 0 });
  assert.equal(list[1].level, 3);
  assert.equal(list[2].text, 'Четыре');
});

test('extractHeadings: пустой текст', () => {
  assert.deepEqual(extractHeadings(''), []);
});

test('diffLines: добавленные и удалённые строки', () => {
  assert.deepEqual(diffLines('a\nb', 'a\nb'), { added: 0, removed: 0 });
  assert.deepEqual(diffLines('a\nb', 'a\nb\nc'), { added: 1, removed: 0 });
  assert.equal(diffLines('a\nb\nc', 'a').removed, 2);
});
