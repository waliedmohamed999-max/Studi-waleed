// حركة الشفايف في فيديو (MediaPipe Face Landmarker جوه المتصفح، مجاني)
// بنقيس "فتحة البق" كل 0.2 ثانية، والحركة = قد إيه بتتغير (الكلام = فتح وقفل سريع)
// الناتج: رقم لكل 100ms بوقت الفيديو نفسه، و null لما الوش مش باين
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM = "/api/vendor/mediapipe";
const STEP = 0.2; // ثانية

type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => { faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[]; faceLandmarks?: { x: number; y: number }[][] };
  close: () => void;
};

let shared: Promise<Landmarker> | null = null;
const loadLandmarker = () => {
  shared ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numFaces: 3, outputFaceBlendshapes: true });
    return (await make("GPU").catch(() => make("CPU"))) as unknown as Landmarker;
  })().catch((e) => {
    shared = null;
    throw e;
  });
  return shared;
};

const seekTo = (v: HTMLVideoElement, sec: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = sec;
  });

// الوش الأكبر في الكادر (غالبًا صاحب الكاميرا)
const biggest = (faces: { x: number; y: number }[][]) => {
  let best = -1;
  let area = 0;
  faces.forEach((f, i) => {
    const xs = f.map((p) => p.x);
    const ys = f.map((p) => p.y);
    const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (a > area) {
      area = a;
      best = i;
    }
  });
  return best;
};

export const trackMouth = async (src: string, onProgress: (p: number) => void, stop: { current: boolean }): Promise<(number | null)[]> => {
  const lm = await loadLandmarker();
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = `/${src}`;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("المتصفح مش قادر يفتح الفيديو ده"));
    });
    const dur = video.duration;
    const jaw: (number | null)[] = [];
    for (let t = 0, k = 0; t < dur; t += STEP, k++) {
      if (stop.current) throw new Error("اتلغى");
      await seekTo(video, Math.min(t, dur - 0.05));
      const r = lm.detectForVideo(video, Math.round(t * 1000) + 1);
      const i = biggest(r.faceLandmarks ?? []);
      const score = i >= 0 ? r.faceBlendshapes?.[i]?.categories.find((c) => c.categoryName === "jawOpen")?.score : undefined;
      jaw.push(score === undefined ? null : score);
      if (k % 10 === 0) onProgress(t / dur);
    }
    // الحركة: متوسط التغيير في فتحة البق حوالين كل لحظة (±0.4 ثانية)
    const motion = jaw.map((_, k) => {
      let s = 0;
      let n = 0;
      for (let j = Math.max(1, k - 2); j <= Math.min(jaw.length - 1, k + 2); j++) {
        const a = jaw[j];
        const b = jaw[j - 1];
        if (a === null || b === null) continue;
        s += Math.abs(a - b);
        n++;
      }
      return jaw[k] === null || !n ? null : Math.round((s / n) * 1000) / 1000;
    });
    // كل 0.2 ثانية ← كل 0.1 ثانية (اللي السيرفر بيستخدمه)
    return motion.flatMap((m) => [m, m]);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
};
