# Temporary 96px PNG assets for the Module C shell. Replace with approved design assets in Module D.
Add-Type -AssemblyName System.Drawing
$output = Join-Path $PSScriptRoot '..\src\assets\tabbar'
New-Item -ItemType Directory -Path $output -Force | Out-Null
foreach ($active in @($false, $true)) {
  $color = if ($active) { [System.Drawing.ColorTranslator]::FromHtml('#3BA7FF') } else { [System.Drawing.ColorTranslator]::FromHtml('#9DAFBE') }
  $suffix = if ($active) { '-active' } else { '' }
  foreach ($name in @('map', 'plan', 'profile')) {
    $bitmap = [System.Drawing.Bitmap]::new(96, 96)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brush = [System.Drawing.SolidBrush]::new($color)
    $pen = [System.Drawing.Pen]::new($color, 8)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    if ($name -eq 'map') {
      $graphics.FillEllipse($brush, 22, 10, 52, 52)
      $points = [System.Drawing.Point[]]@([System.Drawing.Point]::new(25, 53), [System.Drawing.Point]::new(71, 53), [System.Drawing.Point]::new(48, 87))
      $graphics.FillPolygon($brush, $points)
      $graphics.FillEllipse([System.Drawing.Brushes]::White, 37, 25, 22, 22)
    } elseif ($name -eq 'plan') {
      $graphics.DrawRectangle($pen, 19, 16, 58, 64)
      foreach ($y in @(34, 49, 64)) {
        $graphics.DrawLine($pen, 32, $y, 36, $y + 4)
        $graphics.DrawLine($pen, 36, $y + 4, 42, $y - 4)
        $graphics.DrawLine($pen, 49, $y, 65, $y)
      }
    } else {
      $graphics.FillEllipse($brush, 35, 12, 26, 26)
      $graphics.DrawArc($pen, 19, 42, 58, 46, 195, 150)
    }
    $bitmap.Save((Join-Path $output "$name$suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}
