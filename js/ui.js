// ตัวช่วยสร้างหน้าจอ

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list' && k !== 'style') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  menu: svg('<path d="M4 9h16M4 15h10"/>'),
  newChat: svg('<path d="M12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  pencil: svg('<path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/>'),
  copy: svg('<rect x="8" y="8" width="14" height="14" rx="3"/><path d="M4 16c-1.1 0-2-.9-2-2V5a3 3 0 013-3h9c1.1 0 2 .9 2 2"/>'),
  retry: svg('<path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0118.5 5.8L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/>'),
  down: svg('<path d="M12 5v14M5 12l7 7 7-7"/>'),
  dots: svg('<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0114 0"/><path d="M16 4.6a3.5 3.5 0 010 6.8M22 21a7 7 0 00-4.5-6.5"/>'),
  heart: svg('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z"/>'),
  home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  smile: svg('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  bulb: svg('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/>'),
  flag: svg('<path d="M5 22V3"/><path d="M5 4h13l-2 4 2 4H5"/>'),
  folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>'),
  wallet: svg('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>'),
  activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  moon: svg('<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>'),
  sparkle: svg('<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  book: svg('<path d="M4 4a2 2 0 012-2h13v18H6a2 2 0 00-2 2z"/><path d="M4 20V4"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  gem: svg('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21L8 9l4-6 4 6z"/>'),
  askchat: svg('<path d="M7.9 20A9 9 0 104 16.1L2 22z"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  send: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  chat: svg('<path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.6A8 8 0 1121 12z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  memory: svg('<path d="M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-5v18h5a2 2 0 002-2z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  interview: svg('<path d="M9 9a3 3 0 116 0c0 2-3 2-3 4M12 17h.01"/><circle cx="12" cy="12" r="10"/>'),
  chevron: svg('<path d="M9 18l6-6-6-6"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
};

export const iconEl = (name, cls = 'ico') => h('span', { class: cls, innerHTML: icons[name] });

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('คัดลอกแล้ว');
}

// เมนูลอยข้างปุ่มที่กด (เหมือนเมนู ⋮ ของ ChatGPT) items = [{label, icon, danger, onClick}]
export function popMenu(anchor, items, { align = 'right' } = {}) {
  document.querySelector('.popscrim')?.remove();
  const scrim = h('div', { class: 'popscrim' });
  const close = () => scrim.remove();
  const menu = h('div', { class: 'popmenu' }, items.map((it) =>
    h('button', { class: it.danger ? 'danger' : '', onclick: () => { close(); it.onClick(); } }, it.icon && iconEl(it.icon), it.label)));
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.append(menu);
  document.body.append(scrim);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(8, Math.min(align === 'right' ? r.right - mw : r.left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

// รายการแชตที่ถูกบีบให้เตี้ยลง (คีย์บอร์ดเด้ง / ปุ่มตัวเลือกโผล่) ถ้าก่อนหน้านั้นอ่านอยู่ท้ายสุด ให้ค้างอยู่ท้ายสุด
// เหมือนแอพ AI ทั่วไป ข้อความล่าสุดจะไม่โดนช่องพิมพ์/คีย์บอร์ดบัง
export function keepBottomOnResize(list, slack = 120) {
  let atBottom = true;
  list.addEventListener('scroll', () => { atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < slack; }, { passive: true });
  if (typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => { if (atBottom) list.scrollTop = list.scrollHeight; }).observe(list);
}

// ทำให้ตัวอักษรท้ายสุดจางลงไล่ระดับ (ดูเหมือนข้อความค่อยๆ ไล่มา) ตัดตามกลุ่มตัวอักษร ไม่ตัดสระ/วรรณยุกต์ขาดจากพยัญชนะ
export function fadeTail(root, n = 14) {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return;
  const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let dist = 0;
  for (let i = nodes.length - 1; i >= 0 && dist < n; i--) {
    const parts = [...seg.segment(nodes[i].data)].map((x) => x.segment);
    const take = Math.min(n - dist, parts.length);
    if (!take) continue;
    const frag = document.createDocumentFragment();
    const head = parts.slice(0, parts.length - take).join('');
    if (head) frag.append(head);
    for (let k = 0; k < take; k++) {
      const d = take - 1 - k + dist; // 0 = ตัวสุดท้ายของข้อความทั้งหมด
      frag.append(h('span', { style: `opacity:${(0.22 + 0.78 * (d / n)).toFixed(2)}` }, parts[parts.length - take + k]));
    }
    nodes[i].replaceWith(frag);
    dist += take;
  }
}
