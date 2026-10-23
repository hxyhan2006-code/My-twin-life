// ช่องพิมพ์ด้านล่าง (ใช้ร่วมกันในแชตและสัมภาษณ์)

import { h, iconEl } from './ui.js';

// onSubmit(viaEnterKey) · บนมือถือ Enter = ขึ้นบรรทัดใหม่ · บนคอมกด Enter ส่ง (Shift+Enter ขึ้นบรรทัด)
export function createComposer({ placeholder, onSubmit }) {
  const input = h('textarea', { rows: 1, placeholder, enterKeyHint: 'enter' });
  const sendBtn = h('button', { class: 'send', title: 'ส่ง' }, iconEl('send', 'ico'));
  const el = h('div', { class: 'composer' }, h('div', { class: 'pill' }, input, sendBtn));

  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      onSubmit(true);
    }
  });
  sendBtn.addEventListener('click', () => onSubmit(false));

  return {
    el, input, sendBtn, autosize,
    clear() { input.value = ''; autosize(); },
    setBusy(busy) {
      sendBtn.innerHTML = '';
      sendBtn.append(iconEl(busy ? 'stop' : 'send', 'ico'));
      sendBtn.title = busy ? 'หยุด' : 'ส่ง';
      sendBtn.classList.toggle('busy', busy);
    },
  };
}
