import {parseMarkdown,inlineTokens} from './markdown.mjs';
import {playCompletion} from './completion-audio.mjs';
import {parseAppCommands,stripAppMarkers,planAppAction,appContext} from './app-commands.mjs';
import {speechText} from './speech-text.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Trash2,ArrowLeft,ArrowUp,AudioLines,Check,ChevronDown,Command,Eye,MessageSquare,Mic,Minus,Monitor,Plus,Settings,Shield,Square,Volume2,X,Sparkles,Pin,PinOff,Minimize2,Copy,ExternalLink,Bot,MousePointer2,Terminal,Globe,FileText,FolderOpen,RefreshCw,Search,ChevronRight} from 'lucide-react';
import './style.css';
const api=window.hoi;
class StartupBoundary extends React.Component {
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error:error.message};}
 render(){return this.state.error?<div style={{padding:40,color:'#eee',fontFamily:'Segoe UI'}}><h2>HoiClicky could not open</h2><p>{this.state.error}</p><p>Close HoiClicky and restart with npm start.</p></div>:this.props.children;}
}
const talkKeys=[[162,'Left Ctrl'],[163,'Right Ctrl'],[164,'Left Alt'],[165,'Right Alt'],[160,'Left Shift'],[161,'Right Shift'],[20,'Caps Lock'],[32,'Space'],[118,'F7'],[119,'F8'],[120,'F9'],[121,'F10']];
const keyName=value=>talkKeys.find(([key])=>key===value)?.[1]||'Choose key';
const talkLabel=(key1,key2)=>key2?keyName(key1)+' + '+keyName(key2):keyName(key1);
const onIsland=new URLSearchParams(location.search).has('island');
// Providers that can run agent mode and app control.
const agentProviders=['claude','chatgpt'];
// Spoken-answer volume from the saved voice settings, 0..1 (default full).
const voiceVolume=config=>Math.min(1,Math.max(0,Number.isFinite(Number(config?.volume))?Number(config.volume):1));
const agentGroups=[['files','Files in the workspace','Read, create and edit files in the workspace folder.'],['commands','Commands','Run PowerShell and terminal commands.'],['desktop','Mouse and keyboard','Look at the screen, click, type and press keys in other apps.'],['web','Web','Search the web and read pages.']];
const approvalModes=[['ask','Ask before every change'],['files','Workspace files freely, ask for the rest'],['auto','Autonomous, never ask']];
function approvalIcon(tool){return tool==='app'?<Settings size={16}/>:tool.startsWith('mcp__desktop__')?<MousePointer2 size={16}/>:/^(Bash|PowerShell)$/.test(tool)?<Terminal size={16}/>:/^Web/.test(tool)?<Globe size={16}/>:<FileText size={16}/>;}
// One pending agent action. Enter allows, Escape denies; the same card appears in the chat and in the floating panel.
function ApprovalCard({item}){
 const [open,setOpen]=useState(false),[sending,setSending]=useState(false),ref=useRef(null);
 useEffect(()=>{ref.current?.focus({preventScroll:true});},[]);
 const answer=allow=>{if(sending)return;setSending(true);api.approve({id:item.id,allow}).catch(()=>setSending(false));};
 return <div className="approval" ref={ref} tabIndex={-1} role="alertdialog" aria-label={'The assistant wants to: '+item.title} onKeyDown={e=>{if(e.target.tagName==='BUTTON'&&e.key==='Enter')return;if(e.key==='Enter'){e.preventDefault();answer(true);}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();answer(false);}}}>
  <div className="approval-head"><span className="approval-icon">{approvalIcon(item.tool)}</span><div className="approval-text"><span className="approval-kicker">The assistant wants to</span><strong>{item.title}</strong></div></div>
  {item.detail&&<button className="approval-more" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Hide details':'Show details'}</button>}
  {open&&<pre className="approval-detail">{item.detail}</pre>}
  <div className="approval-actions"><button className="approval-deny" disabled={sending} onClick={()=>answer(false)}>Deny</button><button className="approval-allow" disabled={sending} onClick={()=>answer(true)}>Allow</button></div>
 </div>;
}

// Settings building blocks: one look for every row, switch, choice and slider.
function SettingsGroup({title,description,children}){return <section className="group"><div className="group-head"><h2>{title}</h2>{description&&<p>{description}</p>}</div>{children&&<div className="group-body">{children}</div>}</section>;}
function SettingRow({title,description,status,children}){return <div className="row"><div className="row-text"><span className="row-title">{status&&<span className={'row-dot '+status} aria-hidden="true"/>}{title}</span>{description&&<span className="row-desc">{description}</span>}</div><div className="row-control">{children}</div></div>;}
function Toggle({checked,onChange,disabled,label}){return <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} className={'toggle'+(checked?' on':'')} onClick={()=>onChange(!checked)}><span className="toggle-knob"/></button>;}
function Segmented({value,onChange,options,label,disabled}){return <div className="segmented" role="radiogroup" aria-label={label}>{options.map(([key,text])=><button type="button" key={key} role="radio" aria-checked={value===key} disabled={disabled} className={value===key?'active':''} onClick={()=>onChange(key)}>{text}</button>)}</div>;}
function Range({value,onChange,label}){return <span className="range"><input type="range" aria-label={label} min="0" max="1" step="0.05" value={value} onChange={e=>onChange(Number(e.target.value))} style={{'--fill':Math.round(value*100)+'%'}}/><output>{Math.round(value*100)}%</output></span>;}
// Theme: "system" follows Windows; the floating panel always stays dark glass.
function useTheme(){
 const [theme,setThemeState]=useState(()=>{try{return localStorage.getItem('hoi.theme')||'system';}catch{return 'system';}});
 useEffect(()=>{if(onIsland)return;const media=matchMedia('(prefers-color-scheme: light)');const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'light':'dark'):theme;};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
 return [theme,value=>{setThemeState(value);try{localStorage.setItem('hoi.theme',value);}catch{}}];
}

