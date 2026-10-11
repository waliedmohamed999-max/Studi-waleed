// تعديل الصوت: المقاطع الصوتية في الفيديو (مكانها، وجزءها من الملف، ومدتها، وصوتها) + علّي ووطّي الصوت في أماكن
import { useEffect, useRef, useState } from "react";
import { uid } from "../src/scenes/defs";
import { clipMs, type SoundFxItem, type VolRange } from "../src/lib/soundFx";

const s1 = (ms: number) => (ms / 1000).toFixed(1);
const toMs = (v: string) => Math.max(0, Math.round(Number(v) * 1000) || 0);
const fileName = (p: string) => p.split("/").pop()?.replace(/^[a-z0-9]+-(?=.)/, "") ?? p;

// ===== فترات الصوت: من لحظة للحظة الصوت بيبقى نسبة من العادي =====
export const RangesEditor: React.FC<{
  ranges: VolRange[];
  onChange: (next: VolRange[]) => void;
  playheadMs: number; // مكان المؤشر بنفس توقيت الفترات
  maxMs?: number;
  onSeekMs: (ms: number) => void;
}> = ({ ranges, onChange, playheadMs, maxMs, onSeekMs }) => {
  const add = (volume: number) => {
    const from = Math.max(0, Math.round(playheadMs));
    const to = Math.round(Math.min(maxMs ?? Infinity, from + 3000));
    if (to - from < 300) return;
    onChange([...ranges, { id: uid(), fromMs: from, toMs: to, volume }].sort((a, b) => a.fromMs - b.fromMs));
  };
  const set = (id: string, patch: Partial<VolRange>) =>
    onChange(ranges.map((r) => (r.id === id ? { ...r, ...patch, toMs: Math.max((patch.fromMs ?? r.fromMs) + 300, patch.toMs ?? r.toMs) } : r)));
  return (
    <div className="vol-ranges">
      {ranges.map((r) => (
        <div key={r.id} className={`vol-range ${r.volume >= 100 ? "up" : "down"}`}>
          <div className="vol-range-times">
            <label>
              <span>من</span>
              <input type="number" dir="ltr" step={0.1} min={0} value={s1(r.fromMs)} onChange={(e) => set(r.id, { fromMs: toMs(e.target.value) })} />
            </label>
            <label>
              <span>لـ</span>
              <input type="number" dir="ltr" step={0.1} min={0} value={s1(r.toMs)} onChange={(e) => set(r.id, { toMs: toMs(e.target.value) })} />
            </label>
            <button type="button" className="link-btn" onClick={() => onSeekMs(r.fromMs)}>
              اسمع
            </button>
            <button type="button" className="btn-small btn-ghost" aria-label="امسح الفترة" onClick={() => onChange(ranges.filter((x) => x.id !== r.id))}>
              ✕
            </button>
          </div>
          <label className="vol-range-level">
            <span>{r.volume === 0 ? "ساكت" : r.volume >= 100 ? `أعلى: ${r.volume}%` : `أوطى: ${r.volume}%`}</span>
            <input type="range" dir="ltr" min={0} max={200} step={5} value={r.volume} onChange={(e) => set(r.id, { volume: Number(e.target.value) })} />
          </label>
        </div>
      ))}
      <div className="vol-range-add">
        <button type="button" className="btn-small" onClick={() => add(160)}>
          🔊 علّي هنا
        </button>
        <button type="button" className="btn-small" onClick={() => add(40)}>
          🔉 وطّي هنا
        </button>
        <button type="button" className="btn-small" onClick={() => add(0)}>
          🔇 اسكت هنا
        </button>
      </div>
      <div className="hint">الفترة بتبدأ عند المؤشر ولمدة 3 ثواني، وتقدر تغيّر البداية والنهاية والنسبة. 100% = الصوت العادي.</div>
    </div>
  );
};

