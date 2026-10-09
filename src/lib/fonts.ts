// الخطوط العربية من Google Fonts
// كل خط بيتحمل مرة واحدة بس أول ما يتطلب، وبعد كده بيتاخد من الذاكرة
import { loadFont as cairo } from "@remotion/google-fonts/Cairo";
import { loadFont as tajawal } from "@remotion/google-fonts/Tajawal";
import { loadFont as almarai } from "@remotion/google-fonts/Almarai";
import { loadFont as readex } from "@remotion/google-fonts/ReadexPro";
import { loadFont as plex } from "@remotion/google-fonts/IBMPlexSansArabic";
import { loadFont as changa } from "@remotion/google-fonts/Changa";
import { loadFont as kufam } from "@remotion/google-fonts/Kufam";
import { loadFont as marhey } from "@remotion/google-fonts/Marhey";
import { loadFont as messiri } from "@remotion/google-fonts/ElMessiri";
import { loadFont as lalezar } from "@remotion/google-fonts/Lalezar";
import { loadFont as amiri } from "@remotion/google-fonts/Amiri";

type FontDef = {
  label: string;
  // أتقل وزن متاح في الخط (بنستخدمه للعناوين)
  heavy: number;
  load: () => { fontFamily: string };
};

const subsets: ("arabic" | "latin")[] = ["arabic", "latin"];

export const fonts = {
  cairo: { label: "Cairo · عصري وواضح", heavy: 800, load: () => cairo("normal", { weights: ["400", "700", "800"], subsets }) },
  tajawal: { label: "Tajawal · ناعم وخفيف", heavy: 800, load: () => tajawal("normal", { weights: ["400", "700", "800"], subsets }) },
  almarai: { label: "Almarai · رسمي ونضيف", heavy: 800, load: () => almarai("normal", { weights: ["400", "700", "800"], subsets }) },
  readex: { label: "Readex Pro · تقني", heavy: 700, load: () => readex("normal", { weights: ["400", "700"], subsets }) },
  plex: { label: "IBM Plex · احترافي", heavy: 700, load: () => plex("normal", { weights: ["400", "700"], subsets }) },
  changa: { label: "Changa · رياضي وقوي", heavy: 800, load: () => changa("normal", { weights: ["400", "700", "800"], subsets }) },
  kufam: { label: "Kufam · كوفي حديث", heavy: 800, load: () => kufam("normal", { weights: ["400", "700", "800"], subsets }) },
  marhey: { label: "Marhey · مرح وكرتوني", heavy: 700, load: () => marhey("normal", { weights: ["400", "700"], subsets }) },
  messiri: { label: "El Messiri · أنيق", heavy: 700, load: () => messiri("normal", { weights: ["400", "700"], subsets }) },
  lalezar: { label: "Lalezar · عريض للإعلانات", heavy: 400, load: () => lalezar("normal", { weights: ["400"], subsets }) },
  amiri: { label: "Amiri · كلاسيكي (نسخ)", heavy: 700, load: () => amiri("normal", { weights: ["400", "700"], subsets }) },
} satisfies Record<string, FontDef>;

export type FontKey = keyof typeof fonts;

export const fontOptions = Object.entries(fonts).map(([value, f]) => ({ value, label: f.label }));

const loaded = new Map<string, string>();

// بيرجع اسم الخط تحطه في fontFamily، ووزن العناوين المناسب ليه
export const getFont = (key: string) => {
  const def: FontDef = fonts[key as FontKey] ?? fonts.cairo;
  if (!loaded.has(key)) loaded.set(key, def.load().fontFamily);
  return { family: `${loaded.get(key)}, 'Segoe UI', Tahoma, sans-serif`, heavy: def.heavy };
};
