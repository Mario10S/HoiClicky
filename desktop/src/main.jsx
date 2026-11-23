import {parseMarkdown,inlineTokens} from './markdown.mjs';
import {playCompletion} from './completion-audio.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Trash2,ArrowLeft,ArrowUp,AudioLines,Check,ChevronDown,Command,Eye,MessageSquare,Mic,Minus,Monitor,Plus,Settings,Shield,Square,Volume2,X,Sparkles,Pin,PinOff,Minimize2,Copy,ExternalLink} from 'lucide-react';
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
function App(){
 const [status,setStatus]=useState({provider:'ollama',connected:false,screen:true,microphone:false,model:'',key1:162,key2:164,claude:{installed:false,loggedIn:false,account:null}}),[models,setModels]=useState([]),[page,setPage]=useState('chat'),[question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[phase,setPhase]=useState('Ready when you are'),[busy,setBusy]=useState(false),[listening,setListening]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState(''),[read,setRead]=useState(false);
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
 const autoVoice=useRef(false),voiceFailed=useRef(false),sendRef=useRef(null),sending=useRef(false);
 const transcript=useRef(''),voiceRef=useRef(false),end=useRef(null);
 async function refresh(){const s=await api.status();setStatus(s);if(s.provider==='ollama'||(s.provider==='chatgpt'&&s.connected)||(s.provider==='claude'&&s.claude?.loggedIn)){const m=await api.models();setModels(m);setStatus(v=>({...v,model:m.some(x=>x.Slug===v.model)?v.model:m[0]?.Slug||''}));}}
 useEffect(()=>{if(!onIsland)refresh().catch(e=>setError(e.message));return api.events(event=>{
  if(event.eventName==='hold'){if(event.value){autoVoice.current=true;voiceFailed.current=false;transcript.current='';setQuestion('');voiceRef.current=true;setListening(true);setPhase('Opening microphone');}else {setListening(false);setPhase('Transcribing');}}
  if(event.eventName==='captured')setPhase('Thinking');
  if(event.eventName==='answer')setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:event.value}:x));
  if(event.eventName==='error')setError(event.value);
  if(event.eventName==='islandAsk'&&!onIsland)sendRef.current?.(event.text);
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
 async function setting(patch){const next={...status,...patch};setStatus(next);try{await api.settings({screen:next.screen,microphone:next.microphone,model:next.model||'',key1:next.key1,key2:next.key2,provider:next.provider});}catch(e){setError(e.message);}}
 async function voice(){if(voiceRef.current){await api.voiceStop();return;}if(!status.microphone){setError('Enable microphone access in Settings first.');setPage('settings');return;}transcript.current='';setError('');setListening(true);voiceRef.current=true;setPhase('Opening microphone');try{await api.voice();setQuestion(transcript.current);}catch(e){setError(e.message);}finally{voiceRef.current=false;setListening(false);setLevel(0);setPhase('Ready');if(!onIsland&&autoVoice.current){autoVoice.current=false;if(!voiceFailed.current&&transcript.current.trim())sendRef.current?.(transcript.current.trim());}}}
 async function send(voiceText){const isVoice=typeof voiceText==='string';const text=(isVoice?voiceText:question).trim();if(!text||sending.current||(!isVoice&&listening))return;if(!historyReady){setError('Local chat history is still loading. Try again in a moment.');return;}if(status.provider==='chatgpt'&&!status.connected){setError('Connect ChatGPT in Settings to send a question.');setQuestion(text);return;}if(status.provider==='claude'&&!status.claude?.loggedIn){setError('Sign in with Claude in Settings to send a question.');setQuestion(text);return;}if(!status.model){setError('Choose a model first.');setQuestion(text);return;}sending.current=true;setQuestion('');setBusy(true);setError('');setPhase('Thinking');setMessages(m=>[...m,{role:'you',text},{role:'hoi',text:''}]);try{await api.settings({screen:status.screen,microphone:status.microphone,model:status.model,key1:status.key1,key2:status.key2,provider:status.provider});setPhase(status.screen?'Looking at your screen':'Thinking');const answer=await api.ask({question:text,model:status.model,screen:status.screen,history:messages.filter(m=>m.text.trim()).slice(-12).map(m=>({role:m.role==='you'?'user':'assistant',text:m.text}))});setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:answer}:x));setPhase('Answered');playCompletion(api,sound).catch(e=>setSoundError('Could not play completion sound: '+e.message));if(read){setPhase('Speaking');const utterance=new SpeechSynthesisUtterance(answer);utterance.onend=()=>setPhase('Answered');utterance.onerror=()=>setPhase('Answered');speechSynthesis.speak(utterance);}}catch(e){setError(e.message);setPhase('Request stopped');}finally{sending.current=false;setBusy(false);}}
 sendRef.current=send;
 const lastAnswer=messages.filter(m=>m.role==='hoi').at(-1)?.text||'';
 useEffect(()=>{if(!onIsland)api.presentation({phase,answer:listening||/transcrib|opening microphone|loading local/i.test(phase)?'':lastAnswer,question:messages.filter(m=>m.role==='you').at(-1)?.text||'',model:models.find(m=>m.Slug===status.model)?.Name||'',talk:talkLabel(status.key1,status.key2),busy,listening,error}).catch(()=>{});},[phase,lastAnswer,busy,listening,error,messages,models,status.model,status.key1,status.key2]);

 if(onIsland)return <FloatingAssistant phase={phase} level={level}/>;
 return <div className="app"><aside className="history-sidebar"><div className="brand"><div className="orb"><Sparkles size={20}/></div><span>Hoiclicky</span></div><button className="new" onClick={newChat} disabled={busy||listening||!historyReady||voiceRef.current}><Plus size={16}/> New chat</button><input className="chat-search" aria-label="Search local chats" placeholder="Search chats" value={chatSearch} onChange={e=>setChatSearch(e.target.value)}/><div className="nav-label">SAVED ON THIS PC</div><div className="chat-list">{chats.filter(c=>(c.title+' '+c.messages.map(m=>m.text).join(' ')).toLowerCase().includes(chatSearch.toLowerCase())).map(chat=><div className={'chat-row '+(chat.id===chatId?'selected':'')} key={chat.id}><button className="chat-open" title={chat.title} disabled={busy||listening||voiceRef.current} onClick={()=>openChat(chat)}><MessageSquare size={14}/><span>{chat.title}</span></button><button className="chat-delete" title="Delete conversation" aria-label={'Delete '+chat.title} disabled={busy||listening||voiceRef.current} onClick={()=>deleteChat(chat)}><Trash2 size={13}/></button></div>)}{!chats.length&&<p className="empty-history">Your conversations will appear here.</p>}</div><div className="side-bottom"><button className="nav" onClick={()=>setPage('settings')}><Settings size={16}/> Settings</button><div className="privacy"><Shield size={16}/><small>Chat text is saved locally.<br/>Screenshots are not stored.</small></div></div></aside>
 <main><header>{page==='settings'&&<button className="back-chat" onClick={()=>setPage('chat')}><ArrowLeft size={16}/> Back to chat</button>}<span>{page==='chat'?'Hoiclicky · your free AI screen companion':'Make yourself at home'}</span><div className="window-controls"><button onClick={()=>setPage(page==='settings'?'chat':'settings')} aria-label="Settings"><Settings size={17}/></button><button onClick={()=>api.window('minimize')} aria-label="Minimize"><Minus size={16}/></button><button onClick={()=>api.window('close')} aria-label="Quit"><X size={16}/></button></div></header>
 {page==='settings'?<section className="settings"><span className="eyebrow">PREFERENCES</span><h1>A little more you.</h1><p>Choose how HoiClicky helps, listens and responds.</p><div className="card"><h3>AI provider</h3><p>Local models are free to run and need no account. Cloud access depends on your own account and its limits.</p><label className="setting"><span>Where answers run</span><select aria-label="AI provider" value={status.provider||'ollama'} disabled={busy||listening} onChange={async e=>{const provider=e.target.value;setModels([]);setError('');await setting({provider,model:''});try{await refresh();}catch(error){setError(error.message);}}}><option value="ollama">Ollama · on this PC</option><option value="chatgpt">ChatGPT · optional connection</option><option value="claude">Claude · via Claude Code</option></select></label><button className="primary" disabled={busy} onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>Refresh models</button>{status.provider==='ollama'&&<p>Start Ollama and install a model, then refresh. Screenshot requests need a vision model. No model downloads happen automatically.</p>}</div><div className="card"><h3>Claude account (optional)</h3><p>{!status.claude?.installed?'Claude Code is not installed on this PC. Install it, then come back here to sign in.':status.claude.loggedIn?status.claude.account:'Sign in with your Claude plan in the browser. HoiClicky uses your Claude Code login and never sees your password or tokens.'}</p>{status.claude?.installed?<button className="primary" disabled={busy} onClick={async()=>{if(status.claude.loggedIn&&!confirm('Sign out of Claude? This also signs out Claude Code on this PC.'))return;setBusy(true);setError('');setPhase(status.claude.loggedIn?'Signing out of Claude':'Finish signing in with Claude in your browser');try{status.claude.loggedIn?await api.claudeDisconnect():await api.claudeConnect();await refresh();setPhase('Ready when you are');}catch(e){setError(e.message);setPhase('Ready when you are');}finally{setBusy(false);}}}>{status.claude.loggedIn?'Sign out':'Sign in with Claude'}</button>:<button className="primary" onClick={()=>api.openLink('https://claude.com/claude-code').catch(e=>setError(e.message))}>Get Claude Code</button>}{status.claude?.loggedIn&&<p>Usage counts toward your own Claude plan and its limits. Claude only answers here; it cannot act on your PC.</p>}</div><div className="card"><h3>ChatGPT account (optional)</h3><p>{status.connected?status.account:'Connect your ChatGPT plan to get started.'}</p><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{status.connected?await api.disconnect():await api.connect();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{status.connected?'Disconnect':'Continue with ChatGPT'}</button></div><div className="card"><h3>Completion sound</h3><p>Play a sound when an answer finishes, including while chat is in the background.</p><label className="setting"><span>Sound</span><select aria-label="Completion sound" value={sound.mode} onChange={e=>saveSound({mode:e.target.value})}><option value="off">Off</option><option value="soft">Soft chime</option><option value="bright">Bright chime</option><option value="mp3" disabled={!sound.name}>Custom MP3</option></select></label><label className="setting"><span>Volume</span><input aria-label="Completion volume" type="range" min="0" max="1" step="0.05" value={sound.volume} onChange={e=>saveSound({volume:Number(e.target.value)})}/></label><div className="sound-actions"><button className="primary" onClick={async()=>{try{setSound(await api.sound('pick'));setSoundError('');}catch(e){setSoundError(e.message);}}}>Choose MP3…</button><button className="primary" disabled={sound.mode==='off'} onClick={()=>playCompletion(api,sound).catch(e=>setSoundError(e.message))}>Preview sound</button></div>{sound.name&&<p className="sound-filename">{sound.name}</p>}{soundError&&<p role="alert">{soundError}</p>}</div><div className="card"><h3>Hold to talk</h3><p>Hold your talk key while speaking, or both keys if you pick two. Release to finish and transcribe. Your words are sent automatically when transcription finishes. Set Key 2 to None to talk with a single key; a key you rarely type with, such as F8 or Right Ctrl, works best.</p><div className="key-choices">{['key1','key2'].map((field,index)=><label key={field}>Key {index+1}<select aria-label={'Talk key '+(index+1)} disabled={busy||listening} value={status[field]??(index===0?162:164)} onChange={e=>setting({[field]:Number(e.target.value)})}>{index===1&&<option value={0} disabled={status.key1===32}>None · single key</option>}{talkKeys.map(([value,name])=><option key={value} value={value} disabled={value===status[index===0?'key2':'key1']||(index===0&&value===32&&!status.key2)}>{name}</option>)}</select></label>)}</div></div><div className="card"><h3>Your boundaries</h3>{[['screen','Include my screen','One screenshot per question you send.'],['microphone','Enable microphone','Local Windows speech recognition, only when you start it.']].map(([key,title,description])=><label className="setting" key={key}><div>{title}<small>{description}</small></div><input type="checkbox" checked={status[key]} disabled={busy||listening} onChange={e=>setting({[key]:e.target.checked})}/></label>)}<label className="setting"><div>Speak answers<small>Use a voice installed on this PC.</small></div><input type="checkbox" checked={read} onChange={e=>setRead(e.target.checked)}/></label></div></section>:
 <><div className="conversation">{messages.length===0?<div className="welcome"><div className="orb hero"><Sparkles size={32}/></div><span className="eyebrow">HOICLICKY</span><h1>What can I help with?</h1><p>Ask a question, or hold your voice key.</p><div className="suggestions">{[['Explain this screen','Help me understand what I’m looking at.'],['Walk me through it','Walk me through the next step on this screen.'],['Find the problem','What looks wrong on this screen?']].map(([title,prompt])=><button key={title} onClick={()=>setQuestion(prompt)}><Monitor size={18}/><span>{title}</span><span>↗</span></button>)}</div></div>:messages.map((m,i)=><article key={i} className={m.role==='you'?'message user':'message assistant'}><div className="message-name">{m.role==='you'?'YOU':'✦ HOICLICKY'}</div><div>{m.text?<FormattedAnswer text={m.text}/>:<span className="thinking">Thinking through it...</span>}</div></article>)}<div ref={end}/></div>
 <footer><div className="composer"><textarea placeholder={listening?'Listening… your transcript appears here':'Ask anything about what’s in front of you…'} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/><div className="composer-tools"><button className={'chip '+(status.screen?'selected':'')} disabled={busy} onClick={()=>setting({screen:!status.screen})}><Monitor size={14}/>{status.screen?'Screen included':'Text only'}</button><select aria-label="ChatGPT model" disabled={busy} value={status.model||''} onChange={e=>{const model=e.target.value;const choice=models.find(m=>m.Slug===model);setting({model,...(choice?.SupportsImages===false?{screen:false}:{})});}}><option value="" disabled>{status.provider==='ollama'?'Choose local model':status.provider==='claude'?(status.claude?.loggedIn?'Choose Claude model':'Sign in to choose model'):status.connected?'Choose model':'Connect to choose model'}</option>{models.map(m=><option key={m.Slug} value={m.Slug}>{m.Name}{m.SupportsImages===false?' · text only':m.SupportsImages===true?' · vision':''}</option>)}</select><div className="spacer"/><span className={listening?'hold-hint recording':'hold-hint'} title={status.key2?'Hold both keys to record':'Hold the key to record'}><Mic size={16}/>{talkLabel(status.key1,status.key2)}</span><button className="send" aria-label="Send question" disabled={busy||listening||!question.trim()} onClick={send}><ArrowUp size={20}/></button></div></div><div className="footnote"><span className={'status-dot '+(listening?'live':'')}/>{phase}<span className="spacer"/><button onClick={()=>{speechSynthesis.cancel();setPhase('Ready when you are');}}>Stop speech</button><span>Hold {talkLabel(status.key1,status.key2)} to talk · release to transcribe</span></div></footer></>}
 {error&&<div className="error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}</main></div>;
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
 useEffect(()=>api.events(event=>{if(event.eventName==='logo-motion')setLogo(event);if(event.eventName==='presentation')setView(event);}),[]);
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
 const label={error:'Needs attention',transcribing:'Transcribing',listening:'Listening',thinking:view.phase||'Thinking',answering:'Answering',speaking:'Speaking',answered:'Answer',idle:'Ready'}[state];
 const talk=view.talk||'your talk key';
 async function ask(e){e?.preventDefault();const text=draft.trim();if(!text||view.busy||view.listening)return;setAskError('');try{await api.islandAsk(text);setDraft('');}catch(err){setAskError(err.message);}}
 function copy(){navigator.clipboard.writeText(view.answer).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1600);}).catch(err=>setAskError('Could not copy: '+err.message));}
 function readAloud(){if(speaking){speechSynthesis.cancel();setSpeaking(false);return;}const utterance=new SpeechSynthesisUtterance(plainText(view.answer));utterance.onend=utterance.onerror=()=>setSpeaking(false);speechSynthesis.cancel();speechSynthesis.speak(utterance);setSpeaking(true);}
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
