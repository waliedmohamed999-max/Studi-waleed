// شاشة الإعدادات: تحط مفاتيح الخدمات وتغيرها وتجربها من جوه الاستوديو
// المفاتيح بتتحفظ على جهازك في ملف .env، والمتصفح عمره ما بيشوف المفتاح كامل (آخر 4 حروف بس)
import { useEffect, useState } from "react";
import { keysChanged } from "./settings";
import { runJob } from "./jobs";

type Perf = { cpus: number; concurrency: number; tested: boolean; results: { concurrency: number; ms: number }[] };

// ===== سرعة التصدير: اختبار بيختار أنسب إعداد لجهازك =====
const PerfSection: React.FC = () => {
  const [perf, setPerf] = useState<Perf | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/perf")
      .then((r) => r.json())
      .then(setPerf)
      .catch(() => {});
  }, []);
  const test = async () => {
    setError(null);
    setBusy("بيبدأ… (حوالي دقيقة)");
    try {
      setPerf(await runJob<Perf>("/api/perf/benchmark", {}, setBusy));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (!perf) return null;
  const best = perf.results.length ? Math.min(...perf.results.map((r) => r.ms)) : 0;
  return (
    <section className="key-row">
      <div className="key-head">
        <b>⚡ سرعة التصدير</b>
        <span className={`key-state ${perf.tested ? "on" : "off"}`}>{perf.tested ? "متظبطة على جهازك" : "الإعداد العام"}</span>
      </div>
      <div className="key-use">
        جهازك فيه {perf.cpus} نواة، والتصدير بيرسم {perf.concurrency} صفحات مع بعض. الاختبار بيجرّب كذا إعداد ويختار الأسرع لجهازك انت (بياخد حوالي دقيقة).
      </div>
      {perf.results.length > 0 && (
        <ul className="checks">
          {perf.results.map((r) => (
            <li key={r.concurrency} className={r.ms === best ? "ok" : ""}>
              <span aria-hidden="true">{r.ms === best ? "✓" : "·"}</span>
              {r.concurrency} مع بعض: {(r.ms / 1000).toFixed(1)} ثانية
            </li>
          ))}
        </ul>
      )}
      <div className="key-actions">
        <button type="button" className="btn-small btn-ai" onClick={test} disabled={!!busy}>
          {busy ? `⏳ ${busy}` : "اختبر سرعة جهازك"}
        </button>
      </div>
      <div className="hint">للسرعة الكبيرة جدًا (فيديوهات كتير أو طويلة): كارت شاشة NVIDIA، أو التصدير السحابي (Remotion Lambda).</div>
      {error && <div className="error">{error}</div>}
    </section>
  );
};

type Key = { id: string; name: string; use: string; url: string; set: boolean; masked: string };
type State = { keys: Key[]; mock: boolean };
type Test = { ok: boolean; message: string };

const send = async (url: string, method: string, body?: unknown) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({ error: "السيرفر مردش" }));
  if (!r.ok) throw new Error(data.error ?? "حصلت مشكلة");
  return data;
};

