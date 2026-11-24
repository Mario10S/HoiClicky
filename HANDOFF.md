# HoiClicky contributor handoff

Start here if you are joining the project or asking an AI coding assistant to help. Read this file, the root [README](README.md), and [CLAUDE.md](CLAUDE.md) before changing code. The current public release is `v0.2.0-beta.1`; it is an early source-only Windows pre-release.

## Product direction

HoiClicky is a free AI screen companion for Windows: it understands the screen when explicitly asked, listens when asked, and helps turn conversations into actions. Keep the product identity original. Do not present ChatGPT Plus as general API access: ChatGPT sign-in is an optional official OpenAI integration whose eligibility, model availability, and limits are controlled by OpenAI. Ollama is the account-free local provider.

Preserve the upstream MIT license and attribution in [LICENSE](LICENSE). Do not add credentials, personal chat data, captured screenshots, microphone recordings, or local model files to the repository.

## Architecture

- `desktop/src/`: React UI built by Vite, including the chat, searchable local history, settings, voice flow, Markdown rendering, and floating island.
- `desktop/electron/main.cjs`: Electron windows, IPC, and lifecycle. `preload.cjs` exposes a narrow renderer bridge; keep `contextIsolation` and sandboxing enabled.
- `backend/`: .NET 8 Windows service. Electron communicates with it over newline-delimited JSON on standard input/output.
- Root C# files: shared Windows services for OAuth, DPAPI credentials, settings, capture, and voice. The backend links these files into its project.
- `backend/Providers/AiProviders.cs`: provider interface and ChatGPT/Ollama implementations.
- `speech/`: optional local Whisper setup and recognition helper. Audio is not saved to chat history.
- Root WPF files are legacy UI code; the active desktop experience is Electron + React.

## Already implemented

- Compact floating assistant, chat window, and searchable local conversation sidebar.
- Explicit screen-question send; capture currently takes the monitor containing the pointer.
- Optional official Sign in with ChatGPT flow and local Ollama provider with model selection.
- Optional Claude provider (`backend/Providers/ClaudeCodeProvider.cs`) that runs the user's own Claude Code CLI headless with tools disabled; sign-in uses Claude Code's browser login (`claude auth login`). Prompt and screenshot travel over stdin only, with `--no-session-persistence`. See the README's Claude connection section.
- Configurable push-to-talk with one key or two keys held together (Key 2 = None; Space cannot be used alone; rules in `backend/TalkKeys.cs`); local Whisper transcription when installed; transcript is sent on release.
- Agent mode for Claude and ChatGPT:
  - Agent chip, plus self-activation when the user asks for it (`[[AGENT_MODE]]` marker).
  - Tools: workspace files, commands, mouse/keyboard via `backend/DesktopMcp.cs` (started as `HoiClicky.Service --mcp-desktop`), and web.
  - Approval modes ask, files and auto, decided by `backend/Providers/AgentPolicy.cs`. `ClaudeAgentRunner.cs` handles Claude Code tool requests; `ChatGptAgentRunner.cs` handles stateless Responses API function calls and replays tool-call/output items. Both use the same Allow/Deny cards in the chat and floating panel.
  - Click preview through the companion cursor, a Stop button, and a 5-minute approval timeout.
  - The workspace folder is optional. Without one, the agent runs from `%LOCALAPPDATA%\HoiClicky\agent-home` with a desktop/web-focused prompt.
- App control ("Jarvis"):
  - With Claude, the chat sends the app state (`appContext` in `desktop/src/app-commands.mjs`), and `backend/Providers/AppCommands.cs` tells Claude to end replies with `[[APP {...}]]` markers.
  - Available actions: new chat, open settings/chat, find or open a saved chat, stop speaking, and changing the model, provider, screen, microphone, speak answers, talk keys, sound, volume, agent, agent approvals and agent tools.
  - `planAppAction` checks each action. Changes that widen Claude's access (screen or microphone on, broader approvals or tools) are confirmed through the approval card (`confirmAction`). The chat appends a "Done / Could not do" summary.
