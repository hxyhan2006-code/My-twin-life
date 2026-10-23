// หน้าความจำ: แก่นตัวตน · ความจำจากแชต · คำตอบสัมภาษณ์ทั้งหมด (ดู/แก้/ลบได้)

import { getAll, put, del, kvGet, kvSet, uid } from './db.js';
import { buildCore } from './profile.js';
import { getSettings, needsSetup } from './state.js';
import { h, toast } from './ui.js';

const TABS = [['core', 'แก่นตัวตน'], ['mem', 'ความจำ'], ['ans', 'คำตอบ']];

export async function renderMemory(root, { tab = 'core' }, ctx) {
  ctx.setTitle('ความจำ');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  const bar = h('div', { class: 'tabs' }, TABS.map(([id, label]) =>
    h('a', { class: id === tab ? 'on' : '', href: `#/memory/${id}` }, label)));
  root.append(bar, page);
  if (tab === 'mem') return memTab(page);
  if (tab === 'ans') return ansTab(page);
  return coreTab(page);
}

async function coreTab(page) {
  const [core, at, answers] = await Promise.all([kvGet('coreProfile', ''), kvGet('coreProfileAt', 0), getAll('answers')]);
  const ta = h('textarea', { class: 'big tall', value: core, placeholder: 'ยังว่างอยู่ — กด "สร้างจากคำตอบสัมภาษณ์" หรือพิมพ์เองก็ได้' });
  const status = h('small', { class: 'hint' }, at ? `อัปเดตล่าสุด ${new Date(at).toLocaleString('th-TH')} · ${core.length} ตัวอักษร` : '');
  const prog = h('small', { class: 'hint' });
  const gen = h('button', { class: 'btn primary', onclick: async () => {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) return toast(warn);
    if (!answers.length) return toast('ยังไม่มีคำตอบสัมภาษณ์ ไปตอบก่อน');
    if (core.trim() && !confirm('จะเขียนทับแก่นตัวตนเดิมด้วยฉบับใหม่ (ที่คุณแก้ไว้จะหายถ้าไม่ได้ก๊อปเก็บ) ตกลงไหม?')) return;
    gen.disabled = true;
    try {
      const text = await buildCore({ answers, apiKey: s.apiKey, model: s.model, name: s.userName, onProgress: (m) => { prog.textContent = m + '…'; } });
      ta.value = text;
      await kvSet('coreProfile', text);
      await kvSet('coreProfileAt', Date.now());
      toast('สร้างแก่นตัวตนแล้ว อ่านและแก้ให้ตรงได้เลย', 4000);
    } catch (e) {
      toast(e.message, 5000);
    }
    prog.textContent = '';
    gen.disabled = false;
  } }, 'สร้างจากคำตอบสัมภาษณ์');
  const saveBtn = h('button', { class: 'btn ghost', onclick: async () => {
    await kvSet('coreProfile', ta.value);
    await kvSet('coreProfileAt', Date.now());
    toast('บันทึกแล้ว');
  } }, 'บันทึกที่แก้');
  page.append(
    h('p', { class: 'hint' }, 'ส่วนนี้ถูกส่งให้ twin อ่านทุกครั้งที่คุย เป็น "ตัวตนหลัก" ของเรา อ่านแล้วตรงไหนไม่ใช่เรา แก้ตรงนี้ได้เลย'),
    ta, status, prog, h('div', { class: 'btns' }, saveBtn, gen),
    h('p', { class: 'hint' }, `ใช้คำตอบ ${answers.length} ข้อ · การสร้างจะเรียก AI หลายครั้งถ้าคำตอบเยอะ มีค่าใช้จ่าย API เล็กน้อย`),
  );
}

async function listTab(page, { items, empty, label, searchOf, rowFn }) {
  const q = h('input', { class: 'search', type: 'search', placeholder: 'ค้นหา…' });
  const box = h('div', { class: 'card' });
  const draw = () => {
    box.innerHTML = '';
    const term = q.value.trim().toLowerCase();
    const shown = items.filter((it) => !term || searchOf(it).toLowerCase().includes(term));
    if (!shown.length) box.append(h('div', { class: 'row' }, h('small', {}, items.length ? 'ไม่เจอที่ค้นหา' : empty)));
    for (const it of shown) box.append(rowFn(it, () => { items.splice(items.indexOf(it), 1); draw(); }));
  };
  q.addEventListener('input', draw);
  page.append(h('small', { class: 'hint' }, `${label} ${items.length} รายการ`), q, box);
  draw();
}

async function memTab(page) {
  const items = (await getAll('memories')).sort((a, b) => b.createdAt - a.createdAt);
  const add = h('input', { class: 'search', placeholder: 'เพิ่มความจำเอง เช่น "ช่วงนี้กำลังเก็บเงินซื้อมือถือ"' });
  const addBtn = h('button', { class: 'btn primary', onclick: async () => {
    const text = add.value.trim();
    if (!text) return;
    await put('memories', { id: uid(), text, source: 'manual', createdAt: Date.now() });
    add.value = '';
    toast('เพิ่มแล้ว');
    page.innerHTML = '';
    memTab(page);
  } }, 'เพิ่ม');
  page.append(h('p', { class: 'hint' }, 'เรื่องที่ twin จำได้จากการคุย (สรุปอัตโนมัติ) ผิดหรือไม่อยากให้จำ ลบได้'), h('div', { class: 'addrow' }, add, addBtn));
  await listTab(page, {
    items, label: 'ความจำ', empty: 'ยังไม่มีความจำ พอคุยไปสักพัก twin จะจำเรื่องสำคัญเพิ่มเอง',
    searchOf: (m) => m.text,
    rowFn: (m, removed) => {
      const row = h('div', { class: 'row col' });
      row.append(
        h('p', { class: 'ans' }, m.text),
        h('div', { class: 'btns small' },
          h('small', {}, `${m.source === 'chat' ? 'จากแชต' : 'เพิ่มเอง'} · ${new Date(m.createdAt).toLocaleDateString('th-TH')}`),
          h('button', { class: 'link', onclick: async () => {
            const t = prompt('แก้ความจำ', m.text);
            if (t == null || !t.trim()) return;
            m.text = t.trim();
            await put('memories', m);
            row.querySelector('.ans').textContent = m.text;
          } }, 'แก้'),
          h('button', { class: 'link danger', onclick: async () => { await del('memories', m.id); removed(); } }, 'ลบ')),
      );
      return row;
    },
  });
}

async function ansTab(page) {
  const items = (await getAll('answers')).sort((a, b) => b.updatedAt - a.updatedAt);
  page.append(h('p', { class: 'hint' }, 'คำตอบสัมภาษณ์ทั้งหมด (แก้ไขที่หน้า "สัมภาษณ์" ในแต่ละหมวด ที่นี่ลบหรือค้นหาได้)'));
  await listTab(page, {
    items, label: 'คำตอบ', empty: 'ยังไม่มีคำตอบ ไปที่ "สัมภาษณ์" ได้เลย',
    searchOf: (a) => a.question + ' ' + a.answer,
    rowFn: (a, removed) => h('div', { class: 'row col' },
      h('small', {}, a.question), h('p', { class: 'ans' }, a.answer),
      h('div', { class: 'btns small' }, h('button', { class: 'link danger', onclick: async () => {
        if (!confirm('ลบคำตอบนี้?')) return;
        await del('answers', a.id);
        removed();
      } }, 'ลบ'))),
  });
}
