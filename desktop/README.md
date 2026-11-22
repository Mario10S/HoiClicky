# React desktop interface

The new Electron + React interface lives in desktop/. The existing WPF app is retained while this migration is validated.

From a normal PowerShell terminal in Desktop\HoiClicky:

```powershell
dotnet build -c Release
dotnet build backend\HoiClicky.Service.csproj -c Release
cd desktop
npm install
npm start
```

The first build creates the local Windows speech helper; the second builds the service used by Electron. Node.js must be active on PATH. npm start builds React with Vite and launches Electron. Keep this source checkout in place; packaging as an installer is pending.

The React renderer has no Node access, cannot load external pages, and uses a sandboxed preload bridge. OAuth credentials remain in the C# service and the existing DPAPI store. Captures happen only through Send and respect the app's screen permission. Microphone input uses the existing local Windows recognizer. Chat is in memory and clears on restart. TTS uses installed system voices through Chromium speech synthesis.

Validation: C# service builds successfully. Electron main/preload syntax checked with Node. npm dependency downloads are blocked from the agent environment, so React compilation and the new Electron window have NOT yet been verified. The new interface must not be described as a tested replacement until npm install and npm start succeed.
