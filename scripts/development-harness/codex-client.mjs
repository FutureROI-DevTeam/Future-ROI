import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const model = 'gpt-6.1-sol';
export const catalog = fileURLToPath(new URL('./codex-catalog.json', import.meta.url));
export const sourcePath = 'experiments/development-harness-fixture/answer.mjs';
export const schema = { type: 'object', additionalProperties: false, required: ['files'], properties: {
  files: { type: 'object', additionalProperties: false, required: [sourcePath], properties: { [sourcePath]: { type: 'string' } } },
} };
const disabled = ['apps', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'code_mode',
  'code_mode_host', 'code_mode_only', 'computer_use', 'goals', 'hooks', 'image_generation', 'in_app_browser',
  'memories', 'multi_agent', 'multi_agent_v2', 'plugins', 'remote_plugin', 'shell_tool', 'shell_snapshot',
  'skill_search', 'skill_mcp_dependency_install', 'unified_exec', 'view_image', 'workspace_dependencies',
  'tool_suggest', 'unbounded_connection_retries', 'enable_request_compression'];

export function nativeBinary() {
  if (process.platform !== 'win32' || !process.env.APPDATA) { throw new Error('codex-windows-adapter-required'); }
  return join(process.env.APPDATA, 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
}
export function identity(bin = nativeBinary()) {
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
  if (version !== 'codex-cli 0.151.0') { throw new Error('unverified-codex-version'); }
  return { version, binarySha256: createHash('sha256').update(readFileSync(bin)).digest('hex'),
    catalogSha256: createHash('sha256').update(readFileSync(catalog)).digest('hex'), model };
}
export function environment(home) {
  // No publisher/API-key/proxy/MCP/environment inheritance. Auth remains in the existing CODEX_HOME.
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    .filter(k => process.env[k]).map(k => [k, process.env[k]]));
  env.CODEX_HOME = home;
  return env;
}
export function argumentsFor(cwd, outputSchema, mockBase) {
  const cfg = { model_catalog_json: catalog, model_provider: 'harness', model_reasoning_effort: 'low',
    forced_login_method: 'chatgpt', 'model_providers.harness.name': 'OpenAI', 'model_providers.harness.requires_openai_auth': true, 'model_providers.harness.wire_api': 'responses', web_search: 'disabled', project_doc_max_bytes: 0,
    'agents.enabled': false, 'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false,
    'skills.include_instructions': false, 'cloud.skills.enabled': false,
    'model_providers.harness.request_max_retries': 0, 'model_providers.harness.stream_max_retries': 0,
    'model_providers.harness.supports_websockets': false, 'model_providers.harness.stream_idle_timeout_ms': 30000 };
  if (mockBase) {
    cfg.chatgpt_base_url = mockBase;
    cfg['model_providers.harness.base_url'] = mockBase + '/v1';
  }
  return ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox', 'read-only',
    '--skip-git-repo-check', '--json', '-m', model, '-C', cwd, '--output-schema', outputSchema,
    ...disabled.flatMap(x => ['--disable', x]), '--enable', 'skip_host_skill_discovery',
    ...Object.entries(cfg).flatMap(([k, v]) => ['-c', `${k}=${JSON.stringify(v)}`]), '-'];
}

