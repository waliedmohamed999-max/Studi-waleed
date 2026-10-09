// أدوات الصور والصوت
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";

// بيحوّل مسار ملف في public/ (زي "uploads/x.jpg") للينك اللي Remotion يفهمه
// ولو كان لينك كامل (http...) بيسيبه زي ما هو
export const assetSrc = (p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : staticFile(p.replace(/^\/+/, "")));

// ===== Ken Burns: صورة ثابتة بتتحرك وتتزوم ببطء =====
// كل صورة بتتحرك في اتجاه مختلف حسب index عشان الفيديو ميبقاش ممل
export const KenBurnsImage: React.FC<{ src: string; duration: number; index?: number; enabled?: boolean }> = ({
  src,
  duration,
  index = 0,
  enabled = true,
}) => {
  const frame = useCurrentFrame();
  const p = enabled ? interpolate(frame, [0, duration], [0, 1], { extrapolateRight: "clamp" }) : 0;

  const zoomIn = index % 2 === 0;
  const scale = zoomIn ? 1.05 + p * 0.15 : 1.2 - p * 0.15;
  const dirs = [
    [-1, -0.5],
    [1, 0.5],
    [0.5, -1],
    [-0.5, 1],
  ];
  const [dx, dy] = dirs[index % dirs.length];
  const x = dx * p * 3; // بالنسبة المئوية
  const y = dy * p * 3;

  return (
    <Img
      src={assetSrc(src)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale}) translate(${x}%, ${y}%)`,
      }}
    />
  );
};

// ===== منحنى صوت المزيكا: بتعلى في الأول وتوطى في الآخر =====
// الفيديوهات القصيرة جدًا بيتصغر فيها وقت الدخول والخروج عشان النقط تفضل بالترتيب
export const fadeEnvelope = (frame: number, total: number, fps: number) => {
  const fadeIn = Math.max(1, Math.min(fps, total / 4));
  const fadeOut = Math.max(fadeIn + 1, total - Math.min(fps * 1.5, total / 4));
  const end = Math.max(fadeOut + 1, total);
  return interpolate(frame, [0, fadeIn, fadeOut, end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const musicVolume = (frame: number, total: number, volume: number, fps: number) => volume * fadeEnvelope(frame, total, fps);
