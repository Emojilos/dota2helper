# MidMind GSI capture — слушатель для сбора реальных GSI-пакетов (TASK-009).
# Запускается на Windows-машине с Dota 2 (см. README.md рядом). Без зависимостей:
# только встроенный PowerShell 5.1+. Каждый входящий POST сохраняется отдельным
# JSON-файлом в папку captured/.
param(
  [int]$Port = 3399,
  [string]$OutDir = "captured"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outPath = (Resolve-Path $OutDir).Path

$listener = New-Object System.Net.HttpListener
# Именно localhost (не 127.0.0.1): для localhost HttpListener не требует
# admin/URL-ACL, и uri в cfg-файле тоже указывает localhost — Host совпадает.
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "MidMind GSI capture: слушаю $prefix"
Write-Host "Пакеты сохраняются в: $outPath"
Write-Host "Проверка: открой $prefix в браузере — должно ответить OK."
Write-Host "Останов: Ctrl+C (пакеты пишутся сразу, ничего не потеряется)."
Write-Host ""

$counter = 0
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request

    if ($request.HttpMethod -eq "POST") {
      $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Close()

      $counter++
      $stamp = (Get-Date).ToString("yyyyMMdd_HHmmss_fff")
      $file = Join-Path $OutDir ("{0:D5}_{1}.json" -f $counter, $stamp)
      [System.IO.File]::WriteAllText($file, $body, (New-Object System.Text.UTF8Encoding($false)))

      # Краткая сводка в консоль — видно, что пакеты реально идут и в какой фазе матча.
      $state = "?"; $clock = "?"
      try {
        $json = $body | ConvertFrom-Json
        if ($json.map) {
          if ($json.map.game_state) { $state = $json.map.game_state }
          if ($null -ne $json.map.clock_time) { $clock = $json.map.clock_time }
        }
      } catch {}
      Write-Host ("[{0}] #{1}  {2}  clock={3}  {4} байт" -f (Get-Date).ToString("HH:mm:ss"), $counter, $state, $clock, $body.Length)
    }

    $response = $context.Response
    $response.StatusCode = 200
    $buf = [System.Text.Encoding]::UTF8.GetBytes("OK")
    $response.OutputStream.Write($buf, 0, $buf.Length)
    $response.Close()
  }
}
finally {
  $listener.Stop()
  Write-Host ""
  Write-Host "Остановлено. Захвачено пакетов: $counter. Папка: $outPath"
}
