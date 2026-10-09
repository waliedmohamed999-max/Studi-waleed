// المزايا الجديدة على السيرفر نفسه (وضع التجربة): الدمج، الدبلجة، شيل الخلفية، الخطة، المكتبة، القوالب، المراجعة
// السيرفر بيشتغل بفولدر بيانات مؤقت، فمشاريعك وملفاتك مش بتتلمس
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { removeFile } from "../scripts/fsutil.mjs";
import { ffmpegPath } from "../scripts/whisper.mjs";
import { probe } from "../scripts/media.mjs";

const PORT = 4198;
const base = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montag-feat-"));
const made = []; // ملفات اتعملت في public/uploads وهنمسحها في الآخر
let server;

const api = async (url, { method = "GET", body } = {}) => {
  const r = await fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const job = async (url, body) => {
  const { status, data } = await api(url, { method: "POST", body });
  if (status !== 200) throw new Error(JSON.stringify(data));
  for (let i = 0; i < 400; i++) {
    const { data: j } = await api(`/api/film/job/${data.jobId}`);
    if (j.status !== "running") {
      if (j.result?.path) made.push(j.result.path);
      return j;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("timeout");
};

// كليب صغير (صورة ملونة + نغمة) جوه public/uploads
const png = (file, w, h, rgb) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const chunk = (t, d) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
};
const clip = (name, w, h, rgb, seconds, withAudio) => {
  const img = path.join(dir, `${name}.png`);
  png(img, w, h, rgb);
  const out = path.resolve("public/uploads", `${name}.mp4`);
  const wav = path.join(dir, `${name}.wav`);
  if (withAudio) {
    const n = 48000 * seconds;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / 48000) * 8000 * (Math.floor(i / 24000) % 2)), i * 2);
    const hd = Buffer.alloc(44);
    hd.write("RIFF", 0);
    hd.writeUInt32LE(36 + data.length, 4);
    hd.write("WAVEfmt ", 8);
    hd.writeUInt32LE(16, 16);
    hd.writeUInt16LE(1, 20);
    hd.writeUInt16LE(1, 22);
    hd.writeUInt32LE(48000, 24);
    hd.writeUInt32LE(96000, 28);
    hd.writeUInt16LE(2, 32);
    hd.writeUInt16LE(16, 34);
    hd.write("data", 36);
    hd.writeUInt32LE(data.length, 40);
    fs.writeFileSync(wav, Buffer.concat([hd, data]));
  }
  const args = ["-v", "error", "-y", "-loop", "1", "-i", img, ...(withAudio ? ["-i", wav, "-c:a", "aac"] : []), "-t", String(seconds), "-r", "30", "-vf", "format=yuv420p", "-c:v", "libx264", out];
  execFileSync(ffmpegPath(), args);
  made.push(`uploads/${name}.mp4`);
  return `uploads/${name}.mp4`;
};

