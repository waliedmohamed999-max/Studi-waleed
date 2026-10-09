// "خطة المحتوى": Claude بيعمل خطة فيديوهات (أسبوع، أسبوعين، شهر) لنشاطك، وكل فكرة تتحول لفيديو بضغطة
// - سريع: فيديو مشاهد متحركة (بيتعمل على طول)
// - فيلم: بيفتح في مخرج الأفلام بالفكرة جاهزة
// - كلام للكاميرا: سكريبت جاهز تقراه، ومشروع مونتاج أوتوماتيك مستني الفيديو بتاعك
import { useEffect, useState } from "react";
import { videos } from "../src/compositions";
import { aiVideoToProps, callAi, useAiStatus, type AiVideo } from "./ai";
import { platforms } from "./platforms";
import { KeyHint } from "./settings";

type Format = "quick" | "talk" | "film";
type Item = { day: number; pillar: string; format: Format; title: string; hook: string; idea: string; script: string; cta: string; hashtags: string[]; projectId?: string };
type Plan = { business: string; audience: string; dialect: string; platform: string; goal: string; count: number; createdAt: number; items: Item[] };

const formatInfo: Record<Format, { icon: string; label: string }> = {
  quick: { icon: "⚡", label: "فيديو سريع" },
  talk: { icon: "🎙️", label: "كلام للكاميرا" },
  film: { icon: "🎬", label: "فيلم بالذكاء الاصطناعي" },
};
const dialects = [
  { value: "najdi", label: "سعودي نجدي" },
  { value: "hijazi", label: "سعودي حجازي" },
  { value: "gulf", label: "خليجي" },
  { value: "eg", label: "مصري" },
  { value: "msa", label: "فصحى" },
  { value: "en", label: "English" },
];
// الفيديو السريع بيقبل لهجات أقل
const quickDialect = (d: string) => (d === "najdi" || d === "hijazi" ? "gulf" : d);

// مشروع جديد على السيرفر من غير ما نقفل اللي انت شغال عليه
const createProject = async (videoId: string, name: string, props: Record<string, unknown>) => {
  const v = videos.find((x) => x.id === videoId)!;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const r = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, videoId, props: { ...structuredClone(v.defaultProps), ...props } }),
  });
  if (!r.ok) throw new Error("حفظ المشروع فشل");
  return id;
};

