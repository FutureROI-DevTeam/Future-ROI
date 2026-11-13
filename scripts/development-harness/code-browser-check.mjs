// Trusted driver: candidate TSX is compiled, then runs only inside Chromium, never imported into this process.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
const require = createRequire('/workspace/package.json');
const { build } = await import(require.resolve('vite'));
const { default: react } = await import(require.resolve('@vitejs/plugin-react'));
const { launchBrowser } = await import('/workspace/apps/web/tests/browser-startup.mjs');
const entry = '/workspace/apps/web/tests/harness-code.browser.tsx';
const source = `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {SaveDelta,SaveFeedback} from '../src/features/logs/SaveFeedback.tsx';
import {DraftProgressPreview} from '../src/features/today/DraftProgressPreview.tsx';
import '../src/styles.css';
const root=createRoot(document.getElementById('app'));
window.renderCase=(points,amount=points)=>{const value=points===null?null:{points,amount,done:Math.max(0,amount),total:100,unit:'sessions',localDate:'2026-11-13'};
flushSync(()=>root.render(<main><h1>合成データ・桁落ち回帰</h1><section id="delta"><SaveDelta value={value} field="points"/></section><section id="amount"><SaveDelta value={value} field="amount"/></section><section id="saved"><SaveFeedback value={value}/></section><section id="preview"><DraftProgressPreview value={value}/></section><section id="compact"><DraftProgressPreview value={value} compact/></section></main>));};`;

test('#253: real Chromium checks integer digits, old small values, signs and announcement boundaries', { timeout: 90000 }, async t => {
  let server, session;
  t.after(async () => { try { if (session) await session.stop(); } finally { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); } });
  const bundle = await build({ root: '/workspace', configFile: false, logLevel: 'silent',
    plugins: [{ name: 'fixed-harness-entry', resolveId: id => id === entry ? entry : null, load: id => id === entry ? source : null }, react()],
    define: { 'process.env.NODE_ENV': '"production"' }, build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'PointsQA' } } });
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(b => b.output);
  const code = outputs.filter(o => o.type === 'chunk').map(o => o.code).join('\n');
  const css = outputs.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => o.source).join('\n');
  const assets = new Map(outputs.filter(o => o.type === 'asset').map(o => ['/' + o.fileName, o.source]));
  server = createServer((req, res) => { if (assets.has(req.url)) return res.end(assets.get(req.url)); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><div id="app"></div><script>' + code.replaceAll('</script', '<\\/script') + '</script>'); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  session = launchBrowser({ browser: process.env.TEST_BROWSER, profile: '/tmp/points-browser', signal: t.signal,
    args: ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=/tmp/points-browser', 'about:blank'] });
  const cdp = await session.ready();
  const evaluate = async expression => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!r.exceptionDetails, 'browser exception'); return r.result.value; };
  await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 200 && !await evaluate('typeof window.renderCase==="function"'); i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(await evaluate('typeof window.renderCase'), 'function');
  // Literal expectations are independent of the candidate's formatting algorithm.
  const cases = [[1234,'1,234'],[12345,'12,345'],[214748364700,'214,748,364,700'],[1000,'1,000'],[999,'999'],[999.9,'1,000'],[0.667,'0.667'],[0.25,'0.25'],[0.000001234,'0.00000123'],[0,'0']];
  for (const [magnitude, expected] of cases) for (const direction of [1,-1]) {
    const points = magnitude * direction, amount = magnitude === 0 ? 0 : direction * 1234, sign = amount < 0 ? '−' : '+';
    await evaluate(`window.renderCase(${points},${amount})`);
    const dom = await evaluate(`Object.fromEntries(['delta','amount','saved','preview','compact'].map(id=>[id,document.getElementById(id).textContent]))`);
    assert.equal(dom.delta, sign + expected + 'pt');
    assert.equal(dom.amount, sign + Math.abs(amount).toLocaleString('ja-JP') + '回');
    assert.ok(dom.saved.includes(sign + expected + 'パーセントポイント'));
    for (const id of ['preview','compact']) assert.ok(dom[id].includes(amount === 0 ? '量・進捗は変わりません' : sign + expected + 'パーセントポイント'));
    assert.deepEqual(await evaluate(`({saved:document.querySelector('#saved [role=status]')?.getAttribute('aria-live'),preview:document.querySelector('#preview [role=status]')?.getAttribute('aria-atomic'),compact:document.querySelector('#compact [role=status]')===null,hidden:document.querySelector('#delta span')?.getAttribute('aria-hidden')})`), { saved:'polite',preview:'true',compact:true,hidden:'true' });
  }
  await evaluate('window.renderCase(null)');
  assert.deepEqual(await evaluate(`['delta','amount','saved','preview','compact'].map(id=>document.getElementById(id).textContent)`), ['','','','','']);
  assert.equal(await evaluate('document.querySelectorAll("[role=status]").length'), 1);
  await mkdir('/tmp/points-evidence', { recursive: true });
  await evaluate('window.renderCase(1234)');
  for (const width of [390,1440]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile('/tmp/points-evidence/' + width + '.png', Buffer.from(shot.data, 'base64'));
  }
});
