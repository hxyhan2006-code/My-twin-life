// คุยกับ OpenRouter ตรงจากมือถือ (key เก็บในเครื่องเท่านั้น)

const BASE = 'https://openrouter.ai/api/v1';

// ตัวรับยอดใช้จ่าย (ตั้งจาก app.js) เรียกทุกครั้งที่คำตอบจบ: (model, usage)
let usageSink = null;
export const setUsageSink = (fn) => { usageSink = fn; };

const STATUS_TEXT = {
  401: 'API key ไม่ถูกต้องหรือหมดอายุ',
  402: 'เครดิต OpenRouter หมด หรือเกินวงเงินของ key',
  403: 'ถูกปฏิเสธ (โมเดลนี้อาจไม่เปิดให้ใช้กับ key นี้)',
  404: 'ไม่เจอโมเดลนี้ ลองเลือกชื่ออื่น',
  429: 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่',
};

async function fail(res) {
  let detail = '';
  try {
    detail = (await res.json())?.error?.message || '';
  } catch { /* ไม่มีรายละเอียด */ }
  const base = STATUS_TEXT[res.status] || `เกิดข้อผิดพลาด (${res.status})`;
  throw new Error(detail ? `${base} — ${detail}` : base);
}

async function post(body, apiKey, signal) {
  if (!apiKey) throw new Error('ยังไม่ได้ใส่ OpenRouter key (ไปที่ตั้งค่า)');
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'My Twin Life',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('เชื่อมต่อ OpenRouter ไม่ได้ เช็กอินเทอร์เน็ตแล้วลองใหม่');
  }
  if (!res.ok) await fail(res);
  return res;
}

// ถามครั้งเดียว ได้ข้อความกลับมาทั้งก้อน (ใช้กับงานสรุป/ดึงความจำ)
export async function chatOnce({ apiKey, model, messages, temperature = 0.4, maxTokens, signal }) {
  const res = await post({ model, messages, temperature, usage: { include: true }, ...(maxTokens && { max_tokens: maxTokens }) }, apiKey, signal);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || 'โมเดลตอบกลับผิดพลาด');
  usageSink?.(model, j.usage);
  return j.choices?.[0]?.message?.content || '';
}

// ถามแบบทยอยส่งตัวอักษรมาเรื่อยๆ (ใช้ในหน้าแชต)
export async function chatStream({ apiKey, model, messages, temperature = 0.8, signal, onDelta }) {
  const res = await post({ model, messages, temperature, stream: true, usage: { include: true } }, apiKey, signal);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let usage = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // ข้ามบรรทัดคอมเมนต์ ": OPENROUTER PROCESSING"
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(j.error.message || 'โมเดลตอบกลับผิดพลาด');
      if (j.usage) usage = j.usage;
      const d = j.choices?.[0]?.delta?.content;
      if (d) { full += d; onDelta(full); }
    }
  }
  if (usage) usageSink?.(model, usage);
  if (!full.trim()) throw new Error('โมเดลไม่ตอบอะไรกลับมา ลองใหม่หรือเปลี่ยนโมเดล');
  return full;
}

export async function listModels() {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error('โหลดรายชื่อโมเดลไม่ได้');
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, price: [Number(m.pricing?.prompt), Number(m.pricing?.completion)] })).sort((a, b) => a.id.localeCompare(b.id));
}
