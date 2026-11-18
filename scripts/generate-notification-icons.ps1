Add-Type -AssemblyName System.Drawing

# Reuse public/tennis-ball.svg geometry. Transparent seams survive Android masking.
$notificationAssetDirectory = Join-Path $PSScriptRoot '../public/pwa'
foreach ($notificationVariant in @('icon', 'badge')) {
  $notificationSize = if ($notificationVariant -eq 'badge') { 96 } else { 192 }
  $notificationCanvas = New-Object System.Drawing.Bitmap($notificationSize, $notificationSize)
  $notificationGraphics = [System.Drawing.Graphics]::FromImage($notificationCanvas)
  try {
    $notificationGraphics.Clear([System.Drawing.Color]::Transparent)
    $notificationGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $notificationGraphics.ScaleTransform(($notificationSize / 64.0), ($notificationSize / 64.0))
    $notificationCircle = New-Object System.Drawing.RectangleF(3, 3, 58, 58)
    if ($notificationVariant -eq 'badge') {
      $notificationGraphics.FillEllipse([System.Drawing.Brushes]::White, $notificationCircle)
    } else {
      $notificationBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($notificationCircle, [System.Drawing.ColorTranslator]::FromHtml('#d9f76e'), [System.Drawing.ColorTranslator]::FromHtml('#94c92f'), 65)
      $notificationOutline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#5b861d'), 1.5)
      try {
        $notificationGraphics.FillEllipse($notificationBrush, $notificationCircle)
        $notificationGraphics.DrawEllipse($notificationOutline, $notificationCircle)
      } finally { $notificationBrush.Dispose(); $notificationOutline.Dispose() }
    }
    $notificationClip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $notificationSeams = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
      $notificationClip.AddEllipse($notificationCircle)
      $notificationGraphics.SetClip($notificationClip)
      $notificationSeams.AddBezier(8, 7, 34, 21, 34, 43, 8, 57)
      $notificationSeams.StartFigure()
      $notificationSeams.AddBezier(56, 7, 30, 21, 30, 43, 56, 57)
      $notificationRotation = New-Object System.Drawing.Drawing2D.Matrix
      try {
        $notificationRotation.RotateAt(-28, (New-Object System.Drawing.PointF(32, 32)))
        $notificationSeams.Transform($notificationRotation)
      } finally { $notificationRotation.Dispose() }
      $notificationColor = if ($notificationVariant -eq 'badge') { [System.Drawing.Color]::Transparent } else { [System.Drawing.ColorTranslator]::FromHtml('#fbffe9') }
      $notificationPen = New-Object System.Drawing.Pen($notificationColor, 4.5)
      try {
        $notificationPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $notificationPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        if ($notificationVariant -eq 'badge') { $notificationGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy }
        $notificationGraphics.DrawPath($notificationPen, $notificationSeams)
      } finally { $notificationPen.Dispose() }
    } finally { $notificationClip.Dispose(); $notificationSeams.Dispose() }
    $notificationFile = if ($notificationVariant -eq 'badge') { 'notification-ball-badge.png' } else { 'notification-ball.png' }
    $notificationCanvas.Save((Join-Path $notificationAssetDirectory $notificationFile), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $notificationGraphics.Dispose(); $notificationCanvas.Dispose() }
}
Write-Output 'Generated notification ball (192px) and monochrome badge (96px).'
