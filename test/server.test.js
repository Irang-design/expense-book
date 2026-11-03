import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app, { validDate, validExpense } from '../server.js';
let server, base;
const previousPassword = process.env.APP_PASSWORD;
const previousDatabase = process.env.DATABASE_URL;
before(async () => {
  process.env.APP_PASSWORD = 'test-only-strong-password';
  delete process.env.DATABASE_URL;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (previousPassword === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = previousPassword;
  if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
});
test('실제 달력 날짜와 지출 입력 검증', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const date of ['2025-02-29', '2026-13-01', '2026-04-31', '2026-1-01']) assert.equal(validDate(date), false);
  const expense = { date: '2026-11-03', item: '점심', category: '식비', amount: 10000 };
  assert.equal(validExpense(expense), true);
  for (const amount of [0, -1, 0.5, '100', 1000000000000]) assert.equal(validExpense({ ...expense, amount }), false);
  assert.equal(validExpense({ ...expense, item: '  ' }), false);
  assert.equal(validExpense({ ...expense, category: 'unknown' }), false);
});
test('미인증 API 접근 차단 및 비밀 파일 비공개', async () => {
  assert.equal((await fetch(`${base}/api/expenses?month=2026-11`)).status, 401);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
});
test('비밀번호, 쿠키, 변조 방어, 입력 오류, 환경변수 미설정 응답', async () => {
  const login = password => fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal((await login('incorrect')).status, 401);
  const response = await login(process.env.APP_PASSWORD);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  const session = await fetch(`${base}/api/session`, { headers: { cookie } });
  assert.equal((await session.json()).authenticated, true);
  const forged = await fetch(`${base}/api/session`, { headers: { cookie: `${cookie}x` } });
  assert.equal((await forged.json()).authenticated, false);
  assert.equal((await fetch(`${base}/api/expenses?month=2026-13`, { headers: { cookie } })).status, 400);
  assert.equal((await fetch(`${base}/api/expenses?month=2026-11`, { headers: { cookie } })).status, 503);
  const cross = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie, Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie } });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
