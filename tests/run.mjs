// เทสต์ส่วนที่เป็นตรรกะล้วน (ไม่ต้องใช้เบราว์เซอร์) รัน: node tests/run.mjs
import assert from 'node:assert/strict';
import { rank, grams } from '../js/retrieve.js';
import { buildSystem, extractJson } from '../js/prompt.js';
import { mdToHtml } from '../js/md.js';
import { BASE_QUESTIONS, CATEGORIES, GROUPS, groupOfCat } from '../js/questions.js';
import { createTypewriter } from '../js/typewriter.js';
import { buildInterviewerSystem, parseInterviewerReply } from '../js/interviewer.js';
import { summarize, addToDays, levelOf, costOf, fmtUsd, fmtThb, dayKey } from '../js/usage.js';
import { normalizeMemories } from '../js/profile.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('grams ตัดไทยเป็นชุดตัวอักษร และเก็บคำอังกฤษ', () => {
  const g = grams('ทำงาน at Google');
  assert.ok(g.has('ทำ') && g.has('งาน') && g.has('w:google'));
});

const pool = [
  { text: 'ถาม: งานที่ทำอยู่ตอนนี้ ตอบ: ทำงานเป็นโปรแกรมเมอร์ที่บริษัทเล็กๆ เงินเดือนน้อย อยากลาออก' },
  { text: 'ถาม: ครอบครัว ตอบ: พ่อเป็นคนเงียบ แม่ขี้บ่นแต่ใจดี มีน้องสาวหนึ่งคน' },
  { text: 'ถาม: ความกลัว ตอบ: กลัวความล้มเหลว กลัวทำให้พ่อแม่ผิดหวัง' },
  { text: 'ถาม: อาหารที่ชอบ ตอบ: ชอบกินส้มตำกับข้าวเหนียว ไม่กินผักชี' },
  { text: 'ช่วงนี้กำลังเก็บเงินซื้อมือถือเครื่องใหม่' },
];

t('rank หาความจำเรื่องงานเจอเมื่อถามเรื่องลาออก', () => {
  const r = rank('อยากลาออกจากงานดีไหม', pool);
  assert.ok(r.length >= 1);
  assert.ok(r[0].it.text.includes('ลาออก'));
});
t('rank หาเรื่องครอบครัวเจอเมื่อถามเรื่องแม่', () => {
  const r = rank('แม่ชอบบ่นเรื่องอะไรบ้าง', pool);
  assert.ok(r[0].it.text.includes('แม่'));
});
t('rank ไม่หยิบอะไรมั่วเมื่อไม่เกี่ยวเลย', () => {
  assert.deepEqual(rank('xyz', pool), []);
  assert.deepEqual(rank('', pool), []);
});
t('rank เคารพ maxChars/k', () => {
  const big = Array.from({ length: 30 }, (_, i) => ({ text: `งานที่ทำข้อ ${i} ` + 'งาน'.repeat(200) }));
  assert.ok(rank('เรื่องงานที่ทำ', big, { k: 5 }).length <= 5);
  assert.ok(rank('เรื่องงานที่ทำ', big, { maxChars: 1500 }).length <= 3);
});

t('buildSystem ใส่ชื่อ แก่นตัวตน และความจำ + กฎห้ามประจบ/ห้ามแต่งความจำ', () => {
  const s = buildSystem({ name: 'Han', core: 'ผมชอบกาแฟ', retrieved: ['ถาม: ก ตอบ: ข\nบรรทัดสอง'] });
  assert.ok(s.includes('ผมชอบกาแฟ') && s.includes('Han'));
  assert.ok(s.includes('ห้ามประจบ') && s.includes('ห้ามแต่งความทรงจำ'));
  assert.ok(!s.includes('บรรทัดสอง\n- '), 'ความจำต้องเป็นบรรทัดเดียว');
  assert.ok(buildSystem({}).includes('ยังไม่มีข้อมูล'));
});

