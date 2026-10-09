// خط إنتاج "مخرج الأفلام" (المرحلة 7)
// صور الشخصيات ← الصورة الأولى لكل لقطة ← التعليق الصوتي ← الفيديو المتولد
// المفاتيح في .env: FAL_KEY (الصور والفيديو) و ELEVENLABS_API_KEY (الصوت)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { fal, ApiError, ValidationError } from "@fal-ai/client";
import { MODELS } from "./models.mjs";
import { ffmpegPath, transcribeFile, whisperStatus } from "./whisper.mjs";

const isMock = () => process.env.AI_MOCK === "1";
export class FilmError extends Error {}

export const filmStatus = () => ({
  fal: isMock() || !!process.env.FAL_KEY,
  elevenlabs: !!process.env.ELEVENLABS_API_KEY,
  mock: isMock(),
});

let falReady = false;
const falClient = () => {
  if (!process.env.FAL_KEY) throw new FilmError("حط FAL_KEY في ملف .env جنب server.mjs، وبعدين أعد تشغيل الاستوديو");
  if (!falReady) {
    fal.config({ credentials: process.env.FAL_KEY });
    falReady = true;
  }
  return fal;
};

export const createFilm = ({ publicDir }) => {
  const dirFor = (projectId) => {
    if (!/^[a-z0-9]{4,32}$/.test(projectId)) throw new FilmError("رقم المشروع مش صحيح");
    const dir = path.join(publicDir, "uploads", "film", projectId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const rel = (abs) => path.relative(publicDir, abs).split(path.sep).join("/");
  const abs = (p) => {
    const full = path.resolve(publicDir, String(p ?? "").replace(/^\/+/, ""));
    if (!full.startsWith(publicDir + path.sep) || !fs.existsSync(full)) return null;
    return full;
  };
  const stamp = () => Date.now().toString(36);

  // ===== أدوات =====
  const run = (bin, args) =>
    new Promise((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(-400)))));
      p.on("error", reject);
    });

  const duration = async (file) => {
    const out = await run(path.join(path.dirname(ffmpegPath()), "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).catch(() => "0");
    return Number(String(out).trim()) || 0;
  };

  const download = async (url, dest) => {
    const r = await fetch(url);
    if (!r.ok) throw new FilmError(`تحميل الملف فشل (${r.status})`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return dest;
  };

  // الصور المحلية لازم تترفع على fal الأول عشان الموديلات تقدر تشوفها
  const uploadCache = new Map();
  const toFalUrl = async (p) => {
    const file = abs(p);
    if (!file) throw new FilmError(`الملف مش موجود: ${p}`);
    if (/\.svg$/i.test(file)) throw new FilmError("صور SVG مش بتنفع مع موديلات الذكاء الاصطناعي، ارفع PNG أو JPG");
    const key = `${file}:${fs.statSync(file).mtimeMs}`;
    if (!uploadCache.has(key)) {
      const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
      const blob = new Blob([fs.readFileSync(file)], { type: `image/${ext}` });
      try {
        uploadCache.set(key, await falClient().storage.upload(blob));
      } catch (e) {
        throw falError(e);
      }
    }
    return uploadCache.get(key);
  };

  // أخطاء fal.ai ← رسايل عربي واضحة (للتوليد ولرفع الصور الاتنين)
  const falError = (e) => {
    if (e instanceof ValidationError) return new FilmError(`fal.ai رفض المدخلات: ${JSON.stringify(e.body?.detail ?? e.message).slice(0, 300)}`);
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) return new FilmError("مفتاح fal.ai غلط أو مش مسموح له (راجع FAL_KEY)");
      if (e.status === 402) return new FilmError("رصيد fal.ai خلص، اشحن من fal.ai/dashboard");
      return new FilmError(`fal.ai رجّع خطأ ${e.status}: ${String(e.message).slice(0, 200)}`);
    }
    return e;
  };

  const callFal = async (endpoint, input, onProgress) => {
    try {
      const result = await falClient().subscribe(endpoint, {
        input,
        logs: false,
        onQueueUpdate: (u) => onProgress?.(u.status === "IN_QUEUE" ? "في الطابور" : u.status === "IN_PROGRESS" ? "بيتولّد" : ""),
      });
      return result.data;
    } catch (e) {
      throw falError(e);
    }
  };

  const aspectOf = (format) => ({ reel: "9:16", portrait: "4:5", square: "1:1", youtube: "16:9" })[format] ?? "9:16";

  // ===== وضع التجربة: صورة ملونة بسيطة (PNG) من غير أي خدمة =====
  const mockPng = (dest, w, h, seed) => {
    const hue = (seed * 47) % 360;
    const [r1, g1, b1] = hsl(hue, 0.5, 0.25);
    const [r2, g2, b2] = hsl((hue + 40) % 360, 0.6, 0.55);
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      for (let x = 0; x < w; x++) {
        const t = (x / w + y / h) / 2;
        const o = y * (w * 3 + 1) + 1 + x * 3;
        raw[o] = r1 + (r2 - r1) * t;
        raw[o + 1] = g1 + (g2 - g1) * t;
        raw[o + 2] = b1 + (b2 - b1) * t;
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    fs.writeFileSync(dest, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
    return dest;
  };
  const mockSize = (format) => ({ reel: [540, 960], portrait: [540, 675], square: [720, 720], youtube: [960, 540] })[format] ?? [540, 960];

  // ===== 1) صورة مرجعية لشخصية =====
  const character = async ({ projectId, character, style, onProgress }) => {
    const dir = dirFor(projectId);
    const dest = path.join(dir, `char-${character.id}-${stamp()}.jpg`);
    if (isMock()) return { image: rel(mockPng(dest.replace(/\.jpg$/, ".png"), 540, 720, character.id.length + 3)) };
    const data = await callFal(
      MODELS.image.text,
      {
        prompt: `Photorealistic character reference portrait for a film. ${character.description}. Waist-up, facing the camera, neutral expression, plain soft grey studio background, soft even key light, 85mm lens, ultra-detailed skin texture, natural look. ${style}`,
        aspect_ratio: "3:4",
        resolution: MODELS.image.resolution,
        output_format: "jpeg",
        num_images: 1,
      },
      onProgress,
    );
    await download(data.images[0].url, dest);
    return { image: rel(dest) };
  };

  // ===== 2) الصورة الأولى للقطة =====
  const keyframe = async ({ projectId, shot, characters, uploads, style, format, onProgress }) => {
    const dir = dirFor(projectId);
    // لو المستخدم اختار صورة مرفوعة تتحرك زي ما هي، مش محتاجين نولّد
    if (shot.sourceUpload >= 0 && uploads[shot.sourceUpload]) return { keyframe: uploads[shot.sourceUpload].path };

    const dest = path.join(dir, `shot-${shot.id}-key-${stamp()}.jpg`);
    if (isMock()) {
      const [w, h] = mockSize(format);
      return { keyframe: rel(mockPng(dest.replace(/\.jpg$/, ".png"), w, h, shot.id.charCodeAt(0) + shot.id.length)) };
    }

    const refChars = characters.filter((c) => shot.characters.includes(c.id) && c.image);
    const refUps = shot.refUploads.map((i) => uploads[i]).filter((u) => u && !/\.svg$/i.test(u.path));
    const refs = [...refChars.map((c) => c.image), ...refUps.map((u) => u.path)];
    const who = [
      ...refChars.map((c, i) => `Reference image ${i + 1} is ${c.name}: keep the exact same face, hair, build and wardrobe.`),
      ...refUps.map((u, i) => `Reference image ${refChars.length + i + 1} is ${u.note || "the client's item"}: reproduce it faithfully (shape, colors, labels).`),
    ].join(" ");
    const prompt = `Photorealistic cinematic film still, first frame of a shot. ${shot.imagePrompt}. ${who} ${style} No text, no captions, no watermarks.`;
    const input = { prompt, aspect_ratio: aspectOf(format), resolution: MODELS.image.resolution, output_format: "jpeg", num_images: 1 };
    const data = refs.length
      ? await callFal(MODELS.image.edit, { ...input, image_urls: await Promise.all(refs.map(toFalUrl)) }, onProgress)
      : await callFal(MODELS.image.text, input, onProgress);
    await download(data.images[0].url, dest);
    return { keyframe: rel(dest) };
  };

  // ===== 3) التعليق الصوتي + توقيت كل كلمة =====
  // الكلمات من النص الأصلي، والتوقيت من ElevenLabs (أو Whisper، أو بالتساوي كآخر حل)
  const spreadWords = (text, seconds) => {
    const words = text.split(/\s+/).filter(Boolean);
    const total = words.reduce((s, w) => s + w.length + 1, 0) || 1;
    let t = 0;
    return words.map((w) => {
      const d = ((w.length + 1) / total) * seconds * 1000;
      const c = { text: ` ${w}`, startMs: Math.round(t), endMs: Math.round(t + d), timestampMs: null, confidence: null };
      t += d;
      return c;
    });
  };

  const wordsFromAlignment = (a) => {
    const out = [];
    let cur = null;
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        if (cur) out.push(cur);
        cur = null;
        return;
      }
      const s = a.character_start_times_seconds[i] * 1000;
      const e = a.character_end_times_seconds[i] * 1000;
      if (!cur) cur = { text: ` ${ch}`, startMs: Math.round(s), endMs: Math.round(e), timestampMs: null, confidence: null };
      else {
        cur.text += ch;
        cur.endMs = Math.round(e);
      }
    });
    if (cur) out.push(cur);
    return out;
  };

  const timeWords = async (file, text, seconds) => {
    const st = whisperStatus();
    if (st.installed && st.modelReady) {
      try {
        const heard = await transcribeFile(file, { language: "ar" });
        const original = text.split(/\s+/).filter(Boolean);
        // لو عدد الكلمات زي بعض، بناخد التوقيت من Whisper والإملا من النص الأصلي
        if (heard.length === original.length) return heard.map((w, i) => ({ ...w, text: ` ${original[i]}` }));
        // لو مختلف (Whisper دمج أو قسم كلمة)، بنوزع كلمات النص الأصلي على الفترة اللي اتكلم فيها
        if (heard.length) {
          const from = heard[0].startMs;
          const span = (heard.at(-1).endMs - from) / 1000;
          return spreadWords(text, span).map((w) => ({ ...w, startMs: w.startMs + from, endMs: w.endMs + from }));
        }
      } catch {}
    }
    return spreadWords(text, seconds);
  };

  const voice = async ({ projectId, shot, prevText, nextText, provider, voiceId, model, onProgress }) => {
    const text = shot.voiceLine.trim();
    if (!text) return { voice: "", voiceDuration: 0, words: [] };
    const dir = dirFor(projectId);

    if (provider === "elevenlabs" && !isMock()) {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new FilmError("حط ELEVENLABS_API_KEY في ملف .env جنب server.mjs");
      if (!voiceId) throw new FilmError("اختار صوت من ElevenLabs الأول");
      onProgress?.("بيسجّل الصوت");
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model || MODELS.voice.defaultModel,
          // الجملة اللي قبلها واللي بعدها بيخلوا النبرة متصلة بين اللقطات
          previous_text: prevText || undefined,
          next_text: nextText || undefined,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1 },
        }),
      });
      if (r.status === 401) throw new FilmError("مفتاح ElevenLabs غلط");
      if (!r.ok) throw new FilmError(`ElevenLabs: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      const dest = path.join(dir, `shot-${shot.id}-voice-${stamp()}.mp3`);
      fs.writeFileSync(dest, Buffer.from(data.audio_base64, "base64"));
      const secs = await duration(dest);
      const words = data.alignment?.characters?.length ? wordsFromAlignment(data.alignment) : await timeWords(dest, text, secs);
      return { voice: rel(dest), voiceDuration: secs, words };
    }

    // صوت الويندوز (مجاني، وبيستخدم في وضع التجربة كمان)
    onProgress?.("بيسجّل الصوت (ويندوز)");
    const txt = path.join(dir, `tmp-${stamp()}.txt`);
    const dest = path.join(dir, `shot-${shot.id}-voice-${stamp()}.wav`);
    fs.writeFileSync(txt, text, "utf8");
    try {
      await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(path.dirname(publicDir), "scripts", "tts.ps1"), "-TextFile", txt, "-Out", dest]);
    } finally {
      fs.rmSync(txt, { force: true, maxRetries: 5, retryDelay: 200 });
    }
    const secs = await duration(dest);
    return { voice: rel(dest), voiceDuration: secs, words: await timeWords(dest, text, secs) };
  };

  // ===== 4) الفيديو المتولد من الصورة الأولى =====
  const clip = async ({ projectId, shot, quality, style, onProgress }) => {
    if (!shot.keyframe) throw new FilmError("ولّد صورة اللقطة الأول");
    const dir = dirFor(projectId);
    const secs = Math.min(MODELS.clipSeconds.max, Math.max(MODELS.clipSeconds.min, Math.round(shot.duration)));
    const dest = path.join(dir, `shot-${shot.id}-clip-${stamp()}.mp4`);

    if (isMock()) {
      // فيديو ثابت من الصورة بـ FFmpeg (عشان نجرب الخط كله من غير فلوس)
      const key = abs(shot.keyframe);
      if (!key || /\.svg$/i.test(key)) throw new FilmError("وضع التجربة محتاج صورة PNG أو JPG");
      await run(ffmpegPath(), ["-y", "-loop", "1", "-i", key, "-t", String(secs), "-r", "30", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", dest]);
      return { clip: rel(dest), clipDuration: secs };
    }

    const tier = MODELS.video[quality] ?? MODELS.video.cinematic;
    const data = await callFal(
      tier.endpoint,
      {
        [tier.imageField]: await toFalUrl(shot.keyframe),
        prompt: `${shot.motionPrompt}. Cinematic, realistic motion, stable anatomy and faces, natural lighting. ${style}`.slice(0, 2400),
        duration: String(secs),
        // الصوت بنعمله احنا (تعليق + مزيكا)، فمش محتاجين صوت من الموديل
        generate_audio: false,
        ...(tier.negativePrompt ? { negative_prompt: "blur, distortion, warped faces, extra fingers, text, watermark, low quality, flicker" } : {}),
      },
      onProgress,
    );
    await download(data.video.url, dest);
    return { clip: rel(dest), clipDuration: secs };
  };

  // ===== الأصوات المتاحة =====
  const voices = async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return [];
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      labels: Object.values(v.labels ?? {}).join(" · "),
      preview: v.preview_url ?? "",
    }));
  };

  // صور مرفوعة ← JPEG صغير base64 عشان Claude يشوفها وهو بيكتب السيناريو
  const imageForClaude = async (p) => {
    const file = abs(p);
    if (!file || /\.svg$/i.test(file)) return null;
    // الملف المؤقت في فولدر Temp بتاع الويندوز (مش جنب الصورة الأصلية)
    const tmp = path.join(os.tmpdir(), `montag-claude-${stamp()}.jpg`);
    try {
      await run(ffmpegPath(), ["-y", "-i", file, "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", "-frames:v", "1", tmp]);
      return fs.readFileSync(tmp).toString("base64");
    } catch {
      return null;
    } finally {
      fs.rmSync(tmp, { force: true, maxRetries: 5, retryDelay: 200 });
    }
  };

  return { character, keyframe, voice, clip, voices, imageForClaude };
};

// HSL ← RGB (لصور وضع التجربة)
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
