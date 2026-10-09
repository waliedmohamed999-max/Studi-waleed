// لقطات B-roll: لقطات بتتحط فوق الكلام عشان توضّح اللي بيتقال وتكسر الملل
// المصدر الأول Pexels (فيديوهات حقيقية مجانية، محتاج مفتاح مجاني)، ولو مش موجود بنولّد صورة واقعية بـ fal.ai
import fs from "node:fs";
import path from "node:path";

export class BrollError extends Error {}

const orientationOf = (format) => ({ reel: "portrait", portrait: "portrait", square: "square", youtube: "landscape" })[format] ?? "portrait";

// أنسب نسخة من الفيديو: MP4، وأصغر نسخة ضلعها الصغير 720 أو أكتر (جودة كويسة من غير تحميل تقيل)
export const pickFile = (files) => {
  const mp4 = (files ?? []).filter((f) => f.file_type === "video/mp4" && f.link && f.width && f.height);
  const good = mp4.filter((f) => Math.min(f.width, f.height) >= 720).sort((a, b) => a.width * a.height - b.width * b.height);
  return good[0] ?? mp4.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
};

export const createBroll = ({ publicDir, film }) => {
  const dir = path.join(publicDir, "uploads", "broll");
  const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // ===== Pexels =====
  const fromPexels = async ({ query, format, seconds, skip, onProgress }) => {
    onProgress?.("بيدوّر على لقطة في Pexels");
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientationOf(format)}&per_page=15&size=medium`;
    const r = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) throw new BrollError("مفتاح Pexels غلط. غيّره من ⚙️ الإعدادات");
    if (r.status === 429) throw new BrollError("Pexels: طلبات كتير، استنى شوية وجرب تاني");
    if (!r.ok) throw new BrollError(`Pexels رجّع خطأ ${r.status}`);
    const { videos = [] } = await r.json();
    // اللقطات اللي طولها يكفي الأول، وبعدين الباقي
    const ranked = [...videos.filter((v) => v.duration >= seconds), ...videos.filter((v) => v.duration < seconds)];
    if (!ranked.length) return null;
    const video = ranked[skip % ranked.length];
    const file = pickFile(video.video_files);
    if (!file) return null;
    onProgress?.("بيحمّل اللقطة");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `pexels-${video.id}-${stamp()}.mp4`);
    const v = await fetch(file.link, { signal: AbortSignal.timeout(120000) });
    if (!v.ok) throw new BrollError(`تحميل اللقطة فشل (${v.status})`);
    fs.writeFileSync(dest, Buffer.from(await v.arrayBuffer()));
    return {
      src: path.relative(publicDir, dest).split(path.sep).join("/"),
      kind: "video",
      credit: `${video.user?.name ?? "Pexels"} · Pexels`,
      sourceUrl: video.url ?? "",
    };
  };

  // source: auto (Pexels لو فيه مفتاح، وإلا صورة متولدة) | stock | ai
  const fetchBroll = async ({ query, description, format, seconds = 3, skip = 0, source = "auto", onProgress }) => {
    const q = String(query ?? "").trim();
    if (!q) throw new BrollError("اكتب وصف للقطة (بالإنجليزي)");
    const hasPexels = !!process.env.PEXELS_API_KEY;
    if (source === "stock" || (source === "auto" && hasPexels)) {
      if (!hasPexels) throw new BrollError("حط مفتاح Pexels (مجاني) من ⚙️ الإعدادات");
      const hit = await fromPexels({ query: q, format, seconds, skip, onProgress });
      if (hit) return hit;
      if (source === "stock") throw new BrollError(`مفيش لقطات في Pexels لـ "${q}". جرب وصف تاني`);
    }
    // صورة واقعية متولدة (بتتحرك بـ Ken Burns في الفيديو)
    const image = await film.still({ prompt: `${q}. ${description ?? ""}`.trim(), format, onProgress });
    return { src: image, kind: "image", credit: "", sourceUrl: "" };
  };

  return { fetchBroll };
};