- Main window redesign ("night sky glass"):
  - Design tokens live in `desktop/src/style.css`: dark by default; light under `[data-theme=light]`. The theme follows Windows, with an override in Settings → General.
  - The floating panel always stays dark.
  - The rail shows chats, and in Settings it shows the categories General, AI & accounts, Voice, Agent and Privacy.
  - The home screen has a voice orb (click to talk; rings follow the mic level) and status-at-a-glance chips that open the matching settings.
  - Settings use the shared `SettingsGroup`/`SettingRow`/`Toggle`/`Segmented`/`Range` components in `main.jsx`. Approval modes are radio cards; sign-out and disconnect are secondary danger buttons.
  - The Answer voice card was nested inside Your boundaries and its labels had broken `?` characters; both are fixed.
  - Design rules came from the ui-ux-pro-max skill (contrast, focus rings, 150–300 ms motion, reduced motion, 32–44 px targets). Its generated teal palette was not used, to keep the existing lavender brand.
- Microphone gain and test (2026-11-24):
  - `MicGain` (0.5–8, default 1) is applied in software by `recognize.py`, `wake.py` (live through stdin `gain x`) and the new `speech/mictest.py`.
  - The mic test (`backend/MicTest.cs`, methods `micTestStart`/`micTestStop`, which bypass the gate and pause the wake listener) streams the level, the detection threshold, partial transcripts about every 0.9 s while speaking, final lines and a wake flag. It can also monitor the microphone through `sd.Stream`.
  - The wake word is easier: the name alone ("Clicky", "Klicki") counts at the start of a sentence, and the detection threshold went down (0.008, 3× noise floor). Status now reports `wakeReady`, because the ready event fires before the window loads.
  - Tests: speech tests 7/7, desktop tests 24/24, backend build clean. A backend protocol run started the test (ready, 10 level events per second), applied a gain change live and stopped cleanly.
  - On the dev PC the only input is "Microphone (Realtek Audio)" and it measured peak 0.0002 in silence. A very quiet or wrong input is the likely cause of missed wake words; the README tells users to raise Windows input volume too.
- Hands-free wake word, "Hey Clicky" / "Hoi Clicky" (off by default; Settings → Voice → Hands-free):
  - Detection (`speech/wake.py`): an energy segmenter with an adaptive noise floor cuts speech segments. A tiny Whisper model (`speech/model-wake`, downloaded on first use) transcribes each one with the initial prompt "Clicky", and `match_wake` checks for the greeting plus name variants.
  - After the wake word the question is recorded until about 1.2 s of silence (5 s timeout if nothing is said) and transcribed with the main Whisper model. If the question came in the same breath, the whole segment is re-read with the main model.
  - Backend (`backend/WakeListener.cs`): starts or stops the process when `WakeWord` and `AllowMicrophone` are both on, and pauses it during hold-to-talk. Program.cs maps its events onto the existing hold/voice events, so the UI and floating panel need no new flow. A wake word is ignored while a request holds the gate.
  - Speech languages (`SpeechLanguages`, default de+en; env `HOICLICKY_SPEECH_LANGUAGES`) reach `recognize.py`, `wake.py` and `mictest.py`. `speech/langs.py`.`transcribe_allowed` keeps an allowed Whisper guess and otherwise re-transcribes in the allowed language with the highest probability; a single language skips detection. Recognition used to be forced to English. Tests: `tests/Speech/test_langs.py`. A real check on English speech gave en with de+en allowed, de with only de, and es with fr+es.
  - Tests: `speech\.venv\Scripts\python.exe -m unittest discover -s tests/Speech` passed 5/5. With synthetic Piper speech, "Hey Clicky", "Hoi Clicky" (heard as "oy Clicky") and "Hey Clicky, what time is it in Tokyo?" were detected, the question was extracted, and an ordinary sentence with "click" was ignored. A backend protocol run started the listener ("ready") on enable and stopped it when the microphone was turned off.
  - Not yet verified live: a real voice and microphone in a noisy room, CPU use over long periods, and false triggers while HoiClicky itself is speaking (the listener is not paused during speech output yet).
