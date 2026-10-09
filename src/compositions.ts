// قايمة كل الفيديوهات في مكان واحد.
// الاستوديو العربي وأوامر Remotion الاتنين بيقروا من هنا،
// فأي فيديو جديد تضيفه هنا هيظهر في الاتنين.
import type { ComponentType } from "react";
import { Lesson1 } from "./Lesson1";
import { TextStory, calculateTextStory, type TextStoryProps } from "./TextStory";
import { Promo, calculatePromo, type PromoProps } from "./Promo";
import { formatOptions } from "./lib/formats";
import { fontOptions } from "./lib/fonts";
import { animationOptions } from "./lib/AnimatedText";
import { transitionOptions } from "./lib/transitions";
import type { Field } from "./lib/fieldTypes";
import { ProjectVideo, calculateProject, type ProjectProps } from "./ProjectVideo";
import { newScene } from "./scenes/defs";
import { CaptionedVideo, calculateCaptioned, type CaptionedProps } from "./CaptionedVideo";
import { FilmVideo, calculateFilm } from "./FilmVideo";
import { AutoEditVideo, calculateAutoEdit, type AutoEditProps } from "./AutoEditVideo";
import type { FilmProps } from "./film/types";
// كابشن التجربة: اتعمل بـ Whisper من public/demo/voice-demo.wav واتصلح فيه الإملا
import demoCaptions from "./demo/voice-demo-captions.json";

export type { Field } from "./lib/fieldTypes";

export type VideoMeta = { durationInFrames: number; fps: number; width: number; height: number };

// ===== هوية البراند =====
// البراند بيتحفظ مرة واحدة، وكل فيديو بيقول كل حاجة في البراند تروح لأنهي خانة عنده
export type BrandKey = "name" | "logo" | "font" | "primary" | "secondary" | "text" | "accent";
export type Brand = Partial<Record<BrandKey, string>>;
export const brandLabels: Record<BrandKey, string> = {
  name: "الاسم",
  logo: "اللوجو",
  font: "الخط",
  primary: "اللون الأساسي",
  secondary: "اللون التاني",
  text: "لون الكلام",
  accent: "اللون المميز",
};

export type VideoDef = VideoMeta & {
  id: string; // لازم يكون إنجليزي من غير مسافات
  name: string; // الاسم اللي بيظهر في الاستوديو
  component: ComponentType<any>;
  defaultProps: Record<string, unknown>;
  fields: Field[];
  // لو الفيديو طوله أو مقاسه بيتغير حسب الـ props
  calculate?: (props: any) => VideoMeta;
  // كل حاجة في البراند بتتحط في أنهي خانة
  brand?: Partial<Record<BrandKey, string>>;
};

// بيرجع الطول والمقاس الحقيقيين للفيديو بالـ props الحالية
export const getMeta = (v: VideoDef, props: Record<string, unknown>): VideoMeta =>
  v.calculate ? v.calculate(props) : v;

const textStoryDefaults: TextStoryProps = {
  format: "reel",
  font: "cairo",
  animation: "words",
  transition: "slide",
  secondsPerScene: 2,
  title: "إزاي تبدأ مشروعك؟ 🚀",
  lines: ["حدد فكرة بتحل مشكلة", "ابدأ صغير وجرّب بسرعة", "اسمع من عملائك", "طوّر كل يوم شوية"],
  outro: "احفظ الفيديو وابعته لصاحبك 👋",
  bgFrom: "#0f172a",
  bgTo: "#4c1d95",
  textColor: "#ffffff",
  accentColor: "#facc15",
};

const promoDefaults: PromoProps = {
  format: "reel",
  font: "changa",
  animation: "words",
  transition: "slide",
  secondsPerScene: 2.5,
  kenBurns: "on",
  brandName: "مطعم الفرن",
  logo: "demo/logo.svg",
  slides: [
    { image: "demo/burger.svg", text: "برجر مشوي على الفحم 🔥" },
    { image: "demo/pizza.svg", text: "بيتزا بالعجينة الإيطالي" },
    { image: "demo/drink.svg", text: "وعصاير فريش كل يوم" },
  ],
  cta: "اطلب دلوقتي",
  ctaSub: "📞 19999",
  music: "demo/music.wav",
  musicVolume: 60,
  sfx: "on",
  primary: "#1c1917",
  secondary: "#7c2d12",
  textColor: "#ffffff",
  accent: "#f59e0b",
};

const onOff = [
  { value: "on", label: "شغّال" },
  { value: "off", label: "مقفول" },
];

