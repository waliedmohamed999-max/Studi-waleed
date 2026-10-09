// التايملاين: مسارات (فيديو، صوت، كابشن) زي برامج المونتاج
// - المسطرة: اضغط أو اسحب عليها عشان تتنقل في الفيديو
// - البلوكات: اضغط تختار، واسحب الطرف تغير المدة، واسحب البلوك كله ترتبه (في المسارات اللي بتسمح بكده)
// - الزووم بيكبّر التايملاين، وبتعمل scroll بالعرض
import { useRef, useState, type ReactNode } from "react";
import { IconZoomIn } from "./icons";

export type TlBlock = {
  id: string;
  start: number; // فريم
  frames: number;
  label: string;
  color: string;
  thumb?: string;
  selected?: boolean;
  durationSec?: number; // للمسارات اللي بتتغير مدتها
};

export type TlTrack = {
  id: string;
  label: string;
  icon: ReactNode;
  kind: "video" | "audio" | "text";
  blocks: TlBlock[];
  onBlockClick?: (id: string, start: number) => void;
  // لو موجود: البلوكات بتتسحب وتتطول وتتقصر
  editable?: {
    onResize: (id: string, seconds: number) => void;
    onReorder: (from: number, to: number) => void;
    min: number;
    max: number;
    snap: number;
  };
};

export const timecode = (frame: number, fps: number) => {
  const f = Math.max(0, Math.round(frame));
  const totalSec = Math.floor(f / fps);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}:${pad(f % fps)}`;
};

export const Timeline: React.FC<{
  tracks: TlTrack[];
  total: number;
  fps: number;
  frame: number;
  onSeek: (frame: number) => void;
}> = ({ tracks, total, fps, frame, onSeek }) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ track: string; from: number; over: number | null } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);

  const pct = (f: number) => `${(f / Math.max(1, total)) * 100}%`;
  const frameAt = (clientX: number) => {
    const r = innerRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total);
  };

  // السحب على المسطرة = تنقل في الفيديو
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    onSeek(frameAt(e.clientX));
    const move = (ev: PointerEvent) => onSeek(frameAt(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent, track: TlTrack, block: TlBlock) => {
    if (!track.editable || block.durationSec === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const r = innerRef.current?.getBoundingClientRect();
    if (!r) return;
    const { min, max, snap, onResize } = track.editable;
    // بنثبت النسبة وقت بداية السحب، لأن طول التايملاين كله بيتغير وانت بتسحب
    const framesPerPx = total / r.width;
    const startX = e.clientX;
    const orig = block.durationSec;
    let last = orig;
    setResizing(block.id);
    const move = (ev: PointerEvent) => {
      const next = Math.min(max, Math.max(min, Math.round((orig + ((ev.clientX - startX) * framesPerPx) / fps) / snap) * snap));
      if (next !== last) {
        last = next;
        onResize(block.id, next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // علامات الثواني على المسطرة (بتكتر مع الزووم)
  const seconds = total / fps;
  const visible = seconds / zoom;
  const step = visible > 60 ? 10 : visible > 25 ? 5 : visible > 10 ? 2 : visible > 4 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step);

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <span className="tl-tc" aria-label="الوقت الحالي">
          {timecode(frame, fps)}
        </span>
        <span className="tl-total">/ {timecode(total, fps)}</span>
        <label className="tl-zoom">
          <IconZoomIn size={15} />
          <span className="sr-only">زووم التايملاين</span>
          <input type="range" dir="ltr" min={1} max={10} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>

      <div className="tl-body">
        {/* أسماء المسارات */}
        <div className="tl-heads">
          <div className="tl-head-ruler" />
          {tracks.map((t) => (
            <div key={t.id} className={`tl-head tl-head-${t.kind}`}>
              {t.icon}
              <span>{t.label}</span>
            </div>
          ))}
        </div>

        {/* المسارات نفسها (من الشمال لليمين زي الوقت) */}
        <div className="tl-scroll" dir="ltr">
          <div className="tl-inner" ref={innerRef} style={{ width: `${zoom * 100}%` }}>
            <div className="tl-ruler" onPointerDown={scrub}>
              {ticks.map((t) => (
                <span key={t} className={`tl-tick ${Number.isInteger(t) ? "" : "minor"}`} style={{ left: pct(t * fps) }}>
                  {Number.isInteger(t) ? `${t}s` : ""}
                </span>
              ))}
            </div>

            {tracks.map((track) => (
              <div
                key={track.id}
                className={`tl-lane tl-lane-${track.kind}`}
                onPointerDown={(e) => e.target === e.currentTarget && onSeek(frameAt(e.clientX))}
              >
                {track.blocks.map((b, i) => {
                  const draggable = !!track.editable && !resizing;
                  const isOver = drag?.track === track.id && drag.over === i && drag.from !== i;
                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.label} (${(b.frames / fps).toFixed(1)} ثانية)`}
                      aria-pressed={b.selected}
                      className={`tl-block ${b.selected ? "selected" : ""} ${isOver ? "drag-over" : ""} ${resizing === b.id ? "resizing" : ""}`}
                      style={{ left: pct(b.start), width: pct(b.frames), "--block-color": b.color } as React.CSSProperties}
                      title={`${b.label} · ${(b.frames / fps).toFixed(1)}s`}
                      draggable={draggable}
                      onDragStart={(e) => {
                        setDrag({ track: track.id, from: i, over: null });
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (drag?.track !== track.id) return;
                        e.preventDefault();
                        setDrag({ ...drag, over: i });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag?.track === track.id && drag.from !== i) track.editable?.onReorder(drag.from, i);
                        setDrag(null);
                      }}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => track.onBlockClick?.(b.id, b.start)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          track.onBlockClick?.(b.id, b.start);
                        }
                      }}
                    >
                      {b.thumb && <img src={b.thumb} alt="" className="tl-thumb" draggable={false} />}
                      <span className="tl-label" dir="auto">
                        {b.label}
                      </span>
                      {track.editable && b.durationSec !== undefined && (
                        <span
                          className="tl-handle"
                          title="اسحب عشان تغير المدة"
                          aria-hidden="true"
                          draggable={false}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onPointerDown={(e) => startResize(e, track, b)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="tl-playhead" style={{ left: pct(frame) }}>
              <span className="tl-playhead-cap" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
