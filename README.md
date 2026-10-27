# Kanji

A reading-focused study app for the ~2,200 JLPT N5–N1 kanji and ~8,000 words, with FSRS spaced repetition and KanjiVG stroke-order animation. It runs entirely in the browser and works offline, so it can be hosted as static files (e.g. GitHub Pages) and installed to a phone's Home Screen.

## Setup

Requires Node 22.18+ (runs the TypeScript build script directly).

```sh
npm install
npm run build:data   # downloads sources into data/raw/, writes web/public/data/*.json
npm run dev          # Vite dev server (also reachable from your phone on the LAN)
npm run build        # static site in web/dist/
npm run preview      # serve the production build locally
```

Offline mode needs a service worker, which browsers only allow over HTTPS or on `localhost`. Use `npm run dev` over the LAN for quick testing; use the HTTPS deploy below for real offline use on a phone.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the data and app on every push to `main` and publishes `web/dist`. To enable it, push the repo to GitHub, then open **Settings → Pages** and set **Source** to **GitHub Actions**. Open the Pages URL on your phone and choose **Add to Home Screen**. After the first load it works offline.

The build uses relative paths, so it works under any subpath (such as `/kanji/`).

## How it works

- **Lessons**: new kanji in JLPT order (N5 first), most frequent first, with each kanji's parts taught before it within a level. Each lesson has an animated stroke-order diagram. Each word unlocks once you've learned all of its kanji. Daily limits are set in Settings.
- **Parts and sound families**: each kanji page breaks the kanji into its components (from KanjiVG), marking the radical and the part that hints at the on'yomi. It also lists the other JLPT kanji built on that sound part (飯 → 反 販 版 坂 板, all ハン) and fades the exceptions. Lesson and review cards show a one-line version (飠 eat + 反 ハン).
- **How readings work**: a short guide (linked from Home and every kanji page) to on and kun readings, which one a word uses, sound changes in compounds, irregular words, and sound parts.
- **Reviews**: kanji cards ask for the English meaning (lenient about typos); word cards ask for the reading. Romaji converts to kana as you type, and a Japanese keyboard works too. Readings are learned through words, not drilled per kanji, though Settings can switch kanji cards to accept any on/kun reading instead.
- **Memory stories**: each part gets a recurring character you invent (cast once, reused in every kanji containing it), and each kanji gets a short scene. The scene builder ticks off each character and the keyword as you type, offers random twists ("Spark") and, for kanji with a sound part, an optional sound hook using a word you know. In reviews, 💡 shows your characters and then your scene with the keyword blanked (a hinted answer is graded Hard at most). After you answer, your scene is shown, and kanji missed 3+ times are flagged for a rewrite. Characters and scenes are part of the progress log, so they sync and back up with everything else.
- **Example sentences**: words show a short Tatoeba sentence with its English translation, and a speaker button reads the word or sentence aloud using the device's Japanese voice (works offline). Correct answers let you grade Hard/Good/Easy; a wrong answer means Again (or "I was right" for typos). On desktop, Enter picks the suggested grade and 1–4 pick any grade.
- **Progress**: stored in the browser (IndexedDB) as an append-only event log ("learned X", "reviewed X: Good"). Card state is rebuilt by replaying the log through FSRS, which is deterministic.
- **Sync**: Settings → Export progress produces a JSON file (on a phone, the share sheet lets you AirDrop it or save it to Files). Import it on the other device. An import merges the logs, deduplicating events by id, so you can sync in either direction, any number of times, without overwriting anything. The export file is also your backup.
- **Offline**: a service worker (generated at build time from `web/sw.js`) precaches the app and data. Each build gets a new cache version, and the app updates the next time it's opened online.

Words are keyed by `word|reading` and kanji by character, so rebuilding the data from newer sources keeps your progress attached.

## Data sources

- Kanji: [kanji-data](https://github.com/davidluzgouveia/kanji-data) (MIT), derived from KANJIDIC2, with JLPT levels from Jonathan Waller's lists
- JLPT vocabulary: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT)
- Extra example words: [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) (CC BY-SA 4.0, EDRDG)
- Example sentences: [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR)
- Stroke order, components and sound parts: [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel (CC BY-SA 3.0)
