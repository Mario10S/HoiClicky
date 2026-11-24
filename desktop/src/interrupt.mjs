// Decides what a spoken interruption means: stop the current work, stop and do something else, or a follow-up for later.
const LEAD = String.raw`(?:(?:nein|nee|no|nope|okay|ok|hey|hoi|jarvis|clicky|friday|computer|warte|wait)\s+)*`;
const STOP = [
 'stopp?', 'halt', 'hör (?:mal )?auf', 'hoer (?:mal )?auf', 'aufhören', 'abbrechen', 'brich (?:das |es )?ab', 'lass (?:das|es|mal|gut sein)',
 'vergiss (?:es|das)', 'sei (?:mal )?(?:still|ruhig)', 'ruhe', 'schluss', 'genug', 'das reicht', 'nicht (?:mehr|weiter(?:machen)?)',
 'mach (?:das |es )?nicht(?: mehr)?', 'cancel', 'abort', 'never ?mind', 'forget (?:it|that)', "don'?t do (?:that|it)", 'stop (?:that|it)',
 'enough', 'shut up', 'be quiet', 'quiet',
].join('|');
// Words that only finish the stop phrase ("hör auf zu reden", "stop talking", "bitte").
const TAIL = String.raw`(?:\s+(?:bitte|please|jetzt|now|sofort|damit|mehr|mal|zu \w+|talking|working|that|it|everything|alles))*`;
const startPattern = new RegExp(`^${LEAD}(?:${STOP})${TAIL}(?:$|\\s+(.*)$)`);
const anywhere = /\b(?:stopp?|hör auf|hoer auf|abbrechen|brich ab|lass das|nicht mehr|mach das nicht|cancel|never ?mind|don'?t do that|stop that)\b/;
const CONNECTOR = /^(?:(?:und|and|aber|but|dann|then|sondern|stattdessen|instead|lieber|rather|bitte|please|mach|do)\s+)+/;

const normalize = text => String(text || '').toLowerCase().replace(/[“”"„.!?;:]+/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

/** Returns {stop:boolean, rest:string}. rest is the new request after a stop ("stopp, mach stattdessen X" → "X"). */
export function interruptIntent(text) {
 const said = normalize(text);
 if (!said) return { stop: false, rest: '' };
 const start = said.match(startPattern);
 if (start) {
  const tail = (start[1] || '').trim();
  const rest = tail.replace(CONNECTOR, '').trim();
  // A real new request needs a few words; "stopp danke" is still just a stop.
  return { stop: true, rest: rest.split(' ').length >= 2 || /^(?:stattdessen|instead|lieber|sondern)\b/.test(tail) && rest ? restoreCase(text, rest) : '' };
 }
 if (said.split(' ').length <= 7 && anywhere.test(said)) return { stop: true, rest: '' };
 return { stop: false, rest: '' };
}

// Gives the rest back with the user's original capitalisation where it can be found.
function restoreCase(original, rest) {
 const at = String(original).toLowerCase().lastIndexOf(rest.split(' ')[0]);
 if (at < 0) return rest;
 const piece = String(original).slice(at).replace(/^[\s,]+|[\s.!]+$/g, '');
 return piece.toLowerCase().replace(/[“”"„.!?;:,]+/g, ' ').replace(/\s+/g, ' ').trim() === rest ? piece : rest;
}
