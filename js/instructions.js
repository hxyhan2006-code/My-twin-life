// คำสั่งที่เราตั้งให้ twin เป็นรายข้อ (เปิด/ปิด แก้ ลบได้) · เก็บใน kv 'instructions' [{id, text, on, createdAt}]
// twin อ่านเฉพาะข้อที่เปิดอยู่ทุกครั้งที่คุย (ผ่าน buildSystem)

import { kvGet, kvSet, uid } from './db.js';
import { h, toast } from './ui.js';

export const SUGGESTED = [
  'ถ้าฉันคิดผิด ให้บอกตรงๆ ก่อนเสมอ ไม่ต้องอ้อม',
  'ก่อนเห็นด้วยกับฉัน ให้หาข้อโต้แย้งก่อนเสมอ',
  'ตอบสั้นๆ ไม่เกิน 5 บรรทัด ยกเว้นฉันขอรายละเอียด',
  'ถ้าไม่แน่ใจ ให้บอกว่าไม่แน่ใจ ห้ามเดา',
];

export const loadInstructions = () => kvGet('instructions', []);

// ข้อความของข้อที่เปิดอยู่ (ตัดข้อว่าง)
export const instructionsForPrompt = (list) => list.filter((i) => i.on && i.text.trim()).map((i) => i.text.trim());

export async function renderInstructions(root, ctx) {
  ctx.setTitle('คำสั่งถึง Twin');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const list = await loadInstructions();
  const save = async () => { await kvSet('instructions', list); draw(); };
  const addText = async (t) => {
    const text = t.trim();
    if (!text) return;
    list.push({ id: uid(), text, on: true, createdAt: Date.now() });
    await save();
  };

  const input = h('input', { class: 'search', placeholder: 'เช่น ตอบสั้นๆ ถ้าฉันไม่ได้ขอรายละเอียด', autocomplete: 'off' });
  const add = h('button', { class: 'btn primary', onclick: async () => { const t = input.value; input.value = ''; await addText(t); } }, 'เพิ่มคำสั่ง');
  const box = h('div', {});
  const sugg = h('div', {});
  page.append(
    h('p', { class: 'hint' }, 'สั่ง twin ให้พูด/คิดแบบที่เราต้องการ เป็นประโยคสั้นๆ ทีละข้อ เปิดปิดแต่ละข้อได้ twin ทำตามข้อที่เปิดอยู่ทุกครั้งที่คุย (เรื่องความปลอดภัยของเราเอง twin ยังระวังเสมอ คำสั่งที่ตั้งไม่ปิดส่วนนี้)'),
    input, h('div', { class: 'btns' }, add), box, sugg,
  );

  function rowOf(i) {
    const row = h('div', { class: 'row col' });
    const view = () => {
      row.innerHTML = '';
      row.append(
        h('p', { class: 'ans', style: i.on ? '' : 'opacity:.5' }, i.text),
        h('div', { class: 'btns small' },
          h('button', { class: 'link', onclick: () => { i.on = !i.on; save(); } }, i.on ? 'เปิดอยู่ (แตะเพื่อปิด)' : 'ปิดอยู่ (แตะเพื่อเปิด)'),
          h('button', { class: 'link', onclick: edit }, 'แก้'),
          h('button', { class: 'link danger', onclick: () => { list.splice(list.indexOf(i), 1); save(); } }, 'ลบ')),
      );
    };
    const edit = () => {
      const t = h('input', { class: 'search', value: i.text });
      row.innerHTML = '';
      row.append(t, h('div', { class: 'btns small' },
        h('button', { class: 'link', onclick: view }, 'ยกเลิก'),
        h('button', { class: 'link', onclick: () => { if (!t.value.trim()) return toast('ว่างไม่ได้ (ถ้าจะลบกดลบ)'); i.text = t.value.trim(); save(); } }, 'บันทึก')));
    };
    view();
    return row;
  }

  function draw() {
    box.innerHTML = '';
    box.append(h('h3', {}, `คำสั่งของเรา (${list.filter((i) => i.on).length} เปิดอยู่ จาก ${list.length})`),
      list.length ? h('div', { class: 'card' }, list.map(rowOf)) : h('p', { class: 'hint' }, 'ยังไม่มี เพิ่มด้านบน หรือแตะข้อแนะนำด้านล่าง'));
    const left = SUGGESTED.filter((s) => !list.some((i) => i.text === s));
    sugg.innerHTML = '';
    if (left.length) sugg.append(h('h3', {}, 'ข้อแนะนำ (แตะเพื่อเพิ่ม)'), h('div', { class: 'card' }, left.map((s) =>
      h('button', { class: 'row', onclick: () => addText(s) }, h('span', { class: 'grow' }, s)))));
  }
  draw();
}
