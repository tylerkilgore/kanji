import { useEffect, useState } from 'react';
import type { Sentence } from './types.ts';
import { sentence } from './store.ts';

// Spoken Japanese via the device's own text-to-speech voices, which work offline.
// Hidden when the device has no Japanese voice.

let jaVoice: SpeechSynthesisVoice | null | undefined;
function findVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null; // still loading
  // Prefer the standard voices; Apple also ships novelty ones (Grandpa, Rocko…) that sort first.
  const ja = voices.filter((v) => v.lang.replace('_', '-').startsWith('ja'));
  jaVoice ??= ja.find((v) => /kyoko|otoya|o-ren|hattori/i.test(v.name))
    ?? ja.find((v) => v.localService && !/\(/.test(v.name)) ?? ja.find((v) => v.localService) ?? ja[0] ?? null;
  return jaVoice;
}

function useVoice() {
  const [voice, setVoice] = useState(findVoice);
  useEffect(() => {
    if (voice || !('speechSynthesis' in window)) return;
    const onVoices = () => setVoice(findVoice());
    speechSynthesis.addEventListener('voiceschanged', onVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', onVoices);
  }, [voice]);
  return voice;
}

export function speak(text: string, voice: SpeechSynthesisVoice) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

export function SpeakButton({ text, label = 'Play audio' }: { text: string; label?: string }) {
  const voice = useVoice();
  if (!voice) return null;
  return (
    <button type="button" className="speak" aria-label={label} title={label} onClick={() => speak(text, voice)}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// An example sentence for a word, with the word highlighted where it appears.
export function Example({ id }: { id: string }) {
  const [s, setS] = useState<Sentence | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setS(undefined);
    sentence(id).then((x) => live && setS(x), () => live && setS(null));
    return () => { live = false; };
  }, [id]);
  if (!s) return null;

  const at = s.j.indexOf(s.w);
  return (
    <div className="example">
      <div>
        <p className="ex-ja jp">{at < 0 ? s.j : <>{s.j.slice(0, at)}<mark>{s.w}</mark>{s.j.slice(at + s.w.length)}</>}</p>
        <p className="ex-en">{s.e}</p>
      </div>
      <SpeakButton text={s.j} label="Play sentence" />
    </div>
  );
}
