// معالجة الفيديو: دمج كذا كليب في فيديو واحد، والترجمة والدبلجة (ElevenLabs Dubbing)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectSpeech, ffmpegPath, transcribeFile, whisperStatus } from "./whisper.mjs";
import { tryRemove } from "./fsutil.mjs";

export class MediaError extends Error {}
const isMock = () => process.env.AI_MOCK === "1";
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const run = (bin, args, onStderr) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 20000) err = err.slice(-10000);
      onStderr?.(String(d));
    });
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new MediaError(err.slice(-400)))));
    p.on("error", reject);
  });

const ffprobe = () => path.join(path.dirname(ffmpegPath()), "ffprobe.exe");

// المقاس والمدة وفيه صوت ولا لأ
export const probe = async (file) => {
  const out = await run(ffprobe(), ["-v", "error", "-show_entries", "stream=codec_type,width,height:stream_side_data=rotation:format=duration", "-of", "json", file]);
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s) => s.codec_type === "video");
  const rotation = Math.abs(Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
  // الموبايل بيسجل الفيديو الطولي "عرضي + لفة 90"، فبنبدل الطول والعرض
  const [w, h] = rotation === 90 || rotation === 270 ? [v?.height, v?.width] : [v?.width, v?.height];
  return { width: Number(w) || 0, height: Number(h) || 0, duration: Number(j.format?.duration) || 0, hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio") };
};

// ===== دمج كليبات في فيديو واحد =====
// كل الكليبات بتتظبط على مقاس أول كليب (بتتقص من الأطراف لو نسبتها مختلفة)، والكليب اللي ملوش صوت بياخد سكوت
export const joinClips = async ({ files, dest, onProgress }) => {
  if (files.length < 2) throw new MediaError("محتاج كليبين على الأقل");
  onProgress?.("بيقرا الكليبات");
  const info = await Promise.all(files.map(probe));
  if (info.some((i) => !i.width)) throw new MediaError("فيه ملف مش فيديو أو بايظ");
  // مقاس أول كليب، بحد أقصى 1920 للضلع الكبير، وأرقام زوجية (مطلوب للـ H.264)
  const k = Math.min(1, 1920 / Math.max(info[0].width, info[0].height));
  const W = Math.round((info[0].width * k) / 2) * 2;
  const H = Math.round((info[0].height * k) / 2) * 2;
  const total = info.reduce((s, i) => s + i.duration, 0);

  const parts = [];
  const pairs = [];
  info.forEach((inf, i) => {
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p[v${i}]`);
    parts.push(
      inf.hasAudio
        ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${inf.duration.toFixed(3)},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    );
    pairs.push(`[v${i}][a${i}]`);
  });
  parts.push(`${pairs.join("")}concat=n=${files.length}:v=1:a=1[v][a]`);

  const args = ["-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", dest];
  await run(ffmpegPath(), args, (chunk) => {
    const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(chunk);
    if (m && total) onProgress?.(`بيدمج… ${Math.min(99, Math.round(((+m[1] * 3600 + +m[2] * 60 + +m[3]) / total) * 100))}٪`);
  });
  return { width: W, height: H, duration: total };
};

// ===== الترجمة والدبلجة =====
export const dubLanguages = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربي" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "tr", label: "Türkçe" },
  { value: "ur", label: "اردو" },
  { value: "hi", label: "हिन्दी" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "zh", label: "中文" },
];

const toWav = (input, output) => run(ffmpegPath(), ["-y", "-i", input, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", output]);

// الكلام كلمة كلمة بتوقيته (Whisper بلغة الدبلجة)، ولو Whisper مش متسطب بنرجع فاضي
const wordsOf = async (file, lang) => {
  const st = whisperStatus();
  if (!st.installed || !st.modelReady) return [];
  try {
    return await transcribeFile(file, { language: lang });
  } catch {
    return [];
  }
};

export const dubMedia = async ({ file, sourceLang = "ar", targetLang = "en", uploadsDir, onProgress }) => {
  const name = `dub-${targetLang}-${stamp()}.wav`;
  const dest = path.join(uploadsDir, name);

  if (isMock()) {
    // وضع التجربة: نفس الصوت الأصلي، وكلام إنجليزي تجريبي على أماكن الكلام
    onProgress?.("بيدبلج (تجربة)");
    await toWav(file, dest);
    const speech = await detectSpeech(file).catch(() => []);
    const sample = "This is a test dub of your video in another language".split(" ");
    let k = 0;
    const words = speech.flatMap((s) => {
      const n = Math.max(1, Math.round((s.toMs - s.fromMs) / 400));
      const step = (s.toMs - s.fromMs) / n;
      return Array.from({ length: n }, (_, i) => ({ text: ` ${sample[k++ % sample.length]}`, startMs: Math.round(s.fromMs + i * step), endMs: Math.round(s.fromMs + (i + 1) * step), timestampMs: null, confidence: null }));
    });
    return { path: `uploads/${name}`, words, lang: targetLang };
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new MediaError("حط مفتاح ElevenLabs من ⚙️ الإعدادات عشان الدبلجة");
  const size = fs.statSync(file).size;
  if (size > 450 * 1024 * 1024) throw new MediaError("الفيديو أكبر من 450 ميجا. قصّه أو صدّره بجودة أقل الأول");

  onProgress?.("بيرفع الفيديو لـ ElevenLabs");
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(file)], { type: file.toLowerCase().endsWith(".wav") ? "audio/wav" : "video/mp4" }), path.basename(file));
  form.append("source_lang", sourceLang);
  form.append("target_lang", targetLang);
  form.append("num_speakers", "0");
  form.append("watermark", "false");
  form.append("name", `montag-${stamp()}`);
  const headers = { "xi-api-key": key };
  const r = await fetch("https://api.elevenlabs.io/v1/dubbing", { method: "POST", headers, body: form });
  if (r.status === 401) throw new MediaError("مفتاح ElevenLabs غلط");
  if (!r.ok) throw new MediaError(`ElevenLabs: ${r.status} ${(await r.text()).slice(0, 250)}`);
  const { dubbing_id: id, expected_duration_sec: expected } = await r.json();

  // بنستنى لحد ما الدبلجة تخلص (بتاخد تقريبًا قد طول الفيديو أو أكتر شوية)
  const started = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 5000));
    const s = await fetch(`https://api.elevenlabs.io/v1/dubbing/${id}`, { headers }).then((x) => x.json());
    if (s.status === "dubbed") break;
    if (s.status === "failed") throw new MediaError(`الدبلجة فشلت: ${String(s.error ?? "").slice(0, 200)}`);
    const secs = Math.round((Date.now() - started) / 1000);
    onProgress?.(`بيدبلج… ${secs} ثانية${expected ? ` من حوالي ${Math.round(expected)}` : ""}`);
    if (secs > 45 * 60) throw new MediaError("الدبلجة أخدت وقت أطول من اللازم. جرب تاني بعدين");
  }

  onProgress?.("بيحمّل الدبلجة");
  const tmp = path.join(os.tmpdir(), `montag-dub-${stamp()}.mp4`);
  try {
    const d = await fetch(`https://api.elevenlabs.io/v1/dubbing/${id}/audio/${targetLang}`, { headers });
    if (!d.ok) throw new MediaError(`تحميل الدبلجة فشل (${d.status})`);
    fs.writeFileSync(tmp, Buffer.from(await d.arrayBuffer()));
    await toWav(tmp, dest);
  } finally {
    tryRemove(tmp);
  }
  onProgress?.("بيعمل كابشن الدبلجة");
  return { path: `uploads/${name}`, words: await wordsOf(dest, targetLang), lang: targetLang };
};

// ===== تصليح كلمة غلط في الصوت: نفس الجملة بصوتك (نسخة من صوتك على ElevenLabs) بنفس طولها بالظبط =====
// صوتك بيتنسخ مرة واحدة لكل فيديو (من أول دقيقة ونص كلام)، وبيتحفظ في uploads/voice-clones.json
const atempoChain = (ratio) => {
  const parts = [];
  let r = Math.max(0.25, Math.min(4, ratio));
  while (r > 2) {
    parts.push("atempo=2");
    r /= 2;
  }
  while (r < 0.5) {
    parts.push("atempo=0.5");
    r /= 0.5;
  }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(",");
};

const cloneVoice = async ({ file, key, uploadsDir, onProgress }) => {
  const store = path.join(uploadsDir, "voice-clones.json");
  const all = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, "utf8")) : {};
  const id = path.basename(file);
  if (all[id]) return all[id];
  onProgress?.("بينسخ صوتك (مرة واحدة للفيديو ده)");
  const sample = path.join(os.tmpdir(), `montag-sample-${stamp()}.mp3`);
  try {
    await run(ffmpegPath(), ["-y", "-i", file, "-vn", "-t", "90", "-ac", "1", "-ar", "44100", "-b:a", "128k", sample]);
    const form = new FormData();
    form.append("name", `montag-${id.slice(0, 40)}`);
    form.append("files", new Blob([fs.readFileSync(sample)], { type: "audio/mpeg" }), "sample.mp3");
    form.append("remove_background_noise", "true");
    const r = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": key }, body: form });
    if (r.status === 401) throw new MediaError("مفتاح ElevenLabs غلط");
    if (!r.ok) {
      const t = (await r.text()).slice(0, 250);
      if (/can_not_use_instant_voice_cloning|subscription|plan/i.test(t)) throw new MediaError("نسخ الصوت محتاج باقة مدفوعة على ElevenLabs (Starter أو أعلى)");
      throw new MediaError(`ElevenLabs: ${r.status} ${t}`);
    }
    const { voice_id: voiceId } = await r.json();
    all[id] = voiceId;
    fs.writeFileSync(store, JSON.stringify(all, null, 2));
    return voiceId;
  } finally {
    tryRemove(sample);
  }
};

