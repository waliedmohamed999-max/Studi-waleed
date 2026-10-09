// زرار "نضّف الصوت": بيشيل الدوشة والهمهمة ويظبط العلو، وبيحط النسخة النضيفة مكان الصوت الأصلي
import { useState } from "react";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const CleanAudio: React.FC<{ media: string; clean: string; onChange: (path: string) => void }> = ({ media, clean, onChange }) => {
  const [strength, setStrength] = useState(0.6);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await fetch("/api/audio/clean", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: media, strength }) });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(800);
        const j = await fetch(`/api/film/job/${jobId}`).then((x) => x.json());
        if (j.status === "done") return onChange(j.result.path);
        if (j.status === "error") throw new Error(j.error);
        setBusy(j.step);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="clean-audio">
      <div className="row-2">
        <label className="field">
          <span>تنضيف الدوشة</span>
          <select value={strength} onChange={(e) => setStrength(Number(e.target.value))}>
            <option value={0.35}>خفيف (مكان هادي)</option>
            <option value={0.6}>متوسط</option>
            <option value={0.85}>قوي (تكييف أو شارع)</option>
            <option value={0}>من غير تنضيف (علو بس)</option>
          </select>
        </label>
        <button type="button" className="btn-small btn-ai" onClick={run} disabled={!media || !!busy}>
          🎧 {busy ? busy : clean ? "نضّف تاني" : "نضّف الصوت"}
        </button>
      </div>
      {clean && (
        <div className="clean-on">
          <span>✓ بيستخدم الصوت النضيف</span>
          <audio src={`/${clean}`} controls preload="none" className="asset-audio" />
          <button type="button" className="link-btn" onClick={() => onChange("")}>
            رجّع الصوت الأصلي
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
