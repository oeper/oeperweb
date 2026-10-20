# Sets this Windows PC up to run the oeper.dev server (forum-server/): Node, the packages, a .env, and a background task that starts
# at boot and restarts the server if it ever stops. The Cloudflare tunnel is a separate, deliberate step (-Tunnel) so that two machines
# never answer for fs.oeper.dev at the same time.
#
#   1. Open PowerShell as Administrator in forum-server\pc
#   2.  .\install-windows.ps1                       (server only; safe to run while the phone is still serving)
#   3.  node ..\migrate.js pull --from http://PHONE-IP:8787 --key KEY       (copy everything over, see MIGRATION.md)
#   4.  .\install-windows.ps1 -Tunnel               (at cutover: installs and starts cloudflared with the TUNNEL_TOKEN from .env)
#
# Options:  -DryRun        only print what would be done
#           -Tunnel        also install the Cloudflare tunnel service (needs TUNNEL_TOKEN in .env, or pass -TunnelToken)
#           -TunnelToken   the token (it is then saved to .env)
#           -NeverSleep    stop this PC from going to sleep while plugged in (a mini PC server should not sleep)
param([switch]$DryRun, [switch]$Tunnel, [string]$TunnelToken = '', [switch]$NeverSleep)

$ErrorActionPreference = 'Stop'
$server = Split-Path -Parent $PSScriptRoot          # ...\forum-server
$envFile = Join-Path $server '.env'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Act($what, [scriptblock]$act) { if ($DryRun) { Write-Host "   [dry run] $what" -ForegroundColor DarkGray } else { Write-Host "   $what"; & $act } }
function IsAdmin { ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }

if (-not $DryRun -and -not (IsAdmin)) { throw 'Run this in an elevated PowerShell (right-click PowerShell > Run as administrator): it creates a startup task and (with -Tunnel) a service.' }
Write-Host "Server folder: $server"

# ---------- Node ----------
Step 'Node.js'
$node = (Get-Command node -ErrorAction SilentlyContinue)
$ok = $false
if ($node) { $v = [int]((node -v).TrimStart('v').Split('.')[0]); $ok = $v -ge 18; Write-Host "   found Node $(node -v)" }
if (-not $ok) {
  Act 'installing Node.js LTS with winget' { winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $DryRun -and -not $node) { throw 'Node was installed but is not on PATH yet: close this window, open a new Administrator PowerShell and run the script again.' }
}
$nodeExe = if ($node) { $node.Source } else { 'C:\Program Files\nodejs\node.exe' }

# ---------- packages ----------
Step 'npm packages'
Act 'npm install --omit=dev (a minute or two)' { Push-Location $server; try { npm install --omit=dev --no-audit --no-fund } finally { Pop-Location } }

# ---------- .env ----------
Step '.env'
if (Test-Path $envFile) { Write-Host '   .env exists, leaving it alone' }
else {
  $base = Read-Host '   Public address of this server [https://fs.oeper.dev]'
  if (-not $base) { $base = 'https://fs.oeper.dev' }
  Act 'creating .env' { Set-Content -Path $envFile -Value "PUBLIC_BASE_URL=$base`nPORT=8787" -Encoding ascii }
}
if ($TunnelToken) {
  Act 'saving TUNNEL_TOKEN to .env' {
    $lines = @(Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^\s*TUNNEL_TOKEN\s*=' })
    Set-Content -Path $envFile -Value ($lines + "TUNNEL_TOKEN=$TunnelToken") -Encoding ascii
  }
}

# ---------- start at boot ----------
Step 'Start the server at boot (Task Scheduler, runs as SYSTEM, restarts if it stops)'
$runner = Join-Path $PSScriptRoot 'run-server.cmd'
Act 'writing run-server.cmd' { Set-Content -Path $runner -Encoding ascii -Value "@echo off`r`ncd /d `"$server`"`r`n`"$nodeExe`" upload-server.js >> server.log 2>&1" }
Act 'registering the task "oeper-server"' {
  $act = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$runner`"" -WorkingDirectory $server
  $trg = New-ScheduledTaskTrigger -AtStartup
  $pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $set = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'oeper-server' -Action $act -Trigger $trg -Principal $pri -Settings $set -Force | Out-Null
  Stop-ScheduledTask -TaskName 'oeper-server' -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName 'oeper-server'
}
Act 'checking that it answers on port 8787' { Start-Sleep 4; try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/ -TimeoutSec 5).Content } catch { Write-Warning "no answer yet: look at $server\server.log" } }

# ---------- tunnel ----------
if ($Tunnel) {
  Step 'Cloudflare tunnel (this machine starts answering for your public address NOW)'
  $token = $TunnelToken
  if (-not $token -and (Test-Path $envFile)) { $m = Select-String -Path $envFile -Pattern '^\s*TUNNEL_TOKEN\s*=\s*(.+)$' | Select-Object -First 1; if ($m) { $token = $m.Matches[0].Groups[1].Value.Trim('"', "'", ' ') } }
  if (-not $token -and -not $DryRun) { throw 'No TUNNEL_TOKEN: pass -TunnelToken, or put TUNNEL_TOKEN=... in .env (the same token the phone uses).' }
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) { Act 'installing cloudflared with winget' { winget install -e --id Cloudflare.cloudflared --silent --accept-package-agreements --accept-source-agreements; $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') } }
  if (Get-Service cloudflared -ErrorAction SilentlyContinue) { Write-Host '   the cloudflared service already exists (to change the token: cloudflared service uninstall, then run this again)' }
  else { Act 'cloudflared service install <token>' { cloudflared service install $token } }
  Write-Host '   Now stop the tunnel on the OLD machine (Searver > Servers > stop tunnel), then check your public address.'
} else {
  Write-Host "`n(The tunnel was not touched. When you are ready to switch, run:  .\install-windows.ps1 -Tunnel )" -ForegroundColor Yellow
}

if ($NeverSleep) { Step 'Power'; Act 'no sleep while plugged in' { powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0 } }
Write-Host "`nDone. Check:  node `"$server\migrate.js`" doctor" -ForegroundColor Green
