// เทสต์ส่วนที่เป็นตรรกะล้วน (ไม่ต้องใช้เบราว์เซอร์) รัน: node tests/run.mjs
import assert from 'node:assert/strict';
import { rank, grams } from '../js/retrieve.js';
import { buildSystem, extractJson } from '../js/prompt.js';
import { extractSources } from '../js/api.js';
import { dateKey, checkinsForPrompt, describeEntry } from '../js/checkin.js';
import { mdToHtml } from '../js/md.js';
import { BASE_QUESTIONS, CATEGORIES, GROUPS, groupOfCat } from '../js/questions.js';
import { createTypewriter } from '../js/typewriter.js';
import { buildInterviewerSystem, parseInterviewerReply } from '../js/interviewer.js';
import { summarize, addToDays, levelOf, costOf, fmtUsd, fmtThb, dayKey } from '../js/usage.js';
import { normalizeMemories } from '../js/profile.js';
import { goalsForPrompt } from '../js/goals.js';
import { financeForPrompt } from '../js/vaultet.js';
import { instructionsForPrompt } from '../js/instructions.js';
import { squareCrop } from '../js/avatar.js';
import { collectWriting, clampTexts, pickSamples } from '../js/style.js';

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

t('buildSystem ใส่สไตล์การพูดและตัวอย่างข้อความจริง (ถ้าไม่มีก็ไม่ขึ้นหัวข้อ)', () => {
  const s = buildSystem({ name: 'Han', style: 'ลงท้ายด้วย นะ บ่อย', samples: ['เออ ก็ได้\nนะ'] });
  assert.ok(s.includes('ลงท้ายด้วย นะ บ่อย') && s.includes('- เออ ก็ได้ / นะ'));
  const none = buildSystem({ name: 'Han' });
  assert.ok(!none.includes('เรียนรู้จากที่เขาพิมพ์จริง') && !none.includes('ตัวอย่างข้อความจริง'));
});

t('เช็กอิน: คีย์วันเป็นเวลาท้องถิ่น (ไม่เลื่อนวันตาม UTC) และสรุปเฉพาะ 7 วันล่าสุดที่มีข้อมูล', () => {
  assert.equal(dateKey(new Date(2026, 9, 25, 0, 5)), '2026-10-25');
  assert.equal(dateKey(new Date(2026, 0, 3, 23, 59)), '2026-01-03');
  const now = new Date(2026, 9, 25, 3, 0);
  const map = {
    '2026-10-25': { wake: '09:30', work: 'h1_2', workNote: 'ตัดคลิป', body: false, note: 'ตื่นสาย' },
    '2026-10-23': { wake: '06:00', work: 'h3p', body: true },
    '2026-10-10': { wake: '05:00' }, // เกิน 7 วัน ต้องไม่ถูกส่ง
  };
  const lines = checkinsForPrompt(map, now);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('2 จาก 7') && lines[0].includes('ไม่รู้'));
  assert.ok(lines[1].includes('ตื่น 06:00') && lines[1].includes('3 ชม.ขึ้นไป') && lines[1].includes('ออกกำลังกาย: ทำ'));
  assert.ok(lines[2].includes('ตื่น 09:30') && lines[2].includes('ตัดคลิป') && lines[2].includes('ออกกำลังกาย: ไม่ทำ'));
  assert.ok(!lines.join('').includes('05:00'));
  assert.deepEqual(checkinsForPrompt({}, now), []);
  assert.deepEqual(checkinsForPrompt(null, now), []);
  assert.equal(describeEntry({}), '');
  assert.ok(describeEntry({ note: 'ก'.repeat(500) }).length < 150);
});

t('buildSystem ใส่เช็กอินเมื่อมี (ทั้งสองโหมด) และไม่ขึ้นหัวข้อเมื่อไม่มี', () => {
  const c = ['เช็กอิน 1 จาก 7', 'อา.: ตื่น 09:30'];
  for (const persona of ['self', 'assistant']) {
    const s = buildSystem({ name: 'Han', persona, checkins: c });
    assert.ok(s.includes('เช็กอินรายวันของ Han') && s.includes('ตื่น 09:30') && s.includes('ห้ามเดาเรื่องวันที่ไม่ได้เช็กอิน'));
    assert.ok(!buildSystem({ name: 'Han', persona }).includes('เช็กอินรายวัน'));
  }
});

t('extractSources: ดึงลิงก์จาก annotations ทั้งสองรูปแบบ ข้ามของที่ไม่ใช่ลิงก์เว็บ', () => {
  const got = extractSources({ delta: { annotations: [
    { type: 'url_citation', url_citation: { url: 'https://a.com/x', title: 'A' } },
    { type: 'url_citation', url: 'https://b.com', title: 'B' },
    { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'bad' } },
    { type: 'file', url: 'https://c.com' },
  ] } });
  assert.deepEqual(got, [{ url: 'https://a.com/x', title: 'A' }, { url: 'https://b.com', title: 'B' }]);
  assert.deepEqual(extractSources(undefined), []);
  assert.deepEqual(extractSources({ delta: { content: 'hi' } }), []);
});

