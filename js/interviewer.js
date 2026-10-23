// ผู้สัมภาษณ์ AI: คุยแบบนักจิตวิทยาเชิงเล่าเรื่อง ถามทีละข้อ สะท้อนสิ่งที่ได้ยิน เจาะเป็นฉากจริง
// หลักการมาจาก: Life Story Interview (McAdams) · OARS (สะท้อน/สรุป) · probes (ขอตัวอย่าง/ขยายความ) · laddering (ไล่หาค่านิยม)

import { chatOnce } from './api.js';
import { extractJson } from './prompt.js';

export const MOVES = ['warmup', 'example', 'clarify', 'feeling', 'ladder', 'scenario', 'summary', 'switch', 'wrap'];
const trim = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

export function buildInterviewerSystem({ name, callName, selfName, cat, seeds, known, facts, core, turns }) {
  const hints = [];
  if (turns > 0 && turns % 8 === 0) hints.push('ถึงเวลาสรุป (move=summary): สรุปสิ่งที่ฟังมาในรอบนี้สั้นๆ 2-4 ประโยค ให้เขาเช็กว่าถูกไหม ขาดอะไร แล้วค่อยถามต่อ');
  if (turns >= 24) hints.push('คุยมานานแล้ว ชวนเขาเบาๆ ว่าอยากพักไหม (ไม่บังคับ)');
  return [
    `คุณคือผู้สัมภาษณ์ ที่เป็นเพื่อนสนิทของ ${name} และเป็นนักจิตวิทยาเชิงเล่าเรื่องที่อบอุ่น ใจเย็น อยากรู้จริง ไม่ตัดสิน`,
    `เป้าหมาย: ทำให้รู้จัก ${name} ให้ลึกที่สุด เพื่อสร้าง "ตัวตนดิจิทัล" ที่คิดและพูดเหมือนเขาจริงๆ ต้องได้ทั้งข้อเท็จจริง เหตุการณ์จริง ความรู้สึก ค่านิยม ความกลัว วิธีคิดและวิธีตัดสินใจ และน้ำเสียงการพูด`,
    `หมวดที่คุยตอนนี้: ${cat.name}`,
    `ประเด็นที่ควรรู้ในหมวดนี้ (เลือกตามความเหมาะสมกับบทสนทนา ไม่ต้องเรียง ข้อที่คุยไปแล้วให้ข้าม):\n${seeds.map((q) => `- ${q}`).join('\n') || '- (ครบแล้ว ให้ต่อยอดจากสิ่งที่เขาเล่า)'}`,
    `สิ่งที่รู้แล้วในหมวดนี้ (ห้ามถามซ้ำ ใช้ต่อยอดได้):\n${known.join('\n') || '- (ยังไม่มี)'}${facts.length ? `\nข้อเท็จจริงที่จดไว้: ${facts.join(' | ')}` : ''}`,
    core ? `ภาพรวมตัวตนที่รู้แล้ว:\n${trim(core, 1500)}` : '',
    `วิธีสัมภาษณ์ (สำคัญมาก):
1. ถามทีละ 1 ข้อ สั้น ภาษาพูดไทย ห้ามถามพ่วงหลายเรื่องในประโยคเดียว
2. ก่อนถามต่อ ให้สะท้อนสิ่งที่ได้ยิน 1 ประโยคแบบบอกเล่า (ไม่ใช่คำถาม) จับทั้งเนื้อหาและความรู้สึก เช่น "ฟังแล้วเหมือน..." ชื่นชมเฉพาะเมื่อจริงใจและเจาะจง ไม่ประจบ
3. ชอบ "ฉากจริง" มากกว่าคำตอบกว้างๆ: ขอเหตุการณ์ล่าสุดหรือครั้งที่จำได้ ("ครั้งล่าสุดที่... เกิดอะไรขึ้น", "พาเดินผ่านเหตุการณ์ทีละช่วงหน่อย", "ตอนนั้นเห็น/ได้ยิน/คิดอะไรอยู่")
4. ถ้าคำตอบสั้น คลุมเครือ หรือเป็น "ก็โอเค/เฉยๆ": อย่าข้ามไป ให้ลดภาระเขา เดาให้เลือก 2-4 ตัวเลือก (choices) หรือถามฉากเล็กๆ ที่นึกภาพออกง่าย
5. ถ้าเรื่องน่าสนใจ ให้เจาะเป็นขั้น: เหตุการณ์ → ความรู้สึก → ความหมายว่าทำไมสำคัญกับเขา (ไล่หาค่านิยมเบื้องหลัง) แต่ไม่ถาม "ทำไม" ซ้ำๆ แข็งๆ
6. ได้เนื้อพอแล้ว หรือเขาตอบไม่ค่อยอยาก → ขอบคุณสั้นๆ แล้วเปลี่ยนประเด็นอย่างเป็นธรรมชาติ ไม่ดึงดัน ถ้าเขาข้ามหรือไม่อยากตอบ ให้เคารพทันที
7. เรื่องเปราะบาง (เช่น บาดแผล ครอบครัว) ถามอย่างขออนุญาตเบาๆ และบอกว่าข้ามได้ แต่ไม่หลีกเลี่ยงหัวข้อที่สำคัญต่อการรู้จักเขา
8. ห้ามสอน ห้ามให้คำแนะนำ ห้ามวินิจฉัย ห้ามแต่งข้อมูลที่เขาไม่ได้บอก ห้ามอ้างว่าเป็นแพทย์หรือนักบำบัด
9. ถ้าเขาพูดถึงการทำร้ายตัวเองหรืออยากตาย: หยุดสัมภาษณ์ทันที ตอบอย่างใส่ใจ ถามว่าตอนนี้ปลอดภัยไหม แนะนำให้ติดต่อคนที่ไว้ใจ หรือสายด่วนสุขภาพจิต 1323 (ไทย) ใส่ใน question และตั้ง topic_done=true
10. น้ำเสียง: เหมือนเพื่อนสนิทคุยกัน ไม่ทางการ ไม่ใช้ศัพท์จิตวิทยา ไม่ใช้อีโมจิ เรียกเขาว่า "${callName}" และเรียกตัวเองว่า "${selfName}"`,
    hints.length ? `สถานะรอบนี้ (คุยมาแล้ว ${turns} ข้อ): ${hints.join(' ')}` : `สถานะรอบนี้: คุยมาแล้ว ${turns} ข้อ`,
    `ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น:
{"reflect":"...","facts":["..."],"move":"...","question":"...","choices":["..."],"topic_done":false}
- reflect: ประโยคสะท้อน 1 ประโยค (ว่างได้ตอนเริ่มรอบ)
- facts: ข้อเท็จจริง/ความรู้สึก/ความชอบที่เขา "เพิ่งบอกในข้อความล่าสุด" 0-3 ข้อ เป็นประโยคสั้นที่อ่านเดี่ยวๆ รู้เรื่อง ไม่ใช้สรรพนาม (เช่น "ย้ายมาสงขลาคนเดียวเพราะเรียน") ห้ามใส่สิ่งที่เขาไม่ได้พูด
- move: ${MOVES.join('|')}
- question: คำถามเดียว
- choices: ตัวเลือกให้กดตอบเร็ว 0-4 ข้อ สั้นๆ ใส่เฉพาะเมื่อช่วยลดแรงเขา (เขาพิมพ์ตอบเองได้เสมอ)
- topic_done: true เมื่อหมวดนี้ได้ข้อมูลครบพอแล้วหรือควรจบรอบ`,
  ].filter(Boolean).join('\n\n');
}

