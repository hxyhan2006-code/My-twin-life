// โครงแอพ: แถบบน · เมนูข้าง · สลับหน้าด้วย #hash

import { del } from './db.js';
import { renderChat, listChats } from './chat.js';
import { renderInterview } from './interview.js';
import { renderMemory } from './memory.js';
import { renderSettings } from './settings.js';
import { h, iconEl, toast } from './ui.js';

const top = document.getElementById('top');
const view = document.getElementById('view');
const drawer = document.getElementById('drawer');
const scrim = document.getElementById('scrim');

const titleEl = h('div', { class: 'title' });
const rightSlot = h('div', { class: 'right' });
const menuBtn = h('button', { class: 'round', title: 'เมนู', onclick: () => openDrawer(true) }, iconEl('menu'));
top.append(menuBtn, titleEl, rightSlot);

function openDrawer(on) {
  drawer.classList.toggle('open', on);
  scrim.classList.toggle('open', on);
  if (on) refreshDrawer();
}
scrim.addEventListener('click', () => openDrawer(false));

const ctx = {
  setTitle: (t) => { titleEl.textContent = t; },
  setRight: (el) => { rightSlot.innerHTML = ''; if (el) rightSlot.append(el); },
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  refreshDrawer,
};

const NAV = [
  ['#/chat', 'chat', 'แชต'],
  ['#/interview', 'interview', 'สัมภาษณ์'],
  ['#/memory', 'memory', 'ความจำ'],
  ['#/settings', 'settings', 'ตั้งค่า'],
];

async function refreshDrawer() {
  const chats = await listChats();
  const cur = location.hash.match(/^#\/chat\/(.+)/)?.[1];
  drawer.innerHTML = '';
  drawer.append(
    h('div', { class: 'dhead' }, 'Twin'),
    h('nav', {}, NAV.map(([href, icon, label]) =>
      h('a', { class: 'nav' + (location.hash.startsWith(href) ? ' on' : ''), href, onclick: () => openDrawer(false) }, iconEl(icon), label))),
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
  top.classList.toggle('plain', page !== 'chat');
  try {
    if (page === 'interview') await renderInterview(root, { cat: arg }, ctx);
    else if (page === 'memory') await renderMemory(root, { tab: arg }, ctx);
    else if (page === 'settings') await renderSettings(root, {}, ctx);
    else await renderChat(root, { id: arg }, ctx);
  } catch (e) {
    if (my === token) { root.append(h('div', { class: 'page' }, h('p', { class: 'err' }, `เปิดหน้านี้ไม่ได้: ${e.message}`))); }
  }
}

window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/chat';
else route();

// ขอให้เบราว์เซอร์ไม่ลบข้อมูลของแอพนี้เองตอนที่เก็บเต็ม (ไม่การันตี ยังต้องสำรองไฟล์)
navigator.storage?.persist?.().catch(() => {});
window.addEventListener('error', (e) => toast(`ผิดพลาด: ${e.message}`, 5000));
