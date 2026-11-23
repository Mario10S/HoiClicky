> **Implemented (2026-11-23):** ChatGPT agent mode now uses the existing OAuth token, shared approval policy/cards and desktop MCP server. See HANDOFF.md for tests and remaining live checks. This document records the design and known limits.

# Building agent mode for ChatGPT users

This file is a hand-off for an AI coding assistant (or a human contributor). It explains how HoiClicky's agent mode works today with Claude, and how to give ChatGPT users the same experience. Read `CLAUDE.md`, `HANDOFF.md` and `README.md` first; their rules apply here too.

## Ready-to-use prompt

Paste this into the coding assistant, from the repository root:

> Read `CLAUDE.md`, `HANDOFF.md`, `README.md` and `docs/agent-mode-for-chatgpt.md`. Implement agent mode for the ChatGPT provider exactly as that document describes.
>
> Constraints:
> - Reuse the existing approval rules (`AgentPolicy`), approval cards and desktop MCP server; do not build a second permission system.
> - Keep ChatGPT access on the official Sign in with ChatGPT flow; never add API keys.
> - Screenshots stay in memory only.
> - Every write, command, click, keystroke or window close needs the user's approval unless their chosen approval mode allows it.
>
> Work in small steps:
> 1. App control for ChatGPT.
> 2. The Responses tool loop with file tools.
> 3. Commands.
> 4. Desktop tools.
> 5. Web.
>
> Add focused tests for each step and run every check listed in `HANDOFF.md`. Report the files changed, the exact commands and results, and what still needs manual Windows testing. Update `HANDOFF.md`. Do not publish a release.

## How agent mode works today (Claude)

```
React UI ──IPC──▶ Electron main ──stdin/stdout JSON──▶ HoiClicky.Service (.NET)
  approval cards ◀── events "approval"/"approvalDone"   │ ClaudeAgentRunner
  Allow/Deny ──────▶ method "approve" {id, allow}        │  runs: claude -p --permission-prompt-tool stdio …
                                                        │   ◀ control_request can_use_tool {tool_name,input}
                                                        │   ▶ control_response allow / deny
                                                        └ Claude Code starts the MCP server:
                                                           HoiClicky.Service --mcp-desktop
```

| Piece | File | Reusable for ChatGPT? |
|---|---|---|
| Approval rules: allow, ask or deny per tool, approval mode (`ask`, `files`, `auto`), tool groups and workspace boundary | `backend/Providers/AgentPolicy.cs` | **Yes, as is.** Map ChatGPT tool names onto the names it knows (see the table below). |
| Asking the user, approval events, Stop, 5-minute timeout | `backend/Program.cs` (`AskUser`, `approvals`, `agentRun`, methods `approve` and `agentStop`) | **Yes.** |
| Step list, approval titles and details | `ClaudeAgentRunner.Describe` and `ClaudeAgentRunner.Detail` | **Yes.** They are static and keyed by tool name. |
| Desktop tools (screenshot of one or all monitors, click, type, keys, scroll, list windows and browser tabs, focus, switch tab, close) | `backend/DesktopMcp.cs`, `backend/DesktopMcpCore.cs`, `backend/OpenWindows.cs` | **Yes.** Start the same `--mcp-desktop` process and speak MCP to it (see step 4). |
| File, command and web tools | provided by Claude Code | **No.** ChatGPT needs its own implementations (steps 2, 3 and 5). |
| Agent loop | `backend/Providers/ClaudeAgentRunner.cs` (Claude Code does the loop) | **No.** Write `ChatGptAgentRunner` with the Responses API tool loop. |
| UI: Agent chip, Stop button, approval cards, settings | `desktop/src/main.jsx` | **Mostly.** Remove the `provider==='claude'` checks where agent mode should also work for ChatGPT. |
| App control (`[[APP {...}]]` markers) | `backend/Providers/AppCommands.cs`, `desktop/src/app-commands.mjs` | **Yes.** It only needs enabling for ChatGPT (step 1). |

## Step 1: App control for ChatGPT (small)

App control is plain text: the model ends its reply with `[[APP {...}]]` markers, and the desktop app checks and applies them.

