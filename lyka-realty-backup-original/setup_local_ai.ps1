$ErrorActionPreference = 'Stop'
Write-Host 'LYKA local AI setup' -ForegroundColor Cyan
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Host 'Ollama is not installed.' -ForegroundColor Yellow
    Write-Host 'Install it from https://ollama.com/download/windows, finish installation, then reopen PowerShell.'
    exit 1
}
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
} catch {
    Write-Host 'Ollama is installed but its local service is not responding.' -ForegroundColor Yellow
    Write-Host 'Start the Ollama app from the Windows Start menu, then run this script again.'
    exit 1
}
Write-Host 'Downloading qwen2.5:3b. This is a multi-GB download and needs free disk space...' -ForegroundColor Cyan
& $ollama.Source pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Check internet connectivity and available disk space.' }
Write-Host 'Local model is ready. Ensure backend/.env has AI_PROVIDER=ollama.' -ForegroundColor Green
