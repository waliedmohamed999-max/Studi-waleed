// أدوات مجانية من غير أي مفاتيح: ترجمة، صور بالذكاء الاصطناعي (Pollinations)، وسيناريو من كلامك
// بتستخدم في "مخرج الأفلام" لما مفيش مفتاح fal.ai أو Claude
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ffmpegPath } from "./whisper.mjs";
import { tryRemove } from "./fsutil.mjs";

export class FreeError extends Error {}

// ===== ترجمة (موديل الصور مبيفهمش عربي: من غير ترجمة بيرسم شخص تاني خالص) =====
// كل النصوص في طلب واحد (الخدمات المجانية بتقفل لو بعتنا كتير ورا بعض)، Google الأول وبعدين MyMemory
export const hasArabic = (t) => /[\u0600-\u06FF]/.test(String(t ?? ""));
const SEP = "\n|||\n";

const google = async (text) => {
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const j = await r.json();
  return (j?.[0] ?? []).map((x) => x?.[0] ?? "").join("");
};
const myMemory = async (text) => {
  const r = await fetch(`https://api.mymemory.translated.net/get?langpair=ar|en&q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.responseStatus !== 200) throw new Error(`mymemory ${r.status}`);
  return String(j.responseData?.translatedText ?? "");
};

export const translateMany = async (texts) => {
  const todo = texts.map((t, i) => ({ t: String(t ?? "").trim(), i })).filter((x) => hasArabic(x.t));
  const out = texts.map((t) => String(t ?? "").trim());
  if (!todo.length) return out;
  const joined = todo.map((x) => x.t.replace(/\n+/g, " ")).join(SEP);
  for (const service of [google, myMemory]) {
    try {
      const parts = (await service(joined.slice(0, 4500))).split(/\s*\|\|\|\s*/).map((x) => x.trim());
      if (parts.length === todo.length && parts.every((x) => x && !hasArabic(x))) {
        todo.forEach((x, k) => (out[x.i] = parts[k]));
        return out;
      }
      // الخدمة لخبطت الفواصل: كل نص لوحده بنفس الخدمة
      for (const x of todo) out[x.i] = (await service(x.t)).trim() || x.t;
      if (todo.every((x) => !hasArabic(out[x.i]))) return out;
    } catch {
      // الخدمة دي واقعة أو قافلة علينا: نجرب اللي بعدها
    }
  }
  throw new FreeError("الترجمة المجانية مش متاحة دلوقتي (ولازمة عشان الصور تطلع صح). جرب كمان دقيقة، أو اكتب وصف الشخص والمكان بالإنجليزي");
};
export const translate = async (text) => (await translateMany([text]))[0];

// ===== صورة من Pollinations =====
// نفس الـ seed + نفس الوصف = نفس الشخص تقريبًا في كل اللقطات
export const seedOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000000;

const SIZES = { reel: [768, 1365], portrait: [864, 1080], square: [1024, 1024], youtube: [1365, 768], ref: [768, 1024] };

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new FreeError(`معالجة الصورة فشلت: ${err.slice(-200)}`))));
  });

// الخدمة المجانية من غير حساب بتقبل صورة واحدة كل شوية، فالطلبات بتمشي ورا بعض في طابور واحد
// وأي رفض (402/429) بنستنى ونحاول تاني لوحدنا (صورة كل ~45 ثانية). بمفتاح مجاني من enter.pollinations.ai بتبقى فورية
let line = Promise.resolve();
const queued = (fn) => {
  const next = line.then(fn, fn);
  line = next.catch(() => {});
  return next;
};
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const freeImage = (args) => queued(() => freeImageNow(args));

// بمفتاح: الخدمة الجديدة (gen.pollinations.ai) فورية ومن غير علامة مائية
// المفتاح لازم يكون مسموح له بموديلات الصور (من enter.pollinations.ai). لو مش شغال بنكمل ببلاش من غير مفتاح
const genUrl = (prompt, w, h, seed) => `https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 1800))}?width=${w}&height=${h}&seed=${seed}&model=flux&nologo=true`;
export const pollinationsKeyProblem = (status, body = "") => {
  if (status === 401) return "مفتاح Pollinations غلط";
  if (/does not allow image models|not allowed for this API key/i.test(body)) return "مفتاح Pollinations مش مسموح له بالصور: افتح enter.pollinations.ai ← المفتاح ← Edit وفعّل موديلات الصور (Image)";
  if (status === 402 || /pollen|balance|insufficient/i.test(body)) return "رصيد Pollinations خلص (Pollen). استنى التجديد أو كمّل من غير مفتاح";
  if (status === 403) return "مفتاح Pollinations مش مسموح له بالطلب ده (راجع صلاحياته من enter.pollinations.ai)";
  return null;
};
let keyBroken = null; // لو المفتاح اترفض مرة، بنكمل من غير مفتاح لحد ما يتغير

const freeImageNow = async ({ prompt, size = "reel", seed = 1, dest, onProgress }) => {
  const [w, h] = SIZES[size] ?? SIZES.reel;
  const tmp = path.join(os.tmpdir(), `montag-free-${Date.now()}-${seed}.jpg`);
  const token = process.env.POLLINATIONS_TOKEN;
  if (token && keyBroken !== token) {
    onProgress?.("بيرسم الصورة (Pollinations)");
    try {
      const r = await fetch(genUrl(prompt, w, h, seed), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
      const type = r.headers.get("content-type") ?? "";
      if (r.ok && type.startsWith("image/")) {
        fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
        await run(["-y", "-v", "error", "-i", tmp, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, "-q:v", "2", dest]);
        return dest;
      }
      const problem = pollinationsKeyProblem(r.status, await r.text().catch(() => ""));
      if (problem) {
        keyBroken = token;
        console.warn(`Pollinations: ${problem}. بنكمل من غير مفتاح`);
      }
    } catch {
      // شبكة: نجرب الطريق المجاني
    } finally {
      tryRemove(tmp);
    }
  }
  // بنطلب الصورة أطول 8٪ عشان نقص شريط العلامة المائية اللي تحت من غير ما النسبة تبوظ
  const H = Math.round(h * 1.08);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1800))}?width=${w}&height=${H}&seed=${seed}&model=flux&nologo=true&enhance=false`;
  // الخدمة القديمة بترفض أي طلب فيه مفتاح، فالطريق المجاني من غير مفتاح خالص
  const headers = {};
  let last = null;
  const started = Date.now();
  for (let attempt = 1; attempt <= 30; attempt++) {
    const waited = Math.round((Date.now() - started) / 1000);
    onProgress?.(attempt === 1 ? "بيرسم الصورة (ببلاش)" : `مستني دوره في الخدمة المجانية… ${waited} ثانية`);
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
      const type = r.headers.get("content-type") ?? "";
      if (r.status === 402 || r.status === 429) {
        // زحمة/حد الاستخدام المجاني: مش غلط، بنستنى بس
        last = new FreeError(
          token && keyBroken === token
            ? "الخدمة المجانية زحمة، ومفتاح Pollinations مش شغال للصور. فعّل موديلات الصور للمفتاح من enter.pollinations.ai"
            : "الخدمة المجانية زحمة دلوقتي. حط مفتاح Pollinations المجاني من ⚙️ الإعدادات عشان متستناش",
        );
        await r.arrayBuffer().catch(() => {});
        await sleep(8000);
        continue;
      }
      if (!r.ok || !type.startsWith("image/")) throw new FreeError(`خدمة الصور المجانية مردتش (${r.status})`);
      fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      // بنشيل آخر 7.5٪ من تحت (العلامة المائية) ونرجّع المقاس المطلوب
      await run(["-y", "-v", "error", "-i", tmp, "-vf", `crop=iw:ih*0.925:0:0,scale=${w}:${h}`, "-q:v", "2", dest]);
      return dest;
    } catch (e) {
      last = e;
      // غلطة شبكة أو صورة بايظة: 3 محاولات بس
      if (attempt >= 3 && !(e instanceof FreeError && /زحمة/.test(e.message))) break;
      await sleep(4000);
    } finally {
      tryRemove(tmp);
    }
  }
  throw last instanceof FreeError ? last : new FreeError("خدمة الصور المجانية مش متاحة دلوقتي. جرب كمان شوية");
};