1. In `backend/Program.cs` (`ask`), append `AppCommands.Prompt(appState)` for `chatgpt` too, not only `claude`.
2. In `desktop/src/main.jsx` (`send`), send `app: appContext(...)` and parse the markers when `status.provider` is `claude` or `chatgpt`.
3. Do not enable it for Ollama yet. Small local models often break the marker format.
4. Tests: extend `tests/Desktop/app-commands.test.mjs` if parsing changes. Manual check: "open a new chat and switch to <model>" with ChatGPT selected.

## Step 2: Responses API tool loop with file tools

Create `backend/Providers/ChatGptAgentRunner.cs`. ChatGPT requests already go to `https://api.openai.com/v1/responses` with the OAuth token from `OAuthService.GetAccessTokenAsync()` (see `OpenAiResponses.cs`, `store=false`, streaming SSE). Keep that.

**Loop** (verify field names against the current OpenAI Responses API documentation before coding):

1. Send `{model, input, tools, store:false, stream:true}`.
   - `tools` holds function definitions: `{type:"function", name, description, parameters:<JSON schema>}`.
   - `input` holds the history and the user message, and the screenshot as `input_image` when the screen chip is on.
2. Stream the events:
   - Append `response.output_text.delta` to the answer.
   - Collect each completed output item (`response.output_item.done`). Items of `type:"function_call"` carry `name`, `arguments` (a JSON string) and `call_id`.
3. If the response completed without function calls, the task is done.
4. Otherwise handle each call:
   - Map its name to the policy name.
   - Run `AgentPolicy.Decide`, then `AskUser` if needed.
   - Execute it, or produce a denial message.
   - Then add **both** the original `function_call` item and a `{type:"function_call_output", call_id, output:"<text>"}` item to `input`. With `store:false` the server does not remember earlier turns, so every request must carry them.
5. Repeat from step 1.
   - Cap the loop at about 30 tool rounds.
   - Respect the Stop cancellation token.
   - Show steps through `Describe` exactly like the Claude runner (`**Steps**` list above the answer).

**System instructions:** copy `ClaudeAgentRunner.SystemPrompt` (it works for any model), including the rules about denied actions, passwords and destructive steps.

**File tools.** Implement them in a new `backend/Providers/AgentTools.cs` with pure, testable functions:

| ChatGPT function | Map to policy name | Behaviour |
|---|---|---|
| `read_file {path}` | `Read` | Read text and cap the output (for example 100 KB) |
| `list_files {path?, pattern?}` | `Glob` | List up to a few hundred entries |
| `search_files {pattern, path?}` | `Grep` | Regex search with a capped number of matches |
| `write_file {path, content}` | `Write` | Create or overwrite a file |
| `edit_file {path, old_text, new_text}` | `Edit` | Replace exactly one occurrence; fail when the text is missing or appears more than once |

Pass the mapped name and an input shaped like Claude Code's (`file_path`, `content`, `old_string`, `new_string`, `pattern`) to `AgentPolicy.Decide`, `Describe` and `Detail`. The workspace rule then works unchanged.

Resolve relative paths against the workspace (or `ClaudeAgentRunner.DefaultWorkspace` when none is set). **Never** let `..` or absolute paths bypass `AgentPolicy`: outside the workspace the policy returns `Ask`.

## Step 3: Commands

`run_command {command, description?}` maps to the policy name `PowerShell`.

- Run `powershell.exe -NoProfile -NonInteractive -Command <command>` with `ArgumentList`, the workspace as working directory, a timeout of about 2 minutes, and stdout and stderr each capped at about 30 KB.
- Return the exit code and the output.
- Kill the whole process tree on timeout or Stop.
- Strip `ANTHROPIC_API_KEY`, OpenAI tokens and similar values from the child environment.

## Step 4: Desktop tools through the existing MCP server

Do not copy the Win32 code. Start `HoiClicky.Service --mcp-desktop`, using the same command line as `Program.DesktopMcpConfig()`, and write a small MCP stdio client (`backend/Providers/McpStdioClient.cs`):

