# Claude Code instructions

Before editing, read [HANDOFF.md](HANDOFF.md), [README.md](README.md), and the relevant source files.

- Keep the existing Electron + React + .NET architecture. Make one small change at a time; do not rewrite working features without a concrete reason.
- Keep UI code in `desktop/src`, Electron main-process code in `desktop/electron`, and Windows/provider work in the existing .NET service and `backend/Providers` modules.
- Preserve `LICENSE` and upstream MIT attribution. Do not copy another product's branding or proprietary UI.
- Screen capture and microphone recording must be user-initiated and visible. Never send a screenshot before a clear user action. Do not store screenshots or audio in chat history.
- Never add API keys, OAuth tokens, personal data, screenshots, recordings, Python virtual environments, downloaded models, build output, or `node_modules` to Git.
- The optional ChatGPT integration uses the official Sign in with ChatGPT flow. Do not use browser cookies/session scraping or claim a ChatGPT subscription is API-key access.
- Implement only the current task. Update HANDOFF.md after meaningful changes with completed work, open problems, useful ideas, actual test results, and the next recommended task. Check for collaborator changes before pushing reviewable commits when authorized. Do not publish a release, change repository visibility, post externally, or send messages as part of a code change.
- Run the relevant frontend/backend builds and focused existing checks after implementation. Report exact commands, results, changed files, and any manual Windows verification still needed. Never report a check as passed unless it was run.

## Suggested first prompt

> Read `CLAUDE.md` and `HANDOFF.md`. Inspect the current screen-question flow before editing. Implement only the recommended next task: add a visible screenshot review step with Send and Cancel, ensuring cancellation never reaches an AI provider and images remain memory-only. Preserve the existing UI and provider architecture. Add focused tests for the new flow, run the relevant existing checks, and report files changed, commands/results, and any remaining Windows checks. Do not commit or publish anything.
