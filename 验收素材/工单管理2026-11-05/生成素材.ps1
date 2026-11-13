Add-Type -AssemblyName System.Drawing
$fixtureDir = $PSScriptRoot
$fontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 28, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font('Microsoft YaHei UI', 18)
$fontSmall = New-Object System.Drawing.Font('Microsoft YaHei UI', 13)
$ink = [System.Drawing.Brushes]::DarkSlateGray
$blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235,244,255))
$green = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(234,247,240))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(208,219,231), 2)
function Save-Fixture([string]$name, [int]$width, [int]$height, [bool]$portrait) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.FillRectangle($blue, 0, 0, $width, 125)
  $graphics.DrawString('DEMO / 虚构验收材料', $fontTitle, $ink, 30, 24)
  if ($portrait) {
    $graphics.DrawString('退件实收核对', $fontBody, $ink, 30, 150)
    $graphics.DrawString('DEMO-PARCEL-002', $fontSmall, $ink, 30, 195)
    $graphics.FillRectangle($green, 30, 245, 460, 160)
    $graphics.DrawString('商品 A    1 件', $fontBody, $ink, 55, 270)
    $graphics.DrawString('商品 B    1 件', $fontBody, $ink, 55, 330)
    $graphics.DrawRectangle($pen, 30, 440, 460, 150)
    $graphics.DrawString('仅用于页面排版测试', $fontSmall, $ink, 50, 470)
    $graphics.DrawString('无真实买家、地址或仓库资料', $fontSmall, $ink, 50, 520)
    $graphics.DrawString('PORTRAIT 520 x 760', $fontSmall, $ink, 30, 680)
  } else {
    $graphics.DrawString('包裹外观与收货数量核查', $fontBody, $ink, 30, 155)
    $graphics.FillRectangle($green, 35, 225, 360, 230)
    $graphics.DrawRectangle($pen, 100, 265, 220, 130)
    $graphics.DrawLine($pen, 210, 265, 210, 395)
    $graphics.DrawString('DEMO PACKAGE', $fontSmall, $ink, 120, 405)
    $graphics.DrawString('DEMO-PARCEL-001', $fontBody, $ink, 440, 240)
    $graphics.DrawString('实收 2 件 / 外箱完整', $fontBody, $ink, 440, 300)
    $graphics.DrawString('仅用于图片上传与排版验收', $fontSmall, $ink, 440, 365)
    $graphics.DrawString('LANDSCAPE 960 x 600', $fontSmall, $ink, 30, 520)
  }
  $bitmap.Save((Join-Path $fixtureDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}
Save-Fixture '虚构包裹外观-横图.png' 960 600 $false
Save-Fixture '虚构实收清单-竖图.png' 520 760 $true
@'
虚构工单附件验收材料
包裹编号：DEMO-PARCEL-001
核对结果：实收两件，外箱完整。
本文件仅用于测试工单跟进的上传、换行显示、刷新读取和原件下载。
不含真实业务资料。
'@ | Set-Content -LiteralPath (Join-Path $fixtureDir '虚构仓库回函.txt') -Encoding UTF8
@'
parcel_no,sku,received_qty,note
DEMO-PARCEL-001,DEMO-SKU-A,1,FICTIONAL TEST DATA
DEMO-PARCEL-001,DEMO-SKU-B,1,FICTIONAL TEST DATA
'@ | Set-Content -LiteralPath (Join-Path $fixtureDir '虚构退件实收核对清单-用于测试长文件名完整展示与原件下载.csv') -Encoding UTF8
$fontTitle.Dispose()
$fontBody.Dispose()
$fontSmall.Dispose()
$blue.Dispose()
$green.Dispose()
$pen.Dispose()