- One speech output: answers are spoken only by the chat window, with the chosen voice. "Read aloud" in the floating panel sends `island-speech` (toggle/stop) to it instead of starting a second Windows voice, and its label follows the chat window's Speaking phase. "Stop reading", turning off Speak answers and the `stop_speaking` app action all call `shutUp()`, which stops Piper/ElevenLabs audio as well as Windows speech.
- Spoken answers are conversational: `desktop/src/speech-text.mjs` turns the chat answer into a short speech text. It skips the agent `**Steps**` list, italic status notes, headings, code blocks, tables, links, markdown symbols and emoji, reads at most about four sentences, and adds "Den Rest findest du im Chat." / "The rest is in the chat." when it shortened the answer. The chat still shows the full answer. Tests: `tests/Desktop/speech-text.test.mjs`.
- Response formatting, optional speech output/completion chime, and local MP3 completion sound.
- Floating assistant (`FloatingAssistant` in `desktop/src/main.jsx`, window logic in `desktop/electron/island-motion.cjs`) has three states: orb, status pill and a glass answer panel. The panel shows the full formatted answer, has a follow-up field (sent through the chat window via `island-ask`), Copy, Read aloud, Open chat, Quit and Pin buttons, and folds back into the orb after 30 s idle unless pinned. An agent Stop button appears in the status pill and panel while an agent run is active, so it remains available when the main chat is hidden. The main chat's X hides it; Quit in the floating panel exits the app. The orb and pill can be dragged anywhere; the panel moves by its header and resizes from its edges and corners. Windows cannot edge-resize transparent windows, so the renderer sends pointer deltas (`island-drag`). Position and panel size are remembered in `island.json` in Electron's user data. A rim light shows state: lavender orbits while thinking, mint follows the voice level while listening, rose marks errors.
- Local conversation persistence and recent-message context for follow-ups.
- Windows DPAPI protection for OAuth tokens; settings include screen/microphone permission controls and disconnect.
- Experimental companion cursor follows the mouse. Screen-answer circles are drawn independently without moving it. Explicit click requests immediately invoke named, enabled Windows accessibility controls after revalidation; live clicking still needs Windows verification. The user chose no confirmation popup, so inaccurate model coordinates may activate an unintended control.
- Screen answers can also request a temporary, click-through arrow or circle when helpful. Before preparing a confirmed click, the pointer and trail are hidden until the target has been revalidated and invoked. Both changes were brought from the separate HoiClicky working folder; live Windows verification is still needed, including mixed-DPI and multi-monitor placement, cancellation, and changed or obscured controls.
- Drawing/click merge checks (2026-11-23): `dotnet build backend/HoiClicky.Service.csproj -c Release` and `dotnet run --project tests/Providers/Providers.csproj` passed; Node 24 ran `--test tests/Desktop/*.test.mjs` (5/5), `--check` on the changed Electron scripts, and `desktop/node_modules/vite/bin/vite.js build` successfully. The normal Node shim had no active version; the installed Node executable was used. These checks do not establish live drawing or click behavior. Next: test both on Windows with an actual screen-capable provider and confirm or cancel clicks against named controls.
- Drawing follow-up (2026-11-23): circles and arrows draw in, fade over four seconds, and are removed shortly afterward; animation begins when the overlay is shown. Overlay code requests a non-focusable, mouse-ignoring, content-protected window. `dotnet build backend/HoiClicky.Service.csproj -c Release`, `dotnet run --project tests/Providers/Providers.csproj`, Node 24 `--test tests/Desktop/*.test.mjs` (6/6), Electron script syntax checks, and the Vite production build passed. The new desktop test uses a mock window to check options, negative-coordinate geometry and replacement/cleanup; it does not prove real mouse pass-through. A Windows Electron smoke-test launch exited before running (exit -2147483645) in the sandbox. Live drawing, actual fading, click-through, provider marker behavior, real multi-monitor/mixed-DPI alignment, confirmation and cancellation remain unverified. Next: run the app outside the sandbox and test on a harmless screen, including a second display if available; verify circles/arrows and fade, click through them, and check that explicit clicks still require confirmation. Coordinates are estimates and placement near display edges may be inaccurate.
- Action intent follow-up (2026-11-23): explicit requests such as “please close this window” now enter the existing confirmation flow if the model identifies a target; if no target is found the answer says no click was performed. Node desktop checks passed 7/7, and `dotnet build backend/HoiClicky.Service.csproj -c Release -o backend/bin/verification` succeeded. The normal output build was blocked because the running app held its DLL open. Close the app, rebuild the normal output, restart, and test with a harmless window. Recognition, targeting and confirmation still require a live check.
- Shutdown follow-up: a user reported a destroyed main window leaving the floating panel and backend processes behind. Actual app shutdown still cleans up the service and windows; the chat X now hides the main window so the floating assistant can remain available, and its Quit control requests full shutdown. Window IPC checks for a destroyed window before accessing it. Force-closing the terminal can bypass normal cleanup.
- Action wording follow-up: “Please close the notepad window” did not match the original intent detector. Named windows now match as well; the focused action-intent test passes. Restart Electron to load this main-process change. Actual model targeting and confirmation still need live verification.
- Direct action follow-up: the user explicitly chose immediate activation without a popup. Only explicit click/press/tap/activate or close-window requests enter the flow; vague “please do it” does not. A target is prepared and revalidated via accessibility before invocation, but that cannot establish model intent. Node desktop tests passed 9/9, provider tests passed, and the backend Release build succeeded. Next: restart and test on a harmless window, including target failures; real Windows activation remains unverified.
- Named-window follow-up: user reported Spotify's close control was unnamed and “Close Spotify” was not recognized. A narrowly phrased “Close <app>” now resolves a single visible window by title and requests close via WindowPattern; zero or multiple matches fail. This does not treat “close the Spotify tab” as closing an entire window. Desktop checks passed 10/10; backend compiled to `backend/bin/verification` because the running HoiClicky backend locked the usual output. The new path and Spotify's WindowPattern still need live Windows verification. Close HoiClicky and rebuild the normal backend before restarting.

