// Turns a chat answer into what HoiClicky should actually say out loud: a short, natural reply.
// The chat keeps the full answer; speech skips agent step lists, status notes, code, tables, links,
// markdown symbols and emoji, and stops after the first few sentences.
const MAX_CHARS=420,MAX_SENTENCES=4;

const GERMAN=/\b(und|ich|du|nicht|ist|das|die|der|den|dem|ein|eine|einen|mit|auf|für|habe|hast|kannst|bitte|auch|noch|schon|wir|sie|es|ja|nein|danke|gerne|hier|sind|wird|kein|keine|aber|oder|wenn|weil|dann|mein|dein|zu|von|im)\b/gi;
const ENGLISH=/\b(the|and|is|are|you|your|it|to|of|in|that|for|with|this|on|i|what|can|have|has|not|be|was|will|do|does|here|there|yes|no|thanks|please|my|we|they|if|but|or|an|a)\b/gi;
// Guesses whether a text is German or English from common words and umlauts; null when it can't tell.
export function detectLanguage(text){
 const value=String(text??'');
 const de=(value.match(GERMAN)||[]).length+(value.match(/[äöüßÄÖÜ]/g)||[]).length*0.5;
 const en=(value.match(ENGLISH)||[]).length;
 if(de===0&&en===0)return null;
 return de>=en?'de':'en';
}
const isGerman=text=>detectLanguage(text)==='de';

export function speechText(answer){
 let text=String(answer??'').replace(/\r\n/g,'\n');
 // Agent step list ("**Steps**" followed by bullet lines) is for reading, not listening.
 text=text.replace(/^\*\*Steps\*\*\n(?:[-*] .*(?:\n|$))*/m,'');
 // Fenced code and tables: never read symbol soup aloud.
 const hadCode=/```/.test(text);
 text=text.replace(/```[\s\S]*?(```|$)/g,'');
 text=text.split('\n').filter(line=>!/^\s*\|/.test(line)).join('\n');
 // Status notes written in italics on their own line (_Done: …_, _Stopped._, _Agent mode is on…_).
 text=text.split('\n').filter(line=>!/^\s*_[^_].*_\s*$/.test(line)).join('\n');
 // Headings are structure, not conversation.
 text=text.split('\n').filter(line=>!/^\s*#{1,6}\s/.test(line)).join('\n');
 text=text
  .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')       // links → their text
  .replace(/https?:\/\/\S+/g,'')                // bare URLs
  .replace(/`([^`]+)`/g,'$1')                   // inline code → plain words
  .replace(/(\*\*|__)(.+?)\1/g,'$2')            // bold
  .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[.,!?;:]|$)/g,'$1$2') // italics
  .replace(/^\s*>\s?/gm,'')                     // quotes
  .replace(/^\s*[-*•]\s+(.*)$/gm,(_,item)=>/[.!?:;]$/.test(item.trim())?item.trim():item.trim()+'.') // list items → sentences
  .replace(/^\s*\d+[.)]\s+(.*)$/gm,(_,item)=>/[.!?:;]$/.test(item.trim())?item.trim():item.trim()+'.')
  .replace(/\p{Extended_Pictographic}️?/gu,'')
  .replace(/[*#_~|]/g,'')
  .replace(/\s*\n+\s*/g,' ')
  .replace(/\s{2,}/g,' ')
  .trim();
 if(!text)return hadCode?(isGerman(answer)?'Ich habe dir den Code in den Chat geschrieben.':'I put the code in the chat.'):'';
 // Keep it conversational: the first few sentences, then point to the chat for the rest.
 const sentences=text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(s=>s.trim()).filter(Boolean)||[text];
 let spoken='',count=0;
 for(const sentence of sentences){if(count>=MAX_SENTENCES||(spoken&&spoken.length+sentence.length>MAX_CHARS))break;spoken+=(spoken?' ':'')+sentence;count++;}
 if(!spoken)spoken=text.slice(0,MAX_CHARS).replace(/\s+\S*$/,'')+'…';
 const rest=sentences.length>count||hadCode;
 if(rest)spoken+=isGerman(answer)?' Den Rest findest du im Chat.':' The rest is in the chat.';
 return spoken;
}
