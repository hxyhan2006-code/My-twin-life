// ค้นหาความจำที่เกี่ยวกับข้อความ โดยไม่ต้องใช้เซิร์ฟเวอร์/embedding
// ภาษาไทยไม่มีเว้นวรรค จึงตัดเป็นชุดตัวอักษร 2-3 ตัวติดกัน แล้วนับว่าตรงกันกี่ชุด
// ชุดที่เจอบ่อยในทุกเรื่อง (เช่น "เป็น") ให้คะแนนน้อย ชุดที่หายากให้คะแนนมาก

const cache = new Map();

// คำเติมที่ใช้ในคำถามทั่วไป ไม่บอกว่าเรากำลังพูดถึงเรื่องอะไร จึงไม่เอามานับ
const FILLER = ['อะไร', 'เรื่อง', 'บ้าง', 'ไหม', 'หรือ', 'ยังไง', 'อย่างไร', 'ทำไม', 'หน่อย', 'ครับ', 'ค่ะ', 'นะ', 'ดี'];
const FILLER_GRAMS = new Set(FILLER.flatMap((w) => [...grams(w)]));

export function grams(text) {
  const s = String(text || '').toLowerCase();
  const out = new Set();
  for (const w of s.match(/[a-z0-9]{2,}/g) || []) out.add('w:' + w);
  for (const seg of s.match(/[^\sa-z0-9\p{P}\p{S}]+/gu) || []) {
    const cs = [...seg];
    if (cs.length === 1) out.add(cs[0]);
    for (let i = 0; i < cs.length - 1; i++) {
      out.add(cs[i] + cs[i + 1]);
      if (i < cs.length - 2) out.add(cs[i] + cs[i + 1] + cs[i + 2]);
    }
  }
  return out;
}

function gramsCached(text) {
  let g = cache.get(text);
  if (!g) {
    if (cache.size > 20000) cache.clear();
    g = grams(text);
    cache.set(text, g);
  }
  return g;
}

// items: [{text, ...}] → คืนรายการที่เกี่ยวที่สุดก่อน พร้อม score
export function rank(query, items, { k = 12, maxChars = 6000, minMatches = 2 } = {}) {
  const q = new Set([...grams(query)].filter((g) => !FILLER_GRAMS.has(g)));
  if (!q.size || !items.length) return [];
  const docs = items.map((it) => ({ it, g: gramsCached(it.text) }));
  const df = new Map();
  for (const d of docs) for (const g of d.g) df.set(g, (df.get(g) || 0) + 1);
  const N = docs.length;
  const scored = [];
  for (const d of docs) {
    let s = 0;
    let matches = 0;
    for (const g of q) {
      if (!d.g.has(g)) continue;
      matches++;
      s += Math.log(1 + N / df.get(g)) * (g.length >= 3 ? 2 : 1);
    }
    if (matches >= minMatches) scored.push({ it: d.it, score: s / Math.sqrt(d.g.size + 80) });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const floor = scored[0].score * 0.3;
  const out = [];
  let chars = 0;
  for (const s of scored) {
    if (out.length >= k || s.score < floor) break;
    if (chars + s.it.text.length > maxChars && out.length) continue;
    chars += s.it.text.length;
    out.push(s);
  }
  return out;
}
