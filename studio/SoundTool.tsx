// أداة "الصوتيات": مكتبة المزيكا والمؤثرات
//   📚 المكتبة: باقة البداية + اللي استوردته، بتصنيف المود، ومعاينة، و"استخدمها" في الفيديو
//   ⬆ استيراد: ملفات أو فولدر كامل من Pixabay / YouTube Audio Library / Epidemic Sound… مع الترخيص بتاع كل ملف
//   🔎 Freesound: أصوات CC0 مجانية لأي استخدام
//   ✨ ولّد: مزيكا أو مؤثر بالوصف (ElevenLabs)
import { useEffect, useMemo, useRef, useState } from "react";
import { uid } from "../src/scenes/defs";
import type { SoundFxItem } from "../src/lib/soundFx";
import { runJob } from "./jobs";
import { KeyHint, useKeysVersion } from "./settings";

type Sound = {
  path: string;
  name: string;
  kind: string;
  folder: string;
  label: string;
  group: string;
  soundKind: string;
  mood: string;
  category: string;
  license: string;
  source: string;
  credit: string;
  bpm: number;
  duration: number;
};
type Tab = "library" | "import" | "freesound" | "generate";

const moods = ["حماسي", "هادي", "عربي", "شركات", "سينمائي", "درامي", "سعيد", "تكنولوجيا", "متنوع"];
const categories = ["انتقالات", "ضربات", "واجهة", "مرح", "جو وطبيعة", "متنوع"];
// مصادر الترخيص المعروفة (بتتحفظ مع كل ملف عشان تفتكر تقدر تستخدمه فين)
const licenses = [
  { value: "Pixabay Content License: مجاني للتجاري", label: "Pixabay (مجاني، حتى تجاري)" },
  { value: "YouTube Audio Library: راجع شرط ذكر المصدر لكل تراك", label: "YouTube Audio Library" },
  { value: "Epidemic Sound: مسموح طول ما الاشتراك شغال", label: "Epidemic Sound (اشتراك)" },
  { value: "Artlist: مسموح بالاشتراك", label: "Artlist (اشتراك)" },
  { value: "ملكي (تسجيلي أو مشتراة)", label: "ملكي / اشتريته" },
  { value: "CC-BY: لازم ذكر المصدر", label: "Creative Commons BY (لازم ذكر المصدر)" },
  { value: "", label: "مش متأكد" },
];

const sec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const nice = (s: Sound) => s.label || s.name.replace(/^[a-z0-9]+-(?=.)/, "").replace(/\.[a-z0-9]+$/i, "");
const kindOf = (s: Sound) => s.soundKind || (s.duration && s.duration < 7 ? "sfx" : "music");

// ===== مشغّل واحد لكل المعاينات =====
const usePlayer = () => {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => ref.current?.pause(), []);
  const toggle = (src: string) => {
    if (!ref.current) {
      ref.current = new Audio();
      ref.current.onended = () => setPlaying(null);
    }
    if (playing === src) {
      ref.current.pause();
      setPlaying(null);
      return;
    }
    ref.current.src = src.startsWith("http") ? src : `/${src}`;
    ref.current.play().catch(() => setPlaying(null));
    setPlaying(src);
  };
  return { playing, toggle };
};

