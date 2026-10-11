// "مونتاج احترافي بضغطة": ارفع فيديو بتتكلم فيه + فيديوهات لقطات، والاستوديو يعمل الباقي لوحده
// بيعرف أنهي الفيديو الأساسي (اللي فيه كلام أكتر)، يفرّغ الكلام، يقص السكتات والإمم،
// ويحط أحلى اللقطات (أوضح وأنور وأثبت لحظات) فوق كلامك، ويختار الألوان والزووم والكابشن والمزيكا
import { useState } from "react";
import type { Caption } from "@remotion/captions";
import type { AutoEditProps } from "../src/AutoEditVideo";
import { edlInput } from "../src/AutoEditVideo";
import { buildSegments, cleanTranscript, findRestarts, relinkWords, totalMs, wordIndexMap } from "../src/autoedit/edl";
import { hasOwnMusic, pickMain, planBrolls, proLook, type ExploredVideo } from "../src/autoedit/autopro";
import { uid } from "../src/scenes/defs";
import { AssetPicker } from "./fields";
import { runJob } from "./jobs";
import { resetForMedia } from "./AutoEditExtras";
import { formatForSize } from "../src/lib/formats";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (p: string) => p.split("/").pop()?.replace(/^[a-z0-9]+-(?=.)/, "") ?? p;

// تفريغ الكلام لو Whisper متسطب (وإلا بنكمل من غير كابشن)
const transcribe = async (path: string, onStep: (s: string) => void): Promise<Caption[]> => {
  const w = await fetch("/api/whisper").then((r) => r.json()).catch(() => null);
  if (!w?.installed || !w?.modelReady) return [];
  onStep("بيفرّغ الكلام…");
  const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, language: "ar" }) });
  const { jobId, error } = await r.json();
  if (!jobId) throw new Error(error);
  for (;;) {
    await sleep(1000);
    const j = await fetch(`/api/transcribe/${jobId}`).then((x) => x.json());
    if (j.status === "done") return j.captions as Caption[];
    if (j.status === "error") throw new Error(j.error);
    onStep(`بيفرّغ الكلام… ${Math.round(j.progress * 100)}٪`);
  }
};

