# HoiClicky

**A free AI screen companion that understands your screen, listens when asked, and helps turn conversations into actions.**

HoiClicky is an early Windows 11 pre-release. It is an independent Windows port inspired by the MIT-licensed YoClicky project. It is not affiliated with OpenAI or the original authors. The upstream MIT license and attribution are preserved in [LICENSE](LICENSE).

## What works today

- Compact floating assistant with a chat window and searchable local conversation sidebar.
- Ask about the current screen on demand. A screenshot is captured only when you send a screen question. It covers all monitors by default (Settings → Screens to include can limit it to the monitor under the pointer), and the question also lists the open windows and browser tabs (read through Windows accessibility) so the AI knows what is hidden behind other windows.
- Choose a local Ollama model, or optionally connect an eligible ChatGPT account through OpenAI's official Sign in with ChatGPT flow. ChatGPT plan access and available models depend on OpenAI's eligibility and limits; a ChatGPT subscription does not provide API-key access.
- Optionally use Claude through your own installed [Claude Code](https://claude.com/claude-code). Sign-in opens the browser via Claude Code's official `claude auth login`; usage counts toward your own Claude plan and its limits.
- Hold one configurable key, or two keys together, to record speech, then transcribe locally with Whisper when set up. The transcript is sent automatically after you release the key. Speech is only recognized in the languages you pick (Settings → Voice → Languages I speak; German and English by default). If Whisper guesses another language, the audio is transcribed again in the closest allowed one, while single foreign words inside a sentence still come through.
- Optional hands-free mode: turn on “Hey Clicky” in Settings → Voice. Say “Hey Clicky” or “Hoi Clicky”, then your question, or say it in one go (“Hey Clicky, what's on my screen?”). The question is sent when you pause. It is off by default and needs the microphone permission and local Whisper. While it is on, `speech/wake.py` checks short speech segments on this PC with a tiny Whisper model (downloaded once, about 75 MB, to `speech/model-wake`). Nothing is recorded, stored or sent before the wake word. Saying just “Clicky” at the start of a sentence also works.
- Microphone volume and test (Settings → Voice → Microphone): boost a quiet microphone up to 800 % for every speech feature. The live test shows your level against the speech-detection line, writes down what HoiClicky understands as you speak, marks when it recognized “Hey Clicky”, and can play your voice back live (use headphones). If the level barely moves, also raise the input volume in Windows (Settings → System → Sound → Input).
- Render formatted answers, choose a completion chime, or select an MP3 from your PC.
- Keep conversations on this PC and continue them later. Recent text is included for follow-up questions; old screenshots are not resent.
- Protect OAuth tokens with Windows DPAPI and disconnect from the app's Settings.

## Early-release limits

This build is still a work in progress. Screen questions currently capture the monitor containing the pointer; there is no region picker, OCR, context preview or application exclusion list yet. Do not use it to capture sensitive screens. Local chat history is plain text in the current Windows user profile and does not sync to ChatGPT. Speech setup is optional and requires downloading the Whisper model. There is no signed installer or automatic updater yet.

## Run from source

Requirements: Windows 11, .NET 8 SDK, Node.js and npm. Ollama (local AI) and Claude Code (Claude provider) are optional. Network access is required for package restore, ChatGPT sign-in, and cloud requests.

```powershell
git clone https://github.com/Mario10S/HoiClicky.git
cd HoiClicky
dotnet build backend\HoiClicky.Service.csproj -c Release
cd desktop
npm install
npm start
```

After the first setup you can simply double-click `Start HoiClicky.cmd` in the repository root. It checks for .NET and Node.js, installs packages on the first run, rebuilds the service and interface (so pulled changes are included), and opens the app without leaving a console window. Some antivirus products flag launcher scripts by mistake; if the file disappears, restore it from quarantine and exclude the folder.

To enable local Whisper speech recognition, run `powershell -ExecutionPolicy Bypass -File ..\speech\setup.ps1` from the `desktop` directory. This downloads Python dependencies and the Whisper model. Microphone capture begins only when push-to-talk is triggered and microphone access is enabled.

## ChatGPT connection

The optional account connection uses OpenAI's documented [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/quickstart/) flow, including dynamic client registration, PKCE and a local callback. The user approves the app and permissions in OpenAI's sign-in flow. Account eligibility, model availability and usage limits are determined by OpenAI. HoiClicky does not use browser cookies, session scraping or a hard-coded API key.

## Claude connection

The optional Claude provider runs the user's own Claude Code CLI (`claude -p`) in headless mode. Anthropic does not offer a sign-in flow for third-party apps, so HoiClicky does not implement its own Claude OAuth: **Sign in with Claude** opens Claude Code's official browser sign-in (`claude auth login`) in a separate window, and Claude Code keeps its own login. HoiClicky never reads or stores Claude credentials. **Sign out** runs `claude auth logout`, which also signs out Claude Code on this PC.

- Requests run with all Claude Code tools disabled (`--tools ""`), without MCP servers, user settings or slash commands, from an empty working folder (`%LOCALAPPDATA%\HoiClicky\claude-work`). Claude only answers; it cannot act on the PC.
- The question, recent chat text and any explicitly captured screenshot are sent to Claude Code over standard input only, never on the command line or to disk. `--no-session-persistence` keeps Claude Code from saving the conversation.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are removed from Claude Code's environment so the browser login is used, even when a stale key is set in Windows.
- Each request starts a Claude Code process, which adds a few seconds of latency.

## Agent mode (Claude)

With Claude selected, the **Agent** chip in the chat lets Claude act on the PC instead of only answering. Claude can also switch it on itself when you explicitly ask it to do a task in agent mode; the chat says so when that happens.

- **Workspace folder:** optional. Without one, Claude runs from an empty folder of its own (`%LOCALAPPDATA%\HoiClicky\agent-home`), focuses on desktop and web tasks such as closing windows or clicking buttons, and file access outside it asks first.
- **Tools**, each switchable in Settings → Agent mode: files in the workspace folder, PowerShell/terminal commands, mouse and keyboard (through HoiClicky's own desktop MCP server: screenshot of one monitor or all, click, type, keys, scroll, plus list_windows with browser tabs, focus_window, activate_tab and close_window), and web search/fetch. Focusing a window or switching a tab never asks; closing a window does.
- **Approvals**:
  - *Ask before every change* (default): every edit, command, click and keystroke shows an Allow/Deny card in the chat and the floating panel.
  - *Workspace files freely*: edits inside the workspace run without asking; everything else still asks.
  - *Autonomous*: nothing asks. It is not recommended: Claude can then delete files, run any command and click anything.
- **What never asks:** reading inside the workspace and taking screenshots. Screenshots also respect the screen permission.
- **Click preview:** before a click or scroll, the companion cursor shows the target.
- **Stop:** the Stop button ends the agent at once and denies anything still pending. Unanswered approvals are denied after five minutes.
- **How it runs:** Claude Code runs with `--permission-prompt-tool stdio`, so every tool request reaches HoiClicky first (`backend/Providers/AgentPolicy.cs` decides, `ClaudeAgentRunner.cs` asks the user). Sessions are not persisted.
- **Limits:** click coordinates come from a scaled screenshot and can miss, and the screen can change between screenshot and click. Elevated (administrator) windows ignore simulated input.


## Agent mode (ChatGPT)

ChatGPT users can turn on the **Agent** chip to let the signed-in model use HoiClicky's agent tools. It uses the existing Sign in with ChatGPT connection and Responses API; it does not require an API key. Eligible account and model access depends on OpenAI. Available tools include workspace file reading, listing, searching, editing and writing; PowerShell commands; HTTPS page fetch; and HoiClicky's desktop controls through its local MCP server.

The existing Settings ? Agent mode controls apply to ChatGPT too: tool groups, workspace, and Ask / Workspace files freely / Autonomous approval modes. In Ask mode, edits, commands and desktop actions show Allow/Deny cards; screen capture and window listing require screen permission. Stop cancels the request and pending approvals. Screenshots are sent only when the user explicitly sends a screen question or the agent is enabled and the model requests its screen tool; images and tool outputs are not saved in chat history. OpenAI receives the prompt, recent text context, and any requested screenshot. ChatGPT subscriptions do not guarantee eligibility or unlimited use.

## Privacy and local files

- OAuth credentials are protected with Windows DPAPI under `%LOCALAPPDATA%\HoiClicky\credentials.dpapi`.
- Non-secret preferences are stored in `%LOCALAPPDATA%\HoiClicky\settings.json`.
- Conversations are stored as plain-text JSON in Electron's user data folder under `conversations` (normally `%APPDATA%\hoiclicky-desktop\conversations`). They are separate from ChatGPT website history.
- Screenshots and microphone audio are not saved to conversation files. Screen images are sent only after the user sends a screen question or explicitly enables Agent mode and the selected agent calls the screen tool; screen permission still applies.
- Ollama requests go to the local Ollama service. When ChatGPT is selected, request text and any explicitly captured screenshot are sent to OpenAI. When Claude is selected, they are sent to Anthropic through Claude Code.

## Development checks

```powershell
node --test tests/Desktop/*.test.mjs
dotnet run --project tests/Providers/Providers.csproj
```

These checks exercise formatting, local history, audio settings and provider behavior with test doubles. They do not replace testing on a real Windows installation, microphone, display, Ollama model or ChatGPT account.

## Upstream attribution

HoiClicky is a Windows desktop port inspired by [mekanikal-ch/yoclicky](https://github.com/mekanikal-ch/yoclicky). The original MIT copyright notices for Farza's Clicky and Théotime's YoClicky are retained in [LICENSE](LICENSE).

## Contributing and handoff

Joining the project? Read [HANDOFF.md](HANDOFF.md) for the current architecture, known gaps, and recommended next task. [CLAUDE.md](CLAUDE.md) contains instructions and a ready-to-use Claude Code prompt. The `desktop/README.md` points back to this project overview.
