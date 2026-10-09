// إيموجي على الكلمات المهمة: اقتراح مجاني من القاموس، أو Claude يختار، وتقدر تعدّل أو تمسح أي واحد
import { useState } from "react";
import type { Caption } from "@remotion/captions";
import { uid } from "../src/scenes/defs";
import { suggestEmojis, type EmojiItem } from "../src/lib/emoji";
import { useAiStatus } from "./ai";

const sec = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export const EmojiTool: React.FC<{
  words: Caption[]; // الكلام بنفس توقيت الإيموجي
  items: EmojiItem[];
  onChange: (items: EmojiItem[]) => void;
  linkWords?: boolean; // نحفظ رقم الكلمة (المونتاج الأوتوماتيك، عشان التوقيت يمشي مع المحاذاة)
  onSeek?: (ms: number) => void;
}> = ({ words, items, onChange, linkWords, onSeek }) => {
  const ai = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const toItems = (picks: { index: number; emoji: string }[]) =>
    picks
      .filter((p) => words[p.index])
      .map((p) => ({ id: uid(), atMs: words[p.index].startMs, emoji: p.emoji, word: words[p.index].text.trim(), ...(linkWords ? { fromWord: p.index } : {}) }));

  const fromDict = () => {
    const picks = suggestEmojis(words);
    onChange(toItems(picks).sort((a, b) => a.atMs - b.atMs));
    setMsg(picks.length ? `اتحط ${picks.length} إيموجي` : "ملقيتش كلمات في القاموس. جرب Claude");
    setTimeout(() => setMsg(null), 3000);
  };

  const fromAi = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/emoji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: words.map((w) => w.text.trim()), max: Math.max(3, Math.round((words.at(-1)?.endMs ?? 0) / 4000)) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      onChange(toItems((data.picks as { word: number; emoji: string }[]).map((p) => ({ index: p.word, emoji: p.emoji }))).sort((a, b) => a.atMs - b.atMs));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="emoji-tool">
      <div className="brand-buttons">
        <button type="button" className="btn-small" onClick={fromDict} disabled={!words.length}>
          😀 اقترح (مجاني)
        </button>
        <button type="button" className="btn-small btn-ai" onClick={fromAi} disabled={!words.length || busy || !ai?.available}>
          ✨ {busy ? "بيختار…" : "Claude يختار"}
        </button>
        {items.length > 0 && (
          <button type="button" className="link-btn" onClick={() => onChange([])}>
            امسح الكل
          </button>
        )}
      </div>
      {msg && <div className="flash">{msg}</div>}
      {items.length > 0 && (
        <ul className="emoji-list">
          {items.map((it) => (
            <li key={it.id}>
              <input
                type="text"
                value={it.emoji}
                aria-label="الإيموجي"
                onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, emoji: e.target.value } : x)))}
              />
              <button type="button" className="link-btn" onClick={() => onSeek?.(it.atMs)} dir="auto">
                {it.word || "…"} <small>{sec(it.atMs)}</small>
              </button>
              <button type="button" className="btn-small btn-ghost" aria-label="امسح" onClick={() => onChange(items.filter((x) => x.id !== it.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
