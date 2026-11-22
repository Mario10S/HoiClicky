let player=null;
export async function playCompletion(api,preferences){
 if(preferences.mode==='off')return;
 if(player){player.pause();player=null;}
 if(preferences.mode==='mp3'){const source=await api.sound('audio');player=new Audio(source);player.volume=preferences.volume;await player.play();return;}
 const context=new AudioContext(),gain=context.createGain();gain.gain.value=preferences.volume*.15;gain.connect(context.destination);
 const notes=preferences.mode==='bright'?[660,880,1100]:[523.25,659.25];
 notes.forEach((frequency,index)=>{const tone=context.createOscillator(),envelope=context.createGain();tone.type='sine';tone.frequency.value=frequency;const at=context.currentTime+index*.12;envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(1,at+.015);envelope.gain.exponentialRampToValueAtTime(.001,at+.35);tone.connect(envelope);envelope.connect(gain);tone.start(at);tone.stop(at+.36);});
 setTimeout(()=>context.close(),900);
}
