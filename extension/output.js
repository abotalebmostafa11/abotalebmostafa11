'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getTools, runnerArgs } = require('./paths');
const issues = require('./issues');
const sessions = new Map();
const outputLimit = 1024 * 1024;

const labels = {
  en: { trace: 'Trace issue', log: 'Issue log', credit: 'Created and designed by Associate Professor Mostafa Abotaleb', university: 'Yugra State University', title: 'C++ output', compiling: 'Compiling…', running: 'Running', finished: 'Finished', failed: 'Could not run the program', buildFailed: 'Compilation failed', stopped: 'Stopped', stopping: 'Stopping…', code: 'Exit code', input: 'Program input', send: 'Send line', eof: 'End input', stop: 'Stop', limit: 'Output display limit reached.' },
  ar: { trace: 'تتبّع الخطأ', log: 'سجلّ الأخطاء', credit: 'إنشاء وتصميم الأستاذ المشارك مصطفى أبو طالب', university: 'جامعة يوغرا الحكومية', title: 'مخرجات C++', compiling: 'جارٍ الترجمة…', running: 'قيد التشغيل', finished: 'اكتمل التشغيل', failed: 'تعذّر تشغيل البرنامج', buildFailed: 'فشلت الترجمة', stopped: 'تم الإيقاف', stopping: 'جارٍ الإيقاف…', code: 'رمز الخروج', input: 'مدخلات البرنامج', send: 'إرسال السطر', eof: 'إنهاء الإدخال', stop: 'إيقاف', limit: 'تم بلوغ حد عرض المخرجات.' },
  bn: { trace: 'সমস্যা খুঁজুন', log: 'সমস্যার লগ', credit: 'নির্মাণ ও নকশা করেছেন সহযোগী অধ্যাপক মোস্তফা আবোতালেব', university: 'ইউগ্রা স্টেট ইউনিভার্সিটি', title: 'C++ আউটপুট', compiling: 'কম্পাইল হচ্ছে…', running: 'চলছে', finished: 'শেষ হয়েছে', failed: 'প্রোগ্রাম চালানো যায়নি', buildFailed: 'কম্পাইল করা যায়নি', stopped: 'থামানো হয়েছে', stopping: 'থামানো হচ্ছে…', code: 'এক্সিট কোড', input: 'প্রোগ্রামের ইনপুট', send: 'লাইন পাঠান', eof: 'ইনপুট শেষ করুন', stop: 'থামান', limit: 'আউটপুট প্রদর্শনের সীমা পূর্ণ হয়েছে।' },
  ru: { trace: 'Перейти к ошибке', log: 'Журнал ошибок', credit: 'Разработка и дизайн — доцент Мостафа Аботалеб', university: 'Югорский государственный университет', title: 'Вывод C++', compiling: 'Компиляция…', running: 'Выполняется', finished: 'Выполнение завершено', failed: 'Не удалось запустить программу', buildFailed: 'Ошибка компиляции', stopped: 'Остановлено', stopping: 'Остановка…', code: 'Код завершения', input: 'Ввод для программы', send: 'Отправить строку', eof: 'Завершить ввод', stop: 'Остановить', limit: 'Достигнут предел отображения вывода.' }
};

function readLanguage(vscode, tools) {
  let language = vscode.env.language || 'en';
  try {
    const preference = fs.readFileSync(path.join(tools.appDir, 'language.txt'), 'utf8').trim();
    if (Object.hasOwn(labels, preference)) language = preference;
  } catch { /* Fall back to the VS Code display language. */ }
  language = language.split('-')[0].toLowerCase();
  return Object.hasOwn(labels, language) ? language : 'en';
}

