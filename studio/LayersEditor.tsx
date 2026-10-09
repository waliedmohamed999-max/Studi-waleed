// محرر الطبقات جوه المشهد: نص، صورة/لوجو، ملصق، بمكان وحجم ووقت وحركة
// تقدر كمان تسحب أي طبقة على المعاينة نفسها عشان تحركها
import { uid } from "../src/scenes/defs";
import { layerAnims, newLayer, type Layer, type LayerKind } from "../src/scenes/layers";
import { AssetPicker } from "./fields";

const kindInfo: Record<LayerKind, { icon: string; label: string }> = {
  text: { icon: "T", label: "نص" },
  image: { icon: "🖼️", label: "صورة / لوجو" },
  sticker: { icon: "😀", label: "ملصق" },
};
const stickers = ["🔥", "⭐", "✅", "❤️", "👇", "👉", "💯", "🎉", "⚡", "📍", "🛒", "☕", "🇸🇦", "🇪🇬", "💰", "🆕"];
// أماكن جاهزة (3×3)
const spots = [
  [15, 12], [50, 12], [85, 12],
  [15, 50], [50, 50], [85, 50],
  [15, 85], [50, 85], [85, 85],
];
const spotNames = ["فوق يمين", "فوق في النص", "فوق شمال", "يمين", "النص", "شمال", "تحت يمين", "تحت في النص", "تحت شمال"];

const summary = (l: Layer) => (l.kind === "image" ? l.src.split("/").pop() || "صورة" : l.text.split("\n")[0] || kindInfo[l.kind].label);