// ===== سيناريو مجاني: من وصف الشخص والمكان وكلامك (كل سطر = لقطة) =====
// زي المصورين: أول لقطة واسعة بتعرّف المكان، وبعدين متوسطة وقريبة وتفاصيل بالتبادل
const SHOT_TYPES = [
  { kind: "wide establishing shot", motion: "slow push-in" },
  { kind: "medium shot, waist-up", motion: "gentle handheld drift" },
  { kind: "close-up portrait, expressive face, shallow depth of field", motion: "slow push-in" },
  { kind: "detail shot of hands and objects, macro", motion: "slow slide" },
  { kind: "over-the-shoulder shot", motion: "gentle drift" },
  { kind: "medium wide shot, natural candid moment", motion: "slow pull-out" },
];
const STYLE = "photorealistic, cinematic film still, natural soft lighting, 35mm lens, shallow depth of field, rich but natural colors, high detail";
const NO_TEXT = "no text, no letters, no captions, no logos, no watermark";

export const freePlan = async ({ person, place, script, title = "" }) => {
  const lines = String(script ?? "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!lines.length) throw new FreeError("اكتب الكلام اللي هيتقال، كل سطر لقطة");
  const [who, where, ...meanings] = await translateMany([person || "a person", place || "a modern bright place", ...lines]);
  const hasPerson = !!String(person ?? "").trim();
  const character = hasPerson ? { id: "c1", name: "الشخص", description: `${who}. Same exact face, hair, outfit and accessories in every shot.` } : null;
  const shots = lines.map((line, i) => {
    const t = SHOT_TYPES[i === 0 ? 0 : 1 + ((i - 1) % (SHOT_TYPES.length - 1))];
    const words = line.split(/\s+/).length;
    const subject = character ? `${who}` : "the scene";
    return {
      duration: Math.max(3, Math.min(15, Math.ceil(words / 2.4) + 1)),
      purpose: `${t.kind.split(",")[0]} · ${line.slice(0, 60)}`,
      imagePrompt: `${t.kind} of ${subject} in ${where}. The moment conveys: ${meanings[i]}. ${NO_TEXT}`,
      motionPrompt: t.motion,
      characters: character ? ["c1"] : [],
      refUploads: [],
      sourceUpload: -1,
      voiceLine: line,
      onScreenText: "",
      sfxPrompt: "",
      speaker: "",
    };
  });
  return { title: title || lines[0].slice(0, 40), style: STYLE, cta: "", ctaSub: "", characters: character ? [character] : [], musicPrompt: "", shots };
};
