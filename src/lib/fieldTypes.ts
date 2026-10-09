// أنواع خانات التعديل اللي بتظهر في الاستوديو
export type Option = { value: string; label: string };

// group = اسم القسم اللي الخانة بتظهر تحته في الاستوديو
type FieldBase = { key: string; label: string; group?: string };

export type Field =
  | (FieldBase & { type: "text" })
  | (FieldBase & { type: "lines" }) // كل سطر = عنصر في array
  | (FieldBase & { type: "color" })
  | (FieldBase & { type: "select"; options: Option[] })
  // box = خانة كتابة رقم بدل الشريط (للأرقام الكبيرة)
  | (FieldBase & { type: "number"; min: number; max: number; step: number; suffix?: string; box?: boolean })
  | (FieldBase & { type: "image" }) // مسار صورة في public/
  | (FieldBase & { type: "audio" }) // مسار ملف صوت في public/
  | (FieldBase & { type: "video" }) // مسار فيديو في public/
  | (FieldBase & { type: "slides" }) // قايمة مشاهد: صورة + كلام
  | (FieldBase & { type: "scenes" }) // محرر المشاهد الكامل (المرحلة 3)
  | (FieldBase & { type: "media" }) // فيديو أو ملف صوت (المرحلة 4)
  | (FieldBase & { type: "captions" }) // محرر الكابشن + التفريغ + التعليق الصوتي (المرحلة 4)
  | (FieldBase & { type: "film" }) // مخرج الأفلام: الفكرة والسيناريو واللقطات والتوليد (المرحلة 7)
  | (FieldBase & { type: "autoedit" }); // المونتاج الأوتوماتيك: رفع وتفريغ وتحليل وقص
