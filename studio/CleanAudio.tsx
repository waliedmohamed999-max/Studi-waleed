// زرار "نضّف الصوت": بيشيل الدوشة (بالذكاء الاصطناعي أو الطريقة القديمة) ويحسن الصوت ويظبط العلو، وبيحط النسخة النضيفة مكان الصوت الأصلي
import { useState } from "react";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const CleanAudio: React.FC<{ media: string; clean: string; onChange: (path: string) => void }> = ({ media, clean, onChange }) => {
  // "ai:0.6" = ذكاء اصطناعي، "ai:0.85" = ذكاء اصطناعي + شيل بواقي الدوشة الثابتة، "classic:x" = الطريقة القديمة
  const [choice, setChoice] = useState("ai:0.6");
  const [polish, setPolish] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await fetch("/api/audio/clean", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: media, mode: choice.split(":")[0], strength: Number(choice.split(":")[1]), polish }) });
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
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="ai:0.6">ذكي بالـ AI (أي دوشة: شارع، ناس، مروحة)</option>
            <option value="ai:0.85">ذكي + قوي (دوشة عالية جدًا)</option>
            <option value="classic:0.6">عادي (دوشة ثابتة زي التكييف)</option>
            <option value="classic:0">من غير تنضيف (علو بس)</option>
          </select>
        </label>
        <button type="button" className="btn-small btn-ai" onClick={run} disabled={!media || !!busy}>
          🎧 {busy ? busy : clean ? "نضّف تاني" : "نضّف الصوت"}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} />
        <span>لمسة استوديو (وضوح أكتر وصوت مليان زي الإذاعة)</span>
      </label>
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
