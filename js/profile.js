// งานที่ให้ AI ช่วยทำกับข้อมูลตัวตน: สร้างแก่นตัวตน · ถามเจาะลึก · ดึงความจำจากแชต

import { chatOnce } from './api.js';
import { extractJson } from './prompt.js';
import { CATEGORIES } from './questions.js';
import { grams } from './retrieve.js';

const qa = (a) => `Q: ${a.question}\nA: ${a.answer}`;
const CHUNK = 14000; // ตัวอักษรต่อการเรียก 1 ครั้งตอนสรุป

function groupByCategory(answers) {
  const by = new Map();
  for (const a of answers) {
    const key = a.category || 'other';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(a);
  }
  return by;
}

function chunkText(text, size) {
  const out = [];
  let cur = '';
  for (const para of text.split('\n\n')) {
    if (cur && cur.length + para.length > size) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + para;
  }
  if (cur) out.push(cur);
  return out;
}

// สร้างแก่นตัวตนจากคำตอบทั้งหมด: ถ้าข้อมูลเยอะ สรุปทีละหมวดก่อนแล้วค่อยรวม
export async function buildCore({ answers, apiKey, model, name, onProgress = () => {} }) {
  const valid = answers.filter((a) => a.answer && a.answer.trim());
  if (!valid.length) throw new Error('ยังไม่มีคำตอบสัมภาษณ์ให้สรุป');
  const style =
    `เขียนเป็นบุรุษที่ 1 (ฉัน/ผม ตามน้ำเสียงในคำตอบ) ห้ามแต่งข้อมูลที่ไม่มีในคำตอบ เก็บชื่อ ตัวเลข วันที่ สถานที่ให้ตรงตามที่ตอบ ` +
    `ถ้าคำตอบขัดกันเองให้ระบุว่าขัดกัน ไม่ต้องเลือกข้าง`;
  const ask = (system, user) =>
    chatOnce({ apiKey, model, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });

  const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || 'อื่นๆ';
  const all = valid.map(qa).join('\n\n');
  let material;
  if (all.length <= CHUNK) {
    material = all;
  } else {
    const parts = [];
    const groups = [...groupByCategory(valid)];
    for (let i = 0; i < groups.length; i++) {
      const [cat, list] = groups[i];
      onProgress(`สรุปหมวด ${catName(cat)} (${i + 1}/${groups.length})`);
      const pieces = chunkText(list.map(qa).join('\n\n'), CHUNK);
      const sums = [];
      for (const p of pieces) {
        sums.push(await ask(`สรุปข้อเท็จจริงและลักษณะนิสัยของ ${name} จากคำตอบสัมภาษณ์หมวด "${catName(cat)}" ให้ละเอียดครบทุกประเด็นสำคัญ ${style}`, p));
      }
      parts.push(`### ${catName(cat)}\n${sums.join('\n')}`);
    }
    material = parts.join('\n\n');
  }

  onProgress('เขียนแก่นตัวตน');
  return ask(
    `คุณกำลังเขียน "แก่นตัวตน" ของ ${name} เพื่อให้ AI ใช้เป็นแกนในการเป็น ${name} ${style}\n` +
      `ครอบคลุม: ข้อมูลพื้นฐาน, ครอบครัว, ความสัมพันธ์, งาน/เรียน, เงิน, สุขภาพกายใจ, ค่านิยมและความเชื่อ, ความกลัวและจุดอ่อน, ความฝันและเป้าหมาย, วิธีคิดและตัดสินใจ, ` +
      `น้ำเสียงและคำพูดติดปาก (ยกตัวอย่างประโยคจริงจากคำตอบ) จัดเป็นหัวข้อสั้นๆ พร้อม bullet ความยาวไม่เกินประมาณ 1500 คำ`,
    material,
  );
}

// ให้ AI คิดคำถามต่อจากคำตอบ
export async function followUps({ question, answer, apiKey, model, name, n = 3 }) {
  const out = await chatOnce({
    apiKey, model, temperature: 0.7,
    messages: [
      { role: 'system', content: `คุณกำลังสัมภาษณ์ ${name} เพื่อรู้จักเขาลึกๆ ให้คิดคำถามต่อ ${n} ข้อ เจาะรายละเอียด ที่มา ความรู้สึก หรือตัวอย่างจริงจากคำตอบ ภาษาไทยพูดกันเอง สั้น ตอบเป็น JSON array ของข้อความเท่านั้น` },
      { role: 'user', content: `คำถาม: ${question}\nคำตอบ: ${answer}` },
    ],
  });
  const arr = extractJson(out);
  if (!Array.isArray(arr)) throw new Error('AI ตอบรูปแบบที่อ่านไม่ได้ ลองกดอีกครั้ง');
  return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, n);
}

const sameish = (a, b) => {
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return false;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.min(ga.size, gb.size) > 0.7;
};

// ดึงเรื่องใหม่ที่ควรจำจากบทสนทนาล่าสุด คืนเป็นรายการข้อความ (ตัดอันที่ซ้ำกับของเดิมแล้ว)
export async function extractMemories({ messages, existing, apiKey, model, name }) {
  const convo = messages.map((m) => `${m.role === 'user' ? name : 'Twin'}: ${m.content}`).join('\n');
  const known = existing.slice(-40).map((m) => `- ${m}`).join('\n') || '(ยังไม่มี)';
  const out = await chatOnce({
    apiKey, model, temperature: 0.2,
    messages: [
      { role: 'system', content: `ดึง "ข้อมูลใหม่ที่ควรจำถาวร" เกี่ยวกับ ${name} จากบทสนทนา เช่น เหตุการณ์ การตัดสินใจ แผน ความรู้สึกสำคัญ ความชอบ ปัญหาที่กำลังเจอ เอาเฉพาะที่ ${name} เป็นคนบอกเอง ห้ามเอาความเห็นของ Twin มาเป็นข้อเท็จจริง แต่ละข้อเป็นประโยคสั้นภาษาไทยที่อ่านเดี่ยวๆ แล้วเข้าใจ ห้ามซ้ำกับที่รู้อยู่แล้ว ถ้าไม่มีอะไรใหม่ตอบ [] ตอบเป็น JSON array ของข้อความเท่านั้น` },
      { role: 'user', content: `ที่รู้อยู่แล้ว:\n${known}\n\nบทสนทนา:\n${convo}` },
    ],
  });
  const arr = extractJson(out);
  if (!Array.isArray(arr)) return [];
  const fresh = [];
  for (const s of arr.map((x) => String(x).trim()).filter(Boolean)) {
    if (![...existing, ...fresh].some((e) => sameish(e, s))) fresh.push(s);
  }
  return fresh.slice(0, 6);
}
