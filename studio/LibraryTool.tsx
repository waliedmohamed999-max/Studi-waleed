// "الملفات": كل الصور والفيديوهات والصوتيات اللي عندك في مكان واحد
// بحث، فلتر بالنوع والفولدر، اسم واضح لكل ملف، رفع كذا ملف مرة واحدة (أو اسحبهم وارميهم)، ومسح
import { useEffect, useMemo, useRef, useState } from "react";

type Asset = { path: string; name: string; kind: "image" | "audio" | "video"; folder: string; time: number; size: number; label: string; group: string };
const kinds = [
  { value: "", label: "الكل" },
  { value: "video", label: "🎬 فيديو" },
  { value: "image", label: "🖼️ صور" },
  { value: "audio", label: "🎵 صوت" },
];
const niceName = (a: Asset) => a.label || a.name.replace(/^[a-z0-9]+-(?=.)/, "");
const mb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} ميجا` : `${Math.max(1, Math.round(n / 1024))} كيلو`);

export const LibraryTool: React.FC = () => {
  const [list, setList] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [group, setGroup] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/assets")
      .then((r) => r.json())
      .then(setList)
      .catch(() => setError("السيرفر مش بيرد"));
  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => [...new Set(list.map((a) => a.group).filter(Boolean))].sort(), [list]);
  const shown = list.filter(
    (a) => (!kind || a.kind === kind) && (!group || (group === "demo" ? a.folder === "demo" : a.group === group)) && (!q || `${niceName(a)} ${a.name} ${a.group}`.toLowerCase().includes(q.toLowerCase())),
  );

  const upload = async (files: FileList | File[]) => {
    setError(null);
    const arr = [...files];
    for (const [i, f] of arr.entries()) {
      setBusy(`بيرفع ${i + 1} من ${arr.length}: ${f.name}`);
      const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(`${f.name}: ${data.error ?? "الرفع فشل"}`);
        continue;
      }
      // الاسم الأصلي بالعربي بيتحفظ كاسم للملف، وبيدخل الفولدر المختار
      await fetch("/api/library/meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: data.path, label: f.name.replace(/\.[^.]+$/, ""), group: group && group !== "demo" ? group : "" }),
      });
    }
    setBusy(null);
    load();
  };

  const saveMeta = async (a: Asset, patch: Partial<Pick<Asset, "label" | "group">>) => {
    setList((l) => l.map((x) => (x.path === a.path ? { ...x, ...patch } : x)));
    await fetch("/api/library/meta", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: a.path, label: patch.label ?? a.label, group: patch.group ?? a.group }) });
  };

  const remove = async (a: Asset) => {
    if (!confirm(`تمسح "${niceName(a)}" نهائي؟\nلو مستخدم في مشروع، هيختفي منه.`)) return;
    const r = await fetch(`/api/library?path=${encodeURIComponent(a.path)}`, { method: "DELETE" });
    if (!r.ok) setError((await r.json()).error);
    load();
  };

  return (
    <div
      className={`card library ${over ? "drop" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="library-top">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر باسم الملف…" aria-label="بحث" />
        <button type="button" className="btn-small btn-ai" onClick={() => input.current?.click()} disabled={!!busy}>
          ⬆ ارفع ملفات
        </button>
        <input ref={input} type="file" multiple hidden accept="image/*,video/*,audio/*" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      <div className="seg-toggle" role="radiogroup" aria-label="النوع">
        {kinds.map((k) => (
          <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} className={kind === k.value ? "on" : ""} onClick={() => setKind(k.value)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="library-groups">
        <button type="button" className={`chip ${!group ? "on" : ""}`} onClick={() => setGroup("")}>
          كل الفولدرات
        </button>
        {groups.map((g) => (
          <button key={g} type="button" className={`chip ${group === g ? "on" : ""}`} onClick={() => setGroup(g)}>
            📁 {g}
          </button>
        ))}
        <button type="button" className={`chip ${group === "demo" ? "on" : ""}`} onClick={() => setGroup("demo")}>
          ملفات التجربة
        </button>
      </div>
      <div className="hint">اسحب ملفات من الكمبيوتر وارميها هنا. {group && group !== "demo" ? `هتتحط في فولدر "${group}".` : ""}</div>
      {busy && <div className="job-status">⏳ {busy}</div>}
      {error && <div className="error">{error}</div>}

      <div className="library-grid-all">
        {shown.map((a) => (
          <div key={a.path} className="lib-item">
            <div className="lib-thumb">
              {a.kind === "image" ? (
                <img src={`/${a.path}`} alt="" loading="lazy" />
              ) : a.kind === "video" ? (
                <video src={`/${a.path}#t=0.5`} muted preload="metadata" />
              ) : (
                <span aria-hidden="true">🎵</span>
              )}
            </div>
            {edit === a.path ? (
              <div className="lib-edit">
                <input type="text" defaultValue={niceName(a)} aria-label="الاسم" onBlur={(e) => saveMeta(a, { label: e.target.value })} />
                <input type="text" defaultValue={a.group} aria-label="الفولدر" placeholder="الفولدر (مثلًا: منتجات)" list="lib-groups" onBlur={(e) => saveMeta(a, { group: e.target.value.trim() })} />
                <button type="button" className="btn-small" onClick={() => setEdit(null)}>
                  تمام
                </button>
              </div>
            ) : (
              <div className="lib-info">
                <b dir="auto" title={a.name}>
                  {niceName(a)}
                </b>
                <small>
                  {mb(a.size)}
                  {a.group && ` · 📁 ${a.group}`}
                </small>
                {a.kind === "audio" && <audio src={`/${a.path}`} controls preload="none" className="asset-audio" />}
                {a.folder === "uploads" && (
                  <span className="lib-actions">
                    <button type="button" className="link-btn" onClick={() => setEdit(a.path)}>
                      اسم وفولدر
                    </button>
                    <button type="button" className="link-btn danger" onClick={() => remove(a)}>
                      امسح
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!shown.length && <div className="empty-note">مفيش ملفات هنا.</div>}
      <datalist id="lib-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </div>
  );
};
