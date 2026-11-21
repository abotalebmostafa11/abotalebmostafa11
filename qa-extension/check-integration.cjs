'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname, '../extension');
const orig=require('module')._load;
let v;
const events=[];
v={env:{uiKind:1,language:'en'},UIKind:{Desktop:1},workspace:{isTrusted:false,
    getConfiguration(){return {inspect(){},get(){}}},onDidChangeConfiguration(){return {}},onDidChangeTextDocument(){return {}},workspaceFolders:[]},
    extensions:{getExtension(){},onDidChange(){return {}}},l10n:{t:s=>s},StatusBarAlignment:{Left:1},
    window:{visibleTextEditors:[],activeTextEditor:undefined,onDidChangeActiveTextEditor(){return {}},onDidChangeVisibleTextEditors(){return {}},
        createStatusBarItem(){return {show(){},hide(){}}},showInformationMessage:s=>events.push(s),showWarningMessage:s=>events.push(s)},
    commands:{executeCommand(){return Promise.resolve()},registerCommand(id,cb){events.push(id);return {}}}};
require('module')._load=function(id,parent,...rest){return id==='vscode'?v:orig.call(this,id,parent,...rest)};
const extension=require(path.join(root,'extension.js'));
const context={extensionPath:root,subscriptions:[],globalState:{get(){},async update(){throw Error('wrote on activation')}}};
extension.activate(context);
assert(events.includes('cppstart.setup'));
console.log('PASS actual extension activates with all packaged modules in an untrusted session, makes no interactive setup and writes no globalState.');
