'use strict';

// Keep the editor's usual Run Code controls in their original menu slots.
// A normal local C++ tab uses the UTF-8 runner. All other tabs use Code Runner.
function activate(vscode, context, runCpp) {
    const extensionId = 'formulahendry.code-runner';
    const title = 'showRunIconInEditorTitleMenu';
    const menu = 'showRunCommandInEditorContextMenu';
    const scopes = ['globalValue', 'workspaceValue', 'workspaceFolderValue'];
    const cppName = name => /\.(?:cpp|cc|cxx|cp|c\+\+|ixx|cppm)$/i.test(name) || name.endsWith('.C');
    const configuration = uri => vscode.workspace.getConfiguration('code-runner', uri);

    function visibleByDefault(config, key) {
        const setting = config.inspect(key);
        // An explicit true already shows Code Runner's original menu item.
        // An explicit false leaves the item hidden. Only replace its default.
        return setting && scopes.every(scope => setting[scope] === undefined) &&
            setting.defaultValue === false;
    }

    function customExecutor(config) {
        const entries = key => {
            const setting = config.inspect(key);
            return setting ? scopes.map(scope => setting[scope]).filter(Boolean) : [];
        };
        return entries('executorMap').some(map => Object.hasOwn(map, 'cpp')) ||
            entries('executorMapByGlob').some(map => Object.keys(map).length > 0) ||
            entries('executorMapByFileExtension').some(map => Object.keys(map).some(cppName));
    }

    function routeCpp(document, config) {
        if (!document || !['win32','darwin'].includes(process.platform) || vscode.env.remoteName || !vscode.workspace.isTrusted) return false;
        const uri = document.uri;
        const cpp = uri.scheme === 'file' ? cppName(uri.fsPath) :
            uri.scheme === 'untitled' && (document.languageId === 'cpp' ||
                (document.languageId === 'plaintext' && /#\s*include\s*[<"]|\bstd::\w+|\b(?:int|auto)\s+main\s*\(/.test(document.getText().slice(0, 65536))));
        return cpp && !customExecutor(config);
    }

    function update() {
        const editor = vscode.window.activeTextEditor;
        const document = editor && editor.document;
        const config = configuration(document && document.uri);
        const installed = !!vscode.extensions.getExtension(extensionId);
        const set = (key, value) => vscode.commands.executeCommand('setContext', key, !!value);
        return Promise.all([
            set('cppstart.codeRunnerTitle', installed && visibleByDefault(config, title)),
            set('cppstart.codeRunnerContext', installed && visibleByDefault(config, menu)),
            set('cppstart.codeRunnerShortcut', installed && routeCpp(document, config))
        ]);
    }

    const dispatch = async (...args) => {
        // VS Code supplies the editor's URI when an editor command is selected.
        const uri = args[0] && typeof args[0].scheme === 'string' ? args[0] : undefined;
        const editor = uri ? vscode.window.visibleTextEditors.find(item =>
            item.document.uri.toString() === uri.toString()) : vscode.window.activeTextEditor;
        if (!editor || !routeCpp(editor.document, configuration(editor.document.uri))) {
            return vscode.commands.executeCommand('code-runner.run', ...args);
        }
        if (editor !== vscode.window.activeTextEditor) {
            await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
            if (vscode.window.activeTextEditor?.document !== editor.document) return;
        }
        return runCpp();
    };

    context.subscriptions.push(vscode.commands.registerCommand('cppstart.runCode', dispatch),
        vscode.window.onDidChangeActiveTextEditor(update),
        vscode.extensions.onDidChange(update),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('code-runner')) void update();
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.scheme === 'untitled' && event.document === vscode.window.activeTextEditor?.document) void update();
        }));
    void update();
}

module.exports = { activate };
