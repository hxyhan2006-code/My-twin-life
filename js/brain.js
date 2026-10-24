// สมองของ Twin: แก่นตัวตน + หน้าหมวด (คำตอบสัมภาษณ์และความจำของหมวดนั้น)

import { getAll, put, kvGet, kvSet, uid } from './db.js';
import { buildCore } from './profile.js';
import { getSettings, needsSetup } from './state.js';
import { CATEGORIES, groupById, groupOfCat } from './questions.js';
import { answerRow, memoryRow } from './rows.js';
import { h, toast, iconEl } from './ui.js';
import { learnStyle, STYLE_EVERY } from './style.js';
import { renderGoals } from './goals.js';

export async function renderBrain(root, { id }, ctx) {
  if (id === 'core') return renderCore(root, ctx);
  if (id === 'chatmem') return renderChatMemories(root, ctx);
  if (id === 'style') return renderStyle(root, ctx);
  if (id === 'goals') return renderGoals(root, ctx);
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

// สไตล์การพูด/วิธีคิดที่ AI เรียนรู้จากที่เราพิมพ์จริง: แก้ได้ · ลบตัวอย่างได้ · สั่งวิเคราะห์เองได้
async function renderStyle(root, ctx) {
  ctx.setTitle('สไตล์การพูดของเรา');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [style, at, samples] = await Promise.all([kvGet('styleProfile', ''), kvGet('styleAt', 0), kvGet('styleSamples', [])]);
  const ta = h('textarea', { class: 'big tall', value: style, placeholder: `ยังว่างอยู่ — คุยกับ twin ไปครบ ${STYLE_EVERY} ข้อความ AI จะเขียนให้เอง หรือกด "วิเคราะห์ตอนนี้"` });
  const status = h('small', { class: 'hint' }, at ? `วิเคราะห์ถึงข้อความเมื่อ ${new Date(at).toLocaleString('th-TH')}` : '');
  const saveBtn = h('button', { class: 'btn ghost', onclick: async () => { await kvSet('styleProfile', ta.value.trim()); toast('บันทึกแล้ว'); } }, 'บันทึกที่แก้');
  const runBtn = h('button', { class: 'btn primary', onclick: async () => {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) return toast(warn);
    runBtn.disabled = true;
    try {
      const ok = await learnStyle(s, { force: true });
      toast(ok ? 'วิเคราะห์เสร็จแล้ว' : 'ยังไม่มีข้อความใหม่ให้วิเคราะห์');
      if (ok) { root.innerHTML = ''; return renderStyle(root, ctx); }
    } catch (e) {
      toast(e.message, 5000);
    }
    runBtn.disabled = false;
  } }, 'วิเคราะห์ตอนนี้');
  page.append(
    h('p', { class: 'hint' }, 'AI อ่านข้อความที่เราพิมพ์จริง (แชต + คำตอบสัมภาษณ์) แล้วสรุปวิธีพูดและวิธีคิดของเรา twin อ่านส่วนนี้ทุกครั้งที่คุย อ่านแล้วตรงไหนไม่ใช่เรา แก้ตรงนี้ได้เลย'),
    ta, status, h('div', { class: 'btns' }, saveBtn, runBtn),
    h('p', { class: 'hint' }, `วิเคราะห์อัตโนมัติทุกๆ ${STYLE_EVERY} ข้อความใหม่ · ใช้โมเดลเบา มีค่าใช้จ่าย API เล็กน้อย`),
  );
  if (samples.length) {
    const list = h('div', { class: 'card' });
    const drawSamples = () => {
      list.innerHTML = '';
      samples.forEach((t, i) => list.append(h('div', { class: 'row col' },
        h('p', { class: 'ans' }, t),
        h('div', { class: 'btns small' }, h('button', { class: 'link danger', onclick: async () => {
          samples.splice(i, 1);
          await kvSet('styleSamples', samples);
          drawSamples();
        } }, 'ลบ')))));
    };
    drawSamples();
    page.append(h('h3', {}, `ตัวอย่างข้อความจริงที่ twin เห็น (${samples.length})`), list);
  }
}

// ตรวจสิ่งที่ AI จดจากแชตเอง: กด "ถูกต้อง" = ตรวจแล้ว (เก็บ m.reviewed) · แก้/ลบ/ย้ายหมวดได้เหมือนหน้าหมวด
async function renderChatMemories(root, ctx) {
  ctx.setTitle('ตรวจที่จำจากแชต');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [allMem, chats] = await Promise.all([getAll('memories'), getAll('chats')]);
  const titleOf = Object.fromEntries(chats.map((c) => [c.id, c.title]));
  const mine = allMem.filter((m) => m.source === 'chat').sort((a, b) => b.createdAt - a.createdAt);
  const todo = mine.filter((m) => !m.reviewed);
  const done = mine.filter((m) => m.reviewed);

  const redraw = () => { root.innerHTML = ''; renderChatMemories(root, ctx); };
  const markOk = async (m) => { m.reviewed = true; await put('memories', m); redraw(); };
  const rowOf = (m, extra) => {
    const r = memoryRow(m, { onChange: redraw, extra });
    r.prepend(h('small', {}, `จากแชต: ${titleOf[m.chatId] || 'แชตที่ลบไปแล้ว'}`));
    return r;
  };

  page.append(h('p', { class: 'hint' }, 'AI จดเรื่องเราจากการคุยในแชตเอง ถ้าจดผิดหรือเข้าใจเราผิด twin จะเรียนรู้ผิดไปด้วย ไล่อ่านแล้วกด "ถูกต้อง" ถ้าตรง หรือแก้/ลบถ้าไม่ตรง'));
  if (todo.length) {
    page.append(h('h3', {}, `รอตรวจ (${todo.length})`),
      h('div', { class: 'card' }, todo.map((m) => rowOf(m, [{ label: 'ถูกต้อง', onClick: markOk }]))),
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: async () => {
        if (!confirm(`ทำเครื่องหมายว่าถูกต้องทั้ง ${todo.length} เรื่อง?`)) return;
        for (const m of todo) { m.reviewed = true; await put('memories', m); }
        redraw();
      } }, 'ถูกต้องทั้งหมด')));
  } else {
    page.append(h('p', { class: 'hint' }, mine.length ? 'ตรวจครบแล้ว ไม่มีอะไรรอตรวจ' : 'ยังไม่มีความจำจากแชต พอคุยกับ twin ไปสักพัก AI จะจดมาไว้ตรงนี้'));
  }
  if (done.length) {
    page.append(h('h3', {}, `ตรวจแล้ว (${done.length})`), h('div', { class: 'card' }, done.map((m) => rowOf(m))));
  }
}

async function renderGroup(root, g, ctx) {
  ctx.setTitle(g.name);
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
        iconEl(c.icon, 'ico lead'),
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
