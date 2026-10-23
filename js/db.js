// ที่เก็บข้อมูลในมือถือ (IndexedDB) · ข้อมูลที่ผู้ใช้บันทึกห้ามเปลี่ยนโครงสร้างโดยไม่ทำ migration
// stores: kv (ค่าตั้งค่าทั่วไป) · answers (คำตอบสัมภาษณ์) · memories (ความจำ) · chats (แชต)

const DB_NAME = 'twin-life';
const VERSION = 1;
const LIST_STORES = ['answers', 'memories', 'chats'];
export const APP_ID = 'my-twin-life';
export const SECRET_KEYS = ['apiKey']; // ไม่ใส่ในไฟล์สำรอง

let dbp;
function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('kv');
        for (const s of LIST_STORES) db.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const kvGet = async (k, fallback = null) => {
  const v = await run('kv', 'readonly', (s) => s.get(k));
  return v === undefined ? fallback : v;
};
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k));
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const getOne = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const put = (store, obj) => run(store, 'readwrite', (s) => s.put(obj));
export const del = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

export async function exportAll() {
  const db = await open();
  const kv = {};
  await new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readonly');
    const c = t.objectStore('kv').openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return resolve();
      if (!SECRET_KEYS.includes(cur.key)) kv[cur.key] = cur.value;
      cur.continue();
    };
    c.onerror = () => reject(c.error);
  });
  const out = { app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(), kv };
  for (const s of LIST_STORES) out[s] = await getAll(s);
  return out;
}

// นำเข้าแบบรวม: รายการที่ id เดียวกันถูกเขียนทับ ที่ไม่มีใน​ไฟล์ไม่ถูกลบ (ปลอดภัยกว่าแทนที่ทั้งหมด)
export async function importAll(data) {
  if (!data || data.app !== APP_ID) throw new Error('ไม่ใช่ไฟล์สำรองของแอพนี้');
  let n = 0;
  for (const s of LIST_STORES) {
    for (const obj of Array.isArray(data[s]) ? data[s] : []) {
      if (obj && obj.id) { await put(s, obj); n++; }
    }
  }
  for (const [k, v] of Object.entries(data.kv || {})) {
    if (!SECRET_KEYS.includes(k)) await kvSet(k, v);
  }
  return n;
}

export async function wipeAll() {
  for (const s of ['kv', ...LIST_STORES]) await run(s, 'readwrite', (st) => st.clear());
}
