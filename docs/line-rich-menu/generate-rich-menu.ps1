Add-Type -AssemblyName System.Drawing

$width = 2500; $height = 1686
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$blue = [System.Drawing.ColorTranslator]::FromHtml('#0A8CFF')
$dark = [System.Drawing.ColorTranslator]::FromHtml('#12385E')
$surface = [System.Drawing.ColorTranslator]::FromHtml('#EEF6FF')
$white = [System.Drawing.Color]::White
$muted = [System.Drawing.ColorTranslator]::FromHtml('#5D7185')
$line = [System.Drawing.ColorTranslator]::FromHtml('#D6E6F4')
$green = [System.Drawing.ColorTranslator]::FromHtml('#06C755')

$graphics.Clear($surface)
$header = [System.Drawing.Rectangle]::new(0, 0, $width, 215)
$graphics.FillRectangle([System.Drawing.SolidBrush]::new($blue), $header)

$fontBold = [System.Drawing.Font]::new('Tahoma', 48, [System.Drawing.FontStyle]::Bold)
$fontTitle = [System.Drawing.Font]::new('Tahoma', 44, [System.Drawing.FontStyle]::Bold)
$fontSub = [System.Drawing.Font]::new('Tahoma', 25, [System.Drawing.FontStyle]::Regular)
$fontLogo = [System.Drawing.Font]::new('Segoe UI', 66, [System.Drawing.FontStyle]::Bold)
$graphics.DrawString('iPrint', $fontLogo, [System.Drawing.SolidBrush]::new($white), 86, 52)
$graphics.DrawString('พิมพ์งานแบบเห็นภาพ  •  เลือกบริการที่ต้องการ', $fontSub, [System.Drawing.SolidBrush]::new($white), 380, 88)

$cards = @(
  @{ title = 'ขอใบเสนอราคา'; sub = 'แจ้งสเปกและจำนวน'; color = $blue; icon = '฿' },
  @{ title = 'ส่งไฟล์งาน'; sub = 'แนบไฟล์หรือรูปตัวอย่าง'; color = $dark; icon = '↑' },
  @{ title = 'ต้องการออกแบบ'; sub = 'ให้ทีมช่วยสร้างงาน'; color = $green; icon = '✦' },
  @{ title = 'ดูนามบัตร'; sub = 'เลือกแพ็กเกจและวัสดุ'; color = $blue; icon = '▭' },
  @{ title = 'เช็กสถานะงาน'; sub = 'แจ้งเลขออร์เดอร์'; color = $dark; icon = '✓' },
  @{ title = 'คุยกับทีมงาน'; sub = 'สอบถามเพิ่มเติม'; color = $green; icon = '…' }
)

$positions = @(@(74, 272), @(866, 272), @(1658, 272), @(74, 924), @(866, 924), @(1658, 924))
for ($i = 0; $i -lt $cards.Count; $i++) {
  $x = $positions[$i][0]; $y = $positions[$i][1]
  $rect = [System.Drawing.Rectangle]::new($x, $y, 768, 590)
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new($white), $rect)
  $graphics.DrawRectangle([System.Drawing.Pen]::new($line, 4), $rect)
  $circle = [System.Drawing.Rectangle]::new($x + 58, $y + 58, 126, 126)
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new($cards[$i].color), $circle)
  $iconFont = [System.Drawing.Font]::new('Segoe UI Symbol', 54, [System.Drawing.FontStyle]::Bold)
  $iconSize = $graphics.MeasureString($cards[$i].icon, $iconFont)
  $graphics.DrawString($cards[$i].icon, $iconFont, [System.Drawing.SolidBrush]::new($white), $x + 121 - ($iconSize.Width / 2), $y + 80 - ($iconSize.Height / 2))
  $graphics.DrawString($cards[$i].title, $fontTitle, [System.Drawing.SolidBrush]::new($dark), $x + 58, $y + 238)
  $graphics.DrawString($cards[$i].sub, $fontSub, [System.Drawing.SolidBrush]::new($muted), $x + 58, $y + 324)
  $graphics.DrawString('แตะเพื่อเริ่มต้น  ›', $fontSub, [System.Drawing.SolidBrush]::new($cards[$i].color), $x + 58, $y + 457)
}

$graphics.DrawString('iPrint LINE Official Account', $fontSub, [System.Drawing.SolidBrush]::new($muted), 86, 1604)
$graphics.Dispose(); $bitmap.Save((Join-Path $PSScriptRoot 'iprint-rich-menu.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bitmap.Dispose()
