import { useEffect, useState } from 'react';
import type { Lesson } from './types.ts';
import { api } from './store.ts';
import StrokeOrder from './StrokeOrder.tsx';
import { Example, SpeakButton } from './Example.tsx';
import { PartsHint } from './Parts.tsx';
import { LevelBadge, Readings, Screen, VocabRow, kanjiHref } from './ui.tsx';

const BATCH = 5;

export default function LearnSession() {
  const [batch, setBatch] = useState<Lesson[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [learned, setLearned] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = () => api.lessons(BATCH).then((b) => { setBatch(b); setIdx(0); });
  useEffect(() => { load(); }, []);

  const lesson = batch?.[idx];

  const next = async () => {
    if (!lesson || busy) return;
    setBusy(true);
    try {
      await api.learn(lesson.kind, lesson.kind === 'kanji' ? lesson.item.char : lesson.item.id);
      setLearned((n) => n + 1);
      setIdx((i) => i + 1);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (!batch) return <Screen back="#/" title="Lessons"><p className="muted pad">Loading…</p></Screen>;

  if (!lesson) {
    return (
      <Screen back="#/" title="Lessons">
        <div className="done">
          <div className="done-mark jp">{learned ? '覚' : '休'}</div>
          <h2>{learned ? `${learned} new items added` : 'No lessons left today'}</h2>
          <p className="muted">
            {learned ? 'They’re due for review now — quiz yourself while they’re fresh.' : 'Raise the daily limits in Settings if you want more.'}
          </p>
          {learned > 0 && <a className="btn primary" href="#/review">Review them</a>}
          {learned > 0 && <button className="btn" onClick={() => { setLearned(0); load(); }}>More lessons</button>}
          <a className="btn ghost" href="#/">Home</a>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back="#/" title={<span className="counter">{idx + 1} / {batch.length}</span>}>
      <div className="study">
        {lesson.kind === 'kanji' ? (
          <>
            <div className="prompt-card kanji">
              <div className="prompt-meta"><span className="kind">New kanji</span><LevelBadge jlpt={lesson.item.jlpt} /></div>
              <div className="prompt jp k">{lesson.item.char}</div>
            </div>
            <div className="reveal">
              <p className="meaning">{lesson.item.meanings.join(', ')}</p>
              <Readings k={lesson.item} />
              <PartsHint k={lesson.item} />
              <p className="muted small">
                {lesson.item.grade ? `Grade ${lesson.item.grade}` : 'Secondary school'}
                {lesson.item.freq ? ` · #${lesson.item.freq} most common` : ''}
              </p>
              <h3>Stroke order</h3>
              <StrokeOrder key={lesson.item.char} char={lesson.item.char} size={150} />
              {lesson.item.vocab.length > 0 && <h3>Words that use it</h3>}
              <div className="vlist">{lesson.item.vocab.slice(0, 5).map((v) => <VocabRow key={v.id} v={v} href={false} />)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="prompt-card vocab">
              <div className="prompt-meta"><span className="kind">New word</span><LevelBadge jlpt={lesson.item.jlpt} /></div>
              <div className={`prompt jp v len-${Math.min(lesson.item.word.length, 6)}`}>{lesson.item.word}</div>
            </div>
            <div className="reveal">
              <p className="big-reading jp">{lesson.item.readings.join('・')}<SpeakButton text={lesson.item.readings[0]} /></p>
              <p className="meaning">{lesson.item.meaning}</p>
              <Example id={lesson.item.id} />
              {lesson.item.alt.length > 0 && <p className="muted">Also written {lesson.item.alt.join('、')}</p>}
              <div className="chips">
                {lesson.item.kanji.map((k) => (
                  <a key={k.char} className="chip" href={kanjiHref(k.char)}><span className="jp">{k.char}</span>{k.meanings[0]}</a>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="lesson-nav">
          <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Back</button>
          <button className="btn primary" disabled={busy} onClick={next}>Got it</button>
        </div>
      </div>
    </Screen>
  );
}
