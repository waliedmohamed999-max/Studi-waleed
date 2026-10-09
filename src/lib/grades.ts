// فلاتر الألوان (تلوين سينمائي) بتتطبق على أي فيديو: المتصوّر أو المتولد
// معمولة بـ CSS filter، فبتشتغل في المعاينة والتصدير بنفس الشكل ومن غير أي تكلفة
export const grades: Record<string, { label: string; filter: string }> = {
  none: { label: "من غير فلتر", filter: "none" },
  warm: { label: "دافي (ذهبي)", filter: "sepia(0.18) saturate(1.12) contrast(1.05)" },
  cool: { label: "بارد (أزرق هادي)", filter: "saturate(0.95) hue-rotate(-6deg) contrast(1.06) brightness(0.98)" },
  "teal-orange": { label: "سينمائي (تيل وأورانج)", filter: "contrast(1.1) saturate(1.2) sepia(0.08) hue-rotate(-4deg)" },
  vivid: { label: "ألوان زاهية", filter: "saturate(1.35) contrast(1.08) brightness(1.02)" },
  film: { label: "فيلم قديم", filter: "sepia(0.25) contrast(1.15) saturate(0.85) brightness(0.96)" },
  vintage: { label: "فينتدج", filter: "sepia(0.45) saturate(0.8) contrast(0.95) brightness(1.05)" },
  night: { label: "ليلي", filter: "brightness(0.85) contrast(1.15) saturate(0.9) hue-rotate(-12deg)" },
  bright: { label: "منوّر (للفيديو الغامق)", filter: "brightness(1.15) contrast(1.05) saturate(1.05)" },
  mono: { label: "أبيض وأسود", filter: "grayscale(1) contrast(1.15)" },
};

export const gradeOptions = Object.entries(grades).map(([value, g]) => ({ value, label: g.label }));
export const gradeFilter = (key: string | undefined) => grades[key ?? "none"]?.filter ?? "none";
