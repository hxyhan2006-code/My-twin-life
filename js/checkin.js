// เช็กอินรายวัน: 3 คำถามสั้นๆ ให้ twin มีข้อมูล "สิ่งที่ทำจริง" ไว้เทียบกับสิ่งที่เราพูด
// เก็บใน kv 'checkins' = { 'YYYY-MM-DD': { date, ts, wake: 'HH:MM'|'', work: ''|key, workNote, body: null|true|false, note } }
// (คีย์เป็นวันตามเวลาเครื่อง ไม่ใช่ UTC · เช็กอินซ้ำวันเดิม = เขียนทับของวันนั้น)

import { kvGet, kvSet } from './db.js';
import { h, toast } from './ui.js';

export const WORK_LEVELS = [
  ['none', 'ไม่ได้ทำ'],
  ['lt1', 'ไม่ถึง 1 ชม.'],
  ['h1_2', '1-2 ชม.'],
  ['h3p', '3 ชม.ขึ้นไป'],
];
const workLabel = (k) => WORK_LEVELS.find(([key]) => key === k)?.[1] || '';

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const loadCheckins = async () => {
  const v = await kvGet('checkins', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

// สรุปหนึ่งวันเป็นข้อความสั้นๆ (ใช้ทั้งในหน้ารายการและใน prompt)
export function describeEntry(e, { maxNote = 120 } = {}) {
  const bits = [];
  if (e.wake) bits.push(`ตื่น ${e.wake}`);
  if (e.work) bits.push(`งานหาเงิน: ${workLabel(e.work)}${e.workNote ? ` (${String(e.workNote).slice(0, 60)})` : ''}`);
  if (e.body === true) bits.push('ออกกำลังกาย: ทำ');
  else if (e.body === false) bits.push('ออกกำลังกาย: ไม่ทำ');
  if (e.note) bits.push(`โน้ต: ${String(e.note).slice(0, maxNote)}`);
  return bits.join(' · ');
}

// บรรทัดที่ส่งให้ twin: 7 วันล่าสุดที่มีเช็กอิน (เก่า→ใหม่) · ไม่มีเลย = [] (ไม่ขึ้นหัวข้อ)
export function checkinsForPrompt(map, now = new Date()) {
  const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(now, -(6 - i)))).filter((k) => map?.[k]);
  if (!keys.length) return [];
  return [
    `เช็กอิน ${keys.length} จาก 7 วันล่าสุด (วันที่ไม่ได้เช็กอิน = ไม่รู้ ไม่ได้แปลว่าไม่ได้ทำ)`,
    ...keys.map((k) => `${dayLabel(k)}: ${describeEntry(map[k]) || '(ไม่ได้ตอบ)'}`),
  ];
}

export async function renderCheckin(root, ctx) {
  ctx.setTitle('เช็กอินวันนี้');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const map = await loadCheckins();
  const today = dateKey();
  const cur = map[today] || {};
  let work = cur.work || '';
  let body = cur.body ?? null;

  // ปุ่มเลือกแบบกดซ้ำ = ยกเลิกการเลือก (ข้ามข้อได้)
  const seg = (options, get, set) => {
    const box = h('div', { class: 'seg' });
    const draw = () => {
      box.innerHTML = '';
      for (const [key, label] of options) {
        box.append(h('button', { type: 'button', class: get() === key ? 'on' : '', onclick: () => { set(get() === key ? (typeof key === 'boolean' ? null : '') : key); draw(); } }, label));
      }
    };
    draw();
    return box;
  };

  const wake = h('input', { class: 'search', type: 'time', value: cur.wake || '' });
  const workNote = h('input', { class: 'search', placeholder: 'ทำอะไร (ไม่ใส่ก็ได้) เช่น ตัดคลิป meowrin 2 อัน', value: cur.workNote || '', autocomplete: 'off' });
  const note = h('input', { class: 'search', placeholder: 'อะไรอีกไหม (ไม่ใส่ก็ได้)', value: cur.note || '', autocomplete: 'off' });
  const list = h('div', {});

  const save = h('button', { class: 'btn primary', onclick: async () => {
    const e = { date: today, ts: Date.now(), wake: wake.value, work, workNote: work ? workNote.value.trim() : '', body, note: note.value.trim() };
    if (!e.wake && !e.work && e.body === null && !e.note) return toast('ตอบอย่างน้อย 1 ข้อก่อน');
    map[today] = e;
    await kvSet('checkins', map);
    toast('บันทึกเช็กอินแล้ว twin จะเห็นตอนคุย');
    drawList();
  } }, 'บันทึกเช็กอิน');

  page.append(
    h('p', { class: 'hint' }, 'ตอบตามจริงสั้นๆ (ข้ามข้อได้ แค่กดปุ่มซ้ำ) twin จะเอาไปเทียบกับสิ่งที่เราพูดหรือวางแผน เช็กอินซ้ำวันเดิม = แก้ของวันนี้'),
    h('label', { class: 'field' }, h('span', {}, 'วันนี้ตื่นกี่โมง'), wake),
    h('div', { class: 'field' }, h('span', {}, 'งานที่หาเงินได้ (คลิป งานฟรีแลนซ์ ฯลฯ) ทำไปเท่าไหร่'), seg(WORK_LEVELS, () => work, (v) => { work = v; }), workNote),
    h('div', { class: 'field' }, h('span', {}, 'ออกกำลังกายไหม'), seg([[true, 'ทำ'], [false, 'ไม่ทำ']], () => body, (v) => { body = v; })),
    h('div', { class: 'field' }, h('span', {}, 'โน้ตสั้นๆ'), note),
    h('div', { class: 'btns' }, save),
    h('h3', {}, 'ย้อนหลัง'), list,
  );

  function drawList() {
    list.innerHTML = '';
    const keys = Object.keys(map).sort().reverse().slice(0, 14);
    if (!keys.length) return void list.append(h('p', { class: 'hint' }, 'ยังไม่มีเช็กอิน'));
    const card = h('div', { class: 'card' });
    for (const k of keys) {
      card.append(h('div', { class: 'row col' },
        h('b', {}, k === today ? `${dayLabel(k)} (วันนี้)` : dayLabel(k)),
        h('p', { class: 'ans' }, describeEntry(map[k], { maxNote: 300 }) || '(ไม่ได้ตอบ)'),
        h('div', { class: 'btns small' }, h('button', { class: 'link danger', onclick: async () => {
          if (!confirm('ลบเช็กอินของวันนั้น?')) return;
          delete map[k];
          await kvSet('checkins', map);
          drawList();
        } }, 'ลบ'))));
    }
    list.append(card);
  }
  drawList();
}
