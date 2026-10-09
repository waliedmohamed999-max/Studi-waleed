// الذكاء الاصطناعي جوه الاستوديو (المرحلة 5) عن طريق Claude API
// المفتاح: ANTHROPIC_API_KEY (بيتحط من شاشة الإعدادات، وبيتحفظ في .env)
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

// AI_MOCK=1 بيرجع ردود ثابتة من غير ما يكلم Claude (للتجربة من غير مفتاح)
// (بنقراه وقت الطلب مش وقت التحميل، عشان ملف .env بيتقري بعد الـ imports)
const isMock = () => process.env.AI_MOCK === "1";

// العميل بيتعمل من جديد لو المفتاح اتغير من الإعدادات
let client = null;
let clientKey = null;
const getClient = () => {
  if (!client || clientKey !== process.env.ANTHROPIC_API_KEY) {
    clientKey = process.env.ANTHROPIC_API_KEY;
    client = new Anthropic();
  }
  return client;
};

export const aiStatus = () => ({
  available: isMock() || !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  mock: isMock(),
  model: MODEL,
});

export class AiError extends Error {}

// ===== طلب واحد لـ Claude بيرجع JSON بشكل محدد (structured outputs) =====
// user ممكن يكون نص، أو array فيه صور + نص (عشان Claude يشوف الصور اللي اترفعت)
const askJson = async ({ system, user, schema, effort = "medium", maxTokens = 16000 }) => {
  let res;
  try {
    // streaming للردود الطويلة عشان الطلب ميعملش timeout
    res = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        // لو Claude رفض الطلب بالغلط، بيتعاد أوتوماتيك على موديل تاني
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        output_config: { effort, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: user }],
      })
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("مفتاح Claude غلط. غيّره من ⚙️ الإعدادات");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("المفتاح ده مش مسموح له يستخدم الموديل");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("طلبات كتير ورا بعض، استنى دقيقة وجرب تاني");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`الطلب مش مظبوط: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("مش قادر أوصل لـ Claude، اتأكد من النت");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude رجّع خطأ ${e.status}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new AiError("Claude رفض الطلب ده. جرب تغيّر الصياغة");
  if (res.stop_reason === "max_tokens") throw new AiError("الرد طلع أطول من اللازم. جرب فكرة أقصر");
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
};

// ===== الأشكال اللي Claude لازم يرجعها (JSON Schema) =====
const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const enumOf = (values) => ({ type: "string", enum: values });

// مشهد واحد: نفس الخانات لكل الأنواع، واللي مش مستخدم بيبقى فاضي
const sceneSchema = (sceneTypes, animations) =>
  obj({
    type: enumOf(sceneTypes),
    duration: { type: "number" },
    animation: enumOf(["", ...animations]),
    title: str,
    subtitle: str,
    text: str,
    heading: str,
    items: { type: "array", items: str },
    value: { type: "number" },
    prefix: str,
    suffix: str,
    label: str,
    quote: str,
    author: str,
    sub: str,
  });

const paletteSchema = obj({ primary: str, secondary: str, textColor: str, accent: str });

const dialectText = (d) =>
  d === "msa" ? "Modern Standard Arabic (فصحى)" : d === "gulf" ? "Gulf Arabic" : d === "en" ? "English" : "Egyptian Arabic (عامية مصرية)";

const SCENE_GUIDE = `Scene types and the fields each one uses (leave every other field as "" / [] / 0):
- title: title (short, punchy), subtitle (one short line)
- text: text (one idea, max ~12 words)
- bullets: heading, items (2-4 short items, max ~5 words each)
- stat: value (a number), prefix (e.g. "+" or "$"), suffix (e.g. "%" or "K"), label (what the number means)
- quote: quote, author
- cta: text (button label, 2-3 words), sub (phone, website or handle, if the user gave one; otherwise a short call to action)
duration is in seconds (1.5-8). Longer text needs more time: roughly 1 second per 3 words, minimum 2.
animation is "" to use the project default, or one of the listed animations to override it for one scene.`;

// ===== 1) فكرة ← فيديو كامل =====
export const generateVideo = async ({ idea, dialect, seconds, options }) => {
  if (isMock()) return mockVideo;
  const { sceneTypes, fonts, animations, transitions } = options;
  return askJson({
    effort: "high",
    system: `You are a creative director for short social videos (Reels, TikTok, Shorts) aimed at Arabic-speaking audiences.
