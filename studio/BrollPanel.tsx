// لقطات B-roll: Claude بيقترح أماكنها وهو بيحلل الكلام، والاستوديو بيجيب لقطة حقيقية من Pexels (أو يولّد صورة)
// تقدر تغير الوصف، تجيب لقطة تانية، تقفل أي واحدة، أو تضيف لقطة عند المؤشر
import { useEffect, useState } from "react";
import { uid } from "../src/scenes/defs";
import type { Broll } from "../src/AutoEditVideo";
import { KeyHint, useKeysVersion } from "./settings";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sec = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;

export const newBroll = (b: Partial<Broll> & { fromMs: number; toMs: number }): Broll => ({
  id: uid(),
  query: "",
  description: "",
  src: "",
  kind: "",
  credit: "",
  enabled: true,
  skip: 0,
  ...b,
});

export const BrollPanel: React.FC<{
  brolls: Broll[];
  format: string;
  onChange: (fn: (list: Broll[]) => Broll[]) => void;
  onSeek: (b: Broll) => void;
  playheadSourceMs: number | null; // مكان المؤشر في الفيديو الأصلي (عشان "أضف هنا")
}> = ({ brolls, format, onChange, onSeek, playheadSourceMs }) => {
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ pexels: boolean; fal: boolean } | null>(null);
  const keys = useKeysVersion();

  useEffect(() => {
    Promise.all([fetch("/api/settings").then((r) => r.json()), fetch("/api/film/status").then((r) => r.json())])
      .then(([s, f]) => setStatus({ pexels: s.keys.some((k: { id: string; set: boolean }) => k.id === "PEXELS_API_KEY" && k.set), fal: !!f.fal }))
      .catch(() => {});
  }, [keys]);

  const patch = (id: string, p: Partial<Broll>) => onChange((list) => list.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const fetchOne = async (b: Broll, skip = b.skip) => {
    setBusy((s) => ({ ...s, [b.id]: "بيبدأ…" }));
    try {
      const r = await fetch("/api/broll/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: b.query, description: b.description, format, seconds: (b.toMs - b.fromMs) / 1000, skip }),
      });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(900);
        const j = await fetch(`/api/film/job/${jobId}`).then((x) => x.json());
        if (j.status === "done") {
          patch(b.id, { src: j.result.src, kind: j.result.kind, credit: j.result.credit, skip });
          break;
        }
        if (j.status === "error") throw new Error(j.error);
        setBusy((s) => ({ ...s, [b.id]: j.step }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((s) => {
        const n = { ...s };
        delete n[b.id];
        return n;
      });
    }
  };

  const missing = brolls.filter((b) => b.enabled && !b.src && b.query.trim());
  // بنجيبهم 3 3 عشان منضغطش على الخدمة
  const fetchAll = async () => {
    setError(null);
    for (let i = 0; i < missing.length; i += 3) await Promise.all(missing.slice(i, i + 3).map((b) => fetchOne(b)));
  };

  const addHere = () => {
    if (playheadSourceMs === null) return;
    const b = newBroll({ fromMs: Math.round(playheadSourceMs), toMs: Math.round(playheadSourceMs) + 3000, description: "لقطة جديدة" });
    onChange((list) => [...list, b]);
  };

  const canFetch = !!(status?.pexels || status?.fal);

  return (
    <div className="broll">
      {status && !canFetch && <KeyHint>محتاج مفتاح Pexels (مجاني، لقطات فيديو حقيقية) أو fal.ai (صور متولدة).</KeyHint>}
      {status && !status.pexels && status.fal && <div className="hint">من غير مفتاح Pexels هتتولد صور بالذكاء الاصطناعي (~$0.15 للصورة). مفتاح Pexels مجاني وبيجيب فيديوهات حقيقية.</div>}

      {missing.length > 0 && (
        <button type="button" className="btn-small btn-ai" onClick={fetchAll} disabled={!canFetch || Object.keys(busy).length > 0}>
          🎞️ هات اللقطات ({missing.length})
        </button>
      )}

      {brolls.map((b) => (
        <div key={b.id} className={`broll-item ${b.enabled ? "" : "off"}`}>
          <button type="button" className="broll-thumb" onClick={() => onSeek(b)} aria-label={`روح للقطة ${b.description}`}>
            {b.src ? b.kind === "video" ? <video src={`/${b.src}#t=0.5`} muted preload="metadata" /> : <img src={`/${b.src}`} alt="" /> : <span>🎞️</span>}
          </button>
          <div className="broll-body">
            <div className="broll-top">
              <label className="check">
                <input type="checkbox" checked={b.enabled} onChange={(e) => patch(b.id, { enabled: e.target.checked })} />
                <b dir="auto">{b.description || "لقطة"}</b>
              </label>
              <small>{sec(b.fromMs)}</small>
            </div>
            <input
              type="text"
              dir="ltr"
              value={b.query}
              placeholder="e.g. pouring coffee"
              aria-label="وصف البحث بالإنجليزي"
              onChange={(e) => patch(b.id, { query: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && b.query.trim() && fetchOne({ ...b, skip: 0 }, 0)}
            />
            <div className="broll-actions">
              {busy[b.id] ? (
                <span className="film-busy">⏳ {busy[b.id]}</span>
              ) : (
                <>
                  <button type="button" className="btn-small" disabled={!canFetch || !b.query.trim()} onClick={() => fetchOne(b, b.src ? b.skip + 1 : b.skip)}>
                    {b.src ? "لقطة تانية" : "هات لقطة"}
                  </button>
                  <label className="broll-len">
                    <span className="sr-only">المدة</span>
                    <select value={Math.round((b.toMs - b.fromMs) / 1000)} onChange={(e) => patch(b.id, { toMs: b.fromMs + Number(e.target.value) * 1000, fromWord: undefined, toWord: undefined })}>
                      {[...new Set([Math.round((b.toMs - b.fromMs) / 1000), 2, 3, 4, 5, 6, 8])].sort((x, y) => x - y).map((s) => (
                        <option key={s} value={s}>
                          {s} ث
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn-small btn-ghost" onClick={() => onChange((list) => list.filter((x) => x.id !== b.id))} aria-label="امسح اللقطة">
                    ✕
                  </button>
                </>
              )}
            </div>
            {b.credit && <small className="broll-credit">📷 {b.credit}</small>}
          </div>
        </div>
      ))}

      <button type="button" className="btn-add" onClick={addHere} disabled={playheadSourceMs === null}>
        + أضف لقطة عند المؤشر
      </button>
      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
};