// Native executable, no npm/shell wrapper and no model-accessible subprocess tools.
// close (not kill's return value) is the termination proof. Missing close leaves the slot occupied.
export async function invoke({ bin = nativeBinary(), args, home, prompt, timeoutMs, onSpawn = () => {}, cancelled = () => false }) {
  const deadline = Date.now() + timeoutMs;
  const child = spawn(bin, args, { env: environment(home), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', overflow = false, ended = false, spawnFailure = false;
  const done = new Promise(resolveDone => {
    child.on('error', () => { spawnFailure = true; });
    child.on('close', code => { ended = true; resolveDone({ code, stopped: true, out, overflow, spawnFailure }); });
  });
  child.stdout.on('data', data => { out += data; if (out.length > 131072) { overflow = true; out = ''; child.kill(); } });
  child.stderr.on('data', () => {}); // Never persist raw diagnostics or credentials.
  child.stdin.on('error', () => {});
  try { if (child.pid) { onSpawn(child.pid); } } catch { child.kill(); await done; throw new Error('model-registration-failed'); }
  try {
    if (cancelled() || Date.now() >= deadline) { child.kill(); child.stdin.end(); } else { child.stdin.end(prompt); }
  } catch { child.kill(); child.stdin.end(); await done; throw new Error('model-cancellation-unconfirmed'); }
  const timer = setTimeout(() => child.kill(), Math.max(1, deadline - Date.now()));
  const cancellation = setInterval(() => { try { if (cancelled()) { child.kill(); } } catch { child.kill(); } }, 250);
  const watchdog = setTimeout(() => { if (!ended) { child.kill(); } }, Math.max(1, timeoutMs) + 3000);
  try { return await done; } finally { clearTimeout(timer); clearTimeout(watchdog); clearInterval(cancellation); }
}

export function decodeResult(result) {
  if (!result.stopped || result.code !== 0 || result.overflow) { throw new Error('model-failed-or-unconfirmed'); }
  const events = result.out.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const turns = events.filter(e => e.type === 'turn.completed');
  const answers = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
  if (turns.length !== 1 || answers.length !== 1 || events.some(e => ['turn.failed', 'error'].includes(e.type)) ||
      events.some(e => e.item && !['agent_message', 'reasoning', 'error'].includes(e.item.type))) { throw new Error('model-result-incomplete'); }
  const u = turns[0].usage;
  if (!u || !Number.isSafeInteger(u.input_tokens) || !Number.isSafeInteger(u.output_tokens) || u.input_tokens < 0 || u.output_tokens < 0) {
    throw new Error('model-usage-unknown');
  }
  return { proposal: JSON.parse(answers[0].item.text), usage: u };
}

// Local fake ChatGPT auth, same OpenAI provider/catalog, never real credentials.
// A fresh attestation is required before live inference, not a manually asserted boolean.
export async function probeTools(folder, bin = nativeBinary(), lifecycle = {}) {
  const home = join(folder, 'fake-home'), cwd = join(folder, 'empty');
  mkdirSync(home, { recursive: true }); mkdirSync(cwd, { recursive: true });
  const jwt = 'e30.' + Buffer.from(JSON.stringify({ exp: 4102444800,
    'https://api.openai.com/auth': { chatgpt_account_id: 'fixture', chatgpt_plan_type: 'plus' } })).toString('base64url') + '.fixture';
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: {
    id_token: jwt, access_token: jwt, refresh_token: 'fixture', account_id: 'fixture',
  }, last_refresh: new Date().toISOString() }));
  // Global AGENTS cannot be disabled in this CLI. Live calls therefore use a new isolated
  // auth home, not the user's home. Project documents and host skill discovery are disabled.
  writeFileSync(join(home, 'AGENTS.md'), 'Only the explicit prompt defines the task.');
  writeFileSync(join(cwd, 'AGENTS.md'), 'HARNESS_PRIVATE_CANARY');
  const schemaPath = join(folder, 'schema.json'); writeFileSync(schemaPath, JSON.stringify(schema));
  const attacks = [
    { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"echo HARNESS_EXECUTED"}', call_id: 'call_shell' },
    { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Add File: forbidden.txt\n+HARNESS_EXECUTED\n*** End Patch', call_id: 'call_patch' },
    { type: 'function_call', name: 'view_image', arguments: '{"path":"auth.json"}', call_id: 'call_image' },
    { type: 'function_call', name: 'collaboration.spawn_agent', arguments: '{"task_name":"forbidden","message":"read auth"}', call_id: 'call_agent' },
  ];
  let requests = 0, rejected = 0, valid = true;
  const server = createServer((req, res) => {
    if (!req.url.endsWith('/responses')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    let data = ''; req.on('data', x => { data += x; if (data.length > 1048576) { req.destroy(); } });
    req.on('end', () => {
      try {
        const b = JSON.parse(data); requests++;
        valid &&= Array.isArray(b.tools) && b.tools.length === 0 && !data.includes('HARNESS_PRIVATE_CANARY');
        if (requests > 1) {
          const outputs = b.input.filter(x => ['function_call_output', 'custom_tool_call_output'].includes(x.type));
          rejected = outputs.filter(x => /unsupported|not found|not available|unknown tool/i.test(x.output)).length;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const items = requests === 1 ? attacks.map((x, i) => ({ id: `tool_${i}`, ...x })) : [{ id: 'msg_probe', type: 'message',
          role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ files: { [sourcePath]: '' } }), annotations: [] }] }];
        const events = [{ type: 'response.created', response: { id: 'resp_probe' } },
          ...items.flatMap((item, output_index) => [{ type: 'response.output_item.added', output_index, item },
            { type: 'response.output_item.done', output_index, item }]),
          { type: 'response.completed', response: { id: 'resp_probe', status: 'completed', output: items,
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } }];
        for (const e of events) { res.write('data: ' + JSON.stringify(e) + '\n\n'); } res.end();
      } catch { valid = false; res.writeHead(400); res.end(); }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const result = await invoke({ bin, args: argumentsFor(cwd, schemaPath, `http://127.0.0.1:${server.address().port}`),
      home, prompt: 'Return the requested structured proposal.', timeoutMs: 15000, onSpawn: lifecycle.onSpawn });
    lifecycle.onStopped?.();
    if (!valid || requests !== 2 || rejected !== attacks.length || result.code !== 0) { throw new Error('codex-tool-boundary-unverified'); }
    return { requests, advertisedTools: 0, rejectedCalls: rejected, contextCanaryAbsent: true, ...identity(bin) };
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
