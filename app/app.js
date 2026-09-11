/**
 * app.js — контроллер MarkNote.
 * Без фреймворка: ванильный JS + модули рендера/статистики.
 */
import { renderMarkdown } from './lib/markdown.js';
import { countWords, countChars, readingTime, extractHeadings } from './lib/stats.js';

const STORAGE_KEY = 'marknote:v1';
const WELCOME = `# MarkNote 👋

**Живой Markdown-редактор** в одном HTML-файле: без фреймворков, без сборки, без сервера приложений.

## Что умеет

- мгновенный предпросмотр при наборе текста;
- \`жирный\`, *курсив*, ~~зачёркнутый~~, \`код\`;
- списки, цитаты, таблицы и ссылки — [например, GitHub](https://github.com);
- автосохранение в localStorage и экспорт в \`.md\`;
- тёмная и светлая темы, горячие клавиши.

> Всё считается локально в браузере: заметки никуда не улетают.

## Таблица возможностей

| Возможность | Горячая клавиша | Статус |
| --- | :---: | ---: |
| Жирный | Ctrl+B | ✓ |
| Курсив | Ctrl+I | ✓ |
| Код | Ctrl+E | ✓ |
| Ссылка | Ctrl+K | ✓ |
| Сохранить | Ctrl+S | ✓ |

### Код

\`\`\`js
import { renderMarkdown } from './lib/markdown.js';

document.querySelector('#preview').innerHTML = renderMarkdown(source);
\`\`\`

- [x] 29 юнит-тестов проходят
- [x] Нет ни одной зависимости
- [ ] Твоя очередь — правь и пушь
`;

const els = {
  app: document.querySelector('.app'),
  sidebar: document.getElementById('sidebar'),
  notes: document.getElementById('notes'),
  search: document.getElementById('search'),
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  panes: document.getElementById('panes'),
  statusNote: document.getElementById('status-note'),
  statusWords: document.getElementById('status-words'),
  statusChars: document.getElementById('status-chars'),
  statusRead: document.getElementById('status-read'),
  statusSave: document.getElementById('status-save'),
};

const state = load() ?? {
  notes: [newNote('Добро пожаловать', WELCOME)],
  activeId: null,
  theme: 'dark',
  view: 'split',
  query: '',
};
state.activeId ??= state.notes[0]?.id ?? null;

/* ---------------- persistence ---------------- */

function newNote(title = 'Без названия', body = '') {
  return { id: crypto.randomUUID(), title, body, updatedAt: Date.now() };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

let saveTimer;
function persist({ immediate = false } = {}) {
  const write = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      els.statusSave.textContent = `сохранено ${new Date().toLocaleTimeString('ru-RU')}`;
      els.statusSave.classList.remove('is-dirty');
    } catch {
      els.statusSave.textContent = 'хранилище недоступно';
    }
  };
  clearTimeout(saveTimer);
  els.statusSave.textContent = 'изменения…';
  els.statusSave.classList.add('is-dirty');
  immediate ? write() : (saveTimer = setTimeout(write, 400));
}

/* ---------------- helpers ---------------- */

const active = () => state.notes.find((n) => n.id === state.activeId) ?? null;

