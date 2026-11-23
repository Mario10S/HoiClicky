@echo off
rem Double-click to start HoiClicky. Builds what is missing or outdated, then opens the app without a console window.
setlocal
cd /d "%~dp0"
title Starting HoiClicky

where dotnet >nul 2>nul || (echo The .NET 8 SDK is missing. Install it with: winget install Microsoft.DotNet.SDK.8 & pause & exit /b 1)
where npm >nul 2>nul || (echo Node.js is missing. Install it from https://nodejs.org & pause & exit /b 1)

tasklist /fi "imagename eq electron.exe" /v 2>nul | find /i "HoiClicky" >nul && (echo HoiClicky is already running. & timeout /t 3 >nul & exit /b 0)

if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo Installing app components, this takes a minute the first time...
  pushd desktop
  call npm install --no-fund --no-audit || (popd & echo npm install failed. & pause & exit /b 1)
  popd
)

echo Building the local service...
dotnet build "backend\HoiClicky.Service.csproj" -c Release -nologo -v quiet >nul 2>&1
if errorlevel 1 (
  if not exist "backend\bin\Release\net8.0-windows\HoiClicky.Service.dll" (
    echo The service could not be built. Details:
    dotnet build "backend\HoiClicky.Service.csproj" -c Release -nologo
    pause & exit /b 1
  )
  echo Using the existing service build.
)

echo Building the interface...
pushd desktop
call npm run build --silent >nul 2>&1 || (echo The interface could not be built. Run "npm run build" in the desktop folder for details. & popd & pause & exit /b 1)
popd

start "" "%~dp0desktop\node_modules\electron\dist\electron.exe" "%~dp0desktop"
exit /b 0
