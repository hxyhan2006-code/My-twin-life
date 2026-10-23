// ติดตามค่าใช้จ่าย AI (เป็นดอลลาร์) รายวัน/รายเดือน เทียบกับงบที่ตั้งไว้
// ตัวเลขมาจากราคาที่ OpenRouter ส่งกลับมากับทุกคำตอบ (usage.cost) · ถ้าไม่ส่งมา จะลองคำนวณจากราคาต่อโทเคนของโมเดล

import { kvGet, kvSet } from './db.js';

export const DEFAULTS = { budgetDay: 1, budgetMonth: 5, rate: 33 };
const KEEP_DAYS = 400;

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// รวมยอดวันนี้/เดือนนี้จาก days = { 'YYYY-MM-DD': {usd, n, input, output, unknown} }
export function summarize(days, now = new Date()) {
  const dk = dayKey(now);
  const mk = monthKey(now);
  const zero = () => ({ usd: 0, n: 0, input: 0, output: 0, unknown: 0 });
  const day = zero();
  const month = zero();
  for (const [k, v] of Object.entries(days || {})) {
    for (const [target, hit] of [[day, k === dk], [month, k.startsWith(mk)]]) {
      if (!hit) continue;
      target.usd += v.usd || 0;
      target.n += v.n || 0;
      target.input += v.input || 0;
      target.output += v.output || 0;
      target.unknown += v.unknown || 0;
    }
  }
  return { day, month };
}

export function addToDays(days, key, { usd = 0, input = 0, output = 0, unknown = 0 }, now = new Date()) {
  const out = { ...days };
  const cur = out[key] || { usd: 0, n: 0, input: 0, output: 0, unknown: 0 };
  out[key] = { usd: cur.usd + usd, n: cur.n + 1, input: cur.input + input, output: cur.output + output, unknown: cur.unknown + unknown };
  const cutoff = dayKey(new Date(now.getTime() - KEEP_DAYS * 864e5));
  for (const k of Object.keys(out)) if (k < cutoff) delete out[k];
  return out;
}

export const levelOf = (spent, budget) => (!(budget > 0) ? 'ok' : spent >= budget ? 'over' : spent >= budget * 0.8 ? 'warn' : 'ok');

export const fmtUsd = (n) => `$${n === 0 ? '0.00' : n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
export function fmtThb(usd, rate) {
  const b = usd * rate;
  return b < 1 ? `${b.toFixed(2)} บาท` : b < 10 ? `${b.toFixed(1)} บาท` : `${Math.round(b).toLocaleString('th-TH')} บาท`;
}

// ราคา: ใช้ cost ที่ OpenRouter ส่งมา · ไม่มี → คำนวณจากโทเคน×ราคาต่อโทเคน · ไม่มีอีก → นับเป็น "ไม่ทราบราคา"
export function costOf(usage, price) {
  if (!usage) return { usd: 0, input: 0, output: 0, unknown: 0 };
  const input = usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;
  if (typeof usage.cost === 'number') return { usd: usage.cost, input, output, unknown: 0 };
  if (price && (input || output)) return { usd: input * price[0] + output * price[1], input, output, unknown: 0 };
  return { usd: 0, input, output, unknown: input || output ? 1 : 0 };
}

let chain = Promise.resolve(); // เขียนทีละอัน กันสองคำตอบจบพร้อมกันแล้วยอดทับกัน
export function recordUsage(model, usage) {
  chain = chain
    .then(async () => {
      const price = (await kvGet('pricing', {}))[model];
      const c = costOf(usage, price);
      if (!c.usd && !c.input && !c.output) return;
      await kvSet('usage', addToDays(await kvGet('usage', {}), dayKey(), c));
    })
    .catch(() => {});
  return chain;
}

export async function loadBudget() {
  const [budgetDay, budgetMonth, rate] = await Promise.all([kvGet('budgetDay', DEFAULTS.budgetDay), kvGet('budgetMonth', DEFAULTS.budgetMonth), kvGet('rate', DEFAULTS.rate)]);
  return { budgetDay, budgetMonth, rate };
}

export async function loadSummary() {
  const [days, budget] = await Promise.all([kvGet('usage', {}), loadBudget()]);
  return { ...summarize(days), ...budget };
}

// เตือนก่อนส่งถ้าเกินงบ (ถามครั้งเดียวต่อวัน/เดือน) · คืน false = ผู้ใช้ไม่ให้ไปต่อ
const acked = new Set();
export async function guardBudget() {
  const s = await loadSummary();
  for (const [key, label, spent, budget] of [
    [dayKey(), 'วันนี้', s.day.usd, s.budgetDay],
    [monthKey(), 'เดือนนี้', s.month.usd, s.budgetMonth],
  ]) {
    if (levelOf(spent, budget) !== 'over' || acked.has(key)) continue;
    if (!confirm(`ค่า AI ${label}เกินงบที่ตั้งไว้แล้ว (${fmtUsd(spent)} / ${fmtUsd(budget)}) ใช้ต่อไหม?`)) return false;
    acked.add(key);
  }
  return true;
}
