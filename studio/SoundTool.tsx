// أداة "الصوتيات": توليد مزيكا أو مؤثر صوتي بالوصف، وتستخدمه في أي فيديو
import { useEffect, useState } from "react";

type Generated = { kind: "music" | "sfx"; prompt: string; path: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// أفكار جاهزة مناسبة للمحتوى العربي والسعودي
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

export const SoundTool: React.FC<{ canSetMusic: boolean; onUseMusic: (path: string) => void }> = ({ canSetMusic, onUseMusic }) => {
  const [kind, setKind] = useState<"music" | "sfx">("music");
  const [prompt, setPrompt] = useState(musicIdeas[0].prompt);
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Generated[]>([]);
  const [status, setStatus] = useState<{ elevenlabs: boolean; mock: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/film/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const switchKind = (k: "music" | "sfx") => {
    setKind(k);
    setPrompt(k === "music" ? musicIdeas[0].prompt : sfxIdeas[0].prompt);
    setSeconds(k === "music" ? 30 : 5);
  };

  const generate = async () => {
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await fetch("/api/sound/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, prompt, seconds }) });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(1200);
        const j = await fetch(`/api/film/job/${jobId}`).then((x) => x.json());
        if (j.status === "done") {
          setList((l) => [{ kind, prompt, path: j.result.path }, ...l]);
          break;
        }
        if (j.status === "error") throw new Error(j.error);
        setBusy(j.step);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ideas = kind === "music" ? musicIdeas : sfxIdeas;
  const available = status?.elevenlabs || status?.mock;

  return (
    <div className="card">
      <div className="seg-toggle" role="tablist" aria-label="النوع">
        <button type="button" role="tab" aria-selected={kind === "music"} className={kind === "music" ? "on" : ""} onClick={() => switchKind("music")}>
          🎵 مزيكا
        </button>
        <button type="button" role="tab" aria-selected={kind === "sfx"} className={kind === "sfx" ? "on" : ""} onClick={() => switchKind("sfx")}>
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
        <span>
          المدة: {seconds} ثانية
        </span>
        <input
          type="range"
          dir="ltr"
          min={kind === "music" ? 5 : 1}
          max={kind === "music" ? 180 : 30}
          step={1}
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
        />
      </label>
      <button type="button" className="btn-primary" onClick={generate} disabled={!available || !!busy || !prompt.trim()}>
        {busy ? `⏳ ${busy}` : kind === "music" ? "🎵 ألّف المزيكا" : "🔊 اعمل المؤثر"}
      </button>
      {status && !available && <div className="hint">محتاج مفتاح ElevenLabs في ملف .env (وبيستهلك من رصيدك هناك).</div>}
      {status?.mock && <div className="hint">وضع تجربة: بيرجع ملف تجريبي.</div>}
      {error && <div className="error">{error}</div>}

      {list.length > 0 && (
        <>
          <h3>اللي اتعمل</h3>
          {list.map((g) => (
            <div key={g.path} className="sound-item">
              <small dir="auto">{g.prompt}</small>
              <audio src={`/${g.path}`} controls preload="none" className="asset-audio" />
              {g.kind === "music" && canSetMusic && (
                <button type="button" className="btn-small" onClick={() => onUseMusic(g.path)}>
                  استخدمها كمزيكا للفيديو ده
                </button>
              )}
            </div>
          ))}
          <div className="hint">كل اللي بتعمله بيتحفظ في مكتبة الملفات، فتقدر تختاره من أي خانة صوت.</div>
        </>
      )}
    </div>
  );
};
