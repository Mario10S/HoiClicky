import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {glowState}=createRequire(import.meta.url)('../../desktop/electron/glow.cjs');

test('screen glow follows listening, thinking and agent work',()=>{
 assert.equal(glowState({}),'off');
 assert.equal(glowState({listening:true}),'listening');
 assert.equal(glowState({busy:true}),'working');
 assert.equal(glowState({busy:true,agent:true}),'agent');
 assert.equal(glowState({listening:true,busy:true,agent:true}),'listening','listening wins so you see it hears you');
});

test('screen glow can be turned off',()=>{
 assert.equal(glowState({enabled:false,listening:true,busy:true,agent:true}),'off');
});
