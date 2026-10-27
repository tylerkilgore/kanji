import { useEffect, useRef, useState } from 'react';
import type { Review, Settings } from './types.ts';
import { api } from './store.ts';
import { isCorrect, kanjiAnswers, normalize } from './kana.ts';
import { Example, SpeakButton } from './Example.tsx';
import { meaningCorrect } from './meaning.ts';
import { PartsHint } from './Parts.tsx';
import { StoryRecall } from './Story.tsx';
import { blankOut } from './story.ts';
import { KanaInput, LevelBadge, Readings, Screen, VocabRow, kanjiHref } from './ui.tsx';

const RATINGS = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
] as const;

type Prompt = Settings['kanjiPrompt'];

// Kanji cards ask for the meaning (or, if set, any reading); word cards always ask the reading.
const asksMeaning = (r: Review, prompt: Prompt) => r.kind === 'kanji' && prompt === 'meaning';

function check(r: Review, prompt: Prompt, given: string): boolean {
  if (asksMeaning(r, prompt)) return r.kind === 'kanji' && meaningCorrect(given, r.item.meanings);
  const accepted = r.kind === 'kanji' ? kanjiAnswers(r.item) : r.item.readings.map(normalize);
  return isCorrect(given, accepted);
}

export default function ReviewSession() {
  const [queue, setQueue] = useState<Review[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [given, setGiven] = useState('');
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [stats, setStats] = useState({ done: 0, correct: 0 });
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>('meaning');
  const [hint, setHint] = useState(0); // 1: your characters, 2: your scene with the keyword blanked
  const started = useRef(Date.now());

  // Cards in short learning steps (1m, 10m) come due again during a session,
  // so refetch whenever we reach the end of the current batch.
  const load = () => api.reviews(20).then((q) => { setQueue(q); setIdx(0); });
  useEffect(() => { api.settings().then((s) => setPrompt(s.kanjiPrompt)); load(); }, []);

  const card = queue?.[idx];

  const submit = (skip = false) => {
    if (!card || result) return;
    if (!skip && !given.trim()) return;
    setResult({ correct: !skip && check(card, prompt, given) });
  };

  const rate = async (rating: number) => {
    if (!card || !result || busy) return;
    setBusy(true);
    try {
      await api.answer(card.key, rating as 1 | 2 | 3 | 4, given, Date.now() - started.current);
      setStats((s) => ({ done: s.done + 1, correct: s.correct + (rating > 1 ? 1 : 0) }));
      setGiven('');
      setResult(null);
      setHint(0);
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
      if (/^[1-4]$/.test(e.key) && !(hint && result.correct && Number(e.key) > 2)) rate(Number(e.key));
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
  const meaningCard = asksMeaning(card, prompt);
  // Hints come from your own memory story, on meaning cards only. A hinted answer
  // can be graded Hard at most, so the schedule stays honest.
  const cast = card.kind === 'kanji' ? card.item.partList.filter((p) => p.actor) : [];
  const story = card.kind === 'kanji' ? card.item.story : undefined;
  const hintLevels = meaningCard ? (cast.length ? 1 : 0) + (story ? 1 : 0) : 0;
  const goodGrade = hint ? 2 : 3;
  const shown = isKanji ? card.item.char : card.item.word;

  return (
    <Screen back="#/" title={<span className="counter">{stats.done} done · {queue.length - idx} in batch</span>}>
      <div className={`study ${result ? (result.correct ? 'is-right' : 'is-wrong') : ''}`}>
        <div className={`prompt-card ${card.kind}`}>
          <div className="prompt-meta">
            <span className="kind">{isKanji ? (meaningCard ? 'Kanji · meaning' : 'Kanji · any reading') : 'Vocabulary · reading'}</span>
            <LevelBadge jlpt={card.item.jlpt} />
          </div>
          <div className={`prompt jp ${isKanji ? 'k' : 'v'} len-${Math.min(shown.length, 6)}`}>{shown}</div>
        </div>

        <div className="answer-row">
          <KanaInput
            key={meaningCard ? 'en' : 'ja'}
            className="answer"
            kana={!meaningCard}
            value={given}
            onChange={setGiven}
            readOnly={!!result}
            placeholder={meaningCard ? 'type the meaning in English' : 'type the reading (romaji ok)'}
            onEnter={() => (result ? rate(result.correct ? goodGrade : 1) : submit())}
          />
          {!result && hint < hintLevels && (
            <button className="btn ghost" aria-label="Hint from your story" title="Hint from your story" onClick={() => setHint((h) => h + 1)}>💡</button>
          )}
          {!result && <button className="btn ghost" onClick={() => submit(true)}>?</button>}
        </div>

        {!result && hint > 0 && card.kind === 'kanji' && (
          <div className="hint">
            {(hint === 1 && cast.length) || !story
              ? cast.map((p, i) => <span key={p.c}>{i > 0 && ' + '}<span className="jp">{p.c}</span> {p.actor!.name}{p.n ? ` ×${p.n}` : ''}</span>)
              : blankOut(story, card.item.meanings)}
          </div>
        )}

        {result && (
          <>
            <div className="verdict">
              {result.correct ? 'Correct' : given ? 'Not quite' : 'Revealed'}
              {!result.correct && given && (
                <button className="linklike" onClick={() => setResult({ correct: true })}>I was right</button>
              )}
            </div>

            <div className="grades">
              {RATINGS.filter((r) => (result.correct ? r.value > 1 && r.value <= (hint ? 2 : 4) : r.value === 1)).map((r) => (
                <button
                  key={r.value}
                  className={`grade g${r.value} ${r.value === (result.correct ? goodGrade : 1) ? 'suggested' : ''}`}
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
                  <PartsHint k={card.item} />
                  <StoryRecall k={card.item} />
                  <div className="vlist">
                    {card.item.vocab.filter((v) => v.status !== 'locked').concat(card.item.vocab.filter((v) => v.status === 'locked'))
                      .slice(0, 4).map((v) => <VocabRow key={v.id} v={v} />)}
                  </div>
                  <a className="more" href={kanjiHref(card.item.char)}>Details ›</a>
                </>
              ) : (
                <>
                  <p className="big-reading jp">{card.item.readings.join('・')}<SpeakButton text={card.item.readings[0]} /></p>
                  <p className="meaning">{card.item.meaning}</p>
                  <Example id={card.item.id} />
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
