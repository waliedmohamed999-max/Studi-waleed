import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const font = "'Segoe UI', Tahoma, sans-serif";

// كل الحاجات اللي ممكن تتغير من الاستوديو بتيجي هنا كـ props
export type Lesson1Props = {
  title: string;
  lines: string[];
  outro: string;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  accentColor: string;
};

// ===== المشهد 1: عنوان بيكبر بنطة (spring) =====
const Title: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const frame = useCurrentFrame(); // رقم الفريم الحالي (بيبدأ من 0 جوه كل Sequence)
  const { fps } = useVideoConfig();

  // spring = حركة طبيعية فيها نطة، بتطلع رقم من 0 لـ 1
  const scale = spring({ frame, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ fontFamily: font, fontSize: 150, color, textAlign: "center", padding: 60, transform: `scale(${scale})` }}>
        {text}
      </h1>
    </AbsoluteFill>
  );
};

// ===== المشهد 2: سطور بتدخل من الجنب ورا بعض =====
const Lines: React.FC<{ lines: string[]; color: string }> = ({ lines, color }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
      {lines.map((text, i) => {
        const start = i * 15; // كل سطر يتأخر 15 فريم (نص ثانية) عن اللي قبله
        // interpolate = حوّل الفريمات لقيم: من فريم start لـ start+15 → من 0 لـ 1
        const progress = interpolate(frame, [start, start + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              fontFamily: font,
              fontSize: 110,
              fontWeight: 700,
              color,
              textAlign: "center",
              padding: "0 60px",
              opacity: progress,
              transform: `translateX(${(1 - progress) * 300}px)`,
            }}
          >
            {text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ===== المشهد 3: النهاية بتختفي تدريجي =====
const Outro: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 45, 60], [0, 1, 1, 0]); // يظهر، يثبت، يختفي

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
      <div style={{ fontFamily: font, fontSize: 130, color, fontWeight: 800, textAlign: "center" }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ===== الفيديو كله: خلفية + المشاهد على التايملاين =====
export const Lesson1: React.FC<Lesson1Props> = (props) => {
  const frame = useCurrentFrame();
  // زاوية التدرج بتلف ببطء على طول الفيديو
  const angle = interpolate(frame, [0, 180], [140, 200]);

  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${props.bgFrom}, ${props.bgTo})` }}>
      {/* Sequence = قطعة على التايملاين: from = بتبدأ إمتى، durationInFrames = طولها */}
      <Sequence from={0} durationInFrames={60}>
        <Title text={props.title} color={props.textColor} />
      </Sequence>
      <Sequence from={60} durationInFrames={60}>
        <Lines lines={props.lines} color={props.textColor} />
      </Sequence>
      <Sequence from={120} durationInFrames={60}>
        <Outro text={props.outro} color={props.accentColor} />
      </Sequence>
    </AbsoluteFill>
  );
};