t('buildSystem ค้นเว็บ: ใส่คำสั่งเฉพาะตอนเปิด', () => {
  assert.ok(buildSystem({ name: 'Han', web: true }).includes('เปิดค้นเว็บอยู่'));
  assert.ok(!buildSystem({ name: 'Han' }).includes('เปิดค้นเว็บอยู่'));
});

t('buildSystem โหมดผู้ช่วย: พูดเป็นคนนอก เทียบคำพูดกับข้อมูล ไม่เลียนแบบ ไม่ใส่ตัวอย่างข้อความ', () => {
  const a = buildSystem({ name: 'Han', persona: 'assistant', style: 'ลงท้ายด้วย นะ', samples: ['เออ ก็ได้'] });
  assert.ok(a.includes('ผู้ช่วยส่วนตัว') && a.includes('ไม่ใช่ตัว Han เอง'));
  assert.ok(a.includes('เทียบคำพูดกับข้อมูลจริง') && a.includes('ห้ามประจบ') && a.includes('ห้ามแต่งความทรงจำ'));
  assert.ok(a.includes('ไม่ต้องพูดตาม') && !a.includes('เออ ก็ได้'));
  assert.ok(a.includes('ใส่ใจจริงจัง'));
  const self = buildSystem({ name: 'Han', samples: ['เออ ก็ได้'] });
  assert.ok(self.includes('Han ตัวจริง') && self.includes('เออ ก็ได้') && !self.includes('ผู้ช่วยส่วนตัว'));
  assert.ok(!buildSystem({ name: 'Han', persona: 'assistant', deep: true }).includes('ยังพูดเป็นเสียงของ'));
});

t('buildSystem โหมดคิดลึก: มีกฎโต้แย้งก่อนเห็นด้วย เฉพาะตอนเปิด', () => {
  assert.ok(buildSystem({ name: 'Han', deep: true }).includes('ห้ามเออออ'));
  assert.ok(!buildSystem({ name: 'Han' }).includes('โหมดคิดลึก'));
});

t('เป้าหมาย: ส่งเฉพาะที่ active + กรอบเวลา + เตือนเมื่อไม่ได้อัปเดตเกิน 14 วัน และ buildSystem ใส่ให้', () => {
  const now = 100 * 864e5;
  const goals = [
    { text: 'เก็บเงิน 1 แสน', when: 'ก่อนสิ้นปี', status: 'active', createdAt: now - 20 * 864e5, updatedAt: now - 20 * 864e5 },
    { text: 'ออกกำลังกาย', status: 'active', createdAt: now, updatedAt: now - 1 * 864e5 },
    { text: 'เรียนจบ', status: 'done', createdAt: 0, updatedAt: 0 },
  ];
  const lines = goalsForPrompt(goals, now);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('ก่อนสิ้นปี') && lines[0].includes('ไม่ได้อัปเดต 20 วัน'));
  assert.ok(!lines[1].includes('ไม่ได้อัปเดต'));
  const s = buildSystem({ name: 'Han', goals: lines });
  assert.ok(s.includes('เก็บเงิน 1 แสน') && s.includes('ห้ามเอาเป้าหมายมาพูดซ้ำ'));
  assert.ok(!buildSystem({ name: 'Han' }).includes('เป้าหมายที่'));
});

t('การเงินจาก Vaultet: จัดข้อความครบ เตือนเมื่อข้อมูลเก่า ไม่มีข้อมูลก็ไม่ใส่ และ buildSystem ใส่ให้', () => {
  const now = 10 * 864e5;
  const snap = { v: 1, at: now - 4 * 864e5, data: {
    totals: { assets: 23583, stock: 146, netWorthValue: -101832 },
    emergencyFund: { recommendedEmergencyFund: 43158, targetMonths: 3, reserveCoverageMonths: 1.6291922702627553, status: 'WATCH' },
    netWorth: { totalMoneyAllAccounts: 49500, reserved: 1000, available: 48500, liabilities: 12000, receivablesOutstanding: 0, savedTotal: 0, emergencySaved: 0 },
    thisMonth: { income: 30000, expense: 500, saving: 0, netCashFlow: 29500, topExpenseCategories: [{ category: 'กิน', amount: 500 }] },
    debts: { list: [{ name: 'ผ่อนมือถือ', outstandingBalance: 12000 }] },
    goals: [{ name: 'โน้ตบุ๊ก', saved: 7500, targetAmount: 30000, progressPct: 25, deadline: '2027-06-01' }],
  } };
  const text = financeForPrompt(snap, now);
  assert.ok(text.includes('฿49,500') && text.includes('฿12,000') && text.includes('กิน ฿500'));
  assert.ok(text.includes('ผ่อนมือถือ คงเหลือ ฿12,000') && text.includes('โน้ตบุ๊ก ออมแล้ว ฿7,500/฿30,000 (25%)'));
  assert.ok(text.includes('เก่า 4 วัน'));
  assert.ok(text.includes('มูลค่าสุทธิ -฿101,832') && text.includes('สินทรัพย์รวม ฿23,583'), 'ค่าลบต้องเป็น -฿ ไม่ใช่ ฿-');
  assert.ok(text.includes('ครอบคลุม 1.6 เดือน') && !text.includes('1.629'), 'ปัดเศษเดือนเหลือ 1 ตำแหน่ง');
  assert.ok(!financeForPrompt({ ...snap, at: now - 864e5 }, now).includes('เก่า'));
  assert.equal(financeForPrompt(null), '');
  const s = buildSystem({ name: 'Han', finance: text });
  assert.ok(s.includes('จากแอพ Vaultet') && s.includes('ห้ามเดาตัวเลข'));
  assert.ok(!buildSystem({ name: 'Han' }).includes('Vaultet'));
});

