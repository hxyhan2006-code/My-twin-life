// หน้าสัมภาษณ์: เลือกหมวด → ให้ AI สัมภาษณ์สดแบบแชต (เซฟทุกคำตอบทันที จด "ข้อเท็จจริง" ให้แก้ได้)

import { getAll, put, del, kvGet, kvSet, uid } from './db.js';
import { CATEGORIES, BASE_QUESTIONS, categoryById, groupOfCat } from './questions.js';
import { interviewTurn } from './interviewer.js';
import { sameish } from './profile.js';
import { createComposer } from './composer.js';
import { createTypewriter } from './typewriter.js';
import { getSettings, needsSetup } from './state.js';
import { guardBudget } from './usage.js';
import { mdToHtml } from './md.js';
import { h, toast, iconEl, popMenu, fadeTail } from './ui.js';

async function load() {
  const [answers, memories, skipped] = await Promise.all([getAll('answers'), getAll('memories'), kvGet('skipped', [])]);
  return { answers, memories, skipped: new Set(skipped) };
}

// ประเด็นตั้งต้นของหมวดที่ยังไม่ได้ตอบ/ไม่ได้ข้าม (ให้ AI เลือกหยิบตามบทสนทนา ไม่ได้ถามตามลำดับ)
const seedsFor = (cat, { answers, skipped }) => {
  const done = new Set(answers.map((a) => a.qid));
  return BASE_QUESTIONS.filter((q) => q.category === cat && !done.has(q.id) && !skipped.has(q.id));
};

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
  page.append(h('p', { class: 'hint' }, 'เลือกหมวดแล้วคุยกับผู้สัมภาษณ์ AI เหมือนคุยกับเพื่อนที่เป็นนักจิตวิทยา เขาจะถามทีละข้อ ฟังแล้วถามต่อจากเรื่องที่เราเล่า ยิ่งเล่าเป็นเหตุการณ์จริงยิ่งทำให้ twin เหมือนเรา ทุกคำตอบเซฟทันที หยุดแล้วกลับมาต่อได้'));
  const card = h('div', { class: 'card' });
  for (const c of CATEGORIES) {
    const answered = data.answers.filter((a) => a.category === c.id).length;
    const total = c.questions.length;
    const pct = Math.min(100, Math.round((answered / total) * 100));
    card.append(
      h('a', { class: 'row', href: `#/interview/${c.id}` },
        iconEl(c.icon, 'ico lead'),
        h('span', { class: 'grow' }, h('b', {}, c.name),
          h('small', {}, answered ? `คุยแล้ว ${answered} ข้อ` : 'ยังไม่ได้เริ่ม'),
          h('span', { class: 'bar' }, h('i', { style: `width:${pct}%` }))),
        iconEl('chevron')),
    );
  }
  page.append(card, h('p', { class: 'hint' }, `รวมตอบแล้ว ${data.answers.length} ข้อ · พอคุยพอสมควรแล้ว ไปที่ "แก่นตัวตน" ในหน้าโปรไฟล์เพื่อสร้างตัวตนหลัก`));
  root.append(page);
}

