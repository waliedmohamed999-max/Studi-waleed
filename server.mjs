// سيرفر صغير بيستقبل طلبات التصدير من الاستوديو العربي ويعمل render للفيديو
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createQueue, formats } from "./scripts/render-queue.mjs";
import { detectSpeech, setupWhisper, transcribeFile, whisperStatus, ffmpegPath } from "./scripts/whisper.mjs";
import { AiError, aiStatus, analyzeTalk, generateVideo, improveScene, planFilm, suggestBrand, writePost, writeScript } from "./scripts/ai.mjs";
import { createFilm, filmStatus, FilmError } from "./scripts/film.mjs";
import { MODELS } from "./scripts/models.mjs";
import { cleanAudio } from "./scripts/audio.mjs";
import { generateSound, SoundError } from "./scripts/sound.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
// مفاتيح الخدمات الخارجية (زي ELEVENLABS_API_KEY) بتتحط في ملف .env جنب السيرفر
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {}
const outDir = path.join(root, "out");
const publicDir = path.join(root, "public");
const uploadsDir = path.join(publicDir, "uploads");
const brandFile = path.join(root, "brand.json");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use("/out", express.static(outDir));

// ===== رفع الملفات (صور ولوجو ومزيكا وفيديو) =====
const kinds = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"],
  audio: [".mp3", ".wav", ".m4a", ".ogg", ".aac"],
  video: [".mp4", ".webm", ".mov", ".m4v", ".mkv"],
};
const kindOf = (file) => Object.entries(kinds).find(([, exts]) => exts.includes(path.extname(file).toLowerCase()))?.[0];

// مسار ملف جوه public/ بأمان (من غير ما حد يطلع برا الفولدر)
const publicPath = (p) => {
  const full = path.resolve(publicDir, String(p ?? "").replace(/^\/+/, ""));
  if (!full.startsWith(publicDir + path.sep) || !fs.existsSync(full)) return null;
  return full;
};

// مدة ملف صوت أو فيديو بالثواني
const mediaDuration = (file) =>
  new Promise((resolve) => {
    const ffprobe = path.join(path.dirname(ffmpegPath()), "ffprobe.exe");
    const p = spawn(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(Number(out.trim()) || 0));
    p.on("error", () => resolve(0));
  });

// الملف بييجي كـ body خام، واسمه في ?name=
// بنكتبه على الهارد وهو بيوصل (stream) عشان الفيديوهات الكبيرة متملاش الرامات
app.post("/api/upload", async (req, res) => {
  const original = String(req.query.name ?? "");
  const ext = path.extname(original).toLowerCase();
  if (!kindOf(original)) {
    return res
      .status(400)
      .json({ error: "نوع الملف ده مش مدعوم. المتاح: صور (jpg, png, webp, svg, gif)، صوت (mp3, wav, m4a, ogg)، فيديو (mp4, webm, mov)" });
  }
  // اسم آمن: إنجليزي وأرقام بس، عشان مايعملش مشاكل في اللينكات
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "file";
  const name = `${Date.now().toString(36)}-${base}${ext}`;
  const file = path.join(uploadsDir, name);
  try {
    await pipeline(req, fs.createWriteStream(file));
  } catch {
    fs.rmSync(file, { force: true });
    return res.status(500).json({ error: "الرفع اتقطع" });
  }
  const kind = kindOf(name);
  const duration = kind === "audio" || kind === "video" ? await mediaDuration(file) : 0;
  res.json({ path: `uploads/${name}`, kind, duration });
});

app.get("/api/media-info", async (req, res) => {
  const file = publicPath(req.query.path);
  if (!file) return res.status(404).json({ error: "الملف مش موجود" });
  res.json({ duration: await mediaDuration(file), kind: kindOf(file) });
});

// قايمة الملفات المتاحة (اللي رفعتها + ملفات التجربة)
app.get("/api/assets", (_req, res) => {
  const list = [];
  for (const folder of ["uploads", "demo"]) {
    const dir = path.join(publicDir, folder);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const kind = kindOf(f);
      if (!kind) continue;
      list.push({ path: `${folder}/${f}`, name: f, kind, folder, time: fs.statSync(path.join(dir, f)).mtimeMs });
    }
  }
  list.sort((a, b) => (a.folder === b.folder ? b.time - a.time : a.folder === "uploads" ? -1 : 1));
  res.json(list);
});

