'use strict';

const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getTools, runnerArgs } = require('./paths');
const issues = require('./issues');
const bootstrap = require('./bootstrap');
const editorFont = require('./editorFont');
const output = require('./output');

function cppFilename(name) { return /\.(?:cpp|cxx|cc|c\+\+|cp|ixx|cppm)$/i.test(name) || name.endsWith('.C'); }
const utf8Signature = Buffer.from([0xef, 0xbb, 0xbf]);
const reportedQuestions = new WeakSet();
const reportedLegacy = new WeakSet();
const starter = '#include <iostream>\n\nint main() {\n    std::cout << "আমি বাংলায় লিখি।" << \'\\n\';\n    return 0;\n}\n';

function untitledCpp(document) {
    if (!document || document.uri.scheme !== 'untitled') return false;
    if (document.languageId === 'cpp') return true;
    if (document.languageId !== 'plaintext') return false;
    return /#\s*include\s*[<"]|\bstd::\w+|\b(?:int|auto)\s+main\s*\(/.test(document.getText().slice(0, 65536));
}

function isSource(document) {
    if (!document) return false;
    return untitledCpp(document) || (document.uri.scheme === 'file' && cppFilename(document.uri.fsPath));
}

function isUtf8(encoding) { return /^(?:utf-?8(?:bom)?)$/i.test(encoding || ''); }

async function canSaveAsUtf8(document) {
    if (document.encoding) return isUtf8(document.encoding);
    // Older VS Code versions do not report the current codec. A BOM identifies
    // the UTF-8 files created by C++ Start, including when the user's default is legacy.
    let handle;
    try {
        handle = await fs.promises.open(document.uri.fsPath, 'r');
        const prefix = Buffer.alloc(utf8Signature.length);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        return bytesRead === prefix.length && prefix.equals(utf8Signature);
    } catch { return false; }
    finally { if (handle) await handle.close(); }
}

function containsQuestionLiteral(text) {
    // Catch a common lossy-save symptom without treating punctuation in comments as evidence.
    return /(?:std::(?:cout|cerr|clog)|\b(?:cout|cerr|clog))\s*<<\s*"(?:[^"\\\r\n]|\\.)*\?{3,}(?:[^"\\\r\n]|\\.)*"|\b(?:printf|puts)\s*\(\s*"(?:[^"\\\r\n]|\\.)*\?{3,}/.test(text);
}

function defaultFolder(document) {
    if (document && document.uri.scheme === 'file') return path.dirname(document.uri.fsPath);
    const workspace = (vscode.workspace.workspaceFolders || []).find(folder => folder.uri.scheme === 'file');
    return workspace ? workspace.uri.fsPath : os.homedir();
}

async function createUtf8File(document, name, initial) {
    let filename = name;
    for (;;) {
        const selected = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(defaultFolder(document), filename)),
            filters: { 'C++': ['cpp', 'cc', 'cxx', 'c++', 'cp', 'cppm', 'ixx'] },
            title: vscode.l10n.t('Save a new UTF-8 C++ file')
        });
        if (!selected) return;
        if (selected.scheme !== 'file') throw new Error(vscode.l10n.t('Choose a local C++ source file.'));
        const target = path.extname(selected.fsPath) ? selected.fsPath : selected.fsPath + '.cpp';
        if (!cppFilename(target)) throw new Error(vscode.l10n.t('Choose a local C++ source file.'));
        const value = document ? document.getText() : initial;
        try {
            // A BOM makes even a legacy-encoding workspace reopen this new file as UTF-8.
            await fs.promises.writeFile(target, Buffer.concat([utf8Signature, Buffer.from(value, 'utf8')]), { flag: 'wx' });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            vscode.window.showInformationMessage(vscode.l10n.t('That file already exists. Choose a new filename.'));
            filename = path.parse(target).name + '-utf8.cpp';
            continue;
        }
        const newDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
        await vscode.window.showTextDocument(newDocument, { preview: false });
        return { path: target, text: value, document: newDocument };
    }
}

