// إيموجي أوتوماتيك: لما تقول كلمة مهمة ("فلوس"، "قهوة"، "نجاح") يطلع إيموجي بينط فوق الكلام
// القاموس ده مجاني وبيشتغل من غير ذكاء اصطناعي، وClaude ممكن يختار أدق لو عايز
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence } from "remotion";

export type EmojiItem = { id: string; atMs: number; emoji: string; word?: string; fromWord?: number };

// كل سطر: إيموجي ← جذور الكلمات (بعد ما نشيل ال والتشكيل)
const dict: [string, string[]][] = [
  ["💰", ["فلوس", "مال", "ريال", "جنيه", "دولار", "ربح", "ارباح", "مكسب", "فلس", "سعر", "اسعار", "كاش", "money"]],
  ["☕", ["قهوه", "قهوة", "كوفي", "اسبريسو", "لاتيه", "فنجان", "فنجال", "coffee"]],
  ["🚀", ["نجاح", "ناجح", "انطلاق", "اطلاق", "نمو", "تكبير", "تريند", "سريع", "بسرعه"]],
  ["🔥", ["نار", "قوي", "رهيب", "خطير", "جامد", "مولع", "حصري", "عرض", "عروض", "خصم", "تخفيض"]],
  ["❤️", ["حب", "بحب", "احب", "قلب", "عشق", "love"]],
  ["😂", ["ضحك", "هزار", "نكته", "مضحك", "ههه", "هههه"]],
  ["🤔", ["سؤال", "ليه", "ازاي", "كيف", "ليش", "فكر", "تفكير", "محير"]],
  ["💡", ["فكره", "فكرة", "نصيحه", "نصيحة", "سر", "اسرار", "طريقه", "حل", "حلول"]],
  ["⚠️", ["خطا", "غلط", "اغلاط", "تحذير", "خطر", "مشكله", "مشكلة", "مشاكل", "احذر"]],
  ["✅", ["صح", "صحيح", "تمام", "مضمون", "اكيد", "خطوه", "خطوات"]],
  ["📱", ["موبايل", "جوال", "تليفون", "تلفون", "ايفون", "تطبيق", "ابلكيشن"]],
  ["💻", ["لابتوب", "كمبيوتر", "برمجه", "كود", "موقع", "اونلاين"]],
  ["📈", ["زياده", "زيادة", "مبيعات", "ارقام", "نسبه", "احصائيات", "تحليل"]],
  ["🎯", ["هدف", "اهداف", "تركيز", "بالظبط", "بالضبط"]],
  ["⏰", ["وقت", "ساعه", "دقيقه", "دقايق", "بسرعه", "متاخر", "النهارده", "اليوم"]],
  ["🏠", ["بيت", "منزل", "شقه", "عقار", "عقارات", "فيلا"]],
  ["🚗", ["عربيه", "سياره", "سيارة", "مشوار", "سفر"]],
  ["✈️", ["طياره", "طيران", "رحله", "رحلة", "سياحه"]],
  ["🍔", ["اكل", "مطعم", "برجر", "وجبه", "وجبة", "جوعان"]],
  ["🍕", ["بيتزا"]],
  ["🎉", ["مبروك", "احتفال", "عيد", "مناسبه", "فرحه", "جايزه", "مسابقه"]],
  ["🇸🇦", ["السعوديه", "سعوديه", "الرياض", "رياض", "جده", "جدة", "الوطني"]],
  ["🇪🇬", ["مصر", "القاهره", "اسكندريه"]],
  ["💪", ["قوه", "رياضه", "جيم", "تمرين", "صحه"]],
  ["🧠", ["عقل", "ذكاء", "ذكي", "تعلم", "تعليم", "مخ"]],
  ["🤖", ["روبوت", "الذكاء", "ai", "شات"]],
  ["👀", ["شوف", "شوفوا", "بص", "انظر", "لاحظ", "خليك"]],
  ["👇", ["تحت", "التعليقات", "كومنت"]],
  ["📍", ["مكان", "موقعنا", "عنوان", "فرع", "فروع", "زورونا"]],
  ["🛒", ["شراء", "اشتري", "اطلب", "طلب", "متجر", "سله"]],
  ["🎁", ["هديه", "هدية", "مجانا", "مجاني", "ببلاش"]],
  ["😍", ["جميل", "حلو", "روعه", "رائع", "تحفه"]],
  ["😱", ["صدمه", "مش مصدق", "معقول", "مفاجاه", "مفاجأة"]],
  ["🌍", ["العالم", "عالمي", "دول", "ترجمه"]],
  ["📸", ["صوره", "تصوير", "كاميرا"]],
  ["🎬", ["فيديو", "مونتاج", "فيلم", "اعلان"]],
];

const norm = (w: string) =>
  w
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[.,،؟?!؛;:"'«»()\-…]/g, "");

// بنشيل البادئات الشائعة (و، ف، ب، ل، ال) عشان "والقهوة" و"بالفلوس" تتعرف
const stems = (w: string) => {
  const n = norm(w);
  const out = new Set([n]);
  for (const pre of ["وال", "بال", "فال", "لل", "ال", "و", "ف", "ب", "ل"]) if (n.startsWith(pre) && n.length - pre.length >= 2) out.add(n.slice(pre.length));
  return [...out];
};

const lookup = new Map<string, string>();
for (const [emoji, words] of dict) for (const w of words) lookup.set(norm(w), emoji);

export const emojiFor = (word: string) => {
  for (const s of stems(word)) {
    const e = lookup.get(s);
    if (e) return e;
  }
  return null;
};

// اقتراح من القاموس: إيموجي واحد كل 3 ثواني على الأكتر، ومن غير تكرار نفس الإيموجي ورا بعض
export const suggestEmojis = (words: { text: string; startMs: number }[], { gapMs = 3000, max = 20 } = {}) => {
  const out: { index: number; emoji: string }[] = [];
  let last = -Infinity;
  let lastEmoji = "";
  words.forEach((w, i) => {
    if (out.length >= max || w.startMs - last < gapMs) return;
    const e = emojiFor(w.text);
    if (!e || e === lastEmoji) return;
    out.push({ index: i, emoji: e });
    last = w.startMs;
    lastEmoji = e;
  });
  return out;
};

// ===== الرسم: الإيموجي بينط، بيطلع لفوق شوية، ويختفي =====
const LIFE = 1.3; // ثواني
const Pop: React.FC<{ emoji: string; index: number }> = ({ emoji, index }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const s = spring({ frame, fps, config: { damping: 8, stiffness: 160 } });
  const out = interpolate(frame, [LIFE * fps - 8, LIFE * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const side = index % 3 === 0 ? 0 : index % 3 === 1 ? -1 : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${50 + side * 18}%`,
          top: height > width ? "56%" : "48%",
          fontSize: unit * 0.16,
          lineHeight: 1,
          fontFamily: "system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif",
          transform: `translate(-50%, -50%) translateY(${-frame * 0.6}px) scale(${s}) rotate(${(1 - s) * side * 25}deg)`,
          opacity: out,
          filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.45))",
        }}
      >
        {emoji}
      </div>
    </AbsoluteFill>
  );
};

// items: وقت كل إيموجي في الفيديو النهائي (بالمللي ثانية)
export const EmojiPops: React.FC<{ items: { atMs: number; emoji: string }[] }> = ({ items }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {items.map((it, i) => (
        <Sequence key={i} from={Math.round((it.atMs / 1000) * fps)} durationInFrames={Math.round(LIFE * fps)}>
          <Pop emoji={it.emoji} index={i} />
        </Sequence>
      ))}
    </>
  );
};
