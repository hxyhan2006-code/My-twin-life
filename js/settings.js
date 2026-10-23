// หน้าตั้งค่า: key · โมเดล · สำรอง/นำเข้า · ลบทั้งหมด

import { kvGet, kvSet, exportAll, importAll, wipeAll } from './db.js';
import { chatOnce, listModels } from './api.js';
import { getSettings } from './state.js';
import { h, toast } from './ui.js';
import { APP_VERSION } from './version.js';

const field = (label, input, note) => h('label', { class: 'field' }, h('span', {}, label), input, note && h('small', {}, note));

export async function renderSettings(root, _p, ctx) {
  ctx.setTitle('ตั้งค่า');
  ctx.setRight(null);
  const s = await getSettings();
  const page = h('div', { class: 'page' });
  root.append(page);

  const name = h('input', { value: s.userName, autocomplete: 'off' });
  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-or-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const showKey = h('button', { class: 'link', type: 'button', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; } }, 'แสดง/ซ่อน key');
  const dl = h('datalist', { id: 'models' });
  const model = h('input', { value: s.model, list: 'models', placeholder: 'เช่น provider/model-name', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const light = h('input', { value: (await kvGet('lightModel', '')) || '', list: 'models', placeholder: 'ว่างไว้ = ใช้ตัวเดียวกับด้านบน', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });

  const loadModels = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    try {
      const ids = await listModels();
      dl.innerHTML = '';
      for (const id of ids) dl.append(h('option', { value: id }));
      toast(`โหลดรายชื่อโมเดล ${ids.length} ตัว พิมพ์ค้นหาในช่องโมเดลได้`);
    } catch (e) { toast(e.message); }
  } }, 'โหลดรายชื่อโมเดลทั้งหมด');

  const save = async () => {
    await kvSet('userName', name.value.trim() || 'Han');
    await kvSet('apiKey', key.value.trim());
    await kvSet('model', model.value.trim());
    await kvSet('lightModel', light.value.trim());
  };
  const test = h('button', { class: 'btn ghost', onclick: async () => {
    await save();
    const cur = await getSettings();
    test.disabled = true;
    try {
      const out = await chatOnce({ apiKey: cur.apiKey, model: cur.model, maxTokens: 20, messages: [{ role: 'user', content: 'ตอบสั้นๆ ว่า "พร้อม"' }] });
      toast(`ต่อได้แล้ว: ${out.slice(0, 40)}`, 4000);
    } catch (e) { toast(e.message, 5000); }
    test.disabled = false;
  } }, 'ทดสอบการเชื่อมต่อ');

  page.append(
    h('div', { class: 'card pad' },
      field('ชื่อของเรา', name, 'twin จะใช้ชื่อนี้เวลาเป็นเรา'),
      field('OpenRouter API key', key, 'เก็บในมือถือเครื่องนี้เท่านั้น ไม่ถูกส่งไปที่อื่นนอกจาก OpenRouter · แนะนำตั้งวงเงินที่ openrouter.ai'),
      showKey,
      field('โมเดลหลัก (ใช้คุยกับ twin และสร้างแก่นตัวตน)', model, 'เลือกตัวที่ฉลาดที่สุดที่ยอมจ่ายไหว ลองสลับดูได้'),
      field('โมเดลเบา (ใช้ดึงความจำ / คิดคำถามเจาะลึก)', light, 'ใช้ตัวถูกกว่าได้ ประหยัดเงิน'),
      dl, loadModels,
      h('div', { class: 'btns' }, test, h('button', { class: 'btn primary', onclick: async () => { await save(); toast('บันทึกแล้ว'); } }, 'บันทึก')),
    ),
    h('h3', {}, 'สำรองข้อมูล'),
    h('div', { class: 'card pad' },
      h('p', { class: 'hint' }, 'ข้อมูลทั้งหมดอยู่ในมือถือเครื่องนี้ ถ้าล้างข้อมูลเบราว์เซอร์/เปลี่ยนเครื่อง จะหาย ควรสำรองบ่อยๆ ไฟล์สำรอง "ไม่มี" API key แต่มีเรื่องส่วนตัวของเรา เก็บให้ดี และห้ามเอาขึ้น GitHub'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', onclick: doExport }, 'ดาวน์โหลดไฟล์สำรอง'),
        h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, 'นำเข้าจากไฟล์')),
    ),
    h('h3', {}, 'อันตราย'),
    h('div', { class: 'card pad' },
      h('button', { class: 'btn danger', onclick: async () => {
        if (prompt('จะลบทุกอย่างในแอพนี้ (รวมแชต ความจำ คำตอบ) ย้อนไม่ได้ ถ้าแน่ใจพิมพ์คำว่า ลบทั้งหมด') !== 'ลบทั้งหมด') return toast('ยกเลิก ไม่ได้ลบอะไร');
        await wipeAll();
        toast('ลบหมดแล้ว');
        ctx.go('#/chat');
        ctx.refreshDrawer();
      } }, 'ลบข้อมูลทั้งหมด')),
  );

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const n = await importAll(JSON.parse(await f.text()));
      toast(`นำเข้าแล้ว ${n} รายการ`, 4000);
      ctx.refreshDrawer();
    } catch (err) { toast(err.message || 'อ่านไฟล์ไม่ได้', 4000); }
  } });
  page.append(fileInput, h('p', { class: 'hint' }, `Twin v${APP_VERSION}`));
}

async function doExport() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `twin-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  await kvSet('lastBackupAt', Date.now());
  toast('ดาวน์โหลดไฟล์สำรองแล้ว (ดูในโฟลเดอร์ดาวน์โหลด)', 4000);
}
