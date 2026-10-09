// السيرفر نفسه: بيقوم، والإعدادات بتشتغل، والحماية شغالة، وطلبات الذكاء الاصطناعي (وضع التجربة) بترجع الشكل الصح
// بيشتغل على بورت وملف مفاتيح مؤقتين، فمش بيلمس مفاتيحك ولا الاستوديو اللي شغال
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeFile } from "../scripts/fsutil.mjs";

const PORT = 4199;
const base = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montag-srv-"));
const envFile = path.join(dir, ".env");
let server;

const api = async (url, { method = "GET", body, origin } = {}) => {
  const r = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

const waitJob = async (jobId) => {
  for (let i = 0; i < 100; i++) {
    const { data } = await api(`/api/film/job/${jobId}`);
    if (data.status !== "running") return data;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("timeout");
};

beforeAll(async () => {
  fs.writeFileSync(envFile, "AI_MOCK=1\n");
  // بنشيل أي مفاتيح حقيقية من البيئة عشان الاختبار ميستخدمهاش
  const env = { ...process.env, API_PORT: String(PORT), MONTAG_ENV_FILE: envFile };
  for (const k of ["ANTHROPIC_API_KEY", "FAL_KEY", "ELEVENLABS_API_KEY", "PEXELS_API_KEY", "AI_MOCK"]) delete env[k];
  server = spawn(process.execPath, ["server.mjs"], { env, stdio: "ignore" });
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
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("الإعدادات", () => {
  it("وضع التجربة متقري من الملف", async () => {
    const { data } = await api("/api/settings");
    expect(data.mock).toBe(true);
    expect(data.keys.map((k) => k.id)).toContain("PEXELS_API_KEY");
  });

  it("حفظ مفتاح: بيتكتب في الملف وبيشتغل على طول من غير ريستارت", async () => {
    const { status, data } = await api("/api/settings", { method: "PUT", body: { keys: { FAL_KEY: "test-fal-key-ABCD" } } });
    expect(status).toBe(200);
    expect(data.keys.find((k) => k.id === "FAL_KEY").masked).toBe("…ABCD");
    expect(fs.readFileSync(envFile, "utf8")).toContain("FAL_KEY=test-fal-key-ABCD");
    // ومسحه
    await api("/api/settings", { method: "PUT", body: { keys: { FAL_KEY: "" } } });
    expect(fs.readFileSync(envFile, "utf8")).not.toContain("FAL_KEY");
  });

  it("المفتاح البايظ بيترفض", async () => {
    const { status } = await api("/api/settings", { method: "PUT", body: { keys: { FAL_KEY: "a\nAI_MOCK=0" } } });
    expect(status).toBe(400);
  });

  it("موقع تاني مفتوح في المتصفح مايقدرش يغير المفاتيح", async () => {
    const { status } = await api("/api/settings", { method: "PUT", origin: "https://evil.example", body: { keys: { FAL_KEY: "x" } } });
    expect(status).toBe(403);
  });
});

describe("الذكاء الاصطناعي (وضع التجربة)", () => {
  it("تحليل الكلام بيرجع قطع وريلز ولقطات B-roll بأوقات", async () => {
    const words = Array.from({ length: 30 }, (_, i) => ({ text: `كلمة${i}`, startMs: i * 400, endMs: i * 400 + 350 }));
    const { status, data } = await api("/api/autoedit/analyze", { method: "POST", body: { words } });
    expect(status).toBe(200);
    expect(data.broll.length).toBeGreaterThan(0);
    expect(data.broll[0]).toMatchObject({ query: expect.any(String), fromMs: expect.any(Number), toMs: expect.any(Number) });
  });

  it("سيناريو الفيلم فيه مين بيتكلم في الكادر", async () => {
    const { data } = await api("/api/film/plan", { method: "POST", body: { brief: "إعلان كافيه", targetSeconds: 20 } });
    const job = await waitJob(data.jobId);
    expect(job.status).toBe("done");
    expect(job.result.shots.some((s) => s.speaker)).toBe(true);
  });

  it("لقطة B-roll من غير Pexels: صورة متولدة", async () => {
    const { data } = await api("/api/broll/fetch", { method: "POST", body: { query: "pouring coffee", format: "reel", seconds: 3 } });
    const job = await waitJob(data.jobId);
    expect(job.status).toBe("done");
    expect(job.result.kind).toBe("image");
    // ننضف الصورة اللي اتعملت (removeFile مش rmSync: شوف scripts/fsutil.mjs)
    const made = path.resolve("public", job.result.src);
    expect(fs.existsSync(made)).toBe(true);
    removeFile(made);
    expect(fs.existsSync(made)).toBe(false);
  });
});