function titleOf(body) {
  const heading = extractHeadings(body)[0];
  const first = heading?.text ?? body.split('\n').find((l) => l.trim())?.replace(/[#>*`_-]/g, '').trim();
  return (first || 'Без названия').slice(0, 60);
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

let toastTimer;
function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 1900);
}

/* ---------------- render ---------------- */

function renderNotes() {
  const query = state.query.trim().toLowerCase();
  const list = state.notes
    .filter((n) => !query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  els.notes.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'notes-empty';
    empty.textContent = query ? 'Ничего не найдено' : 'Заметок пока нет';
    els.notes.append(empty);
    return;
  }

  for (const note of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-item' + (note.id === state.activeId ? ' is-active' : '');
    btn.innerHTML = `
      <span class="note-title"></span>
      <span class="note-meta"></span>
      <span class="note-remove" role="button" tabindex="0" title="Удалить">✕</span>`;
    btn.querySelector('.note-title').textContent = note.title;
    btn.querySelector('.note-meta').textContent = `${timeAgo(note.updatedAt)} · ${countWords(note.body)} слов`;

    btn.addEventListener('click', (e) => {
      if (e.target.closest('.note-remove')) return;
      state.activeId = note.id;
      els.editor.value = note.body;
      renderAll();
      if (matchMedia('(max-width: 900px)').matches) els.app.dataset.sidebar = 'hidden';
    });

    btn.querySelector('.note-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeNote(note.id);
    });

    els.notes.append(btn);
  }
}

function renderPreview() {
  const text = els.editor.value;
  els.preview.innerHTML = renderMarkdown(text);
  const words = countWords(text);
  els.statusWords.textContent = `${words} ${plural(words, 'слово', 'слова', 'слов')}`;
  const chars = countChars(text);
  els.statusChars.textContent = `${chars.toLocaleString('ru-RU')} знаков`;
  els.statusRead.textContent = `чтение ${readingTime(text).label}`;
  const note = active();
  els.statusNote.textContent = note ? note.title : 'нет заметки';
}

const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

function renderAll() {
  renderNotes();
  renderPreview();
  els.panes.dataset.view = state.view;
  document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
  document.documentElement.dataset.theme = state.theme;
}

/* ---------------- actions ---------------- */

function removeNote(id) {
  const index = state.notes.findIndex((n) => n.id === id);
  if (index === -1) return;
  const [gone] = state.notes.splice(index, 1);
  if (state.notes.length === 0) state.notes.push(newNote());
  if (state.activeId === id) {
    state.activeId = state.notes[Math.min(index, state.notes.length - 1)].id;
    els.editor.value = active().body;
  }
  persist();
  renderAll();
  toast(`Удалено: ${gone.title}`);
}

function createNote() {
  const note = newNote();
  state.notes.unshift(note);
  state.activeId = note.id;
  els.editor.value = '';
  els.search.value = '';
  state.query = '';
  persist({ immediate: true });
  renderAll();
  els.editor.focus();
  if (matchMedia('(max-width: 900px)').matches) els.app.dataset.sidebar = 'hidden';
}

/** Оборачивает выделение маркером или вставляет плейсхолдер. */
function wrapSelection(marker) {
  const { selectionStart: s, selectionEnd: e, value } = els.editor;
  const selected = value.slice(s, e) || 'текст';
  const already = value.slice(s - marker.length, s) === marker && value.slice(e, e + marker.length) === marker;
  const next = already
    ? value.slice(0, s - marker.length) + selected + value.slice(e + marker.length)
    : value.slice(0, s) + marker + selected + marker + value.slice(e);
  els.editor.value = next;
  els.editor.selectionStart = already ? s - marker.length : s + marker.length;
  els.editor.selectionEnd = already ? e - marker.length : s + marker.length + selected.length;
  els.editor.focus();
  onEdit();
}

/** Добавляет префикс строки (#, -, > …) ко всем выделенным строкам. */
function prefixLines(prefix) {
  const { selectionStart: s, selectionEnd: e, value } = els.editor;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(lineStart, e);
  const modified = block
    .split('\n')
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
    .join('\n');
  els.editor.value = value.slice(0, lineStart) + modified + value.slice(e);
  els.editor.selectionStart = lineStart;
  els.editor.selectionEnd = lineStart + modified.length;
  els.editor.focus();
  onEdit();
}

function insertAtCursor(text) {
  const { selectionStart: s, value } = els.editor;
  els.editor.value = value.slice(0, s) + text + value.slice(els.editor.selectionEnd);
  els.editor.selectionStart = els.editor.selectionEnd = s + text.length;
  els.editor.focus();
  onEdit();
}

