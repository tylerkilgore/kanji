import { useEffect, useState } from 'react';
import { toHiragana, toRomaji } from 'wanakana';
import type { Actor, KanjiDetail } from './types.ts';
import { api } from './store.ts';
import { onDisplay } from './kana.ts';
import { TWISTS, mentions } from './story.ts';
import { kanjiHref } from './ui.tsx';

// Memory stories: each part gets a recurring character (cast once, reused in
// every kanji that contains it), and each kanji gets a short scene that puts
// its characters together with its meaning.

// --- a part's character ----------------------------------------------------------

export function ActorCard({ part, meaning, actor, note, onSaved }: {
  part: string; meaning: string; actor?: Actor; note?: string; onSaved: (a: Actor | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(actor?.name ?? '');
  const [desc, setDesc] = useState(actor?.desc ?? '');
  useEffect(() => { setName(actor?.name ?? ''); setDesc(actor?.desc ?? ''); }, [actor?.name, actor?.desc]);

  const save = async () => {
    await api.saveActor(part, name, desc);
    onSaved(name.trim() ? { name: name.trim(), ...(desc.trim() ? { desc: desc.trim() } : {}) } : undefined);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="actor editing">
        <div className="actor-head"><span className="aglyph jp">{part}</span><span className="muted small">{meaning}</span></div>
        <input
          className="text-in" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Character: a few words" maxLength={40}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        />
        <input
          className="text-in" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="What makes it vivid? (optional)" maxLength={140}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        />
        <p className="muted small">Pick something concrete you can picture, and keep it the same everywhere {part} appears.</p>
        <div className="actor-buttons">
          <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <button className={`actor ${actor ? '' : 'uncast'}`} onClick={() => setEditing(true)}>
      <span className="aglyph jp">{part}</span>
      <span className="abody">
        {actor ? <span className="aname">{actor.name}</span> : <span className="acast">Cast a character</span>}
        <span className="ameta">{meaning}{note ? ` · ${note}` : ''}</span>
      </span>
    </button>
  );
}

// --- a kanji's scene -------------------------------------------------------------------

type Check = { label: string; ok: boolean; optional?: boolean };

// A word you know that uses the sound part's reading, for an optional sound hook:
// 飯 → ハン as in ごはん.
function soundHook(k: KanjiDetail): { reading: string; word: string; kana: string } | null {
  const r = k.sound?.shared[0];
  if (!r) return null;
  const kana = toHiragana(r);
  const v = k.vocab.find((v) => v.word.includes(k.char) && v.readings[0].includes(kana) && v.status !== 'locked')
    ?? k.vocab.find((v) => v.word.includes(k.char) && v.readings[0].includes(kana));
  return v ? { reading: onDisplay(r), word: v.word, kana: v.readings[0] } : null;
}

export function SceneBuilder({ k }: { k: KanjiDetail }) {
  const [parts, setParts] = useState(k.partList);
  const [self, setSelf] = useState(k.self);
  const [text, setText] = useState(k.story ?? '');
  const [savedText, setSavedText] = useState(k.story ?? '');
  const [twist, setTwist] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setParts(k.partList); setSelf(k.self); setText(k.story ?? ''); setSavedText(k.story ?? ''); setTwist(null);
  }, [k.char]);

  const save = async () => {
    if (text.trim() === savedText.trim()) return;
    await api.saveStory(k.char, text);
    setSavedText(text);
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  const spark = () => {
    const options = TWISTS.filter((t) => t !== twist);
    setTwist(options[Math.floor(Math.random() * options.length)]);
  };

  const keywords = k.meanings.slice(0, 3);
  const hook = soundHook(k);
  const hookUsed = !!hook && (text.includes(hook.word) || text.includes(hook.kana)
    || new RegExp(`\\b${toRomaji(toHiragana(hook.reading))}\\b`, 'i').test(text));
  const checks: Check[] = [
    ...parts.map((p) => ({ label: p.actor?.name ?? `${p.c} (cast it first)`, ok: !!p.actor && mentions(text, p.actor.name) })),
    { label: keywords[0]?.toLowerCase() ?? 'meaning', ok: keywords.some((m) => mentions(text, m)) },
    ...(hook ? [{ label: `${hook.reading} · ${hook.word}`, ok: hookUsed, optional: true }] : []),
  ];
  const complete = checks.filter((c) => !c.optional).every((c) => c.ok);
  const showSelf = k.usedIn.length > 0 || parts.length === 0;

  return (
    <section className="scene">
      {(parts.length > 0 || showSelf) && (
        <div className="cast-row">
          {parts.map((p, i) => (
            <ActorCard
              key={p.c} part={p.c} meaning={p.meaning} actor={p.actor}
              note={[p.n && `×${p.n}`, p.p && 'sound'].filter(Boolean).join(' · ') || undefined}
              onSaved={(a) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, actor: a } : x)))}
            />
          ))}
          {showSelf && (
            <ActorCard
              part={k.char} meaning={k.meanings[0] ?? ''} actor={self} onSaved={setSelf}
              note={k.usedIn.length ? `part of ${k.usedIn.length} kanji` : 'its own character'}
            />
          )}
        </div>
      )}

      <div className="checks" aria-live="polite">
        {checks.map((c) => (
          <span key={c.label} className={`check ${c.ok ? 'ok' : ''} ${c.optional ? 'optional' : ''}`}>
            {c.ok ? '✓ ' : ''}{c.label}{c.optional && !c.ok ? ' (optional)' : ''}
          </span>
        ))}
      </div>

      <textarea
        className="text-in story"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        placeholder={parts.length
          ? `Write a scene with ${parts.map((p) => p.actor?.name ?? p.c).join(' and ')} that means “${keywords[0]?.toLowerCase()}”.`
          : `Describe an image of this shape that means “${keywords[0]?.toLowerCase()}”.`}
      />

      <div className="scene-actions">
        <button className="btn ghost spark" onClick={spark}>✦ Spark</button>
        {twist && <span className="twist">{twist}</span>}
        <span className="scene-status">
          {flash ? 'Saved' : complete && text.trim() ? 'Complete' : ''}
        </span>
        {text.trim() !== savedText.trim() && <button className="btn primary small" onClick={save}>Save</button>}
      </div>
    </section>
  );
}

// --- in reviews ----------------------------------------------------------------------

// After answering a kanji card: your scene, or a nudge to write or rewrite one.
export function StoryRecall({ k }: { k: KanjiDetail }) {
  const weak = k.misses >= 3;
  if (!k.story) {
    return <a className="story-recall empty" href={kanjiHref(k.char)}>No story yet. Write one ›</a>;
  }
  return (
    <div className={`story-recall ${weak ? 'weak' : ''}`}>
      <p>{k.story}</p>
      {weak && <p className="weak-note">Missed {k.misses} times. This scene isn’t sticking; try something stranger.</p>}
      <a href={kanjiHref(k.char)}>{weak ? 'Rewrite it ›' : 'Edit ›'}</a>
    </div>
  );
}
