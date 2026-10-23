// เทสต์ส่วนที่เป็นตรรกะล้วน (ไม่ต้องใช้เบราว์เซอร์) รัน: node tests/run.mjs
import assert from 'node:assert/strict';
import { rank, grams } from '../js/retrieve.js';
import { buildSystem, extractJson } from '../js/prompt.js';
import { mdToHtml } from '../js/md.js';
import { BASE_QUESTIONS, CATEGORIES, GROUPS, groupOfCat } from '../js/questions.js';
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

console.log(`\nผ่านทั้งหมด ${n} ข้อ`);
