param(
    [switch]$SetupOnly,
    [switch]$NoReload,
    [int]$Port = $(if ($env:AUDIOBOOK_STUDIO_PORT) { [int]$env:AUDIOBOOK_STUDIO_PORT } else { 8123 })
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppVenv = Join-Path $Root "venv"
$XttsVenv = if ($env:XTTS_ENV_DIR) { $env:XTTS_ENV_DIR } else { Join-Path $HOME "xtts-env" }
$FrontendDir = Join-Path $Root "frontend"
$DemoZip = if ($env:AUDIOBOOK_STUDIO_DEMO_ZIP) { $env:AUDIOBOOK_STUDIO_DEMO_ZIP } else { Join-Path $Root "demo/demo.zip" }
$BootstrapPythonEnv = Join-Path $Root ".pinokio-python311"

function Write-Step($Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Fail($Message) {
    throw $Message
}

function Remove-BootstrapPythonEnv {
    if (Test-Path $BootstrapPythonEnv) {
        Remove-Item $BootstrapPythonEnv -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Test-PythonVersion($Command, [string[]]$Prefix = @()) {
    try {
        $versionOutput = & $Command @($Prefix + @("-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')")) 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $versionOutput) {
            return $false
        }
        $versionText = [string]($versionOutput | Select-Object -First 1)
        $versionText = $versionText.Trim()
        if (-not $versionText) {
            return $false
        }
        $parsedVersion = $null
        if (-not [version]::TryParse($versionText, [ref]$parsedVersion)) {
            return $false
        }
        return $parsedVersion -ge [version]"3.11"
    } catch {
        return $false
    }
}

function Find-Python {
    $candidates = @(
        @{ Command = "py"; Prefix = @("-3.11") },
        @{ Command = "python"; Prefix = @() },
        @{ Command = "python3.11"; Prefix = @() },
        @{ Command = "python3"; Prefix = @() }
    )

    foreach ($candidate in $candidates) {
        if (-not (Get-Command $candidate.Command -ErrorAction SilentlyContinue)) {
            continue
        }
        if (Test-PythonVersion $candidate.Command $candidate.Prefix) {
            return $candidate
        }
    }

    return $null
}

function Get-CondaBootstrapPython {
    $condaCandidates = @()

    $resolvedMamba = Get-Command "mamba" -ErrorAction SilentlyContinue
    if ($resolvedMamba) {
        $condaCandidates += $resolvedMamba.Source
    }

    if ($env:CONDA_EXE) {
        $condaCandidates += $env:CONDA_EXE
    }

    $resolvedConda = Get-Command "conda" -ErrorAction SilentlyContinue
    if ($resolvedConda) {
        $condaCandidates += $resolvedConda.Source
    }

    $condaCandidates = $condaCandidates | Where-Object { $_ } | Select-Object -Unique
    if (-not $condaCandidates) {
        return $null
    }

    $pythonExe = Join-Path $BootstrapPythonEnv "python.exe"
    if (Test-Path $pythonExe) {
        if (Test-PythonVersion $pythonExe) {
            return @{ Command = $pythonExe; Prefix = @() }
        }
    }

    $condaExe = $condaCandidates[0]
    Write-Step "Creating bundled Python 3.11 environment"
    try {
        & $condaExe create -y -p $BootstrapPythonEnv python=3.11 pip
    } catch {
        Remove-BootstrapPythonEnv
        Fail "Failed to provision Python 3.11 with conda. Please install Python 3.11+ or reset the Pinokio app and try again."
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pythonExe)) {
        Remove-BootstrapPythonEnv
        Fail "Failed to provision Python 3.11 with conda. Please install Python 3.11+ or reset the Pinokio app and try again."
    }

    return @{ Command = $pythonExe; Prefix = @() }
}

function Invoke-Python($PythonInfo, [string[]]$PythonArgs) {
    $allArgs = @()
    if ($PythonInfo.Prefix) {
        $allArgs += $PythonInfo.Prefix
    }
    if ($PythonArgs) {
        $allArgs += $PythonArgs
    }
    & $PythonInfo.Command @allArgs
    if ($LASTEXITCODE -ne 0) {
        Fail "Python command failed: $($PythonInfo.Command) $($allArgs -join ' ')"
    }
}

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "Missing required command: $Name"
    }
}

function Test-SameFileContent($PathA, $PathB) {
    if (-not (Test-Path $PathA) -or -not (Test-Path $PathB)) {
        return $false
    }
    return (Get-FileHash $PathA).Hash -eq (Get-FileHash $PathB).Hash
}

function Test-XttsEnvConflicts($EnvDir) {
    $PythonExe = Join-Path $EnvDir "Scripts/python.exe"
    if (-not (Test-Path $PythonExe)) {
        return $false
    }

    try {
        $probeOutput = & $PythonExe -c @'
from importlib import metadata

conflicting_dists = []
for dist_name in ("coqpit",):
    try:
        metadata.distribution(dist_name)
    except metadata.PackageNotFoundError:
        continue
    else:
        conflicting_dists.append(dist_name)

raise SystemExit(0 if conflicting_dists else 1)
'@ 2>$null
    } catch {
        Write-Warning ("XTTS conflict probe failed for {0}: {1}" -f $EnvDir, $_.Exception.Message)
        return $false
    }

    return $LASTEXITCODE -eq 0
}

