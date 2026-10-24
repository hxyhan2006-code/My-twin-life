// แถวคำตอบ/ความจำที่แก้-ลบได้ ใช้ร่วมกันหลายหน้า

import { put, del } from './db.js';
import { GROUPS } from './questions.js';
import { h, toast } from './ui.js';

// extra = ปุ่มเสริม [{label, onClick}] · onChange เรียกหลังลบ/ต้องวาดใหม่
export function answerRow(a, { onChange, extra = [] }) {
  const row = h('div', { class: 'row col' });
  const view = () => {
    row.innerHTML = '';
    row.append(
      h('small', {}, a.question),
      h('p', { class: 'ans' }, a.answer),
      h('div', { class: 'btns small' },
        h('button', { class: 'link', onclick: edit }, 'แก้'),
        extra.map((x) => h('button', { class: 'link', onclick: () => x.onClick(a) }, x.label)),
        h('button', { class: 'link danger', onclick: async () => {
          if (!confirm('ลบคำตอบนี้?')) return;
          await del('answers', a.id);
          onChange();
        } }, 'ลบ')),
    );
  };
  const edit = () => {
    const ta = h('textarea', { class: 'big', rows: 5, value: a.answer });
    row.innerHTML = '';
    row.append(h('small', {}, a.question), ta, h('div', { class: 'btns small' },
      h('button', { class: 'link', onclick: view }, 'ยกเลิก'),
      h('button', { class: 'link', onclick: async () => {
        const t = ta.value.trim();
        if (!t) return toast('คำตอบว่างไม่ได้ (ถ้าจะลบกดลบ)');
        a.answer = t;
        a.updatedAt = Date.now();
        await put('answers', a);
        view();
      } }, 'บันทึก')));
  };
  view();
  return row;
}

export function memoryRow(m, { onChange, extra = [] }) {
  const row = h('div', { class: 'row col' });
  const view = () => {
    row.innerHTML = '';
    const sel = h('select', { class: 'mini', title: 'ย้ายหมวด', onchange: async () => {
      m.group = sel.value;
      await put('memories', m);
      onChange();
    } }, GROUPS.map((g) => h('option', { value: g.id, selected: g.id === (m.group || 'other') }, g.name)));
    row.append(
      h('p', { class: 'ans' }, m.text),
      h('small', {}, `${m.source === 'chat' ? 'จากแชต' : 'เพิ่มเอง'} · ${new Date(m.createdAt).toLocaleDateString('th-TH')}`),
      h('div', { class: 'btns small' }, sel,
        extra.map((x) => h('button', { class: 'link', onclick: () => x.onClick(m) }, x.label)),
        h('button', { class: 'link', onclick: edit }, 'แก้'),
        h('button', { class: 'link danger', onclick: async () => {
          await del('memories', m.id);
          onChange();
        } }, 'ลบ')),
    );
  };
  const edit = () => {
    const ta = h('textarea', { class: 'big', rows: 3, value: m.text });
    row.innerHTML = '';
    row.append(ta, h('div', { class: 'btns small' },
      h('button', { class: 'link', onclick: view }, 'ยกเลิก'),
      h('button', { class: 'link', onclick: async () => {
        const t = ta.value.trim();
        if (!t) return toast('ว่างไม่ได้ (ถ้าจะลบกดลบ)');
        m.text = t;
        await put('memories', m);
        view();
      } }, 'บันทึก')));
  };
  view();
  return row;
}
