import './style.css';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import rust from 'highlight.js/lib/languages/rust';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import bash from 'highlight.js/lib/languages/bash';
import ini from 'highlight.js/lib/languages/ini';
import { lectures, totalMinutes, findLecture, home, type Lecture } from './lectures';

hljs.registerLanguage('rust', rust);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('toml', ini);
marked.setOptions({ gfm: true });

const toc = document.querySelector<HTMLElement>('#toc')!;
const content = document.querySelector<HTMLElement>('#content')!;
const outline = document.querySelector<HTMLElement>('#outline')!;
const progressSummary = document.querySelector<HTMLElement>('#progress-summary')!;

// ---------- Storage (wrapped so the page still works when it is unavailable) ----------
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

const DONE_KEY = 'rust-roadmap:done';
const done = new Set<string>(JSON.parse(load(DONE_KEY) ?? '[]'));
function setDone(slug: string, value: boolean) {
  if (value) done.add(slug);
  else done.delete(slug);
  save(DONE_KEY, JSON.stringify([...done]));
}

// ---------- Theme ----------
const THEME_KEY = 'rust-roadmap:theme';
const savedTheme = load(THEME_KEY);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
document.querySelector('#theme-toggle')!.addEventListener('click', () => {
  const current =
    document.documentElement.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  save(THEME_KEY, next);
});

document.querySelector('#menu-toggle')!.addEventListener('click', () => {
  document.body.classList.toggle('menu-open');
});
document.querySelector('#backdrop')!.addEventListener('click', () => {
  document.body.classList.remove('menu-open');
});

// ---------- Rendering ----------
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const pad = (n: number) => String(n).padStart(2, '0');

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function renderToc(current?: string) {
  toc.innerHTML = lectures
    .map(
      (l) => `<a href="#/${l.slug}" class="${l.slug === current ? 'active' : ''} ${done.has(l.slug) ? 'done' : ''}">
        <span class="num">${pad(l.order)}</span>
        <span class="t">${escapeHtml(l.title)}</span>
        <span class="m">${done.has(l.slug) ? '✓' : `${l.minutes}m`}</span>
      </a>`,
    )
    .join('');
  const doneMinutes = lectures.filter((l) => done.has(l.slug)).reduce((s, l) => s + l.minutes, 0);
  progressSummary.textContent = `${done.size}/${lectures.length} · ${formatMinutes(doneMinutes)} / ${formatMinutes(totalMinutes)}`;
}

function renderHome() {
  document.title = 'Rust for C++ Devs';
  content.innerHTML = `
    <article class="markdown">
      <h1>${escapeHtml(home.title)}</h1>
      ${marked.parse(
        home.body
          .replaceAll('{{total}}', formatMinutes(totalMinutes))
          .replaceAll('{{count}}', String(lectures.length)),
      ) as string}
      <ol class="chapter-list">
        ${lectures
          .map(
            (l) => `<li class="${done.has(l.slug) ? 'done' : ''}">
              <a href="#/${l.slug}"><span class="num">${pad(l.order)}</span>${escapeHtml(l.title)}</a>
              <span class="m">${done.has(l.slug) ? '✓ Done' : formatMinutes(l.minutes)}</span>
            </li>`,
          )
          .join('')}
      </ol>
    </article>`;
  enhanceMarkdown(content);
  outline.innerHTML = '';
  renderToc();
}

function renderLecture(l: Lecture) {
  const idx = lectures.indexOf(l);
  const prev = lectures[idx - 1];
  const next = lectures[idx + 1];
  document.title = `${pad(l.order)}. ${l.title} · Rust for C++ Devs`;

  content.innerHTML = `
    <article class="markdown">
      <div class="meta">Chapter ${pad(l.order)} · ~${formatMinutes(l.minutes)}</div>
      <h1>${escapeHtml(l.title)}</h1>
      ${marked.parse(l.body) as string}
    </article>
    <footer class="lecture-footer">
      <button id="done-toggle" class="done-btn ${done.has(l.slug) ? 'is-done' : ''}">
        ${done.has(l.slug) ? '✓ Done' : 'Mark as done'}
      </button>
      <div class="pager">
        ${prev ? `<a href="#/${prev.slug}" class="prev">← ${pad(prev.order)}. ${escapeHtml(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="#/${next.slug}" class="next">${pad(next.order)}. ${escapeHtml(next.title)} →</a>` : '<span></span>'}
      </div>
    </footer>`;

  enhance(content);
  content.querySelector('#done-toggle')!.addEventListener('click', () => {
    setDone(l.slug, !done.has(l.slug));
    renderLecture(l);
  });
  renderToc(l.slug);
}

// Post-process rendered markdown: code highlighting, callouts, external links.
function enhanceMarkdown(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('pre code').forEach((el) => {
    const lang = [...el.classList].find((c) => c.startsWith('language-'))?.slice(9);
    if (lang && hljs.getLanguage(lang)) hljs.highlightElement(el);
    el.parentElement!.dataset.lang = lang ?? '';
  });

  // Callouts: a blockquote whose first paragraph starts with [!cpp], [!warn] or [!tip].
  root.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.querySelector('p');
    const m = first?.innerHTML.match(/^\s*\[!(cpp|warn|tip)\]\s*/);
    if (!first || !m) return;
    first.innerHTML = first.innerHTML.slice(m[0].length);
    bq.classList.add('callout', m[1]);
  });

  root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

// Lecture pages additionally get heading ids and an outline.
function enhance(root: HTMLElement) {
  enhanceMarkdown(root);

  const headings = [...root.querySelectorAll<HTMLElement>('article h2, article h3')];
  headings.forEach((h, i) => (h.id = `sec-${i}`));
  const links = headings
    .map((h) => `<a data-target="${h.id}" class="${h.tagName.toLowerCase()}">${escapeHtml(h.textContent ?? '')}</a>`)
    .join('');
  outline.innerHTML = headings.length ? `<div class="outline-title">On this page</div>${links}` : '';

  // Narrow screens hide the side outline, so put a collapsible copy right below the title.
  if (headings.length) {
    root.querySelector('article h1')!.insertAdjacentHTML(
      'afterend',
      `<details class="mobile-outline"><summary>On this page</summary>${links}</details>`,
    );
  }
}

// Hash routing owns location.hash, so in-page jumps use scrollIntoView instead of anchors.
function jumpToSection(e: Event) {
  const id = (e.target as HTMLElement).closest<HTMLElement>('a[data-target]')?.dataset.target;
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}
outline.addEventListener('click', jumpToSection);
content.addEventListener('click', jumpToSection);

function currentLecture(): Lecture | undefined {
  return findLecture(decodeURIComponent(location.hash.replace(/^#\/?/, '')));
}

function route() {
  const l = currentLecture();
  if (l) renderLecture(l);
  else renderHome();
  document.body.classList.remove('menu-open');
  window.scrollTo(0, 0);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.body.classList.remove('menu-open');
  if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input, textarea')) return;
  const l = currentLecture();
  const idx = l ? lectures.indexOf(l) : -1;
  if (e.key === 'ArrowRight' && idx < lectures.length - 1) location.hash = `#/${lectures[idx + 1].slug}`;
  if (e.key === 'ArrowLeft' && idx > 0) location.hash = `#/${lectures[idx - 1].slug}`;
});

window.addEventListener('hashchange', route);
route();
