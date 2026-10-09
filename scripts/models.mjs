// إعدادات موديلات الذكاء الاصطناعي في مكان واحد
// لو موديل اتلغى أو نزل موديل أحسن، غيّر الاسم هنا بس
// الأسعار من صفحات الموديلات الرسمية (9 أكتوبر 2026)، وبنستخدمها عشان نوريك التكلفة قبل ما تولّد. راجعها كل فترة لأنها بتتغير

export const MODELS = {
  image: {
    // Google Nano Banana Pro على fal.ai: صور واقعية جدًا، والـ edit بيقبل صور مرجعية (عشان الشخصيات والمنتجات تفضل ثابتة)
    text: "fal-ai/nano-banana-pro",
    edit: "fal-ai/nano-banana-pro/edit",
    resolution: "2K",
    pricePerImage: 0.15, // 1K/2K (و 4K بالضعف = 0.30)
  },
  video: {
    cinematic: {
      label: "سينمائي (Kling 3 Pro)",
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      imageField: "start_image_url",
      negativePrompt: true, // الموديل ده بيقبل وصف للحاجات اللي منعوزهاش
      pricePerSecond: 0.112, // من غير صوت (بالصوت 0.168)
    },
    balanced: {
      label: "متوازن (Kling O3 Standard)",
      endpoint: "fal-ai/kling-video/o3/standard/image-to-video",
      imageField: "image_url",
      negativePrompt: false,
      pricePerSecond: 0.084, // من غير صوت (بالصوت 0.112)
    },
  },
  // المدة اللي موديلات الفيديو بتقبلها (ثواني صحيحة)
  clipSeconds: { min: 3, max: 15 },
  voice: {
    // eleven_v4 = أطبع وأكتر إحساس، eleven_multilingual_v2 = أثبت في النصوص الطويلة
    models: ["eleven_v4", "eleven_v3", "eleven_multilingual_v2"],
    defaultModel: "eleven_v4",
    // سعر الـ API لكل 1000 حرف لـ eleven_v4 (السعر الأساسي؛ عليه خصم مؤقت لحد 12 أكتوبر)
    pricePer1kChars: 0.08,
  },
};
