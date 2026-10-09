// توليد المزيكا والمؤثرات الصوتية بـ ElevenLabs
// المزيكا: POST /v1/music           (من 3 ثواني لـ 10 دقايق، تقدر تطلبها من غير غُنا)
// المؤثرات: POST /v1/sound-generation (لحد 30 ثانية، وممكن تبقى loop)
// بيستهلكوا من رصيد ElevenLabs (نفس مفتاح التعليق الصوتي)
import fs from "node:fs";
import path from "node:path";
import { MODELS } from "./models.mjs";

const isMock = () => process.env.AI_MOCK === "1";
export class SoundError extends Error {}

const call = async (url, body) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new SoundError("حط ELEVENLABS_API_KEY في ملف .env عشان توليد المزيكا والمؤثرات");
  const r = await fetch(url, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 401) throw new SoundError("مفتاح ElevenLabs غلط");
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    const err = new SoundError(`ElevenLabs: ${r.status} ${text}`);
    err.status = r.status;
    throw err;
  }
  return Buffer.from(await r.arrayBuffer());
};

export const generateSound = async ({ kind, prompt, seconds, loop, uploadsDir, publicDir }) => {
  const name = `${kind}-${Date.now().toString(36)}.mp3`;
  const dest = path.join(uploadsDir, name);

  if (isMock()) {
    // وضع التجربة: نسخة من ملفات الديمو بدل ما نصرف رصيد
    const demo = path.join(publicDir, "demo", kind === "music" ? "music.wav" : "whoosh.wav");
    const wavName = name.replace(/\.mp3$/, ".wav");
    fs.copyFileSync(demo, path.join(uploadsDir, wavName));
    return { path: `uploads/${wavName}` };
  }

  const text = String(prompt ?? "").trim();
  if (!text) throw new SoundError("اكتب وصف للصوت الأول");

  if (kind === "music") {
    const body = {
      prompt: text,
      music_length_ms: Math.round(Math.min(600, Math.max(3, Number(seconds) || 30)) * 1000),
      force_instrumental: true, // مزيكا خلفية من غير غُنا عشان متتخانقش مع التعليق
      model_id: MODELS.sound.musicModel,
    };
    let audio;
    try {
      audio = await call("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", body);
    } catch (e) {
      // لو الموديل الأحدث مش متاح في باقتك، نجرب الموديل الأساسي
      if (e instanceof SoundError && [400, 403, 422].includes(e.status)) {
        const { model_id, ...rest } = body;
        audio = await call("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", rest);
      } else throw e;
    }
    fs.writeFileSync(dest, audio);
  } else {
    const audio = await call("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
      text,
      duration_seconds: Math.min(30, Math.max(0.5, Number(seconds) || 3)),
      prompt_influence: 0.5,
      loop: !!loop,
      model_id: "eleven_text_to_sound_v2",
    });
    fs.writeFileSync(dest, audio);
  }
  return { path: `uploads/${name}` };
};
