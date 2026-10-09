// "راجع قبل التصدير": فحص سريع ومجاني للمشاكل المعروفة، و Claude بيتفرج على لقطات من الفيديو ويقولك فين المشاكل
import { useState } from "react";
import type { Scene } from "../src/scenes/defs";
import type { Layer } from "../src/scenes/layers";
import type { ExportSettings } from "./ExportCard";
import { useAiStatus } from "./ai";
import { runJob } from "./jobs";
import { KeyHint } from "./settings";

type Check = { level: "ok" | "warn" | "bad"; text: string };
type Review = { verdict: string; score: number; issues: { severity: "high" | "medium" | "low"; at: string; problem: string; fix: string }[]; frames: number[] };
type Meta = { width: number; height: number; durationInFrames: number; fps: number };

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ===== الفحص السريع (من غير ذكاء اصطناعي) =====
export const quickChecks = (videoId: string, props: Record<string, unknown>, meta: Meta, settings: ExportSettings): Check[] => {
  const out: Check[] = [];
  const secs = meta.durationInFrames / meta.fps;
  const vertical = meta.height > meta.width;
  const add = (level: Check["level"], text: string) => out.push({ level, text });

  // الطول والمقاس
  if (secs < 5) add("warn", `الفيديو قصير جدًا (${secs.toFixed(1)} ثانية)`);
  else if (vertical && secs > 90) add("warn", `${Math.round(secs)} ثانية طويل على فيديو طولي؛ الأنسب أقل من 60 ثانية`);
  else add("ok", `الطول ${Math.round(secs)} ثانية مناسب`);
  if (!vertical) add("warn", "الفيديو مش طولي: تيك توك وريلز وشورتس محتاجين 9:16");

  // الصوت
  if (!settings.loudness && settings.format !== "gif") add("warn", "ظبط علو الصوت مقفول في التصدير (الفيديو ممكن يطلع واطي أو عالي عن غيره)");
  const musicVol = Number(props.musicVolume ?? 0);
  const hasVoice = !!(props.voiceover || props.media || (videoId === "Film" && (props.shots as { voice: string }[] | undefined)?.some((s) => s.voice)));
  if (str(props.music) && hasVoice && musicVol > 35) add("warn", `صوت المزيكا ${musicVol}٪ عالي على الكلام؛ الأنسب من 8 لـ 20٪`);

  if (videoId === "AutoEdit") {
    if (!str(props.media)) add("bad", "مفيش فيديو مرفوع");
    if (!(props.words as unknown[])?.length) add("warn", "الكلام متفرّغش، فمفيش كابشن ولا شيل إمم");
    if (props.captions !== "on") add("warn", "الكابشن مقفول (85٪ من الناس بيتفرجوا من غير صوت)");
    if (!str(props.hookTitle) || props.showHook === "off") add("warn", "مفيش عنوان شادد في أول 3 ثواني");
    if (!str(props.cleanAudio) && props.useDub !== "on") add("warn", "الصوت متنضفش (جرّب \"نضّف الصوت\")");
    const brokenBroll = ((props.brolls as { enabled: boolean; src: string }[]) ?? []).filter((b) => b.enabled && !b.src).length;
    if (brokenBroll) add("warn", `${brokenBroll} لقطة B-roll لسه متجابتش`);
  }

  if (videoId === "Project") {
    const scenes = (props.scenes as Scene[]) ?? [];
    if (!scenes.length) add("bad", "مفيش مشاهد");
    if (scenes[0] && Number(scenes[0].duration) > 4) add("warn", "أول مشهد أطول من 4 ثواني؛ البداية لازم تبقى سريعة وشادة");
    scenes.forEach((s, i) => {
      const words = `${str(s.title)} ${str(s.text)} ${str(s.heading)} ${str(s.quote)}`.trim().split(/\s+/).filter(Boolean).length;
      if (words > 3 * Number(s.duration || 3) + 3) add("warn", `مشهد ${i + 1}: كلام كتير (${words} كلمة) على ${s.duration} ثانية؛ مش هيلحق يتقري`);
      if (s.type === "video" && !str(s.video)) add("bad", `مشهد ${i + 1}: مفيش فيديو`);
      if (vertical)
        for (const l of (s.layers as Layer[]) ?? [])
          if (l.y > 80 || l.y < 8 || l.x > 87) add("warn", `مشهد ${i + 1}: طبقة "${l.text || "صورة"}" تحت أزرار المنصة؛ قرّبها للنص`);
    });
    if (scenes.length && scenes.at(-1)?.type !== "cta") add("warn", "آخر مشهد مش \"زرار نهاية\"؛ قول للناس يعملوا إيه");
  }

  if (videoId === "Film") {
    const shots = (props.shots as { clip: string; keyframe: string }[]) ?? [];
    const missing = shots.filter((s) => !s.clip).length;
    if (!shots.length) add("bad", "مفيش لقطات (اكتب السيناريو الأول)");
    else if (missing) add("warn", `${missing} لقطة لسه من غير فيديو (هتطلع صورة ثابتة)`);
    if (!str(props.cta) && !str(props.logo)) add("warn", "مفيش كارت نهاية (لوجو أو دعوة للتواصل)");
  }

  if (videoId === "Captioned" && !(props.captions as unknown[])?.length) add("warn", "مفيش كابشن");
  if (!out.some((c) => c.level !== "ok")) add("ok", "مفيش مشاكل واضحة 👌");
  return out;
};

