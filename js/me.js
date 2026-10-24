// หน้าโปรไฟล์: ศูนย์รวมสมองของ Twin · สัมภาษณ์ · ตั้งค่า

import { getAll } from './db.js';
import { GROUPS, BASE_QUESTIONS, groupById, groupOfCat } from './questions.js';
import { getSettings } from './state.js';
import { h, iconEl } from './ui.js';
import { loadGoals } from './goals.js';

const row = (href, icon, title, sub) =>
  h('a', { class: 'row', href },
    iconEl(icon, 'ico lead'),
    h('span', { class: 'grow' }, h('b', {}, title), sub && h('small', {}, sub)),
    iconEl('chevron'));

export async function renderMe(root, _p, ctx) {
  ctx.setTitle('');
  ctx.setRight(null);
  const [s, answers, mems] = await Promise.all([getSettings(), getAll('answers'), getAll('memories')]);
  const count = Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
  for (const a of answers) count[groupOfCat(a.category)]++;
  for (const m of mems) count[groupById(m.group) ? m.group : 'other']++;

  const activeGoals = (await loadGoals()).filter((g) => g.status === 'active').length;
  const unchecked = mems.filter((m) => m.source === 'chat' && !m.reviewed).length;

  const page = h('div', { class: 'page' });
  page.append(
    h('div', { class: 'mehead' },
      h('div', { class: 'avatar' }, [...s.userName][0] || 'H'),
      h('div', { class: 'mename' }, s.userName),
      h('small', {}, `ตอบสัมภาษณ์ ${answers.length}/${BASE_QUESTIONS.length}+ ข้อ · ความจำ ${mems.length} เรื่อง`)),
    h('h3', {}, 'Twin ของฉัน'),
    h('div', { class: 'card' },
      row('#/brain/core', 'gem', 'แก่นตัวตน', 'ตัวตนหลักที่ twin อ่านทุกครั้งที่คุย'),
      row('#/brain/goals', 'flag', 'เป้าหมายและแผน', activeGoals ? `กำลังทำ ${activeGoals} เรื่อง` : 'บอก twin ว่าเราอยากไปทางไหน'),
      row('#/brain/style', 'chat', 'สไตล์การพูดของเรา', 'AI เรียนรู้วิธีพูดและวิธีคิดจากที่เราพิมพ์จริง'),
      row('#/interview', 'askchat', 'สัมภาษณ์', 'ตอบคำถามเพื่อให้ twin รู้จักเรามากขึ้น'),
      row('#/brain/chatmem', 'check', 'ตรวจที่จำจากแชต', unchecked ? `รอตรวจ ${unchecked} เรื่อง` : 'ดูว่า AI จดอะไรจากที่เราคุย')),
    h('h3', {}, 'สมองของ Twin'),
    h('div', { class: 'card' }, GROUPS.map((g) => row(`#/brain/${g.id}`, g.icon, g.name, `${count[g.id]} รายการ`))),
    h('h3', {}, 'ระบบ'),
    h('div', { class: 'card' },
      row('#/settings', 'settings', 'ตั้งค่า', 'OpenRouter key · โมเดล · สำรอง/นำเข้าข้อมูล')),
  );
  root.append(page);
}
