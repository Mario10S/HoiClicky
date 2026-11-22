import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUp,AudioLines,Check,ChevronDown,Command,Eye,MessageSquare,Mic,Minus,Monitor,Plus,Settings,Shield,Square,Volume2,X,Sparkles} from 'lucide-react';
import './style.css';
const api=window.hoi;
class StartupBoundary extends React.Component {
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error:error.message};}
 render(){return this.state.error?<div style={{padding:40,color:'#eee',fontFamily:'Segoe UI'}}><h2>HoiClicky could not open</h2><p>{this.state.error}</p><p>Close HoiClicky and restart with npm start.</p></div>:this.props.children;}
}
const onIsland=new URLSearchParams(location.search).has('island');
function App(){
 const [status,setStatus]=useState({connected:false,screen:true,microphone:false,model:''}),[models,setModels]=useState([]),[page,setPage]=useState('chat'),[question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[phase,setPhase]=useState('Ready when you are'),[busy,setBusy]=useState(false),[listening,setListening]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState(''),[read,setRead]=useState(false);
 const transcript=useRef(''),voiceRef=useRef(false),end=useRef(null);
 async function refresh(){const s=await api.status();setStatus(s);if(s.connected){const m=await api.models();setModels(m);setStatus(v=>({...v,model:m.some(x=>x.Slug===v.model)?v.model:m[0]?.Slug||''}));}}
 useEffect(()=>{refresh().catch(e=>setError(e.message));return api.events(event=>{
  if(event.eventName==='captured')setPhase('Thinking');
  if(event.eventName==='answer')setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:event.value}:x));
  if(event.eventName==='error')setError(event.value);
  if(event.eventName==='toggleVoice'&&!onIsland)document.getElementById('voice')?.click();
  if(event.eventName==='voice'){
   if(event.kind==='ready'){setPhase('Listening');setListening(true);}
   if(event.kind==='level')setLevel(Number(event.value));
   if(event.kind==='text'){transcript.current+=(transcript.current?' ':'')+event.value;setQuestion(transcript.current);}
   if(event.kind==='partial')setQuestion(transcript.current+' '+event.value);
   if(event.kind==='error'){setError(event.value);setListening(false);}
  }
 });},[]);
 useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[messages]);
 async function setting(patch){const next={...status,...patch};setStatus(next);try{await api.settings({screen:next.screen,microphone:next.microphone,model:next.model||''});}catch(e){setError(e.message);}}
 async function voice(){if(voiceRef.current){await api.voiceStop();return;}if(!status.microphone){setError('Enable microphone access in Settings first.');setPage('settings');return;}transcript.current='';setError('');setListening(true);voiceRef.current=true;setPhase('Opening microphone');try{await api.voice();setQuestion(transcript.current);}catch(e){setError(e.message);}finally{voiceRef.current=false;setListening(false);setLevel(0);setPhase('Review your transcript');}}
 async function send(){if(!question.trim()||busy||listening)return;if(!status.connected){setError('Connect ChatGPT in Settings to send a question.');return;}if(!status.model){setError('Choose a model first.');return;}const text=question.trim();setQuestion('');setBusy(true);setError('');setPhase('Thinking');setMessages(m=>[...m,{role:'you',text},{role:'hoi',text:''}]);try{await api.settings({screen:status.screen,microphone:status.microphone,model:status.model});const answer=await api.ask({question:text,model:status.model,screen:status.screen});setMessages(m=>m.map((x,i)=>i===m.length-1?{...x,text:answer}:x));setPhase('Ready when you are');if(read){setPhase('Speaking');const utterance=new SpeechSynthesisUtterance(answer);utterance.onend=()=>setPhase('Ready when you are');speechSynthesis.speak(utterance);}}catch(e){setError(e.message);setPhase('Request stopped');}finally{setBusy(false);}}
 if(onIsland)return <FloatingAssistant phase={phase} level={level}/>;
 return <div className="app"><aside><div className="brand"><div className="orb"><Sparkles size={22}/></div><span>hoi<span className="muted">clicky</span></span></div><button className="new" onClick={()=>{setMessages([]);setError('');setPage('chat');}} disabled={busy}><Plus size={17}/> New conversation <span>?</span></button><div className="nav-label">WORKSPACE</div><button className={'nav '+(page==='chat'?'active':'')} onClick={()=>setPage('chat')}><MessageSquare size={17}/> Ask HoiClicky</button><button className={'nav '+(page==='settings'?'active':'')} onClick={()=>setPage('settings')}><Settings size={17}/> Settings</button><div className="side-bottom"><div className="privacy"><Shield size={17}/><div>On your terms<small>Only sees what you share.</small></div></div><button className="account" onClick={()=>setPage('settings')}><div className="avatar">{status.connected?'V':'H'}</div><div>{status.connected?'ChatGPT connected':'Connect ChatGPT'}<small>{status.connected?status.account:'Use your existing plan'}</small></div><ChevronDown size={14}/></button></div></aside>
 <main><header><span>{page==='chat'?'Your screen-side companion':'Make yourself at home'}</span><div className="window-controls"><button onClick={()=>api.window('minimize')} aria-label="Minimize"><Minus size={16}/></button><button onClick={()=>api.window('close')} aria-label="Quit"><X size={16}/></button></div></header>
 {page==='settings'?<section className="settings"><span className="eyebrow">PREFERENCES</span><h1>A little more you.</h1><p>Choose how HoiClicky helps, listens and responds.</p><div className="card"><h3>ChatGPT account</h3><p>{status.connected?status.account:'Connect your ChatGPT plan to get started.'}</p><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{status.connected?await api.disconnect():await api.connect();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{status.connected?'Disconnect':'Continue with ChatGPT'}</button></div><div className="card"><h3>Your boundaries</h3>{[['screen','Include my screen','One screenshot per question you send.'],['microphone','Enable microphone','Local Windows speech recognition, only when you start it.']].map(([key,title,description])=><label className="setting" key={key}><div>{title}<small>{description}</small></div><input type="checkbox" checked={status[key]} disabled={busy||listening} onChange={e=>setting({[key]:e.target.checked})}/></label>)}<label className="setting"><div>Speak answers<small>Use a voice installed on this PC.</small></div><input type="checkbox" checked={read} onChange={e=>setRead(e.target.checked)}/></label></div></section>:
 <><div className="conversation">{messages.length===0?<div className="welcome"><div className="orb hero"><Sparkles size={32}/></div><span className="eyebrow">A LITTLE CLARITY, ANYWHERE</span><h1>What are we figuring out?</h1><p>Your screen, your question. Let's take the next step.</p><div className="suggestions">{[['Explain this screen','Help me understand what I'm looking at.'],['Walk me through it','Walk me through the next step on this screen.'],['Find the problem','What looks wrong on this screen?']].map(([title,prompt])=><button key={title} onClick={()=>setQuestion(prompt)}><Monitor size={18}/><span>{title}</span><span>?</span></button>)}</div></div>:messages.map((m,i)=><article key={i} className={m.role==='you'?'message user':'message assistant'}><div className="message-name">{m.role==='you'?'YOU':'? HOICLICKY'}</div><div>{m.text||<span className="thinking">Thinking through it.</span>}</div></article>)}<div ref={end}/></div>
 <footer><div className="composer"><textarea placeholder={listening?'Listening. your transcript appears here':'Ask anything about what's in front of you.'} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/><div className="composer-tools"><button className={'chip '+(status.screen?'selected':'')} disabled={busy} onClick={()=>setting({screen:!status.screen})}><Monitor size={14}/>{status.screen?'Screen included':'Text only'}</button><select aria-label="ChatGPT model" disabled={busy} value={status.model||''} onChange={e=>setting({model:e.target.value})}><option value="" disabled>{status.connected?'Choose model':'Connect to choose model'}</option>{models.map(m=><option key={m.Slug} value={m.Slug}>{m.Name}</option>)}</select><div className="spacer"/><button id="voice" className={listening?'mic recording':'mic'} aria-label={listening?'Stop recording':'Start voice'} disabled={busy} onClick={voice}>{listening?<Square size={17}/>:<Mic size={19}/>}</button><button className="send" aria-label="Send question" disabled={busy||listening||!question.trim()} onClick={send}><ArrowUp size={20}/></button></div></div><div className="footnote"><span className={'status-dot '+(listening?'live':'')}/>{phase}<span className="spacer"/><button onClick={()=>{speechSynthesis.cancel();setPhase('Ready when you are');}}>Stop speech</button><span>Ctrl + Alt + V to talk</span></div></footer></>}
 {error&&<div className="error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}</main></div>;
}

function FloatingAssistant({phase,level}){
 const [compact,setCompact]=useState(false),[dragging,setDragging]=useState(false);
 const pointer=useRef(null);
 const [logo,setLogo]=useState({x:0,y:0,tilt:0});
 useEffect(()=>api.events(event=>{if(event.eventName==='logo-motion')setLogo(event);}),[]);

 async function changeMode(value){await api.islandMode(value);setCompact(value);}
 function down(e){if(e.button!==0||e.target.closest('[data-control]'))return;e.currentTarget.setPointerCapture(e.pointerId);pointer.current={x:e.screenX,y:e.screenY,moved:false};setDragging(true);api.dragStart();}
 function move(e){if(pointer.current&&Math.hypot(e.screenX-pointer.current.x,e.screenY-pointer.current.y)>4)pointer.current.moved=true;}
 function up(e){if(!pointer.current)return;const moved=pointer.current.moved;pointer.current=null;setDragging(false);setLogo({x:0,y:0,tilt:0});api.dragEnd();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(!moved&&e.type!=='pointercancel'){if(compact)changeMode(false);else api.window('open');}}
 return <div className={'float-root '+(compact?'compact':'')}><div className={'island '+(dragging?'dragging':'')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title={compact?'Drag to move � Click to expand':'Drag to move � Click to open chat'}>
 <div className="orb small spring-logo" style={{transform:`translate(${logo.x}px,${logo.y}px) rotate(${logo.tilt}deg) scale(${dragging?1.05:1})`}}><Sparkles size={compact?23:16}/></div>{!compact&&<><span className="island-status">{phase}</span><div className="wave">{[.4,.7,1,.8,.5].map((n,i)=><i key={i} style={{height:4+level*.22*n}}/>)}</div><button data-control className="collapse-island" title="Collapse to circle" aria-label="Collapse to circle" onClick={()=>changeMode(true)}><Minus size={15}/></button></>}
 </div></div>;
}

createRoot(document.getElementById('root')).render(<StartupBoundary><App/></StartupBoundary>);