## Important gaps

- There is no screen-context preview, region picker, OCR, or app exclusion list. Captures are whole-monitor images. Avoid sensitive screens.
- Conversation JSON is plain text in the current Windows user's Electron data folder; no ChatGPT website sync.
- No signed installer, auto-updater, comprehensive end-to-end testing, or broad real-device validation.
- Provider cancellation and recovery from backend/network interruptions need more work.
- Claude sign-in through the visible Claude Code console window has not yet been tested end to end on a signed-out machine. Each Claude request has a few seconds of CLI startup latency.
- Voice quality and startup latency need testing across real microphones and language setups.
- Document reading, dictation into other apps, notes/tasks, and conversation export/rename are not implemented.
- Experimental cursor targeting and confirmed control activation need live Windows testing. AI coordinates may be inaccurate, some controls lack an accessible Invoke action, and the screen may change after capture. Review and test confirmation, cancellation, stale targets, mixed DPI, multiple monitors, and accidental action requests before treating this as reliable.

## Recommended next task: review screen context before sending

Make a small privacy-focused slice before adding more screen features:

1. When a user asks about their screen, show a review step that clearly says which monitor/image will be used.
2. Let the user inspect the captured image, then choose **Send** or **Cancel**. Do not call the AI provider until **Send** is chosen.
3. Keep the capture in memory only; never add it to conversation history or write it to disk.
4. Respect the existing screen permission and image-capability checks. A cancelled request must never reach a provider.
5. Add focused tests for the confirmation/cancel flow and provider-call boundary.

After that, consider region capture and OCR, then cancellation/backend recovery, then encrypted/exportable conversation history and installer packaging. Improve pointing, and add document reading and cross-app dictation as later modules.

## Validation commands

From the repository root in PowerShell:

