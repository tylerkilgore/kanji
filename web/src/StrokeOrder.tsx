import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StrokeData } from './types.ts';
import { strokes } from './store.ts';

const SECONDS_PER_UNIT = 0.008; // drawing speed, in 109-unit KanjiVG space
const PAUSE = 0.18; // between strokes

// Animated stroke order from KanjiVG. Tap to replay; numbers mark where each stroke starts.
export default function StrokeOrder({ char, size = 180 }: { char: string; size?: number }) {
  const [data, setData] = useState<StrokeData | null | undefined>(undefined);
  const [run, setRun] = useState(0);
  const [numbers, setNumbers] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let live = true;
    setData(undefined);
    strokes(char).then((d) => live && setData(d), () => live && setData(null));
    return () => { live = false; };
  }, [char]);

  // Paths only know their length once rendered, so set up each stroke's dash
  // and staggered delay after layout. Reduced motion shows the finished kanji.
  useLayoutEffect(() => {
    if (!svg.current || !data) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let delay = 0.25;
    for (const p of svg.current.querySelectorAll<SVGPathElement>('path.ink')) {
      const len = p.getTotalLength();
      const dur = Math.max(0.25, len * SECONDS_PER_UNIT);
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = reduce ? '0' : `${len}`;
      p.style.animation = reduce ? 'none' : `stroke-draw ${dur}s ease-in-out ${delay}s forwards`;
      delay += dur + PAUSE;
    }
  }, [data, run]);

  if (data === null) return null;

  return (
    <div className="strokes">
      <svg
        key={run}
        ref={svg}
        viewBox="0 0 109 109"
        width={size}
        height={size}
        role="img"
        aria-label={`Stroke order for ${char}`}
        onClick={() => setRun((r) => r + 1)}
      >
        <g className="guide">
          <line x1="54.5" y1="0" x2="54.5" y2="109" />
          <line x1="0" y1="54.5" x2="109" y2="54.5" />
        </g>
        {data && (
          <>
            <g className="ghost">{data.d.map((d, i) => <path key={i} d={d} />)}</g>
            <g>{data.d.map((d, i) => <path key={i} className="ink" d={d} />)}</g>
            {numbers && (
              <g className="nums">{data.n.map(([x, y], i) => <text key={i} x={x} y={y}>{i + 1}</text>)}</g>
            )}
          </>
        )}
      </svg>
      <div className="stroke-controls">
        <button onClick={() => setRun((r) => r + 1)}>↻ Replay</button>
        <button className={numbers ? 'on' : ''} onClick={() => setNumbers((n) => !n)}>1 2 3</button>
        {data && <span className="muted small">{data.d.length} strokes</span>}
      </div>
    </div>
  );
}
