// مسح ملف بأمان
// ملحوظة مهمة: fs.rmSync في Node 24 على الويندوز مبيمسحش الملفات اللي في مسار فيه حروف عربي (زي فولدر "منتاج")
// ومبيطلعش أي خطأ، فبنستخدم unlinkSync اللي شغال صح، مع إعادة المحاولة لو الويندوز لسه ماسك الملف
import fs from "node:fs";

export const removeFile = (file, { retries = 5 } = {}) => {
  for (let i = 0; ; i++) {
    try {
      fs.unlinkSync(file);
      return;
    } catch (e) {
      if (e.code === "ENOENT") return;
      if (i >= retries || !["EBUSY", "EPERM", "EACCES"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
};

// زي removeFile بس مبيوقعش أي حاجة لو فشل (للملفات المؤقتة)
export const tryRemove = (file) => {
  try {
    removeFile(file);
  } catch {}
};
