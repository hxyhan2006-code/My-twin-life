// เป้าหมายและแผนของเรา: เก็บใน kv 'goals' [{id, text, when, status: active|paused|done, createdAt, updatedAt}]
// twin อ่านเฉพาะที่ active ตอนวางแผน/ตัดสินใจ (ผ่าน buildSystem)

import { kvGet, kvSet, uid } from './db.js';
import { h, toast } from './ui.js';

const DAY = 864e5;
const STALE_DAYS = 14; // ไม่อัปเดตเกินนี้ ให้ twin ถามความคืบหน้า

export const loadGoals = () => kvGet('goals', []);

// บรรทัดเป้าหมายที่ส่งให้ twin (เฉพาะที่ยังทำอยู่)
export function goalsForPrompt(goals, now = Date.now()) {
  return goals.filter((g) => g.status === 'active').map((g) => {
    const days = Math.floor((now - (g.updatedAt || g.createdAt || now)) / DAY);
    return `${g.text}${g.when ? ` (กรอบเวลา: ${g.when})` : ''}${days >= STALE_DAYS ? ` [ไม่ได้อัปเดต ${days} วันแล้ว]` : ''}`;
  });
}

export async function renderGoals(root, ctx) {
  ctx.setTitle('เป้าหมายและแผน');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const goals = await loadGoals();
  const save = async () => { await kvSet('goals', goals); draw(); };
  const touch = (g, patch) => { Object.assign(g, patch, { updatedAt: Date.now() }); return save(); };

  const text = h('input', { class: 'search', placeholder: 'เป้าหมายหรือแผน เช่น เก็บเงินให้ได้ 1 แสน', autocomplete: 'off' });
  const when = h('input', { class: 'search', placeholder: 'กรอบเวลา (ไม่ใส่ก็ได้) เช่น ก่อนสิ้นปี', autocomplete: 'off' });
  const add = h('button', { class: 'btn primary', onclick: async () => {
    const t = text.value.trim();
    if (!t) return;
    goals.unshift({ id: uid(), text: t, when: when.value.trim(), status: 'active', createdAt: Date.now(), updatedAt: Date.now() });
    text.value = '';
    when.value = '';
    toast('เพิ่มแล้ว twin จะใช้เทียบตอนวางแผน');
    await save();
  } }, 'เพิ่มเป้าหมาย');
  const list = h('div', {});
  page.append(
    h('p', { class: 'hint' }, 'บอก twin ว่าเราอยากไปทางไหน ตอนวางแผนหรือตัดสินใจ twin จะเทียบกับเป้าหมายเหล่านี้ และบอกตรงๆ ถ้าสิ่งที่กำลังจะทำเบี่ยงไป ถ้าเป้าหมายไหนไม่ได้อัปเดตเกิน 2 สัปดาห์ twin จะถามความคืบหน้าสั้นๆ ตอนที่คุยเรื่องนั้น'),
    text, when, h('div', { class: 'btns' }, add), list,
  );

  function rowOf(g) {
    const row = h('div', { class: 'row col' });
    const view = () => {
      row.innerHTML = '';
      row.append(
        h('p', { class: 'ans' }, g.text),
        h('small', {}, [g.when, `อัปเดต ${new Date(g.updatedAt).toLocaleDateString('th-TH')}`].filter(Boolean).join(' · ')),
        h('div', { class: 'btns small' },
          g.status === 'active' && h('button', { class: 'link', onclick: () => touch(g, {}) }, 'ยังเดินหน้าอยู่'),
          g.status === 'active' && h('button', { class: 'link', onclick: () => touch(g, { status: 'done' }) }, 'สำเร็จแล้ว'),
          g.status === 'active' && h('button', { class: 'link', onclick: () => touch(g, { status: 'paused' }) }, 'พักไว้'),
          g.status !== 'active' && h('button', { class: 'link', onclick: () => touch(g, { status: 'active' }) }, 'กลับมาทำ'),
          h('button', { class: 'link', onclick: edit }, 'แก้'),
          h('button', { class: 'link danger', onclick: async () => {
            if (!confirm('ลบเป้าหมายนี้?')) return;
            goals.splice(goals.indexOf(g), 1);
            await save();
          } }, 'ลบ')),
      );
    };
    const edit = () => {
      const t = h('input', { class: 'search', value: g.text });
      const w = h('input', { class: 'search', value: g.when || '', placeholder: 'กรอบเวลา' });
      row.innerHTML = '';
      row.append(t, w, h('div', { class: 'btns small' },
        h('button', { class: 'link', onclick: view }, 'ยกเลิก'),
        h('button', { class: 'link', onclick: () => {
          if (!t.value.trim()) return toast('ว่างไม่ได้ (ถ้าจะลบกดลบ)');
          return touch(g, { text: t.value.trim(), when: w.value.trim() });
        } }, 'บันทึก')));
    };
    view();
    return row;
  }

  function draw() {
    list.innerHTML = '';
    for (const [status, title] of [['active', 'กำลังทำ'], ['paused', 'พักไว้'], ['done', 'สำเร็จแล้ว']]) {
      const gs = goals.filter((g) => g.status === status);
      if (!gs.length && status !== 'active') continue;
      list.append(h('h3', {}, `${title} (${gs.length})`),
        gs.length ? h('div', { class: 'card' }, gs.map(rowOf)) : h('p', { class: 'hint' }, 'ยังไม่มี เพิ่มด้านบนได้เลย'));
    }
  }
  draw();
}