app.use(express.json({ limit: "5mb" }));

// ===== المشاريع (كل مشروع ملف JSON في projects/) =====
const projectsDir = path.join(root, "projects");
fs.mkdirSync(projectsDir, { recursive: true });
const validId = (id) => /^[a-z0-9]{4,32}$/.test(id);
const projectFile = (id) => path.join(projectsDir, `${id}.json`);

app.get("/api/projects", (_req, res) => {
  const list = fs
    .readdirSync(projectsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const { id, name, videoId, updatedAt } = JSON.parse(fs.readFileSync(path.join(projectsDir, f), "utf8"));
        return { id, name, videoId, updatedAt };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

app.get("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  if (!validId(id) || !fs.existsSync(projectFile(id))) return res.status(404).json({ error: "المشروع مش موجود" });
  res.json(JSON.parse(fs.readFileSync(projectFile(id), "utf8")));
});

app.put("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const { name, videoId, props } = req.body ?? {};
  if (!validId(id) || typeof videoId !== "string" || typeof props !== "object") {
    return res.status(400).json({ error: "بيانات المشروع مش صحيحة" });
  }
  const project = { id, name: String(name || "مشروع بدون اسم").slice(0, 100), videoId, props, updatedAt: Date.now() };
  fs.writeFileSync(projectFile(id), JSON.stringify(project, null, 2));
  res.json({ ok: true, updatedAt: project.updatedAt });
});

app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ error: "رقم المشروع مش صحيح" });
  if (fs.existsSync(projectFile(id))) fs.unlinkSync(projectFile(id));
  res.json({ ok: true });
});

// ===== Whisper: التسطيب والتفريغ =====
let whisperJob = null; // { step, progress, error, done }

app.get("/api/whisper", (_req, res) => res.json({ ...whisperStatus(), job: whisperJob }));

app.post("/api/whisper/install", (_req, res) => {
  if (whisperJob && !whisperJob.done) return res.json({ ok: true });
  whisperJob = { step: "program", progress: 0, error: null, done: false };
  setupWhisper((p) => Object.assign(whisperJob, p))
    .then(() => Object.assign(whisperJob, { done: true, step: "done", progress: 1 }))
    .catch((e) => Object.assign(whisperJob, { done: true, error: String(e?.message ?? e) }));
  res.json({ ok: true });
});

const transcribeJobs = new Map();
let transcribing = false;

app.post("/api/transcribe", (req, res) => {
  const file = publicPath(req.body?.path);
  if (!file) return res.status(404).json({ error: "الملف مش موجود" });
  const st = whisperStatus();
  if (!st.installed || !st.modelReady) return res.status(400).json({ error: "Whisper مش متسطب لسه" });
  if (transcribing) return res.status(409).json({ error: "فيه تفريغ شغال دلوقتي، استنى لما يخلص" });

  const jobId = Date.now().toString(36);
  const job = { status: "running", progress: 0, captions: null, error: null };
  transcribeJobs.set(jobId, job);
  transcribing = true;
  res.json({ jobId });

  transcribeFile(file, { language: req.body?.language || "ar", onProgress: (p) => (job.progress = p) })
    .then((captions) => Object.assign(job, { status: "done", progress: 1, captions }))
    .catch((e) => Object.assign(job, { status: "error", error: String(e?.message ?? e).slice(0, 400) }))
    .finally(() => (transcribing = false));
});

app.get("/api/transcribe/:id", (req, res) => {
  const job = transcribeJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "العملية مش موجودة" });
  res.json(job);
});

// ===== التعليق الصوتي (Text to Speech) =====
const runTts = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "tts.ps1"), ...args]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
  });