1. Send `initialize`, then `notifications/initialized`.
2. Call `tools/list` once. Convert each MCP tool (`name`, `description`, `inputSchema`) into a Responses function. Prefix the names, for example `desktop_click`.
3. Map them to the policy names `mcp__desktop__<name>`, so `AgentPolicy` applies:
   - screenshot and list_windows need the screen permission;
   - focus and tab switching never ask;
   - click, type, keys, scroll and close follow the approval mode.
4. For `tools/call`, the result `content` is an array:
   - Put `text` parts into `function_call_output`.
   - For an `image` part (screenshot), add the text to `function_call_output` **and** append a user input item `{type:"input_image", image_url:"data:image/jpeg;base64,…"}` right after it. Function outputs may not accept images; check the current docs.
   - Keep images in memory only, and drop older screenshots from `input` after a few rounds to stay within context limits.
5. Before an approval for click or scroll, call the existing `PreviewAction` so the companion cursor shows the target.

## Step 5: Web

- First check whether the Responses API built-in `web_search` tool works with Sign in with ChatGPT tokens. If it does, enable it and treat it like the policy name `WebSearch`, which needs no approval.
- If it does not, implement only `fetch_url {url}` (policy name `WebFetch`):
  - HTTPS GET, 15 s timeout, about 2 MB limit;
  - strip HTML to text and cap the output;
  - refuse non-HTTP(S) schemes and private network addresses (localhost, 10.x, 192.168.x, 169.254.x).

## Wiring and UI

- In `Program.cs` (`ask` with `agent:true`), run `ChatGptAgentRunner` when the provider is `chatgpt` and `ClaudeAgentRunner` when it is `claude`. Ollama stays unsupported, with a clear message.
- In `main.jsx`:
  - Show the Agent chip for `claude` and `chatgpt`.
  - Update the Settings → Agent mode text ("Needs Claude or ChatGPT").
  - Keep the `[[AGENT_MODE]]` self-activation (add the same sentence to the ChatGPT system text) or replace it with the app-control action `{"action":"set","setting":"agent","value":true}`.
- The approval cards, Stop, the floating panel and the step list need no changes; they are provider-independent.

## Safety checklist (must hold for ChatGPT exactly as for Claude)

- [ ] Every tool call goes through `AgentPolicy.Decide` before it runs. Unknown tools are denied.
- [ ] `ask` mode: writes, commands, clicks, typing, keys, scroll and window close show an approval card.
- [ ] Denied or timed-out actions are reported back to the model as denied, and the model is told not to retry.
- [ ] Stop cancels the HTTP stream, kills child processes (commands and the MCP server) and denies pending approvals.
- [ ] No screenshots or tool outputs are written to chat history or disk. History keeps only the final text.
- [ ] Tokens never leave `OAuthService`, are never logged, and are never passed to child processes.
- [ ] Output caps on files, commands and web, plus a tool-round cap.

## Tests to add (`tests/Providers`, using fakes like the existing `FakeSession` and `HttpMessageHandler` stubs)

- The tool loop with a fake Responses stream:
  - a function call, then approval Allow, then a `function_call_output` in the next request, then the final text;
  - a Deny produces a denial output, and the step is marked "· denied";
  - the round cap is enforced;
  - Stop ends the loop.
- `AgentTools`:
  - workspace resolution, and `..` handled through the policy;
  - `edit_file` with a unique, missing or duplicate match;
  - read and command output caps;
  - the command timeout.
- `McpStdioClient` against a fake process: `initialize`, `tools/list` conversion, and splitting image results.
- Name mapping: each ChatGPT function maps to the policy name it is meant to hit.

## Manual Windows checks before merging

1. ChatGPT with Agent on: "create notes.txt with Hallo in the workspace". A card appears; after Allow the file exists, after Deny nothing is created.
2. "Run a command that shows today's date". A card appears, then the output.
3. "Open Notepad and type Hallo". Screenshot, then a click card with the cursor preview, then a typing card.
4. "Switch to my YouTube tab in the browser". This happens without a card.
5. Stop during a long task.
6. The same tasks with Claude still work (regression).
