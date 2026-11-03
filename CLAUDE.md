# CLAUDE.md

A static website that teaches Rust to an experienced C++ developer. The lectures are Korean
markdown files and the site is a small Vite + TypeScript app that is deployed to GitHub Pages.

## Commands

```sh
npm install        # once
npm run dev        # local dev server (http://localhost:5173)
npm run dev:lan    # same, but reachable from other devices on the LAN (http://<pc-ip>:5173)
npm run build      # type-check + static build into dist/
npm run preview    # serve dist/ locally
```

Deploy: pushing to `master` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/`.
One-time setup: GitHub repo → Settings → Pages → Source: **GitHub Actions**.

## Layout

- `lectures/NN-slug.md`: lecture sources (Korean). These are the only Korean files.
- `lectures/index.md`: home page intro (Korean). `{{total}}` / `{{count}}` are replaced with the total time and
  chapter count; the chapter list is generated after it.
- `src/lectures.ts`: loads `lectures/[0-9][0-9]-*.md` and `index.md` at build time (`import.meta.glob`, `?raw`) and parses front matter.
- `src/main.ts`: hash routing (`#/NN-slug`), markdown rendering (marked + highlight.js), TOC, outline, progress (localStorage), theme.
- `src/style.css`: all styles; colors are CSS variables on `:root` with dark-mode overrides.
- `vite.config.ts`: `base: './'` so the build works under `/rust-roadmap/` on GitHub Pages.

## Language rules

- **All code is English**: TypeScript, CSS, HTML, config, comments, UI strings, and commit messages.
- **Only `lectures/*.md` is written in Korean.** User-facing prose (like the home page intro) belongs in markdown there,
  not in TypeScript. Short UI chrome (buttons, labels) stays English in code.

## Lecture writing rules

Audience: an experienced C++ developer. Skip generic programming basics and explain Rust *against C++*.

- File name `NN-slug.md` (two-digit order, English kebab-case slug). The slug is the URL.
- Every file starts with front matter. Don't put an H1 in the body; the site renders `title` as the H1.
  ```
  ---
  title: 소유권과 이동
  order: 2
  minutes: 45
  ---
  ```
- `minutes` is the honest reading + exercise time. **Keep the total of all chapters ≤ 600 minutes (10h).**
  Aim for about 150–300 lines per chapter. Be compact; prefer a table or a short example over long prose.
- Chapter template (H2 sections): opening paragraph (what and why) → concept sections, each with
  a C++ comparison where relevant → `## 흔한 컴파일 에러` (common errors, with real `error[E....]` codes) → `## 정리` (summary bullets)
  → `## 연습문제` (2–3 exercises, answers in `<details><summary>정답</summary> ... </details>`; leave blank lines
  inside `<details>` so markdown renders).
- Style: concise plain written form (해라체 / 반말), not 존댓말. Sentences end in `~다`, `~한다`, `~이다`
  (contract to `~다` after a vowel: `관용구다`). Instructions use `~해라` or `~하자`; questions use `~까?`.
  Never use `~습니다`, `~ㅂ니다`, `~세요`, `~요`. Keep sentences short and cut filler.
- Technical terms: Korean followed by the English term in parentheses on first use, e.g. 소유권(ownership). Keep Rust identifiers and keywords in English.
- Code blocks always have a language tag: `rust`, `cpp`, `toml`, `sh` (`text` for compiler output).
  Rust examples must compile on stable Rust (edition 2024) unless they intentionally show an error, and those
  must be marked with a `// error[E....]` comment.
- Callouts are blockquotes whose first paragraph starts with a marker, followed by a bold Korean title:
  - `> [!cpp] **C++ 비교**`: C++ comparison
  - `> [!warn] **주의**`: pitfall / caution
  - `> [!tip] **팁**`: tip
- Introducing de-facto standard crates is encouraged (tokio, serde, anyhow, thiserror, clap, rayon, etc.).
  Show the `Cargo.toml` dependency line when you do.

## Lecture authoring workflow

- Write lectures **in batches of 4 chapters**. After each batch, run `npm run build`, then **stop and wait
  for the user's approval** before starting the next batch.
- When a batch is approved, update the status column below.

## Curriculum (total ≈ 9h 30m)

| #  | Slug                  | Title                                   | Min | Status |
|----|-----------------------|-----------------------------------------|-----|--------|
| 00 | 00-intro              | 소개와 환경 설정                          | 20  | draft  |
| 01 | 01-basics             | 기본 문법                                 | 30  | draft  |
| 02 | 02-ownership          | 소유권과 이동                             | 45  | draft  |
| 03 | 03-borrowing          | 빌림과 참조                               | 45  | draft  |
| 04 | 04-structs-enums      | 구조체, 열거형, 패턴 매칭                  | 40  | todo   |
| 05 | 05-error-handling     | 에러 처리 (Option, Result, `?`)          | 35  | todo   |
| 06 | 06-modules-cargo      | 모듈, 크레이트, Cargo                      | 25  | todo   |
| 07 | 07-collections        | 컬렉션과 문자열                            | 35  | todo   |
| 08 | 08-traits-generics    | 트레이트와 제네릭                          | 50  | todo   |
| 09 | 09-lifetimes          | 라이프타임                                | 45  | todo   |
| 10 | 10-closures-iterators | 클로저와 반복자                            | 40  | todo   |
| 11 | 11-smart-pointers     | 스마트 포인터와 내부 가변성                  | 40  | todo   |
| 12 | 12-concurrency        | 동시성 (Send/Sync, 스레드, 채널, Mutex)    | 45  | todo   |
| 13 | 13-async              | async/await와 tokio                       | 40  | todo   |
| 14 | 14-macros-idioms      | 매크로와 관용적 Rust                        | 30  | todo   |
| 15 | 15-unsafe-ffi         | unsafe와 FFI                              | 35  | todo   |
| 16 | 16-project            | 마무리 프로젝트와 다음 단계                  | 30  | todo   |

Batches: (00–03), (04–07), (08–11), (12–15), (16).
