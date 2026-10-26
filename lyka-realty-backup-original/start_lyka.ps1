$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$BackendDir = Join-Path $ProjectRoot 'backend'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$DatabaseFile = Join-Path $BackendDir 'lyka_realty.db'
$EnvFile = Join-Path $BackendDir '.env'
$FrontendBuild = Join-Path $FrontendDir 'dist\index.html'
$PythonVenv = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$Python = $null
$PythonCandidates = @()
$BackendProcess = $null
$PreflightScript = Join-Path $env:TEMP "lyka-preflight-$PID.py"
$StdoutLog = Join-Path $env:TEMP "lyka-realty-uvicorn-$PID.out.log"
$StderrLog = Join-Path $env:TEMP "lyka-realty-uvicorn-$PID.err.log"
$AppUrl = 'http://localhost:8000'
$ProbeUrl = 'http://127.0.0.1:8000'

function Test-PythonRuntime {
    param([string]$Executable, [string]$ScriptPath)
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $null = & $Executable $ScriptPath
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
}

function Get-MissingPythonModules {
    param([string]$Executable, [string]$ScriptPath)
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $Result = & $Executable $ScriptPath --check-missing
        if ($LASTEXITCODE -ne 0) {
            return $null
        }
        return ($Result -join '').Trim()
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
}

function Stop-StartedBackend {
    if ($null -ne $script:BackendProcess) {
        $script:BackendProcess.Refresh()
        if (-not $script:BackendProcess.HasExited) {
            Write-Host "`nStopping LYKA backend..."
            Stop-Process -Id $script:BackendProcess.Id -ErrorAction SilentlyContinue
            $script:BackendProcess.WaitForExit(10000) | Out-Null
        }
    }
}

try {
    Write-Host 'LYKA Realty startup'
    Write-Host "Project: $ProjectRoot"

    if (-not (Test-Path -LiteralPath $BackendDir -PathType Container)) {
        throw 'The backend folder was not found beside this launcher.'
    }
    if (-not (Test-Path -LiteralPath $FrontendDir -PathType Container)) {
        throw 'The frontend folder was not found beside this launcher.'
    }
    if (-not (Test-Path -LiteralPath $DatabaseFile -PathType Leaf)) {
        throw "The existing SQLite database is missing: $DatabaseFile. It was not created or replaced."
    }
    if ((Get-Item -LiteralPath $DatabaseFile).Length -le 0) {
        throw 'The existing SQLite database file is empty. Startup stopped without modifying it.'
    }

    if (Test-Path -LiteralPath $PythonVenv -PathType Leaf) {
        $PythonCandidates += $PythonVenv
    }
    $BackendPythonVenv = Join-Path $BackendDir '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $BackendPythonVenv -PathType Leaf) {
        $PythonCandidates += $BackendPythonVenv
    }
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $PythonCommand -and $PythonCandidates -notcontains $PythonCommand.Source) {
        $PythonCandidates += $PythonCommand.Source
    }
    if ($PythonCandidates.Count -eq 0) {
        throw 'Python was not found. Install Python 3.10 or newer, then reopen VS Code.'
    }

    $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $NodeCommand -or $null -eq $NpmCommand) {
        throw 'Node.js and npm are required to build the existing frontend. Install Node.js LTS and reopen VS Code.'
    }

    Write-Host 'Checking available Python environments and backend dependencies...'
$PreflightCode = @'
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

modules = ("fastapi", "uvicorn", "sqlalchemy", "pydantic_settings", "email_validator", "bcrypt", "jwt", "openai", "google.genai")
if "--check-missing" in sys.argv:
    missing = []
    for name in modules:
        try:
            if importlib.util.find_spec(name) is None:
                missing.append(name)
        except (ImportError, ModuleNotFoundError):
            missing.append(name)
    if not missing:
        try:
            import openai
            client = openai.OpenAI(api_key="local-compatibility-probe-not-a-real-key")
            client.close()
        except TypeError:
            missing.append("openai-httpx-compatibility")
    print(",".join(missing))
    raise SystemExit(0)

try:
    import fastapi
    import uvicorn
    import sqlalchemy
    import pydantic_settings
    import bcrypt
    import jwt
    import openai
    from google import genai
    openai_client = openai.OpenAI(api_key="local-compatibility-probe-not-a-real-key")
    openai_client.close()
    gemini_client = genai.Client(api_key="local-compatibility-probe-not-a-real-key")
    gemini_client.close()
    from app.main import app
    from app.database import engine
    expected = (Path.cwd() / "lyka_realty.db").resolve()
    actual = Path(engine.url.database).resolve() if engine.url.database else None
    assert engine.dialect.name == "sqlite" and actual == expected and expected.is_file()
