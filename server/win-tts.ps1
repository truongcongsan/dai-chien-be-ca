# Giọng đọc có sẵn của Windows (WinRT, gồm cả giọng OneCore như "Microsoft An" tiếng Việt).
# Liệt kê:  powershell -File win-tts.ps1 -List            → mỗi dòng một tên giọng vi-VN
# Đọc:      powershell -File win-tts.ps1 -Voice "Microsoft An" -TextFile in.txt -Out out.wav
param(
  [switch]$List,
  [string]$Voice = "",
  [string]$TextFile = "",
  [string]$Out = "",
  [double]$Rate = 1.1
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}

$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like "vi*" }
if ($List) {
  $voices | ForEach-Object { $_.DisplayName }
  exit 0
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$pick = $voices | Where-Object { $_.DisplayName -eq $Voice } | Select-Object -First 1
if (-not $pick) { $pick = $voices | Select-Object -First 1 }
if (-not $pick) { throw "Không có giọng tiếng Việt" }
$synth.Voice = $pick
try { $synth.Options.SpeakingRate = $Rate } catch {}

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$size = [uint32]$stream.Size
$null = Await ($reader.LoadAsync($size)) ([uint32])
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)
[System.IO.File]::WriteAllBytes($Out, $bytes)