t('คำสั่งถึง twin: ส่งเฉพาะข้อที่เปิด ตัดข้อว่าง และ buildSystem ใส่ให้ (ไม่มีก็ไม่ขึ้นหัวข้อ)', () => {
  const list = [{ text: 'ตอบสั้นๆ', on: true }, { text: 'อย่าใช้อีโมจิ', on: false }, { text: '   ', on: true }];
  assert.deepEqual(instructionsForPrompt(list), ['ตอบสั้นๆ']);
  const s = buildSystem({ name: 'Han', instructions: ['ตอบสั้นๆ'] });
  assert.ok(s.includes('- ตอบสั้นๆ') && s.includes('ไม่ปิดกฎข้อ 6'));
  assert.ok(!buildSystem({ name: 'Han', instructions: [] }).includes('คำสั่งที่ Han ตั้งไว้'));
});

t('รูปโปรไฟล์: ครอปตรงกลางเป็นสี่เหลี่ยมจัตุรัสทั้งรูปแนวนอน/แนวตั้ง/จัตุรัส', () => {
  assert.deepEqual(squareCrop(400, 200), { sx: 100, sy: 0, s: 200 });
  assert.deepEqual(squareCrop(200, 500), { sx: 0, sy: 150, s: 200 });
  assert.deepEqual(squareCrop(300, 300), { sx: 0, sy: 0, s: 300 });
});

t('collectWriting รวมข้อความของเราจากแชต+คำตอบสัมภาษณ์ เรียงเวลา ไม่เอาของ AI', () => {
  const chats = [{ updatedAt: 5, messages: [{ role: 'user', content: 'ก', ts: 3 }, { role: 'assistant', content: 'ไม่เอา', ts: 4 }] }];
  const answers = [{ answer: 'ข', updatedAt: 1 }, { answer: '', updatedAt: 2 }];
  assert.deepEqual(collectWriting(chats, answers).map((x) => x.text), ['ข', 'ก']);
});

t('clampTexts ไม่เกินงบตัวอักษร และ pickSamples เลือกข้อความพอดี ไม่ซ้ำ ไม่เกิน 8', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ ts: i, text: 'ข้อความทดสอบยาวพอสมควรลำดับที่ ' + i }));
  assert.ok(clampTexts(many).length <= 60);
  const big = [{ ts: 1, text: 'ก'.repeat(5000) }, { ts: 2, text: 'ข'.repeat(5000) }];
  assert.ok(clampTexts(big).join('').length <= 9000);
  const s = pickSamples([...many, { ts: 200, text: 'สั้น' }], ['ข้อความทดสอบยาวพอสมควรลำดับที่ 99']);
  assert.ok(s.length <= 8 && new Set(s).size === s.length && !s.includes('สั้น'));
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

t('parseInterviewerReply: JSON ถูกตัดกลางคัน → กู้ที่ปิดแล้ว/ไม่โชว์ JSON ดิบ', () => {
  const full = parseInterviewerReply('```json\n{\n  "reflect": "ดีใจที่ได้นั่งคุยกัน",\n  "facts": [],\n  "move": "warmup",\n  "question": "ตอนนี้ทำอะไรอยู่?",\n  "choices": ["เรียน"');
  assert.equal(full.question, 'ตอนนี้ทำอะไรอยู่?');
  assert.equal(full.reflect, 'ดีใจที่ได้นั่งคุยกัน');
  assert.equal(full.incomplete, false);
  const cut = parseInterviewerReply('```json\n{\n  "reflect": "ดีใจที่ได้มานั่งคุยกันแบบนี้นะ Ha');
  assert.equal(cut.incomplete, true);
  assert.equal(cut.question, '');
  assert.equal(parseInterviewerReply('{"question":"ข้อเดียว"}').incomplete, false);
  assert.equal(parseInterviewerReply('ถามธรรมดาไม่มี json').incomplete, false);
});

console.log(`\nผ่านทั้งหมด ${n} ข้อ`);
