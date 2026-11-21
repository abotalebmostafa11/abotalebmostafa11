'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getTools } = require('./paths');
const recent = new Map();
let lastReport;
const reportSuffix = /^[0-9T_-]{19,32}Z-[a-f0-9]{12}\.log$/;

function parseDiagnostics(text, source, snapshot, paths = path) {
    const result = [];
    // The filename may contain spaces or a Windows drive letter.
    const pattern = /^(.*?):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/;
    for (const line of text.split(/\r?\n/)) {
        const match = pattern.exec(line);
        if (!match || !match[1] || match[1].startsWith('<')) continue;
        let filename = paths.resolve(paths.dirname(source), match[1]);
        if (snapshot && filename === paths.resolve(snapshot)) filename = source;
        const row = Number(match[2]), column = Number(match[3]);
        if (row < 1 || column < 1 || !Number.isSafeInteger(row) || !Number.isSafeInteger(column)) continue;
        result.push({ filename, row, column, level: match[4], message: match[5].slice(0, 2000) });
        if (result.length >= 100) break;
    }
    return result;
}

// Clang's ordinary text diagnostics use 1-based UTF-8 byte columns. VS Code
// uses 0-based UTF-16 columns, including two positions for astral characters.
function editorColumn(text, column) {
    let units = 0, bytes = 0;
    for (const char of text) {
        const size = Buffer.byteLength(char);
        if (bytes + size > column - 1) break;
        bytes += size; units += char.length;
    }
    return units;
}

function isLocalFile(file, source, vscode) {
    const uri = vscode.Uri.file(file);
    const withinSourceFolder = path.relative(path.dirname(source), file);
    const inFolder = !path.isAbsolute(withinSourceFolder) && withinSourceFolder !== '..' && !withinSourceFolder.startsWith('..' + path.sep);
    return inFolder || !!vscode.workspace.getWorkspaceFolder(uri);
}

function record(source, kind, status, diagnostics, compilerText = '') {
    const now = new Date();
    const file = now.toISOString().replace(/[.:]/g, '_') + '-' + crypto.randomBytes(6).toString('hex') + '.log';
    const report = { source, diagnostics, stamp: now.toISOString(), kind, status, file: undefined };
    recent.delete(source);
    recent.set(source, report);
    if (recent.size > 64) recent.delete(recent.keys().next().value);
    lastReport = report;
    const summary = compilerText.split(/\r?\n/).filter(line =>
        /(?:fatal error|error|warning|note):|undefined (?:symbol|reference)|^ld(?:\.lld)?:|^[^\s].*not found/i.test(line)).slice(0, 100);
    if (!summary.length && !diagnostics.length && compilerText.trim()) summary.push(compilerText.trim().slice(0, 2000));
    const body = [report.stamp, source, kind + ' · ' + status,
        ...diagnostics.map(item => item.filename + ':' + item.row + ':' + item.column + ': ' + item.level + ': ' + item.message),
        ...summary.filter(line => !/^.*?:\d+:\d+:\s*(?:fatal error|error|warning|note):/.test(line))].join('\n').slice(0, 100000);
    report.saved = (async () => {
        const dir = getTools().logs;
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        const full = path.join(dir, file);
        await fs.promises.writeFile(full, body + '\n', { flag:'wx', mode:0o600 });
        report.file = full;
        const files = await fs.promises.readdir(dir);
        const old = files.filter(name => reportSuffix.test(name)).sort().reverse().slice(50);
        await Promise.all(old.map(name => fs.promises.unlink(path.join(dir, name)).catch(() => {})));
    })().catch(() => {});
    return report;
}

async function openLog(vscode, report = lastReport) {
    if (report) await report.saved;
    let filename = report && report.file;
    if (!filename) {
        const dir = getTools().logs;
        const list = await fs.promises.readdir(dir).catch(() => []);
        const latest = list.filter(name => reportSuffix.test(name)).sort().pop();
        if (latest) filename = path.join(dir, latest);
    }
    if (filename) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
        await vscode.window.showTextDocument(doc, { preview: true });
    } else {
        vscode.window.showInformationMessage(vscode.l10n.t('No issue log is available yet.'));
    }
}

async function trace(vscode, specific) {
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    const report = specific || recent.get(active) || lastReport;
    if (!report) return openLog(vscode);
    const items = report.diagnostics.filter(item => isLocalFile(item.filename, report.source, vscode));
    if (!items.length) return openLog(vscode, report);
    const choices = items.map(item => ({ label: (item.level.includes('error') ? '$(error) ' : item.level === 'warning' ? '$(warning) ' : '$(info) ') + item.message,
        description: path.basename(item.filename) + ':' + item.row + ':' + item.column, detail: item.filename, item }));
    const selected = choices.length === 1 ? choices[0] : await vscode.window.showQuickPick(choices, { title: vscode.l10n.t('Trace issue'), matchOnDescription: true });
    if (!selected) return;
    const item = selected.item;
    // Reuse the live (possibly dirty) document holding the original Unicode.
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(item.filename));
    const row = Math.min(item.row - 1, doc.lineCount - 1);
    const column = editorColumn(doc.lineAt(row).text, item.column);
    const position = new vscode.Position(row, column);
    const selection = new vscode.Range(position, position);
    const existing = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === doc.uri.toString());
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: existing?.viewColumn || vscode.ViewColumn.One, selection, preview: false });
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

module.exports = { parseDiagnostics, editorColumn, record, openLog, trace };
