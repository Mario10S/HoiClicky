// Claude can operate HoiClicky itself by ending a reply with markers like [[APP {"action":"new_chat"}]].
// This module parses those markers and turns each one into a checked, described change. It never applies anything.
const MARKER=/\[\[APP\s+(\{[\s\S]*?\})\s*\]\]/g;
const MAX_ACTIONS=8;
export const PROVIDERS=['claude','ollama','chatgpt'];
export const SOUND_MODES=['off','soft','bright','mp3'];
export const AGENT_TOOLS=['files','commands','desktop','web'];
export const APPROVALS=['ask','files','auto'];
const approvalRank={ask:0,files:1,auto:2};

// Remove complete markers, and hide a marker that is still streaming in at the end of the text.
export function stripAppMarkers(text){
 let out=String(text??'').replace(MARKER,'');
 const start=out.lastIndexOf('[[');
 if(start>=0){const tail=out.slice(start);if(!tail.includes(']]')&&('[[APP'.startsWith(tail)||tail.startsWith('[[APP')))out=out.slice(0,start);}
 return out.replace(/\n{3,}/g,'\n\n').trimEnd();
}

export function parseAppCommands(text){
 const actions=[];
 for(const match of String(text??'').matchAll(MARKER)){try{const action=JSON.parse(match[1]);if(action&&typeof action.action==='string')actions.push(action);}catch{}}
 return {text:stripAppMarkers(text),actions:actions.slice(0,MAX_ACTIONS)};
}

const onOff=value=>value?'on':'off';
const bool=value=>value===true||value===false;

// ctx: {status, models:[{Slug,Name}], sound:{mode,volume,name}, read, agentOn, talkKeys:[[code,name]], chats:[{id,title}]}
// Returns {ok:true,label,sensitive,change} or {ok:false,error}. "sensitive" changes widen what Claude may do and need the user's OK.
export function planAppAction(action,ctx){
 const fail=error=>({ok:false,error});
 const ok=(label,change,sensitive=false)=>({ok:true,label,change,sensitive});
 const status=ctx.status||{};
 switch(action?.action){
  case 'new_chat':return ok('Opened a new chat',{type:'new_chat'});
  case 'open':{
   if(action.page!=='settings'&&action.page!=='chat')return fail('Unknown page '+action.page+'.');
   return ok(action.page==='settings'?'Opened Settings':'Opened the chat',{type:'page',page:action.page});
  }
  case 'find_chats':{const query=String(action.query??'').slice(0,80);return ok(query?`Searched chats for “${query}”`:'Cleared the chat search',{type:'search',query});}
  case 'open_chat':{
   const wanted=String(action.title??'').trim().toLowerCase();if(!wanted)return fail('Name the chat to open.');
   const chat=(ctx.chats||[]).find(c=>c.title.toLowerCase()===wanted)||(ctx.chats||[]).find(c=>c.title.toLowerCase().includes(wanted));
   return chat?ok(`Opened “${chat.title}”`,{type:'open_chat',id:chat.id}):fail(`No saved chat matches “${action.title}”.`);
  }
  case 'stop_speaking':return ok('Stopped speaking',{type:'stop_speaking'});
  case 'set':return planSetting(String(action.setting??''),action.value,ctx,status,ok,fail);
  default:return fail('Unknown app action '+String(action?.action)+'.');
 }
}