async function prepareSource(document) {
    if (untitledCpp(document)) return createUtf8File(document, 'main.cpp');
    // Save using VS Code only when the document codec is known to be UTF-8.
    // VS Code 1.83 has no public document.encoding. Never send Unicode through
    // an unknown legacy encoder as a side effect of pressing Run.
    const text = document.getText();
    if (document.isDirty && await canSaveAsUtf8(document)) {
        if (!await document.save()) return;
        return { path: document.uri.fsPath, text, document };
    }
    if (document.isDirty && /[^\x00-\x7f]/.test(text) && !reportedLegacy.has(document)) {
        const config = vscode.workspace.getConfiguration('files', { uri: document.uri, languageId: 'cpp' });
        const encoding = document.encoding || config.get('encoding', 'utf8');
        if (!isUtf8(encoding)) {
            reportedLegacy.add(document);
            const action = vscode.l10n.t('Save UTF-8 copy');
            vscode.window.showInformationMessage(vscode.l10n.t('Running the text shown in the editor. This file uses {0}. Save a UTF-8 copy to keep all letters on disk.', encoding), action)
                .then(choice => { if (choice === action) return saveCopy(document); })
                .catch(reportError);
        }
    }
    return { path: document.uri.fsPath, text, document };
}

async function saveCopy(document) {
    if (!isSource(document)) return;
    const name = document.uri.scheme === 'file' ? path.parse(document.uri.fsPath).name + '-utf8.cpp' : 'main.cpp';
    return createUtf8File(document, name);
}

async function runInTerminal(source) {
    const tools = getTools();
    const cwd = path.dirname(source.path);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(source.path));
    const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cppstart-terminal-'));
    const snapshot = path.join(temporary, 'source.cpp');
    let listener;
    async function cleanup() {
        if (listener) listener.dispose();
        await fs.promises.rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
    try {
        await fs.promises.writeFile(snapshot, source.text, 'utf8');
        const args = runnerArgs(tools, source.path, snapshot, undefined, !folder);
        if (folder) {
            const execution = new vscode.ProcessExecution(tools.shell, args, { cwd });
            const task = new vscode.Task({ type: 'cppstart', snapshot }, folder, path.basename(source.path), 'C++ Start', execution);
            task.presentationOptions = { echo: false, focus: true, reveal: vscode.TaskRevealKind.Always,
                panel: vscode.TaskPanelKind.Dedicated, clear: true, showReuseMessage: false };
            listener = vscode.tasks.onDidEndTask(event => {
                if (event.execution.task.definition.snapshot === snapshot) void cleanup();
            });
            await vscode.tasks.executeTask(task);
        } else {
            // A file-only window has no task scope. Keep the terminal visible after
            // the program exits. Pass filenames as argument values, including on Mac.
            const shellArgs = tools.platform === 'darwin'
                ? ['-c', '/bin/bash "$@"; exec /bin/bash -i', 'cppstart', ...args] : args;
            const terminal = vscode.window.createTerminal({ name: 'C++ Start · ' + path.basename(source.path),
                shellPath: tools.shell, shellArgs, cwd });
            listener = vscode.window.onDidCloseTerminal(closed => { if (closed === terminal) void cleanup(); });
            terminal.show();
        }
    } catch (error) { await cleanup(); throw error; }
}

async function runOrDebug(context) {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === 'file' && vscode.workspace.isTrusted) {
        const launch = vscode.workspace.getConfiguration('launch', editor.document.uri);
        const configurations = launch.get('configurations', []);
        const compounds = launch.get('compounds', []);
        if ((Array.isArray(configurations) && configurations.some(entry => entry && entry.name && entry.type)) ||
            (Array.isArray(compounds) && compounds.some(entry => entry && entry.name))) {
            await vscode.commands.executeCommand('workbench.action.debug.start');
            return;
        }
    }
    await run(false, context);
}

