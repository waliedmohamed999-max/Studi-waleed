// المفاتيح وطابور التصدير وB-roll: حاجات لو باظت مش هتبان غير لما تحتاجها
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanKey, createKeyStore, writeEnv } from "../scripts/keys.mjs";
import { createQueue } from "../scripts/render-queue.mjs";
import { pickFile } from "../scripts/broll.mjs";
import { createFilm } from "../scripts/film.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "montag-test-"));
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("ملف .env", () => {
  it("بيغير ويضيف ويمسح من غير ما يبوظ التعليقات", () => {
    const d = tmp();
    dirs.push(d);
    const f = path.join(d, ".env");
    fs.writeFileSync(f, "# تعليق\nFAL_KEY=old\nOTHER=1\n");
    writeEnv(f, { FAL_KEY: "new", PEXELS_API_KEY: "p123", OTHER: "" });
    expect(fs.readFileSync(f, "utf8")).toBe("# تعليق\nFAL_KEY=new\nPEXELS_API_KEY=p123\n");
  });

  it("بيرفض المفتاح اللي فيه سطر جديد أو مسافات", () => {
    expect(() => cleanKey("abc\nEVIL=1")).toThrow();
    expect(() => cleanKey("ab cd")).toThrow();
    expect(cleanKey("  sk-ant-123  ")).toBe("sk-ant-123");
  });

  it("المتصفح بيشوف آخر 4 حروف بس", () => {
    const d = tmp();
    dirs.push(d);
    const before = { ...process.env };
    try {
      const store = createKeyStore({ envFile: path.join(d, ".env") });
      const res = store.save({ keys: { ANTHROPIC_API_KEY: "sk-ant-api03-secretvalue-WXYZ" } });
      const k = res.keys.find((x) => x.id === "ANTHROPIC_API_KEY");
      expect(k.set).toBe(true);
      expect(k.masked).toBe("sk-ant-…WXYZ");
      expect(JSON.stringify(res)).not.toContain("secretvalue");
      // مفتاح مش معروف بيتجاهل
      store.save({ keys: { PATH: "x" } });
      expect(fs.readFileSync(path.join(d, ".env"), "utf8")).not.toContain("PATH");
    } finally {
      process.env = before;
    }
  });
});

describe("طابور التصدير", () => {
  it("بيكمل بعد ما السيرفر يتقفل: الفيديو اللي كان بيتصدر بيرجع للطابور", () => {
    const d = tmp();
    dirs.push(d);
    const stateFile = path.join(d, ".queue.json");
    fs.writeFileSync(
      stateFile,
      JSON.stringify([
        {
          id: "b1",
          name: "دفعة",
          createdAt: 1,
          settings: { format: "mp4", quality: "high", thumbnail: false, loudness: true },
          folder: "",
          canceled: false,
          items: [
            { name: "أ", videoId: "Lesson1", props: {}, index: 0, status: "done", progress: 1, file: "/out/a.mp4", thumb: null, error: null },
            { name: "ب", videoId: "Lesson1", props: {}, index: 1, status: "rendering", progress: 0.4, file: null, thumb: null, error: null },
          ],
        },
      ]),
    );
    const q = createQueue({ root: d, publicDir: d, outDir: d, stateFile, autoStart: false });
    const b = q.get("b1");
    expect(b.status).toBe("running");
    expect(b.items.map((i) => i.status)).toEqual(["done", "pending"]);
    expect(b.items[1].progress).toBe(0);
  });

  it("ملف بايظ مبيوقعش السيرفر", () => {
    const d = tmp();
    dirs.push(d);
    const stateFile = path.join(d, ".queue.json");
    fs.writeFileSync(stateFile, "{not json");
    expect(() => createQueue({ root: d, publicDir: d, outDir: d, stateFile, autoStart: false })).not.toThrow();
  });
});

describe("B-roll", () => {
  it("بيختار أصغر نسخة HD (مش 4K تقيلة ومش جودة واطية)", () => {
    const f = pickFile([
      { file_type: "video/mp4", link: "a", width: 3840, height: 2160 },
      { file_type: "video/mp4", link: "b", width: 1920, height: 1080 },
      { file_type: "video/mp4", link: "c", width: 640, height: 360 },
      { file_type: "video/webm", link: "d", width: 1280, height: 720 },
    ]);
    expect(f.link).toBe("b");
  });
});

describe("حركة الشفايف (وضع التجربة)", () => {
  it("بترجع نسخة من الفيديو مربوطة بالفيديو والصوت", async () => {
    const d = tmp();
    dirs.push(d);
    fs.mkdirSync(path.join(d, "uploads"));
    fs.writeFileSync(path.join(d, "uploads", "c.mp4"), "video");
    fs.writeFileSync(path.join(d, "uploads", "v.wav"), "voice");
    const before = process.env.AI_MOCK;
    process.env.AI_MOCK = "1";
    try {
      const film = createFilm({ publicDir: d });
      const r = await film.lipsync({ projectId: "test1", shot: { id: "s1", clip: "uploads/c.mp4", voice: "uploads/v.wav" } });
      expect(r.lipsyncOf).toBe("uploads/c.mp4|uploads/v.wav");
      expect(fs.existsSync(path.join(d, r.lipsync))).toBe(true);
    } finally {
      if (before === undefined) delete process.env.AI_MOCK;
      else process.env.AI_MOCK = before;
    }
  });

  it("من غير فيديو بيقول رسالة واضحة", async () => {
    const d = tmp();
    dirs.push(d);
    const film = createFilm({ publicDir: d });
    await expect(film.lipsync({ projectId: "test1", shot: { id: "s1", clip: "", voice: "" } })).rejects.toThrow("ولّد فيديو اللقطة الأول");
  });
});

describe("مسح الملفات", () => {
  it("بيمسح فعلًا حتى في فولدر اسمه عربي (fs.rmSync مبيعملش كده على الويندوز)", async () => {
    const { removeFile } = await import("../scripts/fsutil.mjs");
    const d = tmp();
    dirs.push(d);
    const ar = path.join(d, "منتاج");
    fs.mkdirSync(ar);
    const f = path.join(ar, "ملف.txt");
    fs.writeFileSync(f, "x");
    removeFile(f);
    expect(fs.existsSync(f)).toBe(false);
    expect(() => removeFile(f)).not.toThrow(); // مش موجود أصلًا
  });
});

describe("أسماء الملفات من المتصفح", () => {
  it("مفيش طريقة تطلع برا فولدر المشروع", async () => {
    const { safeId } = await import("../scripts/film.mjs");
    expect(safeId("../../evil")).toBe("evil");
    expect(safeId("a/b\c:d")).toBe("abcd");
    expect(safeId("")).toBe("x");
    expect(safeId("shot_1-a")).toBe("shot_1-a");
  });
});
