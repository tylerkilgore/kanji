import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Settings } from './types.ts';
import { api } from './store.ts';
import StrokeOrder from './StrokeOrder.tsx';
import { LevelBadge, Readings, Screen, StatusTag, VocabRow, kanjiHref, useLoad } from './ui.tsx';

function untilText(ms: number) {
  const m = Math.max(1, Math.round((ms - Date.now()) / 60_000));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

export function Home() {
  const [s, reload] = useLoad(api.summary, []);
  useEffect(() => {
    const onFocus = () => reload();
    addEventListener('focus', onFocus);
    return () => removeEventListener('focus', onFocus);
  }, []);
  if (!s) return <Screen><p className="muted pad">Loading…</p></Screen>;

  const totalKanji = s.levels.reduce((n, l) => n + l.total, 0);
  const startedKanji = s.levels.reduce((n, l) => n + l.started, 0);

  return (
    <Screen>
      <div className="home">
        <div className="brand"><span className="jp">漢字</span><small>{startedKanji} / {totalKanji} kanji started</small></div>

        <div className="actions">
          <a className={`action review ${s.due ? '' : 'idle'}`} href="#/review">
            <span className="n">{s.due}</span>
            <span className="l">Reviews due</span>
            {!s.due && s.nextDue && <span className="sub">next in {untilText(s.nextDue)}</span>}
          </a>
          <a className={`action learn ${s.lessons ? '' : 'idle'}`} href="#/learn">
            <span className="n">{s.lessons}</span>
            <span className="l">Lessons left today</span>
          </a>
        </div>

        <section className="panel">
          <h3>Today</h3>
          <div className="today">
            <div><b>{s.today.reviews}</b><span>reviews</span></div>
            <div><b>{s.today.reviews ? `${Math.round((s.today.correct / s.today.reviews) * 100)}%` : '–'}</b><span>accuracy</span></div>
            <div><b>{s.today.kanji}</b><span>new kanji</span></div>
            <div><b>{s.today.vocab}</b><span>new words</span></div>
          </div>
        </section>

        <section className="panel">
          <h3>Progress</h3>
          {s.levels.map((l) => <Bar key={l.jlpt} label={`N${l.jlpt}`} href={`#/browse/${l.jlpt}`} {...l} />)}
          <Bar label="Words" {...s.vocab} />
          <p className="legend"><i className="lg-m" /> mastered (3+ weeks) <i className="lg-s" /> started</p>
        </section>
      </div>
    </Screen>
  );
}

function Bar({ label, total, started, mastered, href }: {
  label: string; total: number; started: number; mastered: number; href?: string;
}) {
  const pct = (n: number) => `${(n / total) * 100}%`;
  const body = (
    <>
      <span className="bl">{label}</span>
      <span className="track">
        <span className="started" style={{ width: pct(started) }} />
        <span className="mastered" style={{ width: pct(mastered) }} />
      </span>
      <span className="bn">{started}<small>/{total}</small></span>
    </>
  );
  return href ? <a className="bar" href={href}>{body}</a> : <div className="bar">{body}</div>;
}

export function Browse({ level }: { level: number }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const [list] = useLoad(() => api.kanjiList(level), [level]);
  const [results] = useLoad(() => (query ? api.search(query) : Promise.resolve(null)), [query]);

  return (
    <Screen title="Browse">
      <div className="browse">
        <input
          className="search" type="search" lang="ja" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search kanji, kana or English" autoCapitalize="none" autoCorrect="off"
        />
        {query ? (
          results && (
            <>
              {results.kanji.length > 0 && <div className="grid">{results.kanji.map((k) => <Tile key={k.char} {...k} />)}</div>}
              <div className="vlist">{results.vocab.map((v) => <VocabRow key={v.id} v={v} />)}</div>
              {!results.kanji.length && !results.vocab.length && <p className="muted pad">No matches.</p>}
            </>
          )
        ) : (
          <>
            <nav className="levels">
              {[5, 4, 3, 2, 1].map((n) => (
                <a key={n} href={`#/browse/${n}`} className={n === level ? 'on' : ''}>N{n}</a>
              ))}
            </nav>
            <div className="grid">{list?.map((k) => <Tile key={k.char} {...k} />)}</div>
          </>
        )}
      </div>
    </Screen>
  );
}

function Tile({ char, meaning, status }: { char: string; meaning: string; status?: string }) {
  return (
    <a className={`tile s-${status}`} href={kanjiHref(char)} title={meaning}>
      <span className="jp">{char}</span>
      <small>{meaning}</small>
    </a>
  );
}

export function KanjiPage({ char }: { char: string }) {
  const [k] = useLoad(() => api.kanji(char), [char]);
  if (!k) return <Screen back="history"><p className="muted pad">Loading…</p></Screen>;
  return (
    <Screen back="history" title={<><LevelBadge jlpt={k.jlpt} /> <StatusTag status={k.status} /></>}>
      <div className="detail">
        <div className="hero jp">{k.char}</div>
        <p className="meaning">{k.meanings.join(', ')}</p>
        <Readings k={k} />
        <p className="muted small center">
          {k.grade ? `Grade ${k.grade}` : 'Secondary school'}{k.freq ? ` · #${k.freq} most common` : ''}
        </p>
        <h3>Stroke order</h3>
        <StrokeOrder char={k.char} />
        <h3>Words <small className="muted">{k.vocab.length}</small></h3>
        <div className="vlist">{k.vocab.map((v) => <VocabRow key={v.id} v={v} />)}</div>
        {!k.vocab.length && <p className="muted">Mostly used in names; no common words found.</p>}
      </div>
    </Screen>
  );
}

export function VocabPage({ id }: { id: string }) {
  const [v] = useLoad(() => api.vocab(id), [id]);
  if (!v) return <Screen back="history"><p className="muted pad">Loading…</p></Screen>;
  return (
    <Screen back="history" title={<><LevelBadge jlpt={v.jlpt} /> <StatusTag status={v.status} /></>}>
      <div className="detail">
        <div className={`hero jp v len-${Math.min(v.word.length, 6)}`}>{v.word}</div>
        <p className="big-reading jp">{v.readings.join('・')}</p>
        <p className="meaning">{v.meaning}</p>
        {v.alt.length > 0 && <p className="muted">Also written {v.alt.join('、')}</p>}
        <h3>Kanji</h3>
        <div className="vlist">
          {v.kanji.map((k) => (
            <a key={k.char} className="vrow" href={kanjiHref(k.char)}>
              <span className="vword jp">{k.char}</span><span className="vmean">{k.meanings.join(', ')}</span>
            </a>
          ))}
        </div>
        {v.source === 'jmdict' && <p className="muted small">Not on the JLPT word lists; included as a common example word.</p>}
      </div>
    </Screen>
  );
}

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.settings().then(setS); }, []);
  if (!s) return <Screen title="Settings"><p className="muted pad">Loading…</p></Screen>;

  const save = async (patch: Partial<Settings>) => {
    setS(await api.saveSettings(patch));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <Screen title="Settings" actions={saved && <span className="muted small">Saved</span>}>
      <div className="settings">
        <Field label="New kanji per day" hint="Each kanji unlocks several words, so keep this modest.">
          <Stepper value={s.kanjiPerDay} step={1} min={0} max={100} onChange={(v) => save({ kanjiPerDay: v })} />
        </Field>
        <Field label="New words per day" hint="Words unlock once you’ve learned all their kanji.">
          <Stepper value={s.vocabPerDay} step={5} min={0} max={300} onChange={(v) => save({ vocabPerDay: v })} />
        </Field>
        <Field label="Target retention" hint="Higher means more frequent reviews. 90% is a good default.">
          <Stepper value={Math.round(s.retention * 100)} step={1} min={70} max={97} suffix="%" onChange={(v) => save({ retention: v / 100 })} />
        </Field>
        <Sync onImported={() => api.settings().then(setS)} />
        <p className="muted small credits">
          Kanji data from KANJIDIC2 via kanji-data, JLPT levels from Jonathan Waller’s lists, example words from
          JMdict (EDRDG, CC BY-SA 4.0), stroke order from KanjiVG by Ulrich Apel (CC BY-SA 3.0).
        </p>
      </div>
    </Screen>
  );
}

