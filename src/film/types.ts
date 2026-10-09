// أنواع بيانات "مخرج الأفلام" (المرحلة 7): شخصيات، لقطات، صور مرفوعة، وصوت
import type { Caption } from "@remotion/captions";

export type FilmCharacter = {
  id: string;
  name: string;
  description: string; // الشكل واللبس والعمر (بالإنجليزي عشان موديل الصور)
  image: string; // صورة مرجعية للشخصية (بتخلي شكله ثابت في كل اللقطات)
};

// صورة رفعها المستخدم (منتج، مكان، شخص، لوجو) + ملاحظة بتقول هي إيه
export type FilmUpload = { path: string; note: string };

export type FilmShot = {
  id: string;
  duration: number; // ثواني صحيحة من 3 لـ 15 (ده اللي موديلات الفيديو بتقبله)
  purpose: string; // وصف اللقطة بالعربي للمستخدم
  imagePrompt: string; // وصف الصورة الأولى للقطة (إنجليزي، تفصيلي)
  motionPrompt: string; // الحركة والكاميرا (إنجليزي)
  characters: string[]; // ids الشخصيات اللي في اللقطة
  refUploads: number[]; // أرقام الصور المرفوعة اللي تستخدم كمرجع (زي المنتج)
  sourceUpload: number; // صورة مرفوعة تتحرك زي ما هي (-1 = مفيش)
  voiceLine: string; // جملة التعليق الصوتي على اللقطة دي
  onScreenText: string; // كلام قصير يظهر على الشاشة (اختياري)
  keyframe: string; // الصورة الأولى للقطة (متولدة أو مرفوعة)
  clip: string; // الفيديو المتولد
  clipDuration: number; // المدة اللي الفيديو اتولد بيها (لو اختلفت عن duration يبقى محتاج يتعاد)
  voice: string; // ملف صوت التعليق
  voiceDuration: number;
  words: Caption[]; // توقيت كل كلمة في التعليق (بالمللي ثانية من أول اللقطة)
};

// العمليات الطويلة اللي شغالة على السيرفر (بتتحفظ عشان لو قفلت الصفحة ترجع تتابعها)
export type FilmJob = { kind: "plan" | "character" | "keyframe" | "voice" | "clip"; target: string; jobId: string };

export type FilmProps = {
  // الفكرة
  brief: string;
  videoType: string;
  dialect: string;
  targetSeconds: number;
  uploads: FilmUpload[];
  // اللي Claude بيكتبه
  title: string;
  style: string; // الهوية البصرية للفيلم كله (إنجليزي)
  characters: FilmCharacter[];
  shots: FilmShot[];
  // الصوت
  voiceProvider: string; // elevenlabs | windows | recorded | none
  voiceId: string;
  voiceModel: string;
  recordedVoice: string;
  recordedCaptions: Caption[];
  voiceVolume: number;
  music: string;
  musicVolume: number;
  // الشكل
  format: string;
  quality: string; // cinematic | balanced
  font: string;
  captions: string; // on | off
  captionStyle: string;
  transition: string; // cut | fade
  grade: string; // none | warm | cool | teal-orange | mono
  grain: string; // on | off
  letterbox: string; // on | off
  textColor: string;
  accent: string;
  logo: string;
  cta: string;
  ctaSub: string;
  jobs: FilmJob[];
  auto: boolean; // "اعمل كل حاجة" شغال (بيكمل حتى لو الصفحة اتقفلت واتفتحت)
  autoBatch: string; // رقم دفعة التصدير لما الوضع الأوتوماتيك يخلص
};

export const emptyShot = (id: string): FilmShot => ({
  id,
  duration: 5,
  purpose: "",
  imagePrompt: "",
  motionPrompt: "",
  characters: [],
  refUploads: [],
  sourceUpload: -1,
  voiceLine: "",
  onScreenText: "",
  keyframe: "",
  clip: "",
  clipDuration: 0,
  voice: "",
  voiceDuration: 0,
  words: [],
});
