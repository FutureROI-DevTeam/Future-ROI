import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { launchBrowser } from './browser-startup.mjs';

test('#244: real form/Today at 320/390/768/1440, native input, confirmed feedback and failure suppression', { timeout: 240000 }, async t => {
  const browser = process.env.TEST_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  await access(browser);
  const dir = await mkdtemp(join(tmpdir(), 'futureroi-goal-feedback-'));
  let server, session;
  t.after(async () => {
    try { if (session) await session.stop(); }
    finally { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
    if (!dir.startsWith(join(tmpdir(), 'futureroi-goal-feedback-'))) throw new Error('refusing unrelated cleanup');
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  const bundle = await build({ configFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
    resolve: { alias: { '@contracts': fileURLToPath(new URL('../../api/src/contracts/index.ts', import.meta.url)), '@tanstack/react-router': 'test:router' } },
    plugins: [react(), { name: 'qa-router', enforce: 'pre',
      resolveId: id => id === 'test:router' ? '\0test:router' : id.endsWith('/auth/client.ts') ? '\0test:auth' : null,
      load: id => id === '\0test:auth' ? 'export const authClient={};export const describeAuthError=(_code,fallback)=>fallback;' : id === '\0test:router' ? `import {createElement} from 'react';
        export const Link=({to,params,search,hash,children,...props})=>createElement('a',{href:to+(hash?'#'+hash:''),...props},children);
        export const Outlet=()=>window.__fePage?.()??null;
        export const useNavigate=()=>()=>{};export const useRouter=()=>({subscribe:()=>()=>{}});export const useLocation=()=>({href:location.pathname});` : null,
    }], build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./goal-feedback.browser.tsx', import.meta.url)), formats: ['iife'], name: 'GoalQA' } } });
  t.signal.throwIfAborted();
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(b => b.output);
  const code = outputs.filter(o => o.type === 'chunk').map(o => o.code).join('\n');
  const assets = new Map(outputs.filter(o => o.type === 'asset').map(o => ['/' + o.fileName, o.source]));
  const css = outputs.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => o.source).join('\n');
  const html = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><div id="app"></div><script>' + code.replaceAll('</script', '<\\/script') + '</script>';
  server = createServer((req, res) => {
    if (req.url === '/peer') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<script>const channel=new BroadcastChannel("future-roi:save:qa-goal");channel.postMessage({sender:"synthetic-second-tab",type:"start"});</script>');
      return;
    }
    if (assets.has(req.url)) { res.end(assets.get(req.url)); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  session = launchBrowser({ browser, profile: join(dir, 'profile'), signal: t.signal,
    args: ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + join(dir, 'profile'), 'about:blank'],
    diagnostic: value => t.diagnostic(JSON.stringify(value)) });
  const cdp = await session.ready();
  const evaluate = async expression => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression, accept, message) => {
    let value;
    for (let i = 0; i < 300; i++) {
      value = await evaluate(expression);
      if (accept(value)) return value;
      await delay(20);
    }
    throw new Error(message + ': ' + JSON.stringify(value));
  };
  const state = 'window.__goalQA?.state()';
  const key = async (key, code, virtualKey) => {
    await cdp.send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: virtualKey,
      ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  };
  const activate = async selector => {
    await until(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled})()`, Boolean, 'native target disabled ' + selector);
    const focused = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return document.activeElement===e})()`);
    assert.equal(focused, true, 'native target did not receive focus');
    await key('Enter', 'Enter', 13);
  };
  const input = async (selector, value) => {
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select()})()`);
    await cdp.send('Input.insertText', { text: value });
    await delay(30);
  };
  const click = async expression => {
    const box = await evaluate(`(()=>{const e=${expression};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...box });
    await delay(50);
  };
  const resize = async width => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await delay(70);
  };
  await resize(390);
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
  await until(state, v => v?.text?.includes('ゴールが遠ざかる'), 'Today did not mount');
  const evidence = [];
  const mount = async mode => {
    await evaluate(`window.__goalQA.mount(${JSON.stringify(mode)})`);
    await until(state, v => mode.startsWith('list') ? v?.text?.includes('読み終えた本') : mode === 'create' || mode === 'edit' ? true : !!v?.percent, 'mount ' + mode);
    await until(mode === 'create' || mode === 'edit' ? '!!document.querySelector("#goal-totalRequired")' : 'true', Boolean, 'form absent');
    await delay(100);
  };
  const artifacts = process.env.FEQA_ARTIFACT_DIR;
  if (artifacts) await mkdir(artifacts, { recursive: true });
  const screenshotNames = new Set();
  const screenshot = async name => {
    if (!artifacts) return;
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(artifacts, name + '.png'), Buffer.from(shot.data, 'base64'));
    screenshotNames.add(name);
  };
  for (const width of [320, 390, 768, 1440]) {
    await resize(width);
    for (const mode of ['list', 'create', 'edit', 'today']) {
      await mount(mode);
      if (mode === 'list') {
        const dateFonts = await evaluate('[...document.querySelectorAll(".fr-footprint__day > span:last-child")].map(e=>parseFloat(getComputedStyle(e).fontSize))');
        assert.ok(dateFonts.length > 0 && dateFonts.every(size => size >= 14 && size <= 16), 'footprint dates must meet the 14–16px requirement at ' + width);
      }
      await evaluate('document.fonts.ready');
      const layout = await evaluate(`(()=>{
        const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
        const root=document.querySelector('.fr-page');const chart=document.querySelector('.fr-today__history-chart');const right=document.querySelector('.fr-today__right');const records=document.querySelector('.fr-today__records');
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,order:[...document.querySelector('.fr-today__scroll')?.children??[]].map(e=>e.className),
          chart:chart?.getBoundingClientRect().toJSON(),right:right?.getBoundingClientRect().toJSON(),records:records?.getBoundingClientRect().toJSON(),
          checked:[...document.querySelectorAll('input[name="goal-unit"]:checked')].map(e=>e.value),priorOpen:document.querySelector('#fr-goalform-prior')?.open,
          bodySize:getComputedStyle(root).fontSize, headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(e=>e.textContent)}
      })()`);
      assert.ok(layout.scroll <= width, mode + ' horizontal overflow at ' + width);
      if (mode === 'create' || mode === 'edit') assert.equal(layout.checked.length, 1);
      if (mode === 'create') assert.equal(layout.priorOpen, true);
      if (mode === 'today') {
        assert.equal(layout.order.filter(n => n === 'fr-today__history-chart').length, 1);
        assert.ok(layout.chart.y >= (width >= 960 ? layout.records.bottom : layout.right.bottom) - 1, 'chart reading/layout order');
        if (width >= 960) assert.ok(layout.chart.right < layout.right.x);
      }
      if (mode === 'list') {
        const text = (await evaluate(state)).text;
        assert.ok(text.includes('決めた総量に届きました') && text.includes('積み上げを見る'));
        // 進捗率の直後の「記録開始前の … を含む」が、同じ行で区切りなしに続かない（#277）
        const initial = await evaluate(`(()=>{const row=document.querySelector('.fr-goals__initial')?.closest('.fr-goals__row-sub');const t=row?.querySelector('.fr-goals__amount-total')?.getBoundingClientRect();const i=row?.querySelector('.fr-goals__initial')?.getBoundingClientRect();return t&&i?{gap:i.left-t.right,sameLine:Math.abs(i.top-t.top)<4}:null})()`);
        assert.ok(initial, 'initial progress note absent at ' + width);
        if (initial.sameLine) assert.ok(initial.gap >= 6, 'initial note runs into percent at ' + width + ': ' + JSON.stringify(initial));
      }
      await screenshot(mode + '-' + width);
      if (mode === 'today' && artifacts) {
        await evaluate('document.querySelector(".fr-today__history-chart").scrollIntoView({block:"start"})');
        await delay(70);
        await screenshot('today-chart-' + width);
      }
      evidence.push({ mode, ...layout });
    }
  }
  for (const width of [320, 390, 768, 1440]) {
    await resize(width); await mount('today-small');
    await until(state, v => v?.percent?.includes('0.67'), 'small progress must not display 0');
    const initialLogs = (await evaluate(state)).logs;
    await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="量を変更")');
    await input('.fr-today__dock .fr-amount input', '120');
    const preview = await until(state, v => v?.preview?.includes('+120分') && v?.preview?.includes('+0.667パーセントポイント'), 'unsaved preview absent');
    assert.ok(preview.percent.includes('0.67') && preview.cumulative.includes('2時間0分'));
    assert.equal(preview.puts.length, 0);
    assert.deepEqual(preview.logs, initialLogs, 'typing must not change saved logs');
    const previewLayout = await evaluate(`(()=>{const p=document.querySelector('.fr-draft-preview');const compact=document.querySelector('.fr-draft-preview--compact');return {overflow:document.documentElement.scrollWidth>innerWidth,compactVisible:!!compact&&getComputedStyle(compact).display!=='none',announcers:document.querySelectorAll('.fr-draft-preview[aria-live=polite]').length,focus:document.activeElement.closest('.fr-amount')!==null}})()`);
    assert.equal(previewLayout.overflow, false);
    assert.equal(previewLayout.compactVisible, width < 960);
    assert.equal(previewLayout.announcers, 1);
    assert.equal(previewLayout.focus, true);
    const previewFonts = await evaluate('[...document.querySelectorAll(".fr-draft-preview p")].map(e=>parseFloat(getComputedStyle(e).fontSize))');
    assert.ok(previewFonts.length > 0 && previewFonts.every(size => size >= 14 && size <= 16), 'draft preview must meet the 14–16px requirement at ' + width);
    if (width >= 960) {
      const box = await evaluate('document.querySelector(".fr-draft-preview").getBoundingClientRect().toJSON()');
      assert.ok(box.y >= 0 && box.bottom <= 1000, 'PC input focus hid the right preview');
    }
    await screenshot('draft-preview-' + width);
    for (const invalid of ['0', '-1', '1.5', 'abc']) {
      await input('.fr-today__dock .fr-amount input', invalid);
      await until(state, v => v?.preview === '', 'invalid draft retained preview');
      assert.equal((await evaluate(state)).puts.length, 0);
    }
    await input('.fr-today__dock .fr-amount input', '30');
    await until(state, v => v?.preview?.includes('+30分'), 'valid draft did not recover');
    await evaluate('document.querySelector(".fr-today__dock .fr-amount input").select()');
    await key('Backspace', 'Backspace', 8);
    await until(state, v => v?.preview === '', 'empty draft retained preview');
    evidence.push({ mode: 'unsaved preview/invalid/empty ' + width, ...previewLayout, ...preview });
  }
  await resize(1440); await mount('list-small');
  await until(state, v => v?.footprint?.includes('連続実施 1日'), 'footprint not ready');
  assert.equal(await evaluate('document.querySelectorAll(".fr-footprint").length'), 1);
  assert.equal(await evaluate('document.querySelectorAll(".fr-goals__row .fr-footprint").length'), 0);
  assert.ok((await evaluate(state)).text.includes('0.67%'));
  const header = await evaluate(`(()=>{const a=document.querySelector('.fr-deskbar__name');return {href:a.getAttribute('href'),decoration:getComputedStyle(a).textDecorationLine,color:getComputedStyle(a).color,parentColor:getComputedStyle(a.parentElement).color}})()`);
  assert.equal(header.href, '/');
  assert.equal(header.decoration, 'none');
  assert.equal(header.color, header.parentColor);
  await activate('.fr-footprint__day[aria-pressed=true]');
  await key('ArrowLeft', 'ArrowLeft', 37);
  await until(state, v => v?.footprint?.includes('英語学習の積み上げ'), 'selected day goals absent');
  assert.equal(await evaluate('document.activeElement.classList.contains("fr-footprint__day")'), true);
  assert.ok(await evaluate('document.querySelector(".fr-footprint__selection a").getBoundingClientRect().height>=44'));
  await screenshot('footprint-selected-1440');
  evidence.push({ mode: 'shared footprint/header/small percent/native day selection', ...header });
  await resize(390); await mount('list-loading');
  await until(state, v => v?.footprint?.includes('連続実施は確認中'), 'loading must not claim streak 0');
  assert.ok(await evaluate('document.querySelectorAll(".fr-footprint__day--unconfirmed").length>0'));
  await evaluate('window.__goalQA.releaseHistory()');
  await until(state, v => v?.footprint?.includes('連続実施 1日'), 'history did not recover');
  await evaluate('window.__goalQA.historyOffline("qa-goal")');
  await until(state, v => v?.footprint?.includes('足跡を再読み込み'), 'history failure absent');
  assert.ok((await evaluate(state)).footprint.includes('連続実施は確認中'));
  await evaluate('window.__goalQA.historyOffline(null, false)');
  await click('[...document.querySelectorAll(".fr-footprint button")].find(e=>e.textContent.includes("再読み込み"))');
  await until(state, v => v?.footprint?.includes('連続実施 1日'), 'history retry absent');
  await evaluate('window.__goalQA.removeAchieved()');
  await until(state, v => !v?.text?.includes('読み終えた本'), 'deleted goal remained');
  const targets = await evaluate('[...document.querySelectorAll(".fr-footprint__day")].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))');
  assert.ok(targets.every(box => box.w >= 44 && box.h >= 44));
  await screenshot('footprint-recovered-390');
  evidence.push({ mode: 'footprint loading/failure/retry/deleted goal/mobile targets' });
  await resize(390); await mount('today-counts');
  await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="記録を変更")');
  await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="量を変更")');
  await input('.fr-today__dock .fr-amount input', '5');
  const counted = await until(state, v => v?.preview?.includes('+2回') && v?.preview?.includes('+50パーセントポイント'), 'count correction preview absent');
  assert.ok(counted.preview.includes('125%') && counted.preview.includes('1回'));
  assert.ok(counted.percent.includes('75') && counted.cumulative.includes('3回'));
  assert.equal(counted.puts.length, 0);
  await input('.fr-today__dock .fr-amount input', '1');
  const negative = await until(state, v => v?.preview?.includes('−2回') && v?.preview?.includes('−50パーセントポイント'), 'negative correction preview absent');
  assert.ok(!negative.preview.includes('分'));
  await screenshot('draft-count-correction-390');
  evidence.push({ mode: 'count/over-goal/negative correction', counted, negative });
  await mount('today-small');
  await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="量を変更")');
  await input('.fr-today__dock .fr-amount input', '60');
  await until(state, v => v?.preview?.includes('+60分'), 'settings case initial preview absent');
  await evaluate('window.__goalQA.configure({totalRequired:9000,goalSettingsRevision:1})');
  await until(state, v => v?.percent?.includes('1.33') && v?.preview === '', 'settings update reused old preview');
  assert.equal((await evaluate(state)).puts.length, 0);
  assert.ok((await evaluate(state)).text.includes('Goalの設定が変わりました'));
  assert.equal(await evaluate('document.querySelectorAll(".fr-today__dock .fr-amount input,.fr-today__dock .fr-choice").length'), 0);
  await screenshot('draft-settings-changed-390');
  evidence.push({ mode: 'changed goal settings suppress old draft preview' });
  // 入力がないときは、設定が変わっても記録を止めない（名前だけの変更・1回の量の変更）（#244）
  await mount('today-empty');
  await evaluate('window.__goalQA.configure({title:"名前だけ変更",goalSettingsRevision:1})');
  await until(state, v => v?.text?.includes('名前だけ変更'), 'title update not reflected');
  assert.ok(!(await evaluate(state)).text.includes('Goalの設定が変わりました'), 'no draft but record was blocked');
  assert.ok(await evaluate('document.querySelectorAll(".fr-today__dock .fr-choice").length') > 0, 'record choices missing without draft');
  await evaluate('window.__goalQA.configure({sessionAmount:45,goalSettingsRevision:2})');
  await until(state, v => v?.text?.includes('今日記録する量：45分'), 'new session amount not used without draft');
  assert.ok(!(await evaluate(state)).text.includes('Goalの設定が変わりました'));
  await activate('.fr-today__dock .fr-choice');
  const silentSave = await until(state, v => v?.puts?.length === 1, 'save after silent settings sync absent');
  assert.equal(silentSave.puts[0].body.amount, 45);
  assert.equal(silentSave.puts[0].body.expectedGoalSettingsRevision, 2);
  evidence.push({ mode: 'settings change without draft keeps recording', puts: silentSave.puts });
  for (const kind of ['editor', 'stepped-editor', 'stepped']) {
    await mount('today-empty');
    if (kind !== 'editor') await click('document.querySelector(".fr-today__dock button[aria-label^=量を増やす]")');
    if (kind !== 'stepped') {
      await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="量を変更")');
      await input('.fr-today__dock .fr-amount input', '120');
    }
    await evaluate('window.__goalQA.configure({unit:"sessions",sessionAmount:1,totalRequired:10,goalSettingsRevision:1})');
    await until(state, v => v?.text?.includes('Goalの設定が変わりました') && v?.preview === '', 'unit update did not require reentry');
    assert.equal((await evaluate(state)).puts.length, 0);
    assert.equal(await evaluate('document.querySelectorAll(".fr-today__dock .fr-amount input,.fr-today__dock .fr-choice").length'), 0);
    await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="今の設定で入力し直す")');
    await until(state, v => v?.text?.includes('今日記録する量：1回') && v?.preview === '', 'reentry kept old minute draft');
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '量を変更', 'reentry lost keyboard focus');
    await click('document.querySelector(".fr-today__dock button[aria-label^=量を増やす]")');
    await until(state, v => v?.preview?.includes('+2回'), 'new count draft absent');
    await activate('.fr-today__dock .fr-choice');
    const newUnitSave = await until(state, v => v?.puts?.length === 1 && v?.active === 'fr-recorded-title', 'reentered count save absent');
    assert.equal(newUnitSave.puts[0].body.amount, 2);
    assert.equal(newUnitSave.puts[0].body.expectedGoalSettingsRevision, 1);
    evidence.push({ mode: 'unit change requires explicit reentry ' + kind, puts: newUnitSave.puts });
  }
  for (const height of [600, 800]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 1, mobile: false });
    await mount('today-small');
    await click('[...document.querySelectorAll(".fr-today__dock button")].find(e=>e.textContent.trim()==="量を変更")');
    await input('.fr-today__dock .fr-amount input', '120');
    const visible = await evaluate(`(()=>{const p=document.querySelector('.fr-draft-preview');const r=p.getBoundingClientRect();return {top:r.top,bottom:r.bottom,exposed:p.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),background:getComputedStyle(p.closest('.fr-section')).backgroundColor}})()`);
    assert.ok(visible.top >= 0 && visible.bottom <= height && visible.exposed, 'low PC viewport hid/covered preview');
    assert.notEqual(visible.background, 'rgba(0, 0, 0, 0)');
    for (const selector of ['.fr-today__right a', '.fr-today__details summary']) {
      const focus = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,exposed:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),active:document.activeElement===e}})()`);
      assert.ok(focus.active && focus.exposed && focus.top >= 0 && focus.bottom <= height, 'sticky summary covered Outlook keyboard focus');
    }
    await input('.fr-today__dock .fr-amount input', '120');
    const restored = await evaluate('document.querySelector(".fr-draft-preview").getBoundingClientRect().toJSON()');
    assert.ok(restored.top >= 0 && restored.bottom <= height, 'return to input did not restore preview visibility');
    await screenshot('draft-preview-1440x' + height);
    evidence.push({ mode: 'PC preview remains visible at height ' + height, ...visible });
  }
  await resize(390); await mount('edit');
  assert.equal(await evaluate('document.querySelector("#goal-initialProgress").value'), '20');
  assert.equal(await evaluate('document.querySelector("#goal-initialProgress-minutes").value'), '40');
  await click('document.querySelectorAll("input[name=goal-initialProgress-mode]")[1]');
  assert.equal(await evaluate('document.querySelector("#goal-initialProgress").value'), '1240');
  await click('document.querySelectorAll("input[name=goal-initialProgress-mode]")[0]');
  await input('#goal-initialProgress-minutes', '60');
  assert.equal(await evaluate('document.querySelectorAll("input[name=goal-initialProgress-mode]")[1].disabled'), true);
  assert.equal(await evaluate('document.querySelector("#goal-initialProgress-minutes").value'), '60');
  await input('#goal-initialProgress-minutes', '40');
  assert.equal((await evaluate(state)).patches.length, 0, 'editing alone saved');
  await mount('create');
  await evaluate('document.querySelector("input[name=goal-unit][value=minutes]").focus()');
  await key('ArrowRight', 'ArrowRight', 39);
  assert.equal(await evaluate('document.querySelector("input[name=goal-unit]:checked").value'), 'sessions', 'native radio keyboard selection');
  await key('ArrowLeft', 'ArrowLeft', 37);
  assert.equal(await evaluate('document.querySelector("input[name=goal-unit]:checked").value'), 'minutes');
  await input('#goal-title', '200時間の合成Goal');
  await input('#goal-totalRequired', '200');
  await input('#goal-sessionAmount', '30');
  // 初期質問は必須（#259）。未選択のままでは送らず、1問目の選択肢へ移る。「回答せずに進む」は出さない
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="回答せずに進む")'), false);
  assert.equal(await evaluate('document.querySelectorAll(".r11-qp input:checked").length'), 0, 'questions must start unselected');
  await activate('button[type="submit"]');
  await delay(300);
  assert.equal((await evaluate(state)).creates.length, 0, 'unanswered questions must block create');
  assert.equal(await evaluate('document.querySelectorAll(".r11-qp-error").length'), 2);
  assert.equal(await evaluate('document.activeElement.closest(".r11-qp fieldset") === document.querySelector(".r11-qp fieldset")'), true);
  await click('document.querySelectorAll(".r11-qp fieldset")[0].querySelectorAll("input")[4]');
  await activate('button[type="submit"]');
  await delay(300);
  assert.equal((await evaluate(state)).creates.length, 0, 'one unanswered question must block create');
  assert.equal(await evaluate('document.querySelectorAll(".r11-qp-error").length'), 1);
  assert.equal(await evaluate('document.activeElement.closest(".r11-qp fieldset") === document.querySelectorAll(".r11-qp fieldset")[1]'), true);
  await click('document.querySelectorAll(".r11-qp fieldset")[1].querySelectorAll("input")[4]');
  await activate('button[type="submit"]');
  const created = await until(state, v => v?.creates?.length === 1, 'create absent');
  assert.equal(created.creates[0][0].totalRequired, 12000);
  assert.equal(created.creates[0][0].initialProgress, 0);
  assert.deepEqual(created.creates[0][0].questionPrior, { a: null, b: null }, 'choosing 回答しない must send null');
  evidence.push({ mode: '200 hour create body', ...created });
  await mount('create');
  await input('#goal-title', '回答を保持する合成Goal');
  await input('#goal-totalRequired', '200'); await input('#goal-sessionAmount', '30');
  await click('document.querySelector(".r11-qp input[value=HIGH]")');
  // 2問とも選ぶまで「回答欄を閉じる」は出さない
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="回答欄を閉じる")'), false);
  await click('document.querySelectorAll(".r11-qp fieldset")[1].querySelectorAll("input")[4]');
  await click('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="回答欄を閉じる")');
  assert.equal(await evaluate('document.querySelector("#fr-goalform-prior").open'), false);
  await activate('button[type="submit"]');
  const partial = await until(state, v => v?.creates?.length === 1, 'partial answer create absent');
  assert.deepEqual(partial.creates[0][0].questionPrior, { a: 'HIGH', b: null });
  evidence.push({ mode: 'close selected answers preserves explicitly described body', ...partial });
  await mount('today');
  const feedbackHeight = await evaluate('document.querySelector(".fr-save-feedback").getBoundingClientRect().height');
  await activate('.fr-today__dock .fr-choice');
  const saved = await until(state, v => v?.feedback?.includes('+0.25パーセントポイント'), 'confirmed +0.25 points absent');
  assert.equal(saved.puts.length, 1);
  assert.ok(saved.feedback.includes('+30分'));
  assert.ok(saved.feedback.includes('保存前の表示との差'));
  assert.equal(await evaluate('document.querySelector(".fr-save-feedback").getBoundingClientRect().height'), feedbackHeight, 'feedback must not shift the layout');
  assert.equal(saved.active, 'fr-recorded-title', 'save must restore the recorded heading focus');
  await delay(400); // .35sの登場アニメーション終了後の色をレビューPNGに残す。
  await screenshot('today-save-390');
  evidence.push({ mode: 'save', ...saved });
  await click('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="記録を変更")');
  for (let i = 0; i < 2; i++) await click('document.querySelector(".fr-today__dock button[aria-label^=量を減らす]")');
  await activate('.fr-today__dock .fr-choice');
  const corrected = await until(state, v => v?.feedback?.includes('−10分'), 'correction net delta absent');
  assert.equal(corrected.puts.length, 2);
  assert.equal(await evaluate('!!document.querySelector(".fr-save-feedback__increase")'), false);
  await screenshot('today-correction-390');
  evidence.push({ mode: 'correction', ...corrected });
  await mount('today'); await evaluate('window.__goalQA.failure("offline")');
  await activate('.fr-today__dock .fr-choice');
  const failed = await until(state, v => v?.puts?.length === 1 && v?.text?.includes('もう一度'), 'failure absent');
  assert.equal(failed.feedback, '');
  await evaluate('window.__goalQA.failure(null)');
  await click('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("もう一度"))');
  const retried = await until(state, v => v?.puts?.length === 2 && v?.active === 'fr-recorded-title', 'retry absent');
  assert.equal(retried.feedback, '', 'retry must not celebrate uncertain baseline');
  assert.deepEqual(retried.puts[0], retried.puts[1], 'retry preserves the original body');
  for (const width of [320, 390]) {
    await resize(width); await mount('today'); await evaluate('window.__goalQA.failure("offline")');
    await activate('.fr-today__dock .fr-choice');
    await until(state, v => v?.puts?.length === 1 && v?.text?.includes('もう一度'), 'failure absent at ' + width);
    await evaluate('document.fonts.ready');
    const failureLayout = await evaluate(`(()=>{
      const lines=b=>{const t=[...b.childNodes].find(n=>n.nodeType===3);const r=document.createRange();r.selectNodeContents(t);return r.getClientRects().length};
      const a=document.activeElement;
      return {focusInPanel:!!a?.closest('.fr-error'),focusTag:a?.tagName,buttons:[...document.querySelectorAll('.fr-today__dock .fr-savefail__actions .fr-btn')].map(b=>({text:b.textContent,lines:lines(b)}))}})()`);
    assert.equal(failureLayout.buttons.length, 2, 'failure buttons at ' + width);
    assert.ok(failureLayout.buttons.every(b => b.lines === 1), 'failure button label wrapped at ' + width + ': ' + JSON.stringify(failureLayout));
    assert.equal(failureLayout.focusInPanel, true, 'focus left the page after failure at ' + width + ': ' + JSON.stringify(failureLayout));
    await evaluate('window.__goalQA.failure(null)');
    await screenshot('today-failure-' + width);
    evidence.push({ mode: 'failure layout/focus', width, ...failureLayout });
  }
  await resize(390);
  await mount('today'); await evaluate('window.__goalQA.hold()');
  await activate('.fr-today__dock .fr-choice');
  await until(state, v => v?.puts?.length === 1, 'held save did not start');
  await evaluate('window.__qaPeerObserved=false;window.__qaPeerProbe=new BroadcastChannel("future-roi:save:qa-goal");window.__qaPeerProbe.onmessage=e=>{if(e.data?.sender==="synthetic-second-tab"&&e.data?.type==="start")window.__qaPeerObserved=true}');
  const otherTab = await cdp.send('Target.createTarget', { url: 'http://127.0.0.1:' + server.address().port + '/peer' });
  await until('window.__qaPeerObserved', Boolean, 'second native tab signal did not arrive');
  await evaluate('window.__goalQA.release()');
  const peerSave = await until(state, v => v?.active === 'fr-recorded-title', 'peer save did not finish');
  assert.equal(peerSave.feedback, '', 'detected same-origin tab activity must suppress uncertain increment');
  await cdp.send('Target.closeTarget', { targetId: otherTab.targetId });
  await evaluate('window.__qaPeerProbe.close()');
  await cdp.send('Page.bringToFront');
  evidence.push({ mode: 'second native tab signal during held PUT', ...peerSave });
  await mount('today'); await evaluate('window.__goalQA.failure("409")');
  await activate('.fr-today__dock .fr-choice');
  const conflict = await until(state, v => v?.puts?.length === 1 && v?.text?.includes('最新'), '409 absent');
  assert.equal(conflict.feedback, '');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await mount('today'); await activate('.fr-today__dock .fr-choice');
  await until(state, v => v?.feedback?.includes('+0.25'), 'reduced motion save absent');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".fr-save-feedback__increase")).animationName'), 'none');
  assert.equal(await evaluate('document.querySelectorAll(".fr-save-feedback[aria-live=polite]").length'), 1);
  evidence.push({ mode: 'failure/retry/409/reduced-motion', failed, retried, conflict });
  if (artifacts) await writeFile(join(artifacts, 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
  t.diagnostic(JSON.stringify({ scenarios: evidence.length, screenshots: screenshotNames.size, widths: [320,390,768,1440] }));
});
