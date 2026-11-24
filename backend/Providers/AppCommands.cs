using System.Text.Json;
namespace HoiClicky.Providers;

// Tells Claude how to operate HoiClicky itself. The desktop app parses the [[APP …]] markers,
// checks every action and asks the user before anything that widens Claude's permissions.
internal static class AppCommands {
 public const int MaxStateLength=8000;
 public static string Prompt(JsonElement state){
  var json=JsonSerializer.Serialize(state);
  if(json.Length>MaxStateLength)json="(app state too large to include)";
  return """
HoiClicky app control: when the user asks you to change something in the HoiClicky app itself (a setting, a new chat, opening settings, finding or opening a saved chat, stopping speech), do it by ending your reply with one marker per action, each on its own line, in this exact form:
[[APP {"action":"new_chat"}]]
Actions:
- {"action":"new_chat"}
- {"action":"open","page":"settings"} or {"action":"open","page":"chat"}
- {"action":"find_chats","query":"text"}
- {"action":"open_chat","title":"saved chat title"}
- {"action":"stop_speaking"}
- {"action":"set","setting":NAME,"value":VALUE} with NAME one of: model (a slug from models), provider (claude, ollama or chatgpt), screen (true/false), screens (all for every monitor, cursor for the monitor under the pointer), microphone (true/false), wake_word (true/false, hands-free "Hey Clicky" listening), speech_languages (list of the languages the user speaks, from de, en, fr, es, it, pt, nl, pl, tr, sq, hr, sr, bs, ru, uk, ar), mic_gain (microphone volume, 0.5 to 8; 1 is normal), speak_answers (true/false), talk_keys ({"key1":code,"key2":code} or key2 0 for a single key, codes from talk_keys.choices), sound (off, soft, bright, mp3), volume (completion sound, 0 to 1), voice_volume (spoken answers, 0 to 1), agent (true/false), agent_approval (ask, files, auto), agent_tools (list of files, commands, desktop, web)
Only add markers when the user asks for an app change. Say in one short sentence what you are changing. Turning on screen or microphone access and widening agent permissions ask the user to confirm, so say that it needs their OK. Never change agent_approval to auto unless the user explicitly asks for autonomous mode.
Current app state:
""" + json;
 }
}
