// หน้าสัมภาษณ์: เลือกหมวด → คุยถามตอบทีละข้อแบบแชต (เซฟทันทีทุกข้อ) · AI ถามเจาะลึกต่อได้

import { getAll, put, kvGet, kvSet, uid } from './db.js';
import { CATEGORIES, BASE_QUESTIONS, categoryById, groupOfCat } from './questions.js';
import { followUps } from './profile.js';
import { createComposer } from './composer.js';
import { getSettings, needsSetup } from './state.js';
import { h, toast, iconEl } from './ui.js';

async function load() {
  const [answers, followups, skipped] = await Promise.all([getAll('answers'), kvGet('followups', []), kvGet('skipped', [])]);
  return { answers, followups, skipped: new Set(skipped) };
}

// คิวคำถามของหมวด: คำถามเจาะลึกที่รออยู่ก่อน แล้วค่อยตามด้วยคำถามพื้นฐานที่ยังไม่ได้ตอบ/ไม่ได้ข้าม
function queueFor(cat, { answers, followups, skipped }) {
  const done = new Set(answers.map((a) => a.qid));
  const fu = followups.filter((f) => f.category === cat);
  const base = BASE_QUESTIONS.filter((q) => q.category === cat && !done.has(q.id) && !skipped.has(q.id));
  return [...fu, ...base];
}

export async function renderInterview(root, { cat }, ctx) {
  const data = await load();
  if (!cat) return renderCategories(root, data, ctx);
  const c = categoryById(cat);
  if (!c) return ctx.go('#/interview');
  return renderThread(root, c, ctx);
}

