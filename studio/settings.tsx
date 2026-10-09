// ربط شاشة الإعدادات بباقي الاستوديو:
// - أي مكان محتاج مفتاح يقدر يفتح الإعدادات بزرار
// - لما المفاتيح تتغير، كل الأدوات بتعيد قراية حالتها من غير ما تعمل refresh
import { useEffect, useState, type ReactNode } from "react";

const OPEN = "montag:open-settings";
const CHANGED = "montag:keys-changed";

export const openSettings = () => window.dispatchEvent(new Event(OPEN));
export const keysChanged = () => window.dispatchEvent(new Event(CHANGED));

export const useOnOpenSettings = (fn: () => void) => {
  useEffect(() => {
    window.addEventListener(OPEN, fn);
    return () => window.removeEventListener(OPEN, fn);
  }, [fn]);
};

// رقم بيزيد كل ما المفاتيح تتغير (حطه في dependencies بتاعة أي useEffect بيجيب حالة الخدمات)
export const useKeysVersion = () => {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, []);
  return v;
};

export const KeyHint: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="hint">
    {children}{" "}
    <button type="button" className="link-btn" onClick={openSettings}>
      ⚙️ افتح الإعدادات
    </button>
  </div>
);
