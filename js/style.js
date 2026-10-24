// เรียนรู้สไตล์การพูด/วิธีคิดจากข้อความที่เราพิมพ์จริง (แยกจากความจำข้อเท็จจริง)
// kv: styleProfile (ข้อความโปรไฟล์) · styleAt (เวลาของข้อความล่าสุดที่วิเคราะห์แล้ว) · styleSamples (ตัวอย่างข้อความจริง)

import { chatOnce } from './api.js';
import { getAll, kvGet, kvSet } from './db.js';

export const STYLE_EVERY = 20; // ข้อความใหม่ของเราสะสมกี่ข้อความ ถึงวิเคราะห์รอบใหม่
const MAX_TEXTS = 60; // รอบหนึ่งอ่านไม่เกินกี่ข้อความ (ล่าสุดก่อน)
const MAX_CHARS = 9000; // รวมตัวอักษรไม่เกินเท่านี้ต่อรอบ (คุมค่าใช้จ่าย)
const SAMPLE_COUNT = 8;

// ข้อความที่เราพิมพ์เองทั้งหมด: ข้อความแชต + คำตอบสัมภาษณ์ [{ts, text}] เรียงเก่า→ใหม่
export function collectWriting(chats, answers) {
  const out = [];
  for (const c of chats) for (const m of c.messages || []) if (m.role === 'user' && m.content) out.push({ ts: m.ts || c.updatedAt || 0, text: m.content });
  for (const a of answers) if (a.answer) out.push({ ts: a.updatedAt || a.createdAt || 0, text: a.answer });
  return out.sort((a, b) => a.ts - b.ts);
}

// ตัดให้พอดีงบตัวอักษร เอาข้อความล่าสุดก่อน แล้วคืนตามลำดับเวลา
export function clampTexts(items) {
  const picked = [];
  let total = 0;
  for (const it of items.slice(-MAX_TEXTS).reverse()) {
    const text = it.text.length > 600 ? it.text.slice(0, 600) : it.text;
    if (total + text.length > MAX_CHARS) break;
    total += text.length;
    picked.push(text);
  }
  return picked.reverse();
}

// เลือกข้อความจริงที่ยาวพอดีๆ เป็นตัวอย่างให้ twin ดูน้ำเสียง (กระจายตามเวลา ไม่ซ้ำของเดิม)
export function pickSamples(items, existing = []) {
  const ok = items.filter((i) => i.text.length >= 15 && i.text.length <= 220 && !existing.includes(i.text));
  const step = Math.max(1, Math.floor(ok.length / SAMPLE_COUNT));
  const fresh = [];
  for (let i = ok.length - 1; i >= 0 && fresh.length < SAMPLE_COUNT; i -= step) fresh.push(ok[i].text);
  return [...fresh.reverse(), ...existing].slice(-SAMPLE_COUNT);
}

export async function analyzeStyle({ texts, existing, apiKey, model, name }) {
  const out = await chatOnce({
    apiKey, model, temperature: 0.3,
    messages: [
      { role: 'system', content: `คุณสังเกตวิธีพูด/เขียนและวิธีคิดของ ${name} จากข้อความที่เขาพิมพ์จริง เขียน "โปรไฟล์สไตล์" ฉบับปรับปรุง (รวมของเดิมกับสิ่งที่เห็นใหม่) ให้ AI อีกตัวอ่านแล้วพูดเหมือนเขาได้ ยาวไม่เกิน 900 ตัวอักษร เป็นหัวข้อสั้นๆ: 1) สรรพนาม คำติดปาก คำลงท้าย คำที่ใช้บ่อย 2) ความยาวและจังหวะการพิมพ์ ตัวสะกด/ภาษาอังกฤษปนไทย 3) อารมณ์และอารมณ์ขัน 4) วิธีคิดและวิธีตัดสินใจที่เห็นซ้ำๆ ห้ามเดาเกินหลักฐาน ถ้าไม่เห็นชัดให้ข้าม ห้ามใส่ข้อเท็จจริงในชีวิต (ชื่อคน เหตุการณ์ เก็บที่อื่นแล้ว) ตอบเป็นข้อความโปรไฟล์ล้วนๆ` },
      { role: 'user', content: `โปรไฟล์เดิม:\n${existing || '(ยังไม่มี)'}\n\nข้อความที่ ${name} พิมพ์จริง (แต่ละบรรทัดคั่นด้วย ---):\n${texts.join('\n---\n')}` },
    ],
  });
  return String(out).trim();
}

let running = false;

// เรียกหลังคุยจบแต่ละรอบ: ถ้ามีข้อความใหม่พอ (หรือ force) ค่อยวิเคราะห์ · คืน true ถ้าอัปเดตแล้ว
export async function learnStyle(s, { force = false } = {}) {
  if (running || !s.apiKey) return false;
  running = true;
  try {
    const [chats, answers, at, existing, samples] = await Promise.all([
      getAll('chats'), getAll('answers'), kvGet('styleAt', 0), kvGet('styleProfile', ''), kvGet('styleSamples', []),
    ]);
    const fresh = collectWriting(chats, answers).filter((i) => i.ts > at);
    if (!fresh.length || (!force && fresh.length < STYLE_EVERY)) return false;
    const text = await analyzeStyle({ texts: clampTexts(fresh), existing, apiKey: s.apiKey, model: s.lightModel || s.model, name: s.userName });
    if (!text) return false;
    await kvSet('styleProfile', text);
    await kvSet('styleSamples', pickSamples(fresh, samples));
    await kvSet('styleAt', fresh.at(-1).ts);
    return true;
  } finally {
    running = false;
  }
}
