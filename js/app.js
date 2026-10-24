// โครงแอพ: แถบบน · เมนูข้าง · สลับหน้าด้วย #hash

import { del, kvGet } from './db.js';
import { renderChat, listChats } from './chat.js';
import { renderInterview } from './interview.js';
import { renderMe } from './me.js';
import { renderBrain } from './brain.js';
import { renderSettings } from './settings.js';
import { h, iconEl, toast } from './ui.js';
import { applyFontSize } from './state.js';
import { setUsageSink } from './api.js';
import { recordUsage } from './usage.js';
import { APP_VERSION } from './version.js';

const top = document.getElementById('top');
const view = document.getElementById('view');
const drawer = document.getElementById('drawer');
const scrim = document.getElementById('scrim');

const titleEl = h('div', { class: 'title' });
const rightSlot = h('div', { class: 'right' });
const menuBtn = h('button', { class: 'round', title: 'เมนู', onclick: () => openDrawer(true) }, iconEl('menu'));
const backBtn = h('button', { class: 'round', title: 'ย้อนกลับ' }, iconEl('back'));
top.append(menuBtn, backBtn, titleEl, rightSlot);

// หน้าลูกกดย้อนกลับไปหน้าแม่ (ไม่ใช้ history เพื่อให้ไม่วนเมื่อเปิดจากลิงก์ตรง)
function parentOf(page, arg) {
  if (page === 'me') return '#/chat';
  if (page === 'interview') return arg ? '#/interview' : '#/me';
  if (page === 'brain' || page === 'settings') return '#/me';
  return null;
}

function openDrawer(on) {
  drawer.classList.toggle('open', on);
  scrim.classList.toggle('open', on);
  if (on) refreshDrawer();
}
scrim.addEventListener('click', () => openDrawer(false));

const ctx = {
  setTitle: (t) => { titleEl.replaceChildren(t); },
  setRight: (el) => { rightSlot.innerHTML = ''; if (el) rightSlot.append(el); },
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  refreshDrawer,
};

async function refreshDrawer() {
  const [chats, userName] = await Promise.all([listChats(), kvGet('userName', 'Han')]);
  const cur = location.hash.match(/^#\/chat\/(.+)/)?.[1];
  drawer.innerHTML = '';
  drawer.append(
    h('div', { class: 'dhead' }, 'Twin', h('span', { class: 'ver' }, `v${APP_VERSION}`)),
    h('a', { class: 'nav on', href: '#/chat', onclick: () => { openDrawer(false); if (location.hash === '#/chat') ctx.go('#/chat'); } }, iconEl('newChat'), 'แชตใหม่'),
    h('div', { class: 'dsec' }, 'แชตที่ผ่านมา'),
    h('div', { class: 'chats' }, chats.length
      ? chats.map((c) => h('div', { class: 'crow' + (c.id === cur ? ' on' : '') },
        h('a', { href: `#/chat/${c.id}`, onclick: () => openDrawer(false) }, c.title),
        h('button', { class: 'x', title: 'ลบแชต', onclick: async () => {
          if (!confirm(`ลบแชต "${c.title}"?`)) return;
          await del('chats', c.id);
          if (c.id === cur) ctx.go('#/chat'); else refreshDrawer();
        } }, iconEl('trash'))))
      : h('small', { class: 'hint' }, 'ยังไม่มีแชต')),
    h('a', { class: 'dprofile', href: '#/me', onclick: () => openDrawer(false) },
      h('div', { class: 'avatar sm' }, [...userName][0] || 'H'),
      h('span', { class: 'grow' }, h('b', {}, userName), h('small', {}, 'สมองของ Twin · ตั้งค่า')),
      iconEl('chevron')),
  );
}

let token = 0;
async function route() {
  const my = ++token;
  openDrawer(false);
  const [, page = 'chat', arg] = location.hash.split('/');
  const root = h('div', { class: 'viewroot' });
  view.innerHTML = '';
  view.append(root);
  const parent = parentOf(page, arg);
  menuBtn.hidden = !!parent;
  backBtn.hidden = !parent;
  backBtn.onclick = () => ctx.go(parent);
  try {
    if (page === 'interview') await renderInterview(root, { cat: arg }, ctx);
    else if (page === 'me') await renderMe(root, {}, ctx);
    else if (page === 'brain') await renderBrain(root, { id: arg }, ctx);
    else if (page === 'settings') await renderSettings(root, {}, ctx);
    else await renderChat(root, { id: arg }, ctx);
  } catch (e) {
    if (my === token) { root.append(h('div', { class: 'page' }, h('p', { class: 'err' }, `เปิดหน้านี้ไม่ได้: ${e.message}`))); }
  }
}

applyFontSize();
setUsageSink(recordUsage);
window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/chat';
else route();

// ขอให้เบราว์เซอร์ไม่ลบข้อมูลของแอพนี้เองตอนที่เก็บเต็ม (ไม่การันตี ยังต้องสำรองไฟล์)
navigator.storage?.persist?.().catch(() => {});
window.addEventListener('error', (e) => toast(`ผิดพลาด: ${e.message}`, 5000));