export const SettingsTool: React.FC = () => {
  const [state, setState] = useState<State | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [tests, setTests] = useState<Record<string, Test | "busy">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // لو السيرفر لسه بيقوم (أو بيعيد التشغيل)، بنحاول تاني كل ثانيتين لحد ما يرد
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (state) return;
    let alive = true;
    send("/api/settings", "GET")
      .then((s) => {
        if (!alive) return;
        setState(s);
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setError("السيرفر مش بيرد. اتأكد إن الاستوديو شغال (npm run studio)، وبنحاول تاني لوحدنا…");
        setTimeout(() => alive && setAttempt((a) => a + 1), 2000);
      });
    return () => {
      alive = false;
    };
  }, [attempt, state]);

  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: "busy" }));
    try {
      const r: Test = await send(`/api/settings/test/${id}`, "POST");
      setTests((t) => ({ ...t, [id]: r }));
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { ok: false, message: (e as Error).message } }));
    }
  };

  const save = async (keys: Record<string, string>, mock?: boolean, after?: string) => {
    setBusy(Object.keys(keys)[0] ?? "mock");
    setError(null);
    try {
      const next: State = await send("/api/settings", "PUT", { keys, mock });
      setState(next);
      setDrafts((d) => {
        const n = { ...d };
        for (const k of Object.keys(keys)) delete n[k];
        return n;
      });
      keysChanged();
      if (after) await test(after);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!state) return <div className="card">{error ? <div className="error">{error}</div> : <div className="hint">بيحمّل…</div>}</div>;

  return (
    <div className="card settings">
      <div className="hint">
        المفاتيح بتتحفظ على جهازك بس (في ملف <code>.env</code> جنب السيرفر)، ومش بتتبعت لأي حد غير الخدمة نفسها. تقدر تغيرها في أي وقت، والتغيير بيشتغل على طول من غير ما تقفل الاستوديو.
      </div>

      {state.keys.map((k) => {
        const draft = drafts[k.id] ?? "";
        const t = tests[k.id];
        const inputId = `key-${k.id}`;
        return (
          <section key={k.id} className="key-row" aria-labelledby={`${inputId}-title`}>
            <div className="key-head">
              <b id={`${inputId}-title`}>{k.name}</b>
              <span className={`key-state ${k.set ? "on" : "off"}`}>
                {k.set ? (
                  <>
                    متحط <code dir="ltr">{k.masked}</code>
                  </>
                ) : (
                  "مش متحط"
                )}
              </span>
            </div>
            <div className="key-use">{k.use}</div>
            <label className="sr-only" htmlFor={inputId}>
              مفتاح {k.name}
            </label>
            <div className="key-input">
              <input
                id={inputId}
                type={show[k.id] ? "text" : "password"}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                placeholder={k.set ? "الصق مفتاح جديد عشان تغيّره" : "الصق المفتاح هنا"}
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [k.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && draft.trim() && save({ [k.id]: draft }, undefined, k.id)}
              />
              <button type="button" className="btn-small" onClick={() => setShow((s) => ({ ...s, [k.id]: !s[k.id] }))} aria-pressed={!!show[k.id]}>
                {show[k.id] ? "اخفي" : "اظهر"}
              </button>
            </div>
            <div className="key-actions">
              <button type="button" className="btn-small btn-ai" disabled={!draft.trim() || busy === k.id} onClick={() => save({ [k.id]: draft }, undefined, k.id)}>
                {busy === k.id ? "بيحفظ…" : "احفظ وجرّب"}
              </button>
              {k.set && (
                <>
                  <button type="button" className="btn-small" disabled={t === "busy"} onClick={() => test(k.id)}>
                    {t === "busy" ? "بيجرب…" : "جرّب المفتاح"}
                  </button>
                  <button
                    type="button"
                    className="btn-small danger"
                    onClick={() => window.confirm(`تمسح مفتاح ${k.name}؟`) && save({ [k.id]: "" })}
                  >
                    امسح
                  </button>
                </>
              )}
              <a className="link-btn" href={k.url} target="_blank" rel="noopener noreferrer">
                هات مفتاح ↗
              </a>
            </div>
            {t && t !== "busy" && (
              <div className={t.ok ? "flash" : "error"} role="status">
                {t.message}
              </div>
            )}
          </section>
        );
      })}

      <section className="key-row">
        <label className="check">
          <input type="checkbox" checked={state.mock} disabled={busy === "mock"} onChange={(e) => save({}, e.target.checked)} />
          <span>
            <b>وضع التجربة</b>: كل الذكاء الاصطناعي بيرجع نتايج تجريبية مجانية (عشان تجرب الاستوديو من غير ما تصرف). اقفله لما تحب تشتغل بجد.
          </span>
        </label>
      </section>

      <PerfSection />

      {error && <div className="error">{error}</div>}
    </div>
  );
};