```powershell
dotnet build backend\HoiClicky.Service.csproj -c Release
cd desktop
npm install
npm run build
npm start
```

Focused existing checks from the root:

```powershell
node --test tests/Desktop/*.test.mjs
dotnet run --project tests/Providers/Providers.csproj
```

Builds and these focused checks passed when `v0.2.0-beta.1` was prepared. They do not prove live ChatGPT sign-in, microphone, screen-capture privacy, or real Ollama behavior. Re-run relevant checks after changing code and record their actual results.

Latest results (Claude provider and single-key push-to-talk, 2026-11-23): backend Release build succeeded with 0 warnings; `dotnet run --project tests/Providers/Providers.csproj` printed PASS for the Claude, push-to-talk and Ollama checks; `node --test tests/Desktop/*.test.mjs` passed 5/5; `npm run build` succeeded. A live Claude Max text answer and screen answer were verified through the backend protocol. Still needs manual Windows checks: single-key hold-to-talk with a real microphone, and Claude browser sign-in on a signed-out PC.

Floating panel redesign (2026-11-23): `npm run build` succeeded, desktop tests passed 5/5, provider checks passed, and `node --check` passed for the Electron files. The orb, listening pill, answer panel, thinking state and error state were rendered with sample data in an offscreen Electron window and reviewed visually. The real window uses content protection, so screenshots of it show black. Still needs live checks: dragging and resizing on mixed-DPI and multi-monitor setups, typing follow-ups from the panel, and the 30 s auto-fold.

Agent mode (2026-11-23):
- Checks: backend build had 0 warnings, provider checks printed PASS including the new agent checks, desktop tests passed 5/5, and `npm run build` succeeded.
- Live Claude runs through the service protocol, each with a scratch workspace:
  - ask + Allow created the file.
  - ask + Deny created nothing, and Claude stopped and explained.
  - files mode created the file without a prompt.
  - A PowerShell command ran after approval.
  - Claude Code listed the five `mcp__desktop__*` tools.
- The desktop MCP server answered `initialize`/`tools/list`, returned a 1280x720 screenshot of a 2560x1440 monitor, and rejected an out-of-range click.
- The approval card was rendered and reviewed in the floating panel.
- Not yet verified live: a real approved click/typing sequence, the companion-cursor click preview, Stop during a long run, and self-activation from chat.

App control and optional workspace (2026-11-23):
- Checks: desktop tests passed 11/11 (new app-command checks), provider checks printed PASS (agent without workspace, app control prompt), the backend built with 0 warnings, and `npm run build` succeeded.
- Live Claude runs:
  - "Model to Opus, talk key only F8, new chat" produced exactly those three markers.
  - "Screen on and read answers aloud" produced only the speak-answers marker and asked for the user's OK for the screen.
  - A plain question produced no marker.
  - An agent run without a workspace started and used the desktop-focused prompt.
- Not yet verified in the live UI: running the actions, the confirmation card for sensitive changes, and new chat or open chat switching.

Windows, tabs and monitors (2026-11-23):
- `backend/OpenWindows.cs` lists visible top-level windows (EnumWindows; skips tool, owned and cloaked windows and HoiClicky itself). It reads browser tabs through MSAA (`AccessibleObjectFromWindow`, page-tab role). Opera exposed no UI Automation tree but returned all 11 tabs through MSAA.
- Desktop MCP:
  - `screenshot` takes `monitor` (number or `all`).
  - New tools: `list_windows`, `focus_window`, `activate_tab` and `close_window`.
- Chat screen questions capture all monitors by default (`ScreenScope` setting / "Screens to include") and append the window and tab summary.
- Checks: provider checks passed (monitor numbering, listing format, tab matching, policy for the new tools) and desktop tests passed 16/16.
- Local MCP run: 2 monitors detected (2560x1440 and 1080x1920 portrait), all-monitor screenshot at 1568x827, monitor-2 screenshot at 720x1280, invalid monitor rejected, 7 windows and 11 Opera tabs listed with the active tab marked.
- Not yet verified live: `activate_tab`, `focus_window`, `close_window` and Claude using them.