// مشروع تجريبي بيوري كل أنواع المشاهد
const projectDefaults: ProjectProps = {
  format: "reel",
  font: "cairo",
  animation: "words",
  transition: "slide",
  logo: "",
  music: "demo/music.wav",
  musicVolume: 50,
  voiceover: "",
  voiceVolume: 100,
  sfx: "on",
  primary: "#0f172a",
  secondary: "#3b0764",
  textColor: "#ffffff",
  accent: "#facc15",
  scenes: [
    newScene("title", { id: "s1", title: "استوديو منتاج 🎬", subtitle: "فيديوهات احترافية من غير كاميرا", duration: 3 }),
    newScene("bullets", { id: "s2", heading: "تقدر تعمل إيه؟", items: ["إعلانات للمحلات", "ريلز وتيك توك", "فيديوهات تعليمية"], duration: 3.5 }),
    newScene("stat", { id: "s3", value: 100, prefix: "+", suffix: "", label: "فيديو في اليوم", duration: 3 }),
    newScene("imageText", { id: "s4", image: "demo/burger.svg", text: "حط صورك ولوجوك 🔥", duration: 3 }),
    newScene("quote", { id: "s5", quote: "الفكرة الحلوة محتاجة فيديو حلو", author: "صاحبك", duration: 3.5 }),
    newScene("cta", { id: "s6", text: "ابدأ دلوقتي", sub: "استوديو منتاج", duration: 3 }),
  ],
};

const captionedDefaults: CaptionedProps = {
  format: "reel",
  fit: "cover",
  media: "demo/voice-demo.wav",
  mediaDuration: 13.57,
  mediaVolume: 100,
  bgImage: "",
  bgFrom: "#0f172a",
  bgTo: "#1e3a8a",
  title: "استوديو منتاج 🎙️",
  captions: demoCaptions,
  captionStyle: "tiktok",
  position: "bottom",
  wordsTogetherMs: 1200,
  captionSize: 100,
  font: "cairo",
  textColor: "#ffffff",
  highlight: "#facc15",
  music: "",
  musicVolume: 15,
};

const captionStyles = [
  { value: "tiktok", label: "تيك توك (الكلمة الحالية بتنور)" },
  { value: "karaoke", label: "كاريوكي (الكلام بيتلون وانت بتقوله)" },
  { value: "pop", label: "كلمة كلمة كبيرة بتنط" },
  { value: "subtitle", label: "ترجمة كلاسيكية" },
];

const filmDefaults: FilmProps = {
  brief: "",
  videoType: "إعلان تجاري",
  dialect: "najdi",
  targetSeconds: 30,
  uploads: [],
  title: "",
  style: "",
  characters: [],
  shots: [],
  voiceProvider: "windows",
  voiceId: "",
  voiceModel: "eleven_v4",
  recordedVoice: "",
  recordedCaptions: [],
  voiceVolume: 100,
  music: "demo/music.wav",
  musicVolume: 35,
  format: "reel",
  quality: "cinematic",
  font: "almarai",
  captions: "on",
  captionStyle: "subtitle",
  transition: "cut",
  grade: "warm",
  grain: "on",
  letterbox: "off",
  textColor: "#ffffff",
  accent: "#c8a24a",
  logo: "",
  cta: "",
  ctaSub: "",
  jobs: [],
  auto: false,
  autoBatch: "",
};

const autoEditDefaults: AutoEditProps = {
  media: "",
  mediaDuration: 0,
  mediaVolume: 100,
  words: [],
  speech: [],
  silenceMs: 600,
  padMs: 120,
  removeFillers: "on",
  cuts: [],
  emphasis: [],
  highlights: [],
  range: null,
  hookTitle: "",
  showHook: "on",
  zoomStyle: "jump",
  captions: "on",
  captionStyle: "tiktok",
  position: "bottom",
  captionSize: 100,
  font: "cairo",
  textColor: "#ffffff",
  highlight: "#facc15",
  format: "reel",
  progressBar: "on",
  music: "",
  musicVolume: 12,
};

