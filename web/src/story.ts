// Helpers for memory stories: does a scene mention a character or keyword, and
// a version of the scene with the keyword blanked out for review hints.

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'who', 'that', 'is', 'his', 'her', 'its', 'their', 'my']);

const tokens = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? [];

// Crude English stemming, enough to match "oaks"/"oak" and "rested"/"rest".
const stem = (w: string) => {
  const base = w.replace(/'s?$/, '');
  const cut = base.replace(/(ing|ed|es|s)$/, '');
  return cut.length >= 3 ? cut : base;
};

const significant = (phrase: string) => tokens(phrase).filter((w) => !STOP.has(w) && w.length > 1);

// A scene mentions a name if it contains the whole name or its last significant
// word, usually the noun: "grumpy old oak" is mentioned by "the oak".
export function mentions(text: string, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  if (text.toLowerCase().includes(p.toLowerCase())) return true;
  if (/[^\x00-\x7f]/.test(p)) return false; // Japanese names need an exact match
  const head = significant(p).at(-1);
  return !!head && tokens(text).some((w) => stem(w) === stem(head));
}

// The scene with any word from the given phrases replaced by a blank.
export function blankOut(text: string, phrases: string[]): string {
  const hidden = new Set(phrases.flatMap(significant).map(stem));
  return text.replace(/[A-Za-z']+/g, (w) => (hidden.has(stem(w.toLowerCase())) ? '＿＿＿' : w));
}

// Twists to push a scene toward something vivid and strange, which is what sticks.
export const TWISTS = [
  'Make it happen in slow motion.',
  'It’s deafeningly loud.',
  'It smells awful.',
  'Set it in your childhood kitchen.',
  'Someone gets hurt, a little.',
  'Everything is tiny.',
  'Everything is enormous.',
  'It’s happening underwater.',
  'It’s the middle of a wedding.',
  'Add a terrible smell and a good one.',
  'Make one character absurdly polite about it.',
  'It goes wrong at the last second.',
  'It’s on fire, briefly.',
  'You are in the scene. What do you do?',
  'It happens over and over, like a loop.',
  'It’s freezing cold.',
  'Make it sticky.',
  'Add a sound effect you can hear in your head.',
  'Set it in a crowded train.',
  'It’s a cooking show.',
  'Something breaks.',
  'Turn it into a sports commentary.',
  'One character is secretly a cat.',
  'Make the keyword a shouted catchphrase.',
  'Give it a texture: rough, slimy, fuzzy.',
  'It happens in total darkness except one light.',
  'Everyone is whispering.',
  'Set it on the roof of your home.',
];
