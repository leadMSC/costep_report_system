// 서류 올리기 끝까지 점검(헤드리스 Chrome + DevTools): 앱을 열고 서류 창에 파일을 넣은 뒤 다 읽힐 때까지 기다렸다가
// '선택 적용'까지 누르고, 지식재산권 줄에 들어간 결과를 칸 채움 수로 보고한다(값은 찍지 않음 — 실제 서류 보호).
// 사용: node tools/docs_e2e.js tests/pdf_sample/ip/s11.pdf [다른 파일...]   (로컬 서버 127.0.0.1:5180 필요)
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const files = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const app = 'http://127.0.0.1:5180/%EC%BD%94%EC%8A%A4%ED%85%9D_%EA%B2%BD%EC%98%81%EC%A7%84%EB%8B%A8_%EB%A6%AC%EB%93%9C%EB%94%94%EB%B2%A8%EB%A1%AD.html';
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', app], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) { } }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const wait = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; }
    // 페이지 오류·경고는 바로 보여 줌(값이 담길 수 있는 일반 로그는 안 찍음)
    if (d.method === 'Runtime.exceptionThrown') console.log('  [페이지 오류]', (d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type)) console.log('  [콘솔 ' + d.params.type + ']', d.params.args.map(a => String(a.value || a.description || '')).join(' ').slice(0, 300)); };
  ws.send(JSON.stringify({ id: 999999, method: 'Runtime.enable' }));
  const ev = expr => new Promise(r => { const i = ++id; wait[i] = d => r(d.result && d.result.result ? d.result.result.value : d); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  await sleep(2500);
  const t0 = Date.now();
  await ev(`(async () => { window.__DOCS_DEBUG = true; window.confirm = () => true; window.alert = () => {}; newClient(); openDocsModal();
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) { const b = await (await fetch(f)).blob(); dt.items.add(new File([b], 'doc_' + dt.items.length + f.slice(f.lastIndexOf('.')), { type: b.type || (f.endsWith('.pdf') ? 'application/pdf' : '') })); }
    const inp = document.getElementById('docs_mpick'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
  // 다 읽을 때까지(진행 표시가 사라지거나 '선택 적용' 이 켜질 때까지)
  let last = '';
  const LIMIT = +(process.env.LIMIT || 400);
  for (let i = 0; i < LIMIT; i++) {
    await sleep(3000);
    const st = await ev(`(() => { const p = document.getElementById('docs_prog'); return JSON.stringify({ t: document.getElementById('docs_prog_t')?.textContent || '', vis: !!(p && p.offsetParent), applyOn: !document.getElementById('docs_apply').disabled }); })()`);
    const s = JSON.parse(st);
    if (s.t !== last) { console.log(`  ${Math.round((Date.now() - t0) / 1000)}s ${s.t}`); last = s.t; }
    // 모든 파일이 끝났을 때만(파일 사이에 진행 표시가 잠깐 사라질 수 있음)
    const done = await ev(`(window.__docsDebug || []).length`);
    if (process.env.STEPS) { const st2 = await ev(`JSON.stringify((window.__docsPages || []).map(x => x.step + (x.len ? ':' + x.len : '') + (x.bbox ? ':' + JSON.stringify(x.bbox) : '')))`); if (st2 !== globalThis.__lastSt) { console.log('  단계', st2); globalThis.__lastSt = st2; } }
    // 모든 파일이 끝났을 때만: 디버그 기록 수가 파일 수에 닿거나, 진행 표시가 3번(9초) 연속 꺼져 있을 때
    globalThis.__idle = (!s.vis && s.applyOn) ? (globalThis.__idle || 0) + 1 : 0;
    if (!s.vis && s.applyOn && (done >= files.length || globalThis.__idle >= 3)) break;
  }
  const res = await ev(`(() => { document.getElementById('docs_apply').click();
    const rows = ipRead(); const K = ['kind','title','appNo','appDate','applicant','inventor','regNo','regDate'];
    return JSON.stringify(rows.map(r => ({ kind: r.kind, regNoShape: (r.regNo || '').replace(/\\d/g, '9'), title: r.title, filled: K.filter(k => r[k]).length, inventors: r.inventor ? r.inventor.split(', ').length : 0, appDate: r.appDate, regDate: r.regDate }))); })()`);
  console.log(`총 ${Math.round((Date.now() - t0) / 1000)}초`);
  // 파일별 판정 + (DATES=1 이면) 날짜 줄 — 날짜·숫자 줄만, 이름·주소 줄(괄호 안 6자리)은 빼고 한글 낱말은 '가'로
  const dbg = JSON.parse(await ev(`JSON.stringify((window.__docsDebug || []).map(d => ({ name: d.name, kind: d.res && d.res.kind, status: d.res && d.res.status, n: (d.res && d.res.ipItems || []).length, notes: d.res && d.res.notes, error: d.error,
    dates: d.text.split(String.fromCharCode(10)).filter(l => /Date|년|월|PAGE/.test(l) && !/[(]\\d{6}/.test(l)).map(l => l.replace(/[가-힣]{2,}/g, w => /^[년월일]$/.test(w) ? w : '가').slice(0, 70)) })))`));
  dbg.forEach(d => console.log(`  [${d.name}] ${d.kind}/${d.status} ${d.n}건 ${JSON.stringify(d.notes)}${d.error ? ' 오류: ' + d.error : ''}` + (process.env.DATES ? '\n     ' + d.dates.join('\n     ') : '')));
  JSON.parse(res).forEach((r, i) => console.log(`  ${i + 1}. ${r.kind} ${r.regNoShape} | ${r.title} | 칸 ${r.filled}/8 · 발명자 ${r.inventors}명 · 출원일 ${r.appDate} · 등록일 ${r.regDate}`));
  ws.close(); ch.kill();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } }, 3000);
})().catch(e => { console.error('FAIL', e); ch.kill(); process.exit(1); });