export const revoiceMedia = async ({ file, text, fromMs, toMs, before = "", after = "", uploadsDir, onProgress }) => {
  const target = (toMs - fromMs) / 1000;
  if (!(target > 0.05)) throw new MediaError("المدة قصيرة أوي");
  if (target > 30) throw new MediaError("اختار جملة أقصر من 30 ثانية");
  const name = `fix-${stamp()}.wav`;
  const dest = path.join(uploadsDir, name);

  if (isMock()) {
    onProgress?.("بيولّد الصوت (تجربة)");
    await run(ffmpegPath(), ["-y", "-f", "lavfi", "-i", `sine=frequency=330:duration=${target.toFixed(3)}`, "-af", "volume=0.2", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", dest]);
    return { path: `uploads/${name}` };
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new MediaError("حط مفتاح ElevenLabs من ⚙️ الإعدادات عشان تصليح الصوت");
  const say = async (voiceId) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // الكلام اللي قبل وبعد بيخلي النبرة ماشية مع الجملة
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", previous_text: before || undefined, next_text: after || undefined, voice_settings: { stability: 0.5, similarity_boost: 0.9 } }),
    });
  let voiceId = await cloneVoice({ file, key, uploadsDir, onProgress });
  onProgress?.("بيقول الكلام بصوتك");
  let r = await say(voiceId);
  if (r.status === 404 || r.status === 400) {
    // الصوت المنسوخ اتمسح من حسابك: ننسخه تاني
    const store = path.join(uploadsDir, "voice-clones.json");
    const all = JSON.parse(fs.readFileSync(store, "utf8"));
    delete all[path.basename(file)];
    fs.writeFileSync(store, JSON.stringify(all, null, 2));
    voiceId = await cloneVoice({ file, key, uploadsDir, onProgress });
    r = await say(voiceId);
  }
  if (!r.ok) throw new MediaError(`ElevenLabs: ${r.status} ${(await r.text()).slice(0, 200)}`);

  const raw = path.join(os.tmpdir(), `montag-fix-${stamp()}.mp3`);
  try {
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    await fitTake({ take: raw, file, fromMs, toMs, dest, onProgress });
  } finally {
    tryRemove(raw);
  }
  return { path: `uploads/${name}` };
};

// علو الصوت (LUFS) في ملف، أو في فترة منه (ffmpeg بتاع Remotion مفيهوش volumedetect، فبنستخدم قياس loudnorm)
const loudness = async (file, fromMs, toMs) => {
  const range = fromMs !== undefined ? ["-ss", (fromMs / 1000).toFixed(3), "-t", ((toMs - fromMs) / 1000).toFixed(3)] : [];
  let log = "";
  await run(ffmpegPath(), ["-hide_banner", ...range, "-i", file, "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"], (chunk) => (log += chunk)).catch(() => {});
  const v = Number(log.match(/"input_i"\s*:\s*"(-?[\d.]+)"/)?.[1]);
  return Number.isFinite(v) && v > -70 ? v : null;
};

// تسجيلة (من المايك أو من ElevenLabs) ← نفس طول الكلام الغلط بالظبط، وبنفس علو صوت الفيديو حواليه
// (القص والكابشن بيفضلوا زي ما هم لأن الطول مبيتغيرش)
export const fitTake = async ({ take, file, fromMs, toMs, dest, onProgress }) => {
  const target = (toMs - fromMs) / 1000;
  onProgress?.("بيظبط الطول على مكان الكلمة");
  // بنشيل السكوت من أول وآخر التسجيلة (أول وآخر كلام فيها، بهامش صغير)
  const total = (await probe(take)).duration;
  if (!(total > 0.05)) throw new MediaError("التسجيلة فاضية. جرب تاني");
  const speech = await detectSpeech(take).catch(() => []);
  const start = speech.length ? Math.max(0, speech[0].fromMs / 1000 - 0.03) : 0;
  const end = speech.length ? Math.min(total, speech.at(-1).toMs / 1000 + 0.05) : total;
  const got = end - start;
  if (!(got > 0.05)) throw new MediaError("مفيش كلام في التسجيلة. اتكلم أعلى شوية وجرب تاني");
  // علو الصوت: بنقارن بثانيتين حوالين الكلمة في الفيديو الأصلي
  const [orig, mine] = await Promise.all([loudness(file, Math.max(0, fromMs - 1000), toMs + 1000), loudness(take, start * 1000, end * 1000)]);
  const gain = orig !== null && mine !== null ? Math.max(-20, Math.min(20, orig - mine)) : 0;
  await run(ffmpegPath(), [
    "-y",
    "-i",
    take,
    "-vn",
    "-af",
    `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS,${atempoChain(got / target)},volume=${gain.toFixed(1)}dB,apad`,
    "-t",
    target.toFixed(3),
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    dest,
  ]);
};

// تسجيلة بصوتك من المايك مكان الكلام الغلط
export const placeTake = async ({ take, file, fromMs, toMs, uploadsDir, onProgress }) => {
  if (!(toMs - fromMs > 50)) throw new MediaError("المدة قصيرة أوي");
  const name = `fix-${stamp()}.wav`;
  await fitTake({ take, file, fromMs, toMs, dest: path.join(uploadsDir, name), onProgress });
  return { path: `uploads/${name}` };
};
