// كارت المشروع: الاسم، حالة الحفظ، مشروع جديد، ومشاريعي
import { useEffect, useState } from "react";
import { videos } from "../src/compositions";
import { listProjects, type Project, type ProjectSummary, type SaveState } from "./useProject";

type Template = { id: string; name: string; videoId: string; props: Record<string, unknown>; createdAt: number };

const saveText: Record<SaveState, string> = {
  idle: "",
  dirty: "فيه تعديلات…",
  saving: "بيتحفظ…",
  saved: "✓ متحفظ",
  error: "⚠ الحفظ فشل (السيرفر شغال؟)",
};

export const ProjectCard: React.FC<{
  project: Project;
  save: SaveState;
  onRename: (name: string) => void;
  onNew: (videoId: string, name: string, props?: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ project, save, onRename, onNew, onOpen, onDelete }) => {
  const [panel, setPanel] = useState<"none" | "new" | "list">("none");
  const [newName, setNewName] = useState("");
  const [newVideo, setNewVideo] = useState(videos[0].id);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fromTemplate, setFromTemplate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (panel === "list") listProjects().then(setList);
    if (panel === "new")
      fetch("/api/templates")
        .then((r) => r.json())
        .then(setTemplates)
        .catch(() => {});
  }, [panel, project.id]);

  // ===== احفظ المشروع الحالي كقالب =====
  const saveTemplate = async () => {
    const name = prompt("اسم القالب:", project.name);
    if (!name?.trim()) return;
    const r = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), videoId: project.videoId, props: project.props }),
    });
    setMsg(r.ok ? `اتحفظ قالب "${name.trim()}" ✓ هتلاقيه في "مشروع جديد"` : "حفظ القالب فشل");
    setTimeout(() => setMsg(null), 3500);
  };
  const deleteTemplate = async (t: Template) => {
    if (!confirm(`تمسح قالب "${t.name}"؟`)) return;
    await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    setTemplates((l) => l.filter((x) => x.id !== t.id));
    setFromTemplate("");
  };
  const chosen = templates.find((t) => t.id === fromTemplate);

  const templateName = videos.find((v) => v.id === project.videoId)?.name ?? "";

  return (
    <section className="card">
      <div className="card-head">
        <h2>المشروع</h2>
        <span className={`save-state save-${save}`}>{saveText[save]}</span>
      </div>
      <input className="project-name" type="text" value={project.name} onChange={(e) => onRename(e.target.value)} placeholder="اسم المشروع" />
      <div className="hint">القالب: {templateName}</div>

      <div className="brand-buttons">
        <button type="button" className="btn-small" onClick={() => setPanel(panel === "new" ? "none" : "new")}>
          ＋ مشروع جديد
        </button>
        <button type="button" className="btn-small" onClick={() => setPanel(panel === "list" ? "none" : "list")}>
          📂 مشاريعي
        </button>
        <button type="button" className="btn-small" onClick={saveTemplate} title="احفظ شكل المشروع ده عشان تبدأ منه بعدين">
          ⭐ احفظ كقالب
        </button>
      </div>
      {msg && <div className="flash">{msg}</div>}

      {panel === "new" && (
        <div className="subpanel">
          <label className="field">
            <span>اسم المشروع</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلًا: إعلان الكافيه" />
          </label>
          {templates.length > 0 && (
            <label className="field">
              <span>⭐ من قوالبي</span>
              <select value={fromTemplate} onChange={(e) => setFromTemplate(e.target.value)}>
                <option value="">من غير (قالب فاضي)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {chosen && (
            <button type="button" className="link-btn danger" onClick={() => deleteTemplate(chosen)}>
              امسح القالب ده
            </button>
          )}
          {!chosen && (
            <label className="field">
              <span>القالب</span>
              <select value={newVideo} onChange={(e) => setNewVideo(e.target.value)}>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (chosen) onNew(chosen.videoId, newName || chosen.name, structuredClone(chosen.props));
              else onNew(newVideo, newName);
              setFromTemplate("");
              setNewName("");
              setPanel("none");
            }}
          >
            ابدأ المشروع
          </button>
        </div>
      )}

      {panel === "list" && (
        <div className="subpanel project-list">
          {list.length === 0 && <div className="hint">مفيش مشاريع محفوظة لسه.</div>}
          {list.map((p) => (
            <div key={p.id} className={`project-row ${p.id === project.id ? "selected" : ""}`}>
              <button
                type="button"
                className="project-open"
                onClick={() => {
                  onOpen(p.id);
                  setPanel("none");
                }}
              >
                <b>{p.name}</b>
                <small>
                  {videos.find((v) => v.id === p.videoId)?.name ?? p.videoId} · {new Date(p.updatedAt).toLocaleString("ar-EG")}
                </small>
              </button>
              <button
                type="button"
                className="btn-small btn-ghost"
                title="امسح المشروع"
                onClick={async () => {
                  if (!confirm(`تمسح مشروع "${p.name}"؟ مش هتقدر ترجعه.`)) return;
                  await onDelete(p.id);
                  setList((l) => l.filter((x) => x.id !== p.id));
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