app.get("/api/tts/voices", async (_req, res) => {
  let windows = [];
  try {
    windows = (await runTts(["-List"]))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const [name, lang, gender] = l.split("|");
        return { id: name.replace("Microsoft ", ""), name, lang, gender };
      });
  } catch {}
  res.json({ windows, elevenlabs: !!process.env.ELEVENLABS_API_KEY });
});

app.post("/api/tts", async (req, res) => {
  const { text, provider = "windows", voice = "Naayf", rate = 1 } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "اكتب الكلام الأول" });
  const id = Date.now().toString(36);
  try {
    let rel;
    if (provider === "elevenlabs") {
      // ElevenLabs: أصوات عربي طبيعية جدًا، بس محتاج مفتاح API في ملف .env
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) return res.status(400).json({ error: "حط ELEVENLABS_API_KEY في ملف .env جنب server.mjs" });
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      });
      if (!r.ok) throw new Error(`ElevenLabs: ${r.status} ${(await r.text()).slice(0, 200)}`);
      rel = `uploads/tts-${id}.mp3`;
      fs.writeFileSync(path.join(publicDir, rel), Buffer.from(await r.arrayBuffer()));
    } else {
      const txt = path.join(uploadsDir, `tts-${id}.txt`);
      fs.writeFileSync(txt, text, "utf8");
      rel = `uploads/tts-${id}.wav`;
      try {
        await runTts(["-TextFile", txt, "-Out", path.join(publicDir, rel), "-Voice", String(voice), "-Rate", String(Number(rate) || 1)]);
      } finally {
        // الويندوز ساعات بيفضل ماسك الملف لحظة بعد ما البرنامج يقفل
        fs.rmSync(txt, { force: true, maxRetries: 5, retryDelay: 200 });
      }
    }
    res.json({ path: rel, duration: await mediaDuration(path.join(publicDir, rel)) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 400) });
  }
});

// ===== الذكاء الاصطناعي (Claude) =====
const strList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");
const clip = (v, n) => String(v ?? "").slice(0, n);

// الاستوديو بيبعت الاختيارات المتاحة (الخطوط والحركات...) عشان Claude يختار منها بس
const readOptions = (o = {}) => {
  if (![o.sceneTypes, o.fonts, o.animations, o.transitions].every(strList)) throw new AiError("الاختيارات المتاحة ناقصة");
  return o;
};

const aiRoute = (handler) => async (req, res) => {
  if (!aiStatus().available) return res.status(400).json({ error: "حط ANTHROPIC_API_KEY في ملف .env جنب server.mjs، وبعدين أعد تشغيل الاستوديو" });
  try {
    res.json(await handler(req.body ?? {}));
  } catch (e) {
    console.error(e);
    res.status(e instanceof AiError ? 400 : 500).json({ error: e instanceof AiError ? e.message : "حصلت مشكلة في الذكاء الاصطناعي" });
  }
};

app.get("/api/ai/status", (_req, res) => res.json(aiStatus()));

app.post(
  "/api/ai/video",
  aiRoute((b) =>
    generateVideo({ idea: clip(b.idea, 2000), dialect: clip(b.dialect, 10), seconds: Math.min(120, Math.max(5, Number(b.seconds) || 20)), options: readOptions(b.options) }),
  ),
);

app.post(
  "/api/ai/script",
  aiRoute((b) => writeScript({ idea: clip(b.idea, 2000), dialect: clip(b.dialect, 10), seconds: Math.min(300, Math.max(5, Number(b.seconds) || 30)) })),
);

app.post("/api/ai/brand", aiRoute((b) => suggestBrand({ business: clip(b.business, 1000), options: readOptions(b.options) })));

app.post(
  "/api/ai/scene",
  aiRoute((b) =>
    improveScene({
      scene: b.scene,
      instruction: clip(b.instruction, 1000),
      context: clip(b.context, 4000),
      dialect: clip(b.dialect, 10),
      options: readOptions(b.options),
    }),
  ),
);

