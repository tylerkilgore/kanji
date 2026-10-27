import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardStatus, KanjiItem, VocabItem } from './types.ts';
import { kunParts, liveKana, onDisplay } from './kana.ts';

export function useRoute(): string[] {
  const read = () => (location.hash.slice(1) || '/').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => { setRoute(read()); window.scrollTo(0, 0); };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const go = (path: string) => { location.hash = path; };
export const kanjiHref = (char: string) => `#/kanji/${encodeURIComponent(char)}`;

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d), (e) => console.error(e));
    return () => { live = false; };
  }, [...deps, n]);
  return [data, () => setN((x) => x + 1)];
}

const STATUS_LABEL: Record<CardStatus, string> = {
  locked: 'Locked', new: 'New', learning: 'Learning', review: 'Reviewing', mastered: 'Mastered',
};

export const StatusDot = ({ status }: { status?: CardStatus }) =>
  status ? <span className={`dot s-${status}`} title={STATUS_LABEL[status]} /> : null;

export const StatusTag = ({ status }: { status?: CardStatus }) =>
  status ? <span className={`tag s-${status}`}>{STATUS_LABEL[status]}</span> : null;

export function Readings({ k }: { k: Pick<KanjiItem, 'on' | 'kun'> }) {
  return (
    <div className="readings">
      {k.on.length > 0 && (
        <div><span className="rlabel">On</span>{k.on.map((r) => <span key={r} className="reading">{onDisplay(r)}</span>)}</div>
      )}
      {k.kun.length > 0 && (
        <div><span className="rlabel">Kun</span>{k.kun.map((r) => {
          const [stem, oku] = kunParts(r);
          return <span key={r} className="reading">{stem}{oku && <span className="oku">{oku}</span>}</span>;
        })}</div>
      )}
    </div>
  );
}

export function VocabRow({ v, href = true }: { v: VocabItem; href?: boolean }) {
  const body = (
    <>
      <span className="vword jp">{v.word}</span>
      <span className="vread">{v.readings.join('・')}</span>
      <span className="vmean">{v.meaning}</span>
      <StatusDot status={v.status} />
    </>
  );
  return href ? <a className="vrow" href={`#/vocab/${encodeURIComponent(v.id)}`}>{body}</a> : <div className="vrow">{body}</div>;
}

export function LevelBadge({ jlpt }: { jlpt: number | null }) {
  return jlpt ? <span className="badge">N{jlpt}</span> : null;
}

// Text input that converts romaji to hiragana as you type, but leaves a native
// Japanese keyboard's composition alone until it commits.
export function KanaInput(props: {
  value: string; onChange: (v: string) => void; onEnter: () => void;
  readOnly?: boolean; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [props.readOnly]);
  return (
    <input
      ref={ref}
      className={props.className}
      lang="ja"
      value={props.value}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => { composing.current = false; props.onChange(liveKana(e.currentTarget.value)); }}
      onChange={(e) => props.onChange(composing.current ? e.target.value : liveKana(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); props.onEnter(); }
      }}
    />
  );
}

// `back` is a hash link, or 'history' to go to the previous page.
export function Screen({ title, back, children, actions }: {
  title?: ReactNode; back?: string; children: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="screen">
      {(title || back) && (
        <header className="topbar">
          {back === 'history'
            ? <button className="back" onClick={() => (history.length > 1 ? history.back() : go('/'))} aria-label="Back">‹</button>
            : back && <a className="back" href={back} aria-label="Back">‹</a>}
          <h1>{title}</h1>
          <div className="topbar-actions">{actions}</div>
        </header>
      )}
      {children}
    </div>
  );
}