// Only fixed translations and the random nonce enter the HTML. Filenames,
// diagnostics and every byte of program output reach the page as text.
function panelHtml(language, fontUri, webviewOrigin, brand) {
  const t = labels[language];
  const nonce = crypto.randomBytes(18).toString('hex');
  return `<!doctype html>
<html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; font-src ${webviewOrigin}; img-src ${webviewOrigin}; script-src 'nonce-${nonce}'; form-action 'none';">
<style nonce="${nonce}">
@font-face{font-family:CppStartBengali;src:url("${fontUri}") format("truetype");font-weight:100 900;font-style:normal;unicode-range:U+0980-09FF,U+0964-0965,U+200C-200D,U+25CC}

:root{color-scheme:light dark}*{box-sizing:border-box}
body{margin:0;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font:var(--vscode-font-size)/1.5 CppStartBengali,var(--vscode-font-family),"Nirmala UI","Segoe UI",sans-serif}
main{padding:16px;display:flex;flex-direction:column;gap:12px;min-height:350px;height:100vh}
.identity,.toolbar,.actions,form{display:flex;align-items:center;gap:8px}.identity{padding-block-end:12px;gap:10px;border-bottom:1px solid var(--vscode-panel-border);min-width:0}.wordmark{font-size:17px;font-weight:650;line-height:1.3}.identity img.app{width:38px;height:38px;object-fit:contain}.academic{margin-inline-start:auto}.academic img{display:block;max-width:102px;height:40px;object-fit:contain}.academic .dark{display:none}.vscode-dark .academic .dark,.vscode-high-contrast .academic .dark{display:block}.vscode-dark .academic .light,.vscode-high-contrast .academic .light{display:none}
.toolbar{justify-content:space-between;flex-wrap:wrap}.actions{gap:6px;flex-wrap:wrap}#status{font-weight:600}
pre{flex:1;min-height:100px;overflow:auto;margin:0;padding:14px;border:1px solid var(--vscode-widget-border,var(--vscode-panel-border));border-radius:6px;background:var(--vscode-textCodeBlock-background);white-space:pre-wrap;overflow-wrap:anywhere;unicode-bidi:plaintext;text-align:start;tab-size:4;line-height:1.7;font-family:CppStartBengali,var(--vscode-editor-font-family),"Nirmala UI","Segoe UI",sans-serif}
form{flex-wrap:wrap}label{flex-basis:100%;font-weight:600}input{flex:1;min-width:7em;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:4px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);padding:7px;unicode-bidi:plaintext;font:inherit}
button{border:1px solid var(--vscode-contrastBorder,transparent);border-radius:4px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:5px 10px;cursor:pointer;font:inherit}button:not(:disabled):hover{background:var(--vscode-button-secondaryHoverBackground)}button[type=submit]{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
button:focus-visible,input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}button:disabled,input:disabled{opacity:.5;cursor:default}footer{color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.4}
@media(max-width:330px){main{padding:10px}.academic img{max-width:74px;height:34px}.toolbar{align-items:flex-start}}
</style></head><body><main>
<header class="identity"><img class="app" src="${brand.app}" alt=""><span class="wordmark" dir="ltr">C++ Start</span>
<span class="academic"><img class="light" src="${brand.light}" alt="${t.university}"><img class="dark" src="${brand.dark}" alt="${t.university}"></span></header>
<section class="toolbar" aria-label="${t.title}"><span id="status" role="status">${t.compiling}</span><div class="actions"><button id="trace" type="button" disabled>${t.trace}</button><button id="log" type="button" disabled>${t.log}</button><button id="stop" type="button">${t.stop}</button></div></section>
<pre id="stream" dir="auto" tabindex="0" aria-label="${t.title}"></pre>
<form id="form"><label for="line">${t.input}</label><input id="line" type="text" dir="auto" maxlength="65536" autocomplete="off" disabled>
<div class="actions"><button type="submit" id="send" disabled>${t.send}</button><button type="button" id="eof" disabled>${t.eof}</button></div></form>
<footer>${t.credit}</footer></main><script nonce="${nonce}">
const host=acquireVsCodeApi();
const element=id=>document.getElementById(id);
const output=element('stream'), line=element('line');
function display(text,replace){
 const follow=output.scrollTop+output.clientHeight>=output.scrollHeight-12;
 if(replace)output.textContent=text;else output.appendChild(document.createTextNode(text));
 if(follow)output.scrollTop=output.scrollHeight;
}
window.addEventListener('message',({data})=>{
 if(data.type==='snapshot')display(data.text,true);
 if(data.type==='append')display(data.text,false);
 if(data.type==='state'||data.type==='snapshot'){
  element('status').textContent=data.label;
  line.disabled=element('send').disabled=element('eof').disabled=!data.input;
  element('stop').disabled=!data.stop;
  element('trace').disabled=element('log').disabled=!data.issue;
 }
});
element('form').addEventListener('submit',e=>{e.preventDefault();if(!line.disabled){host.postMessage({type:'line',text:line.value});line.value='';line.focus();}});
element('eof').onclick=()=>host.postMessage({type:'eof'});
element('trace').onclick=()=>host.postMessage({type:'trace'});
element('log').onclick=()=>host.postMessage({type:'log'});
element('stop').onclick=()=>host.postMessage({type:'stop'});
host.postMessage({type:'ready'});
</script></body></html>`;
}

