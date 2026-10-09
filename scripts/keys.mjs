// مفاتيح الخدمات (Claude و fal.ai و ElevenLabs و Pexels)
// بتتحفظ في ملف .env جنب السيرفر، وبتتغير من شاشة "الإعدادات" في الاستوديو من غير ما تلمس الكود
// المفتاح نفسه عمره ما بيرجع للمتصفح: الاستوديو بيشوف آخر 4 حروف بس
import fs from "node:fs";

export const KEYS = [
  {
    id: "ANTHROPIC_API_KEY",
    name: "Claude",
    use: "السيناريو، والمونتاج الأوتوماتيك، والكابشن، وكل الذكاء الاصطناعي في الاستوديو",
    url: "https://platform.claude.com/settings/keys",
    prefix: "sk-ant-",
  },
  {
    id: "FAL_KEY",
    name: "fal.ai",
    use: "الصور الواقعية، والفيديو المتولد، وحركة الشفايف",
    url: "https://fal.ai/dashboard/keys",
  },
  {
    id: "ELEVENLABS_API_KEY",
    name: "ElevenLabs",
    use: "التعليق الصوتي الاحترافي، والمزيكا، والمؤثرات الصوتية",
    url: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    id: "PEXELS_API_KEY",
    name: "Pexels",
    use: "لقطات B-roll حقيقية مجانية (بدل ما تولّدها بفلوس)",
    url: "https://www.pexels.com/api/",
  },
];

const ids = new Set(KEYS.map((k) => k.id));

// "sk-ant-api03-…x9Qa": بداية المفتاح المعروفة + آخر 4 حروف
const mask = (v, prefix = "") => (v ? `${prefix && v.startsWith(prefix) ? prefix : ""}…${v.slice(-4)}` : "");

// ===== قراءة وكتابة ملف .env (مع الحفاظ على التعليقات والترتيب) =====
const lineKey = (line) => /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];

export const writeEnv = (envFile, updates) => {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : [];
  const left = new Map(Object.entries(updates));
  const out = [];
  for (const line of lines) {
    const k = lineKey(line);
    if (k && left.has(k)) {
      const v = left.get(k);
      left.delete(k);
      if (v) out.push(`${k}=${v}`); // القيمة الفاضية = نمسح السطر
      continue;
    }
    out.push(line);
  }
  while (out.length && out.at(-1) === "") out.pop();
  for (const [k, v] of left) if (v) out.push(`${k}=${v}`);
  fs.writeFileSync(envFile, `${out.join("\n")}\n`);
};

// المفتاح لازم يبقى سطر واحد من غير مسافات أو رموز غريبة (عشان ميبوظش ملف .env)
export const cleanKey = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.length > 400 || !/^[\x21-\x7e]+$/.test(s)) throw new Error("المفتاح فيه حروف مش مظبوطة. انسخه تاني من الموقع من غير مسافات");
  return s;
};

export const createKeyStore = ({ envFile, onChange }) => {
  const list = () => ({
    keys: KEYS.map((k) => ({ ...k, set: !!process.env[k.id], masked: mask(process.env[k.id], k.prefix) })),
    mock: process.env.AI_MOCK === "1",
  });

  // updates: { FAL_KEY: "..." } أو "" عشان تمسحه، و mock: true/false لوضع التجربة
  const save = ({ keys = {}, mock } = {}) => {
    const updates = {};
    for (const [id, value] of Object.entries(keys)) {
      if (!ids.has(id)) continue;
      updates[id] = cleanKey(value);
    }
    if (typeof mock === "boolean") updates.AI_MOCK = mock ? "1" : "";
    writeEnv(envFile, updates);
    for (const [k, v] of Object.entries(updates)) {
      if (v) process.env[k] = v;
      else delete process.env[k];
    }
    onChange?.(Object.keys(updates));
    return list();
  };

  // ===== تجربة المفتاح: طلب مجاني بيتأكد إن المفتاح شغال =====
  const test = async (id) => {
    const key = process.env[id];
    if (!key) return { ok: false, message: "مفيش مفتاح متحط" };
    const ask = async (url, headers) => {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      return { status: r.status, body: await r.text().catch(() => "") };
    };
    try {
      if (id === "ANTHROPIC_API_KEY") {
        const r = await ask("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": key, "anthropic-version": "2023-06-01" });
        if (r.status === 200) return { ok: true, message: "شغال ✓" };
        if (r.status === 401) return { ok: false, message: "المفتاح غلط" };
        return { ok: false, message: `Claude رجّع ${r.status}` };
      }
      if (id === "FAL_KEY") {
        const r = await ask("https://api.fal.ai/v1/account/billing?expand=credits", { Authorization: `Key ${key}` });
        if (r.status === 200) {
          const c = JSON.parse(r.body).credits;
          return { ok: true, message: c ? `شغال ✓ الرصيد: ${c.current_balance} ${c.currency}` : "شغال ✓" };
        }
        // المفاتيح العادية (مش Admin) مش مسموح لها تشوف الرصيد، بس ده معناه إن المفتاح نفسه سليم
        if (r.status === 403) return { ok: true, message: "شغال ✓ (الرصيد بيبان بمفتاح Admin بس)" };
        if (r.status === 401) return { ok: false, message: "المفتاح غلط" };
        return { ok: false, message: `fal.ai رجّع ${r.status}` };
      }
      if (id === "ELEVENLABS_API_KEY") {
        const r = await ask("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key });
        if (r.status === 200) {
          const s = JSON.parse(r.body);
          const left = (s.character_limit ?? 0) - (s.character_count ?? 0);
          return { ok: true, message: `شغال ✓ باقة ${s.tier ?? ""}، فاضل ${left.toLocaleString("ar-EG")} حرف` };
        }
        // مفتاح محدود الصلاحيات: سليم، بس مش مسموح له يقرا بيانات الحساب
        if (r.status === 401 && /missing_permissions/.test(r.body)) return { ok: true, message: "شغال ✓ (مفتاح محدود الصلاحيات)" };
        if (r.status === 401) return { ok: false, message: "المفتاح غلط" };
        return { ok: false, message: `ElevenLabs رجّع ${r.status}` };
      }
      if (id === "PEXELS_API_KEY") {
        const r = await ask("https://api.pexels.com/videos/search?query=coffee&per_page=1", { Authorization: key });
        if (r.status === 200) return { ok: true, message: "شغال ✓" };
        if (r.status === 401 || r.status === 403) return { ok: false, message: "المفتاح غلط" };
        return { ok: false, message: `Pexels رجّع ${r.status}` };
      }
      return { ok: false, message: "مفتاح مش معروف" };
    } catch {
      return { ok: false, message: "مش قادر أوصل للخدمة، اتأكد من النت" };
    }
  };

  return { list, save, test };
};
