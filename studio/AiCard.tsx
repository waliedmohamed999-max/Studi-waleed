// كارت "فيديو من فكرة": تكتب الفكرة وClaude يعمل الفيديو كله (المشاهد والألوان والخط والحركة)
import { useState } from "react";
import { KeyHint } from "./settings";
import { aiVideoToProps, callAi, dialects, useAiStatus, type AiVideo, type Dialect } from "./ai";

export const AiHint: React.FC = () => <KeyHint>محتاج مفتاح Claude.</KeyHint>;

export const AiCard: React.FC<{ onCreate: (name: string, props: Record<string, unknown>) => void }> = ({ onCreate }) => {
  const status = useAiStatus();
  const [idea, setIdea] = useState("");
  const [dialect, setDialect] = useState<Dialect>("eg");
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const video = await callAi<AiVideo>("video", { idea, dialect, seconds });
      const props = aiVideoToProps(video);
      if (props.scenes.length === 0) throw new Error("Claude مرجعش مشاهد، جرب توضّح الفكرة أكتر");
      onCreate(video.name || idea.slice(0, 40), props);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card ai-card">
      <h2>✨ فيديو من فكرة</h2>
      {status && !status.available ? (
        <AiHint />
      ) : (
        <>
          <textarea
            rows={3}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="مثلًا: إعلان لكافيه في المعادي، عرض 20٪ على القهوة الأسبوع ده، رقمنا 0100…"
          />
          <div className="row-2">
            <label className="field">
              <span>اللهجة</span>
              <select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
                {dialects.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الطول</span>
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[10, 15, 20, 30, 45, 60].map((s) => (
                  <option key={s} value={s}>
                    {s} ثانية
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn-primary" onClick={generate} disabled={!idea.trim() || busy}>
            {busy ? "Claude بيفكر… (ممكن ياخد دقيقة)" : "✨ اعمل الفيديو"}
          </button>
          <div className="hint">هيتعمل مشروع جديد، فشغلك الحالي مش هيتمسح.{status?.mock && " (وضع التجربة: الرد ثابت)"}</div>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </section>
  );
};