// ===== توليد مزيكا ومؤثرات صوتية (ElevenLabs) =====
app.post("/api/sound/generate", (req, res) => {
  const b = req.body ?? {};
  const kind = b.kind === "sfx" ? "sfx" : "music";
  if (!process.env.ELEVENLABS_API_KEY && process.env.AI_MOCK !== "1") {
    return res.status(400).json({ error: "حط ELEVENLABS_API_KEY في ملف .env عشان توليد المزيكا والمؤثرات" });
  }
  startFilmJob(res, async (step) => {
    step(kind === "music" ? "بيألّف المزيكا" : "بيعمل المؤثر");
    try {
      return await generateSound({ kind, prompt: clip(b.prompt, 1000), seconds: Number(b.seconds), loop: !!b.loop, uploadsDir, publicDir });
    } catch (e) {
      throw e instanceof SoundError ? new FilmError(e.message) : e;
    }
  });
});
// ===== تنضيف الصوت (دوشة + همهمة + علو ثابت) =====
app.post("/api/audio/clean", (req, res) => {
  const file = publicPath(req.body?.path);
  if (!file) return res.status(404).json({ error: "الملف مش موجود" });
  const strength = Math.min(1, Math.max(0, Number(req.body?.strength ?? 0.6)));
  startFilmJob(res, async (step) => {
    const name = `clean-${Date.now().toString(36)}.wav`;
    await cleanAudio(file, path.join(uploadsDir, name), { strength, onProgress: step });
    return { path: `uploads/${name}` };
  });
});
// ===== المونتاج الأوتوماتيك: فين فيه كلام فعلًا (من مستوى الصوت) =====
app.post("/api/autoedit/speech", async (req, res) => {
  const file = publicPath(req.body?.path);
  if (!file) return res.status(404).json({ error: "الملف مش موجود" });
  try {
    res.json({ speech: await detectSpeech(file) });
  } catch (e) {
    res.status(500).json({ error: `قراءة الصوت فشلت: ${String(e?.message ?? e).slice(0, 200)}` });
  }
});

// ===== كابشن النشر =====
app.post(
  "/api/ai/post",
  aiRoute((b) =>
    writePost({ platform: clip(b.platform, 40), dialect: clip(b.dialect, 10), content: clip(b.content, 6000), hashtags: Math.min(15, Math.max(0, Number(b.hashtags) || 5)) }),
  ),
);
// ===== المونتاج الأوتوماتيك: تحليل الكلام بـ Claude =====
app.post(
  "/api/autoedit/analyze",
  aiRoute(async (b) => {
    const words = (Array.isArray(b.words) ? b.words : [])
      .slice(0, 20000)
      .map((w) => ({ text: String(w.text ?? ""), startMs: Number(w.startMs) || 0, endMs: Number(w.endMs) || 0 }));
    if (words.length < 3) throw new AiError("فرّغ الفيديو الأول (محتاج كلام عشان يتحلل)");
    const r = await analyzeTalk({ words, maxHighlights: Math.min(10, Math.max(0, Number(b.maxHighlights) || 3)) });
    // أرقام الكلمات ← أوقات بالمللي ثانية (مع التأكد إن الأرقام جوه الحدود)
    const at = (i) => words[Math.min(words.length - 1, Math.max(0, Number(i) || 0))];
    const range = (a, z) => {
      const [from, to] = [Number(a) || 0, Number(z) || 0].sort((x, y) => x - y);
      // الأرقام بتتبعت كمان عشان الاستوديو يحسب الوقت الحقيقي بعد محاذاة الكلمات
      return { fromMs: at(from).startMs, toMs: at(to).endMs, fromWord: Math.max(0, Math.min(words.length - 1, from)), toWord: Math.max(0, Math.min(words.length - 1, to)) };
    };
    return {
      hookTitle: String(r.hookTitle ?? ""),
      cuts: (r.cuts ?? []).map((c) => ({ ...range(c.fromWord, c.toWord), reason: String(c.reason ?? ""), enabled: true })),
      emphasis: (r.emphasis ?? []).map((e) => range(e.fromWord, e.toWord)),
      highlights: (r.highlights ?? []).map((h) => ({ title: String(h.title ?? ""), hook: String(h.hook ?? ""), ...range(h.fromWord, h.toWord) })),
    };
  }),
);

