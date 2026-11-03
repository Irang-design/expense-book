const $ = id => document.getElementById(id);
const categories = ['식비', '카페·간식', '교통', '쇼핑', '주거·통신', '건강', '문화·여가', '기타'];
const won = value => `${Number(value).toLocaleString('ko-KR')}원`;
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
let expenses = [], editing = null, requestVersion = 0;
for (const category of categories) $('category').add(new Option(category, category));
$('month').value = today().slice(0, 7);
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login') showLogin();
    throw new Error(data.error || '요청을 처리하지 못했습니다.');
  }
  return data;
}
function showLogin() { requestVersion++; $('editor').close(); $('dashboard').hidden = true; $('login').hidden = false; expenses = []; $('rows').replaceChildren(); $('chart').replaceChildren(); }
function node(tag, className, content) { const el = document.createElement(tag); if (className) el.className = className; if (content !== undefined) el.textContent = content; return el; }
async function load() {
  const version = ++requestVersion;
  $('status').textContent = '기록을 불러오는 중입니다…';
  $('rows').replaceChildren(); $('empty').hidden = true;
  for (const id of ['total', 'count', 'top-category']) $(id).textContent = '—';
  $('chart').replaceChildren();
  const month = $('month').value;
  if (!month) { $('status').textContent = '조회할 월을 선택해 주세요.'; return; }
  $('date-filter').min = `${month}-01`;
  const last = new Date(`${month}-01T00:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  $('date-filter').max = last.toISOString().slice(0, 10);
  try {
    const data = await api(`/api/expenses?month=${month}${$('date-filter').value ? `&date=${$('date-filter').value}` : ''}`);
    if (version !== requestVersion) return;
    expenses = data.expenses;
    const total = data.summary.reduce((sum, row) => sum + row.total, 0);
    $('total').textContent = won(total);
    $('count').textContent = `${data.summary.reduce((sum, row) => sum + row.count, 0)}건`;
    $('top-category').textContent = data.summary[0]?.category || '아직 없어요';
    $('top-caption').textContent = total ? `전체 지출의 ${Math.round(data.summary[0].total / total * 100)}% · ${won(data.summary[0].total)}` : '첫 지출을 기록해 보세요.';
    $('total-caption').textContent = `${Number(month.slice(5))}월 전체 지출 기준`;
    $('list-caption').textContent = $('date-filter').value ? `${$('date-filter').value}의 소비 기록입니다.` : '이번 달의 소비 기록입니다.';
    $('result-count').textContent = `${expenses.length}건`;
    $('rows').replaceChildren();
    for (const expense of expenses) {
      const row = node('tr');
      const item = node('td'); item.append(node('small', '', expense.date.replaceAll('-', '.')), node('strong', '', expense.item));
      const category = node('td'); category.append(node('span', 'category', expense.category));
      const actions = node('td', 'actions');
      const edit = node('button', '', '수정'); edit.setAttribute('aria-label', `${expense.item} 수정`); edit.onclick = () => openEditor(expense);
      const remove = node('button', '', '삭제'); remove.setAttribute('aria-label', `${expense.item} 삭제`);
      remove.onclick = async () => {
        if (!confirm(`“${expense.item}” 지출을 삭제할까요?`)) return;
        remove.disabled = true;
        try { await api(`/api/expenses/${expense.id}`, { method: 'DELETE' }); await load(); } catch (err) { $('status').textContent = err.message; remove.disabled = false; }
      };
      actions.append(edit, remove); row.append(item, category, node('td', 'amount', won(expense.amount)), actions); $('rows').append(row);
    }
    $('empty').hidden = expenses.length > 0;
    $('chart').replaceChildren();
    if (!data.summary.length) $('chart').append(node('p', 'chart-empty', '지출을 기록하면 그래프가 나타나요.'));
    for (const summary of data.summary) {
      const row = node('div', 'bar-row'), label = node('div', 'bar-label'), track = node('div', 'bar-track'), bar = node('div', 'bar');
      label.append(node('span', '', summary.category), node('strong', '', won(summary.total)));
      bar.style.width = `${summary.total / data.summary[0].total * 100}%`;
      track.setAttribute('role', 'img'); track.setAttribute('aria-label', `${summary.category}: ${won(summary.total)}, 전체의 ${Math.round(summary.total / total * 100)}퍼센트`);
      track.append(bar); row.append(label, track); $('chart').append(row);
    }
    $('status').textContent = '';
  } catch (err) { if (version === requestVersion) $('status').textContent = err.message; }
}
function openEditor(expense) {
  editing = expense?.id || null;
  $('expense-form').reset(); $('form-error').textContent = '';
  $('editor-title').textContent = editing ? '지출 수정하기' : '지출 기록하기';
  $('expense-date').value = expense?.date || today(); $('item').value = expense?.item || ''; $('category').value = expense?.category || categories[0]; $('amount').value = expense?.amount || '';
  $('editor').showModal();
}
$('add').onclick = $('empty-add').onclick = () => openEditor();
$('close').onclick = () => $('editor').close();
$('expense-form').onsubmit = async event => {
  event.preventDefault(); $('save').disabled = true; $('form-error').textContent = '';
  const body = { date: $('expense-date').value, item: $('item').value.trim(), category: $('category').value, amount: Number($('amount').value) };
  try {
    await api(editing ? `/api/expenses/${editing}` : '/api/expenses', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
    $('month').value = body.date.slice(0, 7); $('date-filter').value = ''; $('editor').close(); await load();
  } catch (err) { $('form-error').textContent = err.message; } finally { $('save').disabled = false; }
};
$('login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) }); $('password').value = ''; $('login-error').textContent = ''; $('login').hidden = true; $('dashboard').hidden = false; await load(); }
  catch (err) { $('login-error').textContent = err.message; } finally { button.disabled = false; }
};
$('logout').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); showLogin(); } catch (err) { $('status').textContent = err.message; } };
$('month').onchange = () => { $('date-filter').value = ''; load(); };
$('date-filter').onchange = () => load();
$('clear-filter').onclick = () => { $('date-filter').value = ''; load(); };
function moveMonth(delta) {
  if (!$('month').value) return;
  const date = new Date(`${$('month').value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta);
  const year = date.getUTCFullYear(); if (year < 1900 || year > 9999) return;
  $('month').value = date.toISOString().slice(0, 7); $('date-filter').value = ''; load();
}
$('prev').onclick = () => moveMonth(-1); $('next').onclick = () => moveMonth(1);
$('this-month').onclick = () => { $('month').value = today().slice(0, 7); $('date-filter').value = ''; load(); };
api('/api/session').then(data => { if (data.authenticated) { $('login').hidden = true; $('dashboard').hidden = false; load(); } else if (!data.configured) $('login-error').textContent = '서버의 APP_PASSWORD 환경변수를 먼저 설정해 주세요.'; }).catch(err => { $('login-error').textContent = err.message; });