const LAST_EXPORT = 'kanji:lastExport';

function readLastExport(): number | null {
  try { return Number(localStorage.getItem(LAST_EXPORT)) || null; } catch { return null; }
}

// Manual sync: export this device's progress log, import it on another. Imports
// merge logs (deduplicated), so either direction, any number of times, is safe.
function Sync({ onImported }: { onImported: () => void }) {
  const [info, reload] = useLoad(api.info, []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastExport, setLastExport] = useState(readLastExport);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted, () => {}); }, []);

  const doExport = async () => {
    const json = JSON.stringify(await api.exportFile());
    const name = `kanji-progress-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }); // iOS/Android share sheet: AirDrop, Files, …
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setMsg({ text: `Export failed: ${(e as Error).message}`, err: true });
      return;
    }
    const now = Date.now();
    try { localStorage.setItem(LAST_EXPORT, String(now)); } catch { /* storage unavailable */ }
    setLastExport(now);
    setMsg({ text: `Exported ${info?.events ?? ''} events.` });
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { added, total } = await api.importFile(JSON.parse(await file.text()));
      setMsg({ text: added ? `Merged ${added} new events (of ${total} in the file).` : 'Already up to date: nothing new in that file.' });
      reload();
      onImported();
    } catch (e) {
      setMsg({ text: `Import failed: ${(e as Error).message}`, err: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="sync">
      <b>Sync between devices</b>
      <p className="muted small">
        Export here, then import the file on your other device (and the other way round). Importing merges
        progress, so nothing is overwritten and repeating an import is harmless.
      </p>
      <div className="sync-buttons">
        <button className="btn" onClick={doExport}>Export progress</button>
        <button className="btn" onClick={() => fileInput.current?.click()}>Import…</button>
      </div>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
      {msg && <p className={`sync-msg ${msg.err ? 'err' : ''}`}>{msg.text}</p>}
      <p className="muted small" style={{ marginTop: '0.75rem' }}>
        {info ? `${info.cards} cards, ${info.events} events on this device. ` : ''}
        {lastExport ? `Last exported ${new Date(lastExport).toLocaleDateString()}. ` : 'Never exported. '}
        {persisted === false && 'Your browser may clear this data if the app goes unused; add it to your Home Screen and export now and then as a backup.'}
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="field">
      <div><b>{label}</b><p className="muted small">{hint}</p></div>
      {children}
    </div>
  );
}

function Stepper({ value, step, min, max, suffix = '', onChange }: {
  value: number; step: number; min: number; max: number; suffix?: string; onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="stepper">
      <button onClick={() => set(value - step)} aria-label="Decrease">−</button>
      <span>{value}{suffix}</span>
      <button onClick={() => set(value + step)} aria-label="Increase">+</button>
    </div>
  );
}
