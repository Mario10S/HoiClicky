# HoiClicky

HoiClicky is a Windows 11 desktop port inspired by [YoClicky](https://github.com/mekanikal-ch/yoclicky), an MIT-licensed macOS screen-side assistant. This project keeps the MIT license and upstream copyright notices. See [LICENSE](LICENSE).

## MVP

- Sign in with ChatGPT using OpenAI's documented open-source OAuth flow. First sign-in dynamically registers HoiClicky; the issued client ID is reused on later sign-ins.
- Press **Ctrl + Alt + Space** or click **Ask about my screen** to open a question box. A monitor screenshot is captured only after you press **Send**.
- The screenshot and question are sent directly to `POST https://api.openai.com/v1/responses`; the app sets `store: false` and streams the result.
- Read the response aloud through the Windows SAPI voice, if desired.
- Disconnect removes the encrypted local token file. Screen and planned microphone permissions are in Privacy settings. This MVP does not access the microphone.

Screenshots are held in memory for the request and are not written to disk. The ChatGPT access and refresh tokens are protected per Windows user with DPAPI under `%LOCALAPPDATA%\HoiClicky\credentials.dpapi`. Non-secret preferences, the issued OAuth client ID and stable installation host ID are in `%LOCALAPPDATA%\HoiClicky\settings.json`.

## Build

Requirements: Windows 11, .NET 8 SDK, and a network connection for NuGet restore and OpenAI sign-in/API access.

```powershell
dotnet restore
dotnet build -c Release
dotnet run
```

Install the .NET 8 SDK to build the project. It has no external NuGet package dependencies.

## OpenAI setup

The implementation follows OpenAI's [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart/) and [open-source plan-usage docs](https://developers.openai.com/siwc/token-sharing-open-source/): first authorization uses `dynamic_agent_client`, HoiClicky as the `agent_name_hint`, a persisted `ext_agent_host_id`, PKCE, state and nonce, and the loopback callback `http://127.0.0.1:1455/auth/callback`. OpenAI returns an issued client ID that HoiClicky retains. The user reviews the app/agent and requested permissions during sign-in. No client secret or API key is used.

OpenAI may ask the user to name and approve HoiClicky as a client on first sign-in. ChatGPT plan usage requires the `chatgpt.tokens.use.direct` permission and eligibility under the user's plan. The app only enables requests when that permission is granted. Plan limits and preview availability are controlled by OpenAI.

## Windows port roadmap

1. MVP: account connection, explicit screen questions, response window, optional speech.
2. Cursor buddy and pointer target visualization.
3. Push-to-talk, on-device speech transcription and dictation.
4. Accessible text selection and document reading integrations.

The Windows UI and OS integrations use WPF, Windows global hotkeys, GDI screen capture, DPAPI, and SAPI. OAuth and Responses API code are isolated in `OAuthService` and `OpenAiResponses` for incremental development.

## Upstream attribution

Ported from the ideas and MIT-licensed source of [mekanikal-ch/yoclicky](https://github.com/mekanikal-ch/yoclicky). The original license identifies Farza's Clicky and Théotime's YoClicky; their notices are retained verbatim in `LICENSE`.

## Desktop preview

The updated UI includes an integrated answer panel, editable voice transcript, floating assistant island, and an account-specific model picker. Ctrl+Alt+Space opens chat; Ctrl+Alt+V starts/stops local microphone recognition. Review the transcript and click Send. Windows speech recognition uses the installed desktop speech language; additional languages require Windows speech packs. Recording ends after 60 seconds at most. Enable microphone access in Privacy & Voice first.

The speech helper is compiled from SpeechHost.source with the Windows .NET Framework compiler during the build. It runs hidden only during an explicit voice request, returns transcripts and microphone levels over local standard output, and saves no audio. Read-aloud uses Windows SAPI. The model choice is persisted locally; unavailable models produce a visible error rather than silently choosing another model.

Still pending: hold-to-talk, voice/language picker, dictation into other apps, document reading, pointer targeting, and saved conversation history. The assistant currently displays the latest answer.

## Free local AI provider

In Settings > AI provider choose Ollama (on this PC), start Ollama, and click Refresh models. Select an installed model in the composer. Text-only models disable screenshot sharing; vision-capable models can accept screenshots. There is no Hoiclicky account, subscription or cloud key required for local inference. Model downloads and local hardware are the user's responsibility. Hoiclicky does not download models automatically.

The optional ChatGPT connection is retained for existing users, with its own eligibility and usage limits. Existing connected users stay on ChatGPT until they switch. New users without an existing connection default to Ollama. Cloud API-key providers are not implemented yet.

Provider implementations are behind IAiProvider in backend/Providers/AiProviders.cs. Ollama is restricted to http://127.0.0.1:11434, receives no OAuth credentials, and streams NDJSON from /api/chat. Screenshot capability is checked before capturing. This does not add screenshot previews or sensitive-content filtering.

Run provider regression checks with `dotnet run --project tests/Providers/Providers.csproj`. These use an in-memory HTTP handler, not a real model or microphone.
