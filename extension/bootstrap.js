'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const messages = {
    en: {
        title: 'C++ Start · Compiler setup', check: 'Checking your compiler', wait: 'Waiting for another C++ setup',
        download: 'Downloading the C++ compiler', verify: 'Verifying the SHA-256 checksum', extract: 'Installing the compiler',
        test: 'Testing C++20 and four-language output', configure: 'Checking the VS Code runner', done: 'Compiler ready',
        apple: 'Choose Install in the Apple Command Line Tools window. This run will continue when installation finishes.',
        pending: 'Apple Command Line Tools are still pending. Finish the macOS installation and run your program again.',
        missing: 'C++ Start is missing a bundled runtime file. Reinstall the extension.',
        local: 'Open a trusted local Windows or macOS workspace to set up the compiler.',
        failed: 'Compiler setup failed.', log: 'Open setup log', cancel: 'Cancellation requested…',
        sdk: 'Apple could not start the Command Line Tools installer. Check the selected Xcode installation and macOS SDK.'
    },
    ar: {
        title: '‎C++ Start‎ · إعداد المترجم', check: 'جارٍ فحص المترجم', wait: 'في انتظار انتهاء إعداد آخر',
        download: 'جارٍ تنزيل مترجم ‎C++‎', verify: 'جارٍ التحقق من بصمة ‎SHA-256‎', extract: 'جارٍ تثبيت المترجم',
        test: 'جارٍ اختبار ‎C++20‎ والمخرجات بأربع لغات', configure: 'جارٍ فحص أداة التشغيل', done: 'المترجم جاهز',
        apple: 'اختر «تثبيت» في نافذة أدوات سطر الأوامر من Apple. سيُستأنف التشغيل عند اكتمال التثبيت.',
        pending: 'لم يكتمل تثبيت أدوات Apple بعد. أكمل التثبيت في macOS ثم شغّل البرنامج مجددًا.',
        missing: 'ملف تشغيل مضمّن مفقود. أعد تثبيت إضافة ‎C++ Start‎.',
        local: 'افتح مساحة عمل محلية موثوقة في Windows أو macOS لإعداد المترجم.',
        failed: 'تعذّر إعداد المترجم.', log: 'فتح سجل الإعداد', cancel: 'جارٍ طلب الإلغاء…',
        sdk: 'تعذّر على Apple بدء التثبيت. تحقّق من تثبيت Xcode المحدد وحزمة SDK لنظام macOS.'
    },
    bn: {
        title: 'C++ Start · কম্পাইলার সেটআপ', check: 'কম্পাইলার পরীক্ষা করা হচ্ছে', wait: 'অন্য একটি সেটআপ শেষ হওয়ার অপেক্ষায়',
        download: 'C++ কম্পাইলার ডাউনলোড হচ্ছে', verify: 'SHA-256 চেকসাম যাচাই হচ্ছে', extract: 'কম্পাইলার ইনস্টল হচ্ছে',
        test: 'C++20 এবং চার ভাষার আউটপুট যাচাই হচ্ছে', configure: 'VS Code রানার পরীক্ষা করা হচ্ছে', done: 'কম্পাইলার প্রস্তুত',
        apple: 'Apple Command Line Tools উইন্ডোতে Install বেছে নিন। ইনস্টল শেষ হলে প্রোগ্রাম চলবে।',
        pending: 'Apple Command Line Tools এখনও ইনস্টল হচ্ছে। macOS-এ ইনস্টল শেষ করে প্রোগ্রামটি আবার চালান।',
        missing: 'এক্সটেনশনের একটি রানটাইম ফাইল পাওয়া যায়নি। C++ Start আবার ইনস্টল করুন।',
        local: 'কম্পাইলার সেটআপ করতে Windows বা macOS-এ একটি বিশ্বস্ত স্থানীয় ওয়ার্কস্পেস খুলুন।',
        failed: 'কম্পাইলার সেটআপ ব্যর্থ হয়েছে।', log: 'সেটআপ লগ খুলুন', cancel: 'বাতিলের অনুরোধ পাঠানো হয়েছে…',
        sdk: 'Apple-এর ইনস্টলার চালু করা যায়নি। নির্বাচিত Xcode এবং macOS SDK পরীক্ষা করুন।'
    },
    ru: {
        title: 'C++ Start · Настройка компилятора', check: 'Проверка компилятора', wait: 'Ожидание завершения другой установки',
        download: 'Загрузка компилятора C++', verify: 'Проверка контрольной суммы SHA-256', extract: 'Установка компилятора',
        test: 'Проверка C++20 и вывода на четырёх языках', configure: 'Проверка запуска из VS Code', done: 'Компилятор готов',
        apple: 'Нажмите «Установить» в окне Apple Command Line Tools. Запуск продолжится после установки.',
        pending: 'Установка Apple Command Line Tools ещё не завершилась. Завершите её в macOS и запустите программу снова.',
        missing: 'Отсутствует файл из комплекта C++ Start. Переустановите расширение.',
        local: 'Для настройки компилятора откройте доверенную локальную рабочую область Windows или macOS.',
        failed: 'Не удалось настроить компилятор.', log: 'Открыть журнал установки', cancel: 'Запрошена отмена…',
        sdk: 'Не удалось открыть установщик Apple. Проверьте выбранную установку Xcode и macOS SDK.'
    }
};

