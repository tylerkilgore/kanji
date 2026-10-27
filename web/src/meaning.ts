// Lenient English meaning check for kanji cards: ignores case, punctuation,
// parentheticals and a leading "to"/"a"/"the", and forgives small typos.

const clean = (s: string) => s.toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/^\s*(to|a|an|the)\s+/, '')
  .replace(/\s+/g, ' ')
  .trim();

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const typoAllowance = (n: number) => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

export function meaningCorrect(given: string, meanings: string[]): boolean {
  const g = clean(given);
  if (!g) return false;
  return meanings.some((m) => {
    const t = clean(m);
    return !!t && distance(t, g) <= typoAllowance(t.length);
  });
}
