// مقاسات الفيديو الجاهزة
export const formats = {
  reel: { label: "ريلز / تيك توك (9:16)", width: 1080, height: 1920 },
  portrait: { label: "بوست طولي (4:5)", width: 1080, height: 1350 },
  square: { label: "مربع (1:1)", width: 1080, height: 1080 },
  youtube: { label: "يوتيوب (16:9)", width: 1920, height: 1080 },
} as const;

export type FormatKey = keyof typeof formats;

export const formatOptions = Object.entries(formats).map(([value, f]) => ({ value, label: f.label }));

export const getFormat = (key: string) => formats[key as FormatKey] ?? formats.reel;

// المقاس اللي يناسب الفيديو المتصوّر: عرضي ← يوتيوب، مربع تقريبًا ← مربع، طولي ← ريلز
export const formatForSize = (width: number, height: number): FormatKey => {
  if (!width || !height) return "reel";
  const r = width / height;
  return r > 1.2 ? "youtube" : r > 0.9 ? "square" : r > 0.7 ? "portrait" : "reel";
};
