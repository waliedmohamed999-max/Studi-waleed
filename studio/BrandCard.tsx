// كارت هوية البراند: تحفظ لوجوك وألوانك وخطك مرة واحدة، وتطبقهم على أي فيديو بضغطة
import { useEffect, useState } from "react";
import { brandLabels, type Brand, type BrandKey, type VideoDef } from "../src/compositions";
import { fonts, type FontKey } from "../src/lib/fonts";
import { callAi, paletteOk, useAiStatus, type AiBrand } from "./ai";

// ===== Claude بيقترح 3 هويات حسب نوع البيزنس =====
const BrandAi: React.FC<{ apply: (b: Brand) => void }> = ({ apply }) => {
  const status = useAiStatus();
  const [business, setBusiness] = useState("");
  const [result, setResult] = useState<AiBrand["suggestions"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status?.available) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult((await callAi<AiBrand>("brand", { business })).suggestions ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="subpanel">
      <span className="scene-ai-title">✨ اقترح هوية بالذكاء الاصطناعي</span>
      <div className="scene-ai-row">
        <input type="text" value={business} placeholder="نوع البيزنس: كافيه، عيادة أسنان، جيم…" onChange={(e) => setBusiness(e.target.value)} />
        <button type="button" className="btn-small btn-ai" onClick={run} disabled={busy || !business.trim()}>
          {busy ? "بيفكر…" : "اقترح"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {result.map((s, i) => {
        const p = paletteOk(s.palette);
        return (
          <button
            key={i}
            type="button"
            className="suggestion"
            title="طبّق الهوية دي"
            onClick={() => apply({ font: s.font, primary: p.primary, secondary: p.secondary, text: p.textColor, accent: p.accent })}
          >
            <span className="suggestion-preview" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.secondary})`, color: p.textColor }}>
              أ<span style={{ color: p.accent }}>●</span>
            </span>
            <span className="suggestion-text">
              <b>{s.name}</b>
              <small>{s.why}</small>
              <small>{fonts[s.font as FontKey]?.label ?? s.font}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
};

const isColor = (v: string) => /^#[0-9a-f]{3,8}$/i.test(v);

export const BrandCard: React.FC<{
  video: VideoDef;
  props: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}> = ({ video, props, onApply }) => {
  const [brand, setBrand] = useState<Brand>({});
  const [msg, setMsg] = useState<string | null>(null);
  const mapping = Object.entries(video.brand ?? {}) as [BrandKey, string][];

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then(setBrand)
      .catch(() => {});
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  // بناخد القيم من الفيديو الحالي، ونسيب أي حاجة في البراند الفيديو ده مفيهوش خانة ليها
  const save = async () => {
    const next: Brand = { ...brand };
    for (const [bk, pk] of mapping) {
      const v = props[pk];
      if (typeof v === "string" && v) next[bk] = v;
    }
    await fetch("/api/brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    setBrand(next);
    flash("اتحفظ البراند ✅");
  };

  const apply = () => {
    const patch: Record<string, unknown> = {};
    for (const [bk, pk] of mapping) if (brand[bk]) patch[pk] = brand[bk];
    if (Object.keys(patch).length === 0) return flash("مفيش براند محفوظ لسه");
    onApply(patch);
    flash("اتطبق البراند ✅");
  };

  if (mapping.length === 0) return null;
  const hasBrand = Object.keys(brand).length > 0;

  return (
    <section className="card">
      <h2>هوية البراند</h2>
      {hasBrand ? (
        <div className="brand-preview">
          {brand.logo && <img src={`/${brand.logo}`} alt="" className="brand-logo" />}
          <div className="brand-info">
            {brand.name && <b>{brand.name}</b>}
            <div className="swatches">
              {(["primary", "secondary", "text", "accent"] as BrandKey[])
                .filter((k) => brand[k] && isColor(brand[k]!))
                .map((k) => (
                  <span key={k} className="swatch" style={{ background: brand[k] }} title={brandLabels[k]} />
                ))}
            </div>
            {brand.font && <small>{fonts[brand.font as FontKey]?.label ?? brand.font}</small>}
          </div>
        </div>
      ) : (
        <div className="hint">ظبّط الألوان واللوجو والخط، وبعدين احفظهم كبراند عشان تستخدمهم في أي فيديو.</div>
      )}
      <div className="brand-buttons">
        <button type="button" className="btn-small" onClick={save}>
          💾 احفظ الحالي كبراند
        </button>
        <button type="button" className="btn-small" onClick={apply} disabled={!hasBrand}>
          ✨ طبّق البراند
        </button>
      </div>
      {msg && <div className="flash">{msg}</div>}
      <BrandAi
        apply={(b) => {
          // الاقتراح بيتطبق على الفيديو الحالي بنفس طريقة البراند المحفوظ
          const patch: Record<string, unknown> = {};
          for (const [bk, pk] of mapping) if (b[bk]) patch[pk] = b[bk];
          onApply(patch);
          flash("اتطبقت الهوية ✅ (لو عجبتك احفظها كبراند)");
        }}
      />
    </section>
  );
};
