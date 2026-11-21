'use strict';

const fs = require('node:fs').promises;
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const { getTools } = require('./bootstrap');

const bundledFamily = 'Noto Sans Bengali';
const fontHash = '2edcfabf11244dedadc61f183678328bfacf34185b3049acc27535909c81e534';
const states = new WeakMap();
const messages = {
    en: ['The Bengali font is ready. If the source editor still shows boxes, reload the VS Code window.', 'The source editor could not activate its Bengali font. You can still compile and use the C++ output pane.', 'Reload Window'],
    ar: ['خط البنغالية جاهز. إذا استمر ظهور مربعات في محرر الشيفرة، فأعد تحميل نافذة VS Code.', 'تعذّر تفعيل خط البنغالية في محرر الشيفرة. يمكنك مواصلة الترجمة واستخدام لوحة مخرجات C++.', 'إعادة تحميل النافذة'],
    bn: ['বাংলা ফন্ট প্রস্তুত। কোডে এখনও বর্গচিহ্ন দেখালে VS Code উইন্ডোটি পুনরায় লোড করুন।', 'সোর্স এডিটরে বাংলা ফন্ট চালু করা যায়নি। আপনি কোড কম্পাইল করে C++ আউটপুট প্যানেলে ফলাফল দেখতে পারবেন।', 'উইন্ডো পুনরায় লোড করুন'],
    ru: ['Бенгальский шрифт готов. Если в редакторе кода видны квадраты, перезагрузите окно VS Code.', 'Не удалось подключить бенгальский шрифт к редактору. Вы можете компилировать код и пользоваться панелью вывода C++.', 'Перезагрузить окно']
};

// Font installation happens only on the first explicit run/setup in this host.
function initializeEditorFont(_vscode, context) {
    if (!states.has(context)) states.set(context, { alerted: new Set() });
}

function result(available = false, changed = false, mayNeedReload = false, family = bundledFamily) {
    return { available, changed, mayNeedReload, family };
}

const macNames = [bundledFamily, 'Kohinoor Bangla', 'Bangla Sangam MN', 'Bangla MN'];
const macProbe = [
    "ObjC.import('AppKit');",
    'const names = ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies);',
    'const candidates = ' + JSON.stringify(macNames) + ';',
    "candidates.find(function (s) { return names.indexOf(s) >= 0; }) || '';"
].join('\n');

async function installMac(base) {
    const probe = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', macProbe], {
        timeout: 15000, maxBuffer: 32768
    });
    const family = probe.stdout.trim();
    if (macNames.includes(family)) return result(true, false, false, family);

    const source = path.join(base, 'fonts/Bengali-Regular.ttf');
    const bytes = await fs.readFile(source);
    if (createHash('sha256').update(bytes).digest('hex') !== fontHash) throw new Error('Bengali font checksum mismatch');
    const directory = path.join(os.homedir(), 'Library', 'Fonts');
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, 'CppStart-Bengali-' + fontHash.slice(0, 12) + '.ttf');
    const temp = path.join(directory, '.CppStart-' + randomUUID() + '.tmp');
    await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o644 });
    try {
        await fs.link(temp, target); // An atomic publish that never replaces an existing font.
        return result(true, true, true);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!(await fs.lstat(target)).isFile() || !(await fs.readFile(target)).equals(bytes)) throw error;
        return result(true, false, true);
    } finally { await fs.unlink(temp).catch(() => {}); }
}

async function nativeFont(base) {
    if (process.platform === 'darwin') return installMac(base);
    const script = path.join(base, 'runtime', 'windows', 'font.ps1');
    const { stdout } = await execute(getTools().shell, [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', script
    ], { windowsHide: true, timeout: 60000, maxBuffer: 32768 });
    const r = JSON.parse(stdout.trim().replace(/^\uFEFF/, ''));
    if ([r.available, r.changed, r.mayNeedReload].some(v => typeof v !== 'boolean') || r.family !== bundledFamily) {
        throw new Error('Invalid Windows font result');
    }
    return r;
}

const explicitSettings = [
    'globalValue', 'globalLanguageValue', 'workspaceValue', 'workspaceLanguageValue',
    'workspaceFolderValue', 'workspaceFolderLanguageValue', 'policyValue'
];

