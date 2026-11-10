# Khởi động Bể Cá Hạnh Phúc trên Windows: engine và web chạy ở HAI cửa sổ PowerShell riêng.
#
# Vì sao không dùng `pnpm dev`: `concurrently` gom log của engine qua pipe; trên Windows, Node ghi vào pipe
# kiểu chặn, nên khi pipe nghẽn thì engine đứng im (mất kết nối TikTok giữa buổi live). Cửa sổ riêng thì
# engine ghi thẳng ra màn hình, không bị chặn. Hai cửa sổ cũng không phụ thuộc app nào khác: đóng app Claude
# hay terminal khác thì game vẫn chạy.
#
# Dùng: bấm đúp start-windows.cmd ở thư mục gốc, hoặc `corepack pnpm start:win`.
# Tắt: đóng hai cửa sổ "Bể Cá engine" và "Bể Cá web" (hoặc Ctrl+C trong từng cửa sổ).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Part([string]$title, [int]$port, [string]$command) {
  if (Test-Port $port) {
    Write-Host "[$title] cổng $port đang chạy rồi, bỏ qua." -ForegroundColor Yellow
    return
  }
  $inner = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$root'; `$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'; $command"
  Start-Process powershell.exe -WorkingDirectory $root -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $inner)
  Write-Host "[$title] đã mở cửa sổ riêng." -ForegroundColor Green
}

Start-Part "Bể Cá engine" 3321 "corepack pnpm exec tsx server/main.ts"
Start-Part "Bể Cá web" 3320 "corepack pnpm exec next dev -H 127.0.0.1 -p 3320"

# Chờ hai server sẵn sàng (tối đa ~60 giây) rồi in link.
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and -not ((Test-Port 3321) -and (Test-Port 3320))) { Start-Sleep -Milliseconds 500 }

if ((Test-Port 3321) -and (Test-Port 3320)) {
  Write-Host ""
  Write-Host "Sẵn sàng:" -ForegroundColor Green
  Write-Host "  Admin:            http://127.0.0.1:3320"
  Write-Host "  Stage (OBS):      http://127.0.0.1:3320/?view=stage"
  Write-Host "  Stage (LIVE Studio, không nhận localhost): http://beca-7f000001.nip.io:3320/?view=stage"
} else {
  Write-Host "Chưa thấy đủ hai server sau 60 giây. Xem lỗi trong cửa sổ 'Bể Cá engine' / 'Bể Cá web'." -ForegroundColor Red
}