function planSetting(setting,value,ctx,status,ok,fail){
 switch(setting){
  case 'model':{const model=(ctx.models||[]).find(m=>m.Slug===value||m.Name.toLowerCase()===String(value).toLowerCase());return model?ok('Model → '+model.Name,{type:'setting',patch:{model:model.Slug}}):fail(`Model “${value}” is not available. Choose one from the model list.`);}
  case 'provider':return PROVIDERS.includes(value)?ok('Provider → '+({claude:'Claude',ollama:'Ollama',chatgpt:'ChatGPT'})[value],{type:'setting',patch:{provider:value,model:''}}):fail('Unknown provider '+value+'.');
  case 'screen':return bool(value)?ok('Screen access '+onOff(value),{type:'setting',patch:{screen:value}},value&&!status.screen):fail('Screen needs true or false.');
  case 'screens':return value==='all'||value==='cursor'?ok(value==='all'?'Screen questions → all monitors':'Screen questions → monitor under the pointer',{type:'setting',patch:{screens:value}},value==='all'&&status.screens==='cursor'):fail('Screens must be all or cursor.');
  case 'microphone':return bool(value)?ok('Microphone '+onOff(value),{type:'setting',patch:{microphone:value}},value&&!status.microphone):fail('Microphone needs true or false.');
  case 'speak_answers':return bool(value)?ok('Speak answers '+onOff(value),{type:'read',on:value}):fail('Speak answers needs true or false.');
  case 'talk_keys':{
   const codes=(ctx.talkKeys||[]).map(([code])=>code),name=code=>(ctx.talkKeys||[]).find(([c])=>c===code)?.[1];
   const key1=Number(value?.key1),key2=Number(value?.key2??0);
   if(!codes.includes(key1)||(key2!==0&&!codes.includes(key2))||key1===key2)return fail('Choose supported talk keys: two different keys, or one key with key2 = 0.');
   if(key2===0&&key1===32)return fail('Space cannot be the only talk key.');
   return ok('Talk keys → '+(key2?name(key1)+' + '+name(key2):name(key1)),{type:'setting',patch:{key1,key2}});
  }
  case 'sound':{if(!SOUND_MODES.includes(value))return fail('Sound must be off, soft, bright or mp3.');if(value==='mp3'&&!ctx.sound?.name)return fail('No custom MP3 is chosen yet. Pick one in Settings first.');return ok('Completion sound → '+value,{type:'sound',patch:{mode:value}});}
  case 'volume':{const volume=Number(value);return Number.isFinite(volume)&&volume>=0&&volume<=1?ok('Volume → '+Math.round(volume*100)+'%',{type:'sound',patch:{volume}}):fail('Volume must be between 0 and 1.');}
  case 'agent':{
   if(!bool(value))return fail('Agent needs true or false.');
   if(value&&status.provider!=='claude')return fail('Agent mode needs Claude as the provider.');
   return ok('Agent mode '+onOff(value),{type:'agent',on:value});
  }
  case 'agent_approval':{
   if(!APPROVALS.includes(value))return fail('Approval must be ask, files or auto.');
   const label={ask:'ask before every change',files:'workspace files freely',auto:'autonomous'}[value];
   return ok('Agent approvals → '+label,{type:'setting',patch:{agent:{approval:value}}},approvalRank[value]>approvalRank[status.agent?.approval||'ask']);
  }
  case 'agent_tools':{
   if(!Array.isArray(value)||value.some(t=>!AGENT_TOOLS.includes(t)))return fail('Agent tools must be a list of files, commands, desktop and web.');
   const current=status.agent?.tools||[],tools=[...new Set(value)];
   return ok('Agent tools → '+(tools.join(', ')||'none'),{type:'setting',patch:{agent:{tools}}},tools.some(t=>!current.includes(t)));
  }
  default:return fail('Unknown setting '+setting+'.');
 }
}

// What Claude is told about the app: the current state and the choices it may use.
export function appContext(ctx){
 const s=ctx.status||{};
 return {
  page:ctx.page,provider:s.provider,model:s.model,models:(ctx.models||[]).slice(0,30).map(m=>({slug:m.Slug,name:m.Name})),
  screen:!!s.screen,screens:s.screens||'all',microphone:!!s.microphone,speak_answers:!!ctx.read,
  talk_keys:{key1:s.key1,key2:s.key2??0,choices:Object.fromEntries((ctx.talkKeys||[]).map(([code,name])=>[name,code]))},
  sound:{mode:ctx.sound?.mode,volume:ctx.sound?.volume,custom_mp3:!!ctx.sound?.name},
  agent:{on:!!ctx.agentOn,approval:s.agent?.approval,tools:s.agent?.tools,workspace_chosen:!!s.agent?.workspace},
  saved_chats:(ctx.chats||[]).slice(0,15).map(c=>c.title.slice(0,60)),
 };
}
