'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), Module=require('module'), assert=require('assert').strict;
const root=path.resolve(__dirname,'../extension');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ভাষা-عربي-рус-'));
const uri=f=>({scheme:'file',fsPath:f});
const fromText=(text, name, options={})=>({uri: uri(path.join(temp,name)),languageId:'cpp',isDirty:false,
    getText(){return text}, save:async function(){throw Error('Unrequested save')}, ...options});
const txt='std::cout << "আমি বাংলায় লিখি। مرحبًا Привет English";';
const calls={cmd:new Map(),tasks:[],terminals:[],info:[],err:[],view:[],contexts:[]};
let selected=[],endTask,closeTerminal,menuSave,bridgeRun;
const cfg={encoding:'utf8'}, vs={env:{},StatusBarAlignment:{Left:1},Uri:{file:uri},l10n:{t:(a,...b)=>a.replace(/\{(\d+)\}/g,(matches,i)=>b[i])},
  window:{onDidChangeActiveTextEditor:()=>({dispose(){}}),onDidCloseTerminal:cb=>{closeTerminal=cb;return {dispose(){}}},createStatusBarItem:()=>({show(){},hide(){},dispose(){}}),
    showSaveDialog:async options=>{menuSave=options;return selected.shift()},
    showTextDocument:async (doc)=>{vs.window.activeTextEditor={document:doc}},
    showInformationMessage:async msg=>{calls.info.push(msg)},showErrorMessage:msg=>{calls.err.push(msg)},
    createTerminal:opts=>{const o={...opts,show(){}};calls.terminals.push(o);return o}},
  workspace:{workspaceFolders:[{uri:uri(temp)}],isTrusted:true,getConfiguration:()=>({get:(name,fallback)=>cfg[name]??fallback}),
   onDidChangeTextDocument:()=>({dispose(){}}),getWorkspaceFolder:()=>({uri:uri(temp)}),
   openTextDocument:async u=>fromText(fs.readFileSync(u.fsPath,'utf8').replace(/^\ufeff/,''),path.basename(u.fsPath))},
  commands:{registerCommand:(id,handler)=>{calls.cmd.set(id,handler);return{dispose(){}}},executeCommand:async (...args)=>{calls.contexts.push(args)}},
  tasks:{onDidEndTask:cb=>{endTask=cb;return{dispose(){}}},executeTask:async task=>{calls.tasks.push(task);return {task}}},
  Task:class {constructor(definition,scope,name,source,execution){Object.assign(this,{definition,scope,name,source,execution})}},
  ProcessExecution:class {constructor(exe,args,op){Object.assign(this,{exe,args,op})}},TaskRevealKind:{Always:1},TaskPanelKind:{Dedicated:1}};
const file=path.join(root,'extension.js'), mod = new Module(file,module);
mod.filename=file;mod.paths=module.paths;
const real=mod.require.bind(mod);
let ready=true, activations=0;
const requests=[], fonts=[];
const editorFont={ initializeEditorFont(){fonts.push('activated')},async ensureEditorFont(v,c,doc){fonts.push(doc?.uri.fsPath || 'setup')} };
const pathUtilsFile=path.join(root,'paths.js');
const pathUtils=new Module(pathUtilsFile,module);
pathUtils.filename=pathUtilsFile;pathUtils.require=n=>n==='./bootstrap'?{getTools:()=>({})}:require(n);
pathUtils._compile(fs.readFileSync(pathUtilsFile,'utf8'),pathUtilsFile);

const bootstrap={initialize:()=>{activations++},ensureReady:async options=>{requests.push(options);return ready}};
mod.require=n=>n==='vscode'?vs:n==='./bootstrap'?bootstrap:n==='./editorFont'?editorFont:n==='./issues'?{}:n==='./output'?{runProgram:(v,s,t)=>calls.view.push([s,t]),disposeAll(){}}:
 n==='./codeRunnerBridge'?{activate:(v,c,w)=>{bridgeRun=w}}:n==='./paths'?{getTools:()=>({runner:file,shell:'powershell.exe',platform:'win32'}),runnerArgs:pathUtils.exports.runnerArgs}:real(n);