beforeAll(async () => {
  fs.writeFileSync(path.join(dir, ".env"), "AI_MOCK=1\n");
  const env = { ...process.env, API_PORT: String(PORT), MONTAG_ENV_FILE: path.join(dir, ".env"), MONTAG_DATA_DIR: dir, MONTAG_OUT_DIR: path.join(dir, "out") };
  for (const k of ["ANTHROPIC_API_KEY", "FAL_KEY", "ELEVENLABS_API_KEY", "PEXELS_API_KEY", "AI_MOCK"]) delete env[k];
  const log = fs.openSync(path.join(os.tmpdir(), "montag-feat-server.log"), "w");
  server = spawn(process.execPath, ["server.mjs"], { env, stdio: ["ignore", log, log] });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${base}/api/settings`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("السيرفر مقامش");
});

afterAll(() => {
  server?.kill();
  for (const p of made) removeFile(path.resolve("public", p));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("دمج الكليبات", () => {
  it("كليب عرضي بصوت + كليب طولي من غير صوت ← فيديو واحد بمقاس الأول وطوله مجموعهم", async () => {
    const a = clip("zz-test-a", 640, 360, [200, 40, 40], 2, true);
    const b = clip("zz-test-b", 360, 640, [40, 40, 200], 1, false);
    const j = await job("/api/media/join", { paths: [a, b] });
    expect(j.status).toBe("done");
    const info = await probe(path.resolve("public", j.result.path));
    expect([info.width, info.height]).toEqual([640, 360]);
    expect(info.duration).toBeGreaterThan(2.8);
    expect(info.duration).toBeLessThan(3.4);
    expect(info.hasAudio).toBe(true);
  });
  it("كليب واحد بس مرفوض", async () => {
    const { status } = await api("/api/media/join", { method: "POST", body: { paths: ["uploads/zz-test-a.mp4"] } });
    expect(status).toBe(400);
  });
});

describe("الدبلجة وشيل الخلفية (وضع التجربة)", () => {
  it("الدبلجة بترجع صوت وكلام بتوقيت", async () => {
    const j = await job("/api/autoedit/dub", { path: "uploads/zz-test-a.mp4", targetLang: "en" });
    expect(j.status).toBe("done");
    expect(j.result.lang).toBe("en");
    expect(fs.existsSync(path.resolve("public", j.result.path))).toBe(true);
    expect(j.result.words.length).toBeGreaterThan(0);
  });
  it("حركة الشفايف على الدبلجة", async () => {
    const dub = (await job("/api/autoedit/dub", { path: "uploads/zz-test-a.mp4", targetLang: "fr" })).result.path;
    const j = await job("/api/autoedit/dub-lips", { video: "uploads/zz-test-a.mp4", audio: dub });
    expect(j.status).toBe("done");
  });
  it("شيل الخلفية", async () => {
    const j = await job("/api/autoedit/cutout", { path: "uploads/zz-test-a.mp4" });
    expect(j.status).toBe("done");
    expect(j.result.path).toMatch(/^uploads\/cutout-/);
  });
});

describe("الخطة والإيموجي (Claude في وضع التجربة)", () => {
  it("خطة محتوى بالعدد المطلوب", async () => {
    const { data } = await api("/api/ai/plan", { method: "POST", body: { business: "كافيه", count: 7 } });
    expect(data.items).toHaveLength(7);
    expect(["quick", "talk", "film"]).toContain(data.items[0].format);
  });
  it("الخطة بتتحفظ وترجع", async () => {
    await api("/api/content-plan", { method: "PUT", body: { business: "x", items: [{ day: 1 }] } });
    const { data } = await api("/api/content-plan");
    expect(data.business).toBe("x");
    expect(fs.existsSync(path.join(dir, "content-plan.json"))).toBe(true);
  });
  it("Claude بيختار إيموجي بأرقام كلمات صحيحة", async () => {
    const { data } = await api("/api/ai/emoji", { method: "POST", body: { words: ["أهلا", "النهارده", "هنتكلم", "عن", "الفلوس", "والنجاح"] } });
    expect(data.picks.every((p) => p.word >= 0 && p.word < 6)).toBe(true);
  });
});

describe("المكتبة والقوالب", () => {
  it("الملف اللي اسمه عربي بيفضل باسمه في المكتبة", async () => {
    const r = await fetch(`${base}/api/upload?name=${encodeURIComponent("صورة المنتج.png")}`, { method: "POST", body: fs.readFileSync("public/demo/logo.svg").subarray(0, 10) });
    // SVG بامتداد png مش مهم هنا، المهم الاسم
    const { path: p } = await r.json();
    made.push(p);
    const { data } = await api("/api/assets");
    expect(data.find((x) => x.path === p).label).toBe("صورة المنتج");
  });

  it("اسم وفولدر لملف، وبيظهروا في القايمة", async () => {
    await api("/api/library/meta", { method: "PUT", body: { path: "uploads/zz-test-a.mp4", label: "كليب أحمر", group: "تجارب" } });
    const { data } = await api("/api/assets");
    const a = data.find((x) => x.path === "uploads/zz-test-a.mp4");
    expect(a).toMatchObject({ label: "كليب أحمر", group: "تجارب" });
  });
  it("مينفعش تمسح ملفات التجربة أو حاجة برا الفولدر", async () => {
    expect((await api(`/api/library?path=${encodeURIComponent("demo/music.wav")}`, { method: "DELETE" })).status).toBe(400);
    expect((await api(`/api/library?path=${encodeURIComponent("../server.mjs")}`, { method: "DELETE" })).status).toBe(400);
    // حيلة: يبدأ بـ uploads/ بس بيطلع لفولدر تاني
    expect((await api(`/api/library?path=${encodeURIComponent("uploads/../demo/music.wav")}`, { method: "DELETE" })).status).toBe(400);
    expect(fs.existsSync("public/demo/music.wav")).toBe(true);
  });
  it("المسح بيمسح فعلًا", async () => {
    const c = clip("zz-test-del", 64, 64, [0, 0, 0], 1, false);
    expect((await api(`/api/library?path=${encodeURIComponent(c)}`, { method: "DELETE" })).status).toBe(200);
    expect(fs.existsSync(path.resolve("public", c))).toBe(false);
  });
  it("قالب: حفظ، قايمة، مسح", async () => {
    const { data: t } = await api("/api/templates", { method: "POST", body: { name: "قالبي", videoId: "Project", props: { font: "cairo" } } });
    expect((await api("/api/templates")).data.map((x) => x.id)).toContain(t.id);
    await api(`/api/templates/${t.id}`, { method: "DELETE" });
    expect((await api("/api/templates")).data.map((x) => x.id)).not.toContain(t.id);
  });
});

describe("المراجعة قبل التصدير", () => {
  it("بياخد لقطات من الفيديو ويرجع تقييم ومشاكل", async () => {
    const j = await job("/api/ai/review", { videoId: "TextStory", props: { format: "reel", font: "cairo", animation: "words", transition: "slide", secondsPerScene: 1, title: "تجربة", lines: ["سطر"], outro: "باي", bgFrom: "#000000", bgTo: "#222222", textColor: "#ffffff", accentColor: "#facc15" } });
    expect(j.status).toBe("done");
    expect(j.result.score).toBeGreaterThan(0);
    expect(j.result.frames).toHaveLength(6);
    expect(j.result.frames).toEqual([...j.result.frames].sort((a, b) => a - b)); // بالترتيب
  }, 240000);
});

describe("البودكاست على السيرفر", () => {
  it("زامن وقطّع، وبعدين الفيديو بيترسم فعلًا (لقطات من الـ renderer الحقيقي)", async () => {
    const a = clip("zz-test-pod1", 640, 360, [200, 60, 60], 3, true);
    const b = clip("zz-test-pod2", 640, 360, [60, 60, 200], 3, true);
    const j = await job("/api/podcast/analyze", { cams: [{ path: a, role: "speaker" }, { path: b, role: "speaker" }], minShotMs: 1000 });
    expect(j.error ?? "").toBe("");
    expect(j.status).toBe("done");
    expect(Math.abs(j.result.offsets[1])).toBeLessThanOrEqual(30); // نفس الصوت = متزامنين
    expect(j.result.shots.length).toBeGreaterThan(0);

    const props = {
      cams: [
        { id: "a", src: a, label: "أحمد", role: "speaker", mic: "", focusX: 50, focusY: 40 },
        { id: "b", src: b, label: "سارة", role: "speaker", mic: "", focusX: 50, focusY: 40 },
      ],
      offsets: j.result.offsets,
      range: j.result.range,
      mediaDuration: 3,
      shots: [
        { fromMs: j.result.range.fromMs, toMs: 1500, cam: 0, cams: [0], kind: "speaker" },
        { fromMs: 1500, toMs: j.result.range.toMs, cam: 1, cams: [0, 1], kind: "split" },
      ],
      audioFrom: "0", audioFile: "", audioOffset: 0, cleanAudio: "", audioVolume: 100,
      words: [{ text: " أهلا", startMs: 200, endMs: 700, timestampMs: null, confidence: null }],
      captions: "on", captionStyle: "bold", position: "bottom", captionSize: 100, font: "cairo", textColor: "#ffffff", highlight: "#facc15",
      format: "reel", grade: "warm", nameTags: "on", punchIn: "on", hookTitle: "تجربة", showHook: "on", music: "", musicVolume: 8,
      highlights: [], clip: null, analysis: null, minShotSec: 1, splitOnBoth: "on",
    };
    const r = await job("/api/ai/review", { videoId: "Podcast", props });
    expect(r.error ?? "").toBe("");
    expect(r.status).toBe("done");
    expect(r.result.frames.length).toBe(6);
  }, 240000);

  it("كاميرا واحدة مرفوضة", async () => {
    const { status } = await api("/api/podcast/analyze", { method: "POST", body: { cams: [{ path: "uploads/zz-test-pod1.mp4" }] } });
    expect(status).toBe(400);
  });
});

describe("مكتبة المزيكا والمؤثرات", () => {
  it("باقة البداية موجودة بأسمائها وتصنيفاتها وترخيصها", async () => {
    const { data } = await api("/api/assets");
    const pack = data.filter((a) => a.folder === "library");
    expect(pack.length).toBeGreaterThanOrEqual(20);
    const riser = pack.find((a) => a.path === "library/sfx/riser.m4a");
    expect(riser).toMatchObject({ soundKind: "sfx", category: "انتقالات" });
    expect(riser.license).toContain("مجاني");
    expect(pack.find((a) => a.path === "library/music/arabic-hijaz.m4a")).toMatchObject({ soundKind: "music", mood: "عربي" });
  });
  it("الاستيراد: التحليل بيحفظ النوع والمود والترخيص، ومش بيغير اللي اتكتب بالإيد", async () => {
    const r = await fetch(`${base}/api/upload?name=${encodeURIComponent("Epic Upbeat Corporate.wav")}`, { method: "POST", body: fs.readFileSync("public/demo/music.wav") });
    const { path: p } = await r.json();
    made.push(p);
    const a = await api("/api/sound/analyze", { method: "POST", body: { path: p, name: "Epic Upbeat Corporate.wav", license: "Pixabay Content License: مجاني للتجاري", group: "Pixabay" } });
    expect(a.data.kind).toBe("music");
    expect(a.data.bpm).toBeGreaterThan(100);
    let s = (await api("/api/assets")).data.find((x) => x.path === p);
    expect(s).toMatchObject({ soundKind: "music", mood: "شركات", group: "Pixabay", license: "Pixabay Content License: مجاني للتجاري" });
    // تعديل بالإيد بيفضل لو اتحلل تاني
    await api("/api/library/meta", { method: "PUT", body: { path: p, mood: "حماسي" } });
    await api("/api/sound/analyze", { method: "POST", body: { path: p } });
    s = (await api("/api/assets")).data.find((x) => x.path === p);
    expect(s.mood).toBe("حماسي");
  });
  it("Freesound من غير مفتاح: رسالة واضحة", async () => {
    const { status, data } = await api("/api/sound/freesound?q=whoosh");
    expect(status).toBe(400);
    expect(data.error).toContain("Freesound");
  });
  it("سرعة التصدير: الإعدادات متاحة", async () => {
    const { data } = await api("/api/perf");
    expect(data.cpus).toBeGreaterThan(0);
    expect(data.concurrency).toBeGreaterThan(0);
  });
});

describe("التصدير عن طريق الطابور (بإعدادات السرعة الجديدة)", () => {
  it("فيديو بيخلص وفيه مؤثر صوتي ومزيكا بتوطى", async () => {
    const props = {
      format: "reel", font: "cairo", animation: "words", transition: "glitch", logo: "", music: "library/music/upbeat.m4a", musicVolume: 20, voiceover: "", voiceVolume: 100, sfx: "off",
      primary: "#111111", secondary: "#333333", textColor: "#ffffff", accent: "#facc15",
      scenes: [{ id: "a", type: "title", duration: 1.5, animation: "", bgImage: "", title: "تجربة", subtitle: "" }, { id: "b", type: "cta", duration: 1.5, animation: "", bgImage: "", text: "اطلب", sub: "" }],
      soundFx: [{ id: "f", src: "library/sfx/riser.m4a", atMs: 500, volume: 80 }],
    };
    const { data: batch } = await api("/api/queue", { method: "POST", body: { name: "zz-test-queue", items: [{ videoId: "Project", name: "zz-test-queue", props }], settings: { format: "mp4", quality: "draft", thumbnail: false, loudness: true } } });
    let b;
    for (let i = 0; i < 300; i++) {
      b = (await api(`/api/queue/${batch.id}`)).data;
      if (b.status !== "running") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(b.items[0].error ?? "").toBe("");
    expect(b.status).toBe("done");
    const file = path.join(dir, "out", decodeURIComponent(b.items[0].file.replace(/^\/out\//, "")));
    const info = await probe(file);
    expect(info.hasAudio).toBe(true);
    removeFile(file);
  }, 300000);
});
