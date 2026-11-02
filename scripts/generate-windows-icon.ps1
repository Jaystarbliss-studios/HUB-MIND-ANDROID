$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$logoPath = Join-Path $PSScriptRoot '..\public\hub-mind logo.png'
$resourcesPath = Join-Path $PSScriptRoot '..\build-resources'
$iconPath = Join-Path $resourcesPath 'icon.ico'
if (-not (Test-Path -LiteralPath $logoPath)) { throw "Official Hub-Mind logo not found: $logoPath" }
New-Item -ItemType Directory -Path $resourcesPath -Force | Out-Null
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $logoPath).Path)
try {
  $bitmap = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $scale = [Math]::Min(256.0 / $source.Width, 256.0 / $source.Height)
      $width = [int][Math]::Round($source.Width * $scale)
      $height = [int][Math]::Round($source.Height * $scale)
      $x = [int][Math]::Floor((256 - $width) / 2)
      $y = [int][Math]::Floor((256 - $height) / 2)
      $graphics.DrawImage($source, $x, $y, $width, $height)
    } finally { $graphics.Dispose() }
    $png = New-Object System.IO.MemoryStream
    try { $bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $bytes = $png.ToArray() } finally { $png.Dispose() }
    $stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $writer = New-Object System.IO.BinaryWriter($stream)
    try {
      $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
      $writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0)
      $writer.Write([UInt16]1); $writer.Write([UInt16]32)
      $writer.Write([UInt32]$bytes.Length); $writer.Write([UInt32]22); $writer.Write($bytes); $writer.Flush()
    } finally { $writer.Dispose(); $stream.Dispose() }
  } finally { $bitmap.Dispose() }
} finally { $source.Dispose() }
if (-not (Test-Path -LiteralPath $iconPath) -or (Get-Item -LiteralPath $iconPath).Length -lt 100) { throw 'Windows icon generation failed.' }
Write-Output "Generated 256x256 Windows icon from the official Hub-Mind logo: $iconPath"
