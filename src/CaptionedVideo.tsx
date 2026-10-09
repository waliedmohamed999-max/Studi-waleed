// فيديو بكابشن: فيديو مرفوع (أو صوت على خلفية) + كابشن كلمة كلمة زي التيك توك
// المرحلة 4
import { useMemo } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions, type Caption, type TikTokPage } from "@remotion/captions";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { assetSrc, KenBurnsImage, musicVolume } from "./lib/media";
import { gradeFilter } from "./lib/grades";
import { EmojiPops, type EmojiItem } from "./lib/emoji";

export type CaptionStyle = "tiktok" | "pop" | "karaoke" | "subtitle" | "bold" | "beast" | "boxed" | "neon" | "minimal" | "typewriter";

// الأشكال اللي بتعرض كلمتين تلاتة بس في المرة (زي كبار صناع المحتوى)
const shortPages: string[] = ["bold", "beast", "boxed"];
// ألوان "beast": كل كلمة مميزة بلون مختلف
const beastColors = ["#facc15", "#22c55e", "#ef4444", "#38bdf8", "#f472b6"];

export type CaptionedProps = {
  format: string;
  fit: string; // "cover" | "contain"
  media: string; // فيديو أو ملف صوت
  mediaDuration: number; // بالثواني (الاستوديو بيحسبها لوحده)
  mediaVolume: number; // 0..100
  cleanAudio: string; // نسخة الصوت بعد التنضيف (لو موجودة بتتسمع بدل الصوت الأصلي)
  bgImage: string; // لو الـ media صوت بس
  bgFrom: string;
  bgTo: string;
  title: string; // عنوان ثابت فوق (اختياري)
  captions: Caption[];
  captionStyle: string;
  position: string; // "bottom" | "center" | "top"
  wordsTogetherMs: number; // الكلام اللي بيتقال في المدة دي بيظهر مع بعض
  captionSize: number; // 50..200 ٪
  font: string;
  textColor: string;
  highlight: string;
  music: string;
  musicVolume: number;
  grade: string; // فلتر الألوان
  emojis: EmojiItem[]; // atMs بتوقيت الفيديو نفسه
  showEmojis: string;
};

const FPS = 30;
const videoExts = [".mp4", ".webm", ".mov", ".m4v", ".mkv"];
export const isVideoFile = (p: string) => videoExts.some((e) => p.toLowerCase().endsWith(e));

export const calculateCaptioned = (p: CaptionedProps) => {
  const { width, height } = getFormat(p.format);
  const lastCaption = p.captions.reduce((m, c) => Math.max(m, c.endMs), 0) / 1000;
  const seconds = Math.max(p.mediaDuration || 0, lastCaption + 0.5, 2);
  return { durationInFrames: Math.ceil(seconds * FPS), fps: FPS, width, height };
};

// شكل الكابشن بس (من غير باقي إعدادات الفيديو)، عشان أي فيديو تاني يقدر يستخدم نفس الكابشن
export type CaptionLook = Pick<CaptionedProps, "captionStyle" | "position" | "wordsTogetherMs" | "captionSize" | "font" | "textColor" | "highlight">;