export const SoundTool: React.FC<{
  canSetMusic: boolean;
  onUseMusic: (path: string) => void;
  canAddFx: boolean;
  onAddFx: (item: SoundFxItem) => void;
  fx: SoundFxItem[];
  onFxChange: (items: SoundFxItem[]) => void;
  playheadMs: number;
  onSeekMs: (ms: number) => void;
}> = ({ canSetMusic, onUseMusic, canAddFx, onAddFx, fx, onFxChange, playheadMs, onSeekMs }) => {
  const [tab, setTab] = useState<Tab>("library");
  const [list, setList] = useState<Sound[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const player = usePlayer();
  const keys = useKeysVersion();

  // الأصوات بس (من غير التعليق الصوتي والتسجيلات والدبلجة)
  const isVoice = (a: Sound) => a.soundKind === "voice" || /^uploads\/(tts|clean|dub|lips|shot)-/.test(a.path);
  const load = () =>
    fetch("/api/assets")
      .then((r) => r.json())
      .then((all: Sound[]) => {
        const sounds = all.filter((a) => a.kind === "audio" && !isVoice(a));
        setList(sounds);
        return sounds;
      })
      .catch(() => [] as Sound[]);
  // الملفات اللي اترفعت من أي حتة تانية في الاستوديو ولسه متحللتش: بنحللها في الخلفية
  const analyzed = useRef(new Set<string>());
  useEffect(() => {
    load().then(async (sounds) => {
      const todo = sounds.filter((s) => s.folder === "uploads" && !s.soundKind && !analyzed.current.has(s.path)).slice(0, 20);
      for (const s of todo) {
        analyzed.current.add(s.path);
        await fetch("/api/sound/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: s.path, name: s.label || s.name }) }).catch(() => {});
      }
      if (todo.length) load();
    });
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };
  const useSound = (s: Sound) => {
    if (kindOf(s) === "music") {
      onUseMusic(s.path);
      flash(`"${nice(s)}" بقت مزيكا الفيديو ✓`);
    } else {
      onAddFx({ id: uid(), src: s.path, atMs: Math.round(playheadMs), volume: 80, label: nice(s) });
      flash(`اتحط "${nice(s)}" عند ${sec(playheadMs / 1000)} ✓`);
    }
  };

  const tabs: [Tab, string][] = [
    ["library", "📚 المكتبة"],
    ["import", "⬆ استيراد"],
    ["freesound", "🔎 Freesound"],
    ["generate", "✨ ولّد"],
  ];

  return (
    <div className="card sounds">
      <div className="seg-toggle" role="tablist" aria-label="الصوتيات">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {msg && <div className="flash">{msg}</div>}

      {tab === "library" && <LibraryTab list={list} player={player} onUse={useSound} canSetMusic={canSetMusic} canAddFx={canAddFx} reload={load} />}
      {tab === "import" && <ImportTab onDone={() => (load(), setTab("library"))} />}
      {tab === "freesound" && <FreesoundTab player={player} keys={keys} onImported={load} />}
      {tab === "generate" && <GenerateTab keys={keys} onMade={load} />}

      {/* المؤثرات اللي في الفيديو ده */}
      {canAddFx && fx.length > 0 && (
        <details className="fx-list" open>
          <summary>🔊 المؤثرات في الفيديو ده ({fx.length})</summary>
          {[...fx]
            .sort((a, b) => a.atMs - b.atMs)
            .map((f) => (
              <div key={f.id} className="fx-row">
                <button type="button" className="link-btn" onClick={() => onSeekMs(f.atMs)}>
                  {sec(f.atMs / 1000)}
                </button>
                <span dir="auto">{f.label || f.src.split("/").pop()}</span>
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={100}
                  value={f.volume}
                  aria-label="الصوت"
                  onChange={(e) => onFxChange(fx.map((x) => (x.id === f.id ? { ...x, volume: Number(e.target.value) } : x)))}
                />
                <button type="button" className="btn-small btn-ghost" aria-label="امسح" onClick={() => onFxChange(fx.filter((x) => x.id !== f.id))}>
                  ✕
                </button>
              </div>
            ))}
        </details>
      )}
    </div>
  );
};

// ===== 📚 المكتبة =====
const LibraryTab: React.FC<{
  list: Sound[];
  player: ReturnType<typeof usePlayer>;
  onUse: (s: Sound) => void;
  canSetMusic: boolean;
  canAddFx: boolean;
  reload: () => void;
}> = ({ list, player, onUse, canSetMusic, canAddFx, reload }) => {
  const [kind, setKind] = useState<"music" | "sfx">("music");
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<string | null>(null);

  const ofKind = list.filter((s) => kindOf(s) === kind);
  const tagOf = (s: Sound) => (kind === "music" ? s.mood : s.category) || "متنوع";
  const tags = useMemo(() => [...new Set(ofKind.map(tagOf))].sort(), [list, kind]);
  const shown = ofKind.filter((s) => (!tag || tagOf(s) === tag) && (!q || `${nice(s)} ${s.group} ${s.credit}`.toLowerCase().includes(q.toLowerCase())));

  const save = async (s: Sound, patch: Partial<Sound>) => {
    await fetch("/api/library/meta", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: s.path, ...patch }) });
    reload();
  };
  const remove = async (s: Sound) => {
    if (!confirm(`تمسح "${nice(s)}" نهائي؟`)) return;
    await fetch(`/api/library?path=${encodeURIComponent(s.path)}`, { method: "DELETE" });
    reload();
  };
  const can = kind === "music" ? canSetMusic : canAddFx;

  return (
    <div className="sound-lib">
      <div className="row-2">
        <div className="seg-toggle" role="radiogroup" aria-label="النوع">
          <button type="button" role="radio" aria-checked={kind === "music"} className={kind === "music" ? "on" : ""} onClick={() => (setKind("music"), setTag(""))}>
            🎵 مزيكا
          </button>
          <button type="button" role="radio" aria-checked={kind === "sfx"} className={kind === "sfx" ? "on" : ""} onClick={() => (setKind("sfx"), setTag(""))}>
            🔊 مؤثرات
          </button>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر…" aria-label="بحث" />
      </div>
      <div className="library-groups">
        <button type="button" className={`chip ${!tag ? "on" : ""}`} onClick={() => setTag("")}>
          الكل ({ofKind.length})
        </button>
        {tags.map((t) => (
          <button key={t} type="button" className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      {!can && <div className="hint">القالب ده مش بيقبل {kind === "music" ? "مزيكا" : "مؤثرات"} من هنا.</div>}
      {kind === "sfx" && can && <div className="hint">المؤثر بيتحط عند مكان المؤشر في الفيديو.</div>}

      <ul className="sound-list">
        {shown.map((s) => (
          <li key={s.path} className="sound-row">
            <button type="button" className={`play ${player.playing === s.path ? "on" : ""}`} onClick={() => player.toggle(s.path)} aria-label={player.playing === s.path ? "وقّف" : "اسمع"}>
              {player.playing === s.path ? "⏸" : "▶"}
            </button>
            <div className="sound-info">
              <b dir="auto">{nice(s)}</b>
              <small>
                {s.duration ? sec(s.duration) : ""}
                {s.bpm ? ` · ${s.bpm} BPM` : ""}
                {` · ${tagOf(s)}`}
                {s.folder === "library" ? " · باقة البداية" : s.group ? ` · ${s.group}` : ""}
              </small>
              {s.license && (
                <small className="lic" dir="auto" title={s.source || s.license}>
                  📜 {s.license}
                  {s.credit ? ` · ${s.credit}` : ""}
                </small>
              )}
              {edit === s.path && (
                <div className="row-2">
                  <select value={tagOf(s)} onChange={(e) => save(s, kind === "music" ? { mood: e.target.value } : { category: e.target.value })} aria-label="التصنيف">
                    {(kind === "music" ? moods : categories).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <select value={s.soundKind || kind} onChange={(e) => save(s, { soundKind: e.target.value })} aria-label="النوع">
                    <option value="music">مزيكا</option>
                    <option value="sfx">مؤثر</option>
                  </select>
                </div>
              )}
            </div>
            <div className="sound-actions">
              <button type="button" className="btn-small btn-ai" onClick={() => onUse(s)} disabled={!can}>
                {kind === "music" ? "استخدمها" : "حطه هنا"}
              </button>
              {s.folder === "uploads" && (
                <span>
                  <button type="button" className="link-btn" onClick={() => setEdit(edit === s.path ? null : s.path)}>
                    {edit === s.path ? "تمام" : "تعديل"}
                  </button>
                  <button type="button" className="link-btn danger" onClick={() => remove(s)}>
                    امسح
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!shown.length && <div className="empty-note">مفيش أصوات هنا. استورد ملفاتك أو دوّر في Freesound.</div>}
    </div>
  );
};

// ===== ⬆ الاستيراد =====
const ImportTab: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [license, setLicense] = useState(licenses[0].value);
  const [credit, setCredit] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  const run = async (list: FileList | null) => {
    if (!list?.length) return;
    const audio = [...list].filter((f) => /\.(mp3|wav|m4a|ogg|aac)$/i.test(f.name));
    setErrors([]);
    const errs: string[] = [];
    for (const [i, f] of audio.entries()) {
      setBusy(`بيستورد ${i + 1} من ${audio.length}: ${f.name}`);
      try {
        const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
        const up = await r.json();
        if (!r.ok) throw new Error(up.error);
        // اسم الفولدر اللي جاي منه الملف (لو استوردت فولدر) بيبقى هو التصنيف لو مكتبتش واحد
        const sub = (f as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/").slice(-2, -1)[0] ?? "";
        const a = await fetch("/api/sound/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: up.path, name: `${f.name} ${sub}`, license, credit, group: group || sub || "مستورد" }),
        });
        if (!a.ok) throw new Error((await a.json()).error);
      } catch (e) {
        errs.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (!errs.length) onDone();
  };

  return (
    <div className="sound-import">
      <div className="hint">
        نزّل المزيكا والمؤثرات بحسابك من المواقع دي، وبعدين استوردها هنا. الاستوديو بيعرف لوحده لو مزيكا ولا مؤثر، ومودها (حماسي، هادي، عربي…) وسرعتها، وبيحفظ الترخيص مع كل ملف.
      </div>
      <ul className="sources">
        <li>
          <a href="https://pixabay.com/music/" target="_blank" rel="noopener noreferrer">
            Pixabay Music ↗
          </a>{" "}
          مجاني حتى للاستخدام التجاري
        </li>
        <li>
          <a href="https://pixabay.com/sound-effects/" target="_blank" rel="noopener noreferrer">
            Pixabay مؤثرات ↗
          </a>
        </li>
        <li>
          <a href="https://studio.youtube.com/" target="_blank" rel="noopener noreferrer">
            YouTube Audio Library ↗
          </a>{" "}
          من YouTube Studio ← مكتبة الصوتيات (بعض التراكات لازم تذكر المصدر)
        </li>
        <li>
          <a href="https://www.epidemicsound.com/" target="_blank" rel="noopener noreferrer">
            Epidemic Sound ↗
          </a>{" "}
          اشتراك، والرخصة بتغطي اللي نشرته وانت مشترك
        </li>
      </ul>
      <label className="field">
        <span>الترخيص</span>
        <select value={license} onChange={(e) => setLicense(e.target.value)}>
          {licenses.map((l) => (
            <option key={l.label} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <div className="row-2">
        <label className="field">
          <span>الفولدر (اختياري)</span>
          <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="مثلًا: Pixabay" />
        </label>
        <label className="field">
          <span>ذكر المصدر (لو مطلوب)</span>
          <input type="text" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="اسم الفنان" />
        </label>
      </div>
      <div className="brand-buttons">
        <button type="button" className="btn-small btn-ai" onClick={() => files.current?.click()} disabled={!!busy}>
          ⬆ اختار ملفات
        </button>
        <button type="button" className="btn-small" onClick={() => folder.current?.click()} disabled={!!busy}>
          📁 استورد فولدر كامل
        </button>
      </div>
      <input ref={files} type="file" multiple hidden accept="audio/*" onChange={(e) => run(e.target.files)} />
      <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }} onChange={(e) => run(e.target.files)} />
      {busy && <div className="job-status">⏳ {busy}</div>}
      {errors.map((e) => (
        <div key={e} className="error">
          {e}
        </div>
      ))}
    </div>
  );
};

// ===== 🔎 Freesound =====
type FsResult = { id: number; name: string; duration: number; preview: string; author: string; url: string; tags: string[] };
const FreesoundTab: React.FC<{ player: ReturnType<typeof usePlayer>; keys: number; onImported: () => void }> = ({ player, keys, onImported }) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [kind, setKind] = useState<"sfx" | "music">("sfx");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FsResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setHasKey(s.keys.some((k: { id: string; set: boolean }) => k.id === "FREESOUND_API_KEY" && k.set)))
      .catch(() => {});
  }, [keys]);

  const search = async () => {
    setError(null);
    setBusy("بيدوّر…");
    try {
      const r = await fetch(`/api/sound/freesound?q=${encodeURIComponent(q)}&kind=${kind}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResults(data.results);
      if (!data.results.length) setError("مفيش نتايج CC0 للكلمة دي. جرب كلمة إنجليزي تانية");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const take = async (s: FsResult) => {
    setError(null);
    setBusy(`بيستورد "${s.name}"…`);
    try {
      await runJob("/api/sound/freesound/import", { id: s.id, kind }, setBusy);
      setDone((d) => ({ ...d, [s.id]: true }));
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (hasKey === false) return <KeyHint>محتاج مفتاح Freesound (مجاني): اعمل حساب وخد المفتاح من freesound.org/apiv2/apply.</KeyHint>;
  return (
    <div className="freesound">
      <div className="hint">بيجيب أصوات برخصة CC0 بس: مجانية لأي استخدام تجاري ومن غير ما تذكر المصدر.</div>
      <div className="row-2">
        <div className="seg-toggle" role="radiogroup" aria-label="النوع">
          <button type="button" role="radio" aria-checked={kind === "sfx"} className={kind === "sfx" ? "on" : ""} onClick={() => setKind("sfx")}>
            🔊 مؤثرات
          </button>
          <button type="button" role="radio" aria-checked={kind === "music"} className={kind === "music" ? "on" : ""} onClick={() => setKind("music")}>
            🎵 مزيكا
          </button>
        </div>
      </div>
      <div className="library-top">
        <input type="search" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && search()} placeholder={kind === "sfx" ? "whoosh, applause, cash register…" : "oud, lofi, corporate…"} aria-label="بحث" />
        <button type="button" className="btn-small btn-ai" onClick={search} disabled={!q.trim() || !!busy}>
          دوّر
        </button>
      </div>
      {busy && <div className="job-status">⏳ {busy}</div>}
      {error && <div className="error">{error}</div>}
      <ul className="sound-list">
        {results.map((s) => (
          <li key={s.id} className="sound-row">
            <button type="button" className={`play ${player.playing === s.preview ? "on" : ""}`} onClick={() => player.toggle(s.preview)} aria-label="اسمع">
              {player.playing === s.preview ? "⏸" : "▶"}
            </button>
            <div className="sound-info">
              <b dir="auto">{s.name}</b>
              <small>
                {sec(s.duration)} · {s.author}
              </small>
            </div>
            <div className="sound-actions">
              <button type="button" className="btn-small" onClick={() => take(s)} disabled={!!busy || done[s.id]}>
                {done[s.id] ? "✓ في المكتبة" : "استورد"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ===== ✨ التوليد بالذكاء الاصطناعي (ElevenLabs) =====
const musicIdeas = [
  { label: "عود هادي", prompt: "Calm solo oud with soft ambient pads, warm and reflective, 80 bpm" },
  { label: "خليجي حماسي", prompt: "Energetic Khaleeji percussion with oud riffs and claps, festive, 110 bpm" },
  { label: "سينمائي ملحمي", prompt: "Epic cinematic orchestral score with Arabic strings and taiko drums, inspiring" },
  { label: "شركات ملهم", prompt: "Uplifting modern corporate background music, piano and light synths, optimistic" },
  { label: "لوفاي هادي", prompt: "Chill lo-fi hip hop beat with mellow keys and vinyl crackle, relaxed" },
  { label: "رمضاني", prompt: "Peaceful Ramadan atmosphere, qanun and soft percussion, spiritual and warm" },
];
const sfxIdeas = [
  { label: "جو كافيه", prompt: "Busy cafe ambience with soft chatter and cups clinking" },
  { label: "ريح صحرا", prompt: "Gentle desert wind blowing over sand dunes" },
  { label: "شارع مدينة", prompt: "City street ambience with distant traffic" },
  { label: "ووش انتقال", prompt: "Fast cinematic whoosh transition" },
  { label: "نقرة زرار", prompt: "Clean soft UI click" },
  { label: "تصفيق", prompt: "Small crowd applause" },
];

const GenerateTab: React.FC<{ keys: number; onMade: () => void }> = ({ keys, onMade }) => {
  const [kind, setKind] = useState<"music" | "sfx">("music");
  const [prompt, setPrompt] = useState(musicIdeas[0].prompt);
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ elevenlabs: boolean; mock: boolean } | null>(null);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/film/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [keys]);

  const switchKind = (k: "music" | "sfx") => {
    setKind(k);
    setPrompt(k === "music" ? musicIdeas[0].prompt : sfxIdeas[0].prompt);
    setSeconds(k === "music" ? 30 : 5);
  };

  const generate = async () => {
    setError(null);
    setMade(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{ path: string }>("/api/sound/generate", { kind, prompt, seconds }, setBusy);
      // بيدخل المكتبة باسم الوصف وترخيص ElevenLabs
      await fetch("/api/sound/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: r.path, name: prompt, license: "ElevenLabs: تجاري في الباقات المدفوعة", group: "متولد بالذكاء الاصطناعي" }),
      });
      await fetch("/api/library/meta", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: r.path, label: prompt.slice(0, 60), soundKind: kind }) });
      setMade(r.path);
      onMade();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ideas = kind === "music" ? musicIdeas : sfxIdeas;
  const available = status?.elevenlabs || status?.mock;
  return (
    <div className="sound-gen">
      <div className="seg-toggle" role="radiogroup" aria-label="النوع">
        <button type="button" role="radio" aria-checked={kind === "music"} className={kind === "music" ? "on" : ""} onClick={() => switchKind("music")}>
          🎵 مزيكا
        </button>
        <button type="button" role="radio" aria-checked={kind === "sfx"} className={kind === "sfx" ? "on" : ""} onClick={() => switchKind("sfx")}>
          🔊 مؤثر صوتي
        </button>
      </div>
      <div className="placeholders">
        {ideas.map((i) => (
          <button key={i.label} type="button" className={`chip ${prompt === i.prompt ? "" : "chip-soft"}`} onClick={() => setPrompt(i.prompt)}>
            {i.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>الوصف (إنجليزي بيدي نتايج أحسن)</span>
        <textarea rows={3} dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label className="field">
        <span>المدة: {seconds} ثانية</span>
        <input type="range" dir="ltr" min={kind === "music" ? 5 : 1} max={kind === "music" ? 180 : 30} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
      </label>
      <button type="button" className="btn-primary" onClick={generate} disabled={!available || !!busy || !prompt.trim()}>
        {busy ? `⏳ ${busy}` : kind === "music" ? "🎵 ألّف المزيكا" : "🔊 اعمل المؤثر"}
      </button>
      {status && !available && <KeyHint>محتاج مفتاح ElevenLabs (وبيستهلك من رصيدك هناك).</KeyHint>}
      {status?.mock && <div className="hint">وضع تجربة: بيرجع ملف تجريبي.</div>}
      {made && <div className="flash">✓ اتحفظ في المكتبة. روح لـ 📚 المكتبة عشان تستخدمه.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
