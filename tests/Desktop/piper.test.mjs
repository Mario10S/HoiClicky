import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {ensurePiper,installVoice}=createRequire(import.meta.url)('../../desktop/electron/piper.cjs');

// Fake Python launcher: records calls and answers from a script keyed by the first argument.
function fake(answers){const calls=[];const run=async args=>{calls.push(args);const key=args[0]==='-c'?'check':args[1];const queue=answers[key];return Array.isArray(queue)?queue.shift():queue;};return {run,calls};}

test('installs piper-tts when it is missing, then downloads the voice',async()=>{
 const {run,calls}=fake({check:[{code:1,output:'No module named piper'},{code:0,output:''}],pip:{code:0,output:'Successfully installed piper-tts'},'piper.download_voices':{code:0,output:''}});
 assert.equal(await installVoice('en_US-lessac-medium','C:/voices',run),true);
 assert.deepEqual(calls.map(c=>c.slice(0,2).join(' ')),['-c import piper','-m pip','-c import piper','-m piper.download_voices']);
 assert.ok(calls[1].includes('piper-tts')&&calls[1].includes('--user'));
 assert.deepEqual(calls[3].slice(2),['en_US-lessac-medium','--data-dir','C:/voices']);
});

test('skips installing when piper is already there',async()=>{
 const {run,calls}=fake({check:{code:0,output:''}});
 assert.equal(await ensurePiper(run),false);assert.equal(calls.length,1);
});

test('explains a missing Python and failed installs',async()=>{
 await assert.rejects(ensurePiper(fake({check:{code:-1,output:'missing-python'}}).run),/Python is not installed/);
 await assert.rejects(ensurePiper(fake({check:{code:1,output:''},pip:{code:1,output:'ERROR: No matching distribution found for piper-tts'}}).run),/No matching distribution/);
 await assert.rejects(installVoice('xx_XX-nope','C:/v',fake({}).run),/Unsupported voice/);
});
