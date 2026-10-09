// الطبقات: حاجات بتتحط فوق المشهد في أي مكان (نص، صورة أو لوجو، ملصق)
// كل طبقة ليها مكان وحجم ولفة، ووقت ظهور واختفاء جوه المشهد، وحركة دخول
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { assetSrc } from "../lib/media";

export type LayerKind = "text" | "image" | "sticker";

export type Layer = {
  id: string;
  kind: LayerKind;
  text: string; // للنص والملصق (إيموجي)
  src: string; // للصورة
  x: number; // مكان النص (٪ من العرض)
  y: number; // (٪ من الطول)
  size: number; // نص: حجم الخط، صورة: العرض، ملصق: الحجم (كلهم ٪ من أصغر بعد)
  rotate: number; // درجات
  from: number; // بيظهر بعد كام ثانية من أول المشهد
  to: number; // بيختفي عند ثانية كام (0 = لآخر المشهد)
  anim: string; // fade | pop | slide | none
  color: string;
  box: string; // خلفية ورا النص (فاضي = من غير)
};

export const layerAnims = [
  { value: "pop", label: "نطة" },
  { value: "fade", label: "ظهور تدريجي" },
  { value: "slide", label: "طلوع من تحت" },
  { value: "none", label: "من غير حركة" },
];

export const newLayer = (kind: LayerKind, id: string, color = "#ffffff"): Layer => ({
  id,
  kind,
  text: kind === "text" ? "كلام جديد" : kind === "sticker" ? "🔥" : "",
  src: "",
  x: 50,
  y: kind === "text" ? 20 : 50,
  size: kind === "text" ? 7 : kind === "sticker" ? 14 : 28,
  rotate: 0,
  from: 0,
  to: 0,
  anim: "pop",
  color,
  box: "",
});

const LayerView: React.FC<{ layer: Layer; fontFamily: string; heavy: number; sceneFrames: number }> = ({ layer: l, fontFamily, heavy, sceneFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const start = Math.round(Math.max(0, l.from) * fps);
  const end = l.to > l.from ? Math.min(sceneFrames, Math.round(l.to * fps)) : sceneFrames;
  if (frame < start || frame >= end) return null;

  const t = frame - start;
  const out = interpolate(frame, [end - 6, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enter = l.anim === "none" ? 1 : spring({ frame: t, fps, config: l.anim === "pop" ? { damping: 11 } : { damping: 200 }, durationInFrames: 14 });
  const scale = l.anim === "pop" ? 0.4 + enter * 0.6 : 1;
  const dy = l.anim === "slide" ? (1 - enter) * unit * 0.06 : 0;
  const opacity = (l.anim === "pop" ? Math.min(1, enter * 2) : enter) * out;
  const px = (l.size / 100) * unit;

  return (
    <div
      style={{
        position: "absolute",
        left: `${l.x}%`,
        top: `${l.y}%`,
        transform: `translate(-50%, -50%) translateY(${dy}px) rotate(${l.rotate}deg) scale(${scale})`,
        opacity,
      }}
    >
      {l.kind === "image" ? (
        l.src ? <Img src={assetSrc(l.src)} style={{ width: px, height: "auto", display: "block" }} /> : null
      ) : (
        <div
          dir="auto"
          style={{
            fontFamily: l.kind === "sticker" ? "system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif" : fontFamily,
            fontWeight: heavy,
            fontSize: px,
            lineHeight: 1.3,
            color: l.color,
            whiteSpace: "pre",
            textAlign: "center",
            background: l.kind === "text" && l.box ? l.box : "transparent",
            padding: l.kind === "text" && l.box ? `${px * 0.15}px ${px * 0.4}px` : 0,
            borderRadius: px * 0.25,
            textShadow: l.kind === "text" && !l.box ? "0 4px 18px rgba(0,0,0,0.45)" : "none",
          }}
        >
          {l.text}
        </div>
      )}
    </div>
  );
};

export const LayersView: React.FC<{ layers: Layer[]; fontFamily: string; heavy: number; sceneFrames: number }> = ({ layers, ...rest }) =>
  layers.length ? (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {layers.map((l) => (
        <LayerView key={l.id} layer={l} {...rest} />
      ))}
    </AbsoluteFill>
  ) : null;
