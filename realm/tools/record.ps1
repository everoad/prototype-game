# 시험판 녹화: 서버 + 화면 없는 Edge + ffmpeg → prototypes/realm/out/<Name>.mp4
# 예: powershell -File prototypes/realm/tools/record.ps1 -Seconds 30 -Name stage1 -Query "scale=1&seed=1&speed=3"
param(
  [int]$Seconds = 30,
  [string]$Name = 'stage1',
  [string]$Query = 'scale=1&seed=1',
  [int]$Fps = 30,
  [int]$Width = 1280,
  [int]$Height = 720,
  [int]$Port = 8766,
  [int]$TimeoutMinutes = 40
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'out'
$frames = Join-Path $out 'frames'
if (Test-Path $frames) { Remove-Item -Recurse -Force $frames }
New-Item -ItemType Directory -Force $frames | Out-Null

function Stop-Servers { Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like "*serve.py*$Port*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
Stop-Servers   # 지난 녹화가 남긴 서버(파이썬 실행기가 자식으로 띄운 것까지)
$server = Start-Process -FilePath python -ArgumentList @("`"$PSScriptRoot\serve.py`"", $Port) -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 800
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profile = Join-Path $env:TEMP ("realm-record-$Port-" + (Get-Date -Format 'yyyyMMddHHmmss'))   # 녹화마다 새 프로필(지난 Edge가 프로필을 쥐고 있으면 새 창이 아무것도 안 띄웠다)
$url = "http://localhost:$Port/?$Query&record=$Seconds&fps=$Fps"
$args = @('--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', "--window-size=$Width,$Height",
  "--user-data-dir=`"$profile`"", '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--no-first-run', $url)
$browser = Start-Process -FilePath $edge -ArgumentList $args -PassThru
$clock = [Diagnostics.Stopwatch]::StartNew()
$doneFile = Join-Path $frames 'done'
while (-not (Test-Path $doneFile)) {
  if ($clock.Elapsed.TotalMinutes -gt $TimeoutMinutes) { Write-Host 'record timeout'; break }
  Start-Sleep -Seconds 2
}
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like "*$profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }   # 이 녹화의 Edge만
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Stop-Servers
$count = (Get-ChildItem $frames -Filter *.png).Count
Write-Host ("frames {0} in {1:0} s" -f $count, $clock.Elapsed.TotalSeconds)
$mp4 = Join-Path $out "$Name.mp4"
& ffmpeg -y -hide_banner -loglevel error -framerate $Fps -i (Join-Path $frames '%05d.png') -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -crf 22 $mp4
Write-Host "video $mp4"
