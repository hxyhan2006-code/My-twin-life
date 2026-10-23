// สมองของ Twin: แก่นตัวตน + หน้าหมวด (คำตอบสัมภาษณ์และความจำของหมวดนั้น)

import { getAll, put, kvGet, kvSet, uid } from './db.js';
import { buildCore } from './profile.js';
import { getSettings, needsSetup } from './state.js';
import { CATEGORIES, groupById, groupOfCat } from './questions.js';
import { answerRow, memoryRow } from './rows.js';
import { h, toast, iconEl } from './ui.js';

export async function renderBrain(root, { id }, ctx) {
  if (id === 'core') return renderCore(root, ctx);
  const g = groupById(id);
  if (!g) return ctx.go('#/me');
  return renderGroup(root, g, ctx);
}

async function renderCore(root, ctx) {
  ctx.setTitle('แก่นตัวตน');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [core, at, answers] = await Promise.all([kvGet('coreProfile', ''), kvGet('coreProfileAt', 0), getAll('answers')]);
  const ta = h('textarea', { class: 'big tall', value: core, placeholder: 'ยังว่างอยู่ — กด "สร้างจากคำตอบสัมภาษณ์" หรือพิมพ์เองก็ได้' });
  const status = h('small', { class: 'hint' }, at ? `อัปเดตล่าสุด ${new Date(at).toLocaleString('th-TH')} · ${core.length} ตัวอักษร` : '');
  const prog = h('small', { class: 'hint' });
  const gen = h('button', { class: 'btn primary', onclick: async () => {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) return toast(warn);
    if (!answers.length) return toast('ยังไม่มีคำตอบสัมภาษณ์ ไปตอบก่อน');
    if (ta.value.trim() && !confirm('จะเขียนทับแก่นตัวตนเดิมด้วยฉบับใหม่ (ที่คุณแก้ไว้จะหายถ้าไม่ได้ก๊อปเก็บ) ตกลงไหม?')) return;
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

async function renderGroup(root, g, ctx) {
  ctx.setTitle(`${g.emoji} ${g.name}`);
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [allAns, allMem] = await Promise.all([getAll('answers'), getAll('memories')]);
  const answers = allAns.filter((a) => groupOfCat(a.category) === g.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const mems = allMem.filter((m) => (groupById(m.group) ? m.group : 'other') === g.id).sort((a, b) => b.createdAt - a.createdAt);

  if (g.cats.length) {
    const card = h('div', { class: 'card' });
    for (const cid of g.cats) {
      const c = CATEGORIES.find((x) => x.id === cid);
      card.append(h('a', { class: 'row', href: `#/interview/${cid}` },
        h('span', { class: 'emoji' }, c.emoji),
        h('span', { class: 'grow' }, h('b', {}, `ตอบเพิ่ม: ${c.name}`), h('small', {}, `ตอบแล้ว ${answers.filter((a) => a.category === cid).length} ข้อ`)),
        iconEl('chevron')));
    }
    page.append(card);
  }

  const add = h('input', { class: 'search', placeholder: 'เพิ่มความจำเองในหมวดนี้…' });
  const addBtn = h('button', { class: 'btn primary', onclick: async () => {
    const text = add.value.trim();
    if (!text) return;
    await put('memories', { id: uid(), text, group: g.id, source: 'manual', createdAt: Date.now() });
    toast('เพิ่มแล้ว');
    redraw();
  } }, 'เพิ่ม');
  const q = h('input', { class: 'search', type: 'search', placeholder: 'ค้นหาในหมวดนี้…' });
  const list = h('div', {});
  page.append(h('div', { class: 'addrow' }, add, addBtn), q, list);

  async function redraw() {
    // โหลดใหม่จากฐานข้อมูลทุกครั้งที่มีการเปลี่ยน (ลบ/ย้ายหมวด/เพิ่ม)
    page.remove();
    root.innerHTML = '';
    await renderGroup(root, g, ctx);
  }

  const draw = () => {
    list.innerHTML = '';
    const term = q.value.trim().toLowerCase();
    const fa = answers.filter((a) => !term || (a.question + ' ' + a.answer).toLowerCase().includes(term));
    const fm = mems.filter((m) => !term || m.text.toLowerCase().includes(term));
    list.append(h('h3', {}, `ความจำจากการคุย / ที่เพิ่มเอง (${fm.length})`));
    list.append(fm.length
      ? h('div', { class: 'card' }, fm.map((m) => memoryRow(m, { onChange: redraw })))
      : h('p', { class: 'hint' }, mems.length ? 'ไม่เจอที่ค้นหา' : 'ยังไม่มี พอคุยกับ twin ไปสักพัก เรื่องที่เกี่ยวกับหมวดนี้จะมาอยู่ตรงนี้เอง'));
    if (g.cats.length || fa.length) {
      list.append(h('h3', {}, `คำตอบสัมภาษณ์ (${fa.length})`));
      list.append(fa.length
        ? h('div', { class: 'card' }, fa.map((a) => answerRow(a, { onChange: redraw })))
        : h('p', { class: 'hint' }, answers.length ? 'ไม่เจอที่ค้นหา' : 'ยังไม่ได้ตอบ แตะ "ตอบเพิ่ม" ด้านบนได้เลย'));
    }
  };
  q.addEventListener('input', draw);
  draw();
}
