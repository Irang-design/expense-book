import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { neon } from '@neondatabase/serverless';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const categories = ['식비', '카페·간식', '교통', '쇼핑', '주거·통신', '건강', '문화·여가', '기타'];
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method) && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
  next();
});
const digest = value => createHash('sha256').update(value).digest();
const sign = value => createHmac('sha256', process.env.APP_PASSWORD).update(value).digest('hex');
const secure = () => process.env.VERCEL || process.env.NODE_ENV === 'production';
const cookie = (value, age) => `expense_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure() ? '; Secure' : ''}`;
function authenticated(req) {
  if (!process.env.APP_PASSWORD) return false;
  const token = (req.headers.cookie || '').split('; ').find(c => c.startsWith('expense_session='))?.slice(16);
  if (!token) return false;
  const [expires, nonce, signature] = token.split('.');
  return !!signature && Number(expires) > Date.now() && timingSafeEqual(digest(signature), digest(sign(`${expires}.${nonce}`)));
}
app.get('/api/session', (req, res) => res.json({ authenticated: authenticated(req), configured: !!process.env.APP_PASSWORD }));
app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' } }), (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: '서버에 APP_PASSWORD를 설정해 주세요.' });
  if (typeof req.body.password !== 'string' || !timingSafeEqual(digest(req.body.password), digest(process.env.APP_PASSWORD))) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  const payload = `${Date.now() + 8 * 60 * 60 * 1000}.${randomBytes(24).toString('hex')}`;
  res.set('Set-Cookie', cookie(`${payload}.${sign(payload)}`, 28800)).json({ ok: true });
});
app.post('/api/logout', (req, res) => res.set('Set-Cookie', cookie('', 0)).json({ ok: true }));
app.use('/api', (req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: '로그인이 필요합니다.' }));
let sql;
let ready;
async function database() {
  if (!process.env.DATABASE_URL) { const err = new Error('Database not configured'); err.status = 503; throw err; }
  if (!sql) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw new Error('Invalid Neon URL');
      sql = neon(process.env.DATABASE_URL);
    } catch { const err = new Error('Database not configured'); err.status = 503; throw err; }
  }
  ready ||= sql`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, date DATE NOT NULL, item VARCHAR(100) NOT NULL, category VARCHAR(30) NOT NULL, amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 999999999999), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.catch(err => { ready = undefined; throw err; });
  await ready;
  return sql;
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) >= '1900' && value.slice(0, 4) <= '9999' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validExpense(body) {
  return body && validDate(body.date) && typeof body.item === 'string' && body.item.trim().length > 0 && body.item.trim().length <= 100 && categories.includes(body.category) && Number.isSafeInteger(body.amount) && body.amount > 0 && body.amount <= 999999999999;
}
app.get('/api/expenses', async (req, res) => {
  const { month, date } = req.query;
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`) || (date && (!validDate(date) || !date.startsWith(month)))) return res.status(400).json({ error: '검색 날짜를 확인해 주세요.' });
  const db = await database();
  const start = `${month}-01`;
  const expenses = await db`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount::float8 AS amount FROM expenses WHERE date >= ${start}::date AND date < ${start}::date + INTERVAL '1 month' AND (${date || null}::date IS NULL OR date = ${date || null}::date) ORDER BY date DESC, id DESC`;
  const summary = await db`SELECT category, SUM(amount)::float8 AS total, COUNT(*)::int AS count FROM expenses WHERE date >= ${start}::date AND date < ${start}::date + INTERVAL '1 month' GROUP BY category ORDER BY total DESC`;
  res.json({ expenses, summary });
});
app.post('/api/expenses', async (req, res) => {
  if (!validExpense(req.body)) return res.status(400).json({ error: '날짜, 항목, 카테고리, 금액을 확인해 주세요.' });
  const { date, item, category, amount } = req.body;
  const db = await database();
  const [row] = await db`INSERT INTO expenses (date, item, category, amount) VALUES (${date}, ${item.trim()}, ${category}, ${amount}) RETURNING id`;
  res.status(201).json(row);
});
app.param('id', (req, res, next, id) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 && Number(id) <= 2147483647 ? next() : res.status(400).json({ error: '잘못된 내역 번호입니다.' }));
app.put('/api/expenses/:id', async (req, res) => {
  if (!validExpense(req.body)) return res.status(400).json({ error: '입력 내용을 확인해 주세요.' });
  const { date, item, category, amount } = req.body;
  const db = await database();
  const rows = await db`UPDATE expenses SET date=${date}, item=${item.trim()}, category=${category}, amount=${amount} WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows[0] || { error: '내역을 찾을 수 없습니다.' });
});
app.delete('/api/expenses/:id', async (req, res) => {
  const db = await database();
  const rows = await db`DELETE FROM expenses WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows[0] || { error: '내역을 찾을 수 없습니다.' });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'API를 찾을 수 없습니다.' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status === 503 ? '서버에 유효한 Neon DATABASE_URL을 설정해 주세요.' : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }));
if (!process.env.VERCEL && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) app.listen(process.env.PORT || 3000, () => console.log(`가계부: http://localhost:${process.env.PORT || 3000}`));
export default app;