const arr = (v) => (Array.isArray(v) ? v : []);
const clean = (s) => String(s ?? '').trim();

// ดึงค่าข้อความ "key":"..." ที่ปิดเครื่องหมายคำพูดแล้ว จาก JSON ที่ถูกตัดกลางคัน
const field = (t, k) => {
  const m = String(t).match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() : '';
};

// อ่านคำตอบของผู้สัมภาษณ์ ทนต่อรูปแบบเพี้ยน
// - JSON สมบูรณ์ → ใช้ตามนั้น · JSON ขาดกลางคัน → กู้ reflect/question ที่ปิดแล้ว · ถ้ากู้คำถามไม่ได้ → incomplete (ห้ามเอาไปโชว์)
// - ข้อความธรรมดาไม่มีวงเล็บ JSON → ใช้เป็นคำถามได้
export function parseInterviewerReply(text) {
  const j = extractJson(text);
  if (!j || Array.isArray(j) || typeof j !== 'object') {
    const t = clean(text);
    const looksJson = /[{}]|```|"(reflect|question|facts|move)"/.test(t);
    if (!looksJson) return { reflect: '', facts: [], move: 'switch', question: t, choices: [], done: false, raw: true, incomplete: false };
    const question = field(t, 'question');
    return { reflect: field(t, 'reflect'), facts: [], move: 'switch', question, choices: [], done: false, raw: true, incomplete: !question };
  }
  return {
    reflect: clean(j.reflect),
    facts: arr(j.facts).map(clean).filter(Boolean).slice(0, 3),
    move: MOVES.includes(j.move) ? j.move : 'switch',
    question: clean(j.question),
    choices: arr(j.choices).map(clean).filter((c) => c && c.length <= 60).slice(0, 4),
    done: j.topic_done === true,
    raw: false,
    incomplete: false,
  };
}

const START = '[เริ่มรอบสัมภาษณ์หมวดนี้ ทักทายสั้นๆ ให้ผ่อนคลายแล้วถามข้อแรกที่ง่ายและนึกภาพออก (move=warmup)]';
const SKIP = '[เขาไม่อยากตอบข้อนี้ เคารพและเปลี่ยนไปประเด็นอื่นอย่างเป็นธรรมชาติ ไม่ต้องถามซ้ำ]';
const WRAP = '[เขาขอพอแค่นี้ก่อน ปิดรอบ: สรุปสิ่งที่ฟังมาวันนี้ 3-5 ประโยค ขอบคุณจริงใจ บอกว่าครั้งหน้าจะคุยอะไรต่อ ให้ question เป็นประโยคปิดท้ายที่ไม่ต้องตอบ move=wrap topic_done=true]';

// session = [{q, a}] ของรอบนี้ · mode: start | answer | skip | wrap
export async function interviewTurn({ settings, cat, answers, memories, seeds, core, session, mode, signal }) {
  const [callName, selfName] = [settings.callName || settings.userName, settings.selfName || 'เรา'];
  const known = answers
    .filter((a) => a.category === cat.id && a.answer)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 14)
    .map((a) => `- ถาม: ${trim(a.question, 120)} ตอบ: ${trim(a.answer, 220)}`);
  const facts = memories.filter((m) => m.category === cat.id).slice(-20).map((m) => m.text);
  const system = buildInterviewerSystem({
    name: settings.userName, callName, selfName, cat, seeds: seeds.slice(0, 10), known, facts, core, turns: session.length,
  });
  const messages = [{ role: 'system', content: system }];
  messages.push({ role: 'user', content: START }); // ให้ประวัติเริ่มด้วยฝั่งเราเสมอ (บางโมเดลไม่รับให้ assistant พูดก่อน)
  for (const t of session.slice(-8)) {
    messages.push({ role: 'assistant', content: t.q });
    messages.push({ role: 'user', content: t.a });
  }
  if (mode === 'skip') messages.push({ role: 'user', content: SKIP });
  if (mode === 'wrap') messages.push({ role: 'user', content: WRAP });
  // โมเดลแนวคิดก่อนตอบ (เช่น Gemini) ใช้โควตาไปกับการคิด จึงเผื่อความยาวไว้เยอะ และสั่งให้คิดน้อยเพื่อให้ตอบเร็ว
  const ask = (maxTokens) => chatOnce({ apiKey: settings.apiKey, model: settings.model, messages, temperature: 0.8, maxTokens, signal, extra: { reasoning: { effort: 'low' } } });
  let reply = parseInterviewerReply(await ask(3000));
  if (reply.incomplete) reply = parseInterviewerReply(await ask(6000)); // ตอบขาด → ลองใหม่อีกครั้งด้วยโควตาที่ใหญ่ขึ้น
  if (reply.incomplete) throw new Error('AI ตอบไม่ครบ ลองใหม่อีกครั้ง หรือเปลี่ยนโมเดลหลักในตั้งค่า');
  return reply;
}
