// مكتبة المزيكا والمؤثرات:
//   - تحليل أي ملف صوت: المدة، السرعة (BPM)، الطاقة، وتخمين النوع والمود/التصنيف (من الصوت واسم الملف)
//   - البحث في Freesound (أصوات CC0: مجانية لأي استخدام من غير ذكر المصدر) والاستيراد منه
import fs from "node:fs";
import path from "node:path";
import { envelope } from "./podcast.mjs";

export class SoundLibError extends Error {}

// ===== السرعة (BPM) من منحنى العلو =====
// بنحسب "البدايات" (لحظات العلو بيزيد فجأة) ونشوف بتتكرر كل قد إيه
export const estimateBpm = (env) => {
  const lin = env.map((db) => 10 ** (db / 20));
  const onset = new Float32Array(lin.length);
  for (let i = 1; i < lin.length; i++) onset[i] = Math.max(0, lin[i] - lin[i - 1]);
  const n = Math.min(onset.length, 3000); // أول 30 ثانية كفاية
  const ac = (lag) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += onset[i] * onset[i + lag];
    return s;
  };
  let best = 0;
  let bestLag = 0;
  // من 60 لـ 180 BPM (المنحنى 100 نقطة في الثانية)
  for (let lag = 33; lag <= 100; lag++) {
    // ميل خفيف للسرعات المعتادة (حوالي 100-120)
    const s = ac(lag) * (1 - Math.abs(6000 / lag - 110) / 400);
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  if (!bestLag) return 0;
  // الهاي هات السريع بيخلي السرعة تطلع الضعف: لو نص السرعة متكرر تقريبًا بنفس القوة، هي الصح
  if (6000 / bestLag > 135) {
    const half = [bestLag * 2 - 1, bestLag * 2, bestLag * 2 + 1].reduce((a, l) => (ac(l) > ac(a) ? l : a));
    if (ac(half) >= 0.6 * ac(bestLag)) bestLag = half;
  }
  return Math.round(6000 / bestLag);
};

const has = (name, words) => words.some((w) => name.includes(w));

// ===== التحليل =====
export const analyzeAudio = async (file, originalName = "") => {
  const env = await envelope(file);
  const duration = env.length / 100;
  const sorted = Float32Array.from(env).sort();
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? -60; // مستوى الأجزاء العالية
  const quiet = sorted[Math.floor(sorted.length * 0.2)] ?? -60;
  const energy = Math.round(Math.max(0, Math.min(100, (loud + 40) * 2.5))); // 0 هادي جدًا، 100 عالي جدًا
  const name = `${originalName} ${path.basename(file)}`.toLowerCase();
  const kind = duration < 7 || has(name, ["sfx", "whoosh", "swoosh", "hit", "impact", "click", "pop", "ding", "boom", "riser", "transition", "notification", "مؤثر"]) ? "sfx" : "music";

  if (kind === "sfx") {
    const category = has(name, ["whoosh", "swoosh", "riser", "transition", "swipe", "انتقال"])
      ? "انتقالات"
      : has(name, ["hit", "impact", "boom", "punch", "slam", "ضربة"])
        ? "ضربات"
        : has(name, ["click", "pop", "notification", "ding", "ui", "beep", "tick", "typing"])
          ? "واجهة"
          : has(name, ["ambience", "ambient", "rain", "wind", "city", "crowd", "nature", "جو"])
            ? "جو وطبيعة"
            : has(name, ["laugh", "applause", "cash", "boing", "funny", "cartoon"])
              ? "مرح"
              : duration > 4 && loud - quiet < 15
                ? "جو وطبيعة"
                : "متنوع";
    return { duration, kind, category, energy, bpm: 0 };
  }

  const bpm = estimateBpm(env);
  const mood = has(name, ["oud", "arab", "khaleeji", "maqam", "qanun", "darbuka", "عود", "عربي", "خليجي", "شرقي", "رمضان", "ramadan"])
    ? "عربي"
    : has(name, ["corporate", "business", "presentation", "شركات"])
      ? "شركات"
      : has(name, ["sad", "drama", "emotional", "piano", "dark", "حزين"])
        ? "درامي"
        : has(name, ["epic", "cinematic", "trailer", "orchestra", "سينما"])
          ? "سينمائي"
          : has(name, ["happy", "fun", "ukulele", "kids", "cheerful", "سعيد"])
            ? "سعيد"
            : has(name, ["lofi", "lo-fi", "chill", "calm", "relax", "ambient", "هادي"])
              ? "هادي"
              : has(name, ["tech", "electronic", "edm", "future", "تكنولوجي"])
                ? "تكنولوجيا"
                : (bpm >= 118 && energy >= 55) || energy >= 75
                  ? "حماسي"
                  : bpm && bpm < 95 && energy < 60
                    ? "هادي"
                    : "متنوع";
  return { duration, kind, mood, energy, bpm };
};

