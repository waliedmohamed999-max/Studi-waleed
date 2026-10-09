// تعريف القوالب: كل خانة ليها قيمة افتراضية، ومفيش خانتين بنفس الاسم
import { describe, expect, it } from "vitest";
import { videos } from "../src/compositions";

// الخانات الخاصة (لوحات كاملة) مش بتتخزن باسمها
const panels = new Set(["scenes", "film", "autoedit", "podcast"]);

describe("القوالب", () => {
  for (const v of videos) {
    it(`${v.id}: الخانات سليمة`, () => {
      const keys = v.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      const missing = v.fields.filter((f) => !panels.has(f.type) && !(f.key in v.defaultProps)).map((f) => f.key);
      expect(missing).toEqual([]);
      // اختيارات القوايم فيها القيمة الافتراضية
      for (const f of v.fields) {
        if (f.type !== "select") continue;
        const def = v.defaultProps[f.key];
        expect(f.options.map((o) => o.value), `${v.id}.${f.key}`).toContain(def);
      }
    });
  }
  it("أول قالب (اللي المشروع الجديد بيبدأ بيه) هو المونتاج الأوتوماتيك", () => expect(videos[0].id).toBe("AutoEdit"));
});