You design videos as a sequence of animated text scenes in a video editor. There is no filming and there are no images; everything is typography, color and motion.
Write all on-screen text in ${dialectText(dialect)}. Keep on-screen text short: viewers read it in a couple of seconds.
Structure: open with a strong hook in the first scene, build the message, and end with a cta scene.
Choose colors with strong contrast between textColor and both background colors (primary, secondary). Use #RRGGBB hex.

${SCENE_GUIDE}`,
    user: `Video idea: ${idea}
Target length: about ${seconds} seconds in total.
Available fonts: ${fonts.join(", ")}
Available animations: ${animations.join(", ")}
Available transitions: ${transitions.join(", ")}`,
    schema: obj({
      name: str,
      font: enumOf(fonts),
      animation: enumOf(animations),
      transition: enumOf(transitions),
      palette: paletteSchema,
      scenes: { type: "array", items: sceneSchema(sceneTypes, animations) },
    }),
  });
};

// ===== 2) سكريبت للتعليق الصوتي =====
export const writeScript = async ({ idea, dialect, seconds }) => {
  if (isMock()) return mockScript;
  return askJson({
    system: `You write voiceover scripts for short social videos for Arabic-speaking audiences.
Write in ${dialectText(dialect)}, the way a person would naturally say it out loud: short sentences, no headings, no emojis, no stage directions.
Speaking pace is about 2.5 words per second. The script has three parts: a hook that grabs attention in the first sentence, the main message, and a closing call to action.`,
    user: `Topic: ${idea}\nTarget length: about ${seconds} seconds.`,
    schema: obj({ hook: str, body: str, cta: str }),
  });
};

// ===== 3) اقتراح هوية (ألوان + خط) =====
export const suggestBrand = async ({ business, options }) => {
  if (isMock()) return mockBrand;
  return askJson({
    system: `You are a brand designer. Suggest three distinct visual identities for videos: colors (#RRGGBB) and a font from the list.
textColor must be clearly readable on both primary and secondary. accent is used for highlights and buttons, so it should stand out from primary.
Write "name" and "why" in Arabic, one short line each.`,
    user: `Business: ${business}\nAvailable fonts: ${options.fonts.join(", ")}`,
    schema: obj({
      suggestions: {
        type: "array",
        items: obj({ name: str, why: str, font: enumOf(options.fonts), palette: paletteSchema }),
      },
    }),
  });
};

// ===== 4) "حسّن المشهد ده" =====
export const improveScene = async ({ scene, instruction, context, dialect, options }) => {
  if (isMock()) return { ...mockVideo.scenes[1], heading: `${mockVideo.scenes[1].heading} (بعد التعديل)` };
  return askJson({
    effort: "low",
    system: `You edit one scene of a short animated text video. Apply the user's instruction to the scene and return the full updated scene.
Keep everything the instruction doesn't ask to change. You may change the scene type only if the instruction asks for it.
Write on-screen text in ${dialectText(dialect)} unless the instruction says otherwise.

${SCENE_GUIDE}`,
    user: `The whole video, for context (one line per scene):
${context}

The scene to edit (JSON):
${JSON.stringify(scene)}

Instruction: ${instruction}`,
    schema: sceneSchema(options.sceneTypes, options.animations),
  });
};

// ===== 5) السيناريو الكامل لفيلم قصير (المرحلة 7) =====
const dialectFilm = (d) =>
  ({
    najdi: "Saudi Najdi dialect (لهجة نجدية: وش، أبغى، زين، مرّة، الحين)",
    hijazi: "Saudi Hijazi dialect (لهجة حجازية: إيش، أبغى، مرّة، كده، دحين)",
    gulf: "general Gulf/Khaleeji Arabic",
    msa: "polished Modern Standard Arabic (فصحى بليغة وسلسة)",
    eg: "Egyptian Arabic",
    en: "English",
  })[d] ?? "Saudi Najdi dialect";

export const planFilm = async ({ brief, videoType, dialect, targetSeconds, format, uploads, images }) => {
  if (isMock()) return mockFilm(uploads.length);
  const orientation = format === "youtube" ? "horizontal 16:9" : format === "square" ? "square 1:1" : format === "portrait" ? "vertical 4:5" : "vertical 9:16";
  const uploadList = uploads.length
    ? uploads.map((u, i) => `#${i}: ${u.note || "(no note)"}`).join("\n")
    : "(none)";

  const content = [
    ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } })),
    {
      type: "text",
      text: `Brief from the client:
${brief}

Video type: ${videoType}
Target total length: about ${targetSeconds} seconds
Frame: ${orientation}
Voiceover language: ${dialectFilm(dialect)}

Images the client uploaded (shown above in the same order, numbered from #0):
${uploadList}`,
    },
  ];

  return askJson({
    effort: "high",
    maxTokens: 32000,
    system: `You are an award-winning creative director and film director making premium short-form films, ads and brand/product presentations for the Saudi market. Your output goes straight into a production pipeline: an image model renders the first frame of every shot, an image-to-video model animates it, a voice actor model reads the voiceover, and an editor assembles everything with captions and music. The client expects the result to look like a real, professionally shot film that is ready to publish.

Storytelling
- Hook the viewer in the first 2 seconds, build one clear idea or emotional arc, and land on a satisfying ending or call to action.
- Every shot earns its place and moves the story forward. Vary shot sizes (wide establishing, medium, close-up details) the way a real editor would.
- Write the voiceover as natural spoken language in the requested dialect, the way a skilled Saudi voice-over artist would deliver it: warm, confident, short sentences, no clichés. Pace it at about 2.3 words per second; each shot's voiceLine must fit inside that shot's duration minus half a second. A shot may have an empty voiceLine when the image should breathe.
- onScreenText is optional, very short (2-5 words) Arabic text for key messages; most shots should have none.

Saudi authenticity
- Settings, people, wardrobe and behaviour must feel genuinely Saudi and contemporary: e.g. Riyadh skyline and modern districts, Diriyah mud-brick architecture, AlUla rock formations, Jeddah Al-Balad and corniche, desert dunes at golden hour, majlis interiors, specialty coffee shops, modern offices.
- Men typically wear a thobe with shemagh or ghutra and agal where fitting; women wear an abaya with hijab or niqab or modest modern fashion. Show respect for family, hospitality (Arabic coffee, dates), and Islamic values: no alcohol, pork, gambling, revealing clothing, or romance between unrelated men and women.

Shots (technical limits of the pipeline)
- duration is a whole number of seconds from 3 to 10; 4-6 is ideal. The sum should be close to the target length.
- imagePrompt (English) describes only the first frame as a photorealistic still: subject, action pose, setting, wardrobe, lighting, lens and framing, mood, color palette consistent with the film's style. Write it like a cinematographer's shot description. Never ask for written text, signs, captions or logos inside the image: generated Arabic text comes out garbled, and the editor overlays text separately.
- motionPrompt (English) describes what happens over the shot: one clear camera move (slow dolly-in, orbit, crane up, handheld follow, rack focus) and one simple, physically plausible action. Avoid crowds, complex hand-object interactions and fast action; these break video models.
- Keep recurring people consistent: define each one once in characters (with id, a short Arabic name, and an English description of face, age, build, hair, wardrobe) and list their ids in every shot where they appear. Use few characters (0-3).
- Uploaded images: put an image number in refUploads when the shot should contain that exact product, place or person (the image model will copy it faithfully). Set sourceUpload to an image number when that photo is already a great first frame and should simply be animated; otherwise -1. Use the client's images wherever they serve the story, especially products and logos.

Also write
- title: a short Arabic title for the project.
- style: one English paragraph that defines the visual language of the whole film (look, lighting, color grade, lens choices, texture), reused for every shot.
- cta and ctaSub: a short Arabic call-to-action for the end card and a supporting line (contact, handle or slogan if the client gave one; otherwise a short tagline). Empty strings if the video type doesn't need one.
- musicPrompt: one English sentence describing instrumental background music for the whole film (genre, mood, instruments, tempo), fitting the Saudi audience (e.g. oud, qanun, Khaleeji percussion, or modern cinematic/corporate when that fits better). No vocals.
- sfxPrompt per shot: a short English description of the ambient sound or sound effect that makes the shot feel real (e.g. "espresso machine hissing, cafe ambience", "desert wind"), or empty when the shot needs none.
- speaker per shot: when a character says the shot's voiceLine on camera (dialogue, testimonial, presenter talking to the lens), put that character's id; the pipeline will sync their lips to the voice, so their face must be clearly visible, facing the camera or in three-quarter view, mouth unobstructed, with little head movement in motionPrompt. Otherwise empty (the voiceLine is narration over the image). Use on-camera speakers only where it truly serves the film (e.g. testimonials, a presenter, a short dialogue); most ads work best with narration.`,
    user: content,
    schema: obj({
      title: str,
      style: str,
      cta: str,
      ctaSub: str,
      musicPrompt: str,
      characters: { type: "array", items: obj({ id: str, name: str, description: str }) },
      shots: {
        type: "array",
        items: obj({
          purpose: str,
          duration: { type: "integer" },
          imagePrompt: str,
          motionPrompt: str,
          characters: { type: "array", items: str },
          refUploads: { type: "array", items: { type: "integer" } },
          sourceUpload: { type: "integer" },
          voiceLine: str,
          onScreenText: str,
          sfxPrompt: str,
          speaker: str,
        }),
      },
    }),
  });
};

