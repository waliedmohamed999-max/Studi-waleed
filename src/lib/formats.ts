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
