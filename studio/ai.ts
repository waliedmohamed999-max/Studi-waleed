// أدوات الذكاء الاصطناعي في الاستوديو: بتكلم /api/ai/* وبتحوّل ردود Claude لمشاهد
import { useEffect, useState } from "react";
import { useKeysVersion } from "./settings";
import { newScene, sceneDefs, sceneTypes, type Scene, type SceneType } from "../src/scenes/defs";
import { fontOptions } from "../src/lib/fonts";
import { animationOptions } from "../src/lib/AnimatedText";
import { transitionOptions } from "../src/lib/transitions";

export type Dialect = "eg" | "msa" | "gulf" | "en";
export const dialects: { value: Dialect; label: string }[] = [
  { value: "eg", label: "مصري" },
  { value: "msa", label: "فصحى" },
  { value: "gulf", label: "خليجي" },
  { value: "en", label: "English" },
];

// Claude مش بيقدر يجيب صور، فمشهد "صورة + كلام" مش من ضمن اختياراته
const aiSceneTypes = sceneTypes.filter((t) => t !== "imageText" && t !== "video");

// الاختيارات المتاحة بتتبعت مع كل طلب، فلو ضفت خط أو حركة جديدة Claude هيشوفها لوحده
export const aiOptions = {
  sceneTypes: aiSceneTypes,
  fonts: fontOptions.map((o) => o.value),
  animations: animationOptions.map((o) => o.value),
  transitions: transitionOptions.map((o) => o.value),
};

export type AiPalette = { primary: string; secondary: string; textColor: string; accent: string };
export type AiVideo = { name: string; font: string; animation: string; transition: string; palette: AiPalette; scenes: Record<string, unknown>[] };
export type AiBrand = { suggestions: { name: string; why: string; font: string; palette: AiPalette }[] };
export type AiScript = { hook: string; body: string; cta: string };

export const callAi = async <T,>(route: "video" | "script" | "brand" | "scene", body: Record<string, unknown>): Promise<T> => {
  const r = await fetch(`/api/ai/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, options: aiOptions }),
  });
  const data = await r.json().catch(() => ({ error: "السيرفر مردش" }));
  if (!r.ok) throw new Error(data.error ?? "حصلت مشكلة");
  return data as T;
};

export const useAiStatus = () => {
  const [status, setStatus] = useState<{ available: boolean; mock: boolean } | null>(null);
  const keys = useKeysVersion();
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ available: false, mock: false }));
  }, [keys]);
  return status;
};

const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

// ===== رد Claude ← مشهد حقيقي =====
// بناخد بس الخانات اللي النوع ده بيستخدمها، ونظبط المدة لو طلعت برا الحدود
export const fromAiScene = (raw: Record<string, unknown>, keep: Partial<Scene> = {}): Scene => {
  const type = pick<SceneType>(raw.type, sceneTypes, "text");
  const fields: Record<string, unknown> = {};
  for (const f of sceneDefs[type].fields) {
    const v = raw[f.key];
    if (f.type === "lines") fields[f.key] = Array.isArray(v) ? v.map(String).filter((s) => s.trim()) : [];
    else if (f.type === "number") fields[f.key] = Number(v) || 0;
    else if (typeof v === "string") fields[f.key] = v;
  }
  const duration = Math.min(15, Math.max(1, Math.round((Number(raw.duration) || 3) * 2) / 2));
  const animation = pick(raw.animation, ["", ...aiOptions.animations], "");
  return newScene(type, { ...fields, duration, animation, ...keep });
};

// ===== مشهد حقيقي ← الشكل اللي Claude بيفهمه =====
export const toAiScene = (s: Scene) => ({
  type: s.type,
  duration: s.duration,
  animation: s.animation,
  title: "", subtitle: "", text: "", heading: "", items: [], value: 0, prefix: "", suffix: "", label: "", quote: "", author: "", sub: "",
  ...Object.fromEntries(sceneDefs[s.type].fields.map((f) => [f.key, s[f.key]])),
});

// سطر لكل مشهد عشان Claude يفهم سياق الفيديو كله
export const describeScenes = (scenes: Scene[]) =>
  scenes.map((s, i) => `${i + 1}. [${s.type}] ${sceneDefs[s.type].summary(s)}`).join("\n");

// ===== رد "فيديو من فكرة" ← props لقالب "مشروع حر" =====
export const aiVideoToProps = (v: AiVideo) => ({
  font: pick(v.font, aiOptions.fonts, "cairo"),
  animation: pick(v.animation, aiOptions.animations, "words"),
  transition: pick(v.transition, aiOptions.transitions, "slide"),
  primary: hex(v.palette?.primary, "#0f172a"),
  secondary: hex(v.palette?.secondary, "#3b0764"),
  textColor: hex(v.palette?.textColor, "#ffffff"),
  accent: hex(v.palette?.accent, "#facc15"),
  scenes: (v.scenes ?? []).map((s) => fromAiScene(s)),
});

export const paletteOk = (p: AiPalette) => ({
  primary: hex(p.primary, "#0f172a"),
  secondary: hex(p.secondary, "#1e293b"),
  textColor: hex(p.textColor, "#ffffff"),
  accent: hex(p.accent, "#facc15"),
});
