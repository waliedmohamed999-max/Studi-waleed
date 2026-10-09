// إضافات المونتاج الأوتوماتيك: دمج كذا كليب، شيل الخلفية، والترجمة والدبلجة
import { useEffect, useState } from "react";
import type { AutoEditProps } from "../src/AutoEditVideo";
import { AssetPicker } from "./fields";
import { runJob } from "./jobs";
import { KeyHint, useKeysVersion } from "./settings";

type Patch = (patch: Partial<AutoEditProps>) => void;
const money = (n: number) => `$${n.toFixed(n < 1 ? 2 : 1)}`;
const short = (p: string) => p.split("/").pop()?.replace(/^[a-z0-9]+-(?=.)/, "") ?? p;

// حالة الخدمات (عشان نعرف الزرار يشتغل ولا محتاج مفتاح)
const useServices = () => {
  const keys = useKeysVersion();
  const [s, setS] = useState<{ fal: boolean; elevenlabs: boolean; mock: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/film/status")
      .then((r) => r.json())
      .then(setS)
      .catch(() => {});
  }, [keys]);
  return s;
};

// بعد ما الفيديو الأساسي يتغير، كل التحليل القديم بيتمسح
export const resetForMedia = (media: string): Partial<AutoEditProps> => ({
  media,
  mediaDuration: 0,
  cleanAudio: "",
  words: [],
  speech: [],
  cuts: [],
  splits: [],
  emphasis: [],
  highlights: [],
  range: null,
  faceTrack: [],
  brolls: [],
  emojis: [],
  cutout: "",
  dubAudio: "",
  dubWords: [],
  dubVideo: "",
  useDub: "off",
});

