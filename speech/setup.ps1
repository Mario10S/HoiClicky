$ErrorActionPreference = 'Stop'
$SpeechRoot = $PSScriptRoot
python -m venv (Join-Path $SpeechRoot '.venv')
if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
$SpeechPython = Join-Path $SpeechRoot '.venv\Scripts\python.exe'
& $SpeechPython -m pip install 'faster-whisper>=1.1,<2' 'sounddevice>=0.5,<1' 'numpy>=2,<3'
if ($LASTEXITCODE -ne 0) { throw 'Speech dependency installation failed.' }
$env:HOICLICKY_MODEL_DIR = Join-Path $SpeechRoot 'model'
& $SpeechPython -c "import os; from faster_whisper.utils import download_model; download_model('small', output_dir=os.environ['HOICLICKY_MODEL_DIR'])"
if ($LASTEXITCODE -ne 0) { throw 'Whisper model download failed.' }
Write-Host 'Local Whisper is ready. Restart HoiClicky.'