function renderCategories(root, data, ctx) {
  ctx.setTitle('สัมภาษณ์');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  page.append(h('p', { class: 'hint' }, 'เลือกหมวดแล้วคุยตอบทีละข้อ ยิ่งละเอียดและตรงยิ่งทำให้ twin เหมือนเรา ทุกคำตอบเซฟทันที หยุดแล้วกลับมาต่อได้ ข้ามข้อที่ไม่อยากตอบได้'));
  const card = h('div', { class: 'card' });
  for (const c of CATEGORIES) {
    const answered = data.answers.filter((a) => a.category === c.id).length;
    const left = queueFor(c.id, data).length;
    const pct = answered + left ? Math.round((answered / (answered + left)) * 100) : 100;
    card.append(
      h('a', { class: 'row', href: `#/interview/${c.id}` },
        iconEl(c.icon, 'ico lead'),
        h('span', { class: 'grow' }, h('b', {}, c.name),
          h('small', {}, left ? `ตอบแล้ว ${answered} · เหลือ ${left} ข้อ` : `ตอบครบแล้ว (${answered} ข้อ)`),
          h('span', { class: 'bar' }, h('i', { style: `width:${pct}%` }))),
        iconEl('chevron')),
    );
  }
  page.append(card, h('p', { class: 'hint' }, `รวมตอบแล้ว ${data.answers.length} ข้อ · พอตอบพอสมควรแล้ว ไปที่ "แก่นตัวตน" ในหน้าโปรไฟล์เพื่อสร้างตัวตนหลัก`));
  root.append(page);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function renderThread(root, c, ctx) {
  ctx.setTitle(c.name);
  const list = h('div', { class: 'msgs' });
  const chipSkip = h('button', { class: 'chip', onclick: () => skip() }, 'ข้ามข้อนี้');
  const chipDeep = h('button', { class: 'chip', onclick: () => deeper() }, 'เจาะลึกต่อ');
  const chipAuto = h('button', { class: 'chip', onclick: () => toggleAuto() });
  const composer = createComposer({ placeholder: 'พิมพ์คำตอบ…', onSubmit: () => submit() });
  root.append(list, h('div', { class: 'chips' }, chipSkip, chipDeep, chipAuto), composer.el);

  let data = await load();
  let q = null; // คำถามที่กำลังรอคำตอบ
  let last = null; // คำตอบล่าสุดของรอบนี้ (ไว้ถามเจาะลึกต่อ)
  let busy = false;
  let auto = await kvGet('autoFollow', true);
  let warned = false;

  const toBottom = () => { list.scrollTop = list.scrollHeight; };
  const paintAuto = () => { chipAuto.textContent = `ถามต่อเอง: ${auto ? 'เปิด' : 'ปิด'}`; chipAuto.classList.toggle('on', auto); };
  const toggleAuto = async () => { auto = !auto; await kvSet('autoFollow', auto); paintAuto(); };
  paintAuto();

  const say = (kids, cls = '') => { const el = h('div', { class: `msg ai in ${cls}` }, kids); list.append(el); toBottom(); return el; };
  const mine = (text) => { list.append(h('div', { class: 'msg user in' }, h('div', { class: 'bub' }, text))); toBottom(); };

  function paintHeader() {
    const n = data.answers.filter((a) => a.category === c.id).length;
    ctx.setRight(h('a', { class: 'chip', href: `#/brain/${groupOfCat(c.id)}` }, `ตอบแล้ว ${n} · ดู/แก้`));
  }

  async function next() {
    data = await load();
    paintHeader();
    const queue = queueFor(c.id, data);
    if (!queue.length) {
      q = null;
      const nextCat = CATEGORIES.find((x) => x.id !== c.id && queueFor(x.id, data).length);
      say([
        h('div', { class: 'md doneline' }, iconEl('check'), h('p', {}, 'หมวดนี้ตอบครบแล้ว')),
        h('div', { class: 'btns left' },
          nextCat && h('a', { class: 'btn primary', href: `#/interview/${nextCat.id}` }, `ไปหมวด ${nextCat.name}`),
          h('a', { class: 'btn', href: `#/brain/${groupOfCat(c.id)}` }, 'ดู/แก้คำตอบ')),
      ]);
      return;
    }
    q = queue[0];
    const dots = say(h('div', { class: 'md' }, h('span', { class: 'pulse' })));
    await pause(380);
    dots.replaceWith(h('div', { class: 'msg ai in qmsg' },
      h('small', { class: 'qno' }, q.parent ? 'ถามเจาะลึก' : `ข้อที่ ${data.answers.filter((a) => a.category === c.id).length + 1} · เหลือ ${queue.length} ข้อ`),
      h('div', { class: 'md' }, h('p', {}, q.question))));
    toBottom();
    composer.input.focus();
  }

  async function ask(rec, n) {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) {
      if (!warned) toast(`${warn} จึงถามเจาะลึกไม่ได้`);
      warned = true;
      return;
    }
    try {
      const qs = await followUps({ question: rec.question, answer: rec.answer, apiKey: s.apiKey, model: s.lightModel, name: s.userName, n });
      const cur = await kvGet('followups', []);
      await kvSet('followups', [...qs.map((question) => ({ id: 'fu-' + uid(), category: rec.category, question, parent: rec.id })), ...cur]);
    } catch (e) {
      toast(e.message, 4000);
    }
  }

  async function submit() {
    const text = composer.input.value.trim();
    if (!q || busy || !text) return;
    busy = true;
    const rec = { id: uid(), qid: q.id, category: c.id, question: q.question, answer: text, createdAt: Date.now(), updatedAt: Date.now() };
    await put('answers', rec);
    if (q.parent) await kvSet('followups', (await kvGet('followups', [])).filter((f) => f.id !== q.id));
    mine(text);
    composer.clear();
    last = rec;
    if (auto && !q.parent) await ask(rec, 1); // เจาะลึกอัตโนมัติเฉพาะข้อพื้นฐาน ไม่ไล่ลึกไม่รู้จบ
    await next();
    busy = false;
  }

  async function skip() {
    if (!q || busy) return;
    busy = true;
    if (q.parent) await kvSet('followups', (await kvGet('followups', [])).filter((f) => f.id !== q.id));
    else await kvSet('skipped', [...new Set([...(await kvGet('skipped', [])), q.id])]);
    say(h('small', { class: 'dim' }, 'ข้ามข้อนี้'));
    await next();
    busy = false;
  }

  async function deeper() {
    if (!last) return toast('ตอบสักข้อก่อน แล้วค่อยให้ AI เจาะลึกต่อ');
    if (busy) return;
    busy = true;
    const dots = say(h('div', { class: 'md' }, h('span', { class: 'pulse' })));
    await ask(last, 2);
    dots.remove();
    await next();
    busy = false;
  }

  say(h('small', { class: 'dim' }, 'ตอบทีละข้อ พิมพ์เท่าที่อยากเล่า ข้ามได้ ถ้าอยากเล่าเพิ่มเติมกด "เจาะลึกต่อ"'));
  await next();
}