async function renderThread(root, c, ctx) {
  ctx.setTitle(c.name);
  const list = h('div', { class: 'msgs' });
  const chipsEl = h('div', { class: 'chips' });
  const composer = createComposer({ placeholder: 'พิมพ์ตอบ… เล่าเป็นเรื่องได้เลย', onSubmit: () => submit(composer.input.value.trim()) });
  root.append(list, chipsEl, composer.el);

  const s0 = await getSettings();
  const warn = needsSetup(s0);
  if (warn) {
    list.append(h('div', { class: 'empty' }, h('a', { class: 'banner', href: '#/settings' }, `${warn} — แตะเพื่อไปตั้งค่า ผู้สัมภาษณ์ AI ต้องใช้โมเดลถึงจะคุยได้`)));
    ctx.setRight(null);
    return;
  }

  let data = await load();
  let answeredHere = data.answers.filter((a) => a.category === c.id).length;
  const session = []; // [{q, a}] ของรอบนี้
  let currentQ = ''; // คำถามที่กำลังรอคำตอบ
  let currentQid = null; // ถ้าเป็นข้อสำเร็จรูป (ตอน AI ใช้ไม่ได้) จะเก็บ id ไว้ให้นับว่าตอบแล้ว
  let busy = false;
  let ended = false;

  const toBottom = () => list.scrollTo({ top: list.scrollHeight });
  const say = (kids, cls = '') => { const el = h('div', { class: `msg ai in ${cls}` }, kids); list.append(el); toBottom(); return el; };
  const mine = (text) => { list.append(h('div', { class: 'msg user in' }, h('div', { class: 'bub' }, text))); toBottom(); };
  const paintHeader = () => ctx.setRight(h('a', { class: 'chip', href: `#/brain/${groupOfCat(c.id)}` }, `ตอบแล้ว ${answeredHere} · ดู/แก้`));

  function setChips(choices = []) {
    chipsEl.innerHTML = '';
    if (ended) return;
    for (const t of choices) chipsEl.append(h('button', { class: 'chip', onclick: () => submit(t) }, t));
    chipsEl.append(
      h('button', { class: 'chip ghost', onclick: () => skip() }, 'ข้ามข้อนี้'),
      h('button', { class: 'chip ghost', onclick: () => wrap() }, 'พอแค่นี้ก่อน'),
    );
  }

  // ข้อเท็จจริงที่ AI จดจากคำตอบล่าสุด: แตะเพื่อแก้/ลบ
  async function noteFacts(all) {
    // ไม่จดซ้ำกับที่มีอยู่แล้ว (AI บางทีเล่าเรื่องเดิมซ้ำ)
    const facts = all.filter((f) => !data.memories.some((m) => sameish(m.text, f)));
    if (!facts.length) return;
    const card = h('div', { class: 'noted in' }, h('div', { class: 'nt' }, iconEl('check'), 'จดไว้แล้ว'));
    for (const text of facts) {
      const m = { id: uid(), text, group: groupOfCat(c.id), category: c.id, source: 'interview', createdAt: Date.now() };
      await put('memories', m);
      const btn = h('button', { onclick: () => popMenu(btn, [
        { label: 'แก้ไข', icon: 'pencil', onClick: async () => {
          const t = prompt('แก้ข้อความที่จดไว้', m.text);
          if (!t || !t.trim()) return;
          m.text = t.trim();
          await put('memories', m);
          btn.textContent = `• ${m.text}`;
        } },
        { label: 'ลบ', icon: 'trash', danger: true, onClick: async () => { await del('memories', m.id); btn.remove(); if (!card.querySelector('button')) card.remove(); } },
      ], { align: 'left' }) }, `• ${text}`);
      card.append(btn);
    }
    list.append(card);
    toBottom();
  }

  // เผยข้อความของ AI ทีละนิดแบบเดียวกับหน้าแชต
  async function sayAi(reply) {
    const text = [reply.reflect, reply.question].filter(Boolean).join('\n\n');
    const body = h('div', { class: 'md' });
    const el = say(body, reply.question ? 'qmsg' : '');
    const tw = createTypewriter({ onFrame: (t) => { body.innerHTML = mdToHtml(t); fadeTail(body); toBottom(); } });
    tw.push(text);
    await tw.finish();
    body.innerHTML = mdToHtml(text);
    if (reply.reflect && reply.question) body.firstElementChild?.classList.add('reflect');
    return el;
  }

  // ข้อสำเร็จรูป (ใช้เมื่อ AI ตอบไม่ได้ เช่น เน็ตหลุด) · คืน null ถ้าไม่เหลือแล้ว
  async function seedFallback() {
    data = await load();
    return seedsFor(c.id, data)[0] || null;
  }

  async function aiTurn(mode) {
    if (!(await guardBudget())) { busy = false; setChips(); return; }
    busy = true;
    chipsEl.innerHTML = '';
    const dots = say(h('div', { class: 'md' }, h('span', { class: 'pulse' })));
    let reply;
    try {
      data = await load();
      const s = await getSettings();
      reply = await interviewTurn({
        settings: s, cat: c, answers: data.answers, memories: data.memories,
        seeds: seedsFor(c.id, data).map((q) => q.question), core: await kvGet('coreProfile', ''), session, mode,
      });
    } catch (e) {
      dots.remove();
      const seed = await seedFallback();
      say(h('div', { class: 'md' }, h('p', { class: 'err' }, e.message)));
      chipsEl.innerHTML = '';
      chipsEl.append(
        h('button', { class: 'chip', onclick: () => { chipsEl.innerHTML = ''; aiTurn(mode); } }, 'ลองใหม่'),
        seed && h('button', { class: 'chip', onclick: () => { currentQ = seed.question; currentQid = seed.id; say(h('div', { class: 'md' }, h('p', {}, seed.question)), 'qmsg'); setChips(); } }, 'ใช้คำถามสำเร็จรูปแทน'),
      );
      busy = false;
      return;
    }
    dots.remove();
    await noteFacts(reply.facts);
    if (!reply.question && !reply.reflect) {
      const seed = await seedFallback();
      reply.question = seed ? seed.question : 'หมวดนี้คุยกันได้ครบแล้ว';
      currentQid = seed?.id || null;
    }
    await sayAi(reply);
    currentQ = reply.question;
    if (mode === 'wrap' || reply.done) {
      ended = true;
      say(h('div', { class: 'btns left' },
        h('a', { class: 'btn primary', href: '#/interview' }, 'เลือกหมวดอื่น'),
        h('a', { class: 'btn', href: `#/brain/${groupOfCat(c.id)}` }, 'ดู/แก้ที่จดไว้')));
    }
    setChips(reply.choices);
    busy = false;
    composer.input.focus();
  }

  async function submit(text) {
    if (busy || ended || !text) return;
    busy = true;
    const rec = { id: uid(), qid: currentQid || `ai-${uid()}`, category: c.id, question: currentQ || '(เล่าเอง)', answer: text, createdAt: Date.now(), updatedAt: Date.now() };
    await put('answers', rec);
    answeredHere++;
    paintHeader();
    session.push({ q: currentQ || '(เล่าเอง)', a: text });
    currentQid = null;
    mine(text);
    composer.clear();
    await aiTurn('answer');
  }

  async function skip() {
    if (busy || ended) return;
    if (currentQid) await kvSet('skipped', [...new Set([...(await kvGet('skipped', [])), currentQid])]);
    say(h('small', { class: 'dim' }, 'ข้ามข้อนี้'));
    currentQid = null;
    await aiTurn('skip');
  }

  async function wrap() {
    if (busy || ended) return;
    await aiTurn('wrap');
  }

  paintHeader();
  say(h('small', { class: 'dim' }, 'เล่าเท่าที่อยากเล่า ไม่มีถูกผิด ข้ามได้ทุกข้อ แตะ "พอแค่นี้ก่อน" เมื่อไหร่ก็ได้'));
  await aiTurn('start');
}
