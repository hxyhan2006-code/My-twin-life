// รูปโปรไฟล์ + ชื่อ: รูปเก็บเป็นภาพเล็กในเครื่อง (kv 'avatarImg' data URL) · สีพื้นตัวอักษร (kv 'avatarColor') · ชื่อ = kv 'userName' ตัวเดียวกับหน้าตั้งค่า

import { kvGet, kvSet } from './db.js';
import { h, toast } from './ui.js';

export const AVATAR_SIZE = 256; // ย่อรูปเป็นสี่เหลี่ยมจัตุรัสด้านนี้ ให้ไฟล์เล็ก (~30KB) ติดไฟล์สำรองได้สบาย
export const COLORS = ['#4361ee', '#2a9d8f', '#e76f51', '#9b5de5', '#e5989b', '#f4a261'];

// ครอปตรงกลางให้เป็นสี่เหลี่ยมจัตุรัส: คืน {sx, sy, s} (จุดเริ่มและด้านของส่วนที่ตัด)
export function squareCrop(w, h) {
  const s = Math.min(w, h);
  return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s };
}

export async function loadAvatar() {
  const [img, color] = await Promise.all([kvGet('avatarImg', ''), kvGet('avatarColor', COLORS[0])]);
  return { img, color };
}

// วงกลมโปรไฟล์: มีรูปใช้รูป ไม่มีใช้ตัวอักษรแรกของชื่อบนสีที่เลือก · cls เช่น 'sm'
export function avatarEl(name, { img, color }, cls = '') {
  const el = h('div', { class: `avatar ${cls}`.trim(), style: img ? `background:center/cover url(${img})` : `background:${color}` });
  if (!img) el.textContent = [...(name || '')][0] || 'H';
  return el;
}

// อ่านรูปที่เลือก ย่อ/ครอปเป็น JPEG เล็ก (รองรับรูปมือถือที่หมุนด้วยข้อมูล EXIF)
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { sx, sy, s } = squareCrop(bmp.width, bmp.height);
  const cv = document.createElement('canvas');
  cv.width = cv.height = AVATAR_SIZE;
  cv.getContext('2d').drawImage(bmp, sx, sy, s, s, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bmp.close?.();
  return cv.toDataURL('image/jpeg', 0.85);
}

export async function renderProfileEdit(root, ctx) {
  ctx.setTitle('แก้โปรไฟล์');
  ctx.setRight(null);
  const page = h('div', { class: 'page' });
  root.append(page);
  const [name0, av] = [await kvGet('userName', 'Han'), await loadAvatar()];
  const redraw = () => { root.innerHTML = ''; renderProfileEdit(root, ctx); };

  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      await kvSet('avatarImg', await shrink(f));
      toast('เปลี่ยนรูปแล้ว');
      redraw();
    } catch { toast('อ่านรูปนี้ไม่ได้ ลองรูปอื่น'); }
  } });
  const name = h('input', { class: 'search', value: name0, maxlength: 30, autocomplete: 'off' });
  const save = h('button', { class: 'btn primary', onclick: async () => {
    const n = name.value.trim();
    if (!n) return toast('ชื่อว่างไม่ได้');
    await kvSet('userName', n);
    toast('บันทึกชื่อแล้ว');
    ctx.go('#/me');
  } }, 'บันทึกชื่อ');

  page.append(
    h('div', { class: 'mehead' }, avatarEl(name0, av, 'xl')),
    h('div', { class: 'btns' },
      h('button', { class: 'btn ghost', onclick: () => file.click() }, 'เลือกรูปจากเครื่อง'),
      av.img && h('button', { class: 'btn ghost', onclick: async () => { await kvSet('avatarImg', ''); redraw(); } }, 'ใช้ตัวอักษรแทน')),
    !av.img && h('div', { class: 'swatches' }, COLORS.map((c) =>
      h('button', { class: c === av.color ? 'on' : '', style: `background:${c}`, title: 'เลือกสีนี้', onclick: async () => { await kvSet('avatarColor', c); redraw(); } }))),
    h('h3', {}, 'ชื่อ'),
    name,
    h('p', { class: 'hint' }, 'ชื่อนี้ twin ใช้เรียกและเป็นเรา เปลี่ยนแล้วมีผลทั้งแอพ (เหมือนที่ตั้งค่า) ความจำเก่าที่จดไว้ไม่ถูกแก้'),
    h('div', { class: 'btns' }, save),
    file,
  );
}
