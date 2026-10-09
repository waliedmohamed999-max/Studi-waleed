// تتبع الوش: الكادر بيمشي ورا وش اللي بيتكلم (لو الفيديو عرضي والمقاس طولي)، والزووم بيقرّب على الوش نفسه
// النقط بتتحسب مرة واحدة في الاستوديو (MediaPipe)، وهنا بس الحساب الصافي اللي المعاينة والتصدير بيستخدموه
export type FacePoint = { t: number; x: number; y: number; s: number }; // t: مللي ثانية في الفيديو الأصلي، x/y: نص الوش (0-1)، s: عرض الوش (نسبة من العرض)

// مكان الوش في لحظة معينة (بين أقرب نقطتين)
export const faceAt = (track: FacePoint[], t: number): FacePoint | null => {
  if (!track.length) return null;
  if (t <= track[0].t) return track[0];
  if (t >= track[track.length - 1].t) return track[track.length - 1];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const k = (t - a.t) / Math.max(1, b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k };
};

// ===== الكادر =====
// الفيديو بيتعرض object-fit: cover، فلو نسبته مختلفة عن المقاس جزء منه بيتقص.
// بنحرك الجزء الظاهر عشان الوش ييجي في النص (أو أقرب حاجة ليه من غير ما نطلع برا الصورة)
export const faceFraming = ({ srcW, srcH, outW, outH, face }: { srcW: number; srcH: number; outW: number; outH: number; face: { x: number; y: number } | null }) => {
  if (!face || !srcW || !srcH) return { objectPosition: "50% 50%", origin: "50% 40%" };
  const srcAspect = srcW / srcH;
  const outAspect = outW / outH;
  // الجزء الظاهر من الفيديو الأصلي (نسبة من العرض والطول)
  const vw = srcAspect > outAspect ? outAspect / srcAspect : 1;
  const vh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  // الوش بيبقى في نص الكادر بالعرض، وأعلى من النص شوية بالطول (زي ما المصورين بيعملوا)
  const left = Math.min(1 - vw, Math.max(0, face.x - vw / 2));
  const top = Math.min(1 - vh, Math.max(0, face.y - vh * 0.42));
  const posX = vw < 1 ? (left / (1 - vw)) * 100 : 50;
  const posY = vh < 1 ? (top / (1 - vh)) * 100 : 50;
  // مكان الوش جوه الكادر (عشان الزووم يقرّب عليه هو)
  const ox = ((face.x - left) / vw) * 100;
  const oy = ((face.y - top) / vh) * 100;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return { objectPosition: `${posX.toFixed(2)}% ${posY.toFixed(2)}%`, origin: `${clamp(ox).toFixed(2)}% ${clamp(oy).toFixed(2)}%` };
};

// ===== تنعيم الحركة =====
// 1) النقط اللي ملقيناش فيها وش بتاخد مكان أقرب وش قبلها أو بعدها
// 2) "منطقة ميتة": الكادر مش بيتحرك مع كل حركة صغيرة للراس (عشان الصورة متترعشش)
// 3) تنعيم في الاتجاهين (من غير تأخير)
export const smoothTrack = (raw: (FacePoint | null)[], times: number[], { deadZone = 0.04, alpha = 0.15 } = {}): FacePoint[] => {
  const n = times.length;
  if (!n || raw.every((p) => !p)) return [];
  const filled: FacePoint[] = [];
  let last: FacePoint | null = raw.find(Boolean) ?? null;
  for (let i = 0; i < n; i++) {
    if (raw[i]) last = raw[i];
    filled.push({ ...(last as FacePoint), t: times[i] });
  }
  // المنطقة الميتة
  const held: FacePoint[] = [];
  let anchor = filled[0];
  for (const p of filled) {
    if (Math.abs(p.x - anchor.x) > deadZone || Math.abs(p.y - anchor.y) > deadZone) anchor = p;
    held.push({ ...anchor, t: p.t, s: p.s });
  }
  // تنعيم أمامي وخلفي
  const pass = (arr: FacePoint[]) => {
    const out: FacePoint[] = [];
    let cur = arr[0];
    for (const p of arr) {
      cur = { t: p.t, x: cur.x + (p.x - cur.x) * alpha, y: cur.y + (p.y - cur.y) * alpha, s: cur.s + (p.s - cur.s) * alpha };
      out.push(cur);
    }
    return out;
  };
  const fwd = pass(held);
  const back = pass([...fwd].reverse()).reverse();
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return back.map((p) => ({ t: Math.round(p.t), x: r(p.x), y: r(p.y), s: r(p.s) }));
};
