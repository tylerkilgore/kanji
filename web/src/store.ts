// All study state lives in the browser. Progress is an append-only log of
// events in IndexedDB; card state is rebuilt by replaying it through FSRS
// (deterministic, including fuzz). Syncing devices is just merging logs by id.

import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';
import type {
  CardKind, CardStatus, DataFile, ExportFile, IntervalPreview, KanjiDetail, KanjiItem, KanjiListItem,
  Lesson, PartDetail, Review, Sentence, Settings, SoundFamily, StrokeData, StudyEvent, Summary, VocabDetail, VocabItem,
} from './types.ts';
import { plainOn } from './kana.ts';

// A card counts as mastered once FSRS expects to remember it for three weeks.
const MASTERED_STABILITY = 21;
const DEFAULT_SETTINGS: Settings = { kanjiPerDay: 8, vocabPerDay: 25, retention: 0.9, kanjiPrompt: 'meaning' };

// --- IndexedDB -------------------------------------------------------------

const idb: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const req = indexedDB.open('kanji', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('events', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function readEvents(): Promise<StudyEvent[]> {
  const db = await idb;
  return new Promise((resolve, reject) => {
    const req = db.transaction('events').objectStore('events').getAll();
    req.onsuccess = () => resolve(req.result as StudyEvent[]);
    req.onerror = () => reject(req.error);
  });
}

async function writeEvents(events: StudyEvent[]): Promise<void> {
  const db = await idb;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readwrite');
    for (const e of events) tx.objectStore('events').put(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// crypto.randomUUID needs a secure context, which a LAN dev server isn't.
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// --- state -----------------------------------------------------------------

type CardState = { card: Card; createdAt: number };

let data: DataFile;
let kanjiByChar: Map<string, KanjiItem>;
let vocabById: Map<string, VocabItem>;
let vocabKanji: Map<string, string[]>; // vocab id → the JLPT kanji it contains
let vocabByKanji: Map<string, VocabItem[]>;
let soundFamilies: Map<string, KanjiItem[]>; // sound part → JLPT kanji built on it

let events: StudyEvent[] = [];
const eventIds = new Set<string>();
let cards = new Map<string, CardState>();
let settings: Settings = { ...DEFAULT_SETTINGS };

const cardKey = (kind: CardKind, ref: string) => `${kind}:${ref}`;
const scheduler = () => fsrs({ request_retention: settings.retention, enable_fuzz: true });
const byTime = (a: StudyEvent, b: StudyEvent) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function apply(e: StudyEvent, f = scheduler()) {
  if (e.type === 'settings') {
    settings = { ...settings, ...e.settings };
    return;
  }
  let c = cards.get(e.key);
  if (!c) {
    c = { card: createEmptyCard(new Date(e.ts)), createdAt: e.ts };
    cards.set(e.key, c);
  }
  if (e.type === 'review') c.card = f.next(c.card, new Date(e.ts), e.rating as Grade).card;
}

function replay() {
  events.sort(byTime);
  // Settings first, so every review is scheduled with the current retention target.
  settings = { ...DEFAULT_SETTINGS };
  for (const e of events) if (e.type === 'settings') apply(e);
  cards = new Map();
  const f = scheduler();
  for (const e of events) if (e.type !== 'settings') apply(e, f);
}

type NewEvent = StudyEvent extends infer E ? (E extends StudyEvent ? Omit<E, 'id' | 'ts'> : never) : never;

async function record(e: NewEvent) {
  const event = { id: newId(), ts: Date.now(), ...e } as StudyEvent;
  await writeEvents([event]);
  events.push(event);
  eventIds.add(event.id);
  if (event.type === 'settings') replay();
  else apply(event);
}

const ready: Promise<void> = (async () => {
  const [res, stored] = await Promise.all([fetch('data/kanji.json'), readEvents()]);
  data = (await res.json()) as DataFile;
  kanjiByChar = new Map(data.kanji.map((k) => [k.char, k]));
  vocabById = new Map(data.vocab.map((v) => [v.id, v]));
  vocabKanji = new Map();
  vocabByKanji = new Map();
  for (const v of data.vocab) {
    const chars = [...new Set(v.word)].filter((ch) => kanjiByChar.has(ch));
    vocabKanji.set(v.id, chars);
    for (const ch of chars) {
      if (!vocabByKanji.has(ch)) vocabByKanji.set(ch, []);
      vocabByKanji.get(ch)!.push(v);
    }
  }
  soundFamilies = new Map();
  for (const k of data.kanji) {
    if (!k.phon) continue;
    if (!soundFamilies.has(k.phon)) soundFamilies.set(k.phon, []);
    soundFamilies.get(k.phon)!.push(k);
  }
  for (const list of vocabByKanji.values()) {
    list.sort((a, b) => (a.jlpt === null ? 1 : 0) - (b.jlpt === null ? 1 : 0) || (b.jlpt ?? 0) - (a.jlpt ?? 0) || a.word.length - b.word.length);
  }
  events = stored;
  for (const e of events) eventIds.add(e.id);
  replay();
  navigator.storage?.persist?.().catch(() => {});
})();

// --- status ----------------------------------------------------------------

function cardStatus(c: CardState | undefined): CardStatus {
  if (!c) return 'new';
  if (c.card.state !== 2) return 'learning'; // New, Learning, Relearning
  return c.card.stability >= MASTERED_STABILITY ? 'mastered' : 'review';
}

// A word is unlocked once every JLPT kanji it contains has been learned.
const vocabUnlocked = (id: string) => vocabKanji.get(id)!.every((ch) => cards.has(cardKey('kanji', ch)));

function vocabStatus(id: string): CardStatus {
  const c = cards.get(cardKey('vocab', id));
  return !c && !vocabUnlocked(id) ? 'locked' : cardStatus(c);
}

const withKanjiStatus = (k: KanjiItem): KanjiItem => ({ ...k, status: cardStatus(cards.get(cardKey('kanji', k.char))) });
const withVocabStatus = (v: VocabItem): VocabItem => ({ ...v, status: vocabStatus(v.id) });
const listItem = (k: KanjiItem): KanjiListItem =>
  ({ char: k.char, jlpt: k.jlpt, status: cardStatus(cards.get(cardKey('kanji', k.char))), meaning: k.meanings[0] ?? '' });

// --- lookups ---------------------------------------------------------------

function componentInfo(c: string): { meaning: string; on: string[]; kanji: boolean } {
  const k = kanjiByChar.get(c);
  if (k) return { meaning: k.meanings[0] ?? '', on: k.on, kanji: true };
  const comp = data.components[c];
  return { meaning: comp?.m ?? '', on: comp?.on ?? [], kanji: false };
}

// The kanji's sound part and the other JLPT kanji built on it, those that share
// one of this kanji's on'yomi first: the pattern is a strong hint, not a rule.
function soundFamily(k: KanjiItem): SoundFamily | null {
  if (!k.phon) return null;
  const own = new Set(k.on.map(plainOn));
  const shares = (on: string[]) => on.some((r) => own.has(plainOn(r)));
  const phonKanji = kanjiByChar.get(k.phon);
  const members = [...(phonKanji ? [phonKanji] : []), ...soundFamilies.get(k.phon)!]
    .filter((m) => m.char !== k.char)
    .map((m) => ({
      char: m.char, on: m.on, meaning: m.meanings[0] ?? '', shares: shares(m.on),
      status: cardStatus(cards.get(cardKey('kanji', m.char))),
    }))
    .sort((a, b) => Number(b.shares) - Number(a.shares));
  const info = componentInfo(k.phon);
  const familyOn = new Set([...info.on, ...members.flatMap((m) => m.on)].map(plainOn));
  return { char: k.phon, ...info, shared: k.on.filter((r) => familyOn.has(plainOn(r))), members };
}

function kanjiDetail(char: string): KanjiDetail | null {
  const k = kanjiByChar.get(char);
  if (!k) return null;
  const partList: PartDetail[] = k.parts.map((p) => {
    const { meaning, kanji } = componentInfo(p.c);
    return { ...p, meaning, kanji };
  });
  return {
    ...withKanjiStatus(k), vocab: (vocabByKanji.get(char) ?? []).map(withVocabStatus),
    partList, sound: soundFamily(k),
  };
}

function vocabDetail(id: string): VocabDetail | null {
  const v = vocabById.get(id);
  if (!v) return null;
  const kanji = [...new Set(v.word)].flatMap((ch) => {
    const k = kanjiByChar.get(ch);
    return k ? [{ char: ch, meanings: k.meanings }] : [];
  });
  return { ...withVocabStatus(v), kanji };
}

function lessonFor(key: string): Lesson | null {
  const i = key.indexOf(':');
  const kind = key.slice(0, i) as CardKind;
  const ref = key.slice(i + 1);
  if (kind === 'kanji') {
    const item = kanjiDetail(ref);
    return item && { kind, item };
  }
  const item = vocabDetail(ref);
  return item && { kind, item };
}

function search(q: string): { kanji: KanjiListItem[]; vocab: VocabItem[] } {
  q = q.trim().toLowerCase();
  if (!q) return { kanji: [], vocab: [] };
  // English matches must start a word, so "eat" finds 食 but not "Death".
  const wordStart = (s: string) => { s = s.toLowerCase(); return s.startsWith(q) || s.includes(` ${q}`); };
  const kanji = data.kanji
    .filter((k) => q.includes(k.char) || k.meanings.some((m) => m.toLowerCase().startsWith(q))
      || k.on.some((r) => r.includes(q)) || k.kun.some((r) => r.includes(q)))
    .sort((a, b) => Number(!q.includes(a.char)) - Number(!q.includes(b.char)))
    .slice(0, 40);
  const vocab = data.vocab
    .filter((v) => v.word.includes(q) || v.readings.some((r) => r.includes(q)) || wordStart(v.meaning))
    .sort((a, b) => Number(a.word !== q) - Number(b.word !== q)
      || (a.jlpt === null ? 1 : 0) - (b.jlpt === null ? 1 : 0) || (b.jlpt ?? 0) - (a.jlpt ?? 0)
      || a.word.length - b.word.length)
    .slice(0, 40);
  return { kanji: kanji.map(listItem), vocab: vocab.map(withVocabStatus) };
}

// --- lessons ---------------------------------------------------------------

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function learnedToday(kind: CardKind): number {
  const today = startOfToday();
  let n = 0;
  for (const [key, c] of cards) if (c.createdAt >= today && key.startsWith(`${kind}:`)) n++;
  return n;
}

// Today's remaining lessons: unlocked vocab first (it reinforces kanji you
// already know), then new kanji in JLPT/frequency order.
function lessonQueue(): string[] {
  const vocabLeft = Math.max(0, settings.vocabPerDay - learnedToday('vocab'));
  const kanjiLeft = Math.max(0, settings.kanjiPerDay - learnedToday('kanji'));
  const vocab = data.vocab
    .filter((v) => !cards.has(cardKey('vocab', v.id)) && vocabUnlocked(v.id))
    .sort((a, b) => (a.jlpt === null ? 1 : 0) - (b.jlpt === null ? 1 : 0) || (b.jlpt ?? 0) - (a.jlpt ?? 0))
    .slice(0, vocabLeft);
  const kanji = data.kanji.filter((k) => !cards.has(cardKey('kanji', k.char))).slice(0, kanjiLeft);
  return [...vocab.map((v) => cardKey('vocab', v.id)), ...kanji.map((k) => cardKey('kanji', k.char))];
}

// --- reviews ---------------------------------------------------------------

function formatInterval(ms: number): string {
  const m = ms / 60_000;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

function dueReviews(limit: number): Review[] {
  const now = Date.now();
  const f = scheduler();
  return [...cards]
    .filter(([, c]) => c.card.due.getTime() <= now)
    .sort(([, a], [, b]) => a.card.due.getTime() - b.card.due.getTime())
    .slice(0, limit)
    .flatMap(([key, c]) => {
      const lesson = lessonFor(key);
      if (!lesson) return []; // card for an item no longer in the data set
      const preview = f.repeat(c.card, now);
      const intervals = Object.fromEntries(([1, 2, 3, 4] as const).map((g) =>
        [g, formatInterval(preview[g].card.due.getTime() - now)])) as IntervalPreview;
      return [{ ...lesson, key, intervals }];
    });
}

// --- summary ---------------------------------------------------------------

function summary(): Summary {
  const now = Date.now();
  const today = startOfToday();
  let due = 0;
  let nextDue: number | null = null;
  for (const c of cards.values()) {
    const t = c.card.due.getTime();
    if (t <= now) due++;
    else if (nextDue === null || t < nextDue) nextDue = t;
  }
  const count = <T>(items: T[], key: (x: T) => string) => {
    let started = 0, mastered = 0;
    for (const x of items) {
      const c = cards.get(key(x));
      if (c) started++;
      if (c && c.card.stability >= MASTERED_STABILITY) mastered++;
    }
    return { total: items.length, started, mastered };
  };
  const todays = events.filter((e) => e.type === 'review' && e.ts >= today);
  return {
    due,
    nextDue: due ? null : nextDue,
    lessons: lessonQueue().length,
    today: {
      kanji: learnedToday('kanji'),
      vocab: learnedToday('vocab'),
      reviews: todays.length,
      correct: todays.filter((e) => e.type === 'review' && e.rating > 1).length,
    },
    levels: [5, 4, 3, 2, 1].map((jlpt) => ({
      jlpt, ...count(data.kanji.filter((k) => k.jlpt === jlpt), (k) => cardKey('kanji', k.char)),
    })),
    vocab: count(data.vocab, (v) => cardKey('vocab', v.id)),
  };
}

// --- sync (export / import) --------------------------------------------------

function exportFile(): ExportFile {
  return { app: 'kanji', version: 1, exportedAt: new Date().toISOString(), events: [...events] };
}

const isEvent = (e: unknown): e is StudyEvent => {
  const x = e as StudyEvent;
  return !!x && typeof x.id === 'string' && typeof x.ts === 'number'
    && (x.type === 'settings' ? typeof x.settings === 'object'
      : (x.type === 'learn' || x.type === 'review') && typeof x.key === 'string');
};

// Merges another device's log into this one. Safe to repeat: events are deduplicated by id.
async function importFile(file: unknown): Promise<{ added: number; total: number }> {
  const f = file as ExportFile;
  if (f?.app !== 'kanji' || !Array.isArray(f.events)) throw new Error('Not a kanji progress file');
  const fresh = f.events.filter((e) => isEvent(e) && !eventIds.has(e.id));
  await writeEvents(fresh);
  events.push(...fresh);
  for (const e of fresh) eventIds.add(e.id);
  replay();
  return { added: fresh.length, total: f.events.length };
}

// --- strokes (loaded lazily; the service worker caches the file) -------------

let strokesFile: Promise<Record<string, StrokeData>> | null = null;
export function strokes(char: string): Promise<StrokeData | null> {
  strokesFile ??= fetch('data/strokes.json').then((r) => r.json());
  return strokesFile.then((s) => s[char] ?? null);
}

// --- example sentences (loaded lazily, like strokes) ----------------------------

let sentencesFile: Promise<Record<string, Sentence>> | null = null;
export function sentence(vocabId: string): Promise<Sentence | null> {
  sentencesFile ??= fetch('data/sentences.json').then((r) => r.json());
  return sentencesFile.then((s) => s[vocabId] ?? null);
}

// --- public API --------------------------------------------------------------

const when = <A extends unknown[], R>(fn: (...args: A) => R) => async (...args: A): Promise<R> => { await ready; return fn(...args); };

export const api = {
  summary: when(summary),
  lessons: when((limit: number = 5) => lessonQueue().slice(0, limit).flatMap((key) => lessonFor(key) ?? [])),
  learn: when((kind: CardKind, ref: string) => record({ type: 'learn', key: cardKey(kind, ref) })),
  reviews: when((limit: number = 20) => dueReviews(limit)),
  answer: when((key: string, rating: Grade, answer: string, ms: number) =>
    record({ type: 'review', key, rating, answer, ms })),
  kanjiList: when((jlpt: number) => data.kanji.filter((k) => k.jlpt === jlpt).map(listItem)),
  kanji: when(kanjiDetail),
  vocab: when(vocabDetail),
  search: when(search),
  settings: when(() => ({ ...settings })),
  saveSettings: when(async (s: Partial<Settings>) => { await record({ type: 'settings', settings: s }); return { ...settings }; }),
  exportFile: when(exportFile),
  importFile: when(importFile),
  info: when(() => ({ events: events.length, cards: cards.size, dataBuiltAt: data.builtAt })),
};
