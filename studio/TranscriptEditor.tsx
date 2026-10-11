// تعديل الكلام: صلّح كتابة الكابشن، شيل كلمة من الفيديو، أو قول الكلام الصح تاني بصوتك مكان الغلط
import { useRef, useState } from "react";
import type { Caption } from "@remotion/captions";
import type { AutoEditProps, VoiceFix } from "../src/AutoEditVideo";
import { runJob } from "./jobs";

type Decision = "keep" | "filler" | "cut" | "outside";
type Update = (fn: (prev: AutoEditProps) => Partial<AutoEditProps>) => void;

const MANUAL = "حذف يدوي";

// النص الجديد بيتوزع على كلمات الاختيار بالترتيب (عدد الكلمات في المشروع مبيتغيرش، عشان القص والإيموجي واللقطات المربوطة بأرقام الكلمات تفضل مظبوطة)
export const spreadText = (words: Caption[], from: number, to: number, text: string): Caption[] => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const n = to - from + 1;
  return words.map((w, i) => {
    if (i < from || i > to) return w;
    const k = i - from;
    const t = k < n - 1 ? (tokens[k] ?? "") : tokens.slice(n - 1).join(" ");
    return { ...w, text: t ? ` ${t}` : "" };
  });
};

export const TranscriptEditor: React.FC<{
  p: AutoEditProps;
  words: Caption[]; // بعد المحاذاة (نفس ترتيب p.words)
  decisions: Decision[];
  update: Update;
  goToWord: (w: Caption) => void;
  canRevoice: boolean;
}> = ({ p, words, decisions, update, goToWord, canRevoice }) => {
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fixes = p.voiceFixes ?? [];
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  const textOf = (from: number, to: number) =>
    p.words
      .slice(from, to + 1)
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(" ");

  const pick = (i: number, extend: boolean) => {
    const next = extend && sel ? { from: Math.min(sel.from, i), to: Math.max(sel.to, i) } : { from: i, to: i };
    setSel(next);
    setDraft(textOf(next.from, next.to));
    setError(null);
    if (decisions[i] === "keep") goToWord(words[i]);
  };

  const inRange = (i: number, r: { fromWord: number; toWord: number }) => i >= r.fromWord && i <= r.toWord;
  const fixAt = (i: number) => fixes.find((x) => x.enabled && inRange(i, x));
  const manualCut = (i: number) => p.cuts.some((c) => c.enabled && c.reason === MANUAL && c.fromWord !== undefined && c.toWord !== undefined && inRange(i, { fromWord: c.fromWord, toWord: c.toWord }));

  const saveText = () => {
    if (!sel) return;
    update((prev) => ({ words: spreadText(prev.words, sel.from, sel.to, draft) }));
  };

  const cutSelection = () => {
    if (!sel) return;
    update((prev) => ({
      cuts: [...prev.cuts, { fromWord: sel.from, toWord: sel.to, fromMs: words[sel.from].startMs, toMs: words[sel.to].endMs, reason: MANUAL, enabled: true }],
    }));
    setSel(null);
  };
  const restoreSelection = () => {
    if (!sel) return;
    // بنرجّع أي حذف يدوي بيلمس الاختيار
    update((prev) => ({
      cuts: prev.cuts.filter((c) => !(c.reason === MANUAL && c.fromWord !== undefined && c.toWord !== undefined && c.fromWord <= sel.to && c.toWord >= sel.from)),
    }));
  };

  // الصوت الجديد بيتعمل على السيرفر (ElevenLabs أو تسجيلة المايك)، وبعدين بيتحط مكان الكلام الغلط
  const applyFix = async (make: (range: { from: number; to: number; fromMs: number; toMs: number }) => Promise<{ path: string }>) => {
    if (!sel) return;
    const { from, to } = sel;
    const fromMs = words[from].startMs;
    const toMs = words[to].endMs;
    const text = draft.trim() || textOf(from, to);
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await make({ from, to, fromMs, toMs });
      const fix: VoiceFix = { id: Date.now().toString(36), fromWord: from, toWord: to, fromMs, toMs, text, audio: r.path, enabled: true };
      // تصليح جديد بيحل محل أي تصليح قديم في نفس المكان، والكابشن بيتعدل معاه
      update((prev) => ({
        words: spreadText(prev.words, from, to, text),
        voiceFixes: [...(prev.voiceFixes ?? []).filter((x) => x.toWord < from || x.fromWord > to), fix],
      }));
      goToWord(words[from]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revoice = () =>
    draft.trim() &&
    applyFix(({ from, to, fromMs, toMs }) =>
      runJob<{ path: string }>(
        "/api/autoedit/revoice",
        { path: p.media, text: draft.trim(), fromMs, toMs, before: textOf(Math.max(0, from - 12), from - 1), after: textOf(to + 1, Math.min(p.words.length - 1, to + 12)) },
        setBusy,
      ),
    );

  // ===== تسجيل من المايك (ببلاش) =====
  const startRecording = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setError("المتصفح مش قادر يوصل للمايك. اسمح له من علامة القفل جنب العنوان فوق.");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1000) return setError("التسجيلة فاضية. جرب تاني");
      applyFix(async ({ fromMs, toMs }) => {
        setBusy("بيرفع التسجيلة…");
        const up = await fetch("/api/upload?name=take.webm", { method: "POST", body: blob });
        const data = await up.json();
        if (!up.ok) throw new Error(data.error);
        return runJob<{ path: string }>("/api/autoedit/take", { path: p.media, take: data.path, fromMs, toMs }, setBusy);
      });
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  const toggleFix = (id: string) => update((prev) => ({ voiceFixes: (prev.voiceFixes ?? []).map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) }));
  const removeFix = (id: string) => update((prev) => ({ voiceFixes: (prev.voiceFixes ?? []).filter((x) => x.id !== id) }));

  const selected = (i: number) => !!sel && i >= sel.from && i <= sel.to;
  const selCut = sel ? Array.from({ length: sel.to - sel.from + 1 }, (_, k) => sel.from + k).some(manualCut) : false;
  const seconds = sel ? ((words[sel.to].endMs - words[sel.from].startMs) / 1000).toFixed(1) : "0";

  return (
    <>
      <div className="hint">اضغط على كلمة عشان تعدّلها، ولو عايز جملة كاملة دوس Shift واضغط على آخر كلمة. المشطوب اتشال من الفيديو.</div>
      <div className="ae-transcript" dir="rtl">
        {words.slice(0, 3000).map((w, i) => (
          <span
            key={i}
            className={`ae-word ${decisions[i]} ${selected(i) ? "selected" : ""} ${fixAt(i) ? "fixed" : ""}`}
            onClick={(e) => pick(i, e.shiftKey)}
            title={decisions[i] === "filler" ? "إمم/آآ" : decisions[i] === "cut" ? (manualCut(i) ? "انت شلتها" : "Claude شاله") : fixAt(i) ? "اتقالت تاني بصوتك" : ""}
          >
            {p.words[i]?.text.trim() || "␣"}{" "}
          </span>
        ))}
      </div>

      {sel && (
        <div className="subpanel word-editor">
          <label className="field">
            <span>
              {sel.from === sel.to ? "الكلمة" : `${sel.to - sel.from + 1} كلمات`} · {seconds} ثانية
            </span>
            <textarea rows={2} dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div className="brand-buttons">
            <button type="button" className="btn-small" onClick={saveText} disabled={!!busy}>
              ✓ صلّح الكتابة بس
            </button>
            {recording ? (
              <button type="button" className="btn-small btn-rec" onClick={stopRecording}>
                ⏹ خلصت
              </button>
            ) : (
              <button type="button" className="btn-small btn-ai" onClick={startRecording} disabled={!!busy} title="سجّل الكلام الصح بصوتك من المايك، وهيتحط مكان الغلط بنفس الطول">
                🎤 سجّلها بصوتي
              </button>
            )}
            {canRevoice && (
              <button type="button" className="btn-small btn-ai" onClick={revoice} disabled={!!busy || recording || !draft.trim()} title="الكلام ده هيتقال تاني بصوتك (ElevenLabs) في نفس المكان، والكابشن يتعدل معاه">
                🔊 خلّي ElevenLabs يقولها بصوتي
              </button>
            )}
            {selCut ? (
              <button type="button" className="btn-small" onClick={restoreSelection} disabled={!!busy}>
                ↩ رجّعها للفيديو
              </button>
            ) : (
              <button type="button" className="btn-small" onClick={cutSelection} disabled={!!busy}>
                ✂ شيلها من الفيديو
              </button>
            )}
            <button type="button" className="btn-small btn-ghost" onClick={() => setSel(null)}>
              اقفل
            </button>
          </div>
          {recording ? (
            <div className="job-status">⏺ بيسجّل… قول «{draft.trim() || textOf(sel.from, sel.to)}» بس، وبعدين اضغط «خلصت». (الكلمة الأصلية طولها {seconds} ثانية)</div>
          ) : (
            <div className="hint">🎤 بيسجل من المايك ويحط صوتك مكان الكلمة الغلط، بنفس طولها وبنفس علو الصوت.{!canRevoice && " ولو حطيت مفتاح ElevenLabs هيقدر يقولها بصوتك من غير ما تسجل."}</div>
          )}
          {busy && <div className="job-status">⏳ {busy}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {fixes.length > 0 && (
        <ul className="ae-cuts ae-fixes">
          {fixes.map((x) => (
            <li key={x.id} className={x.enabled ? "" : "off"}>
              <label className="check">
                <input type="checkbox" checked={x.enabled} onChange={() => toggleFix(x.id)} />
                <b>🔊 صوت مصلَّح</b>
                <small>{((x.toMs - x.fromMs) / 1000).toFixed(1)} ث</small>
              </label>
              <q dir="auto">{x.text}</q>
              <button type="button" className="link-btn" onClick={() => removeFix(x.id)}>
                امسح
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
