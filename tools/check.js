// 리드디벨롭 검증: node tools/check.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const FILE = path.join(__dirname, '..', '코스텝_경영진단_리드디벨롭.html');
const html = fs.readFileSync(FILE, 'utf8');
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. 문법 + 실행 시뮬레이션 (DOM·alert·localStorage 대체)
// 인라인 <script> 블록 전부 (src 있는 외부 스크립트 제외) — 본 스크립트 + 2단계 로그인 스크립트
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>\s*(?=<\/body>|<!--|<script)/g)].map(m => m[1]).join('\n;\n');
const store = {};
const el = () => ({ value: '', innerText: '', innerHTML: '', checked: false, className: '', classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {} });
const ctx = {
  document: { getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: { appendChild() {}, removeChild() {} } },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  console, alert() {}, setTimeout, scrollTo() {},
  location: { hostname: 'localhost', search: '', origin: 'http://localhost', pathname: '/' }, URLSearchParams,
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { userAgent: 'node' }
};
ctx.window = ctx;
try {
  vm.createContext(ctx); vm.runInContext(script, ctx);
  for (const t of ['smb', 'small', 'sme']) for (const i of ['mfg', 'it', 'bio', 'const', 'dist', 'food', 'logis', 'content', 'esg', 'service']) {
    ctx.setBizTrack(t); ctx.setIndustryTrack(i); ctx.autoGenerateBusinessPlan(); ctx.renderActiveReport(); ctx.renderRadarAnnouncements();
  }
  ok(true, '문법·실행 시뮬레이션 (3규모 x 10업종)');
} catch (e) { ok(false, '실행 시뮬레이션: ' + e.message); }

// 2. safeStorage 저장/조회 왕복
try {
  vm.runInContext("safeStorage.setItem('__t','1')", ctx);
  ok(vm.runInContext("safeStorage.getItem('__t')", ctx) === '1', 'safeStorage 저장/조회');
} catch (e) { ok(false, 'safeStorage: ' + e.message); }

// 3. JS가 참조하는 ID가 HTML에 모두 존재
const defined = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
const used = new Set([...html.matchAll(/(?:getElementById|getOptTxt|setVal)\(['"]([^'"]+)['"]/g)].map(m => m[1]));
const missing = [...used].filter(x => !defined.has(x) && !x.endsWith('_'));   // 'auth_state_' + 상태 처럼 이어 붙이는 접두어 제외
ok(missing.length === 0, '참조 ID 누락 0개' + (missing.length ? ' → ' + missing.join(', ') : ''));

// 4. 금지어·이모지
const banned = ['10대', '원칙', '기업마당', 'BEP', 'PSST', 'Outcome', '솔루션', '프레임워크'];
const hits = banned.map(w => [w, html.split(w).length - 1]).filter(([, n]) => n);
ok(hits.length === 0, '금지어 0건' + (hits.length ? ' → ' + hits.map(h => h.join(':')).join(', ') : ''));
ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/u.test(html), '이모지·U+FE0F 0건');
ok(html.startsWith('<!DOCTYPE html>') && html.trimEnd().endsWith('</html>'), '파일 시작/끝 태그');

console.log(fail ? `\n${fail}개 실패` : '\n전체 통과');
process.exit(fail ? 1 : 0);