// ===== 6) تحليل فيديو بيتكلم فيه شخص (المونتاج الأوتوماتيك) =====
// بنبعت الكلام كلمة كلمة برقمها، وClaude بيرجع أرقام الكلمات (مش أوقات) عشان القطع يبقى دقيق
export const analyzeTalk = async ({ words, maxHighlights }) => {
  if (isMock()) return mockTalk(words.length);
  // سطر جديد عند كل سكوت أطول من 0.7 ثانية، وعليه الوقت، عشان Claude يشوف الجمل
  let transcript = "";
  words.forEach((w, i) => {
    const gap = i ? w.startMs - words[i - 1].endMs : Infinity;
    if (gap > 700) transcript += `\n[${(w.startMs / 1000).toFixed(1)}s] `;
    transcript += `${i}:${w.text.trim()} `;
  });

  return askJson({
    effort: "high",
    maxTokens: 32000,
    system: `You are a senior video editor who cuts talking-head videos (Arabic creators: vlogs, explainers, podcasts, product talks) into tight, engaging edits for social media. Silences and filler sounds are already removed automatically; your job is the judgment calls a human editor makes.

You receive the transcript as word-number:word tokens (with timestamps at pauses). Refer to words only by their numbers; ranges are inclusive.

- cuts: remove retakes (when the speaker restarts or repeats a sentence, keep the LAST complete, clean take and cut the earlier attempts), false starts, stumbles, self-corrections, "let me say that again", off-topic chatter, and dead content that adds nothing. Never cut content that carries meaning, and never cut mid-sentence in a way that breaks grammar. When unsure, keep it. Give each cut a short Arabic reason (e.g. "إعادة"، "بداية غلط"، "كلام جانبي").
- emphasis: 3 to 8 short ranges that are the punchlines or key statements, where a punch-in zoom adds energy.
- highlights: up to ${maxHighlights} self-contained clips for Reels/TikTok, each 15 to 60 seconds, that make sense alone and start with a strong first sentence. Give each an Arabic title and an Arabic hook (a short, curiosity-driven line of up to 8 words shown on screen in the first 3 seconds), in the speaker's dialect.
- hookTitle: the same kind of on-screen hook for the full edited video.
- broll: 2 to 6 moments (each covering 2 to 5 seconds of speech, never overlapping a cut or each other, never in the first 3 seconds) where cutting away to supporting footage while the speaker keeps talking makes the video clearer or more engaging: when they mention a concrete thing, place, action, product or example. For each give query, a short English stock-footage search phrase of 2 to 4 concrete visual words (e.g. "pouring espresso", "riyadh skyline night", "typing laptop"), and description, a short Arabic description of the shot for the editor. Skip abstract statements that no footage can show.`,
    user: `Transcript (${words.length} words):\n${transcript}`,
    schema: obj({
      hookTitle: str,
      cuts: { type: "array", items: obj({ fromWord: { type: "integer" }, toWord: { type: "integer" }, reason: str }) },
      emphasis: { type: "array", items: obj({ fromWord: { type: "integer" }, toWord: { type: "integer" } }) },
      highlights: { type: "array", items: obj({ title: str, hook: str, fromWord: { type: "integer" }, toWord: { type: "integer" } }) },
      broll: { type: "array", items: obj({ fromWord: { type: "integer" }, toWord: { type: "integer" }, query: str, description: str }) },
    }),
  });
};

