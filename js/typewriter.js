// ทยอยเผยข้อความทีละนิดให้ไหลลื่น แทนที่จะโผล่เป็นก้อนตามที่เซิร์ฟเวอร์ส่งมา
// ถ้าข้อความค้างอยู่เยอะ จะเร่งความเร็วตามปริมาณที่ค้าง ทำให้ไม่ตามหลังจนเกินไป

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff; // ครึ่งแรกของอีโมจิ ห้ามตัดกลางคู่

export function createTypewriter({ onFrame, raf = requestAnimationFrame, caf = cancelAnimationFrame, giveUpMs = 20000 }) {
  let target = '';
  let shown = 0;
  let handle = 0;
  let done = false;
  let waiter = null;
  let giveUp = 0;

  const settle = () => {
    clearTimeout(giveUp);
    const w = waiter;
    waiter = null;
    w?.();
  };

  const step = () => {
    handle = 0;
    const backlog = target.length - shown;
    if (backlog > 0) {
      shown = Math.min(target.length, shown + Math.max(1, Math.ceil(backlog * 0.07)));
      if (shown < target.length && isHigh(target.charCodeAt(shown - 1))) shown++;
      onFrame(target.slice(0, shown));
    }
    if (shown < target.length) handle = raf(step);
    else if (done) settle();
  };
  const kick = () => { if (!handle) handle = raf(step); };

  return {
    push(text) { target = text; kick(); },
    // เรียกเมื่อสตรีมจบ: รอให้เผยครบ (ถ้าแท็บถูกพัก rAF จะหยุด จึงมีตัวกันค้าง)
    finish() {
      done = true;
      return new Promise((resolve) => {
        waiter = resolve;
        giveUp = setTimeout(() => this.flush(), giveUpMs);
        kick();
      });
    },
    // เผยทั้งหมดทันที (ตอนกดหยุด หรือค้างนานเกินไป)
    flush() {
      if (handle) caf(handle);
      handle = 0;
      if (shown < target.length) { shown = target.length; onFrame(target); }
      settle();
    },
  };
}
