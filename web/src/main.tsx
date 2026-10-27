import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LearnSession from './Learn.tsx';
import ReviewSession from './Review.tsx';
import { Browse, Home, KanjiPage, SettingsPage, VocabPage } from './pages.tsx';
import { useRoute } from './ui.tsx';
import './styles.css';

function App() {
  const [page = '', arg] = useRoute();
  // Study sessions are full-screen; everything else gets the tab bar.
  if (page === 'review') return <ReviewSession />;
  if (page === 'learn') return <LearnSession />;

  let body;
  if (page === 'browse') body = <Browse level={Number(arg) || 5} />;
  else if (page === 'kanji' && arg) body = <KanjiPage char={arg} />;
  else if (page === 'vocab' && arg) body = <VocabPage id={arg} />;
  else if (page === 'settings') body = <SettingsPage />;
  else body = <Home />;

  const tab = page === 'kanji' || page === 'vocab' ? 'browse' : page || 'home';
  return (
    <>
      <main className="with-tabs">{body}</main>
      <nav className="tabs">
        <a href="#/" className={tab === 'home' ? 'on' : ''}><span className="jp">家</span>Home</a>
        <a href="#/browse" className={tab === 'browse' ? 'on' : ''}><span className="jp">索</span>Browse</a>
        <a href="#/settings" className={tab === 'settings' ? 'on' : ''}><span className="jp">設</span>Settings</a>
      </nav>
    </>
  );
}

// Precaches the app for offline use. Service workers need HTTPS (or localhost).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker not registered', e));
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
