# تعليق صوتي مجاني بأصوات الويندوز (OneCore)، ومنها الصوت العربي "Naayf"
# الاستخدام: powershell -File scripts/tts.ps1 -TextFile in.txt -Out out.wav [-Voice "Naayf"] [-Rate 1.0]
# -List بيطبع الأصوات المتاحة
param(
  [string]$TextFile,
  [string]$Out,
  [string]$Voice = "Naayf",
  [double]$Rate = 1.0,
  [switch]$List
)
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

# أداة صغيرة عشان نستنى عمليات WinRT اللي بتشتغل async
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}

$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($List) {
  $voices | ForEach-Object { "{0}|{1}|{2}" -f $_.DisplayName, $_.Language, $_.Gender }
  exit 0
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$match = $voices | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
if (-not $match) { throw "الصوت '$Voice' مش موجود على الجهاز" }
$synth.Voice = $match
$synth.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(3.0, $Rate))

$text = [IO.File]::ReadAllText($TextFile, [Text.Encoding]::UTF8)
$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])

$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$size = [uint32]$stream.Size
$null = Await ($reader.LoadAsync($size)) ([uint32])
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($Out, $bytes)
"ok $size"