let api;
let extension;
let activeSetup;
let checkedMac;
const receiptKey = 'validatedToolchain.v2.2';
function initialize(vscode, context) {
    api = vscode;
    extension = context;
}

function getTools(platform = process.platform, home = os.homedir()) {
    const base = extension ? extension.extensionPath : __dirname;
    if (platform === 'darwin') {
        const appDir = path.posix.join(home, 'Library/Application Support/CppStart');
        return { platform, shell: '/bin/bash', runner: path.posix.join(base, 'runtime/macos/vscode-run.sh'),
            appDir, logs: path.posix.join(home, 'Library/Logs/CppStart/VSCode') };
    }
    if (platform !== 'win32') throw new Error('C++ Start requires Windows or macOS.');
    const win = path.win32;
    const local = process.env.LOCALAPPDATA;
    const windows = process.env.SystemRoot || process.env.WINDIR;
    if (!local || !windows || !win.isAbsolute(local) || !win.isAbsolute(windows)) {
        throw new Error('The Windows application or system folder is unavailable.');
    }
    const dir = win.join(local, 'CppStart');
    const ps = ['WindowsPowerShell', 'v1.0', 'powershell.exe'];
    const native = win.join(windows, 'Sysnative', ...ps);
    const shell = process.arch === 'ia32' && fs.existsSync(native) ? native : win.join(windows, 'System32', ...ps);
    return { platform, shell, runner: win.join(base, 'runtime/windows/vscode-run.ps1'),
        bin: win.join(dir, 'toolchain/bin'), appDir: dir, logs: win.join(dir, 'logs/VSCode') };
}

async function signature(tools) {
    // Compare installed components to the last successful compile/link/run. An
    // explicit Set Up command always repeats the C++20 and Unicode smoke test.
    const root = path.dirname(tools.bin);
    const files = [path.join(tools.bin,'clang++.exe'), path.join(tools.bin,'ld.lld.exe'),
        path.join(root,'include/c++/v1/iostream')];
    try {
        const stats = await Promise.all(files.map(file => fs.promises.stat(file)));
        if (!stats.every(stat => stat.isFile())) return undefined;
        return stats.map(stat => stat.size + '/' + stat.mtimeMs).join('|');
    } catch { return undefined; }
}

function execute(file, args) {
    return new Promise(resolve => execFile(file, args, { windowsHide: true, timeout: 20000, encoding: 'utf8' },
        (error, stdout, stderr) => resolve({ ok: !error, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() })));
}

async function macCompiler() {
    const selected = await execute('/usr/bin/xcode-select', ['-p']);
    if (!selected.ok || !path.posix.isAbsolute(selected.stdout) || !fs.existsSync(selected.stdout)) return undefined;
    const [cc, sdk] = await Promise.all([
        execute('/usr/bin/xcrun', ['--sdk', 'macosx', '--find', 'clang++']),
        execute('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path'])
    ]);
    if (!cc.ok || !sdk.ok || !path.posix.isAbsolute(cc.stdout) || !path.posix.isAbsolute(sdk.stdout)) return undefined;
    try {
        await fs.promises.access(cc.stdout, fs.constants.X_OK);
        if (!(await fs.promises.stat(sdk.stdout)).isDirectory()) return undefined;
        return { compiler: cc.stdout, sdk: sdk.stdout };
    } catch { return undefined; }
}

async function appleSetup(progress, token, t) {
    if (token.isCancellationRequested) return false;
    // Check for both parts before asking macOS to show its installer.
    checkedMac = await macCompiler();
    if (checkedMac) return true;
    if (token.isCancellationRequested) return false;
    const installer = await execute('/usr/bin/xcode-select', ['--install']);
    if (!installer.ok) {
        checkedMac = await macCompiler();
        if (checkedMac) return true;
        throw new Error(t.sdk + (installer.stderr ? ' ' + installer.stderr : ''));
    }
    progress.report({ message: t.apple });
    // Apple's installer owns its own confirmation. Cancelling this progress
    // notification ends this run and leaves the user's system installer alone.
    const deadline = Date.now() + 20 * 60 * 1000;
    while (!token.isCancellationRequested && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (token.isCancellationRequested) return false;
        checkedMac = await macCompiler();
        if (checkedMac) return true;
    }
    if (!token.isCancellationRequested) void api.window.showInformationMessage(t.pending);
    return false;
}

