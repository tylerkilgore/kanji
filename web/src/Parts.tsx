import type { KanjiDetail, SoundMember } from './types.ts';
import { onDisplay, plainOn } from './kana.ts';
import { StatusDot, kanjiHref } from './ui.tsx';

// Components and sound family, from KanjiVG. Most kanji pair a meaning part
// (often the radical) with a sound part that hints at the on'yomi.

type K = Pick<KanjiDetail, 'char' | 'partList' | 'sound'>;

const PART_ROLE = (p: KanjiDetail['partList'][number]) => (p.p ? 'sound' : p.r ? 'radical' : '');

// The member's readings that match this kanji's, or its first reading if none do.
function memberReadings(m: SoundMember, shared: string[]): string[] {
  const own = new Set(shared.map(plainOn));
  const hits = m.on.filter((r) => own.has(plainOn(r)));
  return hits.length ? hits : m.on.slice(0, 1);
}

// The on'yomi most of the family shares, for kanji that break the pattern (特 トク, family ジ).
function familyReading(sound: NonNullable<K['sound']>): string | undefined {
  // Group by reading ignoring dakuten (ジ and シ count together), then show the commonest spelling.
  const groups = new Map<string, string[]>();
  for (const on of [sound.on, ...sound.members.map((m) => m.on)]) {
    for (const r of new Set(on)) groups.set(plainOn(r), [...(groups.get(plainOn(r)) ?? []), r]);
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 2) return undefined;
  const tally = new Map<string, number>();
  for (const r of best) tally.set(r, (tally.get(r) ?? 0) + 1);
  return [...tally].sort((a, b) => b[1] - a[1])[0][0];
}

// Full view for the kanji page.
export function Parts({ k }: { k: K }) {
  const { partList, sound } = k;
  if (!partList.length && !sound) return null;
  const sharing = sound?.members.filter((m) => m.shares) ?? [];

  return (
    <>
      {partList.length > 0 && (
        <>
          <h3>Parts</h3>
          <div className="parts">
            {partList.map((p) => {
              const body = (
                <>
                  <span className="pglyph jp">{p.c}</span>
                  <span className="pmean">{p.meaning || '—'}</span>
                  {PART_ROLE(p) && <span className={`prole ${PART_ROLE(p)}`}>{PART_ROLE(p)}</span>}
                </>
              );
              return p.kanji
                ? <a key={p.c} className={`part ${PART_ROLE(p)}`} href={kanjiHref(p.c)}>{body}</a>
                : <div key={p.c} className={`part ${PART_ROLE(p)}`}>{body}</div>;
            })}
          </div>
        </>
      )}

      {sound && (
        <>
          <h3>Sound family</h3>
          <p className="sound-lead">
            <span className="jp">{sound.char}</span>
            {sound.shared.length > 0 ? (
              <> gives {k.char} its reading <span className="sread jp">{sound.shared.map(onDisplay).join('・')}</span></>
            ) : (
              <> is {k.char}'s sound part{familyReading(sound) && <> (usually <span className="jp">{onDisplay(familyReading(sound)!)}</span>)</>}, but {k.char} doesn't follow it</>
            )}
          </p>
          {sound.members.length > 0 && (
            <div className="family">
              {sound.members.map((m) => (
                <a key={m.char} className={`fam ${m.shares ? 'shares' : sound.shared.length ? 'differs' : ''}`} href={kanjiHref(m.char)}>
                  <span className="fglyph jp">{m.char}</span>
                  <span className="fread jp">{memberReadings(m, sound.shared).map(onDisplay).join('・') || '—'}</span>
                  <span className="fmean">{m.meaning}</span>
                  <StatusDot status={m.status} />
                </a>
              ))}
            </div>
          )}
          <p className="muted small">
            {sharing.length > 0 && sharing.length < sound.members.length
              ? 'Faded kanji are built on the same part but read differently. The sound part is a strong hint, not a rule.'
              : sound.members.length === 0
                ? 'No other JLPT kanji use this sound part.'
                : 'The sound part is a strong hint, not a rule.'}
          </p>
        </>
      )}
    </>
  );
}

// One line for lesson and review cards: 飠 food + 反 ハン · like 飯 坂 板
export function PartsHint({ k }: { k: K }) {
  const { partList, sound } = k;
  if (!partList.length) return null;
  const soundReading = sound?.shared.length ? sound.shared.map(onDisplay).join('・') : '';
  const like = sound && soundReading ? sound.members.filter((m) => m.shares).slice(0, 3) : [];
  return (
    <p className="parts-hint">
      {partList.map((p, i) => (
        <span key={p.c}>
          {i > 0 && <span className="plus">+</span>}
          <span className="jp pc">{p.c}</span>{' '}
          {p.p && soundReading
            ? <span className="sread jp">{soundReading}</span>
            : <span className="muted">{p.meaning.toLowerCase()}</span>}
        </span>
      ))}
      {like.length > 0 && <span className="muted"> · like <span className="jp">{like.map((m) => m.char).join(' ')}</span></span>}
    </p>
  );
}
