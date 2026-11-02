[CmdletBinding()]
param(
  [switch]$MachineWide,
  [switch]$ForceInstallExtension
)
$ErrorActionPreference = 'Stop'
$hostName = 'com.jaystarbliss.hubmind'
$extensionId = 'baifedjcpcnkjjoikbafnkiombiaooai'
$extensionOrigin = "chrome-extension://$extensionId/"
$resourceRoot = $PSScriptRoot
$extensionSource = Join-Path $resourceRoot 'jess-chrome-extension'
$nativeHostExe = Join-Path $resourceRoot 'JessChromeNativeHost.exe'
$targetRoot = Join-Path $env:LOCALAPPDATA 'Jaystarbliss\Hub-Mind\JessChromeBridge'
$extensionTarget = Join-Path $targetRoot 'chrome-extension'
$manifestPath = Join-Path $targetRoot "$hostName.json"
$hostInstallRoot = $targetRoot
$registryRoot = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
if ($MachineWide) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'Machine-wide setup requires an elevated PowerShell window. Re-run this script as Administrator.' }
  $hostInstallRoot = Join-Path $env:ProgramFiles 'Hub-Mind\JessChromeNativeHost'
  $manifestPath = Join-Path $hostInstallRoot "$hostName.json"
  $registryRoot = 'HKLM:\Software\Google\Chrome\NativeMessagingHosts'
}
$tokenPath = Join-Path $targetRoot 'bridge-token'

if (-not (Test-Path -LiteralPath $nativeHostExe -PathType Leaf)) { throw "Native host executable not found: $nativeHostExe. Reinstall Hub-Mind with the Windows native host package." }
if (-not (Test-Path -LiteralPath (Join-Path $extensionSource 'manifest.json') -PathType Leaf)) { throw "Chrome extension files not found: $extensionSource." }
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
if ($MachineWide) { New-Item -ItemType Directory -Path $hostInstallRoot -Force | Out-Null }
if (Test-Path -LiteralPath $extensionTarget) { Remove-Item -LiteralPath $extensionTarget -Recurse -Force }
Copy-Item -LiteralPath $extensionSource -Destination $extensionTarget -Recurse -Force
$hostPath = $nativeHostExe
if ($MachineWide) {
  $hostPath = Join-Path $hostInstallRoot 'JessChromeNativeHost.exe'
  Copy-Item -LiteralPath $nativeHostExe -Destination $hostPath -Force
}

$nativeManifest = @{
  name = $hostName
  description = 'Hub-Mind Jess Chrome bridge'
  path = $hostPath
  type = 'stdio'
  allowed_origins = @($extensionOrigin)
}
$manifestJson = $nativeManifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))

$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $tokenBytes = New-Object byte[] 32
  $random.GetBytes($tokenBytes)
  $bridgeToken = [Convert]::ToBase64String($tokenBytes)
} finally { $random.Dispose() }
[System.IO.File]::WriteAllText($tokenPath, $bridgeToken, [System.Text.UTF8Encoding]::new($false))
# Restrict the per-user bridge token without Set-Acl. Set-Acl may attempt
# to write SACL/owner metadata and fail with SeSecurityPrivilege even for a
# normal user's own token file. icacls changes the DACL only.
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$grant = "*$($currentSid.Value):(F)"
& "$env:SystemRoot\System32\icacls.exe" $tokenPath /inheritance:r /grant:r $grant | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not restrict permissions on the Jess bridge token (icacls exit code $LASTEXITCODE). The token file remains at $tokenPath; remove it and rerun the installer."
}

$registryPath = Join-Path $registryRoot $hostName
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

if ($ForceInstallExtension) {
  # Keep force-install policy per-user because the bridge token is intentionally per-user.
  $policyRoot = 'HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist'
  $extensionManifest = Get-Content -LiteralPath (Join-Path $extensionSource 'manifest.json') -Raw | ConvertFrom-Json
  if (-not $extensionManifest.key) { throw 'The Chrome extension manifest must contain its stable public key before force-install policy can be configured.' }
  $publicKeyBytes = [Convert]::FromBase64String([string]$extensionManifest.key)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $digest = $sha.ComputeHash($publicKeyBytes) } finally { $sha.Dispose() }
  $idChars = New-Object System.Collections.Generic.List[char]
  foreach ($byte in $digest[0..15]) {
    $idChars.Add([char]([int][char]'a' + (($byte -shr 4) -band 15)))
    $idChars.Add([char]([int][char]'a' + ($byte -band 15)))
  }
  $derivedExtensionId = -join $idChars
  if ($derivedExtensionId -ne $extensionId) { throw "Extension ID mismatch. Expected $extensionId but manifest key resolves to $derivedExtensionId." }
  New-Item -Path $policyRoot -Force | Out-Null
  $properties = Get-ItemProperty -LiteralPath $policyRoot -ErrorAction SilentlyContinue
  $slot = 1
  while ($properties -and ($properties.PSObject.Properties.Name -contains [string]$slot)) { $slot++ }
  Set-ItemProperty -LiteralPath $policyRoot -Name ([string]$slot) -Value "$extensionId;https://clients2.google.com/service/update2/crx"
  Write-Output "Per-user Chrome force-install policy added for extension $extensionId. This works only after that exact extension version has been published to the Chrome Web Store."
}

Write-Output $(if ($MachineWide) { 'Jess Chrome native host registered machine-wide (elevated setup).' } else { 'Jess Chrome native host registered for the current Windows user.' })
Write-Output "Setup script path: $PSCommandPath"
Write-Output "1. Open chrome://extensions in Chrome."
Write-Output '2. Enable Developer mode.'
if (-not $ForceInstallExtension) { Write-Output "3. Select Load unpacked and choose: $extensionTarget" } else { Write-Output '3. Chrome will force-install the unlisted store extension once it is published and Chrome refreshes policy.' }
Write-Output '4. Keep Hub-Mind running, then start a Full Control Session before asking Jess to control Chrome.'
Write-Output 'Chrome tab/page access is active only while the installed desktop app and extension are connected.'
Write-Output 'Optional: run this script as Administrator with -MachineWide to register the native host under HKLM.'
Write-Output 'After publishing the extension as Unlisted in the Chrome Web Store, run with -ForceInstallExtension to add the matching Chrome force-install policy.'
