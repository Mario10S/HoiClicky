// Local Piper voices: installs the piper-tts Python package on first use, downloads voice models and renders speech.
const {spawn}=require('node:child_process');
// Free local voices offered in Settings. Alan and Northern English male are calm British voices.
const VOICES=['de_DE-thorsten-high','en_US-lessac-medium','en_GB-alan-medium','en_GB-northern_english_male-medium'];

// Runs the Windows Python launcher and resolves with its exit code and the end of its output.
function runPython(args,{timeout=120000,python='py'}={}){
 return new Promise(resolve=>{
  let output='';const child=spawn(python,args,{windowsHide:true});
  const keep=chunk=>{output=(output+chunk).slice(-4000);};
  child.stdout?.on('data',keep);child.stderr?.on('data',keep);
  const timer=setTimeout(()=>{child.kill();keep('\nTimed out.');},timeout);
  child.on('error',error=>{clearTimeout(timer);resolve({code:-1,output:error.code==='ENOENT'?'missing-python':String(error.message)});});
  child.on('exit',code=>{clearTimeout(timer);resolve({code:code??-1,output});});
 });
}

const lastLine=text=>String(text).trim().split(/\r?\n/).filter(Boolean).at(-1)||'';

async function ensurePiper(run=runPython){
 const check=await run(['-c','import piper']);
 if(check.output==='missing-python')throw Error('Python is not installed. Install Python 3 from python.org (with the "py" launcher), then try again.');
 if(check.code===0)return false;
 const install=await run(['-m','pip','install','--user','--disable-pip-version-check','piper-tts'],{timeout:600000});
 if(install.code!==0)throw Error('Installing Piper failed: '+(lastLine(install.output)||'pip returned an error')+'. You can install it yourself with: py -m pip install --user piper-tts');
 const again=await run(['-c','import piper']);
 if(again.code!==0)throw Error('Piper was installed but cannot be loaded: '+lastLine(again.output));
 return true;
}

async function installVoice(voice,dataDir,run=runPython){
 if(!VOICES.includes(voice))throw Error('Unsupported voice');
 await ensurePiper(run);
 const download=await run(['-m','piper.download_voices',voice,'--data-dir',dataDir],{timeout:600000});
 if(download.code!==0)throw Error('Downloading the voice failed: '+(lastLine(download.output)||'check your internet connection')+'.');
 return true;
}

function speak(text,model,audioPath,run=runPython){
 return run(['-m','piper','-m',model,'-f',audioPath,'--',text],{timeout:120000}).then(result=>{
  if(result.output==='missing-python')throw Error('Python is not installed. Install Python 3 from python.org, then download the voice again in Settings.');
  if(result.code!==0)throw Error('Piper speech generation failed: '+(lastLine(result.output)||'unknown error'));
 });
}

module.exports={VOICES,runPython,ensurePiper,installVoice,speak};