except Exception:
    raise SystemExit(1)
'@
    Set-Content -LiteralPath $PreflightScript -Value $PreflightCode -Encoding Ascii
    Push-Location $BackendDir
    try {
        foreach ($Candidate in $PythonCandidates) {
            if (Test-PythonRuntime -Executable $Candidate -ScriptPath $PreflightScript) {
                $Python = $Candidate
                break
            }
        }

        if ($null -eq $Python) {
            $InstallPython = $null
            foreach ($Candidate in $PythonCandidates) {
                $MissingModules = Get-MissingPythonModules -Executable $Candidate -ScriptPath $PreflightScript
                if ($null -ne $MissingModules -and -not [string]::IsNullOrWhiteSpace($MissingModules)) {
                    $InstallPython = $Candidate
                    break
                }
            }
            if ($null -eq $InstallPython) {
                throw 'Python environments were found, but none can import the backend correctly. Check Windows Application Control or select a working Python environment; no packages were changed.'
            }
            if (-not (Test-Path -LiteralPath (Join-Path $BackendDir 'requirements.txt') -PathType Leaf)) {
                throw 'Python dependencies are missing and backend\requirements.txt was not found.'
            }
            Write-Host 'Installing missing backend dependencies from backend\requirements.txt...'
            & $InstallPython -m pip install -r (Join-Path $BackendDir 'requirements.txt')
            if ($LASTEXITCODE -ne 0) {
                throw 'Backend dependency installation failed.'
            }
            foreach ($Candidate in $PythonCandidates) {
                if (Test-PythonRuntime -Executable $Candidate -ScriptPath $PreflightScript) {
                    $Python = $Candidate
                    break
                }
            }
            if ($null -eq $Python) {
                throw 'The backend environment still cannot import or connect to the existing SQLite database after installing declared missing dependencies.'
            }
        }

        Write-Host "Using Python: $Python"
        Write-Host 'Existing SQLite database path verified.'
    } finally {
        Pop-Location
    }
    if (Test-Path -LiteralPath $PreflightScript -PathType Leaf) {
        Remove-Item -LiteralPath $PreflightScript -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir 'node_modules') -PathType Container)) {
        if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir 'package-lock.json') -PathType Leaf)) {
            throw 'Frontend dependencies are missing and frontend\package-lock.json was not found.'
        }
        Write-Host 'Installing the locked frontend dependencies...'
        Push-Location $FrontendDir
        try {
            & $NpmCommand.Source ci
            if ($LASTEXITCODE -ne 0) {
                throw 'Frontend dependency installation failed.'
            }
        } finally {
            Pop-Location
        }
    }

    Write-Host 'Building the existing React/Vite frontend...'
    Push-Location $FrontendDir
    try {
        & $NpmCommand.Source run build
        if ($LASTEXITCODE -ne 0) {
            throw 'Frontend build failed. Review the build output above.'
        }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $FrontendBuild -PathType Leaf)) {
        throw 'Frontend build completed without producing frontend\dist\index.html.'
    }

    $ExistingHealth = $null
    try {
        $ExistingHealth = Invoke-RestMethod -Uri "$ProbeUrl/api/health" -TimeoutSec 2
    } catch {
        $ExistingHealth = $null
    }

    if ($null -ne $ExistingHealth) {
        if ($ExistingHealth.database_type -ne 'sqlite' -or $ExistingHealth.database -ne 'connected') {
            throw "Port 8000 is serving an app that is not connected to the expected SQLite database. Stop it deliberately, then retry."
        }
        $ExistingHome = $null
        try {
            $ExistingHome = Invoke-WebRequest -Uri $ProbeUrl -UseBasicParsing -TimeoutSec 3
        } catch {
            $ExistingHome = $null
        }
        if ($null -eq $ExistingHome -or $ExistingHome.Content -notmatch '<div id="root"') {
            throw 'A LYKA API is already listening on port 8000 but is not serving the built frontend. Stop that existing server deliberately, then retry.'
        }
        $RestartInputs = @()
        foreach ($InputPath in @(
            $EnvFile,
            $PSCommandPath,
            (Join-Path $BackendDir 'requirements.txt')
        )) {
            if (Test-Path -LiteralPath $InputPath -PathType Leaf) {
                $RestartInputs += Get-Item -LiteralPath $InputPath
            }
        }
        $RestartInputs += Get-ChildItem -LiteralPath (Join-Path $BackendDir 'app') -Filter '*.py' -File -Recurse
        $ExistingListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        $ExistingProcess = $null
        $RestartRequired = $false
        if ($RestartInputs.Count -gt 0 -and $null -ne $ExistingListener) {
            $ExistingProcess = Get-CimInstance Win32_Process `
                -Filter "ProcessId = $($ExistingListener.OwningProcess)" `
                -ErrorAction SilentlyContinue
            if ($null -ne $ExistingProcess) {
                $ExistingStarted = (Get-Process -Id $ExistingProcess.ProcessId -ErrorAction Stop).StartTime
                $RestartRequired = [bool]($RestartInputs | Where-Object { $_.LastWriteTime -gt $ExistingStarted } | Select-Object -First 1)
            }
        }

        if ($RestartRequired) {
            $IsExpectedBackend = (
                $PythonCandidates -contains $ExistingProcess.ExecutablePath -and
                $ExistingProcess.CommandLine -match '(?i)\s-m\s+uvicorn\s+app\.main:app(?:\s|$)' -and
                $ExistingProcess.CommandLine -match '(?i)--host\s+127\.0\.0\.1(?:\s|$)' -and
                $ExistingProcess.CommandLine -match '(?i)--port\s+8000(?:\s|$)'
            )
            if (-not $IsExpectedBackend) {
                throw 'backend\.env changed after the server started, but the process on port 8000 could not be safely identified as this project backend. It was left untouched.'
            }
            Write-Host 'LYKA backend configuration or source changed after the server started; restarting that verified backend...'
            Stop-Process -Id $ExistingProcess.ProcessId -ErrorAction Stop
            $ExistingProcessId = $ExistingProcess.ProcessId
            for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
                if (-not (Get-Process -Id $ExistingProcessId -ErrorAction SilentlyContinue)) {
                    break
                }
                Start-Sleep -Milliseconds 250
            }
            if (Get-Process -Id $ExistingProcessId -ErrorAction SilentlyContinue) {
                throw 'The stale LYKA backend did not stop after restart was requested.'
            }
            for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
                if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) {
                    break
                }
                Start-Sleep -Milliseconds 250
            }
            if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
                throw 'Port 8000 remained occupied after the stale LYKA backend stopped; no new backend was started.'
            }
            $ExistingHealth = $null
        } else {
            Write-Host "An existing LYKA server is healthy and already serves the frontend at $AppUrl"
            Start-Process $AppUrl
            return
        }
    }

    $PortOwner = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $PortOwner) {
        throw "Port 8000 is already occupied by another process (PID $($PortOwner[0].OwningProcess)); it was left untouched."
    }

    Write-Host 'Starting FastAPI (app.main:app) with the existing SQLite database...'
    $BackendProcess = Start-Process `
        -FilePath $Python `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory $BackendDir `
        -PassThru `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog

    Write-Host 'Waiting for the API and database health check...'
    $Healthy = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        $BackendProcess.Refresh()
        if ($BackendProcess.HasExited) {
            throw "Backend exited before becoming healthy. Diagnostic logs: $StdoutLog and $StderrLog"
        }
        try {
            $Health = Invoke-RestMethod -Uri "$ProbeUrl/api/health" -TimeoutSec 2
            if ($Attempt -eq 0) {
                Write-Host "Health response: status=$($Health.status), database=$($Health.database), type=$($Health.database_type)"
            }
            if ($Health.status -eq 'online' -and $Health.database -eq 'connected' -and $Health.database_type -eq 'sqlite') {
                $Healthy = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $Healthy) {
        throw "Backend did not pass its health check within 60 seconds. Diagnostic logs: $StdoutLog and $StderrLog"
    }

    Write-Host "LYKA is ready at $AppUrl (SQLite connected)."
    Write-Host 'Press Ctrl+C in this terminal to stop the backend.'
    Start-Process $AppUrl
    while ($true) {
        $BackendProcess.Refresh()
        if ($BackendProcess.HasExited) {
            throw "The backend stopped unexpectedly. Diagnostic logs: $StdoutLog and $StderrLog"
        }
        Start-Sleep -Seconds 1
    }
} catch {
    Write-Error $_
    exit 1
} finally {
    Stop-StartedBackend
    if (Test-Path -LiteralPath $PreflightScript -PathType Leaf) {
        Remove-Item -LiteralPath $PreflightScript -ErrorAction SilentlyContinue
    }
}
