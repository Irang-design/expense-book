// 실제 서버에서 검증용 행 하나만 생성하고 반드시 정리합니다. 비밀 값은 출력하지 않습니다.
import 'dotenv/config';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
let cookie, id;
async function request(route, method = 'GET', body) {
  const res = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${result.error || '요청 실패'}`);
  return { res, result };
}
try {
  const login = await request('/api/login', 'POST', { password: process.env.APP_PASSWORD });
  cookie = login.res.headers.get('set-cookie').split(';')[0];
  const expense = { date: '2000-01-01', item: `연결 검증용 ${Date.now()}`, category: '기타', amount: 1234 };
  id = (await request('/api/expenses', 'POST', expense)).result.id;
  const read = (await request('/api/expenses?month=2000-01&date=2000-01-01')).result;
  assert.equal(read.expenses.find(row => row.id === id)?.amount, 1234);
  assert.ok(read.summary.some(row => row.category === '기타' && row.total >= 1234));
  await request(`/api/expenses/${id}`, 'PUT', { ...expense, amount: 2345 });
  const updated = (await request('/api/expenses?month=2000-01')).result;
  assert.equal(updated.expenses.find(row => row.id === id)?.amount, 2345);
  await request(`/api/expenses/${id}`, 'DELETE');
  const removed = (await request('/api/expenses?month=2000-01')).result;
  assert.equal(removed.expenses.some(row => row.id === id), false);
  id = null;
  console.log('PASS: 실제 Neon 추가·조회·날짜 검색·월별 통계·수정·삭제 검증 완료');
} catch (err) {
  console.error(err.message.startsWith('HTTP') ? err.message : '연결 검증 실패 (네트워크 또는 응답 확인 필요)');
  process.exitCode = 1;
} finally {
  if (id) {
    try { await request(`/api/expenses/${id}`, 'DELETE'); console.log('검증용 내역 정리 완료'); }
    catch { console.error(`검증용 내역 id=${id} 정리가 필요합니다.`); process.exitCode = 1; }
  }
}
