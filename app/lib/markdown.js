/**
 * markdown.js — крошечный Markdown-рендерер без зависимостей.
 *
 * Модель безопасности: вход экранируется ПОЛНОСТЬЮ до разметки, поэтому
 * сырой HTML из документа не может попасть в вывод. Ссылки дополнительно
 * фильтруются по схеме (см. SAFE_URL_PROTOCOLS).
 */

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Экранирует символы, значимые для HTML. */
export function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Разрешена ли ссылка (защита от javascript:, data: и т.п.). */
export function isSafeUrl(rawUrl, base = 'http://localhost/') {
  const url = String(rawUrl ?? '').trim();
  if (url === '') return false;
  // Якорь или относительный путь — ок.
  if (/^(#|\.?\.?\/)/.test(url)) return true;
  try {
    const parsed = new URL(url, base);
    if (parsed.protocol === 'about:') return false;
    return SAFE_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/** Инлайн-разметка. Работает уже по экранированному тексту. */
function renderInline(escaped) {
  let out = escaped;

  // Изображения до ссылок, иначе ![..](..) схлопнется как обычная ссылка.
  // Кавычки title уже экранированы на предыдущем шаге → ищем &quot;.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (match, alt, src, title) => {
      if (!isSafeUrl(src)) return match; // текст уже экранирован — оставляем как есть
      const t = title ? ` title="${title}"` : '';
      return `<img src="${src}" alt="${alt}" loading="lazy"${t}>`;
    }
  );

  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (match, label, href, title) => {
      if (!isSafeUrl(href)) return match;
      const t = title ? ` title="${title}"` : '';
      const rel = /^https?:/i.test(href) ? ' rel="noopener noreferrer" target="_blank"' : '';
      return `<a href="${href}"${rel}${t}>${label}</a>`;
    }
  );

  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return out;
}

/**
 * Рендерит Markdown в HTML-строку.
 * @param {string} source
 * @returns {string} HTML
 */
export function renderMarkdown(source) {
  if (typeof source !== 'string' || source.trim() === '') return '';

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length === 0) return;
    html.push(`<p>${renderInline(escapeHtml(buf.join('\n')).replace(/\n/g, '<br>'))}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    // ``` fenced code
    const fence = /^\s*```+\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // закрывающая кавычка
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      // Перенос перед </code> — как в CommonMark: удобно копировать код из превью.
      html.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
      continue;
    }

    // Пустая строка
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Заголовок
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s*#+\s*$/, '');
      const id = slugify(text);
      html.push(`<h${level} id="${id}">${renderInline(escapeHtml(text))}</h${level}>`);
      i += 1;
      continue;
    }

    // Горизонтальная линия
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    // Цитата (в т.ч. многострочная)
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    // Таблица GitHub-совместимая
    if (isTableSeparator(lines[i + 1] ?? '') && line.includes('|')) {
      const table = renderTable(lines, i);
      if (table) {
        html.push(table.html);
        i = table.nextIndex;
        continue;
      }
    }

    // Списки
    const bullet = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (bullet || ordered) {
      const tag = bullet ? 'ul' : 'ol';
      const items = [];
      const pattern = bullet ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      while (i < lines.length) {
        const m = pattern.exec(lines[i]);
        if (!m) break;
        // GitHub-совместимые чекбоксы: - [x] / - [ ]
        const task = /^\[([ xX])\]\s+(.*)$/.exec(m[1]);
        const content = renderInline(escapeHtml(task ? task[2] : m[1]));
        items.push(
          task
            ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${content}</li>`
            : `<li>${content}</li>`
        );
        i += 1;
      }
      html.push(`<${tag}${bullet && items.some((it) => it.includes('type="checkbox"')) ? ' class="contains-task-list"' : ''}>${items.join('')}</${tag}>`);
      continue;
    }

    // Параграф — копим до пустой строки или блочного начала
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*```+/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    flushParagraph(para);
  }

  return html.join('\n');
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
}

function renderTable(lines, start) {
  const splitRow = (row) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    if (/^:-+:$/.test(cell)) return 'center';
    if (/^-+:$/.test(cell)) return 'right';
    if (/^:-+$/.test(cell)) return 'left';
    return '';
  });

  const body = [];
  let i = start + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
    body.push(splitRow(lines[i]));
    i += 1;
  }
  if (header.length === 0) return null;

  const alignAttr = (idx) => (aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '');
  const thead = header
    .map((cell, idx) => `<th${alignAttr(idx)}>${renderInline(escapeHtml(cell))}</th>`)
    .join('');
  const tbody = body
    .map(
      (row) =>
        `<tr>${row
          .map((cell, idx) => `<td${alignAttr(idx)}>${renderInline(escapeHtml(cell))}</td>`)
          .join('')}</tr>`
    )
    .join('\n');

  const html = `<table><thead><tr>${thead}</tr></thead><tbody>\n${tbody}\n</tbody></table>`;
  return { html, nextIndex: i };
}

/** Человекочитаемый id для якорей заголовков. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