mod._compile(fs.readFileSync(file,'utf8'),file);
const active=doc=>vs.window.activeTextEditor={document:doc};
async function run(id='cppstart.run'){await calls.cmd.get(id)()}
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(manifest.contributes.configurationDefaults['[cpp]']['files.encoding'],'utf8');
 assert.equal(manifest.contributes.keybindings.find(b=>b.key==='f5').command,'cppstart.runOrDebug');
 assert(manifest.contributes.keybindings[0].when.includes('untitled'));assert.equal(manifest.contributes.menus['editor/title'][0].group,'navigation@-1000');
 mod.exports.activate({subscriptions:[]});
 assert.equal(activations,1);assert.deepEqual(requests,[]);assert.deepEqual(fonts,['activated']);
 vs.workspace.isTrusted=false;await run('cppstart.setup');assert.deepEqual(requests,[]);assert.deepEqual(fonts,['activated']);
 vs.workspace.isTrusted=true;vs.env.remoteName='ssh-remote';await run('cppstart.setup');assert.deepEqual(requests,[]);assert.deepEqual(fonts,['activated']);
 vs.env.remoteName=undefined;await run('cppstart.setup');assert.equal(fonts.at(-1),'setup');assert.deepEqual(requests,[{explicit:true}]);assert(calls.info.some(m=>m.includes('compiler is ready')));
 const name='নতুন & русский.cpp',existing=path.join(temp,name);fs.writeFileSync(existing,Buffer.from([0x43,0xe9]));
 let doc=fromText(txt,name,{encoding:'windows1252',isDirty:true});
 cfg.encoding='windows1252';active(doc);
 ready=false;await run();assert.equal(calls.view.length,0);assert.equal(requests.at(-1),undefined);assert.equal(fonts.at(-1),existing);
 ready=true;await run();assert.deepEqual(calls.view.at(-1),[existing,txt]);
 assert.deepEqual(fs.readFileSync(existing),Buffer.from([0x43,0xe9]));assert(calls.info.some(m=>m.includes('windows1252')));
 await bridgeRun();assert.deepEqual(calls.view.at(-1),[existing,txt]);
 await run('cppstart.runOrDebug');assert.deepEqual(calls.view.at(-1),[existing,txt]);assert(!calls.contexts.some(x=>x[0]==='workbench.action.debug.start'));
 const beforeDebug=calls.view.length;cfg.configurations=[{type:'cppdbg',name:'Personal launch.json'}];await run('cppstart.runOrDebug');assert.equal(calls.view.length,beforeDebug);assert.equal(calls.contexts.at(-1)[0],'workbench.action.debug.start');
 cfg.configurations=[];cfg.compounds=[{name:'Custom compound'}];await run('cppstart.runOrDebug');assert.equal(calls.view.length,beforeDebug);assert.equal(calls.contexts.at(-1)[0],'workbench.action.debug.start');
 await run('cppstart.run');assert.equal(calls.view.length,beforeDebug+1);cfg.compounds=[];
 doc=fromText(txt,name,{isDirty:true,encoding:'utf8',save:async()=>false});active(doc);
 const before=calls.view.length;await run();assert.equal(calls.view.length,before);
 let substituted=txt, saved=0;
 doc=fromText(txt,name,{isDirty:true,encoding:'utf8',getText:()=>substituted,save:async()=>{saved++;substituted='????';return true}});
 active(doc);await run();assert.equal(calls.view.at(-1)[1],txt);assert.equal(saved,1);
 const untitled=fromText(txt,'Untitled-1',{uri:{scheme:'untitled',fsPath:'Untitled-1'},languageId:'plaintext',isDirty:true});
 active(untitled);let newPath=path.join(temp,'program বাংলা.cpp');const captured=calls.view.length;
 await run();assert.equal(calls.view.length,captured);selected.push(uri(newPath));await run();
 assert(menuSave.defaultUri.fsPath.endsWith('main.cpp'));assert.equal(fs.readFileSync(newPath,'utf8'),'\uFEFF'+txt);
 assert.equal(calls.view.at(-1)[0],newPath);assert.equal(calls.view.at(-1)[1],txt);assert.equal(vs.window.activeTextEditor.document.uri.fsPath,newPath);
 let oldEditorSaves=0;
 active(fromText(txt,path.basename(newPath),{isDirty:true,save:async()=>{oldEditorSaves++;return true}}));await run();
 assert.equal(oldEditorSaves,1);assert.equal(calls.view.at(-1)[1],txt);
 const new2=path.join(temp,'fresh.cpp'); selected.push(uri(newPath),uri(new2));await run('cppstart.newFile');
 assert.equal(fs.readFileSync(newPath,'utf8'),'\uFEFF'+txt);assert.match(fs.readFileSync(new2,'utf8'),/^\ufeff#include <iostream>/);
 const copy=path.join(temp,'clean কপি.cpp');active(fromText(txt,name));selected.push(uri(copy));await run('cppstart.saveCopy');assert.equal(fs.readFileSync(copy,'utf8'),'\uFEFF'+txt);
 active(fromText('std::cout << "??? ????";',name));await run();assert(calls.info.some(m=>m.includes('restore or retype')));
 active(fromText(txt,name));await run('cppstart.runTerminal');const task=calls.tasks.at(-1);
 assert.equal(fs.readFileSync(task.definition.snapshot,'utf8'),txt);assert(task.execution.args.includes(existing));assert(task.execution.args.includes('-Snapshot'));endTask({execution:{task}});await new Promise(r=>setTimeout(r,60));assert(!fs.existsSync(task.definition.snapshot));
 vs.workspace.getWorkspaceFolder=()=>undefined;await run('cppstart.runTerminal');const terminal=calls.terminals.at(-1),snap=terminal.shellArgs[terminal.shellArgs.indexOf('-Snapshot')+1];
 assert.equal(fs.readFileSync(snap,'utf8'),txt);closeTerminal(terminal);await new Promise(r=>setTimeout(r,60));assert(!fs.existsSync(snap));
 vs.workspace.isTrusted=false;const n=calls.view.length;await run();assert.equal(calls.view.length,n);
 vs.workspace.isTrusted=true;vs.env.remoteName='ssh-remote';await run();assert.equal(calls.view.length,n);
 assert.deepEqual(calls.err,[]);console.log('PASS no automatic setup on activation, trust & local checks, explicit compiler setup, first Run awaits readiness, cancellation and retry, new files, C++ plaintext untitled, legacy disk preservation, Unicode snapshot, save cancellation, explicit save copy, existing debugger config, Code Runner callback, two terminal cleanup lifetimes, restricted workspace and remote safeguards.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
