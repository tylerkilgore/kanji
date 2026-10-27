import { toHiragana, toKana, toKatakana } from 'wanakana';
import type { KanjiItem } from './types.ts';

// Live romaji → hiragana while typing. IMEMode keeps a trailing "n" as-is so "kon" can still become こん.
export const liveKana = (s: string) => toKana(s, { IMEMode: true });

export const normalize = (s: string) => toHiragana(toKana(s.replace(/[\s～〜\-.。・]/g, '')));

// KANJIDIC kun readings mark okurigana with "." and affixes with "-": "た.べる" → たべる, た.
export function kanjiAnswers(k: Pick<KanjiItem, 'on' | 'kun'>): string[] {
  const out = new Set<string>();
  for (const r of k.on) out.add(normalize(r));
  for (const r of k.kun) {
    const bare = r.replace(/-/g, '');
    out.add(normalize(bare));
    if (bare.includes('.')) out.add(normalize(bare.split('.')[0]));
  }
  out.delete('');
  return [...out];
}

export const isCorrect = (given: string, accepted: string[]) => accepted.includes(normalize(given));

// For comparing on'yomi across a sound family: ignores dakuten/handakuten, since
// compounds voice them (板 バン, 反 ハン).
export const plainOn = (r: string) => normalize(r).normalize('NFD').replace(/[\u3099\u309a]/g, '');

// On'yomi are conventionally shown in katakana.
export const onDisplay = (r: string) => toKatakana(r);

// Split "た.べる" into the reading proper and its okurigana for display.
export function kunParts(r: string): [string, string] {
  const [stem, okurigana = ''] = r.split('.');
  return [stem, okurigana];
}