function App(){
 const [status,setStatus]=useState({provider:'ollama',connected:false,screen:true,screens:'all',microphone:false,model:'',key1:162,key2:164,claude:{installed:false,loggedIn:false,account:null},agent:{approval:'ask',tools:['files','commands','desktop','web'],workspace:null}}),[models,setModels]=useState([]),[page,setPage]=useState('chat'),[question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[phase,setPhase]=useState('Ready when you are'),[busy,setBusy]=useState(false),[listening,setListening]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState(''),[read,setRead]=useState(true);
 const [theme,setTheme]=useTheme(),[settingsTab,setSettingsTab]=useState('general'),[voiceDownloading,setVoiceDownloading]=useState(false);
 const [chats,setChats]=useState([]),[chatId,setChatId]=useState(()=>crypto.randomUUID()),[historyReady,setHistoryReady]=useState(false),[chatSearch,setChatSearch]=useState('');
 useEffect(()=>{if(onIsland)return;api.history('list').then(items=>{setChats(items);if(items[0]){setChatId(items[0].id);setMessages(items[0].messages);}setHistoryReady(true);}).catch(e=>setError('Could not load local chats: '+e.message));},[]);
 async function persistChat(){if(!historyReady||!messages.length)return;const saved=await api.history('save',{id:chatId,messages});setChats(items=>[saved,...items.filter(c=>c.id!==saved.id)]);}
 useEffect(()=>{if(onIsland||!historyReady||!messages.length)return;const timer=setTimeout(()=>{persistChat().catch(e=>setError('Could not save chat: '+e.message));},busy?2000:400);return()=>clearTimeout(timer);},[messages,chatId,historyReady,busy]);
 async function openChat(chat){if(busy||listening||voiceRef.current)return;try{await persistChat();setChatId(chat.id);setMessages(chat.messages);setQuestion('');setError('');setPage('chat');speechSynthesis.cancel();}catch(e){setError(e.message);}}
 async function newChat(){if(busy||listening||voiceRef.current)return;try{await persistChat();setChatId(crypto.randomUUID());setMessages([]);setQuestion('');setError('');setPage('chat');speechSynthesis.cancel();}catch(e){setError(e.message);}}
 async function deleteChat(chat){if(busy||listening||voiceRef.current)return;try{if(await api.history('remove',{id:chat.id})){setChats(items=>items.filter(c=>c.id!==chat.id));if(chat.id===chatId){setMessages([]);setChatId(crypto.randomUUID());}}}catch(e){setError(e.message);}}
 const [sound,setSound]=useState({mode:'off',volume:.35,name:''}),[soundError,setSoundError]=useState('');
 useEffect(()=>{if(!onIsland)api.sound('get').then(setSound).catch(e=>setSoundError(e.message));},[]);
 async function saveSound(patch){try{setSound(await api.sound('save',{...sound,...patch}));setSoundError('');}catch(e){setSoundError(e.message);}}
 const [voiceConfig,setVoiceConfig]=useState(()=>{try{return JSON.parse(localStorage.getItem('voiceConfig'))||{provider:'piper',voiceId:'de_DE-thorsten-high'};}catch{return {provider:'piper',voiceId:'de_DE-thorsten-high'};}}),[voiceVoices,setVoiceVoices]=useState([]),[voiceKeyState,setVoiceKeyState]=useState(''),[voiceKey,setVoiceKey]=useState(''),[voiceError,setVoiceError]=useState('');const speechAudio=useRef(null);
 useEffect(()=>{localStorage.setItem('voiceConfig',JSON.stringify(voiceConfig));},[voiceConfig]);useEffect(()=>{if(!onIsland)api.ttsKey().then(setVoiceKeyState).catch(()=>{});},[]);
 function stopSpeech(){speechSynthesis.cancel();speechAudio.current?.pause();speechAudio.current=null;}
 async function speakAnswer(text){stopSpeech();setPhase('Speaking');try{if(voiceConfig.provider==='elevenlabs'){const data=await api.ttsSpeak({text,voiceId:voiceConfig.voiceId});const audio=new Audio('data:audio/mpeg;base64,'+data);audio.volume=voiceVolume(voiceConfig);speechAudio.current=audio;audio.onended=()=>setPhase('Answered');await audio.play();}else if(voiceConfig.provider==='piper'){const data=await api.piperSpeak({text,voice:voiceConfig.voiceId||'de_DE-thorsten-high'});const audio=new Audio('data:audio/wav;base64,'+data);audio.volume=voiceVolume(voiceConfig);speechAudio.current=audio;audio.onended=()=>setPhase('Answered');await audio.play();}else{const utterance=new SpeechSynthesisUtterance(text);utterance.volume=voiceVolume(voiceConfig);utterance.onend=utterance.onerror=()=>setPhase('Answered');speechSynthesis.speak(utterance);}}catch(e){setVoiceError(e.message);setPhase('Answered');}}
 async function loadVoiceOptions(){try{const voices=await api.ttsVoices();setVoiceVoices(voices);setVoiceConfig(c=>({...c,voiceId:c.voiceId||voices[0]?.id||''}));setVoiceError('');}catch(e){setVoiceError(e.message);}}

 const [approvals,setApprovals]=useState([]),[agentRunning,setAgentRunning]=useState(false),[agentOn,setAgentOnState]=useState(()=>{try{return localStorage.getItem('hoi.agent')==='1';}catch{return false;}});
 const setAgentOn=value=>{setAgentOnState(value);try{localStorage.setItem('hoi.agent',value?'1':'0');}catch{}};
 const autoVoice=useRef(false),voiceFailed=useRef(false),sendRef=useRef(null),sending=useRef(false);
 const transcript=useRef(''),voiceRef=useRef(false),end=useRef(null);
 async function refresh(){const s=await api.status();setStatus(s);if(s.provider==='ollama'||(s.provider==='chatgpt'&&s.connected)||(s.provider==='claude'&&s.claude?.loggedIn)){const m=await api.models();setModels(m);setStatus(v=>({...v,model:m.some(x=>x.Slug===v.model)?v.model:m[0]?.Slug||''}));}}
 useEffect(()=>{if(!onIsland)refresh().catch(e=>setError(e.message));return api.events(event=>{
  if(event.eventName==='hold'){if(event.value){autoVoice.current=true;voiceFailed.current=false;transcript.current='';setQuestion('');voiceRef.current=true;setListening(true);setPhase('Opening microphone');}else {setListening(false);setPhase('Transcribing');}}
  if(event.eventName==='captured')setPhase('Thinking');
  if(event.eventName==='answer')setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:stripAppMarkers(event.value)}:x));
  if(event.eventName==='error')setError(event.value);
  if(event.eventName==='islandAsk'&&!onIsland)sendRef.current?.(event.text);
  if(event.eventName==='approval')setApprovals(items=>items.some(a=>a.id===event.id)?items:[...items,event]);
  if(event.eventName==='approvalDone')setApprovals(items=>items.filter(a=>a.id!==event.id));
  if(event.eventName==='toggleVoice'&&!onIsland)document.getElementById('voice')?.click();
  if(event.eventName==='voice'){
   if(event.kind==='loading')setPhase(event.value);
   if(event.kind==='ready'){setPhase('Listening');setListening(true);}
   if(event.kind==='level')setLevel(Number(event.value));
   if(event.kind==='complete'){voiceRef.current=false;setListening(false);setLevel(0);setPhase('Ready');if(!onIsland&&autoVoice.current){autoVoice.current=false;if(!voiceFailed.current&&transcript.current.trim())sendRef.current?.(transcript.current.trim());}}
   if(event.kind==='text'){transcript.current+=(transcript.current?' ':'')+event.value;setQuestion(transcript.current);}
   if(event.kind==='partial')setQuestion(transcript.current+' '+event.value);
   if(event.kind==='error'){voiceFailed.current=true;setError(event.value);setListening(false);}
  }
 });},[]);
 useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[messages]);
 async function setting(patch){const next={...status,...patch};setStatus(next);try{await api.settings({screen:next.screen,microphone:next.microphone,model:next.model||'',key1:next.key1,key2:next.key2,provider:next.provider,screens:next.screens||'all',agentApproval:next.agent?.approval||'ask',agentTools:next.agent?.tools||[],...(typeof next.agent?.workspace==='string'?{workspace:next.agent.workspace}:{})});}catch(e){setError(e.message);}}
 async function voice(){if(voiceRef.current){await api.voiceStop();return;}if(!status.microphone){setError('Enable microphone access in Settings first.');setPage('settings');return;}transcript.current='';setError('');setListening(true);voiceRef.current=true;setPhase('Opening microphone');try{await api.voice();setQuestion(transcript.current);}catch(e){setError(e.message);}finally{voiceRef.current=false;setListening(false);setLevel(0);setPhase('Ready');if(!onIsland&&autoVoice.current){autoVoice.current=false;if(!voiceFailed.current&&transcript.current.trim())sendRef.current?.(transcript.current.trim());}}}
 async function send(voiceText,opts={}){const isVoice=typeof voiceText==='string';const agent=opts.agent??(agentOn&&agentProviders.includes(status.provider));let retry=null;const text=(isVoice?voiceText:question).trim();if(!text||sending.current||(!isVoice&&listening))return;if(!historyReady){setError('Local chat history is still loading. Try again in a moment.');return;}if(status.provider==='chatgpt'&&!status.connected){setError('Connect ChatGPT in Settings to send a question.');setQuestion(text);return;}if(status.provider==='claude'&&!status.claude?.loggedIn){setError('Sign in with Claude in Settings to send a question.');setQuestion(text);return;}if(!status.model){setError('Choose a model first.');setQuestion(text);return;}stopSpeech();sending.current=true;setQuestion('');setBusy(true);setError('');setPhase('Thinking');setMessages(m=>opts.retry?[...m,{role:'hoi',text:''}]:[...m,{role:'you',text},{role:'hoi',text:''}]);setAgentRunning(agent);try{await api.settings({screen:status.screen,microphone:status.microphone,model:status.model,key1:status.key1,key2:status.key2,provider:status.provider});setPhase(status.screen?'Looking at your screen':'Thinking');const answer=await api.ask({question:text,model:status.model,screen:status.screen,agent,app:agentProviders.includes(status.provider)?appContext({page,status,models,sound,read,agentOn,talkKeys,chats,voiceVolume:voiceVolume(voiceConfig)}):undefined,history:messages.filter(m=>m.text.trim()).slice(-12).map(m=>({role:m.role==='you'?'user':'assistant',text:m.text}))});if(!agent&&status.provider==='claude'&&answer.trim()==='[[AGENT_MODE]]'){setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:'_Agent mode is on because you asked for it._'}:x));setPhase('Answered');setAgentOn(true);retry=text;return;}
 const {text:clean,actions}=parseAppCommands(answer);if(actions.length&&agentProviders.includes(status.provider))setPendingActions(actions);
 setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:clean}:x));setPhase('Answered');playCompletion(api,sound).catch(e=>setSoundError('Could not play completion sound: '+e.message));if(read){const spoken=speechText(clean);if(spoken)speakAnswer(spoken);}}catch(e){setError(e.message);setPhase('Request stopped');}finally{sending.current=false;setBusy(false);setAgentRunning(false);if(retry)setTimeout(()=>sendRef.current?.(retry,{agent:true,retry:true}),0);}}
 sendRef.current=send;
 // App actions Claude requested run after the answer is in, so chat switching and saving see the final messages.
 const [pendingActions,setPendingActions]=useState(null);
 useEffect(()=>{if(onIsland||busy||!pendingActions)return;const actions=pendingActions;setPendingActions(null);runAppActions(actions).catch(e=>setError(e.message));},[pendingActions,busy]);
 async function runAppActions(actions){
  const ctx={status,models,sound,read,agentOn,talkKeys,chats};const done=[],problems=[];let patch=null,soundPatch=null,last=null;
  for(const action of actions){
   const plan=planAppAction(action,ctx);if(!plan.ok){problems.push(plan.error);continue;}
   if(plan.sensitive){let allowed=false;try{allowed=await api.confirmAction({title:plan.label,detail:'Claude asked for this HoiClicky change because you requested it. It gives Claude more access.'});}catch(e){problems.push(e.message);continue;}if(!allowed){problems.push(plan.label+' · declined');continue;}}
   const change=plan.change;
   if(change.type==='setting')patch={...(patch||{}),...change.patch,...(change.patch.agent?{agent:{...status.agent,...(patch?.agent||{}),...change.patch.agent}}:{})};
   else if(change.type==='sound')soundPatch={...(soundPatch||{}),...change.patch};
   else if(change.type==='voice'){setVoiceConfig(c=>({...c,...change.patch}));if(speechAudio.current&&'volume' in change.patch)speechAudio.current.volume=change.patch.volume;}
   else if(change.type==='read')setRead(change.on);
   else if(change.type==='agent')setAgentOn(change.on);
   else if(change.type==='stop_speaking')speechSynthesis.cancel();
   else if(change.type==='search')setChatSearch(change.query);
   else if(change.type==='page'){setPage(change.page);api.window('open').catch(()=>{});}
   else last=change;
   done.push(plan.label);
  }
  if(patch){await setting(patch);if('provider' in patch)await refresh().catch(e=>setError(e.message));}
  if(soundPatch)await saveSound(soundPatch);
  const summary=[done.length?'_Done: '+done.join(' · ')+'_':'',problems.length?'_Could not do: '+problems.join(' · ')+'_':''].filter(Boolean).join('\n\n');
  const updated=summary?messages.map((x,i)=>i===messages.length-1&&x.role==='hoi'?{...x,text:(x.text?x.text+'\n\n':'')+summary}:x):messages;
  setMessages(updated);setPhase(done.length?done.at(-1):'Ready when you are');
  if(!last)return;
  // Save the finished conversation, including the summary, before switching away from it.
  if(updated.length){const saved=await api.history('save',{id:chatId,messages:updated});setChats(items=>[saved,...items.filter(c=>c.id!==saved.id)]);}
  speechSynthesis.cancel();setQuestion('');setError('');setPage('chat');
  if(last.type==='new_chat'){setChatId(crypto.randomUUID());setMessages([]);}
  else{const chat=chats.find(c=>c.id===last.id);if(chat){setChatId(chat.id);setMessages(chat.messages);}}
 }
 const lastAnswer=messages.filter(m=>m.role==='hoi').at(-1)?.text||'';
 useEffect(()=>{if(!onIsland)api.presentation({phase,answer:listening||/transcrib|opening microphone|loading local/i.test(phase)?'':lastAnswer,question:messages.filter(m=>m.role==='you').at(-1)?.text||'',model:models.find(m=>m.Slug===status.model)?.Name||'',talk:talkLabel(status.key1,status.key2),busy,listening,error}).catch(()=>{});},[phase,lastAnswer,busy,listening,error,messages,models,status.model,status.key1,status.key2]);

 if(onIsland)return <FloatingAssistant phase={phase} level={level}/>;
 const locked=busy||listening||voiceRef.current;
 const talk=talkLabel(status.key1,status.key2);
 const modelName=models.find(m=>m.Slug===status.model)?.Name||'No model chosen';
 const voiceName=voiceConfig.provider==='piper'?(voiceConfig.voiceId==='en_US-lessac-medium'?'Lessac':'Thorsten'):voiceConfig.provider==='elevenlabs'?'ElevenLabs':'Windows voice';
 const openSettings=tab=>{setSettingsTab(tab);setPage('settings');};
 const currentChat=chats.find(c=>c.id===chatId);
 const visibleChats=chats.filter(c=>(c.title+' '+c.messages.map(m=>m.text).join(' ')).toLowerCase().includes(chatSearch.toLowerCase()));
 const glance=[
  {key:'model',icon:<Sparkles size={14}/>,label:modelName,tab:'ai',state:status.model?'on':'warn'},
  {key:'screen',icon:<Monitor size={14}/>,label:status.screen?(status.screens==='cursor'?'One monitor':'All monitors'):'Screen off',tab:'privacy',state:status.screen?'on':'off'},
  {key:'mic',icon:<Mic size={14}/>,label:status.microphone?'Mic on · '+talk:'Mic off',tab:'privacy',state:status.microphone?'on':'off'},
  {key:'voice',icon:<Volume2 size={14}/>,label:read?voiceName+' · '+Math.round(voiceVolume(voiceConfig)*100)+'%':'Voice off',tab:'voice',state:read?'on':'off'},
  ...(agentProviders.includes(status.provider)?[{key:'agent',icon:<Bot size={14}/>,label:agentOn?'Agent on · '+({ask:'asks first',files:'files free',auto:'autonomous'})[status.agent?.approval||'ask']:'Agent off',tab:'agent',state:agentOn?(status.agent?.approval==='auto'?'warn':'on'):'off'}]:[]),
 ];
 const tabs=[['general','General',<Settings size={16}/>],['ai','AI & accounts',<Sparkles size={16}/>],['voice','Voice',<Volume2 size={16}/>],['agent','Agent',<Bot size={16}/>],['privacy','Privacy',<Shield size={16}/>]];
 const tabLabel=tabs.find(t=>t[0]===settingsTab)?.[1];

 const claudeAction=async()=>{if(status.claude.loggedIn&&!confirm('Sign out of Claude? This also signs out Claude Code on this PC.'))return;setBusy(true);setError('');setPhase(status.claude.loggedIn?'Signing out of Claude':'Finish signing in with Claude in your browser');try{status.claude.loggedIn?await api.claudeDisconnect():await api.claudeConnect();await refresh();setPhase('Ready when you are');}catch(e){setError(e.message);setPhase('Ready when you are');}finally{setBusy(false);}};
 const chatgptAction=async()=>{setBusy(true);setError('');try{status.connected?await api.disconnect():await api.connect();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}};

 const settingsBody={
  general:<>
   <SettingsGroup title="Appearance" description="HoiClicky follows Windows unless you pick a theme.">
    <SettingRow title="Theme"><Segmented label="Theme" value={theme} onChange={setTheme} options={[['system','System'],['dark','Dark'],['light','Light']]}/></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Hold to talk" description="Hold the key while you speak and release it to send. Set Key 2 to None for a single key; one you rarely type with, like F8 or Right Ctrl, works best.">
    {['key1','key2'].map((field,index)=><SettingRow key={field} title={'Key '+(index+1)}><select aria-label={'Talk key '+(index+1)} disabled={locked} value={status[field]??(index===0?162:164)} onChange={e=>setting({[field]:Number(e.target.value)})}>{index===1&&<option value={0} disabled={status.key1===32}>None · single key</option>}{talkKeys.map(([value,name])=><option key={value} value={value} disabled={value===status[index===0?'key2':'key1']||(index===0&&value===32&&!status.key2)}>{name}</option>)}</select></SettingRow>)}
   </SettingsGroup>
   <SettingsGroup title="Completion sound" description="A short sound when an answer is ready, also while HoiClicky is in the background.">
    <SettingRow title="Sound"><select aria-label="Completion sound" value={sound.mode} onChange={e=>saveSound({mode:e.target.value})}><option value="off">Off</option><option value="soft">Soft chime</option><option value="bright">Bright chime</option><option value="mp3" disabled={!sound.name}>Custom MP3</option></select></SettingRow>
    <SettingRow title="Volume"><Range label="Completion volume" value={sound.volume} onChange={volume=>saveSound({volume})}/></SettingRow>
    <SettingRow title="Custom sound" description={sound.name||'Use any MP3 from your PC.'}><div className="row-actions"><button className="btn" onClick={async()=>{try{setSound(await api.sound('pick'));setSoundError('');}catch(e){setSoundError(e.message);}}}>Choose MP3…</button><button className="btn" disabled={sound.mode==='off'} onClick={()=>playCompletion(api,sound).catch(e=>setSoundError(e.message))}><Volume2 size={14}/>Preview</button></div></SettingRow>
    {soundError&&<p className="field-error" role="alert">{soundError}</p>}
   </SettingsGroup>
  </>,
  ai:<>
   <SettingsGroup title="Where answers run" description="Local models are free and need no account. Cloud providers use your own account and its limits.">
    <SettingRow title="Provider"><select aria-label="AI provider" value={status.provider||'ollama'} disabled={locked} onChange={async e=>{const provider=e.target.value;setModels([]);setError('');await setting({provider,model:''});try{await refresh();}catch(error){setError(error.message);}}}><option value="ollama">Ollama · on this PC</option><option value="chatgpt">ChatGPT · your account</option><option value="claude">Claude · via Claude Code</option></select></SettingRow>
    <SettingRow title="Model" description={status.provider==='ollama'?'Start Ollama and install a model, then refresh. Screen questions need a vision model.':'Models available to your account.'}><div className="row-actions"><select aria-label="Model" disabled={locked} value={status.model||''} onChange={e=>setting({model:e.target.value})}><option value="" disabled>Choose a model</option>{models.map(m=><option key={m.Slug} value={m.Slug}>{m.Name}</option>)}</select><button className="btn icon-btn" aria-label="Refresh models" title="Refresh models" disabled={busy} onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}><RefreshCw size={15}/></button></div></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Claude" description="HoiClicky uses your own Claude Code sign-in and never sees your password or tokens.">
    <SettingRow title={!status.claude?.installed?'Claude Code is not installed':status.claude.loggedIn?'Signed in':'Not signed in'} description={!status.claude?.installed?'Install Claude Code, then sign in here.':status.claude.loggedIn?status.claude.account+'. Usage counts toward your Claude plan.':'Sign in with your Claude plan in the browser.'} status={status.claude?.loggedIn?'on':'off'}>
     {!status.claude?.installed?<button className="btn" onClick={()=>api.openLink('https://claude.com/claude-code').catch(e=>setError(e.message))}><ExternalLink size={14}/>Get Claude Code</button>:status.claude.loggedIn?<button className="btn btn-danger" disabled={busy} onClick={claudeAction}>Sign out</button>:<button className="btn btn-primary" disabled={busy} onClick={claudeAction}>Sign in with Claude</button>}
    </SettingRow>
   </SettingsGroup>
   <SettingsGroup title="ChatGPT" description="Optional. Uses OpenAI's official Sign in with ChatGPT; plan limits apply.">
    <SettingRow title={status.connected?'Connected':'Not connected'} description={status.connected?status.account:'Connect your ChatGPT plan to use its models.'} status={status.connected?'on':'off'}>
     {status.connected?<button className="btn btn-danger" disabled={busy} onClick={chatgptAction}>Disconnect</button>:<button className="btn btn-primary" disabled={busy} onClick={chatgptAction}>Continue with ChatGPT</button>}
    </SettingRow>
   </SettingsGroup>
  </>,
  voice:<>
   <SettingsGroup title="Spoken answers" description="HoiClicky can read every answer aloud.">
    <SettingRow title="Speak answers" description="Read each reply aloud automatically."><Toggle label="Speak answers" checked={read} onChange={setRead}/></SettingRow>
    <SettingRow title="Voice volume"><Range label="Voice volume" value={voiceVolume(voiceConfig)} onChange={volume=>{setVoiceConfig({...voiceConfig,volume});if(speechAudio.current)speechAudio.current.volume=volume;}}/></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Answer voice" description="Piper voices are free and run on this PC. ElevenLabs sends only the answer text and needs its own account; usage may be paid.">
    <SettingRow title="Voice engine"><select aria-label="Voice engine" value={voiceConfig.provider} onChange={e=>setVoiceConfig({...voiceConfig,provider:e.target.value})}><option value="piper">Piper · free, on this PC</option><option value="system">Windows voice · on this PC</option><option value="elevenlabs">ElevenLabs · cloud</option></select></SettingRow>
    {voiceConfig.provider==='piper'&&<SettingRow title="Voice" description="Download a voice once; it stays on this PC."><div className="row-actions"><select aria-label="Piper voice" value={voiceConfig.voiceId||'de_DE-thorsten-high'} onChange={e=>setVoiceConfig({...voiceConfig,voiceId:e.target.value})}><option value="de_DE-thorsten-high">Thorsten · German</option><option value="en_US-lessac-medium">Lessac · English</option></select><button className="btn" disabled={voiceDownloading} onClick={async()=>{setVoiceDownloading(true);setVoiceError('');try{await api.piperInstall(voiceConfig.voiceId||'de_DE-thorsten-high');setVoiceError('Voice installed. Try the preview.');}catch(e){setVoiceError(e.message);}finally{setVoiceDownloading(false);}}}>{voiceDownloading?'Downloading…':'Download'}</button></div></SettingRow>}
    {voiceConfig.provider==='elevenlabs'&&<><SettingRow title="API key" description={voiceKeyState?'A key is saved securely on this PC.':'Your ElevenLabs API key, stored encrypted.'}><div className="row-actions"><input type="password" aria-label="ElevenLabs API key" placeholder={voiceKeyState?'Saved':'Paste key'} value={voiceKey} onChange={e=>setVoiceKey(e.target.value)}/><button className="btn" onClick={async()=>{try{setVoiceKeyState(await api.ttsKey(voiceKey));setVoiceKey('');await loadVoiceOptions();}catch(e){setVoiceError(e.message);}}}>Save</button></div></SettingRow>
     <SettingRow title="Voice"><div className="row-actions"><select aria-label="ElevenLabs voice" value={voiceConfig.voiceId} onChange={e=>setVoiceConfig({...voiceConfig,voiceId:e.target.value})}>{voiceVoices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><button className="btn" onClick={loadVoiceOptions}>Load voices</button></div></SettingRow></>}
    <SettingRow title="Preview" description="Hear the selected voice at the chosen volume."><button className="btn" onClick={()=>speakAnswer('Hello! This is your HoiClicky voice preview.')}><Volume2 size={14}/>Play preview</button></SettingRow>
    {voiceError&&<p className={/installed/i.test(voiceError)?'field-note':'field-error'} role="status">{voiceError}</p>}
   </SettingsGroup>
  </>,
  agent:<>
   {!agentProviders.includes(status.provider)&&<p className="callout">Agent mode needs Claude or ChatGPT as the provider. <button className="link" onClick={()=>setSettingsTab('ai')}>Change provider</button></p>}
   <SettingsGroup title="Agent mode" description="Let Claude or ChatGPT act on this PC: edit files, run commands, use the mouse and keyboard and read the web. Turn it on with the Agent chip in the chat; with Claude you can also just ask for agent mode.">
    <SettingRow title="Workspace folder" description={status.agent?.workspace||'Optional. Without one, the agent works on the desktop and the web and asks before touching any file.'}><div className="row-actions"><button className="btn" disabled={busy} onClick={async()=>{try{const folder=await api.pickWorkspace();if(folder)await setting({agent:{...status.agent,workspace:folder}});}catch(e){setError(e.message);}}}><FolderOpen size={14}/>Choose…</button>{status.agent?.workspace&&<button className="btn" disabled={busy} onClick={()=>setting({agent:{...status.agent,workspace:''}})}>Clear</button>}</div></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Tools" description="What the agent may use while working.">
    {agentGroups.map(([key,title,description])=><SettingRow key={key} title={title} description={description}><Toggle label={title} disabled={busy} checked={(status.agent?.tools||[]).includes(key)} onChange={on=>{const tools=new Set(status.agent?.tools||[]);on?tools.add(key):tools.delete(key);setting({agent:{...status.agent,tools:[...tools]}});}}/></SettingRow>)}
   </SettingsGroup>
   <SettingsGroup title="Approvals" description="Reading files in the workspace, looking at the screen and switching windows never need approval.">
    <div className="choice-cards" role="radiogroup" aria-label="Agent approvals">{[['ask','Ask before every change','Every edit, command, click and keystroke shows an Allow / Deny card.'],['files','Workspace files freely','Edits inside the workspace run on their own; everything else asks.'],['auto','Autonomous','Nothing asks. The agent can delete files, run any command and click anything.']].map(([value,title,description])=><button key={value} role="radio" aria-checked={(status.agent?.approval||'ask')===value} className={'choice'+((status.agent?.approval||'ask')===value?' selected':'')+(value==='auto'?' risky':'')} disabled={busy} onClick={()=>setting({agent:{...status.agent,approval:value}})}><span className="choice-dot"/><span><strong>{title}</strong><small>{description}</small></span></button>)}</div>
    {status.agent?.approval==='auto'&&<p className="callout callout-warn" role="note">Autonomous mode acts without asking. Use it only for tasks you are watching.</p>}
   </SettingsGroup>
  </>,
  privacy:<>
   <SettingsGroup title="Screen" description="A screenshot is taken only when you send a screen question; screenshots are never saved.">
    <SettingRow title="Include my screen" description="Attach one screenshot to each question you send."><Toggle label="Include my screen" disabled={locked} checked={!!status.screen} onChange={on=>setting({screen:on})}/></SettingRow>
    <SettingRow title="Screens to include" description="HoiClicky also tells the AI which windows and browser tabs are open."><Segmented label="Screens to include" disabled={locked} value={status.screens||'all'} onChange={screens=>setting({screens})} options={[['all','All monitors'],['cursor','Monitor under pointer']]}/></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Microphone" description="The microphone only records while you hold your talk key or click the orb. Audio is transcribed on this PC and never stored.">
    <SettingRow title="Enable microphone"><Toggle label="Enable microphone" disabled={locked} checked={!!status.microphone} onChange={on=>setting({microphone:on})}/></SettingRow>
   </SettingsGroup>
   <SettingsGroup title="Stored on this PC" description="Chat text is saved locally so you can continue conversations. Sign-in tokens are encrypted with Windows. Nothing syncs to the cloud."/>
  </>,
 };

 return <div className="ui">
  <aside className="rail">
   <div className="rail-brand"><span className="brand-orb"><Sparkles size={16}/></span><span>HoiClicky</span></div>
   {page==='settings'?<>
    <button className="rail-back" onClick={()=>setPage('chat')}><ArrowLeft size={15}/>Back to chats</button>
    <nav className="rail-nav" aria-label="Settings categories">{tabs.map(([key,label,icon])=><button key={key} className={'rail-item'+(settingsTab===key?' active':'')} aria-current={settingsTab===key?'page':undefined} onClick={()=>setSettingsTab(key)}>{icon}<span>{label}</span></button>)}</nav>
   </>:<>
    <button className="btn btn-primary rail-new" onClick={newChat} disabled={locked||!historyReady}><Plus size={16}/>New chat</button>
    <label className="rail-search"><Search size={14}/><input aria-label="Search chats" placeholder="Search chats" value={chatSearch} onChange={e=>setChatSearch(e.target.value)}/></label>
    <div className="rail-label">Recent</div>
    <div className="rail-chats">{visibleChats.map(chat=><div className={'rail-chat'+(chat.id===chatId?' active':'')} key={chat.id}><button className="rail-chat-open" title={chat.title} disabled={locked} onClick={()=>openChat(chat)}><MessageSquare size={14}/><span>{chat.title}</span></button><button className="rail-chat-delete" title="Delete conversation" aria-label={'Delete '+chat.title} disabled={locked} onClick={()=>deleteChat(chat)}><Trash2 size={13}/></button></div>)}{!chats.length&&<p className="rail-empty">Your conversations will appear here.</p>}{chats.length>0&&!visibleChats.length&&<p className="rail-empty">No chat matches “{chatSearch}”.</p>}</div>
   </>}
   <div className="rail-foot">{page!=='settings'&&<button className="rail-item" onClick={()=>openSettings('general')}><Settings size={16}/><span>Settings</span></button>}<p className="rail-privacy"><Shield size={13}/>Chats stay on this PC. Screenshots are never stored.</p></div>
  </aside>
  <main className="stage">
   <header className="topbar"><div className="topbar-title">{page==='settings'?<><span className="crumb">Settings</span><ChevronRight size={14}/><span>{tabLabel}</span></>:<span>{currentChat?.title||'New chat'}</span>}</div><div className="window-controls"><button onClick={()=>api.window('minimize')} aria-label="Minimize"><Minus size={16}/></button><button className="close" onClick={()=>api.window('close')} aria-label="Quit"><X size={16}/></button></div></header>
   {page==='settings'?<section className="settings-page" aria-labelledby="settings-title"><div className="settings-inner"><h1 id="settings-title">{tabLabel}</h1>{settingsBody[settingsTab]}</div></section>:<>
    <div className="conversation">{messages.length===0?<div className="home">
     <button id="voice" className={'voice-orb'+(listening?' live':'')+(busy?' busy':'')} style={{'--level':Math.min(1,level/60).toFixed(2)}} onClick={voice} aria-label={listening?'Stop listening':'Start talking'} aria-pressed={listening}><span className="orb-ring"/><span className="orb-ring two"/><span className="orb-core">{listening?<AudioLines size={34}/>:<Mic size={34}/>}</span></button>
     <h1>{listening?'Listening…':'How can I help?'}</h1>
     <p className="home-hint">{listening?'Release '+talk+' or click the orb to send.':<>Click the orb or hold <kbd>{talk}</kbd> to talk, or type below.</>}</p>
     <div className="glance" aria-label="Status">{glance.map(item=><button key={item.key} className={'glance-chip state-'+item.state} onClick={()=>openSettings(item.tab)} title="Open settings">{item.icon}<span>{item.label}</span></button>)}</div>
    </div>:<div className="thread">{messages.map((m,i)=><article key={i} className={'msg '+(m.role==='you'?'msg-user':'msg-ai')}>{m.role==='you'?<div className="bubble">{m.text}</div>:<><div className="msg-meta"><span className="msg-avatar"><Sparkles size={12}/></span>HoiClicky</div>{m.text?<FormattedAnswer text={m.text}/>:<div className="typing" aria-label="Thinking"><i/><i/><i/></div>}</>}</article>)}{approvals.map(item=><ApprovalCard key={item.id} item={item}/>)}</div>}<div ref={end}/></div>
    <footer className="dock">
     <div className={'composer'+(listening?' live':'')}>
      <textarea aria-label="Message" placeholder={listening?'Listening… your words appear here':'Ask anything about what’s on your screen…'} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/>
      <div className="composer-bar">
       <button className={'chip'+(status.screen?' on':'')} disabled={busy} aria-pressed={!!status.screen} onClick={()=>setting({screen:!status.screen})}><Monitor size={14}/>{status.screen?'Screen':'Text only'}</button>
       {agentProviders.includes(status.provider)&&<button className={'chip chip-agent'+(agentOn?' on':'')} disabled={busy} aria-pressed={agentOn} title={agentOn?'Agent mode: the AI can act on this PC with your approval':'Turn on agent mode'} onClick={()=>setAgentOn(!agentOn)}><Bot size={14}/>{agentOn?'Agent on':'Agent'}</button>}
       <select className="model-select" aria-label="Model" disabled={busy} value={status.model||''} onChange={e=>{const model=e.target.value;const choice=models.find(m=>m.Slug===model);setting({model,...(choice?.SupportsImages===false?{screen:false}:{})});}}><option value="" disabled>{status.provider==='ollama'?'Choose local model':status.provider==='claude'?(status.claude?.loggedIn?'Choose Claude model':'Sign in to choose'):status.connected?'Choose model':'Connect to choose'}</option>{models.map(m=><option key={m.Slug} value={m.Slug}>{m.Name}{m.SupportsImages===false?' · text only':''}</option>)}</select>
       <div className="spacer"/>
       <button className={'talk-btn'+(listening?' live':'')} onClick={voice} aria-label={listening?'Stop listening':'Talk'} title={'Click or hold '+talk}><Mic size={15}/><kbd>{talk}</kbd></button>
       {agentRunning&&<button className="btn btn-danger btn-sm" onClick={()=>api.agentStop().catch(e=>setError(e.message))}><Square size={11}/>Stop</button>}
       <button className="send" aria-label="Send" disabled={busy||listening||!question.trim()} onClick={send}><ArrowUp size={18}/></button>
      </div>
     </div>
     <div className="dock-status" aria-live="polite"><span className={'status-dot'+(listening?' live':busy?' busy':'')}/>{phase}{phase==='Speaking'&&<button className="link" onClick={()=>{stopSpeech();setPhase('Ready when you are');}}>Stop speaking</button>}</div>
    </footer>
   </>}
   {error&&<div className="toast" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
  </main>
 </div>;
}


