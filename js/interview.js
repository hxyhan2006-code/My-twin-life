// หน้าสัมภาษณ์: เลือกหมวด → ตอบทีละข้อ (เซฟทันทีทุกข้อ) · AI ถามเจาะลึกต่อได้

import { getAll, put, del, kvGet, kvSet, uid } from './db.js';
import { CATEGORIES, BASE_QUESTIONS, categoryById } from './questions.js';
import { followUps } from './profile.js';
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
  return renderQuestion(root, c, ctx);
}

function renderCategories(root, data, ctx) {
  ctx.setTitle('สัมภาษณ์');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  page.append(h('p', { class: 'hint' }, 'ตอบทีละข้อ ยิ่งละเอียดและตรงยิ่งทำให้ twin เหมือนเรา ทุกคำตอบเซฟทันที หยุดแล้วกลับมาต่อได้ ข้ามข้อที่ไม่อยากตอบได้'));
  const card = h('div', { class: 'card' });
  for (const c of CATEGORIES) {
    const total = BASE_QUESTIONS.filter((q) => q.category === c.id).length;
    const answered = data.answers.filter((a) => a.category === c.id).length;
    const left = queueFor(c.id, data).length;
    card.append(
      h('a', { class: 'row', href: `#/interview/${c.id}` },
        h('span', { class: 'emoji' }, c.emoji),
        h('span', { class: 'grow' }, h('b', {}, c.name), h('small', {}, `ตอบแล้ว ${answered} ข้อ · เหลือ ${left} ข้อ ในคิว (พื้นฐานทั้งหมด ${total})`)),
        iconEl('chevron')),
    );
  }
  page.append(card);
  page.append(h('p', { class: 'hint' }, `รวมตอบแล้ว ${data.answers.length} ข้อ · พอตอบพอสมควรแล้ว ไปที่ "ความจำ" เพื่อสร้างแก่นตัวตน`));
  root.append(page);
}

async function renderQuestion(root, c, ctx) {
  ctx.setTitle(c.name);
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);

  async function show() {
    page.innerHTML = '';
    const data = await load();
    const queue = queueFor(c.id, data);
    const skippedHere = BASE_QUESTIONS.filter((q) => q.category === c.id && data.skipped.has(q.id));
    const answeredList = data.answers.filter((a) => a.category === c.id).sort((a, b) => b.updatedAt - a.updatedAt);

    if (!queue.length) {
      page.append(h('div', { class: 'card pad' }, h('b', {}, 'หมวดนี้ตอบครบแล้ว 🎉'), h('p', { class: 'hint' }, 'ถ้าอยากให้ละเอียดขึ้น เปิดดูคำตอบเดิมด้านล่างแล้วกด "ถามเจาะลึก" ได้')));
    } else {
      const q = queue[0];
      const ta = h('textarea', { class: 'big', rows: 5, placeholder: 'พิมพ์คำตอบ… ยิ่งละเอียดยิ่งดี' });
      const status = h('small', { class: 'hint' }, `ข้อนี้เป็น 1 ใน ${queue.length} ข้อที่เหลือ${q.parent ? ' (AI ถามเจาะลึก)' : ''}`);
      const save = async (andFollow) => {
        const text = ta.value.trim();
        if (!text) return toast('ยังไม่ได้พิมพ์คำตอบ');
        const rec = { id: uid(), qid: q.id, category: c.id, question: q.question, answer: text, createdAt: Date.now(), updatedAt: Date.now() };
        await put('answers', rec);
        await kvSet('followups', data.followups.filter((f) => f.id !== q.id));
        if (andFollow) await askFollow(rec);
        toast('บันทึกแล้ว');
        show();
      };
      page.append(
        h('div', { class: 'qcard' }, h('p', { class: 'q' }, q.question), ta, status),
        h('div', { class: 'btns' },
          h('button', { class: 'btn ghost', onclick: async () => {
            if (q.parent) await kvSet('followups', data.followups.filter((f) => f.id !== q.id));
            else await kvSet('skipped', [...data.skipped, q.id]);
            show();
          } }, 'ข้าม'),
          h('button', { class: 'btn ghost', onclick: () => save(true) }, 'บันทึก + ถามเจาะลึก'),
          h('button', { class: 'btn primary', onclick: () => save(false) }, 'บันทึก')),
      );
    }

    if (skippedHere.length) {
      page.append(h('button', { class: 'link', onclick: async () => {
        const ids = new Set(skippedHere.map((q) => q.id));
        await kvSet('skipped', [...data.skipped].filter((id) => !ids.has(id)));
        show();
      } }, `เอาคำถามที่ข้ามไว้ (${skippedHere.length}) กลับมา`));
    }

    if (answeredList.length) {
      page.append(h('h3', {}, `คำตอบของหมวดนี้ (${answeredList.length})`));
      const card = h('div', { class: 'card' });
      for (const a of answeredList) card.append(answerRow(a, show));
      page.append(card);
    }
  }

  async function askFollow(rec) {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) return toast(`${warn} ข้ามการถามเจาะลึก`);
    toast('AI กำลังคิดคำถามต่อ…', 8000);
    try {
      const qs = await followUps({ question: rec.question, answer: rec.answer, apiKey: s.apiKey, model: s.lightModel, name: s.userName });
      const cur = await kvGet('followups', []);
      const add = qs.map((question) => ({ id: 'fu-' + uid(), category: rec.category, question, parent: rec.id }));
      await kvSet('followups', [...add, ...cur]);
    } catch (e) {
      toast(e.message, 4000);
    }
  }

  function answerRow(a, refresh) {
    const row = h('div', { class: 'row col' });
    const view = () => {
      row.innerHTML = '';
      row.append(
        h('small', {}, a.question),
        h('p', { class: 'ans' }, a.answer),
        h('div', { class: 'btns small' },
          h('button', { class: 'link', onclick: edit }, 'แก้'),
          h('button', { class: 'link', onclick: async () => { await askFollow(a); refresh(); } }, 'ถามเจาะลึก'),
          h('button', { class: 'link danger', onclick: async () => {
            if (!confirm('ลบคำตอบนี้?')) return;
            await del('answers', a.id);
            refresh();
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
          a.answer = t; a.updatedAt = Date.now();
          await put('answers', a);
          view();
        } }, 'บันทึก')));
    };
    view();
    return row;
  }

  await show();
}
