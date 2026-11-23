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
- Response formatting, optional speech output/completion chime, and local MP3 completion sound.
- Floating assistant (`FloatingAssistant` in `desktop/src/main.jsx`, window logic in `desktop/electron/island-motion.cjs`) has three states: orb, status pill and a glass answer panel. The panel shows the full formatted answer, has a follow-up field (sent through the chat window via `island-ask`), Copy, Read aloud, Open chat and Pin buttons, and folds back into the orb after 30 s idle unless pinned. The orb and pill can be dragged anywhere; the panel moves by its header and resizes from its edges and corners. Windows cannot edge-resize transparent windows, so the renderer sends pointer deltas (`island-drag`). Position and panel size are remembered in `island.json` in Electron's user data. A rim light shows state: lavender orbits while thinking, mint follows the voice level while listening, rose marks errors.
- Local conversation persistence and recent-message context for follow-ups.
- Windows DPAPI protection for OAuth tokens; settings include screen/microphone permission controls and disconnect.
- Experimental companion cursor follows the mouse. Screen-answer circles are drawn independently without moving it. Explicit click requests immediately invoke named, enabled Windows accessibility controls after revalidation; live clicking still needs Windows verification. The user chose no confirmation popup, so inaccurate model coordinates may activate an unintended control.
- Screen answers can also request a temporary, click-through arrow or circle when helpful. Before preparing a confirmed click, the pointer and trail are hidden until the target has been revalidated and invoked. Both changes were brought from the separate HoiClicky working folder; live Windows verification is still needed, including mixed-DPI and multi-monitor placement, cancellation, and changed or obscured controls.
- Drawing/click merge checks (2026-11-23): `dotnet build backend/HoiClicky.Service.csproj -c Release` and `dotnet run --project tests/Providers/Providers.csproj` passed; Node 24 ran `--test tests/Desktop/*.test.mjs` (5/5), `--check` on the changed Electron scripts, and `desktop/node_modules/vite/bin/vite.js build` successfully. The normal Node shim had no active version; the installed Node executable was used. These checks do not establish live drawing or click behavior. Next: test both on Windows with an actual screen-capable provider and confirm or cancel clicks against named controls.
- Drawing follow-up (2026-11-23): circles and arrows draw in, fade over four seconds, and are removed shortly afterward; animation begins when the overlay is shown. Overlay code requests a non-focusable, mouse-ignoring, content-protected window. `dotnet build backend/HoiClicky.Service.csproj -c Release`, `dotnet run --project tests/Providers/Providers.csproj`, Node 24 `--test tests/Desktop/*.test.mjs` (6/6), Electron script syntax checks, and the Vite production build passed. The new desktop test uses a mock window to check options, negative-coordinate geometry and replacement/cleanup; it does not prove real mouse pass-through. A Windows Electron smoke-test launch exited before running (exit -2147483645) in the sandbox. Live drawing, actual fading, click-through, provider marker behavior, real multi-monitor/mixed-DPI alignment, confirmation and cancellation remain unverified. Next: run the app outside the sandbox and test on a harmless screen, including a second display if available; verify circles/arrows and fade, click through them, and check that explicit clicks still require confirmation. Coordinates are estimates and placement near display edges may be inaccurate.
- Action intent follow-up (2026-11-23): explicit requests such as “please close this window” now enter the existing confirmation flow if the model identifies a target; if no target is found the answer says no click was performed. Node desktop checks passed 7/7, and `dotnet build backend/HoiClicky.Service.csproj -c Release -o backend/bin/verification` succeeded. The normal output build was blocked because the running app held its DLL open. Close the app, rebuild the normal output, restart, and test with a harmless window. Recognition, targeting and confirmation still require a live check.
- Shutdown follow-up: a user reported a destroyed main window leaving the floating panel and backend processes behind. Closing the main window now requests app shutdown, and window IPC checks for a destroyed window before accessing it. Node syntax and desktop tests passed (7/7); real shutdown and child-process cleanup still need verification. Force-closing the terminal can bypass normal cleanup.
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

## Working with Claude

Open this repository in Claude Code and ask it to read `CLAUDE.md` and this handoff. Have it implement only the recommended next task, then review the diff and test results before merging. Do not ask it to publish, release, or send messages as part of coding work.

## Keeping this handoff current

After each meaningful change, update this file with the current behavior, open problems, next steps, and what was actually tested. Move completed items out of the gaps list and keep uncertain or untested behavior clearly labeled. Capture useful ideas as proposals, not promises. Check GitHub for teammate changes before pushing small, reviewable commits; avoid overwriting others' work. Never commit secrets, personal conversations, captures, or local data. Use issues for larger tasks when useful, and link them here if created.

### Ideas to consider

- A toggle and configurable appearance for the companion cursor.
- Faster cursor rendering and reliable targeting across displays with different scaling.
- A clear preview and approval flow for screen context and requested actions.