function withFallback(stack, family) {
    // VS Code's default font lists contain simple comma-separated CSS families.
    // This function is never used to normalize or modify a custom font list.
    const names = stack.split(',').map(name => name.trim());
    if (names.some(name => name.replace(/^['"]|['"]$/g, '').toLowerCase() === family.toLowerCase())) return stack;
    const generic = names.findIndex(name => /^(?:monospace|sans-serif|serif|system-ui|ui-monospace)$/i.test(name));
    names.splice(generic < 0 ? names.length : generic, 0, '"' + family + '"');
    return names.join(', ');
}

async function setDefaultFallback(vscode, document, family) {
    // The extension has no public editor-instance font setter. Use only the C++
    // user setting when this profile and all open folders still use VS Code defaults.
    const folders = vscode.workspace.workspaceFolders || [];
    const uris = [document?.uri, ...folders.map(folder => folder.uri)];
    const get = uri => vscode.workspace.getConfiguration('editor', { uri, languageId: 'cpp' });
    for (const uri of uris) {
        const config = get(uri);
        const details = config.inspect('fontFamily');
        if (!details || explicitSettings.some(key => details[key] !== undefined)) return false;
        if (details.defaultLanguageValue !== undefined) return false; // Another extension supplied a C++ default.
        if (config.get('fontFamily') !== details.defaultValue) return false; // Managed/uninspectable override.
    }
    const config = get(document?.uri);
    const stack = config.get('fontFamily');
    if (typeof stack !== 'string' || !stack.trim()) return false;
    const updated = withFallback(stack, family);
    if (updated === stack) return false;
    await config.update('fontFamily', updated, vscode.ConfigurationTarget.Global, true);
    return true;
}

function alertOnce(vscode, state, category, reloadAction) {
    if (state.alerted.has(category)) return;
    state.alerted.add(category);
    const lang = String(vscode.env.language || 'en').split('-')[0];
    const [info, warning, reload] = messages[lang] || messages.en;
    if (reloadAction) {
        Promise.resolve(vscode.window.showInformationMessage(info, reload)).then(answer => {
            if (answer === reload) return vscode.commands.executeCommand('workbench.action.reloadWindow');
        }).catch(() => {});
    } else if (category === 'setting') {
        const options = {
            en: 'The Bengali font is available. VS Code kept your current C++ editor font setting.',
            ar: 'الخط البنغالي متاح. احتفظ VS Code بإعداد خط محرر C++ الحالي.',
            bn: 'বাংলা ফন্ট প্রস্তুত। VS Code আপনার C++ এডিটরের বর্তমান ফন্ট সেটিং বজায় রেখেছে।',
            ru: 'Бенгальский шрифт доступен. VS Code сохранил текущую настройку шрифта редактора C++.'
        };
        Promise.resolve(vscode.window.showWarningMessage(options[lang] || options.en)).catch(() => {});
    } else {
        Promise.resolve(vscode.window.showWarningMessage(warning)).catch(() => {});
    }
}

async function ensureEditorFont(vscode, context, document) {
    if (!vscode.workspace.isTrusted || vscode.env.remoteName ||
        !['win32', 'darwin'].includes(process.platform) ||
        (document && !['file', 'untitled'].includes(document.uri.scheme))) return result();
    initializeEditorFont(vscode, context);
    const state = states.get(context);
    if (state.pending) return state.pending;
    if (state.verified) return state.verified;
    state.pending = (async () => {
        try {
            const status = await nativeFont(context.extensionPath || __dirname);
            if (!status.available) {
                alertOnce(vscode, state, 'unavailable', false);
                return status;
            }
            if (!vscode.workspace.isTrusted || vscode.env.remoteName) return status;
            try { await setDefaultFallback(vscode, document, status.family); }
            catch { alertOnce(vscode, state, 'setting', false); } // A policy may lock this preference.
            state.verified = status;
            if (status.mayNeedReload) alertOnce(vscode, state, 'ready', true);
            return status;
        } catch {
            alertOnce(vscode, state, 'unavailable', false);
            return result();
        } finally { state.pending = undefined; }
    })();
    return state.pending;
}

module.exports = { ensureEditorFont, initializeEditorFont };
