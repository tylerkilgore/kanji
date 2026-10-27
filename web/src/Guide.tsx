import { api } from './store.ts';
import { Readings, Screen, kanjiHref, useLoad } from './ui.tsx';

// A short explainer on how kanji readings work, with examples. Readings are
// written with the part that comes from the kanji being discussed in [brackets].

type Example = [word: string, reading: string, note: string];

function Reading({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]]+\])/).map((s, i) => (s.startsWith('[') ? <b key={i}>{s.slice(1, -1)}</b> : s))}</>;
}

function Examples({ rows }: { rows: Example[] }) {
  return (
    <div className="vlist guide-ex">
      {rows.map(([word, reading, note]) => (
        <div key={word + reading} className="vrow">
          <span className="vword jp">{word}</span>
          <span className="vread jp"><Reading text={reading} /></span>
          <span className="vmean">{note}</span>
        </div>
      ))}
    </div>
  );
}

const K = ({ c }: { c: string }) => <a className="jp klink" href={kanjiHref(c)}>{c}</a>;

export default function Guide() {
  const [shoku] = useLoad(() => api.kanji('食'), []);

  return (
    <Screen back="history" title="How readings work">
      <div className="guide">
        <p className="lead">
          A kanji has a meaning and usually several readings. Each <em>word</em> uses one of them, so you
          learn which reading applies by learning words.
        </p>

        <h3>One kanji, many sounds</h3>
        <p><K c="日" /> means "sun, day". Here's how it's read in different words:</p>
        <Examples rows={[
          ['毎日', 'まい[にち]', 'every day: on reading'],
          ['日本', '[に]ほん', 'Japan: on reading, shortened'],
          ['日曜日', 'にちよう[び]', 'Sunday: kun reading ひ, voiced'],
          ['日', '[ひ]', 'day, sun: kun reading, on its own'],
          ['今日', '[きょう]', 'today: irregular, read as a whole'],
        ]} />

        <h3>Two kinds of reading</h3>
        <p>
          <b>On'yomi</b> (音読み) are borrowed Chinese pronunciations. They're short, often one or two
          syllables like ショク or ニチ, and many kanji share the same one. The app shows them in katakana.
        </p>
        <p>
          <b>Kun'yomi</b> (訓読み) are native Japanese words that were assigned to the kanji. The app shows them
          in hiragana, with the okurigana (the hiragana written after the kanji) faded after a dot.
        </p>
        {shoku && <div className="guide-demo"><span className="jp">食</span><Readings k={shoku} /></div>}

        <h3>Which reading does a word use?</h3>
        <p><b>Kanji followed by hiragana → kun.</b> Verbs and adjectives are written this way.</p>
        <Examples rows={[
          ['食べる', '[た]べる', 'to eat'],
          ['生きる', '[い]きる', 'to live'],
          ['大きい', '[おお]きい', 'big'],
        ]} />
        <p><b>Two or more kanji together → on.</b> Most compound words, especially abstract ones.</p>
        <Examples rows={[
          ['食事', '[しょく]じ', 'meal'],
          ['先生', 'せん[せい]', 'teacher'],
          ['大学', '[だい]がく', 'university'],
        ]} />
        <p>
          <b>A kanji on its own → usually kun</b> (山 やま, 水 みず), though some are on (本 ほん, 肉 にく).
        </p>
        <p>These rules cover most words. Some compounds mix the two, or use kun throughout:</p>
        <Examples rows={[
          ['場所', '[ば]しょ', 'place: kun + on'],
          ['毎朝', 'まい[あさ]', 'every morning: on + kun'],
          ['手紙', 'て[がみ]', 'letter: kun + kun'],
        ]} />

        <h3>Sounds change when joined</h3>
        <p>
          In compounds, a reading can become voiced (か → が), turn into a small っ, or shift ほ → ぽ. Recognize the base reading
          and allow for these changes.
        </p>
        <Examples rows={[
          ['手紙', 'て[がみ]', 'かみ becomes がみ'],
          ['人々', 'ひと[びと]', 'ひと becomes びと'],
          ['学校', '[がっ]こう', 'がく becomes がっ'],
          ['一本', 'いっ[ぽん]', 'ほん becomes ぽん'],
          ['三本', 'さん[ぼん]', 'ほん becomes ぼん'],
        ]} />

        <h3>Irregular words</h3>
        <p>
          A few common words are read as a whole, ignoring the readings of their kanji (熟字訓, jukujikun).
          Learn these as words.
        </p>
        <Examples rows={[
          ['今日', '[きょう]', 'today'],
          ['明日', '[あした]', 'tomorrow'],
          ['昨日', '[きのう]', 'yesterday'],
          ['大人', '[おとな]', 'adult'],
          ['一人', '[ひとり]', 'one person, alone'],
        ]} />

        <h3>Sound parts</h3>
        <p>
          Most kanji combine a part that hints at the meaning with a part that hints at the on'yomi. Kanji that
          share a sound part often share a reading:
        </p>
        <Examples rows={[
          ['反', '[ハン]', 'the sound part'],
          ['飯 販 版 坂 板', '[ハン]', 'meal, sell, printing, slope, board'],
          ['晴 清 精 静', '[セイ]', 'all built on 青 セイ'],
        ]} />
        <p>
          This is a strong hint, not a rule: <K c="特" /> is built on 寺 but reads トク, while its relatives 時, 持
          and 侍 read ジ. Each kanji page shows its parts and its sound family, with exceptions faded. See <K c="飯" /> for an example.
        </p>

        <h3>Memory stories</h3>
        <p>
          Each part gets a recurring <b>character</b>, which you invent once and reuse everywhere the part appears
          (木 might be a grumpy old oak). Each kanji gets a short <b>scene</b> that puts its characters together with
          its meaning. The scene builder checks off each character and the keyword as you write, and <b>Spark</b>
          deals a twist when you're stuck. Strange, loud and smelly scenes stick best.
        </p>
        <p>
          In reviews, 💡 shows your characters, then your scene with the keyword blanked. A hinted answer can be
          graded Hard at most. Kanji you keep missing get flagged so you can rewrite their scenes. All your characters are
          on the <a href="#/cast">Cast</a> page.
        </p>

        <h3>How the app trains this</h3>
        <p>
          <b>Kanji cards</b> ask for the meaning. Within each level, a kanji's parts are taught before the kanji
          itself, so each new kanji is made of pieces you already know. Readings aren't drilled one kanji at a time.
          (If you'd rather type any reading instead, change it in Settings.)
        </p>
        <p>
          <b>Word cards</b> unlock once you've learned a word's kanji and ask for the reading. They train the skill
          that matters: choosing the right reading in context. Example sentences and audio show the word in use.
          After a few hundred kanji, you'll start guessing the readings of new words from the ones you know.
        </p>
      </div>
    </Screen>
  );
}
