// إدارة المشروع الحالي: الحفظ التلقائي على السيرفر، التراجع والإعادة، مشروع جديد، فتح وحذف
import { useCallback, useEffect, useRef, useState } from "react";
import { videos } from "../src/compositions";

export type Project = { id: string; name: string; videoId: string; props: Record<string, unknown> };
export type ProjectSummary = { id: string; name: string; videoId: string; updatedAt: number };
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type Props = Record<string, unknown>;

const LAST_KEY = "studio:lastProject";
const HISTORY_LIMIT = 100;
const COALESCE_MS = 600; // التعديلات اللي ورا بعض في أقل من كده بتتحسب خطوة تراجع واحدة

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const videoOf = (id: string) => videos.find((v) => v.id === id) ?? videos[0];

const blankProject = (videoId: string, name: string): Project => ({
  id: newId(),
  name,
  videoId: videoOf(videoId).id,
  props: structuredClone(videoOf(videoId).defaultProps),
});

const store = {
  get: () => {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  },
  set: (id: string) => {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {}
  },
};

export const listProjects = (): Promise<ProjectSummary[]> => fetch("/api/projects").then((r) => (r.ok ? r.json() : []));

export const useProject = () => {
  const [project, setProject] = useState<Project>(() => blankProject(videos[0].id, "مشروع جديد"));
  const projectRef = useRef(project);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");

  const past = useRef<Props[]>([]);
  const future = useRef<Props[]>([]);
  const lastPush = useRef(0);

  const commit = (next: Project) => {
    projectRef.current = next;
    setProject(next);
  };

  const resetHistory = () => {
    past.current = [];
    future.current = [];
    lastPush.current = 0;
  };

  // ===== فتح آخر مشروع كنت شغال عليه =====
  useEffect(() => {
    const id = store.get();
    if (!id) return;
    fetch(`/api/projects/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Project | null) => {
        if (!p) return;
        const v = videoOf(p.videoId);
        commit({ ...p, videoId: v.id, props: { ...structuredClone(v.defaultProps), ...p.props } });
      })
      .catch(() => {});
  }, []);

  // ===== الحفظ التلقائي: بعد ما توقف تعديل بثانية تقريبًا =====
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setSave("saving");
      const p = projectRef.current;
      try {
        const r = await fetch(`/api/projects/${p.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, videoId: p.videoId, props: p.props }),
        });
        if (!r.ok) throw new Error();
        store.set(p.id);
        setSave("saved");
        setDirty(false);
      } catch {
        setSave("error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [project, dirty]);

  // ===== تعديل الـ props (بيتسجل في التراجع) =====
  const updateProps = useCallback((patch: Props | ((prev: Props) => Props)) => {
    const cur = projectRef.current;
    const nextProps = typeof patch === "function" ? patch(cur.props) : { ...cur.props, ...patch };
    const now = Date.now();
    if (now - lastPush.current > COALESCE_MS) {
      past.current.push(cur.props);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    lastPush.current = now;
    future.current = [];
    commit({ ...cur, props: nextProps });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    const cur = projectRef.current;
    future.current.push(cur.props);
    lastPush.current = 0;
    commit({ ...cur, props: prev });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    const cur = projectRef.current;
    past.current.push(cur.props);
    lastPush.current = 0;
    commit({ ...cur, props: next });
    setDirty(true);
  }, []);

  const rename = (name: string) => {
    commit({ ...projectRef.current, name });
    setDirty(true);
  };

  // props اختياري: لو جاي من الذكاء الاصطناعي بيتحط فوق القيم الافتراضية للقالب
  const newProject = (videoId: string, name: string, props?: Props) => {
    const p = blankProject(videoId, name.trim() || "مشروع جديد");
    if (props) p.props = { ...p.props, ...props };
    commit(p);
    resetHistory();
    setDirty(true); // بيتحفظ على طول عشان يظهر في "مشاريعي"
  };

  const openProject = async (id: string) => {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) return;
    const p: Project = await r.json();
    const v = videoOf(p.videoId);
    commit({ ...p, videoId: v.id, props: { ...structuredClone(v.defaultProps), ...p.props } });
    resetHistory();
    store.set(p.id);
    setDirty(false);
    setSave("idle");
  };

  const deleteProject = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (id === projectRef.current.id) {
      commit(blankProject(videos[0].id, "مشروع جديد"));
      resetHistory();
      setDirty(false);
      setSave("idle");
    }
  };

  return {
    project,
    video: videoOf(project.videoId),
    updateProps,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    rename,
    newProject,
    openProject,
    deleteProject,
    save: dirty && save !== "saving" ? ("dirty" as SaveState) : save,
  };
};