// ===== Freesound =====
const FS = "https://freesound.org/apiv2";
const fsKey = () => {
  const k = process.env.FREESOUND_API_KEY;
  if (!k) throw new SoundLibError("حط مفتاح Freesound (مجاني) من ⚙️ الإعدادات");
  return k;
};
const fsFetch = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new SoundLibError("مفتاح Freesound غلط");
  if (r.status === 429) throw new SoundLibError("Freesound: طلبات كتير، استنى شوية");
  if (!r.ok) throw new SoundLibError(`Freesound رجّع خطأ ${r.status}`);
  return r.json();
};

const FIELDS = "id,name,duration,previews,license,username,url,tags";
const isCc0 = (license) => /publicdomain\/zero|creative commons 0/i.test(String(license));

// بنجيب CC0 بس: مجاني لأي استخدام تجاري ومن غير ذكر المصدر
export const searchFreesound = async ({ query, kind, page = 1 }) => {
  const q = String(query ?? "").trim();
  if (!q) throw new SoundLibError("اكتب كلمة للبحث (بالإنجليزي بيجيب نتايج أكتر)");
  const duration = kind === "music" ? "duration:[20 TO 600]" : "duration:[0 TO 15]";
  const url = `${FS}/search/text/?query=${encodeURIComponent(q)}&filter=${encodeURIComponent(`license:"Creative Commons 0" ${duration}`)}&fields=${FIELDS}&page_size=20&page=${Math.max(1, Math.floor(page))}&token=${encodeURIComponent(fsKey())}`;
  const data = await fsFetch(url);
  return {
    count: data.count ?? 0,
    results: (data.results ?? [])
      .filter((s) => isCc0(s.license))
      .map((s) => ({ id: s.id, name: s.name, duration: Math.round(s.duration * 10) / 10, preview: s.previews?.["preview-hq-mp3"] ?? "", author: s.username, url: s.url, tags: (s.tags ?? []).slice(0, 6) })),
  };
};

// الاستيراد: بنسأل Freesound تاني عن الصوت ده (منثقش في لينك جاي من المتصفح)، وبننزّل النسخة الـ mp3
export const importFreesound = async ({ id, uploadsDir }) => {
  if (!Number.isInteger(Number(id))) throw new SoundLibError("رقم الصوت مش صحيح");
  const s = await fsFetch(`${FS}/sounds/${Number(id)}/?fields=${FIELDS}&token=${encodeURIComponent(fsKey())}`);
  if (!isCc0(s.license)) throw new SoundLibError("الصوت ده مش CC0، فمش هننزله");
  const preview = s.previews?.["preview-hq-mp3"];
  if (!preview || !/^https:\/\/([a-z0-9-]+\.)?freesound\.org\//.test(preview)) throw new SoundLibError("Freesound مرجعش ملف للصوت ده");
  const r = await fetch(preview, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new SoundLibError(`تحميل الصوت فشل (${r.status})`);
  const name = `fs-${s.id}.mp3`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await r.arrayBuffer()));
  return { path: `uploads/${name}`, name: s.name, author: s.username, url: s.url, tags: s.tags ?? [] };
};
