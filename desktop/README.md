# Electron desktop app

The active desktop app uses Electron, React and Vite. See the repository-root [README](../README.md) for setup and privacy details, and [HANDOFF.md](../HANDOFF.md) for architecture, known gaps, and the recommended next task.

## Quick start

From the repository root in PowerShell:

```powershell
dotnet build backend\HoiClicky.Service.csproj -c Release
cd desktop
npm install
npm start
```

`npm start` builds the React app with Vite and launches Electron. The old WPF UI remains in the repository as legacy code. Packaging a signed Windows installer and updater is still pending.
