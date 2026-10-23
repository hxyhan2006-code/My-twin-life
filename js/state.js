import { kvGet, kvSet } from './db.js';

export async function getSettings() {
  const [apiKey, model, lightModel, userName, callName, selfName] = await Promise.all([
    kvGet('apiKey', ''), kvGet('model', ''), kvGet('lightModel', ''), kvGet('userName', 'Han'), kvGet('callName', ''), kvGet('selfName', ''),
  ]);
  return { apiKey, model, lightModel: lightModel || model, userName: userName || 'Han', callName, selfName };
}

export const needsSetup = (s) => (!s.apiKey ? 'ยังไม่ได้ใส่ OpenRouter key' : !s.model ? 'ยังไม่ได้เลือกโมเดล' : '');

export const FONT_SIZES = [['เล็ก', 16], ['ปกติ', 18], ['ใหญ่', 20], ['ใหญ่มาก', 22]];
export const DEFAULT_FONT = 18;

export const setFontVar = (px) => document.documentElement.style.setProperty('--fs', `${px}px`);
export async function applyFontSize() {
  setFontVar(await kvGet('fontSize', DEFAULT_FONT));
}
export async function saveFontSize(px) {
  await kvSet('fontSize', px);
  setFontVar(px);
}
