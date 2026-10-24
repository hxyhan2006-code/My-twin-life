// รายชื่อโมเดล + ราคา สำหรับหน้าเลือกโมเดล
// ราคาจริงโหลดจาก OpenRouter (เก็บในเครื่อง) · ถ้าโหลดไม่ได้ใช้ราคาอ้างอิงด้านล่าง (เช็กล่าสุด ต.ค. 2026 อาจเปลี่ยน)

import { kvGet, kvSet } from './db.js';
import { listModels } from './api.js';
import { DEFAULTS, fmtThb } from './usage.js';

// จำนวนโทเคนโดยประมาณต่อการเรียก 1 ครั้ง ไว้ประมาณราคาให้ดู (ตัวเลขจริงดูได้ในการ์ด "ค่า AI" ด้านบนหน้าตั้งค่า)
export const ROLES = {
  main: { title: 'โมเดลหลัก', per: 'ต่อข้อความที่คุย', tokens: { input: 5000, output: 1500 }, canEmpty: false },
  deep: { title: 'โมเดลคิดลึก', per: 'ต่อข้อความที่คิดลึก', tokens: { input: 5000, output: 3000 }, canEmpty: true, emptyLabel: 'ว่างไว้ = ใช้ตัวเดียวกับโมเดลหลัก' },
  light: { title: 'โมเดลเบา', per: 'ต่อครั้งที่ดึงความจำ', tokens: { input: 2500, output: 400 }, canEmpty: true, emptyLabel: 'ว่างไว้ = ใช้ตัวเดียวกับโมเดลหลัก' },
};

const pm = (input, output) => [input / 1e6, output / 1e6]; // ดอลลาร์ต่อ 1 ล้านโทเคน → ต่อ 1 โทเคน

export const RECOMMENDED = {
  main: [
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: 'แนะนำ', note: 'เร็ว ฉลาดพอสำหรับคุยทุกวัน ค้นเว็บได้ · ราคานี้เป็นโปรลด 50% อาจขึ้นทีหลัง', price: pm(0.75, 3.75) },
    { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', note: 'ตัวระดับบน แพงกว่า Gemini 3.8 Flash ราว 2.7 เท่า', price: pm(2, 10) },
    { id: 'google/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', note: 'ถูกสุดในกลุ่มนี้ แต่ฉลาดน้อยกว่าชัด ไม่แนะนำเป็นตัวหลัก', price: pm(0.3, 2.5) },
  ],
  deep: [
    { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', tag: 'แนะนำ', note: 'ตัวระดับบนในราคากลาง ใช้กับเรื่องสำคัญ (เงิน เส้นทางชีวิต)', price: pm(2, 10) },
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', note: 'ระดับท็อป แพงเป็น 2 เท่าของ Sonnet ใช้เฉพาะเรื่องใหญ่จริงๆ', price: pm(4, 20) },
    { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', note: 'อีกค่ายในราคาเดียวกับ Sonnet ไว้ลองเทียบ (ผมยังไม่ได้ลองภาษาไทย)', price: pm(2, 10) },
  ],
  light: [
    { id: 'google/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', tag: 'แนะนำ', note: 'งานจดความจำ/วิเคราะห์สไตล์ ไม่ต้องฉลาดมาก ประหยัดสุดในกลุ่มที่รู้จัก', price: pm(0.3, 2.5) },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'ตัวเดียวกับตัวหลัก ถ้าไม่อยากตั้งแยก (ปล่อยว่างก็ได้ผลเดียวกัน)', price: pm(0.75, 3.75) },
  ],
};

// ราคาต่อโทเคน [เข้า, ออก] จากรายการโมเดลที่โหลดไว้ → ไม่มีก็ใช้ราคาอ้างอิง → ไม่มีอีก = null
export function priceOf(id, cache) {
  const live = cache?.list?.find((m) => m.id === id)?.price;
  if (live && Number.isFinite(live[0]) && Number.isFinite(live[1]) && live[0] >= 0 && live[1] >= 0) return { price: live, live: true };
  for (const arr of Object.values(RECOMMENDED)) {
    const r = arr.find((x) => x.id === id);
    if (r) return { price: r.price, live: false };
  }
  return { price: null, live: false };
}

export const estimateUsd = (price, tokens) => price[0] * tokens.input + price[1] * tokens.output;

const num = (n) => (n < 0.1 ? n.toFixed(3) : n.toFixed(2)).replace(/\.?0+$/, '');
export function priceText(price, role, rate = DEFAULTS.rate) {
  if (!price) return 'ยังไม่รู้ราคา';
  if (price[0] === 0 && price[1] === 0) return 'ฟรี (อาจช้าหรือจำกัดจำนวนครั้ง)';
  const r = ROLES[role] || ROLES.main;
  return `$${num(price[0] * 1e6)} เข้า · $${num(price[1] * 1e6)} ออก ต่อล้านโทเคน · ≈ ${fmtThb(estimateUsd(price, r.tokens), rate)} ${r.per}`;
}

export const loadModelCache = () => kvGet('modelsCache', null);

// โหลดรายชื่อ+ราคาล่าสุดจาก OpenRouter เก็บไว้ (ใช้ราคานี้คำนวณค่าใช้จ่ายด้วย) · ล้มเหลว = โยน error
export async function refreshModels() {
  const list = (await listModels()).filter((m) => Number.isFinite(m.price[0]) && Number.isFinite(m.price[1]) && m.price[0] >= 0 && m.price[1] >= 0);
  const cache = { at: Date.now(), list };
  await kvSet('modelsCache', cache);
  await kvSet('pricing', Object.fromEntries(list.map((m) => [m.id, m.price])));
  return cache;
}

// โหลดใหม่เงียบๆ ถ้าข้อมูลเก่าเกิน 1 วัน (ไม่ต้องรอ ไม่แจ้ง error)
export async function refreshModelsIfStale() {
  const c = await loadModelCache();
  if (c && Date.now() - c.at < 864e5) return c;
  try { return await refreshModels(); } catch { return c; }
}

// ข้อความราคาใต้ช่องโมเดลในหน้าตั้งค่า
export async function modelPriceLine(id, role) {
  if (!id) return ROLES[role]?.canEmpty ? 'ตอนนี้ใช้ตัวเดียวกับโมเดลหลัก' : 'ยังไม่ได้เลือก';
  const [cache, rate] = await Promise.all([loadModelCache(), kvGet('rate', DEFAULTS.rate)]);
  const { price, live } = priceOf(id, cache);
  return `${priceText(price, role, rate)}${price && !live ? ' (ราคาอ้างอิง ต.ค. 2026)' : ''}`;
}