// ===== مقطع صوتي واحد =====
const ClipEditor: React.FC<{ clip: SoundFxItem; onChange: (patch: Partial<SoundFxItem>) => void; playheadMs: number; onSeekMs: (ms: number) => void }> = ({ clip, onChange, playheadMs, onSeekMs }) => {
  const len = clipMs(clip);
  const maxTrim = clip.fileMs ? Math.max(0, clip.fileMs - 300) : undefined;
  return (
    <div className="clip-editor">
      <div className="row-2">
        <label className="field">
          <span>بيبدأ في الفيديو عند (ثانية)</span>
          <div className="clip-at">
            <input type="number" dir="ltr" step={0.1} min={0} value={s1(clip.atMs)} onChange={(e) => onChange({ atMs: toMs(e.target.value) })} />
            <button type="button" className="btn-small" onClick={() => onChange({ atMs: Math.round(playheadMs) })} title="حطه عند مكان المؤشر">
              ⤓ عند المؤشر
            </button>
          </div>
        </label>
        <label className="field">
          <span>الصوت: {clip.volume}%</span>
          <input type="range" dir="ltr" min={0} max={200} step={5} value={clip.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>يبدأ من جوه الملف (ثانية)</span>
          <input type="number" dir="ltr" step={0.1} min={0} max={maxTrim !== undefined ? maxTrim / 1000 : undefined} value={s1(clip.trimMs ?? 0)} onChange={(e) => onChange({ trimMs: Math.min(maxTrim ?? Infinity, toMs(e.target.value)) })} />
        </label>
        <label className="field">
          <span>المدة (ثانية){clip.durMs === undefined ? " · لآخر الملف" : ""}</span>
          <input
            type="number"
            dir="ltr"
            step={0.1}
            min={0.3}
            placeholder={len !== undefined ? s1(len) : "لآخر الملف"}
            value={clip.durMs !== undefined ? s1(clip.durMs) : ""}
            onChange={(e) => onChange({ durMs: e.target.value === "" ? undefined : Math.max(300, toMs(e.target.value)) })}
          />
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>يدخل بالتدريج (ثانية)</span>
          <input type="number" dir="ltr" step={0.1} min={0} value={s1(clip.fadeInMs ?? 0)} onChange={(e) => onChange({ fadeInMs: toMs(e.target.value) || undefined })} />
        </label>
        <label className="field">
          <span>يخرج بالتدريج (ثانية)</span>
          <input type="number" dir="ltr" step={0.1} min={0} value={s1(clip.fadeOutMs ?? 0)} onChange={(e) => onChange({ fadeOutMs: toMs(e.target.value) || undefined })} />
        </label>
      </div>
      <span className="film-sub">علّي ووطّي جوه المقطع (الوقت من أول المقطع)</span>
      <RangesEditor
        ranges={clip.ranges ?? []}
        onChange={(ranges) => onChange({ ranges })}
        playheadMs={Math.max(0, playheadMs - clip.atMs)}
        maxMs={len}
        onSeekMs={(ms) => onSeekMs(clip.atMs + ms)}
      />
    </div>
  );
};

// ===== كل المقاطع الصوتية في الفيديو =====
export const ClipList: React.FC<{
  clips: SoundFxItem[];
  onChange: (next: SoundFxItem[]) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  playheadMs: number;
  onSeekMs: (ms: number) => void;
}> = ({ clips, onChange, selected, onSelect, playheadMs, onSeekMs }) => {
  const patch = (id: string, p: Partial<SoundFxItem>) => onChange(clips.map((x) => (x.id === id ? { ...x, ...p } : x)));
  // المقطع اللي اتختار (من التايملاين مثلًا) بيظهر قدامك على طول
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) listRef.current?.querySelector(".clip-row.open")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);
  const duplicate = (c: SoundFxItem) => {
    const copy = { ...c, id: uid(), atMs: Math.round(playheadMs), ranges: c.ranges?.map((r) => ({ ...r, id: uid() })) };
    onChange([...clips, copy]);
    onSelect(copy.id);
  };
  return (
    <div className="clip-list" ref={listRef}>
      {[...clips]
        .sort((a, b) => a.atMs - b.atMs)
        .map((c) => {
          const open = selected === c.id;
          const len = clipMs(c);
          return (
            <div key={c.id} className={`clip-row ${open ? "open" : ""}`}>
              <div className="clip-head">
                <button type="button" className="clip-title" onClick={() => (onSelect(open ? null : c.id), onSeekMs(c.atMs))} aria-expanded={open}>
                  <b dir="auto">{c.label || fileName(c.src)}</b>
                  <small>
                    {s1(c.atMs)}ث{len !== undefined ? ` ← ${s1(c.atMs + len)}ث` : ""} · {c.volume}%{(c.ranges ?? []).length ? ` · ${c.ranges!.length} فترة` : ""}
                  </small>
                </button>
                <button type="button" className="btn-small btn-ghost" onClick={() => duplicate(c)} title="نسخة منه عند المؤشر">
                  ⧉
                </button>
                <button type="button" className="btn-small btn-ghost" aria-label="امسح المقطع" onClick={() => (onChange(clips.filter((x) => x.id !== c.id)), open && onSelect(null))}>
                  ✕
                </button>
              </div>
              {open && <ClipEditor clip={c} onChange={(p) => patch(c.id, p)} playheadMs={playheadMs} onSeekMs={onSeekMs} />}
            </div>
          );
        })}
      <div className="hint">اسحب أي مقطع على التايملاين عشان تغيّر مكانه، أو اضغط عليه عشان تعدّله.</div>
    </div>
  );
};

// ===== علّي ووطّي المزيكا أو صوت الفيديو في أماكن =====
export const TrackRanges: React.FC<{
  music: VolRange[] | null; // null = القالب مفيهوش المسار ده أو مفيش مزيكا
  media: VolRange[] | null;
  onChange: (kind: "music" | "media", next: VolRange[]) => void;
  playheadMs: number;
  totalMs: number;
  onSeekMs: (ms: number) => void;
}> = ({ music, media, onChange, playheadMs, totalMs, onSeekMs }) => {
  const options = [media && { kind: "media" as const, label: "🎙 صوت الفيديو", list: media }, music && { kind: "music" as const, label: "🎵 المزيكا", list: music }].filter(Boolean) as {
    kind: "music" | "media";
    label: string;
    list: VolRange[];
  }[];
  const [kind, setKind] = useState<"music" | "media">(options[0]?.kind ?? "media");
  if (!options.length) return null;
  const cur = options.find((o) => o.kind === kind) ?? options[0];
  return (
    <details className="fx-list track-ranges" open>
      <summary>📈 علّي ووطّي الصوت في أماكن</summary>
      {options.length > 1 && (
        <div className="seg-toggle" role="radiogroup" aria-label="المسار">
          {options.map((o) => (
            <button key={o.kind} type="button" role="radio" aria-checked={cur.kind === o.kind} className={cur.kind === o.kind ? "on" : ""} onClick={() => setKind(o.kind)}>
              {o.label} {o.list.length ? `(${o.list.length})` : ""}
            </button>
          ))}
        </div>
      )}
      <RangesEditor ranges={cur.list} onChange={(next) => onChange(cur.kind, next)} playheadMs={playheadMs} maxMs={totalMs} onSeekMs={onSeekMs} />
    </details>
  );
};
