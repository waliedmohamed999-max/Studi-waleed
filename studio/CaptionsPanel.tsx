// لوحة الكابشن: تعليق صوتي من نص، تفريغ أوتوماتيك بـ Whisper، وتعديل كل كلمة وتوقيتها
import { useEffect, useRef, useState } from "react";
import { createTikTokStyleCaptions, parseSrt, serializeSrt, type Caption } from "@remotion/captions";
import { callAi, dialects, useAiStatus, type AiScript, type Dialect } from "./ai";
import { CleanAudio } from "./CleanAudio";

// ===== Claude بيكتب سكريبت التعليق الصوتي =====
const ScriptAi: React.FC<{ onScript: (text: string) => void }> = ({ onScript }) => {
  const status = useAiStatus();
  const [topic, setTopic] = useState("");
  // صوت الويندوز العربي فصحى، فالفصحى هي الأنسب له
  const [dialect, setDialect] = useState<Dialect>("msa");
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status?.available) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await callAi<AiScript>("script", { idea: topic, dialect, seconds });
      onScript([s.hook, s.body, s.cta].filter(Boolean).join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scene-ai">
      <span className="scene-ai-title">✨ خلّي Claude يكتب السكريبت</span>
      <input type="text" value={topic} placeholder="الموضوع: مثلًا فوايد شرب المية الصبح" onChange={(e) => setTopic(e.target.value)} />
      <div className="scene-ai-row">
        <select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
          {dialects.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {[10, 20, 30, 45, 60].map((s) => (
            <option key={s} value={s}>
              {s} ثانية
            </option>
          ))}
        </select>
        <button type="button" className="btn-small btn-ai" onClick={run} disabled={busy || !topic.trim()}>
          {busy ? "بيكتب…" : "اكتب"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
};

type Props = Record<string, unknown>;
type WhisperState = { installed: boolean; modelReady: boolean; model: string; job: { step: string; progress: number; error: string | null; done: boolean } | null };
type Voices = { windows: { id: string; name: string; lang: string; gender: string }[]; elevenlabs: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sec = (ms: number) => (ms / 1000).toFixed(2);

export const CaptionsPanel: React.FC<{
  props: Props;
  updateProps: (patch: Props) => void;
  frame: number;
  fps: number;
  seek: (frame: number) => void;
}> = ({ props, updateProps, frame, fps, seek }) => {
  const media = String(props.media ?? "");
  const captions = (props.captions as Caption[]) ?? [];
  const nowMs = (frame / fps) * 1000;

  // ===== مدة الفيديو / الصوت: بنجيبها من السيرفر كل ما الملف يتغير =====
  useEffect(() => {
    if (!media) return;
    fetch(`/api/media-info?path=${encodeURIComponent(media)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info && Math.abs((Number(props.mediaDuration) || 0) - info.duration) > 0.01) updateProps({ mediaDuration: info.duration });
      })
      .catch(() => {});
  }, [media]);

  // ===== Whisper =====
  const [whisper, setWhisper] = useState<WhisperState | null>(null);
  const refreshWhisper = () =>
    fetch("/api/whisper")
      .then((r) => r.json())
      .then(setWhisper)
      .catch(() => setWhisper(null));
  useEffect(() => {
    refreshWhisper();
  }, []);
  const whisperReady = !!whisper?.installed && !!whisper?.modelReady;

  const installWhisper = async () => {
    await fetch("/api/whisper/install", { method: "POST" });
    for (;;) {
      await sleep(1000);
      const w: WhisperState = await fetch("/api/whisper").then((r) => r.json());
      setWhisper(w);
      if (!w.job || w.job.done) break;
    }
  };

  // ===== التفريغ =====
  const [language, setLanguage] = useState("ar");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transcribe = async (path = media) => {
    if (!path) return;
    setError(null);
    setBusy("بفرّغ الكلام… 0٪");
    try {
      const r = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, language }),
      });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(800);
        const j = await fetch(`/api/transcribe/${jobId}`).then((x) => x.json());
        if (j.status === "done") {
          updateProps({ captions: j.captions });
          break;
        }
        if (j.status === "error") throw new Error(j.error);
        setBusy(`بفرّغ الكلام… ${Math.round(j.progress * 100)}٪`);
      }
    } catch (e) {
      setError((e as Error).message || "التفريغ فشل");
    } finally {
      setBusy(null);
    }
  };

  // ===== التعليق الصوتي =====
  const [voices, setVoices] = useState<Voices | null>(null);
  const [script, setScript] = useState("");
  const [provider, setProvider] = useState("windows");
  const [voice, setVoice] = useState("Naayf");
  const [rate, setRate] = useState(1);
  const [autoCaption, setAutoCaption] = useState(true);

  useEffect(() => {
    fetch("/api/tts/voices")
      .then((r) => r.json())
      .then((v: Voices) => {
        setVoices(v);
        // لو فيه صوت عربي نختاره أوتوماتيك
        const ar = v.windows.find((x) => x.lang.startsWith("ar"));
        if (ar) setVoice(ar.id);
      })
      .catch(() => {});
  }, []);

  const generateVoice = async () => {
    setError(null);
    setBusy("بولّد الصوت…");
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, provider, voice, rate }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      updateProps({ media: data.path, mediaDuration: data.duration, cleanAudio: "", captions: [] });
      setBusy(null);
      if (autoCaption && whisperReady) await transcribe(data.path);
    } catch (e) {
      setError((e as Error).message || "توليد الصوت فشل");
    } finally {
      setBusy(null);
    }
  };

  // ===== تعديل الكلمات =====
  const [selected, setSelected] = useState<number | null>(null);
  const setCaptions = (next: Caption[]) => updateProps({ captions: next });
  const updateWord = (i: number, patch: Partial<Caption>) => setCaptions(captions.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const shiftAll = (ms: number) =>
    setCaptions(captions.map((c) => ({ ...c, startMs: Math.max(0, c.startMs + ms), endMs: Math.max(0, c.endMs + ms), timestampMs: c.timestampMs === null ? null : c.timestampMs + ms })));
  const removeWord = (i: number) => {
    setCaptions(captions.filter((_, j) => j !== i));
    setSelected(null);
  };
  const addWordAfter = (i: number) => {
    const c = captions[i];
    const next = [...captions];
    next.splice(i + 1, 0, { text: " كلمة", startMs: c.endMs, endMs: c.endMs + 400, timestampMs: null, confidence: null });
    setCaptions(next);
    setSelected(i + 1);
  };

  // ===== SRT =====
  const srtInput = useRef<HTMLInputElement>(null);
  const exportSrt = () => {
    const pages = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: Number(props.wordsTogetherMs) || 1200 }).pages;
    const lines = pages.map((p) => [{ text: p.text.trim(), startMs: p.startMs, endMs: p.startMs + p.durationMs, timestampMs: null, confidence: null }]);
    const blob = new Blob([serializeSrt({ lines })], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "captions.srt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importSrt = async (file: File) => {
    try {
      const { captions: parsed } = parseSrt({ input: await file.text() });
      setCaptions(parsed);
    } catch {
      setError("ملف SRT مش مظبوط");
    }
  };

  const sel = selected !== null ? captions[selected] : null;

  return (
    <div className="captions-panel">
      {media && <CleanAudio media={media} clean={String(props.cleanAudio ?? "")} onChange={(v) => updateProps({ cleanAudio: v })} />}
      {/* ===== التعليق الصوتي ===== */}
      <details className="subpanel" open={!media}>
        <summary>🎙️ تعليق صوتي من نص</summary>
        <ScriptAi onScript={setScript} />
        <textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} placeholder="اكتب الكلام اللي عايزه يتقال…" />
        <div className="row-2">
          <label className="field">
            <span>المصدر</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="windows">أصوات الويندوز (مجاني)</option>
              <option value="elevenlabs" disabled={!voices?.elevenlabs}>
                ElevenLabs {voices?.elevenlabs ? "" : "(محتاج مفتاح)"}
              </option>
            </select>
          </label>
          {provider === "windows" ? (
            <label className="field">
              <span>الصوت</span>
              <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                {(voices?.windows ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Voice ID</span>
              <input type="text" dir="ltr" value={voice} onChange={(e) => setVoice(e.target.value)} />
            </label>
          )}
        </div>
        <label className="field">
          <span>السرعة: {rate}×</span>
          <input type="range" dir="ltr" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={autoCaption} onChange={(e) => setAutoCaption(e.target.checked)} disabled={!whisperReady} />
          اعمل الكابشن أوتوماتيك بعد التوليد {!whisperReady && "(محتاج Whisper)"}
        </label>
        <button type="button" className="btn-primary" onClick={generateVoice} disabled={!script.trim() || !!busy}>
          🔊 ولّد الصوت
        </button>
        {!voices?.elevenlabs && (
          <div className="hint">
            للأصوات الأطبع (مصري وخليجي): اعمل حساب على ElevenLabs، وحط <code dir="ltr">ELEVENLABS_API_KEY=...</code> في ملف <code>.env</code> جنب
            server.mjs، وبعدين أعد تشغيل الاستوديو.
          </div>
        )}
      </details>

      {/* ===== التفريغ ===== */}
      <div className="subpanel">
        {!whisper ? (
          <div className="hint">سيرفر الاستوديو مش شغال.</div>
        ) : !whisperReady ? (
          <>
            <div className="hint">عشان تفرّغ الكلام أوتوماتيك محتاج Whisper (حوالي 1.6 جيجا، بيتنزّل مرة واحدة).</div>
            <button type="button" className="btn-small" onClick={installWhisper} disabled={!!whisper.job && !whisper.job.done}>
              ⬇ نزّل Whisper
            </button>
            {whisper.job && !whisper.job.done && (
              <div className="bar">
                <div style={{ width: `${Math.round((whisper.job.step === "model" ? whisper.job.progress : 0) * 100)}%` }} />
              </div>
            )}
            {whisper.job?.error && <div className="error">{whisper.job.error}</div>}
          </>
        ) : (
          <>
            <div className="row-2">
              <label className="field">
                <span>لغة الكلام</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="ar">عربي (ومصري)</option>
                  <option value="en">إنجليزي</option>
                  <option value="auto">يعرف لوحده</option>
                </select>
              </label>
              <button type="button" className="btn-primary" onClick={() => transcribe()} disabled={!media || !!busy}>
                📝 فرّغ الكلام
              </button>
            </div>
            {!media && <div className="hint">ارفع فيديو أو ملف صوت فوق، أو ولّد تعليق صوتي.</div>}
          </>
        )}
        {busy && <div className="job-status">{busy}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {/* ===== الكلمات ===== */}
      <div className="caption-tools">
        <span className="hint">{captions.length} كلمة</span>
        <button type="button" className="btn-small" title="قدّم كل الكابشن 0.1 ثانية" onClick={() => shiftAll(-100)} disabled={!captions.length}>
          ⏪ 0.1
        </button>
        <button type="button" className="btn-small" title="أخّر كل الكابشن 0.1 ثانية" onClick={() => shiftAll(100)} disabled={!captions.length}>
          0.1 ⏩
        </button>
        <button type="button" className="btn-small" onClick={exportSrt} disabled={!captions.length}>
          ⬇ SRT
        </button>
        <button type="button" className="btn-small" onClick={() => srtInput.current?.click()}>
          ⬆ SRT
        </button>
        <input ref={srtInput} type="file" hidden accept=".srt" onChange={(e) => e.target.files?.[0] && importSrt(e.target.files[0])} />
      </div>

      {captions.length > 0 && (
        <div className="words" dir="rtl">
          {captions.map((c, i) => {
            const active = nowMs >= c.startMs && nowMs < c.endMs;
            return (
              <button
                key={i}
                type="button"
                className={`word ${active ? "active" : ""} ${selected === i ? "selected" : ""}`}
                title={`${sec(c.startMs)} → ${sec(c.endMs)}`}
                onClick={() => {
                  setSelected(i);
                  seek(Math.round((c.startMs / 1000) * fps));
                }}
              >
                {c.text.trim() || "␣"}
              </button>
            );
          })}
        </div>
      )}

      {sel && selected !== null && (
        <div className="subpanel word-editor">
          <label className="field">
            <span>الكلمة</span>
            <input
              type="text"
              value={sel.text.trim()}
              onChange={(e) => updateWord(selected, { text: (sel.text.startsWith(" ") ? " " : "") + e.target.value })}
            />
          </label>
          <div className="row-2">
            <label className="field">
              <span>تبدأ (ثانية)</span>
              <input
                type="number"
                dir="ltr"
                step={0.05}
                value={sec(sel.startMs)}
                onChange={(e) => updateWord(selected, { startMs: Math.max(0, Math.round(Number(e.target.value) * 1000)) })}
              />
            </label>
            <label className="field">
              <span>تخلص (ثانية)</span>
              <input
                type="number"
                dir="ltr"
                step={0.05}
                value={sec(sel.endMs)}
                onChange={(e) => updateWord(selected, { endMs: Math.max(0, Math.round(Number(e.target.value) * 1000)) })}
              />
            </label>
          </div>
          <div className="brand-buttons">
            <button type="button" className="btn-small" onClick={() => addWordAfter(selected)}>
              ＋ كلمة بعدها
            </button>
            <button type="button" className="btn-small" onClick={() => removeWord(selected)}>
              ✕ امسح الكلمة
            </button>
            <button type="button" className="btn-small btn-ghost" onClick={() => setSelected(null)}>
              اقفل
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