// ===== صفحة كابشن واحدة (كام كلمة بيظهروا مع بعض) =====
const CaptionPage: React.FC<{ page: TikTokPage; p: CaptionLook }> = ({ page, p }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const nowMs = page.startMs + (frame / fps) * 1000;
  const size = unit * 0.075 * (Math.max(50, Math.min(200, p.captionSize || 100)) / 100);
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 6 });

  // حدود سودا حوالين الحروف عشان الكلام يبان على أي فيديو
  const outline = `0 0 ${size * 0.08}px rgba(0,0,0,0.9), 0 ${size * 0.05}px ${size * 0.15}px rgba(0,0,0,0.6)`;

  const base: React.CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.heavy,
    fontSize: size,
    lineHeight: 1.45,
    textAlign: "center",
    maxWidth: width * 0.88,
  };

  const style = p.captionStyle as CaptionStyle;

  if (style === "pop") {
    // كلمة واحدة بس في المرة، كبيرة وبتنط
    const current = page.tokens.find((t) => nowMs >= t.fromMs && nowMs < t.toMs) ?? page.tokens.filter((t) => t.fromMs <= nowMs).at(-1);
    if (!current) return null;
    const startFrame = ((current.fromMs - page.startMs) / 1000) * fps;
    const s = spring({ frame: frame - startFrame, fps, config: { damping: 9, stiffness: 180 } });
    return (
      <div dir="auto" style={{ ...base, fontSize: size * 1.5, color: p.highlight, textShadow: outline, transform: `scale(${0.6 + s * 0.4})` }}>
        {current.text.trim()}
      </div>
    );
  }

  if (style === "minimal") {
    // هادي ونضيف: سطر رفيع من غير حدود تقيلة
    return (
      <div dir="auto" style={{ ...base, fontWeight: 500, fontSize: size * 0.72, color: p.textColor, opacity: enter, textShadow: "0 2px 12px rgba(0,0,0,0.6)", letterSpacing: 0.3 }}>
        {page.text.trim()}
      </div>
    );
  }

  if (style === "subtitle") {
    // ترجمة كلاسيكية: السطر كله على خلفية غامقة
    return (
      <div
        dir="auto"
        style={{
          ...base,
          fontWeight: 700,
          fontSize: size * 0.8,
          color: p.textColor,
          background: "rgba(0,0,0,0.65)",
          padding: `${size * 0.15}px ${size * 0.45}px`,
          borderRadius: size * 0.25,
          opacity: enter,
        }}
      >
        {page.text.trim()}
      </div>
    );
  }

  // tiktok و karaoke: كل كلمات الصفحة ظاهرة، والكلمة الحالية مميزة
  // المسافة بين الكلمات بالـ gap مش بالمسافات اللي في النص، عشان الكلمة الكبيرة متغطيش عليها
  return (
    <div
      dir="auto"
      style={{
        ...base,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: "0.4em",
        opacity: enter,
        transform: `translateY(${(1 - enter) * size * 0.3}px)`,
      }}
    >
      {page.tokens.map((t, i) => {
        const active = nowMs >= t.fromMs && nowMs < t.toMs;
        const past = nowMs >= t.toMs;
        let color = p.textColor;
        let scale = 1;
        let opacity = 1;
        const extra: React.CSSProperties = {};
        // نطة صغيرة أول ما الكلمة تتقال
        const wordIn = spring({ frame: frame - ((t.fromMs - page.startMs) / 1000) * fps, fps, config: { damping: 10, stiffness: 200 } });
        if (style === "typewriter") {
          // الكلام بيظهر كلمة كلمة وانت بتقوله
          if (!active && !past) return null;
          opacity = Math.min(1, wordIn * 1.5);
        } else if (style === "bold") {
          // عريض وواضح، والكلمة الحالية ملونة وبتكبر
          color = active ? p.highlight : p.textColor;
          scale = active ? 1 + 0.18 * wordIn : 1;
          extra.WebkitTextStroke = `${size * 0.06}px #000`;
          extra.paintOrder = "stroke fill";
        } else if (style === "beast") {
          // ألوان زاهية بتتغير مع كل كلمة، وحدود سودا تقيلة، وميلة خفيفة
          color = active ? beastColors[i % beastColors.length] : p.textColor;
          scale = active ? 1 + 0.25 * wordIn : 1;
          extra.WebkitTextStroke = `${size * 0.09}px #000`;
          extra.paintOrder = "stroke fill";
          extra.rotate = active ? `${(i % 2 ? 1 : -1) * 3 * wordIn}deg` : "0deg";
        } else if (style === "boxed") {
          // الكلمة الحالية جوه بوكس ملون
          color = active ? "#000" : p.textColor;
          if (active) {
            extra.background = p.highlight;
            extra.borderRadius = size * 0.18;
            extra.padding = `0 ${size * 0.18}px`;
            extra.textShadow = "none";
          }
          scale = active ? 1 + 0.06 * wordIn : 1;
        } else if (style === "neon") {
          // توهج بلون مميز
          color = active ? "#fff" : p.textColor;
          extra.textShadow = `0 0 ${size * 0.15}px ${p.highlight}, 0 0 ${size * 0.4}px ${p.highlight}${active ? ", 0 0 " + size * 0.7 + "px " + p.highlight : ""}`;
          opacity = active || past ? 1 : 0.7;
        } else if (style === "karaoke") {
          // الكلام بيتلون وانت بتقوله
          color = active || past ? p.highlight : p.textColor;
          opacity = active || past ? 1 : 0.55;
        } else {
          color = active ? p.highlight : p.textColor;
          scale = active ? 1.08 : 1;
        }
        return (
          <span
            key={i}
            style={{
              color,
              opacity,
              display: "inline-block",
              transform: `scale(${scale})`,
              textShadow: outline,
              ...extra,
            }}
          >
            {t.text.trim()}
          </span>
        );
      })}
    </div>
  );
};

