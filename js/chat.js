// หน้าแชตกับ twin

import { getAll, getOne, put, del, kvGet, uid } from './db.js';
import { chatStream } from './api.js';
import { rank } from './retrieve.js';
import { buildSystem } from './prompt.js';
import { mdToHtml } from './md.js';
import { extractMemories } from './profile.js';
import { learnStyle } from './style.js';
import { createTypewriter } from './typewriter.js';
import { createComposer } from './composer.js';
import { getSettings, needsSetup } from './state.js';
import { guardBudget } from './usage.js';
import { h, toast, iconEl, popMenu, copyText, fadeTail, keepBottomOnResize } from './ui.js';

const HISTORY = 20; // ส่งข้อความล่าสุดกี่ข้อความให้ AI
const MEMORIZE_EVERY = 4; // ทุกกี่ข้อความของเรา ให้ AI ดึงความจำใหม่
const STARTERS = [
  ['bulb', 'ช่วยคิดเรื่องที่กำลังลังเล'],
  ['book', 'ทบทวนวันนี้ของเรา'],
  ['calendar', 'วางแผนสัปดาห์นี้'],
];

export async function renderChat(root, { id }, ctx) {
  let chat = id ? await getOne('chats', id) : null;
  if (id && !chat) return ctx.go('#/chat');
  chat = chat || { id: uid(), title: 'แชตใหม่', messages: [], createdAt: Date.now(), updatedAt: Date.now(), memorizedAt: 0, isNew: true };

  const list = h('div', { class: 'msgs' });
  let deep = false; // โหมดคิดลึก: เปิดเองทีละครั้ง ปิดไว้ตอนเข้าหน้าแชตใหม่ จะได้ไม่เปลืองโดยไม่รู้ตัว
  const composer = createComposer({
    placeholder: 'พิมพ์คุยกับตัวเอง…',
    onSubmit: (viaKey) => onSubmit(viaKey),
    toggle: { label: 'คิดลึก', title: 'คิดลึก: ใช้โมเดลที่เก่งกว่า ตอบช้ากว่าและแพงกว่าปกติ', onChange: (on) => {
      deep = on;
      toast(on ? 'เปิดคิดลึก: ตอบช้าลงและแพงกว่าปกติ ใช้กับเรื่องสำคัญ' : 'ปิดคิดลึกแล้ว');
    } },
  });
  const { input } = composer;
  const toEnd = h('button', { class: 'toend', title: 'ไปล่างสุด', hidden: true, onclick: () => toBottom(true) }, iconEl('down'));
  root.append(h('div', { class: 'msgwrap' }, list, toEnd), composer.el);

  let sending = false; // กันส่งซ้อนระหว่างรอโหลดข้อมูลก่อนเริ่มสตรีม
  let current = null; // {abort, tw} ของรอบที่กำลังตอบ

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const toBottom = (smooth = false) => list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  keepBottomOnResize(list);
  list.addEventListener('scroll', () => { toEnd.hidden = list.scrollHeight - list.scrollTop - list.clientHeight < 300; }, { passive: true });

  // ---------- แถบบน ----------
  function setHeader() {
    ctx.setTitle(chat.isNew ? 'Twin' : chat.title);
    const more = h('button', { class: 'round flat', title: 'เพิ่มเติม', onclick: () => popMenu(more, [
      { label: 'เปลี่ยนชื่อแชต', icon: 'pencil', onClick: async () => {
        const t = prompt('ชื่อแชต', chat.title);
        if (!t || !t.trim()) return;
        chat.title = t.trim().slice(0, 60);
        await put('chats', chat);
        setHeader();
        ctx.refreshDrawer();
      } },
      { label: 'ลบแชต', icon: 'trash', danger: true, onClick: async () => {
        if (!confirm(`ลบแชต "${chat.title}"?`)) return;
        await del('chats', chat.id);
        ctx.refreshDrawer();
        ctx.go('#/chat');
      } },
    ]) }, iconEl('dots'));
    const add = h('button', { class: 'round flat', title: 'แชตใหม่', onclick: () => ctx.go('#/chat') }, iconEl('newChat'));
    ctx.setRight(h('div', { class: 'pillbtns' }, add, !chat.isNew && more));
  }

  // ---------- ข้อความ ----------
  const actionBtn = (icon, title, onClick, cls = '') => h('button', { class: `act ${cls}`, title, onclick: onClick }, iconEl(icon));

  function userBubble(m) {
    const wrap = h('div', { class: 'msg user' }, h('div', { class: 'bub' }, m.content));
    const acts = h('div', { class: 'actions right' },
      actionBtn('copy', 'คัดลอก', () => copyText(m.content)),
      actionBtn('pencil', 'แก้ไขข้อความ', () => editUser(m, wrap)));
    return h('div', { class: 'umsg' }, wrap, acts);
  }

  function aiBubble(m, { retry = false } = {}) {
    const body = h('div', { class: 'md' });
    body.innerHTML = mdToHtml(m.content);
    const el = h('div', { class: 'msg ai' }, body);
    if (m.error) el.append(h('div', { class: 'err' }, m.error));
    const acts = h('div', { class: 'actions' }, actionBtn('copy', 'คัดลอก', () => copyText(m.content)));
    if (retry) acts.append(actionBtn('retry', 'ลองใหม่', () => regen(), 'act-retry'));
    if (m.content) el.append(acts);
    if (m.used && m.used.length) {
      el.append(h('details', { class: 'used' }, h('summary', {}, `ใช้ความจำ ${m.used.length} ชิ้น`), m.used.map((u) => h('p', {}, u))));
    }
    return el;
  }

  function renderMessages() {
    list.innerHTML = '';
    chat.messages.forEach((m, i) => list.append(m.role === 'user' ? userBubble(m) : aiBubble(m, { retry: i === chat.messages.length - 1 })));
    toBottom();
  }

  // แก้ข้อความ: ดึงข้อความมาใส่ช่องพิมพ์ด้านล่าง (มีแถบ "กำลังแก้ไข") กดส่ง = ตัดข้อความนี้และที่ตามหลังทิ้งแล้วตอบใหม่
  let editing = null;
  function stopEdit() {
    editing = null;
    list.querySelector('.umsg.editing')?.classList.remove('editing');
    composer.setNotice(null);
  }
  function editUser(m, wrap) {
    if (sending) return toast('รอให้ตอบเสร็จก่อน');
    stopEdit();
    editing = m;
    wrap.parentElement.classList.add('editing');
    composer.setNotice('กำลังแก้ไขข้อความ · ส่งแล้วจะตอบใหม่จากจุดนี้', () => { stopEdit(); composer.clear(); });
    input.value = m.content;
    composer.autosize();
    input.focus();
  }

  async function showEmpty() {
    const s = await getSettings();
    const [answers, mems, lastBackup] = await Promise.all([getAll('answers'), getAll('memories'), kvGet('lastBackupAt', 0)]);
    const box = h('div', { class: 'empty' });
    const warn = needsSetup(s);
    if (warn) box.append(h('a', { class: 'banner', href: '#/settings' }, `${warn} — แตะเพื่อไปตั้งค่า`));
    else if (!answers.length && !mems.length) box.append(h('a', { class: 'banner', href: '#/interview' }, 'ยังไม่มีข้อมูลตัวตน — แตะเพื่อไปสัมภาษณ์ก่อน twin จะเหมือนเรา'));
    if (answers.length + mems.length > 0 && Date.now() - lastBackup > 7 * 864e5) {
      box.append(h('a', { class: 'banner warn', href: '#/settings' }, 'ยังไม่ได้สำรองข้อมูลเกิน 7 วัน (ล้างเบราว์เซอร์แล้วข้อมูลหาย) — แตะเพื่อสำรอง'));
    }
    box.append(h('h2', {}, 'เริ่มจากไหนดี'));
    for (const [icon, text] of STARTERS) {
      box.append(h('button', { class: 'starter', onclick: () => { input.value = text + ' '; input.focus(); composer.autosize(); } }, iconEl(icon, 'ico lead sm'), text));
    }
    list.append(box);
  }

  async function memorize(s, mems) {
    const userCount = chat.messages.filter((m) => m.role === 'user').length;
    if (!s.apiKey || userCount - (chat.memorizedAt || 0) < MEMORIZE_EVERY) return;
    const recent = chat.messages.slice(-MEMORIZE_EVERY * 2).filter((m) => !m.error);
    try {
      const fresh = await extractMemories({ messages: recent, existing: mems.map((m) => m.text), apiKey: s.apiKey, model: s.lightModel, name: s.userName });
      chat.memorizedAt = userCount;
      await put('chats', chat);
      for (const { text, group } of fresh) await put('memories', { id: uid(), text, group, source: 'chat', chatId: chat.id, createdAt: Date.now() });
      if (fresh.length) toast(`จำเพิ่ม ${fresh.length} เรื่อง`);
    } catch { /* ดึงความจำพลาดไม่เป็นไร รอบหน้าลองใหม่ */ }
  }

  // ---------- ส่ง / ตอบ ----------
  async function run(text) {
    if (sending) return;
    sending = true;
    composer.setBusy(true);
    try {
      await turn(text);
    } finally {
      sending = false;
      composer.setBusy(false);
      current = null;
    }
  }
  const send = (text) => run(text);

  function regen() {
    if (sending) return;
    while (chat.messages.length && chat.messages.at(-1).role !== 'user') chat.messages.pop();
    if (!chat.messages.length) return;
    renderMessages();
    run(null);
  }

  // text = null → ตอบใหม่จากข้อความล่าสุดของเรา (ลองใหม่)
  async function turn(text) {
    if (!(await guardBudget())) return;
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) { toast(warn); return ctx.go('#/settings'); }
    list.querySelector('.empty')?.remove();
    if (text !== null) {
      chat.isNew = false;
      chat.messages.push({ role: 'user', content: text, ts: Date.now() });
      if (chat.title === 'แชตใหม่') chat.title = text.slice(0, 40);
      list.append(userBubble(chat.messages.at(-1)));
      composer.clear();
    }
    list.querySelectorAll('.act-retry').forEach((x) => x.remove());
    setHeader();
    toBottom();

    const [answers, mems, core, style, samples] = await Promise.all([getAll('answers'), getAll('memories'), kvGet('coreProfile', ''), kvGet('styleProfile', ''), kvGet('styleSamples', [])]);
    const userMsgs = chat.messages.filter((m) => m.role === 'user');
    const last = userMsgs.at(-1).content;
    const query = last + (last.length < 25 && userMsgs.length > 1 ? ' ' + userMsgs.at(-2).content : '');
    const pool = [
      ...answers.filter((a) => a.answer).map((a) => ({ text: `ถาม: ${a.question} ตอบ: ${a.answer}` })),
      ...mems.map((m) => ({ text: m.text })),
    ];
    const used = rank(query, pool).map((r) => r.it.text);
    const isDeep = deep;
    const system = buildSystem({ name: s.userName, core, style, samples, retrieved: used, deep: isDeep });
    const history = chat.messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));

    const ai = { role: 'assistant', content: '', used, ts: Date.now() };
    const body = h('div', { class: 'md' }, h('span', { class: 'pulse' }), isDeep && h('small', { class: 'hint' }, ' กำลังคิดลึก อาจรอสักพัก…'));
    const el = h('div', { class: 'msg ai' }, body);
    list.append(el);
    toBottom();

    const tw = createTypewriter({
      onFrame: (shown) => {
        const stick = nearBottom();
        body.innerHTML = mdToHtml(shown);
        fadeTail(body);
        if (stick) toBottom();
      },
    });
    current = { abort: new AbortController(), tw };
    composer.setBusy(true);

    let err = '';
    try {
      ai.content = await chatStream({
        apiKey: s.apiKey, model: isDeep ? s.deepModel : s.model, signal: current.abort.signal,
        extra: isDeep ? { reasoning: { effort: 'high' } } : {},
        messages: [{ role: 'system', content: system }, ...history],
        onDelta: (full) => { ai.content = full; tw.push(full); },
      });
    } catch (e) {
      err = e.name === 'AbortError' ? '' : e.message;
    }

    // บันทึกก่อน แล้วค่อยรอให้ข้อความเผยครบบนจอ (กันข้อมูลหายถ้าแท็บถูกพัก)
    if (ai.content) {
      chat.messages.push(ai);
      chat.updatedAt = Date.now();
      await put('chats', chat);
      ctx.refreshDrawer();
      setHeader();
    }
    if (err || !ai.content) tw.flush();
    else await tw.finish();

    if (!ai.content) {
      body.replaceChildren(h('div', { class: 'err' }, err || 'หยุดแล้ว'));
      if (err) body.append(h('button', { class: 'link', onclick: () => { el.remove(); regen(); } }, 'ลองใหม่'));
      return;
    }
    if (err) ai.error = err;
    el.replaceWith(aiBubble(ai, { retry: true }));
    if (!err) {
      memorize(s, mems);
      learnStyle(s).then((ok) => ok && toast('อัปเดตสไตล์การพูดของเราแล้ว')).catch(() => { /* วิเคราะห์พลาดไม่เป็นไร รอบหน้าลองใหม่ */ });
    }
  }

  function onSubmit(viaKey) {
    if (current) {
      if (viaKey) return;
      current.abort.abort();
      current.tw.flush();
      return;
    }
    const t = input.value.trim();
    if (sending || !t) return;
    if (editing) {
      chat.messages.length = chat.messages.indexOf(editing);
      stopEdit();
      renderMessages();
    }
    send(t);
  }

  setHeader();
  if (chat.messages.length) renderMessages();
  else await showEmpty();
}

export const listChats = async () => (await getAll('chats')).sort((a, b) => b.updatedAt - a.updatedAt);