// ===== مخرج الأفلام (المرحلة 7) =====
const film = createFilm({ publicDir });
const filmJobs = new Map();

// بنشغّل 3 عمليات توليد بس في نفس الوقت عشان منضربش حدود fal.ai
let filmRunning = 0;
const filmWaiting = [];
const filmSlot = () =>
  new Promise((resolve) => {
    if (filmRunning < 3) {
      filmRunning++;
      resolve();
    } else filmWaiting.push(resolve);
  });
const filmRelease = () => {
  const next = filmWaiting.shift();
  if (next) next();
  else filmRunning--;
};

const startFilmJob = (res, fn) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const job = { status: "running", step: "مستني دوره", result: null, error: null, startedAt: Date.now() };
  filmJobs.set(id, job);
  res.json({ jobId: id });
  (async () => {
    await filmSlot();
    try {
      job.step = "بيبدأ";
      job.result = await fn((step) => step && (job.step = step));
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = e instanceof FilmError || e instanceof AiError ? e.message : `حصلت مشكلة: ${String(e?.message ?? e).slice(0, 300)}`;
      if (!(e instanceof FilmError || e instanceof AiError)) console.error(e);
    } finally {
      filmRelease();
    }
  })();
};

app.get("/api/film/status", (_req, res) =>
  res.json({
    ...filmStatus(),
    claude: aiStatus().available,
    tiers: Object.fromEntries(Object.entries(MODELS.video).map(([k, v]) => [k, { label: v.label, pricePerSecond: v.pricePerSecond }])),
    imagePrice: MODELS.image.pricePerImage,
    voiceModels: MODELS.voice.models,
    voicePricePer1kChars: MODELS.voice.pricePer1kChars,
    clipSeconds: MODELS.clipSeconds,
  }),
);

app.get("/api/film/voices", async (_req, res) => {
  let windows = [];
  try {
    windows = (await runTts(["-List"])).split(/\r?\n/).filter(Boolean).map((l) => {
      const [name, lang] = l.split("|");
      return { id: name.replace("Microsoft ", ""), name, lang };
    });
  } catch {}
  res.json({ elevenlabs: await film.voices().catch(() => []), windows });
});

app.get("/api/film/job/:id", (req, res) => {
  const job = filmJobs.get(req.params.id);
  return job ? res.json(job) : res.status(404).json({ error: "العملية مش موجودة (يمكن السيرفر اتقفل)" });
});

app.post("/api/film/plan", (req, res) => {
  if (!aiStatus().available) return res.status(400).json({ error: "محتاج مفتاح Claude (ANTHROPIC_API_KEY في .env) عشان يكتب السيناريو" });
  const b = req.body ?? {};
  const uploads = (Array.isArray(b.uploads) ? b.uploads : []).slice(0, 8).map((u) => ({ path: String(u.path ?? ""), note: clip(u.note, 200) }));
  startFilmJob(res, async (step) => {
    step("Claude بيشوف الصور");
    const images = (await Promise.all(uploads.map((u) => film.imageForClaude(u.path)))).filter(Boolean);
    step("Claude بيكتب السيناريو");
    return planFilm({
      brief: clip(b.brief, 4000),
      videoType: clip(b.videoType, 100),
      dialect: clip(b.dialect, 20),
      targetSeconds: Math.min(180, Math.max(10, Number(b.targetSeconds) || 30)),
      format: clip(b.format, 20),
      uploads,
      images,
    });
  });
});

const needFal = (res) => {
  if (!filmStatus().fal) {
    res.status(400).json({ error: "حط FAL_KEY في ملف .env جنب server.mjs، وبعدين أعد تشغيل الاستوديو" });
    return true;
  }
  return false;
};

app.post("/api/film/character", (req, res) => {
  if (needFal(res)) return;
  const b = req.body ?? {};
  startFilmJob(res, (step) => film.character({ projectId: String(b.projectId), character: b.character, style: clip(b.style, 1500), onProgress: step }));
});

