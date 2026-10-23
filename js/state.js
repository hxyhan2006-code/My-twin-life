import { kvGet } from './db.js';

export async function getSettings() {
  const [apiKey, model, lightModel, userName] = await Promise.all([
    kvGet('apiKey', ''), kvGet('model', ''), kvGet('lightModel', ''), kvGet('userName', 'Han'),
  ]);
  return { apiKey, model, lightModel: lightModel || model, userName: userName || 'Han' };
}

export const needsSetup = (s) => (!s.apiKey ? 'ยังไม่ได้ใส่ OpenRouter key' : !s.model ? 'ยังไม่ได้เลือกโมเดล' : '');
