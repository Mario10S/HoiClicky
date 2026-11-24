import test from 'node:test';
import assert from 'node:assert/strict';
import {speechText,detectLanguage} from '../../desktop/src/speech-text.mjs';

test('skips agent steps and status notes, keeps the actual reply',()=>{
 const answer='**Steps**\n- Look at the screen\n- Click at 640, 412\n- Type “Hallo”\n\nIch habe Hallo in den Editor geschrieben.\n\n_Done: Model → Claude Opus_';
 assert.equal(speechText(answer),'Ich habe Hallo in den Editor geschrieben.');
});

test('removes markdown symbols, headings, links and code',()=>{
 const answer='## Auffällig\nDu hast **Opera** mit 11 Tabs offen. Siehe [die Doku](https://example.com).\n- Ein YouTube-Tab spielt Musik\n- Im Terminal läuft `npm start`';
 assert.equal(speechText(answer),'Du hast Opera mit 11 Tabs offen. Siehe die Doku. Ein YouTube-Tab spielt Musik. Im Terminal läuft npm start.');
 assert.ok(!/[*#`]|https?:/.test(speechText(answer)));
});

test('never reads code blocks or tables aloud',()=>{
 assert.equal(speechText('Hier ist das Skript:\n```powershell\nGet-ChildItem | Measure-Object\n```'),'Hier ist das Skript: Den Rest findest du im Chat.');
 assert.equal(speechText('```js\nconsole.log(1)\n```'),'I put the code in the chat.');
 assert.equal(speechText('Here is the comparison.\n| A | B |\n|---|---|\n| 1 | 2 |'),'Here is the comparison.');
});

test('keeps long answers short and points to the chat',()=>{
 const long='Das ist der erste Satz. Das ist der zweite Satz. Das ist der dritte Satz. Das ist der vierte Satz. Das ist der fünfte Satz. Das ist der sechste Satz.';
 const spoken=speechText(long);
 assert.ok(spoken.startsWith('Das ist der erste Satz.'));
 assert.ok(spoken.endsWith('Den Rest findest du im Chat.'));
 assert.ok(!spoken.includes('fünfte'));
 assert.equal(speechText('Paris is the capital of France.'),'Paris is the capital of France.');
});

test('detects whether an answer is German or English',()=>{
 assert.equal(detectLanguage('Ich habe die Datei für dich gespeichert.'),'de');
 assert.equal(detectLanguage('Du hast Opera mit 11 Tabs offen.'),'de');
 assert.equal(detectLanguage('Tschüss, schönen Abend!'),'de');
 assert.equal(detectLanguage('I saved the file for you.'),'en');
 assert.equal(detectLanguage('Your calendar has two meetings today.'),'en');
 assert.equal(detectLanguage('12:45'),null);
});

test('drops emoji and agent notes',()=>{
 assert.equal(speechText('Fertig! 🎉 Alles erledigt ✅'),'Fertig! Alles erledigt');
 assert.equal(speechText('_Agent mode is on because you asked for it._'),'');
});