ChatGPT agent mode is implemented; `docs/agent-mode-for-chatgpt.md` records its design and known limits. Live ChatGPT account and desktop-action verification remain outstanding.

Next recommended task: live-test agent clicks on a harmless app (for example Notepad) and tune the screenshot/click loop, then return to the screenshot review step below.

## Working with Claude

Open this repository in Claude Code and ask it to read `CLAUDE.md` and this handoff. Have it implement only the recommended next task, then review the diff and test results before merging. Do not ask it to publish, release, or send messages as part of coding work.

## Keeping this handoff current

After each meaningful change, update this file with the current behavior, open problems, next steps, and what was actually tested. Move completed items out of the gaps list and keep uncertain or untested behavior clearly labeled. Capture useful ideas as proposals, not promises. Check GitHub for teammate changes before pushing small, reviewable commits; avoid overwriting others' work. Never commit secrets, personal conversations, captures, or local data. Use issues for larger tasks when useful, and link them here if created.

### Ideas to consider

- A toggle and configurable appearance for the companion cursor.
- Faster cursor rendering and reliable targeting across displays with different scaling.
- A clear preview and approval flow for screen context and requested actions.

- Voice output update (2026-11-23): answer speech is enabled by default with a setting to turn it off. Added local Piper voices (German Thorsten high and English Lessac medium), per-user model download, voice preview, stop control, and optional ElevenLabs. Piper is installed locally with Python and its German model is stored under the user's Electron data folder; no chat answer text leaves the PC when Piper is selected. ElevenLabs only receives the answer text and requires the user's own API key, encrypted with Electron safeStorage. `npm run build --prefix desktop` passed; desktop Node tests passed 10/10; Piper generated a test WAV successfully. Live listening and in-app playback still need confirmation. Piper upstream engine is GPL-3.0; voice model licenses vary, so inspect each model card before redistributing voices.
- Piper first-run fix (2026-11-23): on a PC without the `piper-tts` package, "Download free voice" failed. `desktop/electron/piper.cjs` now checks `import piper`, installs `piper-tts` with `py -m pip install --user` when missing, then downloads the voice, and explains a missing Python or a failed pip install. Tests: `tests/Desktop/piper.test.mjs`. On a clean machine it installed Piper (about 10 s), downloaded `en_US-lessac-medium` and rendered a test WAV through the same module.


- ChatGPT agent mode (2026-11-23): added a Responses API tool loop with `store:false`, function-call replay, OAuth token usage, workspace file read/list/search/write/edit tools, bounded PowerShell, HTTPS fetch and existing desktop MCP tools. All tools pass AgentPolicy and existing approvals; Stop cancels the Responses stream, command process and MCP process. Screenshots/tool results remain in memory. Provider tests cover fake response replay and denied writes; desktop tests pass 16/16; backend Release and Vite production builds pass. Live ChatGPT-account and desktop-action verification remains outstanding.
- ChatGPT agent follow-up (2026-11-23): fixed app-control validation so a ChatGPT reply can switch ChatGPT agent mode on; Ollama remains unsupported. Removed the stale note saying the feature was not built and marked the original implementation prompt as historical. Checks: `node --test tests/Desktop/*.test.mjs` passed 19/19, `dotnet run --project tests\Providers\Providers.csproj` passed, `npm run build --prefix desktop` passed, and `dotnet build backend\HoiClicky.Service.csproj -c Release -o backend\bin\verification` succeeded with 0 warnings/errors. HoiClicky was already open with overlapping active windows, so no live ChatGPT account/action test was attempted; live verification remains outstanding.
- Floating Stop control (2026-11-23): agent-running state now reaches the island; Stop is available in its pill and answer panel. Closing the main chat hides it while keeping the island and agent available; Quit in the island panel exits normally. `npm run build` and `node --check desktop/electron/main.cjs` plus `node --check desktop/electron/preload.cjs` passed. Live Stop and hide/quit behavior still need a Windows interaction check; restart HoiClicky to load the change.
