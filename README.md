# HoiClicky

**A free AI screen companion that understands your screen, listens when asked, and helps turn conversations into actions.**

HoiClicky is an early Windows 11 pre-release. It is an independent Windows port inspired by the MIT-licensed YoClicky project. It is not affiliated with OpenAI or the original authors. The upstream MIT license and attribution are preserved in [LICENSE](LICENSE).

## What works today

- Compact floating assistant with a chat window and searchable local conversation sidebar.
- Ask about the current screen on demand. A screenshot is captured only when you send a screen question.
- Choose a local Ollama model, or optionally connect an eligible ChatGPT account through OpenAI's official Sign in with ChatGPT flow. ChatGPT plan access and available models depend on OpenAI's eligibility and limits; a ChatGPT subscription does not provide API-key access.
- Optionally use Claude through your own installed [Claude Code](https://claude.com/claude-code). Sign-in opens the browser via Claude Code's official `claude auth login`; usage counts toward your own Claude plan and its limits.
- Hold one configurable key, or two keys together, to record speech, then transcribe locally with Whisper when set up. The transcript is sent automatically after you release the key.
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
- **Tools**, each switchable in Settings → Agent mode: files in the workspace folder, PowerShell/terminal commands, mouse and keyboard (screenshot, click, type, keys, scroll through HoiClicky's own desktop MCP server), and web search/fetch.
- **Approvals**:
  - *Ask before every change* (default): every edit, command, click and keystroke shows an Allow/Deny card in the chat and the floating panel.
  - *Workspace files freely*: edits inside the workspace run without asking; everything else still asks.
  - *Autonomous*: nothing asks. It is not recommended: Claude can then delete files, run any command and click anything.
- **What never asks:** reading inside the workspace and taking screenshots. Screenshots also respect the screen permission.
- **Click preview:** before a click or scroll, the companion cursor shows the target.
- **Stop:** the Stop button ends the agent at once and denies anything still pending. Unanswered approvals are denied after five minutes.
- **How it runs:** Claude Code runs with `--permission-prompt-tool stdio`, so every tool request reaches HoiClicky first (`backend/Providers/AgentPolicy.cs` decides, `ClaudeAgentRunner.cs` asks the user). Sessions are not persisted.
- **Limits:** click coordinates come from a scaled screenshot and can miss, and the screen can change between screenshot and click. Elevated (administrator) windows ignore simulated input.

## Privacy and local files

- OAuth credentials are protected with Windows DPAPI under `%LOCALAPPDATA%\HoiClicky\credentials.dpapi`.
- Non-secret preferences are stored in `%LOCALAPPDATA%\HoiClicky\settings.json`.
- Conversations are stored as plain-text JSON in Electron's user data folder under `conversations` (normally `%APPDATA%\hoiclicky-desktop\conversations`). They are separate from ChatGPT website history.
- Screenshots and microphone audio are not saved to conversation files. Screen images are sent only when the user sends a screen question; the selected AI provider processes the request.
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