// ===== 7) كابشن النشر والهاشتاجات =====
export const writePost = async ({ platform, dialect, content, hashtags }) => {
  if (isMock()) return mockPost;
  return askJson({
    effort: "low",
    system: `You write social media post copy for Arabic-speaking audiences, especially the Saudi and Gulf market.
Write in ${dialectFilm(dialect)}. Match the platform's culture: TikTok and Snapchat are casual and punchy, Instagram is aesthetic and warm, YouTube needs a searchable title, X is short and witty.
The caption opens with a hook line, adds one or two lines of value, and ends with a light call to action. Use emojis sparingly. Hashtags mix broad Arabic tags, niche tags, and local tags when relevant (e.g. #الرياض, #السعودية), without the # symbol duplicated.`,
    user: `Platform: ${platform}\nNumber of hashtags: ${hashtags}\n\nWhat the video is about:\n${content}`,
    schema: obj({ title: str, caption: str, hashtags: { type: "array", items: str } }),
  });
};
// ===== ردود ثابتة للتجربة من غير مفتاح (AI_MOCK=1) =====
const mockPost = {
  title: "سر القهوة اللي محدش قالك عليه ☕ (تجربة)",
  caption: "صباحك ما يكمل إلا بفنجال صح ☕\nجربنا القهوة المختصة وهذا رأينا بصراحة.\nقولنا في التعليقات: وش قهوتك المفضلة؟",
  hashtags: ["قهوة", "قهوة_مختصة", "الرياض", "السعودية", "كافيهات_الرياض"],
};

