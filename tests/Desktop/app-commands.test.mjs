import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAppCommands,stripAppMarkers,planAppAction,appContext} from '../../desktop/src/app-commands.mjs';

const talkKeys=[[162,'Left Ctrl'],[164,'Left Alt'],[32,'Space'],[119,'F8']];
const ctx={status:{provider:'claude',model:'sonnet',screen:false,microphone:true,key1:162,key2:164,agent:{approval:'ask',tools:['files'],workspace:'C:\\work'}},models:[{Slug:'sonnet',Name:'Claude Sonnet (latest)'},{Slug:'opus',Name:'Claude Opus (latest)'}],sound:{mode:'off',volume:.3,name:''},read:false,agentOn:false,talkKeys,chats:[{id:'a',title:'Shopping list'},{id:'b',title:'Chess help'}]};

test('parses app markers and removes them from the visible answer',()=>{
 const {text,actions}=parseAppCommands('Done, switched to Opus.\n\n[[APP {"action":"set","setting":"model","value":"opus"}]]\n[[APP {"action":"new_chat"}]]');
 assert.equal(text,'Done, switched to Opus.');
 assert.deepEqual(actions.map(a=>a.action),['set','new_chat']);
 assert.equal(parseAppCommands('[[APP {broken json}]] ok').actions.length,0);
});

test('hides a marker that is still streaming in',()=>{
 assert.equal(stripAppMarkers('Switching now.\n[[AP'),'Switching now.');
 assert.equal(stripAppMarkers('Switching now.\n[[APP {"action":"ne'),'Switching now.');
 assert.equal(stripAppMarkers('Array [[1,2]] stays'),'Array [[1,2]] stays');
});

test('plans harmless setting changes without confirmation',()=>{
 const model=planAppAction({action:'set',setting:'model',value:'opus'},ctx);
 assert.equal(model.ok,true);assert.equal(model.sensitive,false);assert.deepEqual(model.change,{type:'setting',patch:{model:'opus'}});
 assert.equal(planAppAction({action:'set',setting:'model',value:'gpt-9'},ctx).ok,false);
 const keys=planAppAction({action:'set',setting:'talk_keys',value:{key1:119,key2:0}},ctx);
 assert.equal(keys.ok,true);assert.equal(keys.label,'Talk keys → F8');
 assert.equal(planAppAction({action:'set',setting:'talk_keys',value:{key1:32,key2:0}},ctx).ok,false);
 assert.equal(planAppAction({action:'set',setting:'volume',value:2},ctx).ok,false);
 assert.deepEqual(planAppAction({action:'set',setting:'voice_volume',value:0.4},ctx).change,{type:'voice',patch:{volume:0.4}});
 assert.equal(planAppAction({action:'set',setting:'voice_volume',value:0.4},ctx).label,'Voice volume → 40%');
 assert.equal(planAppAction({action:'set',setting:'voice_volume',value:-1},ctx).ok,false);
 assert.equal(planAppAction({action:'set',setting:'sound',value:'mp3'},ctx).ok,false);
});

test('changes that widen what the agent may do need confirmation',()=>{
 assert.equal(planAppAction({action:'set',setting:'screen',value:true},ctx).sensitive,true);
 assert.equal(planAppAction({action:'set',setting:'screen',value:false},ctx).sensitive,false);
 const wakeOn=planAppAction({action:'set',setting:'wake_word',value:true},ctx);
 assert.equal(wakeOn.sensitive,true);assert.deepEqual(wakeOn.change.patch,{wakeWord:true,microphone:true});
 assert.equal(planAppAction({action:'set',setting:'wake_word',value:false},{...ctx,status:{...ctx.status,wakeWord:true}}).sensitive,false);
 assert.deepEqual(planAppAction({action:'set',setting:'speech_language',value:'de'},ctx).change,{type:'setting',patch:{speechLanguage:'de'}});
 assert.equal(planAppAction({action:'set',setting:'speech_language',value:'fr'},ctx).ok,false);
 assert.deepEqual(planAppAction({action:'set',setting:'mic_gain',value:2},ctx).change,{type:'setting',patch:{micGain:2}});
 assert.equal(planAppAction({action:'set',setting:'mic_gain',value:9},ctx).ok,false);
 assert.equal(planAppAction({action:'set',setting:'screens',value:'all'},{...ctx,status:{...ctx.status,screens:'cursor'}}).sensitive,true);
 assert.equal(planAppAction({action:'set',setting:'screens',value:'cursor'},{...ctx,status:{...ctx.status,screens:'all'}}).sensitive,false);
 assert.equal(planAppAction({action:'set',setting:'screens',value:'both'},ctx).ok,false);
 assert.equal(planAppAction({action:'set',setting:'microphone',value:true},ctx).sensitive,false,'already on');
 assert.equal(planAppAction({action:'set',setting:'agent_approval',value:'auto'},ctx).sensitive,true);
 assert.equal(planAppAction({action:'set',setting:'agent_approval',value:'ask'},{...ctx,status:{...ctx.status,agent:{...ctx.status.agent,approval:'auto'}}}).sensitive,false);
 assert.equal(planAppAction({action:'set',setting:'agent_tools',value:['files','commands']},ctx).sensitive,true);
 assert.equal(planAppAction({action:'set',setting:'agent_tools',value:[]},ctx).sensitive,false);
 const chatgpt={...ctx,status:{...ctx.status,provider:'chatgpt'}};
 assert.deepEqual(planAppAction({action:'set',setting:'agent',value:true},chatgpt).change,{type:'agent',on:true});
});

test('chat actions and unknown actions',()=>{
 assert.deepEqual(planAppAction({action:'open_chat',title:'chess'},ctx).change,{type:'open_chat',id:'b'});
 assert.equal(planAppAction({action:'open_chat',title:'taxes'},ctx).ok,false);
 assert.deepEqual(planAppAction({action:'new_chat'},ctx).change,{type:'new_chat'});
 assert.equal(planAppAction({action:'delete_everything'},ctx).ok,false);
 assert.equal(planAppAction({action:'set',setting:'agent',value:true},{...ctx,status:{...ctx.status,provider:'ollama'}}).ok,false);
});

test('app context lists state and choices for Claude and ChatGPT',()=>{
 const context=appContext({...ctx,page:'chat'});
 assert.equal(context.talk_keys.choices.F8,119);
 assert.deepEqual(context.models.map(m=>m.slug),['sonnet','opus']);
 assert.deepEqual(context.saved_chats,['Shopping list','Chess help']);
 assert.equal(context.agent.workspace_chosen,true);
});
