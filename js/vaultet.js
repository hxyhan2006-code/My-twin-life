// ภาพการเงินจากแอพ Vaultet (อ่านอย่างเดียว) · Vaultet เขียนสรุปไว้ที่ localStorage 'vaultet_twin_snapshot_v1'
// ทั้งสองแอพเป็นเว็บบนโดเมนเดียวกัน (GitHub Pages ของ Han) จึงอ่านกันได้ · ตัวเลขทั้งหมดคำนวณฝั่ง Vaultet ที่นี่ไม่คำนวณเอง
// kv 'vaultetLink' (ค่าเริ่มต้นเปิด): ปิดแล้ว Twin จะไม่เห็นข้อมูลการเงินเลย

import { kvGet, kvSet } from './db.js';
import { h } from './ui.js';

export const SNAPSHOT_KEY = 'vaultet_twin_snapshot_v1';
const STALE_DAYS = 3;

// อ่านสรุปล่าสุด {at, data} หรือ null ถ้ายังไม่เคยเปิด Vaultet บนเบราว์เซอร์นี้ / อ่านไม่ได้
export function readSnapshot() {
  try {
    const j = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    return j && j.v === 1 && j.data && j.at ? j : null;
  } catch {
    return null;
  }
}

const baht = (n) => `฿${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// ข้อความที่ส่งให้ twin (ตรงกับที่แสดงให้เห็นในหน้า "การเงินจาก Vaultet" ทุกตัวอักษร) · ไม่มีข้อมูล = ''
export function financeForPrompt(snap, now = Date.now()) {
  if (!snap) return '';
  const d = snap.data;
  const nw = d.netWorth || {};
  const days = Math.floor((now - snap.at) / 864e5);
  const top = (m) => (m.topExpenseCategories || []).map((c) => `${c.category} ${baht(c.amount)}`).join(', ') || '-';
  const month = (label, m) => m && `${label}: รายรับ ${baht(m.income)} · รายจ่าย ${baht(m.expense)} · ออม ${baht(m.saving)} · เงินสดสุทธิ ${baht(m.netCashFlow)} · รายจ่ายหลัก ${top(m)}`;
  const f = d.forecastToMonthEnd;
  const lines = [
    days >= STALE_DAYS ? `(ข้อมูลนี้เก่า ${days} วัน ยอดอาจไม่ตรงปัจจุบัน ให้บอกด้วยเมื่อใช้ตัวเลข และแนะนำให้เปิด Vaultet เพื่ออัปเดต)` : '',
    `ยอดเงินรวมทุกบัญชี ${baht(nw.totalMoneyAllAccounts)} · กันไว้ ${baht(nw.reserved)} · ใช้ได้จริง ${baht(nw.available)} · หนี้รวม ${baht(nw.liabilities)} · เงินที่คนอื่นยืมไป ${baht(nw.receivablesOutstanding)} · เงินออมสะสม ${baht(nw.savedTotal)} · เงินฉุกเฉิน ${baht(nw.emergencySaved)}`,
    month('เดือนนี้', d.thisMonth),
    month('เดือนก่อน', d.lastMonth),
    f && `คาดการณ์สิ้นเดือน (เหลือ ${f.daysRemaining} วัน): ต้องจ่ายอีก ${baht(f.upcomingPayments)} เงินใช้ได้หลังจ่ายแล้ว ${baht(f.forecastAvailable)}`,
    d.recurringMonthlyEstimated ? `ค่าใช้จ่ายประจำต่อเดือนโดยประมาณ ${baht(d.recurringMonthlyEstimated)}` : '',
    d.debts?.list?.length ? `หนี้: ${d.debts.list.map((x) => `${x.name} คงเหลือ ${baht(x.outstandingBalance)}`).join('; ')}` : '',
    d.goals?.length ? `เป้าหมายเก็บเงิน: ${d.goals.map((g) => `${g.name} ออมแล้ว ${baht(g.saved)}/${baht(g.targetAmount)} (${g.progressPct}%)${g.deadline ? ` กำหนด ${g.deadline}` : ''}`).join('; ')}` : '',
    d.budgetOverview && `งบ: ${d.budgetOverview}`,
    d.emergencyFund && `เงินสำรองฉุกเฉิน: ควรมี ${baht(d.emergencyFund.recommendedEmergencyFund)} (${d.emergencyFund.targetMonths} เดือน) ตอนนี้ครอบคลุม ${d.emergencyFund.reserveCoverageMonths} เดือน สถานะ ${d.emergencyFund.status}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function isLinked() {
  return (await kvGet('vaultetLink', true)) !== false;
}

// ใช้ใน chat.js: คืนข้อความการเงินถ้าเปิดลิงก์และมีข้อมูล ไม่งั้น ''
export async function financeText() {
  return (await isLinked()) ? financeForPrompt(readSnapshot()) : '';
}

// หน้า "การเงินจาก Vaultet": เปิด/ปิดลิงก์ + โชว์ข้อความที่ twin เห็นจริงทุกตัวอักษร
export async function renderVaultet(root, ctx) {
  ctx.setTitle('การเงินจาก Vaultet');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [linked, snap] = [await isLinked(), readSnapshot()];
  const seg = h('div', { class: 'seg' }, [[true, 'เปิด'], [false, 'ปิด']].map(([v, label]) =>
    h('button', { class: v === linked ? 'on' : '', onclick: async () => { await kvSet('vaultetLink', v); root.innerHTML = ''; renderVaultet(root, ctx); } }, label)));
  const seen = linked && snap ? financeForPrompt(snap) : '';
  page.append(
    h('p', { class: 'hint' }, 'ให้ twin เห็นภาพการเงินจากแอพ Vaultet (ยอดเงิน หนี้ งบ เป้าหมายเก็บเงิน รายจ่ายหลัก) ตอนวางแผนหรือตัดสินใจเรื่องเงิน อ่านอย่างเดียว ไม่แก้ข้อมูลใน Vaultet และไม่ส่งรายการทีละรายการ ข้อความด้านล่างถูกส่งไปที่ OpenRouter พร้อมแชต'),
    h('div', { class: 'card pad' }, seg),
    h('small', { class: 'hint' }, snap
      ? `ข้อมูลล่าสุดจาก Vaultet: ${new Date(snap.at).toLocaleString('th-TH')} (อัปเดตทุกครั้งที่เปิดหรือออกจาก Vaultet)`
      : 'ยังไม่พบข้อมูล ให้เปิด Vaultet สักครั้งด้วยเบราว์เซอร์/แอพเดียวกับที่เปิด Twin แล้วกลับมาดูใหม่ (ถ้า Vaultet เป็นไฟล์ APK แยก จะอ่านกันไม่ได้)'),
    h('div', { class: 'btns' }, h('a', { class: 'btn ghost', href: '../vaultet/' }, 'เปิด Vaultet')),
    seen && h('h3', {}, 'สิ่งที่ twin เห็น'),
    seen && h('div', { class: 'card pad' }, h('p', { class: 'ans', style: 'white-space:pre-wrap' }, seen)),
  );
}
