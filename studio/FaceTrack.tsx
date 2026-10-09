// "تتبع الوش": بيتفرج على الفيديو جوه المتصفح (MediaPipe)، ويحدد مكان الوش كل ربع ثانية
// النتيجة بتتحفظ في المشروع، والكادر والزووم بيمشوا ورا الوش في المعاينة والتصدير
import { useRef, useState } from "react";
import { smoothTrack, type FacePoint } from "../src/autoedit/face";

// موديل كشف الوش من جوجل (بيتحمّل مرة واحدة وبيتخزن في المتصفح)
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
// ملفات wasm بتاعة MediaPipe جاية من السيرفر بتاعنا (من node_modules)
const WASM = "/api/vendor/mediapipe";

type Detector = { detect: (img: HTMLVideoElement) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] }; close: () => void };

const loadDetector = async (): Promise<Detector> => {
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate: "GPU" | "CPU") =>
    FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "IMAGE", minDetectionConfidence: 0.5 });
  // الكارت الشاشة أسرع، ولو مش متاح بنستخدم المعالج
  return (await make("GPU").catch(() => make("CPU"))) as unknown as Detector;
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

export const FaceTrack: React.FC<{ media: string; track: FacePoint[]; onTrack: (track: FacePoint[], size: { width: number; height: number }) => void }> = ({ media, track, onTrack }) => {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const run = async () => {
    setError(null);
    setProgress(0);
    stop.current = false;
    let detector: Detector | null = null;
    const video = document.createElement("video");
    try {
      detector = await loadDetector();
      video.muted = true;
      video.preload = "auto";
      video.src = `/${media}`;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("المتصفح مش قادر يفتح الفيديو ده"));
      });
      const dur = video.duration;
      // الفيديوهات الطويلة: نقطة كل نص ثانية بدل ربع (عشان يخلص أسرع)
      const step = dur > 180 ? 0.5 : 0.25;
      const times: number[] = [];
      const raw: (FacePoint | null)[] = [];
      for (let t = 0; t <= dur; t += step) {
        if (stop.current) throw new Error("اتلغى");
        await seekTo(video, Math.min(t, dur - 0.05));
        const { detections } = detector.detect(video);
        // لو فيه أكتر من وش، بناخد الأكبر والأوضح (غالبًا اللي بيتكلم)
        const best = detections
          .filter((d) => d.boundingBox)
          .sort((a, b) => b.boundingBox!.width * b.boundingBox!.height * (b.categories[0]?.score ?? 0) - a.boundingBox!.width * a.boundingBox!.height * (a.categories[0]?.score ?? 0))[0];
        times.push(Math.round(t * 1000));
        raw.push(
          best?.boundingBox
            ? {
                t: Math.round(t * 1000),
                x: (best.boundingBox.originX + best.boundingBox.width / 2) / video.videoWidth,
                y: (best.boundingBox.originY + best.boundingBox.height / 2) / video.videoHeight,
                s: best.boundingBox.width / video.videoWidth,
              }
            : null,
        );
        setProgress(t / dur);
      }
      const found = raw.filter(Boolean).length;
      if (!found) throw new Error("مفيش وش ظاهر في الفيديو (أو الإضاءة ضعيفة جدًا)");
      onTrack(smoothTrack(raw, times), { width: video.videoWidth, height: video.videoHeight });
    } catch (e) {
      const m = (e as Error).message;
      if (m !== "اتلغى") setError(/fetch|network|Failed/i.test(m) ? "تحميل موديل كشف الوش فشل، اتأكد من النت" : m);
    } finally {
      detector?.close();
      video.removeAttribute("src");
      video.load();
      setProgress(null);
    }
  };

  return (
    <div className="face-track">
      <div className="brand-buttons">
        {progress === null ? (
          <button type="button" className="btn-small btn-ai" onClick={run} disabled={!media}>
            🙂 {track.length ? "تتبع الوش تاني" : "تتبع الوش"}
          </button>
        ) : (
          <>
            <span className="job-status" role="status">
              ⏳ بيتتبع الوش… {Math.round(progress * 100)}٪
            </span>
            <button type="button" className="btn-small" onClick={() => (stop.current = true)}>
              وقّف
            </button>
          </>
        )}
        {track.length > 0 && progress === null && (
          <button type="button" className="link-btn" onClick={() => onTrack([], { width: 0, height: 0 })}>
            امسح التتبع
          </button>
        )}
      </div>
      {track.length > 0 && progress === null && <div className="hint">✓ الكادر والزووم بيمشوا ورا الوش. (تقدر تقفله من الخصائص ← الحركة)</div>}
      {!track.length && progress === null && <div className="hint">مفيد لو صوّرت بالعرض وعايز فيديو طولي: الكادر بيفضل على وشك حتى لو اتحركت. وبيشتغل على جهازك من غير تكلفة.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
