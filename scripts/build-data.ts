// Fetches the source datasets (cached in data/raw/) and writes the static data
// files the web app loads: web/public/data/kanji.json and strokes.json.
// Safe to re-run: study progress lives in the browser and is keyed by kanji
// character and word|reading, which stay stable across rebuilds.
//
// Sources:
//   kanji     davidluzgouveia/kanji-data (MIT; KANJIDIC2-derived, Waller JLPT levels)
//   vocab     jamsinclair/open-anki-jlpt-decks (MIT; Waller JLPT vocab lists)
//   fallback  scriptin/jmdict-simplified, common words (CC BY-SA 4.0, EDRDG JMdict)
//   strokes   KanjiVG (CC BY-SA 3.0, Ulrich Apel), also components and sound parts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import type { Component, DataFile, Part, StrokeData } from '../web/src/types.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'web', 'public', 'data');

// Kanji with fewer JLPT vocab words than this get extra common words from JMdict.
const MIN_VOCAB_PER_KANJI = 3;

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function fetchCached(name: string, url: string | (() => Promise<string>)): Promise<string> {
  const path = join(RAW, name);
  if (!existsSync(path)) {
    const resolved = typeof url === 'string' ? url : await url();
    console.log(`downloading ${resolved}`);
    const res = await fetch(resolved);
    if (!res.ok) throw new Error(`${res.status} fetching ${resolved}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

// In GitHub Actions, authenticate to avoid the shared runners' API rate limit.
const ghHeaders: Record<string, string> = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

async function latestJmdictUrl(): Promise<string> {
  const res = await fetch('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest', { headers: ghHeaders });
  if (!res.ok) throw new Error(`${res.status} fetching jmdict-simplified release info`);
  const release = (await res.json()) as { assets: { name: string; browser_download_url: string }[] };
  const asset = release.assets.find((a) => /^jmdict-eng-common-.*\.json\.zip$/.test(a.name));
  if (!asset) throw new Error('jmdict-eng-common zip not found in latest release');
  return asset.browser_download_url;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HAN = /\p{Script=Han}/u;
const stripNotes = (s: string) => s.replace(/\s*[(（][^)）]*[)）]\s*/g, ' ').trim();
const splitForms = (s: string) => stripNotes(s).split(/\s*[;；,、]\s*/).map((f) => f.trim()).filter(Boolean);
const answerForm = (reading: string) => reading.replace(/[～〜\s]/g, '');

type KanjiSrc = {
  strokes: number; grade: number | null; freq: number | null; jlpt_new: number | null;
  meanings: string[]; readings_on: string[]; readings_kun: string[];
};

type Vocab = {
  word: string; alt: string[]; readings: string[]; meaning: string;
  jlpt: number | null; source: 'jlpt' | 'jmdict';
};

// --- kanji ---------------------------------------------------------------

const kanjiSrc = JSON.parse(readFileSync(await fetchCached('kanji.json',
  'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json'), 'utf8')) as Record<string, KanjiSrc>;

const kanji = Object.entries(kanjiSrc)
  .filter(([, k]) => k.jlpt_new)
  .sort(([, a], [, b]) => (b.jlpt_new! - a.jlpt_new!) || ((a.freq ?? 1e9) - (b.freq ?? 1e9)) || (a.strokes - b.strokes));
const kanjiSet = new Set(kanji.map(([c]) => c));
console.log(`kanji: ${kanji.length}`);

// --- JLPT vocab ----------------------------------------------------------

const vocab: Vocab[] = [];
const seen = new Set<string>();

for (const level of [5, 4, 3, 2, 1]) {
  const csv = readFileSync(await fetchCached(`vocab-n${level}.csv`,
    `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n${level}.csv`), 'utf8');
  for (const [expression, reading, meaning] of parseCsv(csv).slice(1)) {
    if (!expression || !HAN.test(expression)) continue;
    const forms = splitForms(expression).filter((f) => HAN.test(f));
    // Some suru-verbs list the reading as "しょくじする" for the expression "食事".
    const readings = splitForms(reading).map(answerForm)
      .map((r) => (r.endsWith('する') && !expression.endsWith('する') ? r.slice(0, -2) : r))
      .filter(Boolean);
    if (!forms.length || !readings.length) continue;
    // "高校; 高等学校" / "こうこう; こうとうがっこう" pairs up; "毎月" / "まいげつ; まいつき" doesn't.
    const entries = forms.length > 1 && forms.length === readings.length
      ? forms.map((f, i) => ({ word: f, alt: [], readings: [readings[i]] }))
      : [{ word: forms[0], alt: forms.slice(1), readings }];
    for (const e of entries) {
      const key = `${e.word}|${e.readings[0]}`;
      if (seen.has(key)) continue; // keep the easiest level a word appears at
      seen.add(key);
      vocab.push({ ...e, meaning: meaning.trim(), jlpt: level, source: 'jlpt' });
    }
  }
}
console.log(`jlpt vocab: ${vocab.length}`);

// --- JMdict fallback for kanji with few JLPT words ------------------------

const countFor = (c: string) => vocab.filter((v) => v.word.includes(c)).length;
const thin = kanji.map(([c]) => c).filter((c) => countFor(c) < MIN_VOCAB_PER_KANJI);

const zipPath = await fetchCached('jmdict-eng-common.json.zip', latestJmdictUrl);
const zipped = unzipSync(readFileSync(zipPath));
const jmdict = JSON.parse(new TextDecoder().decode(Object.values(zipped)[0])) as {
  words: {
    kanji: { text: string; common: boolean }[];
    kana: { text: string; common: boolean; appliesToKanji: string[] }[];
    sense: { gloss: { text: string }[] }[];
  }[];
};

const candidates = new Map<string, Vocab[]>();
for (const w of jmdict.words) {
  const k = w.kanji.find((k) => k.common);
  if (!k || [...k.text].some((ch) => HAN.test(ch) && ch !== '々' && !kanjiSet.has(ch))) continue;
  const readings = w.kana.filter((r) => r.common && (r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text)));
  if (!readings.length || !w.sense.length) continue;
  const v: Vocab = {
    word: k.text, alt: [], readings: readings.map((r) => r.text),
    meaning: w.sense[0].gloss.slice(0, 3).map((g) => g.text).join(', '),
    jlpt: null, source: 'jmdict',
  };
  for (const ch of new Set(k.text)) {
    if (!kanjiSet.has(ch)) continue;
    if (!candidates.has(ch)) candidates.set(ch, []);
    candidates.get(ch)!.push(v);
  }
}

let added = 0;
for (const c of thin) {
  const need = MIN_VOCAB_PER_KANJI - countFor(c);
  // Shorter words are usually more basic; JMdict's common-only file has no finer frequency data.
  const picks = (candidates.get(c) ?? [])
    .filter((v) => !seen.has(`${v.word}|${v.readings[0]}`))
    .sort((a, b) => a.word.length - b.word.length)
    .slice(0, need);
  for (const v of picks) {
    seen.add(`${v.word}|${v.readings[0]}`);
    vocab.push(v);
    added++;
  }
}
console.log(`jmdict fallback vocab: ${added} (for ${thin.length} thin kanji); still without vocab: ${kanji.filter(([c]) => !countFor(c)).length}`);

// --- KanjiVG stroke paths ---------------------------------------------------

async function latestKanjivgUrl(): Promise<string> {
  const res = await fetch('https://api.github.com/repos/KanjiVG/kanjivg/releases/latest', { headers: ghHeaders });
  if (!res.ok) throw new Error(`${res.status} fetching KanjiVG release info`);
  const release = (await res.json()) as { assets: { name: string; browser_download_url: string }[] };
  const asset = release.assets.find((a) => /^kanjivg-\d+-main\.zip$/.test(a.name));
  if (!asset) throw new Error('kanjivg main zip not found in latest release');
  return asset.browser_download_url;
}

const kanjivgZip = readFileSync(await fetchCached('kanjivg.zip', latestKanjivgUrl));
const wanted = new Map(kanji.map(([c]) => [`kanji/${c.codePointAt(0)!.toString(16).padStart(5, '0')}.svg`, c]));
const svgs = unzipSync(kanjivgZip, { filter: (f) => wanted.has(f.name) });

// Round coordinates to one decimal: invisible at display size, ~25% smaller file.
// Re-emits separators, since SVG lets "-" double as one ("0.8-0.05"), and
// rounding can drop that sign (-0.05 → 0).
function round(d: string): string {
  let out = '';
  let prevNumber = false;
  for (const [tok] of d.matchAll(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)) {
    if (/[a-zA-Z]/.test(tok)) { out += tok; prevNumber = false; continue; }
    const n = Math.round(Number(tok) * 10) / 10 || 0; // `|| 0` turns -0 into 0
    out += (prevNumber && n >= 0 ? ',' : '') + n;
    prevNumber = true;
  }
  return out;
}

// --- KanjiVG components ------------------------------------------------------
// KanjiVG nests <g> groups for each component, with kvg:radical on the radical
// and kvg:phon on the part that carries the on'yomi (飯 = 飠 + 反, phon="反").

type Group = { attrs: Record<string, string>; kids: Group[] };

const single = (c: string | undefined) => (c && [...c].length === 1 ? c : undefined);

// kvg:phon values carry annotations: "今1" (split part), "員V" (variant), "叚V/反".
const phonChar = (g: Group) =>
  single(g.attrs.element) ?? single(g.attrs.phon?.split('/')[0].replace(/(right|[VT\d])+$/, ''));

function components(svg: string): { parts: Part[]; phon?: string } {
  const root: Group = { attrs: {}, kids: [] };
  const stack = [root];
  for (const m of svg.split('kvg:StrokeNumbers')[0].matchAll(/<g\b([^>]*)>|<\/g>/g)) {
    if (m[0] === '</g>') { stack.pop(); continue; }
    const g: Group = { attrs: Object.fromEntries([...m[1].matchAll(/kvg:(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])), kids: [] };
    stack.at(-1)!.kids.push(g);
    stack.push(g);
  }
  const whole = root.kids[0]?.kids[0];
  if (!whole) return { parts: [] };

  const find = (g: Group, test: (g: Group) => boolean): Group | undefined =>
    test(g) ? g : g.kids.map((k) => find(k, test)).find(Boolean);
  const phonGroup = find(whole, (g) => 'phon' in g.attrs);
  const phon = phonGroup && phonChar(phonGroup);

  // Top-level parts: the first groups down each branch that name an element.
  const tops: Group[] = [];
  const walk = (g: Group) => { for (const k of g.kids) (k.attrs.element ? tops.push(k) : walk(k)); };
  walk(whole);
  const radical = tops.find((g) => g.attrs.radical === 'general') ?? tops.find((g) => g.attrs.radical === 'tradit');

  const parts: Part[] = [];
  for (const g of tops) {
    const c = single(g.attrs.element);
    if (!c || parts.some((p) => p.c === c)) continue; // skips KanjiVG's private "CDP-…" glyphs and split repeats
    const part: Part = { c };
    if (g === radical) part.r = 1;
    if (phon && phonGroup && find(g, (x) => x === phonGroup)) part.p = 1;
    parts.push(part);
  }
  return { parts: parts.length > 1 ? parts : [], phon };
}

// KANJIDIC names radical forms by their dictionary role ("Radical Number 9"), so give
// common ones a plain meaning; others fall back to their first non-"radical" gloss.
const COMPONENT_MEANINGS: Record<string, string> = {
  亻: 'Person', 𠆢: 'Person', 艹: 'Grass', 辶: 'Walk', 阝: 'Hill / village', 宀: 'Roof', 冖: 'Cover',
  罒: 'Net', 糹: 'Thread', 亠: 'Lid', 广: 'Building', 厂: 'Cliff', 疒: 'Sickness', 礻: 'Altar',
  衤: 'Clothes', 刂: 'Knife', 冫: 'Ice', 犭: 'Animal', 攵: 'Strike', 夂: 'Go', 尸: 'Body', 彳: 'Step',
  丿: 'Slash', 丶: 'Dot', 乚: 'Hook', 癶: 'Footsteps', 爫: 'Claw', 彐: 'Snout', 冂: 'Frame', 匚: 'Box',
  囗: 'Enclosure', 勹: 'Wrap', 凵: 'Open box', 廴: 'Stretch', 疋: 'Foot', 戈: 'Halberd', 殳: 'Weapon',
  丨: 'Line', 亅: 'Hook', 彡: 'Streaks', 厶: 'Private', 廾: 'Two hands', 覀: 'West', 儿: 'Legs',
  '⺌': 'Small', '⺍': 'Small', '⻌': 'Walk', '⻖': 'Hill', '⻏': 'Village', '⺗': 'Heart', '⺨': 'Animal', '⺤': 'Claw',
  '⺷': 'Sheep', '⺕': 'Snout',
};

function componentMeaning(c: string): string {
  if (COMPONENT_MEANINGS[c]) return COMPONENT_MEANINGS[c];
  const ms = kanjiSrc[c]?.meanings ?? [];
  const plain = ms.find((m) => !/radical/i.test(m));
  if (plain) return plain;
  const named = ms.map((m) => m.match(/^(.+?)\s+radical/i)?.[1]).find(Boolean);
  return named ?? '';
}

const partsOf = new Map<string, { parts: Part[]; phon?: string }>();
const strokes: Record<string, StrokeData> = {};
for (const [name, bytes] of Object.entries(svgs)) {
  const svg = new TextDecoder().decode(bytes);
  const paths = [...svg.matchAll(/<path[^>]*?id="kvg:[0-9a-f]+-s(\d+)"[^>]*?\sd="([^"]+)"/g)]
    .map((m) => ({ n: Number(m[1]), d: round(m[2]) }))
    .sort((a, b) => a.n - b.n);
  const labels = [...svg.matchAll(/<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)<\/text>/g)]
    .sort((a, b) => Number(a[3]) - Number(b[3]))
    .map((m) => [Math.round(Number(m[1]) * 10) / 10, Math.round(Number(m[2]) * 10) / 10] as [number, number]);
  strokes[wanted.get(name)!] = { d: paths.map((p) => p.d), n: labels };
  partsOf.set(wanted.get(name)!, components(svg));
}
console.log(`stroke data: ${Object.keys(strokes).length} kanji; missing: ${kanji.filter(([c]) => !strokes[c]).map(([c]) => c).join('') || 'none'}`);

// Meanings and on'yomi for components that aren't themselves JLPT kanji.
const componentInfo: Record<string, Component> = {};
for (const { parts, phon } of partsOf.values()) {
  for (const c of [...parts.map((p) => p.c), ...(phon ? [phon] : [])]) {
    if (!kanjiSet.has(c)) componentInfo[c] ??= { m: componentMeaning(c), on: kanjiSrc[c]?.readings_on ?? [] };
  }
}
const families = new Map<string, number>();
for (const { phon } of partsOf.values()) if (phon) families.set(phon, (families.get(phon) ?? 0) + 1);
console.log(`components: ${[...partsOf.values()].filter((p) => p.parts.length).length} kanji split into parts; `
  + `${[...partsOf.values()].filter((p) => p.phon).length} with a sound part (${[...families.values()].filter((n) => n > 1).length} shared families)`);

// --- write data files ------------------------------------------------------

const data: DataFile = {
  builtAt: new Date().toISOString(),
  kanji: kanji.map(([c, k]) => ({
    char: c, jlpt: k.jlpt_new!, strokes: k.strokes, grade: k.grade, freq: k.freq,
    meanings: k.meanings, on: k.readings_on, kun: k.readings_kun,
    parts: partsOf.get(c)?.parts ?? [], phon: partsOf.get(c)?.phon,
  })),
  components: componentInfo,
  vocab: vocab.filter((v) => [...v.word].some((ch) => kanjiSet.has(ch))).map((v) => ({
    id: `${v.word}|${v.readings[0]}`, word: v.word, alt: v.alt, readings: v.readings,
    meaning: v.meaning, jlpt: v.jlpt, source: v.source,
  })),
};

writeFileSync(join(OUT, 'kanji.json'), JSON.stringify(data));
writeFileSync(join(OUT, 'strokes.json'), JSON.stringify(strokes));
console.log(`wrote ${OUT}/kanji.json and strokes.json (delete data/raw/ to refetch sources)`);