export const LayersEditor: React.FC<{
  layers: Layer[];
  sceneSeconds: number;
  accent: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layers: Layer[]) => void;
}> = ({ layers, sceneSeconds, accent, selectedId, onSelect, onChange }) => {
  const patch = (id: string, p: Partial<Layer>) => onChange(layers.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = (kind: LayerKind) => {
    const l = newLayer(kind, uid(), kind === "text" ? "#ffffff" : accent);
    onChange([...layers, l]);
    onSelect(l.id);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="layers">
      <div className="layers-head">
        <span className="scene-ai-title">الطبقات فوق المشهد</span>
        <div className="layers-add">
          {(Object.keys(kindInfo) as LayerKind[]).map((k) => (
            <button key={k} type="button" className="btn-small" onClick={() => add(k)}>
              + {kindInfo[k].label}
            </button>
          ))}
        </div>
      </div>
      {layers.length > 0 && <div className="hint">اسحب الطبقة على المعاينة عشان تحركها. اللي تحت في القايمة بيبان فوق.</div>}

      {layers.map((l, i) => {
        const open = l.id === selectedId;
        return (
          <div key={l.id} className={`layer-item ${open ? "open" : ""}`}>
            <div className="layer-row">
              <button type="button" className="layer-pick" onClick={() => onSelect(open ? null : l.id)} aria-expanded={open}>
                <span className="layer-icon" aria-hidden="true">
                  {l.kind === "sticker" ? l.text : kindInfo[l.kind].icon}
                </span>
                <span className="layer-name" dir="auto">
                  {summary(l)}
                </span>
              </button>
              <span className="scene-tools">
                <button type="button" className="btn-small btn-ghost" onClick={() => move(i, 1)} disabled={i === layers.length - 1} aria-label="هات لقدام" title="هات لقدام">
                  ↑
                </button>
                <button type="button" className="btn-small btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="ودّي لورا" title="ودّي لورا">
                  ↓
                </button>
                <button type="button" className="btn-small btn-ghost" onClick={() => onChange([...layers.slice(0, i + 1), { ...l, id: uid(), x: Math.min(95, l.x + 5), y: Math.min(95, l.y + 5) }, ...layers.slice(i + 1)])} aria-label="كرّر" title="كرّر">
                  ⧉
                </button>
                <button type="button" className="btn-small btn-ghost" onClick={() => onChange(layers.filter((x) => x.id !== l.id))} aria-label="امسح" title="امسح">
                  ✕
                </button>
              </span>
            </div>

            {open && (
              <div className="layer-editor">
                {l.kind === "text" && (
                  <>
                    <label className="field">
                      <span>الكلام</span>
                      <textarea rows={2} value={l.text} onChange={(e) => patch(l.id, { text: e.target.value })} />
                    </label>
                    <div className="row-2">
                      <label className="field">
                        <span>اللون</span>
                        <input type="color" value={l.color} onChange={(e) => patch(l.id, { color: e.target.value })} />
                      </label>
                      <label className="field">
                        <span>خلفية ورا الكلام</span>
                        <span className="layer-box">
                          <input type="checkbox" checked={!!l.box} onChange={(e) => patch(l.id, { box: e.target.checked ? accent : "" })} aria-label="خلفية ورا الكلام" />
                          {l.box && <input type="color" value={l.box} onChange={(e) => patch(l.id, { box: e.target.value })} aria-label="لون الخلفية" />}
                        </span>
                      </label>
                    </div>
                  </>
                )}
                {l.kind === "image" && (
                  <div className="field">
                    <span>الصورة (PNG شفافة بتطلع أحلى للوجو)</span>
                    <AssetPicker kind="image" compact value={l.src} onChange={(v) => patch(l.id, { src: v })} />
                  </div>
                )}
                {l.kind === "sticker" && (
                  <div className="field">
                    <span>الملصق</span>
                    <div className="sticker-grid">
                      {stickers.map((s) => (
                        <button key={s} type="button" className={`sticker ${l.text === s ? "on" : ""}`} onClick={() => patch(l.id, { text: s })} aria-label={`ملصق ${s}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={l.text} onChange={(e) => patch(l.id, { text: e.target.value })} aria-label="أو اكتب إيموجي" />
                  </div>
                )}

                <div className="field">
                  <span>المكان</span>
                  <div className="spot-grid" dir="ltr">
                    {spots.map(([x, y], k) => (
                      <button
                        key={k}
                        type="button"
                        className={`spot ${Math.abs(l.x - x) < 3 && Math.abs(l.y - y) < 3 ? "on" : ""}`}
                        onClick={() => patch(l.id, { x, y })}
                        aria-label={spotNames[k]}
                        title={spotNames[k]}
                      />
                    ))}
                  </div>
                </div>
                <div className="row-2">
                  <label className="field">
                    <span>يمين/شمال {Math.round(l.x)}٪</span>
                    <input type="range" dir="ltr" min={0} max={100} value={l.x} onChange={(e) => patch(l.id, { x: Number(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span>فوق/تحت {Math.round(l.y)}٪</span>
                    <input type="range" dir="ltr" min={0} max={100} value={l.y} onChange={(e) => patch(l.id, { y: Number(e.target.value) })} />
                  </label>
                </div>
                <div className="row-2">
                  <label className="field">
                    <span>الحجم</span>
                    <input type="range" dir="ltr" min={2} max={l.kind === "image" ? 100 : 40} step={0.5} value={l.size} onChange={(e) => patch(l.id, { size: Number(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span>اللفة {l.rotate}°</span>
                    <input type="range" dir="ltr" min={-45} max={45} value={l.rotate} onChange={(e) => patch(l.id, { rotate: Number(e.target.value) })} />
                  </label>
                </div>
                <div className="row-3">
                  <label className="field">
                    <span>يظهر من</span>
                    <select value={l.from} onChange={(e) => patch(l.id, { from: Number(e.target.value) })}>
                      {Array.from({ length: Math.max(1, Math.floor(sceneSeconds * 2)) }, (_, k) => k / 2).map((s) => (
                        <option key={s} value={s}>
                          {s} ث
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>لحد</span>
                    <select value={l.to} onChange={(e) => patch(l.id, { to: Number(e.target.value) })}>
                      <option value={0}>آخر المشهد</option>
                      {Array.from({ length: Math.max(0, Math.floor(sceneSeconds * 2)) }, (_, k) => (k + 1) / 2)
                        .filter((s) => s > l.from)
                        .map((s) => (
                          <option key={s} value={s}>
                            {s} ث
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>الحركة</span>
                    <select value={l.anim} onChange={(e) => patch(l.id, { anim: e.target.value })}>
                      {layerAnims.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ===== مقابض الطبقات فوق المعاينة: اسحب عشان تحرك =====
export const LayerHandles: React.FC<{ layers: Layer[]; selectedId: string | null; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void }> = ({
  layers,
  selectedId,
  onSelect,
  onMove,
}) => {
  const drag = (e: React.PointerEvent, l: Layer) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(l.id);
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = Math.min(100, Math.max(0, ((ev.clientX - box.left) / box.width) * 100));
      const y = Math.min(100, Math.max(0, ((ev.clientY - box.top) / box.height) * 100));
      onMove(l.id, Math.round(x * 2) / 2, Math.round(y * 2) / 2);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // بالكيبورد: الأسهم بتحرك الطبقة المختارة (Shift = خطوة أكبر)
  const keys = (e: React.KeyboardEvent, l: Layer) => {
    const step = e.shiftKey ? 5 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!d[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    onMove(l.id, Math.min(100, Math.max(0, l.x + d[e.key][0])), Math.min(100, Math.max(0, l.y + d[e.key][1])));
  };
  return (
    <div className="layer-handles">
      {layers.map((l) => (
        <button
          key={l.id}
          type="button"
          className={`layer-handle ${l.id === selectedId ? "on" : ""}`}
          style={{ left: `${l.x}%`, top: `${l.y}%` }}
          onPointerDown={(e) => drag(e, l)}
          onKeyDown={(e) => keys(e, l)}
          aria-label={`حرّك الطبقة: ${summary(l)}`}
          title={summary(l)}
        />
      ))}
    </div>
  );
};
