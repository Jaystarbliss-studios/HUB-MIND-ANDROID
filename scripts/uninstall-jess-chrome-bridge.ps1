$ErrorActionPreference = 'Stop'
$hostName = 'com.jaystarbliss.hubmind'
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
$targetRoot = Join-Path $env:LOCALAPPDATA 'Jaystarbliss\Hub-Mind\JessChromeBridge'
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath -Recurse -Force }
if (Test-Path -LiteralPath $targetRoot) { Remove-Item -LiteralPath $targetRoot -Recurse -Force }
Write-Output 'Jess Chrome native messaging host unregistered for the current Windows user.'
Write-Output 'If the extension was loaded unpacked in Chrome, remove it from chrome://extensions as well.'
