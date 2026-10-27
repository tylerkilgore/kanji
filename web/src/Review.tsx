import { useEffect, useMemo, useRef, useState } from 'react';
import type { Review } from './types.ts';
import { api } from './store.ts';
import { isCorrect, kanjiAnswers, normalize } from './kana.ts';
import { KanaInput, LevelBadge, Readings, Screen, VocabRow, kanjiHref } from './ui.tsx';

const RATINGS = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
] as const;

const accepted = (r: Review) =>
  r.kind === 'kanji' ? kanjiAnswers(r.item) : r.item.readings.map(normalize);

export default function ReviewSession() {
  const [queue, setQueue] = useState<Review[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [given, setGiven] = useState('');
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [stats, setStats] = useState({ done: 0, correct: 0 });
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());

  // Cards in short learning steps (1m, 10m) come due again during a session,
  // so refetch whenever we reach the end of the current batch.
  const load = () => api.reviews(20).then((q) => { setQueue(q); setIdx(0); });
  useEffect(() => { load(); }, []);

  const card = queue?.[idx];
  const answers = useMemo(() => (card ? accepted(card) : []), [card]);

  const submit = (skip = false) => {
    if (!card || result) return;
    if (!skip && !given.trim()) return;
    setResult({ correct: !skip && isCorrect(given, answers) });
  };

  const rate = async (rating: number) => {
    if (!card || !result || busy) return;
    setBusy(true);
    try {
      await api.answer(card.key, rating as 1 | 2 | 3 | 4, given, Date.now() - started.current);
      setStats((s) => ({ done: s.done + 1, correct: s.correct + (rating > 1 ? 1 : 0) }));
      setGiven('');
      setResult(null);
      started.current = Date.now();
      if (idx + 1 < queue!.length) setIdx(idx + 1);
      else await load();
    } finally {
      setBusy(false);
    }
  };

  // Desktop shortcuts: Enter for the suggested grade, 1–4 for any grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result) return;
      if (/^[1-4]$/.test(e.key)) rate(Number(e.key));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (!queue) return <Screen back="#/" title="Reviews"><p className="muted pad">Loading…</p></Screen>;

  if (!card) {
    return (
      <Screen back="#/" title="Reviews">
        <div className="done">
          <div className="done-mark jp">済</div>
          <h2>All caught up</h2>
          {stats.done > 0 && (
            <p className="muted">{stats.done} reviewed · {Math.round((stats.correct / stats.done) * 100)}% correct</p>
          )}
          <a className="btn primary" href="#/">Home</a>
        </div>
      </Screen>
    );
  }

  const isKanji = card.kind === 'kanji';
  const prompt = isKanji ? card.item.char : card.item.word;

  return (
    <Screen back="#/" title={<span className="counter">{stats.done} done · {queue.length - idx} in batch</span>}>
      <div className={`study ${result ? (result.correct ? 'is-right' : 'is-wrong') : ''}`}>
        <div className={`prompt-card ${card.kind}`}>
          <div className="prompt-meta">
            <span className="kind">{isKanji ? 'Kanji · any reading' : 'Vocabulary · reading'}</span>
            <LevelBadge jlpt={card.item.jlpt} />
          </div>
          <div className={`prompt jp ${isKanji ? 'k' : 'v'} len-${Math.min(prompt.length, 6)}`}>{prompt}</div>
        </div>

        <div className="answer-row">
          <KanaInput
            className="answer"
            value={given}
            onChange={setGiven}
            readOnly={!!result}
            placeholder="type the reading (romaji ok)"
            onEnter={() => (result ? rate(result.correct ? 3 : 1) : submit())}
          />
          {!result && <button className="btn ghost" onClick={() => submit(true)}>?</button>}
        </div>

        {result && (
          <>
            <div className="verdict">
              {result.correct ? 'Correct' : given ? 'Not quite' : 'Revealed'}
              {!result.correct && given && (
                <button className="linklike" onClick={() => setResult({ correct: true })}>I was right</button>
              )}
            </div>

            <div className="grades">
              {RATINGS.filter((r) => (result.correct ? r.value > 1 : r.value === 1)).map((r) => (
                <button
                  key={r.value}
                  className={`grade g${r.value} ${r.value === (result.correct ? 3 : 1) ? 'suggested' : ''}`}
                  disabled={busy}
                  onClick={() => rate(r.value)}
                >
                  <span>{r.label}</span>
                  <small>{card.intervals[r.value]}</small>
                </button>
              ))}
            </div>

            <div className="reveal">
              {card.kind === 'kanji' ? (
                <>
                  <p className="meaning">{card.item.meanings.join(', ')}</p>
                  <Readings k={card.item} />
                  <div className="vlist">
                    {card.item.vocab.filter((v) => v.status !== 'locked').concat(card.item.vocab.filter((v) => v.status === 'locked'))
                      .slice(0, 4).map((v) => <VocabRow key={v.id} v={v} />)}
                  </div>
                  <a className="more" href={kanjiHref(card.item.char)}>Details ›</a>
                </>
              ) : (
                <>
                  <p className="big-reading jp">{card.item.readings.join('・')}</p>
                  <p className="meaning">{card.item.meaning}</p>
                  {card.item.alt.length > 0 && <p className="muted">Also written {card.item.alt.join('、')}</p>}
                  <div className="chips">
                    {card.item.kanji.map((k) => (
                      <a key={k.char} className="chip" href={kanjiHref(k.char)}>
                        <span className="jp">{k.char}</span>{k.meanings[0]}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