app.post("/api/film/keyframe", (req, res) => {
  if (needFal(res)) return;
  const b = req.body ?? {};
  startFilmJob(res, (step) =>
    film.keyframe({ projectId: String(b.projectId), shot: b.shot, characters: b.characters ?? [], uploads: b.uploads ?? [], style: clip(b.style, 1500), format: String(b.format), onProgress: step }),
  );
});

app.post("/api/film/voice", (req, res) => {
  const b = req.body ?? {};
  startFilmJob(res, (step) =>
    film.voice({
      projectId: String(b.projectId),
      shot: b.shot,
      prevText: clip(b.prevText, 500),
      nextText: clip(b.nextText, 500),
      provider: String(b.provider),
      voiceId: String(b.voiceId ?? ""),
      model: String(b.model ?? ""),
      onProgress: step,
    }),
  );
});

app.post("/api/film/clip", (req, res) => {
  if (needFal(res)) return;
  const b = req.body ?? {};
  startFilmJob(res, (step) => film.clip({ projectId: String(b.projectId), shot: b.shot, quality: String(b.quality), style: clip(b.style, 1500), onProgress: step }));
});

// ===== هوية البراند (متحفظة في brand.json) =====
app.get("/api/brand", (_req, res) => {
  res.json(fs.existsSync(brandFile) ? JSON.parse(fs.readFileSync(brandFile, "utf8")) : {});
});
app.put("/api/brand", (req, res) => {
  fs.writeFileSync(brandFile, JSON.stringify(req.body ?? {}, null, 2));
  res.json({ ok: true });
});

// ===== طابور التصدير (فيديو واحد أو دفعة من شيت) =====
const queue = createQueue({ root, publicDir, outDir });
const videoIdOk = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);

app.post("/api/queue", (req, res) => {
  const { name, items, settings = {} } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "مفيش فيديوهات تتصدر" });
  if (items.length > 500) return res.status(400).json({ error: "أقصى حاجة 500 فيديو في الدفعة" });
  if (!items.every((i) => videoIdOk(i?.videoId) && i.props && typeof i.props === "object")) {
    return res.status(400).json({ error: "بيانات الفيديوهات مش صحيحة" });
  }
  const format = formats[settings.format] ? settings.format : "mp4";
  const batch = queue.add({
    name,
    items: items.map((i) => ({ name: String(i.name ?? "video"), videoId: i.videoId, props: i.props })),
    settings: { format, quality: settings.quality === "draft" ? "draft" : "high", thumbnail: !!settings.thumbnail, loudness: settings.loudness !== false },
  });
  res.json(batch);
});

app.get("/api/queue", (_req, res) => res.json(queue.list()));
app.get("/api/queue/:id", (req, res) => {
  const b = queue.get(req.params.id);
  return b ? res.json(b) : res.status(404).json({ error: "الدفعة مش موجودة" });
});
app.post("/api/queue/:id/cancel", (req, res) => res.json({ ok: queue.cancel(req.params.id) }));

// يفتح فولدر الدفعة في الويندوز (السيرفر شغال على جهازك، فده بيفتح عندك)
app.post("/api/queue/:id/open", (req, res) => {
  spawn("explorer", [queue.folderOf(req.params.id)], { detached: true, stdio: "ignore" }).unref();
  res.json({ ok: true });
});

// قايمة الفيديوهات اللي اتصدرت قبل كده (في out وفي فولدرات الدفعات)
app.get("/api/exports", (_req, res) => {
  const exts = /\.(mp4|webm|gif)$/i;
  const files = [];
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isFile() && exts.test(entry.name)) files.push(entry.name);
    if (entry.isDirectory()) for (const f of fs.readdirSync(path.join(outDir, entry.name))) if (exts.test(f)) files.push(`${entry.name}/${f}`);
  }
  res.json(
    files
      .map((f) => ({ name: f, url: `/out/${f.split("/").map(encodeURIComponent).join("/")}`, time: fs.statSync(path.join(outDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time),
  );
});

const port = Number(process.env.API_PORT ?? 4001);
app.listen(port, () => console.log(`سيرفر التصدير شغال على http://localhost:${port}`));
