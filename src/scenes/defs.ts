// تعريف أنواع المشاهد: الاسم، الأيقونة، اللون في التايملاين، القيم الافتراضية، وخانات التعديل
// الفيديو والاستوديو الاتنين بيقروا من هنا
import type { Field } from "../lib/fieldTypes";
import { animationOptions } from "../lib/AnimatedText";

export type SceneType = "title" | "text" | "imageText" | "bullets" | "stat" | "quote" | "cta";

export type Scene = {
  id: string;
  type: SceneType;
  duration: number; // بالثواني
  animation: string; // "" = زي إعدادات المشروع
  bgImage: string; // صورة خلفية اختيارية
  [key: string]: unknown; // باقي الخانات حسب نوع المشهد
};

type SceneDef = {
  label: string;
  icon: string;
  color: string; // لونه في التايملاين
  defaults: Record<string, unknown>;
  fields: Field[];
  summary: (s: Scene) => string; // سطر مختصر يظهر في القايمة والتايملاين
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const sceneDefs: Record<SceneType, SceneDef> = {
  title: {
    label: "عنوان",
    icon: "🅰️",
    color: "#7c5cff",
    defaults: { title: "عنوان جديد", subtitle: "سطر صغير تحت العنوان" },
    fields: [
      { key: "title", label: "العنوان", type: "text" },
      { key: "subtitle", label: "تحت العنوان", type: "text" },
    ],
    summary: (s) => str(s.title),
  },
  text: {
    label: "نص",
    icon: "💬",
    color: "#0ea5e9",
    defaults: { text: "اكتب الكلام هنا" },
    fields: [{ key: "text", label: "الكلام", type: "text" }],
    summary: (s) => str(s.text),
  },
  imageText: {
    label: "صورة + كلام",
    icon: "🖼️",
    color: "#10b981",
    defaults: { image: "", text: "كلام على الصورة" },
    fields: [
      { key: "image", label: "الصورة", type: "image" },
      { key: "text", label: "الكلام", type: "text" },
    ],
    summary: (s) => str(s.text),
  },
  bullets: {
    label: "قايمة نقاط",
    icon: "📋",
    color: "#f59e0b",
    defaults: { heading: "أهم النقط", items: ["النقطة الأولى", "النقطة التانية", "النقطة التالتة"] },
    fields: [
      { key: "heading", label: "العنوان", type: "text" },
      { key: "items", label: "النقط (كل سطر نقطة)", type: "lines" },
    ],
    summary: (s) => str(s.heading),
  },
  stat: {
    label: "رقم بيعد",
    icon: "🔢",
    color: "#ef4444",
    defaults: { value: 1000, prefix: "+", suffix: "", label: "عميل سعيد" },
    fields: [
      { key: "value", label: "الرقم", type: "number", min: 0, max: 100000000, step: 1, box: true },
      { key: "prefix", label: "قبل الرقم (زي + أو $)", type: "text" },
      { key: "suffix", label: "بعد الرقم (زي ٪ أو K)", type: "text" },
      { key: "label", label: "الكلام تحت الرقم", type: "text" },
    ],
    summary: (s) => `${str(s.prefix)}${Number(s.value).toLocaleString("en-US")}${str(s.suffix)} ${str(s.label)}`,
  },
  quote: {
    label: "اقتباس",
    icon: "❝",
    color: "#ec4899",
    defaults: { quote: "اكتب الاقتباس هنا", author: "اسم القائل" },
    fields: [
      { key: "quote", label: "الاقتباس", type: "text" },
      { key: "author", label: "القائل", type: "text" },
    ],
    summary: (s) => str(s.quote),
  },
  cta: {
    label: "زرار نهاية",
    icon: "👆",
    color: "#14b8a6",
    defaults: { text: "اطلب دلوقتي", sub: "📞 01000000000" },
    fields: [
      { key: "text", label: "كلام الزرار", type: "text" },
      { key: "sub", label: "تحت الزرار (تليفون / موقع)", type: "text" },
    ],
    summary: (s) => str(s.text),
  },
};

export const sceneTypes = Object.keys(sceneDefs) as SceneType[];

// الخانات المشتركة بين كل المشاهد
export const commonSceneFields = (type: SceneType): Field[] => [
  { key: "duration", label: "مدة المشهد", type: "number", min: 1, max: 15, step: 0.5, suffix: "ثانية" },
  { key: "animation", label: "حركة الكلام", type: "select", options: [{ value: "", label: "زي إعدادات المشروع" }, ...animationOptions] },
  // مشهد "صورة + كلام" ليه صورته الخاصة، فمش محتاج خلفية
  ...(type === "imageText" ? [] : [{ key: "bgImage", label: "صورة خلفية (اختياري)", type: "image" } as Field]),
];

export const uid = () => Math.random().toString(36).slice(2, 9);

export const newScene = (type: SceneType, overrides: Partial<Scene> = {}): Scene => ({
  id: uid(),
  type,
  duration: 3,
  animation: "",
  bgImage: "",
  ...structuredClone(sceneDefs[type].defaults),
  ...overrides,
});
