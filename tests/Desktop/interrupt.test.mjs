import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptIntent } from '../../desktop/src/interrupt.mjs';

test('plain stop phrases in German and English', () => {
 for (const said of ['Stopp!', 'Stop.', 'Hör auf', 'Hör auf zu reden', 'Jarvis, hör auf.', 'Nein, lass das!', 'Abbrechen bitte', 'Mach das nicht mehr',
  'Das reicht.', 'Vergiss es', 'Sei still', 'Okay stop', 'Never mind', "Don't do that", 'Stop talking', 'Cancel'])
  assert.deepEqual(interruptIntent(said), { stop: true, rest: '' }, said);
});

test('short sentences that ask to stop somewhere in the middle', () => {
 for (const said of ['Du sollst das nicht mehr machen', 'Bitte hör auf damit', 'Nein bitte abbrechen', 'Please stop that now'])
  assert.equal(interruptIntent(said).stop, true, said);
});

test('stop and do something else instead', () => {
 assert.deepEqual(interruptIntent('Stopp, mach stattdessen eine Liste in Word.'), { stop: true, rest: 'eine Liste in Word' });
 assert.deepEqual(interruptIntent('Hör auf und öffne Spotify'), { stop: true, rest: 'öffne Spotify' });
 assert.deepEqual(interruptIntent('Stop, instead open the Downloads folder'), { stop: true, rest: 'open the Downloads folder' });
});

test('follow-ups and ordinary questions are not stops', () => {
 for (const said of ['Und schau auch noch nach dem Wetter', 'Wie spät ist es?', 'Mach die Datei bitte größer', 'Halte die Liste kurz',
  'Kannst du danach noch die Mail schreiben, in der steht, dass ich nicht mehr komme und dass wir das Treffen verschieben', ''])
  assert.equal(interruptIntent(said).stop, false, said);
});