const mockTalk = (n) => {
  const third = Math.max(1, Math.floor(n / 3));
  return {
    hookTitle: "الفرق اللي محدش قالك عليه 👀",
    cuts: n > 12 ? [{ fromWord: 4, toWord: 6, reason: "إعادة (تجربة)" }] : [],
    emphasis: n > 3 ? [{ fromWord: 1, toWord: Math.min(3, n - 1) }] : [],
    broll: n > 10 ? [{ fromWord: Math.floor(n / 2), toWord: Math.min(n - 1, Math.floor(n / 2) + 3), query: "pouring coffee", description: "قهوة بتتصب (تجربة)" }] : [],
    highlights:
      n > 6
        ? [
            { title: "المقطع الأول (تجربة)", hook: "ابدأ من هنا", fromWord: 0, toWord: third - 1 },
            { title: "المقطع التاني (تجربة)", hook: "دي أهم نقطة", fromWord: third, toWord: Math.min(n - 1, third * 2) },
          ]
        : [],
  };
};
const mockFilm = (uploadCount) => ({
  title: "قهوة الصباح (تجربة)",
  style: "Warm cinematic look, golden hour light, shallow depth of field, 35mm and 85mm lenses, soft film contrast, earthy beige and amber palette.",
  cta: "زورونا اليوم",
  ctaSub: "الرياض · حي الملقا",
  musicPrompt: "Warm acoustic oud with soft percussion, calm morning mood, 90 bpm",
  characters: [{ id: "c1", name: "فهد", description: "Saudi man in his early 30s, short trimmed beard, white thobe, red-and-white shemagh, calm confident expression" }],
  shots: [
    { purpose: "لقطة افتتاحية للرياض وقت الشروق", duration: 4, imagePrompt: "Wide aerial view of Riyadh skyline at sunrise, golden haze, Kingdom Centre in the distance", motionPrompt: "Slow drone push-in toward the skyline", characters: [], refUploads: [], sourceUpload: -1, voiceLine: "كل يوم يبدأ بفنجال", onScreenText: "", sfxPrompt: "early morning city ambience, birds", speaker: "" },
    { purpose: "فهد يدخل الكافيه", duration: 5, imagePrompt: "Medium shot of a Saudi man entering a modern specialty coffee shop, warm interior light", motionPrompt: "Handheld follow shot as he walks to the counter", characters: ["c1"], refUploads: uploadCount ? [0] : [], sourceUpload: -1, voiceLine: "وفي مكان يعرف وش تحب", onScreenText: "", sfxPrompt: "", speaker: "" },
    { purpose: "تفاصيل تحضير القهوة", duration: 4, imagePrompt: "Extreme close-up of espresso pouring into a ceramic cup, steam rising, dark wood counter", motionPrompt: "Slow motion pour with rack focus", characters: [], refUploads: [], sourceUpload: -1, voiceLine: "", onScreenText: "محمّصة بحب", sfxPrompt: "espresso machine hissing, coffee pouring", speaker: "" },
    { purpose: "فهد يستمتع بالقهوة", duration: 5, imagePrompt: "Close-up of the man smiling while holding a coffee cup by the window, golden light", motionPrompt: "Slow dolly-in on his face as he takes a sip", characters: ["c1"], refUploads: [], sourceUpload: -1, voiceLine: "طعم يخلي صباحك غير", onScreenText: "", sfxPrompt: "", speaker: "c1" },
  ],
});

