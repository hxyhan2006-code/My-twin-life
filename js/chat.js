// หน้าแชตกับ twin

import { getAll, getOne, put, kvGet, uid } from './db.js';
import { chatStream } from './api.js';
import { rank } from './retrieve.js';
import { buildSystem } from './prompt.js';
import { mdToHtml } from './md.js';
import { extractMemories } from './profile.js';
import { getSettings, needsSetup } from './state.js';
import { h, toast, iconEl } from './ui.js';

const HISTORY = 20; // ส่งข้อความล่าสุดกี่ข้อความให้ AI
const MEMORIZE_EVERY = 4; // ทุกกี่ข้อความของเรา ให้ AI ดึงความจำใหม่
const STARTERS = [
  ['🤔', 'ช่วยคิดเรื่องที่กำลังลังเล'],
  ['🪞', 'ทบทวนวันนี้ของเรา'],
  ['🗓️', 'วางแผนสัปดาห์นี้'],
];

export async function renderChat(root, { id }, ctx) {
  let chat = id ? await getOne('chats', id) : null;
  if (id && !chat) return ctx.go('#/chat');
  chat = chat || { id: uid(), title: 'แชตใหม่', messages: [], createdAt: Date.now(), updatedAt: Date.now(), memorizedAt: 0, isNew: true };
  ctx.setTitle(chat.isNew ? 'Twin' : chat.title);
  ctx.setRight(h('button', { class: 'round', title: 'แชตใหม่', onclick: () => ctx.go('#/chat') }, iconEl('newChat')));

  const list = h('div', { class: 'msgs' });
  const input = h('textarea', { rows: 1, placeholder: 'พิมพ์คุยกับตัวเอง…', enterKeyHint: 'enter' });
  const sendBtn = h('button', { class: 'send', title: 'ส่ง' }, iconEl('send', 'ico'));
  const composer = h('div', { class: 'composer' }, h('div', { class: 'pill' }, input, sendBtn));
  root.append(list, composer);

  let abort = null;
  let sending = false; // กันส่งซ้อนระหว่างที่รอโหลดข้อมูลก่อนเริ่มสตรีม
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  const bubble = (m) => {
    if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bub' }, m.content));
    const body = h('div', { class: 'md' });
    body.innerHTML = mdToHtml(m.content);
    const kids = [body];
    if (m.error) kids.push(h('div', { class: 'err' }, m.error));
    if (m.used && m.used.length) {
      const det = h('details', { class: 'used' }, h('summary', {}, `ใช้ความจำ ${m.used.length} ชิ้น`), m.used.map((u) => h('p', {}, u)));
      kids.push(det);
    }
    return h('div', { class: 'msg ai' }, kids);
  };

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
    for (const [emoji, text] of STARTERS) {
      box.append(h('button', { class: 'starter', onclick: () => { input.value = text + ' '; input.focus(); autosize(); } }, h('span', {}, emoji), text));
    }
    list.append(box);
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }
  input.addEventListener('input', autosize);

  const setBusy = (busy) => {
    sendBtn.innerHTML = '';
    sendBtn.append(iconEl(busy ? 'stop' : 'send', 'ico'));
    sendBtn.title = busy ? 'หยุด' : 'ส่ง';
    sendBtn.classList.toggle('busy', busy);
  };

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

  async function send(text) {
    if (sending) return;
    sending = true;
    try {
      await sendNow(text);
    } finally {
      sending = false;
    }
  }

  async function sendNow(text) {
    const s = await getSettings();
    const warn = needsSetup(s);
    if (warn) { toast(warn); return ctx.go('#/settings'); }
    if (chat.isNew) { chat.isNew = false; list.innerHTML = ''; }
    chat.messages.push({ role: 'user', content: text, ts: Date.now() });
    if (chat.title === 'แชตใหม่') chat.title = text.slice(0, 40);
    list.append(bubble(chat.messages.at(-1)));
    input.value = ''; autosize(); toBottom();

    const [answers, mems, core] = await Promise.all([getAll('answers'), getAll('memories'), kvGet('coreProfile', '')]);
    const userMsgs = chat.messages.filter((m) => m.role === 'user');
    const query = userMsgs.at(-1).content + (userMsgs.at(-1).content.length < 25 && userMsgs.length > 1 ? ' ' + userMsgs.at(-2).content : '');
    const pool = [
      ...answers.filter((a) => a.answer).map((a) => ({ text: `ถาม: ${a.question} ตอบ: ${a.answer}` })),
      ...mems.map((m) => ({ text: m.text })),
    ];
    const used = rank(query, pool).map((r) => r.it.text);
    const system = buildSystem({ name: s.userName, core, retrieved: used });
    const history = chat.messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));

    const ai = { role: 'assistant', content: '', used, ts: Date.now() };
    const el = h('div', { class: 'msg ai' }, h('div', { class: 'md' }, h('span', { class: 'dots' }, '…')));
    list.append(el);
    toBottom();
    abort = new AbortController();
    setBusy(true);
    let raf = 0;
    try {
      ai.content = await chatStream({
        apiKey: s.apiKey, model: s.model, signal: abort.signal,
        messages: [{ role: 'system', content: system }, ...history],
        onDelta: (full) => {
          ai.content = full;
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            const stick = nearBottom();
            el.firstChild.innerHTML = mdToHtml(ai.content);
            if (stick) toBottom();
          });
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') ai.error = ai.content ? '' : 'หยุดแล้ว';
      else ai.error = e.message;
    }
    if (raf) cancelAnimationFrame(raf);
    setBusy(false);
    abort = null;
    el.replaceWith(bubble(ai));
    if (ai.content || ai.error) {
      if (ai.content) chat.messages.push(ai);
      chat.updatedAt = Date.now();
      await put('chats', chat);
      ctx.setTitle(chat.title);
      ctx.refreshDrawer();
      if (ai.error && !ai.content) { input.value = text; autosize(); }
      else memorize(s, mems);
    }
  }

  sendBtn.addEventListener('click', () => {
    if (abort) return abort.abort();
    if (sending) return;
    const t = input.value.trim();
    if (t) send(t);
  });
  input.addEventListener('keydown', (e) => {
    // บนมือถือ Enter = ขึ้นบรรทัดใหม่ · บนคอมกด Enter ส่ง (Shift+Enter ขึ้นบรรทัด)
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      if (!sending && input.value.trim()) send(input.value.trim());
    }
  });

  if (chat.messages.length) {
    for (const m of chat.messages) list.append(bubble(m));
    toBottom();
  } else {
    await showEmpty();
  }
}

export const listChats = async () => (await getAll('chats')).sort((a, b) => b.updatedAt - a.updatedAt);
