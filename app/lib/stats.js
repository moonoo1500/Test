/**
 * stats.js — метрики текста. Чистые функции, чтобы их было удобно тестировать.
 */

/** @param {string} text @returns {number} слов */
export function countWords(text) {
  const cleaned = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-|]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length;
}

/** @param {string} text @returns {number} знаков без пробелов */
export function countChars(text) {
  return String(text ?? '').replace(/\s/g, '').length;
}

/**
 * Время чтения: 180 слов в минуту для русского (текст плотнее английского).
 * @param {string} text
 * @returns {{minutes: number, label: string}}
 */
export function readingTime(text, wordsPerMinute = 180) {
  const words = countWords(text);
  const minutes = wordsPerMinute > 0 ? words / wordsPerMinute : 0;
  if (words === 0) return { minutes: 0, label: 'пусто' };
  if (minutes < 1) return { minutes, label: '< 1 мин' };
  return { minutes, label: `${Math.round(minutes)} мин` };
}

/**
 * Заголовки документа для оглавления.
 * @param {string} text
 * @returns {{level: number, text: string, line: number}[]}
 */
export function extractHeadings(text) {
  return String(text ?? '')
    .split('\n')
    .map((line, index) => {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!m) return null;
      return { level: m[1].length, text: m[2].replace(/\s*#+\s*$/, '').trim(), line: index };
    })
    .filter(Boolean);
}

/**
 * Простейший дифф по строкам для счётчика изменений.
 * @returns {{added: number, removed: number}}
 */
export function diffLines(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const seen = new Map();
  for (const line of a) seen.set(line, (seen.get(line) ?? 0) + 1);

  let added = 0;
  for (const line of b) {
    if ((seen.get(line) ?? 0) > 0) seen.set(line, seen.get(line) - 1);
    else added += 1;
  }
  const removed = a.length - (b.length - added);
  return { added, removed: Math.max(0, removed) };
}