function insertLink() {
  const { selectionStart: s, selectionEnd: e, value } = els.editor;
  const label = value.slice(s, e) || 'текст ссылки';
  insertAtCursor(`[${label}](https://)`);
}

const TABLE_TEMPLATE = `
| Колонка | Колонка |
| --- | ---: |
| значение | 1 |
`;

/* ---------------- events ---------------- */

function onEdit() {
  const note = active();
  if (!note) return;
  note.body = els.editor.value;
  note.title = titleOf(note.body);
  note.updatedAt = Date.now();
  renderPreview();
  persist();
  clearTimeout(onEdit.noteTimer);
  onEdit.noteTimer = setTimeout(renderNotes, 600);
}

els.editor.addEventListener('input', onEdit);

els.editor.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'Tab' && !mod) {
    event.preventDefault();
    insertAtCursor('  ');
    return;
  }
  if (!mod) return;
  const map = { b: () => wrapSelection('**'), i: () => wrapSelection('*'), e: () => wrapSelection('`'), k: insertLink };
  const action = map[event.key.toLowerCase()];
  if (action) {
    event.preventDefault();
    action();
  }
});

document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  if (event.altKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    createNote();
  } else if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    persist({ immediate: true });
    toast('Сохранено локально');
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const order = ['edit', 'split', 'preview'];
    state.view = order[(order.indexOf(state.view) + 1) % order.length];
    renderAll();
    persist({ immediate: true });
  }
});

document.querySelectorAll('[data-wrap]').forEach((btn) =>
  btn.addEventListener('click', () => wrapSelection(btn.dataset.wrap))
);
document.querySelectorAll('[data-prefix]').forEach((btn) =>
  btn.addEventListener('click', () => prefixLines(btn.dataset.prefix))
);
document.getElementById('insert-link').addEventListener('click', insertLink);
document.getElementById('insert-table').addEventListener('click', () => insertAtCursor(TABLE_TEMPLATE.trim()));

document.querySelectorAll('.seg').forEach((btn) =>
  btn.addEventListener('click', () => {
    state.view = btn.dataset.view;
    renderAll();
    persist({ immediate: true });
  })
);

document.getElementById('new-note').addEventListener('click', createNote);

document.getElementById('toggle-theme').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  renderAll();
  persist({ immediate: true });
});

document.getElementById('toggle-sidebar').addEventListener('click', () => {
  const narrow = matchMedia('(max-width: 900px)').matches;
  const open = els.app.dataset.sidebar === 'open';
  els.app.dataset.sidebar = narrow ? (open ? 'hidden' : 'open') : els.app.dataset.sidebar === 'hidden' ? 'shown' : 'hidden';
});

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  renderNotes();
});

document.getElementById('export-note').addEventListener('click', () => {
  const note = active();
  if (!note) return;
  const url = URL.createObjectURL(new Blob([note.body], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${note.title.replace(/[\\/:*?"<>|]/g, '').toLowerCase() || 'note'}.md`,
  });
  a.click();
  URL.revokeObjectURL(url);
  toast('Файл .md скачан');
});

document.getElementById('copy-html').addEventListener('click', async () => {
  const html = renderMarkdown(els.editor.value);
  try {
    await navigator.clipboard.writeText(html);
    toast('HTML скопирован в буфер');
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: html });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('HTML скопирован (fallback)');
  }
});

const fileInput = document.getElementById('file-input');
document.getElementById('import-note').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const body = await file.text();
  const note = newNote(titleOf(body), body);
  state.notes.unshift(note);
  state.activeId = note.id;
  els.editor.value = body;
  persist({ immediate: true });
  renderAll();
  toast(`Импортирован ${file.name}`);
  fileInput.value = '';
});

/* ---------------- boot ---------------- */

const initial = active();
els.editor.value = initial?.body ?? '';
renderAll();
persist({ immediate: true });