// ===== طبقة الكابشن كلها: بتقسم الكلام لصفحات وتعرض كل صفحة في وقتها =====
// breakOnSilenceMs: لو فيه سكوت أطول من كده بين كلمتين، الكابشن بيبدأ صفحة جديدة
export const CaptionsLayer: React.FC<{ captions: Caption[]; look: CaptionLook; breakOnSilenceMs?: number }> = ({ captions, look, breakOnSilenceMs }) => {
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const pages = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: [...captions].sort((a, b) => a.startMs - b.startMs),
        // الأشكال العريضة بتعرض كلمات أقل في المرة عشان تتقري بسرعة
        combineTokensWithinMilliseconds: shortPages.includes(look.captionStyle) ? Math.min(650, Math.max(200, look.wordsTogetherMs || 650)) : Math.max(200, look.wordsTogetherMs || 1200),
        breakOnSilenceAfterMilliseconds: breakOnSilenceMs,
      }).pages,
    [captions, look.wordsTogetherMs, look.captionStyle, breakOnSilenceMs],
  );
  const justify = look.position === "top" ? "flex-start" : look.position === "center" ? "center" : "flex-end";

  return (
    <>
      {pages.map((page, i) => {
        const from = Math.round((page.startMs / 1000) * fps);
        const nextStart = pages[i + 1]?.startMs ?? page.startMs + page.durationMs;
        // بيفضل ظاهر لحد الصفحة الجاية، بس مش أكتر من ثانية إلا شوية بعد آخر كلمة (عشان ميفضلش في السكوت)
        const lastWordEnd = page.tokens.at(-1)?.toMs ?? page.startMs + page.durationMs;
        const until = Math.min(nextStart, lastWordEnd + 600);
        const dur = Math.max(1, Math.round(((until - page.startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <AbsoluteFill
              style={{
                justifyContent: justify,
                alignItems: "center",
                // في الفيديو الطولي الكابشن فوق منطقة أزرار تيك توك وريلز (حوالي 22٪ من تحت)
                padding: look.position === "center" ? unit * 0.06 : `${height * (height > width ? 0.23 : 0.12)}px ${unit * 0.06}px`,
              }}
            >
              <CaptionPage page={page} p={look} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

export const CaptionedVideo: React.FC<CaptionedProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const hasVideo = !!p.media && isVideoFile(p.media);
  const hasAudio = !!p.media && !hasVideo;

  const titleIn = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${p.bgFrom}, ${p.bgTo})` }}>
      {/* ===== الخلفية ===== */}
      <AbsoluteFill style={{ filter: gradeFilter(p.grade) }}>
        {hasVideo ? (
          <OffthreadVideo
            src={assetSrc(p.media)}
            muted={!!p.cleanAudio}
            volume={p.cleanAudio ? 0 : Math.max(0, Math.min(100, p.mediaVolume ?? 100)) / 100}
            style={{ width: "100%", height: "100%", objectFit: p.fit === "contain" ? "contain" : "cover" }}
          />
        ) : (
          p.bgImage && <KenBurnsImage src={p.bgImage} duration={durationInFrames} />
        )}
      </AbsoluteFill>
      {(hasAudio || (hasVideo && p.cleanAudio)) && (
        <Html5Audio src={assetSrc(p.cleanAudio || p.media)} volume={Math.max(0, Math.min(100, p.mediaVolume ?? 100)) / 100} />
      )}
      {p.music && (
        <Html5Audio src={assetSrc(p.music)} loop volume={(f) => musicVolume(f, durationInFrames, Math.max(0, Math.min(100, p.musicVolume)) / 100, fps)} />
      )}

      {/* ===== عنوان ثابت فوق ===== */}
      {p.title && (
        <div
          dir="auto"
          style={{
            position: "absolute",
            top: height * 0.07,
            left: unit * 0.06,
            right: unit * 0.06,
            textAlign: "center",
            fontFamily: font.family,
            fontWeight: font.heavy,
            fontSize: unit * 0.065,
            color: p.textColor,
            textShadow: "0 4px 20px rgba(0,0,0,0.7)",
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [-30, 0])}px)`,
          }}
        >
          {p.title}
        </div>
      )}

      {p.showEmojis !== "off" && (p.emojis ?? []).length > 0 && <EmojiPops items={p.emojis} />}

      {/* ===== الكابشن ===== */}
      <CaptionsLayer captions={p.captions} look={p} />

      {!p.media && p.captions.length === 0 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ fontFamily: font.family, fontSize: unit * 0.05, color: p.textColor, opacity: 0.7, textAlign: "center", padding: unit * 0.1 }}>
            ارفع فيديو أو ولّد تعليق صوتي من الاستوديو 🎙️
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