function Sync-PythonRequirements($PythonInfo, $EnvDir, $RequirementsFile, $Label) {
    $PythonExe = Join-Path $EnvDir "Scripts/python.exe"
    $StampFile = Join-Path $EnvDir ".requirements.stamp"

    if ($Label -eq "XTTS" -and (Test-XttsEnvConflicts $EnvDir)) {
        Write-Step "Resetting XTTS environment to remove stale Coqui packages"
        Remove-Item $EnvDir -Recurse -Force
    }

    if (-not (Test-Path $PythonExe)) {
        Write-Step "Creating $Label environment"
        Invoke-Python $PythonInfo @("-m", "venv", $EnvDir)
    }

    if (-not (Test-SameFileContent $RequirementsFile $StampFile)) {
        Write-Step "Installing $Label dependencies"
        & $PythonExe -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) { Fail "Failed to upgrade pip in $Label environment" }
        & $PythonExe -m pip install -r $RequirementsFile
        if ($LASTEXITCODE -ne 0) { Fail "Failed to install $Label dependencies" }
        Copy-Item $RequirementsFile $StampFile -Force
    } else {
        Write-Step "$Label dependencies already up to date"
    }
}

function Ensure-FrontendReady() {
    $Lockfile = Join-Path $FrontendDir "package-lock.json"
    $NodeModules = Join-Path $FrontendDir "node_modules"
    $InstallStamp = Join-Path $NodeModules ".install.stamp"
    $DistIndex = Join-Path $FrontendDir "dist/index.html"
    $NeedsBuild = $false

    if (-not (Test-Path $NodeModules) -or -not (Test-SameFileContent $Lockfile $InstallStamp)) {
        Require-Command "npm"
        Write-Step "Installing frontend dependencies"
        Push-Location $FrontendDir
        try {
            npm install
            if ($LASTEXITCODE -ne 0) { Fail "Frontend dependency install failed" }
        } finally {
            Pop-Location
        }
        Copy-Item $Lockfile $InstallStamp -Force
        $NeedsBuild = $true
    } else {
        Write-Step "Frontend dependencies already up to date"
    }

    if (-not (Test-Path $DistIndex)) {
        $NeedsBuild = $true
    } else {
        $DistTime = (Get-Item $DistIndex).LastWriteTimeUtc
        $WatchedFiles = @(
            (Join-Path $FrontendDir "package.json"),
            $Lockfile,
            (Join-Path $FrontendDir "index.html")
        )
        foreach ($watched in $WatchedFiles) {
            if ((Get-Item $watched).LastWriteTimeUtc -gt $DistTime) {
                $NeedsBuild = $true
                break
            }
        }

        if (-not $NeedsBuild) {
            $NewerSource = Get-ChildItem (Join-Path $FrontendDir "src") -File -Recurse | Where-Object { $_.LastWriteTimeUtc -gt $DistTime } | Select-Object -First 1
            if ($NewerSource) {
                $NeedsBuild = $true
            }
        }
    }

    if ($NeedsBuild) {
        Require-Command "npm"
        Write-Step "Building frontend"
        Push-Location $FrontendDir
        try {
            npm run build
            if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed" }
        } finally {
            Pop-Location
        }
    } else {
        Write-Step "Frontend build already up to date"
    }
}

function Maybe-RestoreDemoBundle($PythonInfo) {
    if (-not (Test-Path $DemoZip)) {
        return
    }

    & $PythonInfo.Command @($PythonInfo.Prefix + @("-m", "app.demo_bundle", "status", "--base-dir", $Root)) *> $null
    if ($LASTEXITCODE -ne 0) {
        return
    }

    $installDemo = if ($env:AUDIOBOOK_STUDIO_INSTALL_DEMO) { $env:AUDIOBOOK_STUDIO_INSTALL_DEMO } else { "ask" }
    switch -Regex ($installDemo) {
        "^(1|true|yes)$" { break }
        "^(0|false|no)$" {
            Write-Step "Skipping demo library install"
            return
        }
        default {
            if (-not [Environment]::UserInteractive) {
                Write-Step "No interactive terminal detected; installing demo library by default"
            } else {
                $reply = Read-Host "No existing library was found. Install the demo library? [Y/n]"
                if ($reply -and $reply.Trim() -notmatch '^(y|yes)$') {
                    Write-Step "Starting with an empty library"
                    return
                }
            }
        }
    }

    Write-Step "Installing demo library"
    & $PythonInfo.Command @($PythonInfo.Prefix + @("-m", "app.demo_bundle", "restore", "--base-dir", $Root, "--zip", $DemoZip))
    if ($LASTEXITCODE -ne 0) {
        Fail "Failed to restore the demo library"
    }
}

$PythonInfo = Find-Python
if (-not $PythonInfo) {
    $PythonInfo = Get-CondaBootstrapPython
}
if (-not $PythonInfo) {
    Fail "Python 3.11+ is required. Please install Python 3.11 or newer, or use Pinokio's AI bundle with conda support."
}

Write-Step "Using Python: $($PythonInfo.Command)"
Sync-PythonRequirements $PythonInfo $AppVenv (Join-Path $Root "requirements.txt") "app"
Sync-PythonRequirements $PythonInfo $XttsVenv (Join-Path $Root "requirements-xtts.txt") "XTTS"
Ensure-FrontendReady
Maybe-RestoreDemoBundle $PythonInfo

if ($SetupOnly) {
    Write-Step "Setup complete"
    exit 0
}

$UvicornExe = Join-Path $AppVenv "Scripts/uvicorn.exe"
if (-not (Test-Path $UvicornExe)) {
    Fail "uvicorn not found in the app environment: $UvicornExe"
}

Write-Step "Starting Audiobook Studio on http://127.0.0.1:$Port"
Push-Location $Root
try {
    if ($NoReload) {
        & $UvicornExe "run:app" "--port" "$Port"
    } else {
        & $UvicornExe "run:app" "--reload" "--port" "$Port"
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