export const videos: VideoDef[] = [
  {
    id: "AutoEdit",
    name: "✂️ مونتاج أوتوماتيك لفيديو بتتكلم فيه",
    component: AutoEditVideo,
    ...calculateAutoEdit(autoEditDefaults),
    calculate: calculateAutoEdit,
    defaultProps: autoEditDefaults,
    brand: { font: "font", text: "textColor", accent: "highlight" },
    fields: [
      { key: "autoedit", label: "المونتاج", type: "autoedit", group: "المونتاج" },
      { key: "hookTitle", label: "العنوان الشادد (أول 3 ثواني)", type: "text", group: "المونتاج" },
      { key: "silenceMs", label: "اقطع أي سكوت أطول من", type: "number", min: 200, max: 2000, step: 50, suffix: "مللي ثانية", group: "القص" },
      { key: "padMs", label: "هامش حوالين الكلام", type: "number", min: 0, max: 400, step: 20, suffix: "مللي ثانية", group: "القص" },
      { key: "removeFillers", label: "شيل الإمم والآآآ", type: "select", options: onOff, group: "القص" },
      {
        key: "zoomStyle",
        label: "الزووم",
        type: "select",
        options: [
          { value: "jump", label: "بيتبدل مع كل قطع (زي اليوتيوبرز)" },
          { value: "emphasis", label: "على الجمل المهمة بس" },
          { value: "none", label: "من غير زووم" },
        ],
        group: "الحركة",
      },
      { key: "showHook", label: "العنوان الشادد", type: "select", options: onOff, group: "الحركة" },
      { key: "progressBar", label: "شريط التقدم", type: "select", options: onOff, group: "الحركة" },
      { key: "captions", label: "الكابشن", type: "select", options: onOff, group: "الكابشن" },
      { key: "captionStyle", label: "شكل الكابشن", type: "select", options: captionStyles, group: "الكابشن" },
      {
        key: "position",
        label: "مكان الكابشن",
        type: "select",
        options: [
          { value: "bottom", label: "تحت" },
          { value: "center", label: "في النص" },
          { value: "top", label: "فوق" },
        ],
        group: "الكابشن",
      },
      { key: "captionSize", label: "حجم الكابشن", type: "number", min: 50, max: 200, step: 10, suffix: "٪", group: "الكابشن" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "الكابشن" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "الكابشن" },
      { key: "highlight", label: "اللون المميز", type: "color", group: "الكابشن" },
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل" },
      { key: "mediaVolume", label: "صوت الفيديو", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت" },
      { key: "music", label: "مزيكا خلفية", type: "audio", group: "الصوت" },
      { key: "musicVolume", label: "صوت المزيكا", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت" },
    ],
  },
  {
    id: "Film",
    name: "🎬 مخرج الأفلام: فيلم حقيقي بالذكاء الاصطناعي (المرحلة 7)",
    component: FilmVideo,
    ...calculateFilm(filmDefaults),
    calculate: calculateFilm,
    defaultProps: filmDefaults,
    brand: { logo: "logo", font: "font", text: "textColor", accent: "accent" },
    fields: [
      { key: "film", label: "الفيلم", type: "film", group: "الفيلم" },
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل السينمائي" },
      {
        key: "quality",
        label: "جودة الفيديو المتولد",
        type: "select",
        options: [
          { value: "cinematic", label: "سينمائي (Kling 3 Pro) · أعلى واقعية" },
          { value: "balanced", label: "متوازن (Kling O3 Standard) · أرخص" },
        ],
        group: "الشكل السينمائي",
      },
      {
        key: "grade",
        label: "التلوين",
        type: "select",
        options: [
          { value: "warm", label: "دافي (ذهبي)" },
          { value: "teal-orange", label: "سينما هوليوود (Teal & Orange)" },
          { value: "cool", label: "بارد وعصري" },
          { value: "mono", label: "أبيض وأسود" },
          { value: "none", label: "طبيعي" },
        ],
        group: "الشكل السينمائي",
      },
      { key: "grain", label: "حبيبات الفيلم", type: "select", options: onOff, group: "الشكل السينمائي" },
      { key: "letterbox", label: "شرايط السينما (Letterbox)", type: "select", options: onOff, group: "الشكل السينمائي" },
      {
        key: "transition",
        label: "الانتقال بين اللقطات",
        type: "select",
        options: [
          { value: "cut", label: "قطع مباشر (زي الأفلام)" },
          { value: "fade", label: "تلاشي ناعم" },
        ],
        group: "الشكل السينمائي",
      },
      { key: "captions", label: "كابشن التعليق", type: "select", options: onOff, group: "الكلام" },
      { key: "captionStyle", label: "شكل الكابشن", type: "select", options: captionStyles, group: "الكلام" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "الكلام" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "الكلام" },
      { key: "accent", label: "اللون المميز", type: "color", group: "الكلام" },
      { key: "voiceVolume", label: "صوت التعليق", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت والمزيكا" },
      { key: "music", label: "المزيكا", type: "audio", group: "الصوت والمزيكا" },
      { key: "musicVolume", label: "صوت المزيكا (بيوطى لوحده تحت الكلام)", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت والمزيكا" },
      { key: "logo", label: "اللوجو (كارت النهاية)", type: "image", group: "النهاية" },
      { key: "cta", label: "زرار النهاية", type: "text", group: "النهاية" },
      { key: "ctaSub", label: "تحت الزرار", type: "text", group: "النهاية" },
    ],
  },
  {
    id: "Captioned",
    name: "فيديو بكابشن + تعليق صوتي (المرحلة 4)",
    component: CaptionedVideo,
    ...calculateCaptioned(captionedDefaults),
    calculate: calculateCaptioned,
    defaultProps: captionedDefaults,
    brand: { font: "font", primary: "bgFrom", secondary: "bgTo", text: "textColor", accent: "highlight" },
    fields: [
      { key: "media", label: "الفيديو أو الصوت", type: "media", group: "المصدر" },
      { key: "mediaVolume", label: "صوت الفيديو / التعليق", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "المصدر" },
      { key: "captions", label: "الكابشن", type: "captions", group: "الكابشن" },
      { key: "captionStyle", label: "شكل الكابشن", type: "select", options: captionStyles, group: "شكل الكابشن" },
      {
        key: "position",
        label: "مكان الكابشن",
        type: "select",
        options: [
          { value: "bottom", label: "تحت" },
          { value: "center", label: "في النص" },
          { value: "top", label: "فوق" },
        ],
        group: "شكل الكابشن",
      },
      { key: "wordsTogetherMs", label: "الكلام اللي بيظهر مع بعض", type: "number", min: 200, max: 4000, step: 100, suffix: "مللي ثانية", group: "شكل الكابشن" },
      { key: "captionSize", label: "حجم الكابشن", type: "number", min: 50, max: 200, step: 10, suffix: "٪", group: "شكل الكابشن" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "شكل الكابشن" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "شكل الكابشن" },
      { key: "highlight", label: "لون الكلمة الحالية", type: "color", group: "شكل الكابشن" },
      { key: "title", label: "عنوان ثابت فوق (اختياري)", type: "text", group: "الشكل" },
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل" },
      {
        key: "fit",
        label: "الفيديو في الإطار",
        type: "select",
        options: [
          { value: "cover", label: "يملا الشاشة (ممكن يتقص)" },
          { value: "contain", label: "يبان كله (ممكن يبقى فيه حواف)" },
        ],
        group: "الشكل",
      },
      { key: "bgImage", label: "صورة خلفية (لو صوت بس)", type: "image", group: "الشكل" },
      { key: "bgFrom", label: "لون الخلفية الأول", type: "color", group: "الشكل" },
      { key: "bgTo", label: "لون الخلفية التاني", type: "color", group: "الشكل" },
      { key: "music", label: "مزيكا خلفية", type: "audio", group: "المزيكا" },
      { key: "musicVolume", label: "صوت المزيكا", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "المزيكا" },
    ],
  },
  {
    id: "Project",
    name: "مشروع حر (محرر المشاهد)",
    component: ProjectVideo,
    ...calculateProject(projectDefaults),
    calculate: calculateProject,
    defaultProps: projectDefaults,
    brand: { logo: "logo", font: "font", primary: "primary", secondary: "secondary", text: "textColor", accent: "accent" },
    fields: [
      { key: "scenes", label: "المشاهد", type: "scenes", group: "المشاهد" },
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "الشكل" },
      { key: "animation", label: "حركة الكلام (لكل المشاهد)", type: "select", options: animationOptions, group: "الشكل" },
      { key: "transition", label: "الانتقال بين المشاهد", type: "select", options: transitionOptions, group: "الشكل" },
      { key: "logo", label: "اللوجو (في الركن)", type: "image", group: "الشكل" },
      { key: "music", label: "المزيكا", type: "audio", group: "الصوت" },
      { key: "musicVolume", label: "صوت المزيكا", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت" },
      { key: "voiceover", label: "تعليق صوتي (ولّده من قالب الكابشن)", type: "audio", group: "الصوت" },
      { key: "voiceVolume", label: "صوت التعليق", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت" },
      { key: "sfx", label: "مؤثرات صوتية", type: "select", options: onOff, group: "الصوت" },
      { key: "primary", label: "اللون الأساسي", type: "color", group: "الألوان" },
      { key: "secondary", label: "اللون التاني", type: "color", group: "الألوان" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "الألوان" },
      { key: "accent", label: "اللون المميز", type: "color", group: "الألوان" },
    ],
  },
  {
    id: "Promo",
    name: "إعلان بالصور (المرحلة 2)",
    component: Promo,
    ...calculatePromo(promoDefaults),
    calculate: calculatePromo,
    defaultProps: promoDefaults,
    brand: { name: "brandName", logo: "logo", font: "font", primary: "primary", secondary: "secondary", text: "textColor", accent: "accent" },
    fields: [
      { key: "brandName", label: "اسم البراند", type: "text", group: "البراند" },
      { key: "logo", label: "اللوجو", type: "image", group: "البراند" },
      { key: "slides", label: "المشاهد", type: "slides", group: "المشاهد" },
      { key: "cta", label: "زرار النهاية", type: "text", group: "النهاية" },
      { key: "ctaSub", label: "تحت الزرار (تليفون / موقع)", type: "text", group: "النهاية" },
      { key: "music", label: "المزيكا", type: "audio", group: "الصوت" },
      { key: "musicVolume", label: "صوت المزيكا", type: "number", min: 0, max: 100, step: 5, suffix: "٪", group: "الصوت" },
      { key: "sfx", label: "مؤثرات صوتية", type: "select", options: onOff, group: "الصوت" },
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "الشكل" },
      { key: "animation", label: "حركة الكلام", type: "select", options: animationOptions, group: "الشكل" },
      { key: "transition", label: "الانتقال بين المشاهد", type: "select", options: transitionOptions, group: "الشكل" },
      { key: "secondsPerScene", label: "مدة كل مشهد", type: "number", min: 1, max: 8, step: 0.5, suffix: "ثانية", group: "الشكل" },
      { key: "kenBurns", label: "حركة الصور (Ken Burns)", type: "select", options: onOff, group: "الشكل" },
      { key: "primary", label: "اللون الأساسي", type: "color", group: "الألوان" },
      { key: "secondary", label: "اللون التاني", type: "color", group: "الألوان" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "الألوان" },
      { key: "accent", label: "اللون المميز", type: "color", group: "الألوان" },
    ],
  },
  {
    id: "TextStory",
    name: "قصة نصوص (المرحلة 1)",
    component: TextStory,
    ...calculateTextStory(textStoryDefaults),
    calculate: calculateTextStory,
    defaultProps: textStoryDefaults,
    brand: { font: "font", primary: "bgFrom", secondary: "bgTo", text: "textColor", accent: "accentColor" },
    fields: [
      { key: "format", label: "المقاس", type: "select", options: formatOptions, group: "الشكل" },
      { key: "font", label: "الخط", type: "select", options: fontOptions, group: "الشكل" },
      { key: "animation", label: "حركة الكلام", type: "select", options: animationOptions, group: "الشكل" },
      { key: "transition", label: "الانتقال بين المشاهد", type: "select", options: transitionOptions, group: "الشكل" },
      { key: "secondsPerScene", label: "مدة كل مشهد", type: "number", min: 1, max: 8, step: 0.5, suffix: "ثانية", group: "الشكل" },
      { key: "title", label: "العنوان", type: "text", group: "الكلام" },
      { key: "lines", label: "السطور (كل سطر = مشهد)", type: "lines", group: "الكلام" },
      { key: "outro", label: "جملة النهاية", type: "text", group: "الكلام" },
      { key: "bgFrom", label: "لون الخلفية الأول", type: "color", group: "الألوان" },
      { key: "bgTo", label: "لون الخلفية التاني", type: "color", group: "الألوان" },
      { key: "textColor", label: "لون الكلام", type: "color", group: "الألوان" },
      { key: "accentColor", label: "اللون المميز", type: "color", group: "الألوان" },
    ],
  },
  {
    id: "Lesson1",
    name: "الدرس الأول: أول فيديو",
    component: Lesson1,
    durationInFrames: 180,
    fps: 30,
    width: 1080,
    height: 1920,
    brand: { primary: "bgFrom", secondary: "bgTo", text: "textColor", accent: "accentColor" },
    defaultProps: {
      title: "أول فيديو ليا 🎬",
      lines: ["مفيش كاميرا", "مفيش مونتاج", "كله كود ✨"],
      outro: "تابعني 👋",
      bgFrom: "#1e1b6e",
      bgTo: "#b0189a",
      textColor: "#ffffff",
      accentColor: "#ffd54f",
    },
    fields: [
      { key: "title", label: "العنوان", type: "text" },
      { key: "lines", label: "السطور (كل سطر لوحده)", type: "lines" },
      { key: "outro", label: "جملة النهاية", type: "text" },
      { key: "bgFrom", label: "لون الخلفية الأول", type: "color" },
      { key: "bgTo", label: "لون الخلفية التاني", type: "color" },
      { key: "textColor", label: "لون الكلام", type: "color" },
      { key: "accentColor", label: "لون جملة النهاية", type: "color" },
    ],
  },
];
