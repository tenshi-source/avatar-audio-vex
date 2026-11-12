$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$serverUrl = 'http://127.0.0.1:8001/'

function Find-ObsExecutable {
  $candidates = @()

  if ($env:VEX_OBS_PATH) {
    $candidates += $env:VEX_OBS_PATH
  }

  $command = Get-Command obs64.exe -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }

  foreach ($programFiles in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($programFiles) {
      $candidates += Join-Path $programFiles 'obs-studio\bin\64bit\obs64.exe'
      $candidates += Join-Path $programFiles 'obs-studio\bin\32bit\obs32.exe'
      $candidates += Join-Path $programFiles 'Programs\obs-studio\bin\64bit\obs64.exe'
    }
  }

  $registryKeys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\obs64.exe',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\obs64.exe',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\obs64.exe'
  )

  foreach ($key in $registryKeys) {
    $entry = Get-Item -LiteralPath $key -ErrorAction SilentlyContinue
    if ($entry) {
      $registeredPath = $entry.GetValue('')
      if ($registeredPath) {
        $candidates += $registeredPath
      }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Test-AvatarServer {
  try {
    $response = Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 2
    return $response.Content.Contains('<main class="app-shell">')
  } catch {
    return $false
  }
}

function Show-StartupError([string]$message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    'Avatar Microfone - erro ao iniciar',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

try {
  $obsPath = Find-ObsExecutable
  if (-not $obsPath) {
    throw 'O OBS Studio não foi encontrado. Instale o OBS ou defina VEX_OBS_PATH com o caminho completo para obs64.exe.'
  }

  if (-not (Test-AvatarServer)) {
    $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
      $pythonPath = $pythonLauncher.Source
      $pythonArguments = @('-3', '-m', 'http.server', '8001', '--bind', '127.0.0.1')
    } else {
      $python = Get-Command python.exe -ErrorAction SilentlyContinue
      if (-not $python) {
        throw 'O servidor local requer Python 3. Instale-o ou use a página pública para testar o avatar sem conexão ao OBS.'
      }

      $pythonPath = $python.Source
      $pythonArguments = @('-m', 'http.server', '8001', '--bind', '127.0.0.1')
    }

    Start-Process -FilePath $pythonPath `
      -ArgumentList $pythonArguments `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden

    $serverReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
      Start-Sleep -Milliseconds 500
      if (Test-AvatarServer) {
        $serverReady = $true
        break
      }
    }

    if (-not $serverReady) {
      throw 'O servidor local não iniciou. Verifique se a porta 8001 está livre e se o Python está instalado.'
    }
  }

  Start-Process -FilePath $obsPath -WorkingDirectory (Split-Path -Parent $obsPath)
} catch {
  Show-StartupError $_.Exception.Message
}
