// หน้าโปรไฟล์: ศูนย์รวมสมองของ Twin · สัมภาษณ์ · ตั้งค่า

import { getAll } from './db.js';
import { GROUPS, BASE_QUESTIONS, groupById, groupOfCat } from './questions.js';
import { getSettings } from './state.js';
import { h, iconEl } from './ui.js';

const row = (href, emoji, title, sub) =>
  h('a', { class: 'row', href },
    h('span', { class: 'emoji' }, emoji),
    h('span', { class: 'grow' }, h('b', {}, title), sub && h('small', {}, sub)),
    iconEl('chevron'));

export async function renderMe(root, _p, ctx) {
  ctx.setTitle('');
  ctx.setRight(null);
  const [s, answers, mems] = await Promise.all([getSettings(), getAll('answers'), getAll('memories')]);
  const count = Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
  for (const a of answers) count[groupOfCat(a.category)]++;
  for (const m of mems) count[groupById(m.group) ? m.group : 'other']++;

  const page = h('div', { class: 'page' });
  page.append(
    h('div', { class: 'mehead' },
      h('div', { class: 'avatar' }, [...s.userName][0] || 'H'),
      h('div', { class: 'mename' }, s.userName),
      h('small', {}, `ตอบสัมภาษณ์ ${answers.length}/${BASE_QUESTIONS.length}+ ข้อ · ความจำ ${mems.length} เรื่อง`)),
    h('h3', {}, 'Twin ของฉัน'),
    h('div', { class: 'card' },
      row('#/brain/core', '🧬', 'แก่นตัวตน', 'ตัวตนหลักที่ twin อ่านทุกครั้งที่คุย'),
      row('#/interview', '🎤', 'สัมภาษณ์', 'ตอบคำถามเพื่อให้ twin รู้จักเรามากขึ้น')),
    h('h3', {}, 'สมองของ Twin'),
    h('div', { class: 'card' }, GROUPS.map((g) => row(`#/brain/${g.id}`, g.emoji, g.name, `${count[g.id]} รายการ`))),
    h('h3', {}, 'ระบบ'),
    h('div', { class: 'card' },
      row('#/settings', '⚙️', 'ตั้งค่า', 'OpenRouter key · โมเดล · สำรอง/นำเข้าข้อมูล')),
  );
  root.append(page);
}
