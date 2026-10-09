// الإنتاج بالجملة: شيت Excel/CSV ← فيديو لكل سطر
// الفكرة: اكتب {{اسم_العمود}} في أي نص في الفيديو، وكل سطر في الشيت بيحط قيمته مكانه
import { readSheet } from "read-excel-file/browser";
import type { Field } from "../src/compositions";

export type SheetRow = Record<string, string>;
export type Sheet = { headers: string[]; rows: SheetRow[] };

// عمود اختياري لاسم ملف الفيديو
export const NAME_COLUMNS = ["اسم_الفيديو", "اسم الفيديو", "name", "filename"];

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

// ===== قراءة الشيت =====
// CSV بسيط بيدعم القيم اللي بين علامات تنصيص وفيها فواصل أو سطور جديدة
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // فاصل الأعمدة: , أو ; (Excel العربي ساعات بيستخدم ;)
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const cellText = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

export const readSheetFile = async (file: File): Promise<Sheet> => {
  let grid: unknown[][];
  if (/\.xlsx$/i.test(file.name)) {
    grid = await readSheet(file);
  } else if (/\.(csv|txt)$/i.test(file.name)) {
    grid = parseCsv((await file.text()).replace(/^﻿/, ""));
  } else {
    throw new Error("الملف لازم يكون Excel (.xlsx) أو CSV");
  }
  const [head = [], ...body] = grid;
  const headers = head.map(cellText);
  if (headers.filter(Boolean).length === 0) throw new Error("أول سطر في الشيت لازم يكون أسماء الأعمدة");
  const rows = body
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, cellText(r[i])])) as SheetRow)
    .filter((r) => Object.values(r).some(Boolean)); // نشيل السطور الفاضية
  return { headers, rows };
};

// ===== المتغيرات اللي في الفيديو =====
// بيدور على {{...}} في كل النصوص، حتى جوه المشاهد
export const findPlaceholders = (value: unknown, found = new Set<string>()): Set<string> => {
  if (typeof value === "string") for (const m of value.matchAll(PLACEHOLDER)) found.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => findPlaceholders(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => findPlaceholders(v, found));
  return found;
};

const fillStrings = (value: unknown, row: SheetRow): unknown => {
  if (typeof value === "string") return value.replace(PLACEHOLDER, (all, key) => (key in row ? row[key] : all));
  if (Array.isArray(value)) return value.map((v) => fillStrings(v, row));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillStrings(v, row)]));
  return value;
};

// الخانات اللي ممكن الشيت يغيرها مباشرة لو فيه عمود باسمها (زي اللوجو أو اللون)
const directTypes: Field["type"][] = ["text", "color", "select", "number", "image", "audio", "media", "lines"];
export const directFields = (fields: Field[]) => fields.filter((f) => directTypes.includes(f.type));

const columnFor = (f: Field, row: SheetRow) => [f.key, f.label].find((c) => c in row && row[c] !== "");

// ===== سطر من الشيت ← props الفيديو =====
export const applyRow = (props: Record<string, unknown>, row: SheetRow, fields: Field[]) => {
  const next = fillStrings(props, row) as Record<string, unknown>;
  for (const f of directFields(fields)) {
    const col = columnFor(f, row);
    if (!col) continue;
    const v = row[col];
    if (f.type === "number") next[f.key] = Number(v) || 0;
    else if (f.type === "lines") next[f.key] = v.split("|").map((s) => s.trim()); // النقط بتتفصل بـ |
    else next[f.key] = v;
  }
  return next;
};

export const rowName = (row: SheetRow, index: number) => {
  const col = NAME_COLUMNS.find((c) => row[c]);
  return col ? row[col] : `فيديو ${index + 1}`;
};

// المتغيرات اللي ملهاش عمود في الشيت
export const missingColumns = (placeholders: Set<string>, headers: string[]) => [...placeholders].filter((p) => !headers.includes(p));

// ===== شيت فاضي للتحميل (CSV بيفتح في Excel والعربي سليم) =====
export const sampleCsv = (placeholders: string[], extra: string[]) => {
  const headers = ["اسم_الفيديو", ...placeholders, ...extra];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const example = headers.map((h, i) => (i === 0 ? "فيديو 1" : ""));
  return "﻿" + [headers, example].map((r) => r.map(esc).join(",")).join("\r\n");
};