const csvCell = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export const PlanTool: React.FC<{ onOpen: (projectId: string) => void }> = ({ onOpen }) => {
  const ai = useAiStatus();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState({ business: "", audience: "", dialect: "najdi", platform: "tiktok", goal: "", count: 7 });
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content-plan")
      .then((r) => r.json())
      .then((p: Plan | null) => {
        if (!p) return;
        setPlan(p);
        setForm({ business: p.business, audience: p.audience, dialect: p.dialect, platform: p.platform, goal: p.goal, count: p.count });
      })
      .catch(() => {});
  }, []);

  const save = (next: Plan) => {
    setPlan(next);
    fetch("/api/content-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
  };
  const patchItem = (day: number, patch: Partial<Item>) => setPlan((cur) => {
    if (!cur) return cur;
    const next = { ...cur, items: cur.items.map((x) => (x.day === day ? { ...x, ...patch } : x)) };
    fetch("/api/content-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
    return next;
  });

  const make = async () => {
    if (plan && !confirm("ده هيستبدل الخطة الحالية. تكمل؟")) return;
    setError(null);
    setBusy("Claude بيعمل الخطة… (ممكن ياخد دقيقة)");
    try {
      const platform = platforms.find((x) => x.id === form.platform)?.name ?? form.platform;
      const r = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, platform }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      save({ ...form, createdAt: Date.now(), items: (data.items as Item[]).map((x, i) => ({ ...x, day: i + 1 })) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ===== فكرة ← مشروع =====
  const build = async (it: Item) => {
    const name = `يوم ${it.day} · ${it.title}`;
    if (it.format === "quick") {
      const v = await callAi<AiVideo>("video", { idea: `${it.title}\n${it.hook}\n${it.script}\nCTA: ${it.cta}`, dialect: quickDialect(form.dialect), seconds: 20 });
      const props = aiVideoToProps(v);
      if (!props.scenes.length) throw new Error("Claude مرجعش مشاهد");
      return createProject("Project", name, props);
    }
    if (it.format === "film") {
      return createProject("Film", name, { brief: `${it.title}\n${it.idea}\n${it.script}\nالدعوة للتواصل: ${it.cta}`, dialect: form.dialect, targetSeconds: 30 });
    }
    return createProject("AutoEdit", name, { hookTitle: it.hook });
  };

  const buildOne = async (it: Item) => {
    setError(null);
    setBusy(`بيجهز "${it.title}"…`);
    try {
      patchItem(it.day, { projectId: await build(it) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const quickLeft = (plan?.items ?? []).filter((x) => x.format === "quick" && !x.projectId);
  const buildAllQuick = async () => {
    setError(null);
    let done = 0;
    try {
      for (const it of quickLeft) {
        setBusy(`بيعمل الفيديوهات السريعة (${done + 1}/${quickLeft.length})…`);
        patchItem(it.day, { projectId: await build(it) });
        done++;
      }
      setMsg(`اتعمل ${done} فيديو. هتلاقيهم في المشاريع.`);
    } catch (e) {
      setError(`وقف بعد ${done}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // CSV بيتفتح في Excel (بالعربي مظبوط)
  const exportCsv = () => {
    if (!plan) return;
    const rows = [["اليوم", "النوع", "المحور", "العنوان", "أول جملة", "الفكرة", "السكريبت", "الدعوة", "الهاشتاجات"], ...plan.items.map((x) => [x.day, formatInfo[x.format].label, x.pillar, x.title, x.hook, x.idea, x.script, x.cta, x.hashtags.map((h) => `#${h}`).join(" ")])];
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "خطة-المحتوى.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("اتنسخ ✓");
    } catch {
      setMsg("النسخ مش متاح، حدد الكلام وانسخه بإيدك");
    }
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="card plan">
      <details open={!plan}>
        <summary className="plan-summary">{plan ? "خطة جديدة" : "اعمل خطة محتوى"}</summary>
        <label className="field">
          <span>نشاطك</span>
          <textarea rows={3} value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="مثلًا: كافيه قهوة مختصة في الرياض، حي الملقا، عندنا حلويات بيتي" />
        </label>
        <label className="field">
          <span>جمهورك (اختياري)</span>
          <input type="text" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="شباب من 20 لـ 35، موظفين، طلاب جامعة" />
        </label>
        <label className="field">
          <span>هدفك (اختياري)</span>
          <input type="text" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="زيادة الزوار في أيام الأسبوع" />
        </label>
        <div className="row-3">
          <label className="field">
            <span>اللهجة</span>
            <select value={form.dialect} onChange={(e) => setForm({ ...form, dialect: e.target.value })}>
              {dialects.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>المنصة</span>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {platforms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>كام فيديو</span>
            <select value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })}>
              {[7, 14, 30].map((n) => (
                <option key={n} value={n}>
                  {n === 7 ? "أسبوع (7)" : n === 14 ? "أسبوعين (14)" : "شهر (30)"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn-primary" onClick={make} disabled={!form.business.trim() || !!busy || !ai?.available}>
          📅 اعمل الخطة
        </button>
        {ai && !ai.available && <KeyHint>محتاج مفتاح Claude.</KeyHint>}
      </details>

      {plan && (
        <>
          <div className="plan-actions">
            {quickLeft.length > 0 && (
              <button type="button" className="btn-small btn-ai" onClick={buildAllQuick} disabled={!!busy}>
                ⚡ اعمل كل الفيديوهات السريعة ({quickLeft.length})
              </button>
            )}
            <button type="button" className="btn-small" onClick={exportCsv}>
              ⬇ الخطة Excel
            </button>
          </div>
          <ol className="plan-list">
            {plan.items.map((it) => (
              <li key={it.day} className={`plan-item ${open === it.day ? "open" : ""}`}>
                <button type="button" className="plan-head" onClick={() => setOpen(open === it.day ? null : it.day)} aria-expanded={open === it.day}>
                  <span className="plan-day">{it.day}</span>
                  <span className="plan-title" dir="auto">
                    <b>
                      {formatInfo[it.format].icon} {it.title}
                    </b>
                    <small>
                      {it.pillar} · {formatInfo[it.format].label}
                      {it.projectId && " · ✓ اتعمل"}
                    </small>
                  </span>
                </button>
                {open === it.day && (
                  <div className="plan-body">
                    <p className="plan-hook" dir="auto">
                      «{it.hook}»
                    </p>
                    <p dir="auto">{it.idea}</p>
                    <details>
                      <summary className="hint">{it.format === "talk" ? "السكريبت (اقراه للكاميرا)" : "التفاصيل"}</summary>
                      <p className="plan-script" dir="auto">
                        {it.script}
                      </p>
                    </details>
                    <small dir="auto">
                      {it.cta} · {it.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
                    </small>
                    <div className="brand-buttons">
                      {it.projectId ? (
                        <button type="button" className="btn-small" onClick={() => onOpen(it.projectId!)}>
                          افتح المشروع
                        </button>
                      ) : (
                        <button type="button" className="btn-small btn-ai" onClick={() => buildOne(it)} disabled={!!busy}>
                          {it.format === "quick" ? "⚡ اعمل الفيديو" : it.format === "film" ? "🎬 جهّز في مخرج الأفلام" : "✂️ جهّز مشروع مونتاج"}
                        </button>
                      )}
                      {it.format === "talk" && (
                        <button type="button" className="btn-small" onClick={() => copy(it.script)}>
                          📋 انسخ السكريبت
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {busy && <div className="job-status">⏳ {busy}</div>}
      {msg && <div className="flash">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
