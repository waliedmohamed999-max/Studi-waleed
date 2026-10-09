// لوحة المشاهد: قايمة تسحب وترتب فيها، تضيف وتكرر وتمسح، وتعدّل المشهد المختار
import { useState } from "react";
import { commonSceneFields, newScene, sceneDefs, sceneTypes, uid, type Scene, type SceneType } from "../src/scenes/defs";
import { FieldInput } from "./fields";
import { callAi, describeScenes, dialects, fromAiScene, toAiScene, useAiStatus, type Dialect } from "./ai";

// ===== "حسّن المشهد ده" بالذكاء الاصطناعي =====
const SceneAi: React.FC<{ scene: Scene; scenes: Scene[]; onReplace: (s: Scene) => void }> = ({ scene, scenes, onReplace }) => {
  const status = useAiStatus();
  const [instruction, setInstruction] = useState("");
  const [dialect, setDialect] = useState<Dialect>("eg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status?.available) return null;

  const run = async (text = instruction) => {
    setBusy(true);
    setError(null);
    try {
      const raw = await callAi<Record<string, unknown>>("scene", {
        scene: toAiScene(scene),
        instruction: text,
        context: describeScenes(scenes),
        dialect,
      });
      onReplace(fromAiScene(raw, { id: scene.id, bgImage: scene.bgImage }));
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scene-ai">
      <span className="scene-ai-title">✨ عدّل بالكلام</span>
      <div className="scene-ai-row">
        <input
          type="text"
          value={instruction}
          placeholder="مثلًا: خليه أقصر وأقوى"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && instruction.trim() && !busy && run()}
        />
        <select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)} title="اللهجة">
          {dialects.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="brand-buttons">
        {["خليه أقصر", "خليه أقوى ويشد", "حوّله لقايمة نقاط"].map((q) => (
          <button key={q} type="button" className="btn-small" onClick={() => run(q)} disabled={busy}>
            {q}
          </button>
        ))}
        <button type="button" className="btn-small btn-ai" onClick={() => run()} disabled={busy || !instruction.trim()}>
          {busy ? "بيفكر…" : "نفّذ"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
};

export const moveItem = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const ScenesPanel: React.FC<{
  scenes: Scene[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (scenes: Scene[]) => void;
}> = ({ scenes, selectedId, onSelect, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const selectedIndex = scenes.findIndex((s) => s.id === selectedId);

  const update = (id: string, patch: Partial<Scene>) => onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = (type: SceneType) => {
    const scene = newScene(type);
    const at = selectedIndex >= 0 ? selectedIndex + 1 : scenes.length; // بعد المشهد المختار
    const next = [...scenes];
    next.splice(at, 0, scene);
    onChange(next);
    onSelect(scene.id);
    setAdding(false);
  };

  const duplicate = (i: number) => {
    const copy = { ...structuredClone(scenes[i]), id: uid() };
    const next = [...scenes];
    next.splice(i + 1, 0, copy);
    onChange(next);
    onSelect(copy.id);
  };

  const remove = (i: number) => {
    const next = scenes.filter((_, j) => j !== i);
    onChange(next);
    if (scenes[i].id === selectedId && next.length) onSelect(next[Math.min(i, next.length - 1)].id);
  };

  // تغيير نوع المشهد: بنحتفظ بالمدة والحركة والخلفية، والباقي بياخد القيم الافتراضية للنوع الجديد
  const changeType = (s: Scene, type: SceneType) => {
    const fresh = newScene(type, { id: s.id, duration: s.duration, animation: s.animation, bgImage: s.bgImage });
    onChange(scenes.map((x) => (x.id === s.id ? fresh : x)));
  };

  return (
    <div className="scenes">
      {scenes.length === 0 && <div className="hint">مفيش مشاهد. أضف أول مشهد من الزرار اللي تحت.</div>}

      {scenes.map((s, i) => {
        const def = sceneDefs[s.type];
        const selected = s.id === selectedId;
        return (
          <div
            key={s.id}
            className={`scene-item ${selected ? "selected" : ""} ${dragOver === i && dragFrom !== i ? "drag-over" : ""}`}
            style={{ "--scene-color": def.color } as React.CSSProperties}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) onChange(moveItem(scenes, dragFrom, i));
              setDragFrom(null);
              setDragOver(null);
            }}
          >
            <div
              className="scene-row"
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onClick={() => onSelect(s.id)}
            >
              <span className="drag-handle" title="اسحب عشان ترتب">
                ⋮⋮
              </span>
              <span className="scene-index">{i + 1}</span>
              <span className="scene-icon">{def.icon}</span>
              <span className="scene-summary">{def.summary(s) || def.label}</span>
              <span className="scene-dur">{s.duration}ث</span>
              <span className="scene-tools" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-small btn-ghost" title="كرّر المشهد" onClick={() => duplicate(i)}>
                  ⧉
                </button>
                <button type="button" className="btn-small btn-ghost" title="امسح المشهد" onClick={() => remove(i)}>
                  ✕
                </button>
              </span>
            </div>

            {selected && (
              <div className="scene-editor">
                <label className="field">
                  <span>نوع المشهد</span>
                  <select value={s.type} onChange={(e) => changeType(s, e.target.value as SceneType)}>
                    {sceneTypes.map((t) => (
                      <option key={t} value={t}>
                        {sceneDefs[t].icon} {sceneDefs[t].label}
                      </option>
                    ))}
                  </select>
                </label>
                {[...def.fields, ...commonSceneFields(s.type)].map((f) => (
                  <FieldInput key={f.key} field={f} value={s[f.key] ?? ""} onChange={(v) => update(s.id, { [f.key]: v })} />
                ))}
                <SceneAi scene={s} scenes={scenes} onReplace={(next) => onChange(scenes.map((x) => (x.id === s.id ? next : x)))} />
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="add-grid">
          {sceneTypes.map((t) => (
            <button key={t} type="button" className="add-type" style={{ "--scene-color": sceneDefs[t].color } as React.CSSProperties} onClick={() => add(t)}>
              <span>{sceneDefs[t].icon}</span>
              {sceneDefs[t].label}
            </button>
          ))}
          <button type="button" className="add-type add-cancel" onClick={() => setAdding(false)}>
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" className="btn-add" onClick={() => setAdding(true)}>
          + أضف مشهد
        </button>
      )}
    </div>
  );
};
