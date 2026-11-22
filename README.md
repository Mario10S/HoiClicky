# HoiClicky

**A free AI screen companion that understands your screen, listens when asked, and helps turn conversations into actions.**

HoiClicky is an early Windows 11 pre-release. It is an independent Windows port inspired by the MIT-licensed YoClicky project. It is not affiliated with OpenAI or the original authors. The upstream MIT license and attribution are preserved in [LICENSE](LICENSE).

## What works today

- Compact floating assistant with a chat window and searchable local conversation sidebar.
- Ask about the current screen on demand. A screenshot is captured only when you send a screen question.
- Choose a local Ollama model, or optionally connect an eligible ChatGPT account through OpenAI's official Sign in with ChatGPT flow. ChatGPT plan access and available models depend on OpenAI's eligibility and limits; a ChatGPT subscription does not provide API-key access.
- Hold two configurable keys to record speech, then transcribe locally with Whisper when set up. The transcript is sent automatically after you release the keys.
- Render formatted answers, choose a completion chime, or select an MP3 from your PC.
- Keep conversations on this PC and continue them later. Recent text is included for follow-up questions; old screenshots are not resent.
- Protect OAuth tokens with Windows DPAPI and disconnect from the app's Settings.

## Early-release limits

This build is still a work in progress. Screen questions currently capture the monitor containing the pointer; there is no region picker, OCR, context preview or application exclusion list yet. Do not use it to capture sensitive screens. Local chat history is plain text in the current Windows user profile and does not sync to ChatGPT. Speech setup is optional and requires downloading the Whisper model. There is no signed installer or automatic updater yet.

## Run from source

Requirements: Windows 11, .NET 8 SDK, Node.js and npm. Ollama is optional for local AI. Network access is required for package restore, ChatGPT sign-in, and cloud requests.

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

## Privacy and local files

- OAuth credentials are protected with Windows DPAPI under `%LOCALAPPDATA%\HoiClicky\credentials.dpapi`.
- Non-secret preferences are stored in `%LOCALAPPDATA%\HoiClicky\settings.json`.
- Conversations are stored as plain-text JSON in Electron's user data folder under `conversations` (normally `%APPDATA%\hoiclicky-desktop\conversations`). They are separate from ChatGPT website history.
- Screenshots and microphone audio are not saved to conversation files. Screen images are sent only when the user sends a screen question; the selected AI provider processes the request.
- Ollama requests go to the local Ollama service. When ChatGPT is selected, request text and any explicitly captured screenshot are sent to OpenAI.

## Development checks

```powershell
node --test tests/Desktop/*.test.mjs
dotnet run --project tests/Providers/Providers.csproj
```

These checks exercise formatting, local history, audio settings and provider behavior with test doubles. They do not replace testing on a real Windows installation, microphone, display, Ollama model or ChatGPT account.

## Upstream attribution

HoiClicky is a Windows desktop port inspired by [mekanikal-ch/yoclicky](https://github.com/mekanikal-ch/yoclicky). The original MIT copyright notices for Farza's Clicky and Théotime's YoClicky are retained in [LICENSE](LICENSE).