const blank = { title: "", subtitle: "", text: "", heading: "", items: [], value: 0, prefix: "", suffix: "", label: "", quote: "", author: "", sub: "", animation: "" };
const mockVideo = {
  name: "كافيه المعادي (تجربة)",
  font: "changa",
  animation: "words",
  transition: "wipe",
  palette: { primary: "#1c1917", secondary: "#78350f", textColor: "#ffffff", accent: "#f59e0b" },
  scenes: [
    { ...blank, type: "title", duration: 3, title: "قهوتك مستنياك ☕", subtitle: "في قلب المعادي" },
    { ...blank, type: "bullets", duration: 4, heading: "عندنا إيه؟", items: ["قهوة مختصة", "حلويات طازة", "واي فاي سريع"] },
    { ...blank, type: "stat", duration: 3, value: 20, prefix: "", suffix: "%", label: "خصم الأسبوع ده" },
    { ...blank, type: "cta", duration: 3, text: "تعالى النهارده", sub: "📍 شارع 9، المعادي" },
  ],
};
const mockScript = {
  hook: "عارف إنك ممكن تعمل فيديو احترافي من غير ما تمسك كاميرا؟",
  body: "استوديو منتاج بيحوّل فكرتك لفيديو كامل، بالكلام والحركة والصوت، في دقايق.",
  cta: "جرّبه النهارده وابعتلي رأيك.",
};
const mockBrand = {
  suggestions: [
    { name: "دافي وكلاسيك", why: "ألوان البن والدهب بتدي إحساس قهوة أصلية", font: "messiri", palette: { primary: "#1c1917", secondary: "#78350f", textColor: "#fffbeb", accent: "#f59e0b" } },
    { name: "عصري ومنعش", why: "أخضر نعناعي على غامق، شبابي ونضيف", font: "cairo", palette: { primary: "#022c22", secondary: "#065f46", textColor: "#ffffff", accent: "#34d399" } },
    { name: "جريء", why: "تباين عالي يلفت النظر في الفيد", font: "lalezar", palette: { primary: "#111827", secondary: "#7f1d1d", textColor: "#ffffff", accent: "#facc15" } },
  ],
};