t('extractJson อ่านได้ทั้งแบบห่อข้อความและ ```', () => {
  assert.deepEqual(extractJson('นี่คือผล:\n```json\n["ก","ข"]\n```'), ['ก', 'ข']);
  assert.deepEqual(extractJson('[]'), []);
  assert.equal(extractJson('ไม่มี json'), null);
  assert.equal(extractJson('[พัง'), null);
});

t('mdToHtml escape HTML ก่อนเสมอ (กัน XSS) และแปลง markdown พื้นฐาน', () => {
  const html = mdToHtml('<img src=x onerror=alert(1)> **หนา** และ `โค้ด`\n- ข้อ 1\n- ข้อ 2');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img') && html.includes('<strong>หนา</strong>') && html.includes('<code>โค้ด</code>'));
  assert.ok(html.includes('<ul><li>ข้อ 1</li><li>ข้อ 2</li></ul>'));
  assert.ok(mdToHtml('```js\n<b>x</b>\n```').includes('&lt;b&gt;'));
});

t('ชุดคำถาม: id ไม่ซ้ำ ทุกหมวดมีข้อ', () => {
  const ids = BASE_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CATEGORIES.every((c) => c.questions.length > 0));
  console.log(`   (${ids.length} ข้อ ใน ${CATEGORIES.length} หมวด)`);
});

t('ทุกหมวดสัมภาษณ์อยู่ในหมวดใหญ่หมวดเดียว ไม่มีตกหล่น/ซ้ำ', () => {
  const all = GROUPS.flatMap((g) => g.cats);
  assert.equal(new Set(all).size, all.length);
  for (const c of CATEGORIES) assert.notEqual(groupOfCat(c.id), 'other', c.id);
  assert.equal(groupOfCat('ไม่มีหมวดนี้'), 'other');
});

t('normalizeMemories รับทั้งข้อความและ object · group แปลกจัดเป็น other', () => {
  const r = normalizeMemories(['ก', { text: 'ข', group: 'goal' }, { text: 'ค', group: 'ไม่รู้จัก' }, { text: '  ' }, null]);
  assert.deepEqual(r, [{ text: 'ก', group: 'other' }, { text: 'ข', group: 'goal' }, { text: 'ค', group: 'other' }]);
  assert.deepEqual(normalizeMemories('ไม่ใช่ array'), []);
});

t('typewriter เผยทีละนิดจนครบ ไม่ตัดอีโมจิกลางคู่ และเร่งเมื่อค้างเยอะ', async () => {
  const q = [];
  const frames = [];
  const tw = createTypewriter({ onFrame: (x) => frames.push(x), raf: (f) => (q.push(f), q.length), caf: () => {} });
  const text = 'สวัสดี 👋😂 ' + 'ก'.repeat(300);
  tw.push(text);
  let n = 0;
  while (q.length && n++ < 1000) q.shift()();
  assert.equal(frames.at(-1), text);
  assert.ok(frames.length > 5 && frames.length < text.length, 'ต้องทยอยเผย ไม่ใช่ทีละตัวอักษรตลอด');
  for (const f of frames) assert.ok(!/[\ud800-\udbff]$/.test(f), 'ห้ามจบที่ครึ่งแรกของอีโมจิ');
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].length > frames[i - 1].length);
  // finish แล้ว flush ต้องเผยครบทันที
  const f2 = [];
  const tw2 = createTypewriter({ onFrame: (x) => f2.push(x), raf: () => 1, caf: () => {} });
  tw2.push('abc'); tw2.flush();
  assert.equal(f2.at(-1), 'abc');
});

