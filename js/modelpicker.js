// หน้าเลือกโมเดลแบบกดเลือก (แทนการพิมพ์ชื่อเอง): แนะนำ + ค้นหาทั้งหมด พร้อมราคา

import { h, iconEl } from './ui.js';
import { kvGet } from './db.js';
import { DEFAULTS } from './usage.js';
import { ROLES, RECOMMENDED, priceOf, priceText, loadModelCache, refreshModels } from './models.js';

const FAMILIES = [['google/', 'Google'], ['anthropic/', 'Claude'], ['openai/', 'OpenAI'], ['deepseek/', 'DeepSeek'], ['qwen/', 'Qwen'], ['x-ai/', 'Grok']];

// role = 'main' | 'deep' | 'light' · current = id ที่ใช้อยู่ · onPick(id) (id ว่าง = ใช้ตัวเดียวกับโมเดลหลัก)
export async function openModelPicker({ role, current, onPick }) {
  const R = ROLES[role];
  const rate = await kvGet('rate', DEFAULTS.rate);
  let cache = await loadModelCache();

  const sheet = h('div', { class: 'sheet' });
  const close = () => sheet.remove();
  const pick = (id) => { close(); onPick(id); };
  const status = h('small', { class: 'hint' });
  const recBox = h('div', { class: 'card' });
  const results = h('div', { class: 'card' });
  const resultsWrap = h('div', {}, results);
  let fam = '';
  const search = h('input', { class: 'search', placeholder: 'ค้นหา เช่น gemini, claude, gpt, deepseek', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, oninput: () => drawResults() });

  const row = ({ id, name, tag, note, price, live }) => h('button', { type: 'button', class: 'row pick', onclick: () => pick(id) },
    h('span', { class: 'grow' },
      h('span', {}, h('b', {}, name || id), tag && h('span', { class: 'tagpill' }, tag), id === current && h('span', { class: 'tagpill on' }, 'ใช้อยู่')),
      name && name !== id && h('small', { class: 'mid' }, id),
      note && h('small', {}, note),
      h('small', { class: 'pr' }, `${priceText(price, role, rate)}${price && !live ? ' (ราคาอ้างอิง ต.ค. 2026)' : ''}`)),
    id === current && iconEl('check'));

  function drawRecommended() {
    recBox.innerHTML = '';
    if (R.canEmpty) {
      recBox.append(h('button', { type: 'button', class: 'row pick', onclick: () => pick('') },
        h('span', { class: 'grow' }, h('b', {}, R.emptyLabel)), !current && iconEl('check')));
    }
    for (const r of RECOMMENDED[role]) {
      const { price, live } = priceOf(r.id, cache);
      const missing = cache && !cache.list.some((m) => m.id === r.id);
      recBox.append(row({ ...r, price, live, note: missing ? `⚠ ตอนนี้ไม่เจอชื่อนี้ในรายการของ OpenRouter · ${r.note}` : r.note }));
    }
  }

  function drawResults() {
    results.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    if (!q && !fam) {
      resultsWrap.hidden = true;
      return;
    }
    resultsWrap.hidden = false;
    const all = (cache?.list || []).filter((m) => (!fam || m.id.startsWith(fam)) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)));
    for (const m of all.slice(0, 40)) results.append(row({ id: m.id, name: m.name, price: m.price, live: true }));
    if (all.length > 40) results.append(h('div', { class: 'row' }, h('small', {}, `เจอ ${all.length} ตัว แสดง 40 ตัวแรก พิมพ์เพิ่มเพื่อแคบลง`)));
    if (!all.length) results.append(h('div', { class: 'row' }, h('small', {}, cache ? 'ไม่เจอ ลองคำอื่น' : 'ยังไม่มีรายชื่อ (โหลดไม่ได้)')));
    if (q.includes('/') && !(cache?.list || []).some((m) => m.id === q)) {
      results.append(h('button', { type: 'button', class: 'row pick', onclick: () => pick(search.value.trim()) }, h('span', { class: 'grow' }, h('b', {}, `ใช้ชื่อที่พิมพ์เอง: ${search.value.trim()}`), h('small', {}, 'ใช้เมื่อรู้ชื่อเป๊ะ ถ้าพิมพ์ผิดจะตอบไม่ได้'))));
    }
  }

  const chips = h('div', { class: 'chips' }, FAMILIES.map(([prefix, label]) => h('button', { type: 'button', class: 'chip', onclick: (e) => {
    fam = fam === prefix ? '' : prefix;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget && !!fam));
    drawResults();
  } }, label)));

  sheet.append(
    h('div', { class: 'sheethead' }, h('button', { class: 'round', type: 'button', title: 'ปิด', onclick: close }, iconEl('back')), h('b', {}, `เลือก${R.title}`)),
    h('div', { class: 'page' },
      h('p', { class: 'hint' }, 'ราคาเป็นดอลลาร์ต่อ 1 ล้านโทเคน (โทเคน = ชิ้นข้อความ ภาษาไทย 1 คำ ≈ 2-3 โทเคน) "เข้า" = ที่เราส่งไป "ออก" = ที่ AI ตอบ · ค่าที่ ≈ บาทเป็นแค่ประมาณการจากข้อความขนาดปกติ ค่าจริงดูที่การ์ด "ค่า AI" หน้าตั้งค่า'),
      h('h3', {}, 'แนะนำ'), recBox,
      h('h3', {}, 'ค้นหาทั้งหมด'), search, chips, resultsWrap, status),
  );
  document.body.append(sheet);
  drawRecommended();
  drawResults();

  // โหลดรายชื่อ+ราคาล่าสุด (ไม่ต้องใช้ key) · ได้แล้ววาดใหม่ด้วยราคาจริง
  const age = cache ? Date.now() - cache.at : Infinity;
  if (age > 36e5) {
    status.textContent = 'กำลังโหลดราคาล่าสุดจาก OpenRouter…';
    try {
      cache = await refreshModels();
      status.textContent = `ราคาล่าสุดจาก OpenRouter · ${cache.list.length} โมเดล`;
    } catch (e) {
      status.textContent = cache ? 'โหลดราคาใหม่ไม่ได้ ใช้ราคาที่เก็บไว้ก่อนหน้า' : 'โหลดรายชื่อไม่ได้ (เช็กอินเทอร์เน็ต) แสดงเฉพาะที่แนะนำด้วยราคาอ้างอิง';
    }
    if (sheet.isConnected) { drawRecommended(); drawResults(); }
  } else {
    status.textContent = `ราคาจาก OpenRouter · ${cache.list.length} โมเดล`;
  }
}