function InlineMarkdown({text}){return inlineTokens(text).map((part,index)=>part.type==='strong'?<strong key={index}>{part.text}</strong>:part.type==='em'?<em key={index}>{part.text}</em>:part.type==='code'?<code key={index}>{part.text}</code>:part.type==='link'?<a href={part.href} key={index} onClick={e=>{e.preventDefault();api.openLink(part.href).catch(()=>{});}}>{part.text}</a>:<React.Fragment key={index}>{part.text}</React.Fragment>);}
function FormattedAnswer({text}){return <div className="formatted-answer">{parseMarkdown(text).map((block,index)=>{
 const inline=value=><InlineMarkdown text={value}/>;
 if(block.type==='pre')return <div className="code-block" key={index}><div className="code-label">{block.language||'Code'}<button onClick={()=>navigator.clipboard.writeText(block.text)}>Copy</button></div><pre><code>{block.text}</code></pre></div>;
 if(block.type==='heading'){const Tag='h'+Math.min(block.level+1,6);return <Tag key={index}>{inline(block.text)}</Tag>;}
 if(block.type==='list'){const Tag=block.ordered?'ol':'ul';return <Tag key={index}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</Tag>;}
 if(block.type==='table')return <div className="table-scroll" key={index}><table><thead><tr>{block.header.map((cell,i)=><th key={i}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
 if(block.type==='quote')return <blockquote key={index}>{inline(block.text)}</blockquote>;
 if(block.type==='rule')return <hr key={index}/>;
 return <p key={index}>{inline(block.text)}</p>;
 })}</div>;}

const plainText=text=>text.replace(/```[\w-]*\n?/g,'').replace(/\*\*|__|`/g,'').replace(/^#+\s*/gm,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
// Pointer drag in screen coordinates. Used to move the orb/pill and to resize the panel edges.
function useIslandGesture(edge,onTap){
 const start=useRef(null),frame=useRef(0),latest=useRef(null);
 const end=()=>{cancelAnimationFrame(frame.current);frame.current=0;if(start.current?.active)api.islandDrag({phase:'end'}).catch(()=>{});start.current=null;};
 return {
  onPointerDown:e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start.current={x:e.screenX,y:e.screenY,active:false};},
  onPointerMove:e=>{const s=start.current;if(!s)return;const dx=e.screenX-s.x,dy=e.screenY-s.y;if(!s.active){if(Math.hypot(dx,dy)<4)return;s.active=true;api.islandDrag({phase:'start',edge}).catch(()=>{});}latest.current={dx,dy};if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;api.islandDrag({phase:'move',...latest.current}).catch(()=>{});});},
  onPointerUp:()=>{const tapped=start.current&&!start.current.active;end();if(tapped)onTap?.();},
  onPointerCancel:end,
  onKeyDown:onTap?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTap();}}:undefined,
 };
}
function Grip({edge}){return <div className={'hc-grip hc-grip-'+edge} aria-hidden="true" {...useIslandGesture(edge)}/>;}
function Wave({level,active}){return <div className={'hc-wave'+(active?' active':'')} aria-hidden="true">{[.45,.75,1,.8,.5].map((n,i)=><i key={i} style={{height:4+Math.min(18,level*.2*n),animationDelay:`${i*90}ms`}}/>)}</div>;}