t('ผู้สัมภาษณ์: system prompt มีหลักสำคัญ + ประเด็น + สิ่งที่รู้แล้ว + เตือนสรุปทุก 8 ข้อ', () => {
  const cat = { id: 'work', name: 'เรียนและงาน' };
  const p = buildInterviewerSystem({ name: 'Han', callName: 'ฮาน', selfName: 'เรา', cat, seeds: ['ถามเรื่องงาน'], known: ['- ถาม: ก ตอบ: ข'], facts: ['เป็นโปรแกรมเมอร์'], core: 'ตัวตน', turns: 8 });
  for (const k of ['ทีละ 1 ข้อ', 'สะท้อน', 'ฉากจริง', 'ก็โอเค', 'ห้ามสอน', '1323', 'เรียนและงาน', 'ถามเรื่องงาน', 'เป็นโปรแกรมเมอร์', 'move=summary', 'ฮาน']) assert.ok(p.includes(k), k);
  assert.ok(!buildInterviewerSystem({ name: 'Han', callName: 'ฮาน', selfName: 'เรา', cat, seeds: [], known: [], facts: [], core: '', turns: 3 }).includes('move=summary):'), 'ยังไม่ถึงเวลาสรุป');
});

t('parseInterviewerReply อ่าน JSON/ห่อ ``` ได้ จำกัดจำนวน และทนข้อความดิบ', () => {
  const r = parseInterviewerReply('```json\n{"reflect":"ฟังแล้วเหมือนเหงา","facts":["a","b","c","d"],"move":"example","question":"คืนนั้นทำอะไร","choices":["โล่ง","เหงา","ก","ข","ค"],"topic_done":false}\n```');
  assert.equal(r.question, 'คืนนั้นทำอะไร');
  assert.equal(r.facts.length, 3);
  assert.equal(r.choices.length, 4);
  assert.equal(r.move, 'example');
  assert.equal(parseInterviewerReply('{"question":"x","move":"มั่ว"}').move, 'switch');
  const raw = parseInterviewerReply('ถามอะไรสักอย่างเหรอ');
  assert.equal(raw.question, 'ถามอะไรสักอย่างเหรอ');
  assert.ok(raw.raw);
  assert.equal(parseInterviewerReply('{"question":"จบ","topic_done":true}').done, true);
});

t('usage: รวมยอดวัน/เดือน, ระดับงบ, ราคา, รูปแบบตัวเลข', () => {
  const now = new Date(2026, 9, 23, 12);
  let days = {};
  days = addToDays(days, '2026-10-23', { usd: 0.1, input: 100, output: 50 }, now);
  days = addToDays(days, '2026-10-23', { usd: 0.05, input: 10, output: 5 }, now);
  days = addToDays(days, '2026-10-02', { usd: 0.2 }, now);
  days = addToDays(days, '2026-09-30', { usd: 9 }, now);
  const s = summarize(days, now);
  assert.ok(Math.abs(s.day.usd - 0.15) < 1e-9 && s.day.n === 2 && s.day.input === 110);
  assert.ok(Math.abs(s.month.usd - 0.35) < 1e-9, 'เดือนนี้ไม่นับเดือนก่อน');
  assert.equal(dayKey(now), '2026-10-23');
  assert.equal(levelOf(0.5, 1), 'ok'); assert.equal(levelOf(0.8, 1), 'warn'); assert.equal(levelOf(1, 1), 'over'); assert.equal(levelOf(5, 0), 'ok');
  assert.deepEqual(costOf({ cost: 0.01, prompt_tokens: 5, completion_tokens: 6 }, null), { usd: 0.01, input: 5, output: 6, unknown: 0 });
  assert.ok(Math.abs(costOf({ prompt_tokens: 1000, completion_tokens: 100 }, [0.000001, 0.000002]).usd - 0.0012) < 1e-12);
  assert.equal(costOf({ prompt_tokens: 10, completion_tokens: 1 }, null).unknown, 1);
  assert.equal(fmtUsd(0), '$0.00'); assert.equal(fmtUsd(0.24), '$0.24'); assert.equal(fmtUsd(0.0004), '$0.0004');
  assert.equal(fmtThb(0.24, 33), '7.9 บาท');
});

console.log(`\nผ่านทั้งหมด ${n} ข้อ`);
