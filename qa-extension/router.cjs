'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const manifest = require('../extension/package.json');
const moduleRecord = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../extension/codeRunnerBridge'), 'utf8'),
  { module: moduleRecord, process: { platform: 'win32' } });
const commands = new Map(), contexts = new Map(), state = {}, calls = [];
const event = () => ({dispose() {}});
function document(name,lang='cpp',scheme='file') {
  return { languageId:lang,uri:{scheme,fsPath:name,toString(){return scheme+':'+name;}}, getText(){return 'int main() {}';} };
}
const vscode = {
  env:{}, extensions:{getExtension:() => installed,onDidChange:event},
  commands:{registerCommand(id,fn){ commands.set(id,fn);return event();},
    async executeCommand(id,...args) {
      if(id === 'setContext') contexts.set(args[0],args[1]);
      else calls.push([id,...args]);
    }},
  workspace:{isTrusted:true,onDidChangeTextDocument:event,onDidChangeConfiguration(fn){refresh=()=>fn({affectsConfiguration:()=>true});return event();},
    getConfiguration(){return {inspect(k){return {defaultValue:manifest.contributes.configurationDefaults['code-runner.'+k],...state[k]};}};}},
  window:{onDidChangeActiveTextEditor:event,async showTextDocument(doc) {
    this.activeTextEditor=this.visibleTextEditors.find(item=>item.document===doc);
  },visibleTextEditors:[]}
};
let refresh, installed=true, runs=0;
const correct = {document:document('D:/বাংলা & $() (school)/আরবি.cpp')};
const py = {document:document('D:/code.py','python')};
vscode.window.visibleTextEditors=[correct,py];vscode.window.activeTextEditor=correct;
moduleRecord.exports.activate(vscode,{subscriptions:[]},() => ++runs);
const dispatch=commands.get('cppstart.runCode');
(async()=>{
 assert.equal(contexts.get('cppstart.codeRunnerTitle'),true);
 assert.equal(contexts.get('cppstart.codeRunnerContext'),true);
 await dispatch(correct.document.uri);assert.equal(runs,1);
 vscode.window.activeTextEditor=py;
 await dispatch(correct.document.uri);assert.equal(runs,2);assert.equal(vscode.window.activeTextEditor,correct);
 await dispatch(py.document.uri);assert.equal(calls.at(-1)[0],'code-runner.run');assert.equal(calls.at(-1)[1],py.document.uri);assert.equal(runs,2);
 state.executorMap={workspaceFolderValue:{cpp:'custom compiler'}};await dispatch(correct.document.uri);
 assert.equal(calls.at(-1)[1],correct.document.uri);assert.equal(runs,2);
 state.executorMap={globalValue:{python:'other python'}};await dispatch(correct.document.uri);assert.equal(runs,3);
 state.showRunIconInEditorTitleMenu={workspaceValue:false};refresh();assert.equal(contexts.get('cppstart.codeRunnerTitle'),false);
 state.showRunIconInEditorTitleMenu={globalValue:true};refresh();assert.equal(contexts.get('cppstart.codeRunnerTitle'),false);
 delete state.showRunIconInEditorTitleMenu;installed=false;refresh();assert.equal(contexts.get('cppstart.codeRunnerTitle'),false);
 installed=true;vscode.env.remoteName='ssh-remote';await dispatch(correct.document.uri);assert.equal(runs,3);
 vscode.env.remoteName=undefined;vscode.workspace.isTrusted=false;await dispatch(correct.document.uri);assert.equal(runs,3);
 console.log('PASS default toolbar + right click, Unicode source, other-language forwarding, split editor, preserving custom executor and explicit visibility, disabled extension, remote and trust checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