function FloatingAssistant({level}){
 const [view,setView]=useState({phase:'Ready',answer:'',question:'',model:'',talk:'',busy:false,listening:false,error:''});
 const [mode,setMode]=useState('orb'),[logo,setLogo]=useState({x:0,y:0,tilt:0}),[draft,setDraft]=useState(''),[copied,setCopied]=useState(false),[speaking,setSpeaking]=useState(false),[askError,setAskError]=useState('');
 const [pinned,setPinned]=useState(()=>{try{return localStorage.getItem('hoi.island.pinned')==='1';}catch{return false;}});
 const previous=useRef(view),hovering=useRef(false),typing=useRef(false),body=useRef(null),input=useRef(null);
 const [approvals,setApprovals]=useState([]);
 useEffect(()=>api.events(event=>{if(event.eventName==='logo-motion')setLogo(event);if(event.eventName==='presentation')setView(event);if(event.eventName==='approval'){setApprovals(items=>items.some(a=>a.id===event.id)?items:[...items,event]);setMode('panel');}if(event.eventName==='approvalDone')setApprovals(items=>items.filter(a=>a.id!==event.id));}),[]);
 const transcribing=/transcrib|loading local/i.test(view.phase);
 const active=view.busy||view.listening||transcribing;
 // Open the panel when an answer or error arrives; show the pill while listening and thinking.
 useEffect(()=>{
  const before=previous.current;previous.current=view;
  if((view.busy||before.busy)&&view.answer&&view.answer!==before.answer){setMode('panel');return;}
  if(view.error&&view.error!==before.error){setMode('panel');return;}
  setMode(current=>active&&current==='orb'?'pill':!active&&current==='pill'?'orb':current);
 },[view]);
 useEffect(()=>{api.islandLayout({mode}).catch(()=>{});},[mode]);
 useEffect(()=>{try{localStorage.setItem('hoi.island.pinned',pinned?'1':'0');}catch{}},[pinned]);
 // Unpinned panels fold back into the orb after a quiet half minute; hovering or typing keeps them open.
 useEffect(()=>{if(mode!=='panel'||pinned||active)return;const timer=setInterval(()=>{if(!hovering.current&&!typing.current&&!draft)setMode('orb');},30000);return()=>clearInterval(timer);},[mode,pinned,active,view.answer,draft]);
 useEffect(()=>{const el=body.current;if(el&&el.scrollHeight-el.scrollTop-el.clientHeight<120)el.scrollTop=el.scrollHeight;},[view.answer]);
 useEffect(()=>()=>speechSynthesis.cancel(),[]);
 const open=()=>setMode('panel');
 const orbGesture=useIslandGesture('move',open),pillGesture=useIslandGesture('move',open);
 const state=view.error?'error':transcribing?'transcribing':view.listening?'listening':view.busy?(view.answer?'answering':'thinking'):speaking||view.phase==='Speaking'?'speaking':view.answer?'answered':'idle';
 const label=approvals.length?'Waiting for you':{error:'Needs attention',transcribing:'Transcribing',listening:'Listening',thinking:view.phase||'Thinking',answering:'Answering',speaking:'Speaking',answered:'Answer',idle:'Ready'}[state];
 const talk=view.talk||'your talk key';
 async function ask(e){e?.preventDefault();const text=draft.trim();if(!text||view.busy||view.listening)return;setAskError('');try{await api.islandAsk(text);setDraft('');}catch(err){setAskError(err.message);}}
 function copy(){navigator.clipboard.writeText(view.answer).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1600);}).catch(err=>setAskError('Could not copy: '+err.message));}
 function readAloud(){if(speaking){speechSynthesis.cancel();setSpeaking(false);return;}const utterance=new SpeechSynthesisUtterance(speechText(view.answer)||plainText(view.answer));try{utterance.volume=voiceVolume(JSON.parse(localStorage.getItem('voiceConfig')));}catch{}utterance.onend=utterance.onerror=()=>setSpeaking(false);speechSynthesis.cancel();speechSynthesis.speak(utterance);setSpeaking(true);}
 const orb=<span className="hc-core" style={{transform:`translate(${logo.x}px,${logo.y}px) rotate(${logo.tilt}deg)`}}><Sparkles size={mode==='orb'?20:15}/></span>;
 const rimLevel={'--hc-level':Math.min(1,level/60).toFixed(2)};

 if(mode==='orb')return <div className={'hc-root mode-orb state-'+state} style={rimLevel}><button className="hc-orb hc-rim" title="Open HoiClicky · drag to move" aria-label="Open HoiClicky" {...orbGesture}>{orb}</button></div>;
 if(mode==='pill')return <div className={'hc-root mode-pill state-'+state} style={rimLevel}><div className="hc-pill hc-rim" role="button" tabIndex={0} title="Open panel · drag to move" aria-label={label+'. Open panel'} {...pillGesture}>{orb}<span className="hc-pill-label" aria-live="polite">{label}</span><Wave level={level} active={active}/></div></div>;
 return <div className={'hc-root mode-panel state-'+state} style={rimLevel} onKeyDown={e=>{if(e.key==='Escape')setMode('orb');}}>
  <section className="hc-panel hc-rim" onMouseEnter={()=>{hovering.current=true;}} onMouseLeave={()=>{hovering.current=false;}} aria-label="HoiClicky answer">
   <header className="hc-head">
    <button className="hc-mark" title="Fold into orb" aria-label="Fold into orb" onClick={()=>setMode('orb')}>{orb}</button>
    <div className="hc-title"><strong aria-live="polite">{label}</strong>{view.model&&<span className="hc-model">{view.model}</span>}</div>
    {active&&<Wave level={level} active/>}
    <div className="hc-head-actions">
     <button className={'hc-icon'+(pinned?' on':'')} aria-pressed={pinned} title={pinned?'Unpin · folds away when idle':'Pin · stays open'} aria-label={pinned?'Unpin panel':'Pin panel'} onClick={()=>setPinned(v=>!v)}>{pinned?<PinOff size={15}/>:<Pin size={15}/>}</button>
     <button className="hc-icon" title="Fold into orb (Esc)" aria-label="Fold into orb" onClick={()=>setMode('orb')}><Minimize2 size={15}/></button>
    </div>
   </header>
   {view.question&&(view.answer||view.busy||view.error)&&<p className="hc-question" title={view.question}>{view.question}</p>}
   <div className="hc-body" ref={body} tabIndex={0}>
    {approvals.map(item=><ApprovalCard key={item.id} item={item}/>)}
    {view.error?<div className="hc-error" role="alert"><strong>Something needs your attention</strong><p>{view.error}</p></div>
    :view.listening||transcribing?<div className="hc-empty"><p className="hc-empty-lead">{view.listening?'Listening…':'Turning your words into text…'}</p><p>{view.listening?'Release '+talk+' to send.':'Your question is sent automatically.'}</p></div>
    :view.answer?<FormattedAnswer text={view.answer}/>
    :view.busy?<div className="hc-thinking" aria-label="Thinking"><i/><i/><i/></div>
    :<div className="hc-empty"><p className="hc-empty-lead">Ask about anything on your screen.</p><p>Type below, or hold {talk} and speak.</p></div>}
   </div>
   <form className="hc-ask" onSubmit={ask}>
    <textarea ref={input} rows={1} value={draft} disabled={view.busy||view.listening} placeholder={view.busy?'Answering…':view.answer?'Ask a follow-up…':'Ask HoiClicky…'} aria-label="Ask HoiClicky" onFocus={()=>{typing.current=true;}} onBlur={()=>{typing.current=false;}} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}}}/>
    <button type="submit" className="hc-send" aria-label="Send" disabled={!draft.trim()||view.busy||view.listening}><ArrowUp size={17}/></button>
   </form>
   {askError&&<p className="hc-ask-error" role="alert">{askError}</p>}
   <footer className="hc-foot">
    <button disabled={!view.answer} onClick={copy}>{copied?<Check size={14}/>:<Copy size={14}/>}{copied?'Copied':'Copy'}</button>
    <button disabled={!view.answer} onClick={readAloud}>{speaking?<Square size={13}/>:<Volume2 size={14}/>}{speaking?'Stop reading':'Read aloud'}</button>
    <span className="spacer"/>
    <button onClick={()=>api.window('open')}><ExternalLink size={14}/>Open chat</button>
   </footer>
   <Grip edge="left"/><Grip edge="right"/><Grip edge="bottom"/><Grip edge="corner-left"/><Grip edge="corner"/>
  </section>
 </div>;
}

createRoot(document.getElementById('root')).render(<StartupBoundary><App/></StartupBoundary>);