function runWorker(tools, script, marker, locale, progress, t) {
    return new Promise((resolve, reject) => {
        const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
            '-File', script, '-Language', locale, '-CancelFile', marker];
        const child = spawn(tools.shell, args, { windowsHide: true, shell: false, stdio: ['ignore','pipe','pipe'] });
        let errorText = '';
        let phase = '';
        let last = 0;
        let cancelled = false;
        const lines = createInterface({ input: child.stdout });
        lines.on('line', line => {
            if (line.startsWith('STAGE ')) {
                phase = line.slice(6);
                progress.report({ message: t[phase] || t.check });
            } else if (/^PROGRESS (\d{1,3})$/.test(line)) {
                const pct = Math.min(100, Number(line.slice(9)));
                progress.report({ message: t.download + ' · ' + pct + '%', increment: Math.max(0, pct - last) });
                last = Math.max(last, pct);
            } else if (line === 'ERROR cancelled') {
                cancelled = true;
            }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-2400); });
        child.once('error', reject);
        child.once('close', (code, signal) => {
            lines.close();
            if (code === 2 || cancelled) resolve(false);
            else if (code === 0 && phase === 'done') resolve(true);
            else reject(new Error(t.failed + ' ' + (errorText.trim() || signal || String(code))));
        });
    });
}

async function windowsSetup(tools, progress, token, t, locale) {
    const runtime = path.dirname(tools.runner);
    const script = path.join(runtime, 'setup.ps1');
    if (!fs.existsSync(script) || !fs.existsSync(path.join(runtime, 'program-utf8.res'))) throw new Error(t.missing);
    const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cppstart-setup-'));
    const marker = path.join(temporary, 'cancel');
    // A private marker asks the worker to cancel between safe filesystem stages.
    const cancel = () => {
        try { fs.writeFileSync(marker, 'cancel'); } catch { /* Worker finished. */ }
        progress.report({ message: t.cancel });
    };
    const sub = token.onCancellationRequested(cancel);
    try {
        if (token.isCancellationRequested) return false;
        const ok = await runWorker(tools, script, marker, locale, progress, t);
        if (!ok || token.isCancellationRequested) return false;
        const stamp = await signature(tools);
        if (stamp) await extension.globalState.update(receiptKey, stamp);
        return true;
    } catch (error) {
        const file = path.join(tools.appDir, 'setup.log');
        if (fs.existsSync(file)) {
            void api.window.showErrorMessage(String(error.message || error), t.log)
                .then(async choice => {
                    if (choice === t.log) await api.window.showTextDocument(await api.workspace.openTextDocument(file));
                }).catch(() => {});
            return false;
        }
        throw error;
    } finally {
        sub.dispose();
        await fs.promises.rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
}

async function provision(explicit) {
    const localeCode = String(api.env.language || 'en').split('-')[0].toLowerCase();
    const locale = Object.hasOwn(messages, localeCode) ? localeCode : 'en';
    const t = messages[locale];
    if (!api.workspace.isTrusted || api.env.remoteName || api.env.uiKind !== api.UIKind.Desktop) {
        void api.window.showWarningMessage(t.local);
        return false;
    }
    const tools = getTools();
    if (!fs.existsSync(tools.runner)) throw new Error(t.missing);
    if (!explicit && tools.platform === 'win32') {
        const stamp = await signature(tools);
        if (stamp && extension.globalState.get(receiptKey) === stamp) return true;
    }
    if (!explicit && tools.platform === 'darwin' && checkedMac &&
        fs.existsSync(checkedMac.compiler) && fs.existsSync(checkedMac.sdk)) return true;
    return api.window.withProgress({ location: api.ProgressLocation.Notification, title: t.title, cancellable: true },
        async (progress, token) => {
            progress.report({ message: t.check });
            return tools.platform === 'darwin' ? appleSetup(progress, token, t) : windowsSetup(tools, progress, token, t, locale);
        });
}

function ensureReady(options = {}) {
    if (!api || !extension) return Promise.reject(new Error('C++ Start has not been activated.'));
    if (!activeSetup) {
        activeSetup = provision(!!options.explicit).finally(() => { activeSetup = undefined; });
    }
    return activeSetup;
}

module.exports = { initialize, ensureReady, getTools };
