// كارت "فيديوهات كتير من شيت": كل سطر في Excel/CSV = فيديو
import { useMemo, useRef, useState } from "react";
import type { VideoDef } from "../src/compositions";
import { applyRow, directFields, findPlaceholders, missingColumns, readSheetFile, rowName, sampleCsv, type Sheet } from "./batch";
import { sendToQueue, type ExportSettings } from "./ExportCard";

export const BatchCard: React.FC<{
  video: VideoDef;
  props: Record<string, unknown>;
  projectName: string;
  settings: ExportSettings;
  previewRow: number | null;
  onPreview: (index: number | null, props: Record<string, unknown> | null) => void;
}> = ({ video, props, projectName, settings, previewRow, onPreview }) => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const placeholders = useMemo(() => findPlaceholders(props), [props]);
  const direct = directFields(video.fields);
  const matchedDirect = sheet ? direct.filter((f) => sheet.headers.includes(f.key) || sheet.headers.includes(f.label)) : [];
  const missing = sheet ? missingColumns(placeholders, sheet.headers) : [];

  const downloadSample = () => {
    const blob = new Blob([sampleCsv([...placeholders], [])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName || "شيت"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const load = async (file: File) => {
    setError(null);
    setSent(null);
    try {
      const s = await readSheetFile(file);
      if (s.rows.length === 0) throw new Error("الشيت مفيهوش سطور بعد أسماء الأعمدة");
      setSheet(s);
      setFileName(file.name);
      onPreview(null, null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportAll = async () => {
    if (!sheet) return;
    setError(null);
    try {
      const items = sheet.rows.map((row, i) => ({ videoId: video.id, name: rowName(row, i), props: applyRow(props, row, video.fields) }));
      await sendToQueue(projectName || "دفعة", items, settings);
      setSent(`اتبعت ${items.length} فيديو للطابور. تابعهم في كارت التصدير تحت 👇`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const preview = (i: number) => {
    if (!sheet) return;
    if (previewRow === i) return onPreview(null, null);
    onPreview(i, applyRow(props, sheet.rows[i], video.fields));
  };

  return (
    <section className="card">
      <h2>📊 فيديوهات كتير من شيت</h2>

      <div className="hint">
        اكتب <code dir="ltr">{"{{اسم_العمود}}"}</code> في أي نص في الفيديو (زي <code dir="ltr">{"{{المنتج}}"}</code> أو <code dir="ltr">{"{{السعر}}"}</code>)، وكل سطر في
        الشيت هيطلّع فيديو بقيمه.
      </div>

      <div className="placeholders">
        {placeholders.size === 0 ? (
          <small className="hint">لسه مفيش متغيرات في الفيديو.</small>
        ) : (
          [...placeholders].map((p) => (
            <span key={p} className={`chip ${sheet && !sheet.headers.includes(p) ? "chip-missing" : ""}`}>
              {p}
            </span>
          ))
        )}
      </div>

      <details>
        <summary className="hint">خانات تقدر تغيرها من الشيت مباشرة</summary>
        <div className="hint">
          لو عملت عمود اسمه زي اسم الخانة بالظبط، قيمته هتتحط فيها، زي اللوجو أو الألوان. والصور بتتكتب بمسارها، زي <code dir="ltr">uploads/x.png</code>. وفي القوايم
          افصل بين النقط بـ <code>|</code>.
        </div>
        <div className="placeholders">
          {direct.map((f) => (
            <span key={f.key} className="chip chip-soft" title={f.key}>
              {f.label}
            </span>
          ))}
        </div>
      </details>

      <div className="brand-buttons">
        <button type="button" className="btn-small" onClick={downloadSample}>
          ⬇ نزّل شيت فاضي
        </button>
        <button type="button" className="btn-small" onClick={() => fileRef.current?.click()}>
          ⬆ ارفع الشيت (Excel أو CSV)
        </button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      </div>
      {error && <div className="error">{error}</div>}

      {sheet && (
        <>
          <div className="hint">
            <b>{fileName}</b>: {sheet.rows.length} سطر · {sheet.headers.length} عمود
            {matchedDirect.length > 0 && ` · بيغيّر: ${matchedDirect.map((f) => f.label).join("، ")}`}
          </div>
          {missing.length > 0 && <div className="error">أعمدة ناقصة في الشيت: {missing.join("، ")} (هتفضل زي ما هي في الفيديو)</div>}

          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>#</th>
                  {sheet.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={previewRow === i ? "selected" : ""} onClick={() => preview(i)} title="اضغط عشان تعاين السطر ده">
                    <td>{i + 1}</td>
                    {sheet.headers.map((h) => (
                      <td key={h}>{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.rows.length > 50 && <small className="hint">بيظهر أول 50 سطر بس، بس كله هيتصدر.</small>}

          <button type="button" className="btn-primary" onClick={exportAll}>
            🚀 صدّر {sheet.rows.length} فيديو ({settings.format.toUpperCase()}
            {settings.quality === "draft" ? "، مسودة" : ""})
          </button>
          {sent && <div className="flash">{sent}</div>}
        </>
      )}
    </section>
  );
};