function reportError(error) {
    vscode.window.showErrorMessage(vscode.l10n.t('C++ Start could not run the program. {0}',
        error && error.message ? error.message : String(error)));
}

async function run(terminal, context) {
    const editor = vscode.window.activeTextEditor;
    const document = editor && editor.document;
    if (vscode.env.remoteName || !vscode.workspace.isTrusted) {
        vscode.window.showInformationMessage(vscode.l10n.t('Open a trusted local folder to run its C++ programs.'));
        return;
    }
    if (!isSource(document)) {
        vscode.window.showInformationMessage(vscode.l10n.t('Open a C++ source file or type a C++ program in a new tab.'));
        return;
    }
    const source = await prepareSource(document);
    if (!source) return;
    await editorFont.ensureEditorFont(vscode, context, source.document);
    if (!await bootstrap.ensureReady()) return;
    if (containsQuestionLiteral(source.text) && !reportedQuestions.has(source.document)) {
        reportedQuestions.add(source.document);
        vscode.window.showInformationMessage(vscode.l10n.t('The source contains a string of question marks. If you expected letters there, restore or retype the text before saving it as UTF-8.'));
    }
    if (terminal) await runInTerminal(source);
    else await output.runProgram(vscode, source.path, source.text);
}

function activate(context) {
    bootstrap.initialize(vscode, context);
    editorFont.initializeEditorFont(vscode, context);
    require('./codeRunnerBridge').activate(vscode, context, () => run(false, context));
    const register = (id, command, onError = reportError) => context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
        try { return await command(); } catch (error) { onError(error); }
    }));
    register('cppstart.setup', async () => {
        if (!vscode.workspace.isTrusted || vscode.env.remoteName) {
            vscode.window.showInformationMessage(vscode.l10n.t('Open a trusted local folder to set up C++ tools.'));
            return;
        }
        await editorFont.ensureEditorFont(vscode, context, vscode.window.activeTextEditor?.document);
        if (await bootstrap.ensureReady({ explicit: true })) {
            vscode.window.showInformationMessage(vscode.l10n.t('The C++ compiler is ready. Open a .cpp file and choose Run C++ (UTF-8).'));
        }
    }, error => vscode.window.showErrorMessage(vscode.l10n.t('C++ compiler setup failed. {0}',
        error && error.message ? error.message : String(error))));
    register('cppstart.run', () => run(false, context));
    register('cppstart.runOrDebug', () => runOrDebug(context));
    register('cppstart.runTerminal', () => run(true, context));
    register('cppstart.traceIssue', () => issues.trace(vscode));
    register('cppstart.openIssueLog', () => issues.openLog(vscode));
    register('cppstart.newFile', () => createUtf8File(undefined, 'main.cpp', starter));
    register('cppstart.saveCopy', () => saveCopy(vscode.window.activeTextEditor && vscode.window.activeTextEditor.document));

    const status = vscode.window.createStatusBarItem('cppstart.runStatus', vscode.StatusBarAlignment.Left, 12);
    status.name = vscode.l10n.t('Run C++ (UTF-8)');
    status.text = '$(play) ' + vscode.l10n.t('Run C++ (UTF-8)');
    status.tooltip = vscode.l10n.t('Compile the current C++ file and show Unicode input and output');
    status.command = 'cppstart.run';
    let currentUntitled;
    function update() {
        const doc = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
        const untitled = untitledCpp(doc);
        if (untitled !== currentUntitled) {
            currentUntitled = untitled;
            void vscode.commands.executeCommand('setContext', 'cppstart.untitledCpp', untitled);
        }
        if ((process.platform === 'win32' || process.platform === 'darwin') && !vscode.env.remoteName && vscode.workspace.isTrusted && isSource(doc)) status.show();
        else status.hide();
    }
    context.subscriptions.push(status, vscode.window.onDidChangeActiveTextEditor(update),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.scheme === 'untitled') update();
        }));
    update();
}

function deactivate() { output.disposeAll(); }
module.exports = { activate, deactivate };