function stopTree(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'darwin') {
    // Every Mac run has its own process group, including Clang's helper processes.
    const group = -child.pid;
    try { process.kill(group, 'SIGTERM'); } catch { return; }
    // Let the build runner's EXIT trap remove its overlay and staging files.
    const force = setTimeout(() => {
      try { process.kill(group, 'SIGKILL'); } catch { /* Group already exited. */ }
    }, 1000);
    force.unref();
    return;
  }
  if (process.platform !== 'win32') { child.kill(); return; }
  const killTop = () => {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill(); } catch { /* Already exited. */ }
    }
  };
  // Stop PowerShell, Clang, the linker, or children started by a user's program.
  try {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.once('error', killTop);
    killer.once('close', code => { if (code !== 0) killTop(); });
  } catch { killTop(); }
}

async function runProgram(vscode, source, sourceText) {
  const key = process.platform === 'win32' ? source.toLowerCase() : source;
  if (sessions.has(key)) sessions.get(key).dispose();
  const tools = getTools();
  const language = readLanguage(vscode, tools);
  const t = labels[language];
  const fonts = vscode.Uri.file(path.join(__dirname, 'fonts'));
  const brand = vscode.Uri.file(path.join(__dirname, 'brand'));
  const panel = vscode.window.createWebviewPanel('cppstart.output', t.title + ' · ' + path.basename(source),
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, localResourceRoots: [fonts, brand] });
  panel.iconPath = vscode.Uri.joinPath(brand, 'app.png');
  sessions.set(key, panel);
  let report, compilerText = '';
  let child, timer, transcript = '', delta = '', ready = false, disposed = false, canceled = false, truncated = false;
  let state = { label: t.compiling, input: false, stop: true };

  function post(message) {
    if (disposed || !ready) return;
    Promise.resolve(panel.webview.postMessage(message)).catch(() => {});
  }
  function flush() {
    clearTimeout(timer); timer = undefined;
    if (delta) { post({ type: 'append', text: delta }); delta = ''; }
  }
  function append(text) {
    if (disposed || truncated || !text) return;
    const remaining = outputLimit - transcript.length;
    if (text.length > remaining) { text = text.slice(0, remaining) + '\n[' + t.limit + ']\n'; truncated = true; }
    transcript += text; delta += text;
    if (!timer) timer = setTimeout(flush, 35);
  }
  function update(label, input, stop) {
    state = { label, input, stop, issue: !!report };
    flush(); post({ type: 'state', ...state });
  }
  function cancel() {
    if (canceled || !state.stop) return;
    canceled = true;
    update(t.stopping, false, false);
    stopTree(child);
  }
  function execute(exe, args, options, interactive) {
    return new Promise((resolve, reject) => {
      const proc = spawn(exe, args, { ...options, windowsHide: true, shell: false, detached: process.platform === 'darwin', stdio: ['pipe', 'pipe', 'pipe'] });
      child = proc;
      for (const stream of [proc.stdout, proc.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', text => {
          if (!interactive && stream === proc.stderr && compilerText.length < outputLimit) {
            compilerText += text.slice(0, outputLimit - compilerText.length);
          }
          append(text);
        });
      }
      proc.stdin.on('error', () => {
        if (!disposed && state.input && child === proc) update(state.label, false, state.stop);
      });
      proc.once('error', reject);
      proc.once('close', (code, signal) => {
        if (child === proc) child = undefined;
        resolve(code === null ? (signal || '—') : code);
      });
      if (interactive) update(t.running, true, true);
      else proc.stdin.end();
    });
  }
  panel.onDidDispose(() => {
    disposed = true;
    if (sessions.get(key) === panel) sessions.delete(key);
    clearTimeout(timer); cancel();
  });
  panel.webview.onDidReceiveMessage(message => {
    if (disposed || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      ready = true; clearTimeout(timer); timer = undefined; delta = '';
      post({ type: 'snapshot', text: transcript, ...state }); return;
    }
    if (report && (message.type === 'trace' || message.type === 'log')) {
      const action = message.type === 'trace' ? issues.trace : issues.openLog;
      action(vscode, report).catch(error => vscode.window.showErrorMessage(error.message)); return;
    }
    if (message.type === 'stop') { cancel(); return; }
    if (!state.input || !child || child.stdin.destroyed || child.stdin.writableEnded) return;
    if (message.type === 'eof') {
      child.stdin.end(); update(state.label, false, state.stop);
    } else if (message.type === 'line' && typeof message.text === 'string' && message.text.length <= 65536) {
      const input = message.text + '\n';
      child.stdin.write(input, 'utf8');
    }
  });
  const font = panel.webview.asWebviewUri(vscode.Uri.joinPath(fonts, 'NotoSansBengali.ttf'));
  const uri = name => panel.webview.asWebviewUri(vscode.Uri.joinPath(brand, name)).toString();
  panel.webview.html = panelHtml(language, font.toString(), panel.webview.cspSource,
    { app: uri('app.png'), light: uri('university-light.png'), dark: uri('university-dark.png') });

  let temporary;
  try {
    temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cppstart-view-'));
    if (canceled) return;
    const binary = path.join(temporary, tools.platform === 'darwin' ? 'program' : 'program.exe');
    const cwd = path.dirname(source);
    let snapshot;
    if (typeof sourceText === 'string') {
      // Send exactly what the editor decoded, including unsaved Unicode characters.
      // The compiler overlays this snapshot on the real path to resolve headers.
      snapshot = path.join(temporary, 'editor-buffer.cpp');
      await fs.promises.writeFile(snapshot, sourceText, { encoding: 'utf8', flag: 'wx' });
    }
    if (canceled) return;
    const args = runnerArgs(tools, source, snapshot, binary);
    const result = await execute(tools.shell, args, { cwd }, false);
    if (canceled) return;
    const diagnostics = issues.parseDiagnostics(compilerText, source, snapshot);
    if (result !== 0 || diagnostics.length) {
      report = issues.record(source, 'Build', t.code + ' ' + result, diagnostics, compilerText);
    }
    if (result !== 0) { update(t.buildFailed + ' · ' + t.code + ' ' + result, false, false); return; }
    const env = { ...process.env };
    const pathKey = Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'PATH';
    if (tools.bin) env[pathKey] = tools.bin + path.delimiter + (env[pathKey] || '');
    if (tools.platform === 'darwin') { env.LC_CTYPE = 'UTF-8'; }
    const exit = await execute(binary, [], { cwd, env }, true);
    if (!canceled) {
      if (exit !== 0) report = issues.record(source, 'Run', t.code + ' ' + exit, diagnostics);
      update(t.finished + ' · ' + t.code + ' ' + exit, false, false);
    }
  } catch (error) {
    if (!canceled) {
      report = issues.record(source, 'Run', error.message, []);
      append('\n' + error.message + '\n'); update(t.failed, false, false);
    }
  } finally {
    if (canceled) update(t.stopped, false, false);
    if (temporary) await fs.promises.rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {});
  }
}

function disposeAll() {
  for (const panel of Array.from(sessions.values())) panel.dispose();
}

module.exports = { runProgram, disposeAll };
