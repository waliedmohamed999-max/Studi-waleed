// تشغيل عملية طويلة على السيرفر ومتابعتها لحد ما تخلص (الدمج، الدبلجة، شيل الخلفية، المراجعة...)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const runJob = async <T = Record<string, unknown>>(url: string, body: unknown, onStep?: (step: string) => void): Promise<T> => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: "السيرفر مردش" }));
  if (!r.ok || !data.jobId) throw new Error(data.error ?? "حصلت مشكلة");
  for (;;) {
    await sleep(1000);
    const j = await fetch(`/api/film/job/${data.jobId}`).then((x) => x.json());
    if (j.status === "done") return j.result as T;
    if (j.status === "error") throw new Error(j.error);
    if (j.error && !j.status) throw new Error(j.error);
    onStep?.(j.step);
  }
};
