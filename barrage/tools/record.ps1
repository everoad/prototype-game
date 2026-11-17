# 녹화: 서버 + 화면 없는 Edge(GPU) + ffmpeg → prototypes/barrage/out/<Name>.mp4 (포트 8798 — 미리보기 8797과 따로)
# 예: powershell -File prototypes/barrage/tools/record.ps1 -Seconds 20 -Fps 60 -Name first -Query "bot=1&seed=1"
param(
  [int]$Seconds = 30,
  [string]$Name = 'barrage',
  [string]$Query = 'seed=1',
  [int]$Fps = 30,
  [int]$Width = 1280,
  [int]$Height = 720,
  [int]$Port = 8798,   # 미리보기 서버(8797)와 겹치지 않게 — 시작할 때 이 포트의 serve.py를 끈다
  [int]$Slow = 1,      # 느린 화면: 찍은 장(Fps)을 Fps / Slow 장으로 엮는다(예: -Fps 120 -Slow 4 = 4배 느린 30장 영상 — 소리는 뺀다). 판과 효과가 같이 느려진다(speed=는 판만 느려진다)
  [switch]$Software,   # GPU 대신 소프트웨어 렌더(SwiftShader) — 느리다(그림자 있는 판은 한 장 수 초)
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
$profile = Join-Path $env:TEMP ("barrage-record-$Port-" + (Get-Date -Format 'yyyyMMddHHmmss'))   # 녹화마다 새 프로필(지난 Edge가 프로필을 쥐고 있으면 새 창이 아무것도 안 띄웠다)
$url = "http://127.0.0.1:$Port/?$Query&record=$Seconds&fps=$Fps"   # localhost는 Edge가 IPv6(::1)부터 찾아 가끔 보내기가 실패했다
$gl = if ($Software) { @('--use-angle=swiftshader', '--enable-unsafe-swiftshader') } else { @('--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization') }
$args = @('--headless=new') + $gl + @("--window-size=$Width,$Height",
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
$wav = Join-Path $frames 'audio.wav'
$rate = if ($Slow -gt 1) { [math]::Round($Fps / $Slow) } else { $Fps }
if ((Test-Path $wav) -and $Slow -le 1) {   # 녹화 페이지가 그린 소리(OfflineAudioContext)를 합친다
  & ffmpeg -y -hide_banner -loglevel error -framerate $rate -i (Join-Path $frames '%05d.png') -i $wav -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -crf 22 -c:a aac -b:a 160k -shortest $mp4
} else {
  & ffmpeg -y -hide_banner -loglevel error -framerate $rate -i (Join-Path $frames '%05d.png') -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -crf 22 $mp4
}
Write-Host "video $mp4"