export const AutoPro: React.FC<{ p: AutoEditProps; update: (patch: Partial<AutoEditProps>) => void; onDone: () => void }> = ({ p, update, onDone }) => {
  const footage = p.footage ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setReport(null);
    setBusy("بيبدأ…");
    try {
      // 1) بيتفرج على كل الفيديوهات ويقيّم لقطاتها
      const { videos } = await runJob<{ videos: ExploredVideo[] }>("/api/autoedit/explore", { paths: [p.media, ...footage] }, setBusy);
      const { main, footage: shots } = pickMain(videos);

      // 2) الأساسي: لو طلع فيديو تاني هو اللي فيه الكلام، بيتبدلوا
      const base: Partial<AutoEditProps> = main.path === p.media ? {} : { ...resetForMedia(main.path), clips: [] };
      const same = main.path === p.media;
      const words = cleanTranscript((p.words ?? []).length && same ? p.words : await transcribe(main.path, setBusy));
      // الجمل المتعادة بتتقص (لو مفيش قص قديم، من Claude أو منك)
      // الإيموجي والقص واللقطات المربوطة بكلمات بتتنقل مع كلمتها (التنضيف بيغيّر أرقام الكلمات)
      const map = same ? wordIndexMap(p.words ?? [], words) : [];
      const cuts = same && (p.cuts ?? []).length ? relinkWords(p.cuts, map) : findRestarts(words);
      const linked = same
        ? {
            emojis: relinkWords(p.emojis ?? [], map, true),
            emphasis: relinkWords((p.emphasis ?? []) as (typeof p.emphasis[number] & { fromWord?: number; toWord?: number })[], map),
            highlights: relinkWords(p.highlights ?? [], map),
            voiceFixes: relinkWords(p.voiceFixes ?? [], map, true),
          }
        : {};
      // المزيكا القديمة بتفضل بس لو مزيكا فعلًا (مش صوت متنضف أو تعليق صوتي أو تصليح)
      const music = /^uploads\/(clean|fix|tts|dub)-/.test(p.music ?? "") ? "" : p.music;

      // 3) القص + توزيع اللقطات على الكلام
      setBusy("بيركّب اللقطات على كلامك");
      const next = { ...p, ...base, ...linked, media: main.path, mediaDuration: main.durationMs / 1000, speech: main.speech, words, cuts } as AutoEditProps;
      const segments = buildSegments(edlInput({ ...next, range: null }));
      const brolls = planBrolls(segments, shots, () => uid());
      const ownMusic = hasOwnMusic(main.speech, words);
      const look = proLook(main.brightness, words.length > 0, music, ownMusic);

      update({
        ...base,
        media: main.path,
        mediaDuration: main.durationMs / 1000,
        speech: main.speech,
        words,
        cuts,
        ...linked,
        // اللقطات القديمة من فيديوهاتك بتتشال، واللي من Pexels بتفضل
        brolls: [...relinkWords(base.brolls ?? p.brolls ?? [], map).filter((b) => !shots.some((s) => s.path === b.src) && b.src !== main.path), ...brolls],
        footage: shots.map((s) => s.path),
        removeFillers: "on",
        // لو الفيديو الأساسي اتبدل، المقاس بيتبع اتجاهه الجديد
        ...(main.path !== p.media && main.width && main.height ? { format: formatForSize(main.width, main.height) } : {}),
        ...look,
      });

      const usable = shots.reduce((s, v) => s + v.windows.length, 0);
      const secs = (ms: number) => Math.round(ms / 1000);
      setReport(
        [
          `الفيديو الأساسي: ${short(main.path)}${main.path !== p.media ? " (اتبدل لأنه اللي فيه الكلام)" : ""}`,
          `من ${secs(main.durationMs)} ثانية ← ${secs(totalMs(segments))} ثانية بعد قص السكتات${words.length ? " والإمم" : ""}`,
          `${brolls.length} لقطة اتحطت فوق كلامك (من ${usable} لقطة حلوة لقاها)`,
          ownMusic ? "الفيديو فيه مزيكا من الأصل، فمتحطش مزيكا تانية فوقها" : "",
          cuts.filter((c) => c.reason === "إعادة").length ? `${cuts.filter((c) => c.reason === "إعادة").length} جملة متعادة اتشالت` : "",
          ...videos.filter((v) => v.duplicateOf).map((v) => `⚠ ${short(v.path)}: نفس لقطات الفيديو الأساسي، فمتحطش`),
          ...shots.filter((s) => !s.windows.length && !s.duplicateOf).map((s) => `⚠ ${short(s.path)}: مفيهوش لقطات كويسة (غامق أو مهزوز أو مش واضح)`),
          words.length ? "" : "⚠ الكابشن مقفول لأن Whisper مش متسطب (نزّله من خطوة التفريغ)",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setFootage = (list: string[]) => update({ footage: list.filter(Boolean) });

  return (
    <div className="subpanel">
      <div className="hint">ضيف فيديو أو أكتر فيه لقطات (المكان، المنتج، الناس…). الاستوديو هيختار أوضح وأحلى لحظات فيهم ويحطها فوق كلامك، ويقص ويلوّن ويحط كابشن ومزيكا لوحده.</div>
      {footage.map((f, i) => (
        <div key={i} className="row-2">
          <AssetPicker kind="video" value={f} compact onChange={(v) => setFootage(footage.map((x, j) => (j === i ? v : x)))} />
          <button type="button" className="link-btn" onClick={() => setFootage(footage.filter((_, j) => j !== i))}>
            شيل
          </button>
        </div>
      ))}
      <AssetPicker kind="video" value="" compact onChange={(v) => v && setFootage([...footage, v])} />
      <button type="button" className="btn-primary" onClick={run} disabled={!!busy || !p.media}>
        {busy ? `⏳ ${busy}` : "🎬 اعمل مونتاج احترافي بضغطة"}
      </button>
      {report && <pre className="flash autopro-report">{report}</pre>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
