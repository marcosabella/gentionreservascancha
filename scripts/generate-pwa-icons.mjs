import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Preserve the existing brand artwork, centered within the maskable safe area.
mkdirSync('public/pwa', { recursive: true });
for (const [name, logo] of [['padel-center', 'logo-padel-center-transparente.png'], ['pura-vida', 'logo-pura-vida-transparente.png']]) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
Add-Type -AssemblyName System.Drawing
$brandImage = [System.Drawing.Image]::FromFile($env:PWA_LOGO_SOURCE)
try {
  foreach ($iconSize in @(180, 192, 512)) {
    $canvas = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $scale = ($iconSize * 0.78) / [Math]::Sqrt($brandImage.Width * $brandImage.Width + $brandImage.Height * $brandImage.Height)
      $width = [single]($brandImage.Width * $scale)
      $height = [single]($brandImage.Height * $scale)
      $rectangle = New-Object System.Drawing.RectangleF([single](($iconSize - $width) / 2), [single](($iconSize - $height) / 2), $width, $height)
      $graphics.DrawImage($brandImage, $rectangle)
      $canvas.Save(($env:PWA_ICON_PREFIX + '-' + $iconSize + '.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $canvas.Dispose() }
  }
} finally { $brandImage.Dispose() }
`], { env: { ...process.env, PWA_LOGO_SOURCE: resolve('public', logo), PWA_ICON_PREFIX: resolve('public/pwa', name) }, windowsHide: true, stdio: 'inherit' });
}
console.log('PWA icons generated for Padel Center and Pura Vida.');
