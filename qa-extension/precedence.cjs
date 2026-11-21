'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const entry=path.resolve(__dirname,'../extension/editorFont.js'),mod=new Module(entry,module);mod.filename=entry;mod.paths=module.paths;
mod.require=id=>id==='./bootstrap'?{}:require(id);
mod._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.check=setDefaultFallback;',entry);
const preference='Consolas, "Courier New", monospace',api={workspace:{workspaceFolders:[{uri:'folder-a'}, {uri:'folder-b'}]},ConfigurationTarget:{Global:1}};
(async()=>{
 for(const flag of ['globalValue','globalLanguageValue','workspaceValue','workspaceLanguageValue','workspaceFolderValue','workspaceFolderLanguageValue','policyValue','defaultLanguageValue','effective']){
  let writes=0;
  api.workspace.getConfiguration=(section,{uri,languageId})=>{assert.equal(languageId,'cpp');return {
   inspect(){return {defaultValue:preference,...uri==='folder-b'&&flag!=='effective'?{[flag]:'My Code Font'}:{}}},
   get:()=>uri==='folder-b'&&flag==='effective'?'My Code Font':preference, update(){writes++}}};
  assert.equal(await mod.exports.check(api,{uri:'file'},'Noto Sans Bengali'),false,flag);assert.equal(writes,0,flag);
 }
 let values;
 api.workspace.getConfiguration=(section,scope)=>({inspect:()=>({defaultValue:preference}),get:()=>preference,update(...args){values=args}});
 assert(await mod.exports.check(api,{uri:'file'},'Noto Sans Bengali'));
 assert.deepEqual(values,['fontFamily','Consolas, "Courier New", "Noto Sans Bengali", monospace',1,true]);
 console.log('PASS new fallback preserves inherited default families/order, adds Bengali only to [cpp], and skips all nine explicit/global/workspace/per-language/policy/multi-root override cases.');
})().catch(e=>{console.error(e);process.exitCode=1});
