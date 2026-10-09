// أداة "النشر": بتتأكد إن الفيديو مناسب للمنصة، وClaude بيكتب الكابشن والهاشتاجات، وبتصدّر وتفتح صفحة الرفع
import { useState } from "react";
import { platforms, aspectOf, type PlatformId } from "./platforms";
import { dialects, useAiStatus, type Dialect } from "./ai";
import { sendToQueue, type QueueItem } from "./ExportCard";

type Post = { title: string; caption: string; hashtags: string[] };

// كل الكلام اللي في الفيديو (من أي قالب) عشان Claude يفهم الفيديو عن إيه
const collectText = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") {
    const v = value.trim();
    if (v.length > 1 && !/^(#|uploads\/|demo\/|https?:)/.test(v) && !/\.(png|jpe?g|mp[34]|wav|webm|svg)$/i.test(v)) out.push(v);
  } else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectText(v, out));
  return out;
};

export const PublishTool: React.FC<{ current: QueueItem; meta: { width: number; height: number; durationInFrames: number; fps: number } }> = ({ current, meta }) => {
  const ai = useAiStatus();
  const [platformId, setPlatformId] = useState<PlatformId>("tiktok");
  const [dialect, setDialect] = useState<Dialect>("eg");
  const [post, setPost] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const platform = platforms.find((pl) => pl.id === platformId)!;
  const seconds = meta.durationInFrames / meta.fps;
  const aspect = aspectOf(meta.width, meta.height);

  // ===== الفحص =====
  const checks = [
    { ok: aspect === platform.aspect, text: aspect === platform.aspect ? `المقاس ${aspect} مظبوط` : `المقاس ${aspect}، و${platform.name} محتاج ${platform.aspect} (غيّره من الخصائص)` },
    { ok: seconds <= platform.maxSeconds, text: seconds <= platform.maxSeconds ? `الطول ${Math.round(seconds)} ثانية مسموح` : `الطول ${Math.round(seconds)} ثانية أطول من المسموح (${platform.maxSeconds})` },
    {
      ok: seconds >= platform.bestSeconds[0] && seconds <= platform.bestSeconds[1],
      warn: true,
      text:
        seconds < platform.bestSeconds[0]
          ? `قصير شوية: الأنسب من ${platform.bestSeconds[0]} لـ ${platform.bestSeconds[1]} ثانية`
          : seconds > platform.bestSeconds[1]
            ? `طويل شوية: الأنسب من ${platform.bestSeconds[0]} لـ ${platform.bestSeconds[1]} ثانية`
            : "الطول مثالي للمنصة",
    },
  ];

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const content = collectText(current.props).join(" | ").slice(0, 6000) || current.name;
      const r = await fetch("/api/ai/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.name, dialect, content, hashtags: platform.hashtags }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPost(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fullText = post ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : "";
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`اتنسخ ${label} ✓`);
    } catch {
      setMsg("النسخ مش متاح، حدد الكلام وانسخه بإيدك");
    }
    setTimeout(() => setMsg(null), 2500);
  };

  const exportForPlatform = async () => {
    setError(null);
    try {
      await sendToQueue(`${current.name} - ${platform.name}`, [current], { format: "mp4", quality: "high", thumbnail: true, loudness: true });
      setMsg("اتبعت للتصدير (MP4 بجودة عالية + صورة مصغرة + علو مظبوط). تابعه من أداة التصدير.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="platform-grid" role="radiogroup" aria-label="المنصة">
        {platforms.map((pl) => (
          <button key={pl.id} type="button" role="radio" aria-checked={pl.id === platformId} className={`platform ${pl.id === platformId ? "on" : ""}`} onClick={() => setPlatformId(pl.id)}>
            <b>{pl.name}</b>
            <small>{pl.aspect}</small>
          </button>
        ))}
      </div>

      <ul className="checks">
        {checks.map((c, i) => (
          <li key={i} className={c.ok ? "ok" : c.warn ? "warn" : "bad"}>
            <span aria-hidden="true">{c.ok ? "✓" : c.warn ? "!" : "✕"}</span>
            {c.text}
          </li>
        ))}
        {platform.safe && (
          <li className="ok">
            <span aria-hidden="true">i</span>
            افتح "مناطق الأمان" فوق المعاينة عشان تتأكد إن مفيش حاجة مهمة تحت أزرار المنصة
          </li>
        )}
      </ul>

      <div className="row-2">
        <label className="field">
          <span>لهجة الكابشن</span>
          <select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
            {dialects.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-small btn-ai" onClick={write} disabled={busy || !ai?.available}>
          ✨ {busy ? "بيكتب…" : post ? "اكتب تاني" : "اكتب الكابشن والهاشتاجات"}
        </button>
      </div>
      {ai && !ai.available && <div className="hint">كتابة الكابشن محتاجة مفتاح Claude.</div>}

      {post && (
        <div className="post">
          {(platformId === "youtube" || platformId === "shorts") && (
            <label className="field">
              <span>العنوان</span>
              <input type="text" value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>الكابشن</span>
            <textarea rows={5} value={post.caption} onChange={(e) => setPost({ ...post, caption: e.target.value })} />
          </label>
          <div className="placeholders">
            {post.hashtags.map((h, i) => (
              <span key={i} className="chip">
                #{h.replace(/^#/, "")}
              </span>
            ))}
          </div>
          <div className="brand-buttons">
            <button type="button" className="btn-small" onClick={() => copy(fullText, "الكابشن والهاشتاجات")}>
              📋 انسخ الكل
            </button>
            {post.title && (
              <button type="button" className="btn-small" onClick={() => copy(post.title, "العنوان")}>
                📋 انسخ العنوان
              </button>
            )}
          </div>
        </div>
      )}

      <button type="button" className="btn-primary" onClick={exportForPlatform} disabled={checks.some((c) => !c.ok && !c.warn)}>
        ⬇ صدّر لـ {platform.name}
      </button>
      <a className="btn-small open-upload" href={platform.uploadUrl} target="_blank" rel="noopener noreferrer">
        ↗ افتح صفحة الرفع في {platform.name}
      </a>
      {msg && <div className="flash">{msg}</div>}
      {error && <div className="error">{error}</div>}
      <div className="hint">
        النشر الأوتوماتيك المباشر محتاج "تطبيق مطوّر" رسمي من كل منصة (TikTok وMeta وGoogle) تعمله بحسابك، والمنصة لازم توافق عليه. لو عايزه، ده الخطوة الجاية.
      </div>
    </div>
  );
};