export const ReviewCard: React.FC<{
  videoId: string;
  props: Record<string, unknown>;
  meta: Meta;
  settings: ExportSettings;
  seek: (frame: number) => void;
}> = ({ videoId, props, meta, settings, seek }) => {
  const ai = useAiStatus();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deep = async () => {
    setError(null);
    setReview(null);
    setBusy("بيبدأ… (أول مرة بتاخد دقيقة)");
    try {
      setReview(await runJob<Review>("/api/ai/review", { videoId, props, info: { template: videoId, checks: quickChecks(videoId, props, meta, settings).filter((c) => c.level !== "ok").map((c) => c.text) } }, setBusy));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const goTo = (at: string) => {
    const n = Number(at);
    if (!review || !Number.isInteger(n) || n < 1 || n > review.frames.length) return;
    seek(Math.round(review.frames[n - 1] * meta.fps));
  };

  return (
    <section className="card review">
      <div className="brand-buttons">
        <button type="button" className="btn-small" onClick={() => setChecks(quickChecks(videoId, props, meta, settings))}>
          🔍 فحص سريع (مجاني)
        </button>
        <button type="button" className="btn-small btn-ai" onClick={deep} disabled={!!busy || !ai?.available}>
          ✨ Claude يتفرج ويراجع
        </button>
      </div>
      {ai && !ai.available && <KeyHint>المراجعة بالذكاء الاصطناعي محتاجة مفتاح Claude.</KeyHint>}

      {checks && (
        <ul className="checks">
          {checks.map((c, i) => (
            <li key={i} className={c.level}>
              <span aria-hidden="true">{c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✕"}</span>
              {c.text}
            </li>
          ))}
        </ul>
      )}

      {busy && <div className="job-status">⏳ {busy}</div>}
      {error && <div className="error">{error}</div>}

      {review && (
        <div className="review-result">
          <div className="review-score">
            <b>{review.score}/10</b>
            <span dir="auto">{review.verdict}</span>
          </div>
          <ul className="review-issues">
            {review.issues.map((x, i) => (
              <li key={i} className={x.severity}>
                <span className="sev">{x.severity === "high" ? "مهم" : x.severity === "medium" ? "متوسط" : "بسيط"}</span>
                <div>
                  <b dir="auto">{x.problem}</b>
                  <small dir="auto">الحل: {x.fix}</small>
                  {Number.isInteger(Number(x.at)) && (
                    <button type="button" className="link-btn" onClick={() => goTo(x.at)}>
                      روح للحتة دي
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
