// مواصفات المنصات ومناطق الأمان (الأماكن اللي واجهة التطبيق بتغطيها)
// الأرقام تقريبية (نسبة من عرض/طول الشاشة الطولية) ومأخوذة من شكل التطبيقات المعروف، والمنصات بتغيرها كل فترة
export type PlatformId = "tiktok" | "reels" | "shorts" | "snapchat" | "youtube" | "x";

export type Platform = {
  id: PlatformId;
  name: string;
  aspect: "9:16" | "16:9" | "1:1";
  maxSeconds: number;
  bestSeconds: [number, number]; // أنسب طول للإعلانات والمحتوى القصير
  uploadUrl: string;
  // مناطق الواجهة (للفيديو الطولي)، نسب من 0 لـ 1
  safe?: { top: number; bottom: number; side: number; otherSide: number };
  hashtags: number; // عدد الهاشتاجات المناسب
};

export const platforms: Platform[] = [
  { id: "tiktok", name: "تيك توك", aspect: "9:16", maxSeconds: 600, bestSeconds: [15, 45], uploadUrl: "https://www.tiktok.com/tiktokstudio/upload", safe: { top: 0.08, bottom: 0.22, side: 0.14, otherSide: 0.05 }, hashtags: 5 },
  { id: "reels", name: "إنستجرام ريلز", aspect: "9:16", maxSeconds: 180, bestSeconds: [15, 60], uploadUrl: "https://www.instagram.com/", safe: { top: 0.11, bottom: 0.21, side: 0.12, otherSide: 0.05 }, hashtags: 5 },
  { id: "shorts", name: "يوتيوب شورتس", aspect: "9:16", maxSeconds: 180, bestSeconds: [20, 60], uploadUrl: "https://studio.youtube.com/", safe: { top: 0.1, bottom: 0.19, side: 0.13, otherSide: 0.05 }, hashtags: 3 },
  { id: "snapchat", name: "سناب شات (Spotlight)", aspect: "9:16", maxSeconds: 60, bestSeconds: [10, 30], uploadUrl: "https://my.snapchat.com/", safe: { top: 0.09, bottom: 0.18, side: 0.06, otherSide: 0.06 }, hashtags: 3 },
  { id: "youtube", name: "يوتيوب (عادي)", aspect: "16:9", maxSeconds: 43200, bestSeconds: [60, 900], uploadUrl: "https://studio.youtube.com/", hashtags: 3 },
  { id: "x", name: "إكس (تويتر)", aspect: "16:9", maxSeconds: 140, bestSeconds: [15, 45], uploadUrl: "https://x.com/compose/post", hashtags: 2 },
];

export const aspectOf = (w: number, h: number): Platform["aspect"] | "4:5" | "other" => {
  const r = w / h;
  if (Math.abs(r - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(r - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(r - 1) < 0.02) return "1:1";
  if (Math.abs(r - 4 / 5) < 0.02) return "4:5";
  return "other";
};
