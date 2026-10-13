# 헤드리스 Chrome 으로 서식을 PDF 로 인쇄해 쪽수를 센다.
# 사전: 로컬 서버(127.0.0.1:5180, 리드디벨롭 폴더) 실행 중.  사용: powershell -File tools\print-check.ps1 [-Src orig]
param([string]$Src = 'dev')
$out = Join-Path $env:TEMP 'leaddev-printcheck'
New-Item -ItemType Directory -Force $out | Out-Null
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
foreach ($c in 'single-report', 'single-long', 'batch') {
  $pdf = Join-Path $out "$Src-$c.pdf"
  Remove-Item $pdf -ErrorAction SilentlyContinue
  & $chrome --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=20000 "--user-data-dir=$out\profile" "--print-to-pdf=$pdf" "http://127.0.0.1:5180/tools/print-check.html?case=$c&src=$Src" 2>&1 | Out-Null
  $bytes = [System.IO.File]::ReadAllBytes($pdf)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  $pages = ([regex]::Matches($text, '/Type\s*/Page[^s]')).Count
  Write-Output "$Src $c : $pages 쪽  ($pdf)"
}
