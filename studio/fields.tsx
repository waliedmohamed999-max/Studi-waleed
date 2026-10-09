// خانات لوحة التعديل: نص، ألوان، قوائم، أرقام، صور، صوت، ومشاهد
import { useEffect, useRef, useState } from "react";
import type { Field } from "../src/compositions";
import type { Slide } from "../src/Promo";

type Kind = "image" | "audio" | "video" | "media"; // media = صوت أو فيديو
type Asset = { path: string; name: string; kind: "image" | "audio" | "video"; folder: string };
const isVideo = (p: string) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(p);
const matches = (want: Kind, got: Asset["kind"]) => (want === "media" ? got === "audio" || got === "video" : want === got);

const url = (p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : `/${p.replace(/^\/+/, "")}`);
const shortName = (p: string) => p.split("/").pop()?.replace(/^[a-z0-9]+-(?=.)/, "") ?? p;

// ===== اختيار صورة أو ملف صوت: من المكتبة أو رفع جديد =====
export const AssetPicker: React.FC<{
  kind: Kind;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}> = ({ kind, value, onChange, compact }) => {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    fetch("/api/assets")
      .then((r) => r.json())
      .then((list: Asset[]) => setAssets(list.filter((a) => matches(kind, a.kind))))
      .catch(() => setError("سيرفر الملفات مش شغال"));

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      onChange(data.path);
      refresh();
    } catch (e) {
      setError((e as Error).message || "الرفع فشل");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`asset ${compact ? "asset-compact" : ""}`}>
      <div className="asset-current">
        {value ? (
          kind === "image" ? (
            <img src={url(value)} alt="" className="asset-thumb" />
          ) : isVideo(value) ? (
            <video src={url(value)} controls muted preload="metadata" className="asset-video" />
          ) : (
            <audio src={url(value)} controls preload="none" className="asset-audio" />
          )
        ) : (
          <div className="asset-empty">{kind === "image" ? "🖼️" : kind === "audio" ? "🔇" : "🎬"}</div>
        )}
        <div className="asset-actions">
          {!compact && value && <span className="asset-name">{shortName(value)}</span>}
          <div className="asset-buttons">
            <button type="button" className="btn-small" onClick={() => setOpen((o) => !o)}>
              {open ? "اقفل" : "المكتبة"}
            </button>
            <button type="button" className="btn-small" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "بيترفع…" : "⬆ ارفع"}
            </button>
            {value && (
              <button type="button" className="btn-small btn-ghost" onClick={() => onChange("")} title="شيل">
                ✕
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "audio/*,video/*"}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>

      {error && <div className="error">{error}</div>}

      {open && (
        <div className={kind === "image" ? "library-grid" : "library-list"}>
          {assets.length === 0 && <div className="hint">مفيش ملفات لسه. ارفع أول ملف.</div>}
          {assets.map((a) =>
            kind === "image" ? (
              <button
                key={a.path}
                type="button"
                className={`library-item ${a.path === value ? "selected" : ""}`}
                title={a.name}
                onClick={() => {
                  onChange(a.path);
                  setOpen(false);
                }}
              >
                <img src={url(a.path)} alt="" />
              </button>
            ) : (
              <button
                key={a.path}
                type="button"
                className={`library-row ${a.path === value ? "selected" : ""}`}
                onClick={() => {
                  onChange(a.path);
                  setOpen(false);
                }}
              >
                {a.kind === "video" ? "🎬" : "🎵"} {shortName(a.path)} {a.folder === "demo" && <small>(تجربة)</small>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};

// ===== محرر المشاهد: صورة + كلام لكل مشهد =====
const SlidesEditor: React.FC<{ value: Slide[]; onChange: (v: Slide[]) => void }> = ({ value, onChange }) => {
  const update = (i: number, patch: Partial<Slide>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="slides">
      {value.map((s, i) => (
        <div key={i} className="slide">
          <div className="slide-head">
            <span className="slide-num">مشهد {i + 1}</span>
            <div className="slide-tools">
              <button type="button" className="btn-small btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} title="لفوق">
                ▲
              </button>
              <button type="button" className="btn-small btn-ghost" onClick={() => move(i, 1)} disabled={i === value.length - 1} title="لتحت">
                ▼
              </button>
              <button type="button" className="btn-small btn-ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} title="امسح المشهد">
                ✕
              </button>
            </div>
          </div>
          <AssetPicker kind="image" compact value={s.image} onChange={(image) => update(i, { image })} />
          <input type="text" value={s.text} placeholder="الكلام اللي على الصورة" onChange={(e) => update(i, { text: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn-add" onClick={() => onChange([...value, { image: "", text: "مشهد جديد" }])}>
        + أضف مشهد
      </button>
    </div>
  );
};

// ===== خانة تعديل واحدة =====
export const FieldInput: React.FC<{ field: Field; value: unknown; onChange: (v: unknown) => void }> = ({ field, value, onChange }) => {
  switch (field.type) {
    case "color":
      return (
        <label className="field field-color">
          <span>{field.label}</span>
          <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "select":
      return (
        <label className="field">
          <span>{field.label}</span>
          <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "number":
      if (field.box) {
        return (
          <label className="field">
            <span>{field.label}</span>
            <input
              type="number"
              dir="ltr"
              min={field.min}
              max={field.max}
              step={field.step}
              value={Number(value)}
              onChange={(e) => onChange(Math.min(field.max, Math.max(field.min, Number(e.target.value) || 0)))}
            />
          </label>
        );
      }
      return (
        <label className="field">
          <span>
            {field.label}: <b>{String(value)}</b> {field.suffix}
          </span>
          <input
            type="range"
            dir="ltr"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </label>
      );
    case "lines":
      return (
        <label className="field">
          <span>{field.label}</span>
          <textarea rows={4} value={(value as string[]).join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
        </label>
      );
    case "image":
    case "audio":
    case "media":
      return (
        <div className="field">
          <span>{field.label}</span>
          <AssetPicker kind={field.type} value={String(value ?? "")} onChange={onChange} />
        </div>
      );
    case "slides":
      return <SlidesEditor value={(value as Slide[]) ?? []} onChange={onChange} />;
    default:
      return (
        <label className="field">
          <span>{field.label}</span>
          <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
};
