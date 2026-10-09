// كارت التصدير: الصيغة والجودة والصورة المصغرة، وطابور التصدير بكل الدفعات
import { useEffect, useState } from "react";

export type ExportSettings = { format: "mp4" | "webm" | "gif"; quality: "high" | "draft"; thumbnail: boolean; loudness: boolean };
export type QueueItem = { videoId: string; name: string; props: Record<string, unknown>; caption?: string };

type BatchItem = { name: string; status: "pending" | "rendering" | "done" | "error" | "canceled"; progress: number; file: string | null; thumb: string | null; error: string | null };
type Batch = { id: string; name: string; createdAt: number; settings: ExportSettings; folder: string; status: string; done: number; total: number; items: BatchItem[] };
type ExportFile = { name: string; url: string; time: number };

export const defaultExportSettings: ExportSettings = { format: "mp4", quality: "high", thumbnail: false, loudness: true };

const itemText: Record<BatchItem["status"], string> = {
  pending: "مستني دوره",
  rendering: "بيتصدر…",
  done: "جاهز ✅",
  error: "فشل ❌",
  canceled: "اتلغى",
};

// بنبعت دفعة للطابور (فيديو واحد أو فيديوهات كتير من شيت)
export const sendToQueue = async (name: string, items: QueueItem[], settings: ExportSettings) => {
  const r = await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, items, settings }),
  });
  const data = await r.json().catch(() => ({ error: "سيرفر التصدير مش شغال. شغّل npm run studio" }));
  if (!r.ok) throw new Error(data.error);
  return data as Batch;
};

export const ExportSettingsFields: React.FC<{ value: ExportSettings; onChange: (v: ExportSettings) => void }> = ({ value, onChange }) => (
  <>
    <div className="row-2">
      <label className="field">
        <span>الصيغة</span>
        <select value={value.format} onChange={(e) => onChange({ ...value, format: e.target.value as ExportSettings["format"] })}>
          <option value="mp4">MP4 (للنشر في أي مكان)</option>
          <option value="webm">WebM (للمواقع)</option>
          <option value="gif">GIF (من غير صوت)</option>
        </select>
      </label>
      <label className="field">
        <span>الجودة</span>
        <select value={value.quality} onChange={(e) => onChange({ ...value, quality: e.target.value as ExportSettings["quality"] })}>
          <option value="high">عالية (النهائي)</option>
          <option value="draft">مسودة سريعة (للمراجعة)</option>
        </select>
      </label>
    </div>
    <label className="check">
      <input type="checkbox" checked={value.thumbnail} onChange={(e) => onChange({ ...value, thumbnail: e.target.checked })} />
      اعمل صورة مصغرة (Thumbnail) مع كل فيديو
    </label>
    <label className="check">
      <input type="checkbox" checked={value.loudness} onChange={(e) => onChange({ ...value, loudness: e.target.checked })} />
      اظبط علو الصوت على معيار المنصات (‎-14 LUFS)
    </label>
  </>
);

export const ExportCard: React.FC<{
  settings: ExportSettings;
  onSettings: (v: ExportSettings) => void;
  current: QueueItem;
}> = ({ settings, onSettings, current }) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exportsList, setExportsList] = useState<ExportFile[]>([]);

  const refresh = () =>
    fetch("/api/queue")
      .then((r) => r.json())
      .then(setBatches)
      .catch(() => {});
  const refreshExports = () =>
    fetch("/api/exports")
      .then((r) => r.json())
      .then(setExportsList)
      .catch(() => {});

  // بنسأل السيرفر كل ثانية لو فيه حاجة شغالة، وكل 5 ثواني لو مفيش
  const running = batches.some((b) => b.status === "running");
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, running ? 1000 : 5000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    refreshExports();
  }, [running]);

  const exportCurrent = async () => {
    setError(null);
    try {
      await sendToQueue(current.name, [current], settings);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const post = (url: string) => fetch(url, { method: "POST" }).then(refresh);

  return (
    <section className="card">
      <h2>التصدير</h2>
      <ExportSettingsFields value={settings} onChange={onSettings} />
      <button className="btn-primary" onClick={exportCurrent}>
        ⬇ صدّر الفيديو ده
      </button>
      {error && <div className="error">{error}</div>}

      {batches.length > 0 && (
        <>
          <h3>طابور التصدير</h3>
          <div className="queue">
            {batches.slice(0, 6).map((b) => {
              const active = b.items.find((i) => i.status === "rendering");
              const pct = b.total ? Math.round(((b.done + (active?.progress ?? 0)) / b.total) * 100) : 0;
              const single = b.total === 1 ? b.items[0] : null;
              return (
                <div key={b.id} className="batch">
                  <div className="batch-head">
                    <b>{b.name}</b>
                    <small>
                      {b.settings.format.toUpperCase()}
                      {b.settings.quality === "draft" && " · مسودة"} · {b.done}/{b.total}
                    </small>
                  </div>
                  {b.status === "running" && (
                    <>
                      <div className="bar">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                      <small className="hint">{active ? `بيتصدر: ${active.name} (${Math.round(active.progress * 100)}٪)` : "بيجهّز…"}</small>
                    </>
                  )}
                  {single ? (
                    <div className="batch-single">
                      {single.thumb && <img src={single.thumb} alt="" className="batch-thumb" />}
                      <span>{itemText[single.status]}</span>
                      {single.file && (
                        <a className="btn-small" href={single.file} download>
                          حمّل
                        </a>
                      )}
                    </div>
                  ) : (
                    <details>
                      <summary className="hint">
                        {b.total} فيديو{b.items.some((i) => i.status === "error") && " · فيه أخطاء"}
                      </summary>
                      <ul className="batch-items">
                        {b.items.map((i, n) => (
                          <li key={n}>
                            {i.file ? (
                              <a href={i.file} target="_blank" rel="noreferrer">
                                {i.name}
                              </a>
                            ) : (
                              <span>{i.name}</span>
                            )}
                            <small title={i.error ?? ""}>{i.status === "rendering" ? `${Math.round(i.progress * 100)}٪` : itemText[i.status]}</small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {single?.error && <div className="error">{single.error}</div>}
                  <div className="brand-buttons">
                    {b.status === "running" && (
                      <button type="button" className="btn-small" onClick={() => post(`/api/queue/${b.id}/cancel`)}>
                        ⏹ إلغاء
                      </button>
                    )}
                    {b.done > 0 && (
                      <button type="button" className="btn-small" onClick={() => post(`/api/queue/${b.id}/open`)}>
                        📂 افتح الفولدر
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {exportsList.length > 0 && (
        <details>
          <summary className="hint">كل اللي اتصدر قبل كده ({exportsList.length})</summary>
          <ul className="exports">
            {exportsList.slice(0, 30).map((f) => (
              <li key={f.name}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                <span>{new Date(f.time).toLocaleString("ar-EG")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
