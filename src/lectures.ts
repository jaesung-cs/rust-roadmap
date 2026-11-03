export interface Lecture {
  slug: string;
  order: number;
  title: string;
  minutes: number;
  body: string;
}

import homeRaw from '../lectures/index.md?raw';

// Bundle chapter files (lectures/NN-slug.md) as raw strings at build time.
const files = import.meta.glob('../lectures/[0-9][0-9]-*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parse(path: string, raw: string): Lecture {
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  const match = raw.match(FRONT_MATTER);
  const meta: Record<string, string> = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return {
    slug,
    order: Number(meta.order ?? parseInt(slug, 10)),
    title: meta.title ?? slug,
    minutes: Number(meta.minutes ?? 0),
    body: match ? raw.slice(match[0].length) : raw,
  };
}

export const lectures: Lecture[] = Object.entries(files)
  .map(([path, raw]) => parse(path, raw))
  .sort((a, b) => a.order - b.order);

export const totalMinutes = lectures.reduce((sum, l) => sum + l.minutes, 0);

// Home page text (lectures/index.md). Supports {{total}} and {{count}} placeholders.
export const home = parse('index.md', homeRaw);

export function findLecture(slug: string): Lecture | undefined {
  return lectures.find((l) => l.slug === slug);
}
