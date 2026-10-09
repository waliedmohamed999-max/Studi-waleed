// كارت المشروع: الاسم، حالة الحفظ، مشروع جديد، ومشاريعي
import { useEffect, useState } from "react";
import { videos } from "../src/compositions";
import { listProjects, type Project, type ProjectSummary, type SaveState } from "./useProject";

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
  onNew: (videoId: string, name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ project, save, onRename, onNew, onOpen, onDelete }) => {
  const [panel, setPanel] = useState<"none" | "new" | "list">("none");
  const [newName, setNewName] = useState("");
  const [newVideo, setNewVideo] = useState(videos[0].id);
  const [list, setList] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    if (panel === "list") listProjects().then(setList);
  }, [panel, project.id]);

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
      </div>

      {panel === "new" && (
        <div className="subpanel">
          <label className="field">
            <span>اسم المشروع</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلًا: إعلان الكافيه" />
          </label>
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
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onNew(newVideo, newName);
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