// ===== كذا كليب ← فيديو واحد =====
export const ClipsJoin: React.FC<{ p: AutoEditProps; update: Patch }> = ({ p, update }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clips = p.clips ?? [];
  const all = [p.media, ...clips];
  const setClips = (next: string[]) => update({ clips: next });
  const move = (i: number, d: number) => {
    const next = [...all];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update({ media: next[0], clips: next.slice(1) });
  };

  const join = async () => {
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{ path: string }>("/api/media/join", { paths: all.filter(Boolean) }, setBusy);
      update({ ...resetForMedia(r.path), clips: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="clips">
      {clips.length > 0 && (
        <ol className="clips-list">
          {all.map((c, i) => (
            <li key={`${c}-${i}`}>
              <span className="clip-name" dir="auto">
                🎬 {short(c)}
              </span>
              <button type="button" className="btn-small btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="قبل">
                ↑
              </button>
              <button type="button" className="btn-small btn-ghost" onClick={() => move(i, 1)} disabled={i === all.length - 1} aria-label="بعد">
                ↓
              </button>
              {i > 0 && (
                <button type="button" className="btn-small btn-ghost" onClick={() => setClips(clips.filter((_, j) => j !== i - 1))} aria-label="شيل">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="field">
        <span>{clips.length ? "ضيف كليب كمان" : "عندك كذا كليب؟ ضيفهم وهيتدمجوا في فيديو واحد"}</span>
        <AssetPicker kind="video" compact value="" onChange={(v) => v && setClips([...clips, v])} />
      </div>
      {clips.length > 0 && (
        <button type="button" className="btn-small btn-ai" onClick={join} disabled={!!busy}>
          {busy ? `⏳ ${busy}` : `🔗 ادمج الـ ${all.length} كليب في فيديو واحد`}
        </button>
      )}
      {clips.length > 0 && <div className="hint">بيتظبطوا كلهم على مقاس أول كليب. وبعد الدمج، القص والكابشن بيشتغلوا على الفيديو كله.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};

// ===== شيل الخلفية =====
export const CutoutTool: React.FC<{ p: AutoEditProps; update: Patch }> = ({ p, update }) => {
  const s = useServices();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cost = (p.mediaDuration || 0) * 0.012;

  const run = async () => {
    if (!s?.mock && !confirm(`شيل الخلفية من الفيديو كله (~${Math.round(p.mediaDuration)} ثانية)\nالتكلفة التقريبية: ${money(cost)} على fal.ai\nتكمل؟`)) return;
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{ path: string }>("/api/autoedit/cutout", { path: p.media }, setBusy);
      update({ cutout: r.path, cutoutBg: p.cutoutBg && p.cutoutBg !== "off" ? p.cutoutBg : "blur" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cutout">
      {!p.cutout ? (
        <button type="button" className="btn-small btn-ai" onClick={run} disabled={!!busy || !s?.fal}>
          {busy ? `⏳ ${busy}` : `🪄 شيل الخلفية (~${s?.mock ? "مجاني" : money(cost)})`}
        </button>
      ) : (
        <>
          <label className="field">
            <span>الخلفية الجديدة</span>
            <select value={p.cutoutBg} onChange={(e) => update({ cutoutBg: e.target.value })}>
              <option value="blur">الخلفية الأصلية مضبّشة</option>
              <option value="color">لون</option>
              <option value="image">صورة</option>
              <option value="off">رجّع الخلفية الأصلية</option>
            </select>
          </label>
          {p.cutoutBg === "color" && (
            <label className="field">
              <span>اللون</span>
              <input type="color" value={p.cutoutColor || "#111827"} onChange={(e) => update({ cutoutColor: e.target.value })} />
            </label>
          )}
          {p.cutoutBg === "image" && (
            <div className="field">
              <span>الصورة</span>
              <AssetPicker kind="image" compact value={p.cutoutImage} onChange={(v) => update({ cutoutImage: v })} />
            </div>
          )}
          <button type="button" className="link-btn" onClick={() => update({ cutout: "" })}>
            امسح (وارجع للأصل)
          </button>
        </>
      )}
      {s && !s.fal && <KeyHint>محتاج مفتاح fal.ai.</KeyHint>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};

// ===== الترجمة والدبلجة =====
export const DubTool: React.FC<{ p: AutoEditProps; update: Patch }> = ({ p, update }) => {
  const s = useServices();
  const [langs, setLangs] = useState<{ value: string; label: string }[]>([]);
  const [target, setTarget] = useState("en");
  const [source, setSource] = useState("ar");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/autoedit/dub/languages")
      .then((r) => r.json())
      .then(setLangs)
      .catch(() => {});
  }, []);

  const dub = async () => {
    if (!s?.mock && !confirm(`دبلجة الفيديو كله (~${Math.round(p.mediaDuration)} ثانية) لـ ${langs.find((l) => l.value === target)?.label}\nبيستهلك من رصيد ElevenLabs (حوالي ألفين حرف لكل دقيقة حسب باقتك). تكمل؟`)) return;
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{ path: string; words: AutoEditProps["dubWords"]; lang: string }>("/api/autoedit/dub", { path: p.media, sourceLang: source, targetLang: target }, setBusy);
      update({ dubAudio: r.path, dubWords: r.words, dubLang: r.lang, dubVideo: "", useDub: "on" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const lips = async () => {
    const cost = (p.mediaDuration || 0) * 0.05;
    if (!s?.mock && !confirm(`تحريك الشفايف على الدبلجة (~${Math.round(p.mediaDuration)} ثانية)\nالتكلفة التقريبية: ${money(cost)} على fal.ai\nتكمل؟`)) return;
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{ path: string }>("/api/autoedit/dub-lips", { video: p.media, audio: p.dubAudio }, setBusy);
      update({ dubVideo: r.path });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const langName = (v: string) => langs.find((l) => l.value === v)?.label ?? v;

  return (
    <div className="dub">
      <div className="row-2">
        <label className="field">
          <span>من</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {langs.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>لـ</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {langs
              .filter((l) => l.value !== source)
              .map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button type="button" className="btn-small btn-ai" onClick={dub} disabled={!!busy || !(s?.elevenlabs || s?.mock)}>
        {busy ? `⏳ ${busy}` : p.dubAudio ? "🌍 دبلج تاني" : "🌍 ترجم ودبلج بصوتك"}
      </button>
      {s && !(s.elevenlabs || s.mock) && <KeyHint>محتاج مفتاح ElevenLabs.</KeyHint>}

      {p.dubAudio && (
        <div className="dub-on">
          <label className="check">
            <input type="checkbox" checked={p.useDub === "on"} onChange={(e) => update({ useDub: e.target.checked ? "on" : "off" })} />
            <span>استخدم النسخة المدبلجة ({langName(p.dubLang)})</span>
          </label>
          {!(p.dubWords ?? []).length && <div className="hint">مفيش كابشن للدبلجة (محتاج Whisper متسطب). الصوت شغال عادي.</div>}
          <button type="button" className="btn-small" onClick={lips} disabled={!!busy || !s?.fal}>
            👄 {p.dubVideo ? "حرّك الشفايف تاني" : "حرّك الشفايف على الدبلجة"}
          </button>
          {p.dubVideo && <div className="hint">✓ الشفايف ماشية مع الدبلجة.</div>}
          <button type="button" className="link-btn" onClick={() => update({ dubAudio: "", dubWords: [], dubVideo: "", useDub: "off" })}>
            امسح الدبلجة
          </button>
        </div>
      )}
      <div className="hint">الدبلجة بصوتك انت (ElevenLabs بيقلّد صوتك بلغة تانية)، وبنفس توقيت الفيديو، فالقص والكابشن بيفضلوا مظبوطين.</div>
      {error && <div className="error">{error}</div>}
    </div>
  );
};
