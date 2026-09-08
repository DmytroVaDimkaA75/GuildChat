param(
  [string]$InputPath = (Join-Path $PSScriptRoot 'results\quantum-map-current.json'),
  [string]$OutputPath = (Join-Path $PSScriptRoot 'results\quantum-map-app-style.png')
)

Add-Type -AssemblyName System.Drawing

function From-Utf8Base64([string]$value) {
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($value))
}

$textAppTitle = From-Utf8Base64 '0JrQstCw0L3RgtC+0LLRliDQstGC0L7RgNCz0L3QtdC90L3Rjw=='
$textSteelCitadel = From-Utf8Base64 '0KHRgtCw0LvQtdCy0LAg0YbQuNGC0LDQtNC10LvRjA=='
$textRaidMap = From-Utf8Base64 '0JrQsNGA0YLQsCDRgNC10LnQtNGD'
$textDifficulty = From-Utf8Base64 '0KHQutC70LDQtNC90ZbRgdGC0Yw='
$textFinished = From-Utf8Base64 '0JfQsNCy0LXRgNGI0LXQvdC+'
$textOpen = From-Utf8Base64 '0JLRltC00LrRgNC40YLQvg=='
$textBlocked = From-Utf8Base64 '0JfQsNCx0LvQvtC60L7QstCw0L3Qvg=='
$textBoss = From-Utf8Base64 '0JHQvtGB'
$textSelectedNode = From-Utf8Base64 '0JLQuNCx0YDQsNC90LjQuSDQstGD0LfQvtC7'
$textGoods = From-Utf8Base64 '0YLQvtCy0LDRgNC4'
$textResources = From-Utf8Base64 '0YDQtdGB0YPRgNGB0Lg='
$textFight = From-Utf8Base64 '0LHRltC5'
$textStart = From-Utf8Base64 '0YHRgtCw0YDRgg=='
$textNodes = From-Utf8Base64 '0LLRg9C30LvRltCy'
$textRoutes = From-Utf8Base64 '0LzQsNGA0YjRgNGD0YLRltCy'

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-CenteredText($graphics, [string]$text, $font, $brush, [float]$x, [float]$y, [float]$w, [float]$h) {
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $w, $h), $format)
  $format.Dispose()
}

function Get-HexPoints([float]$cx, [float]$cy, [float]$radius) {
  $points = [System.Drawing.PointF[]]::new(6)
  for ($i = 0; $i -lt 6; $i++) {
    $angle = [Math]::PI / 3 * $i
    $points[$i] = [System.Drawing.PointF]::new(
      [float]($cx + $radius * [Math]::Cos($angle)),
      [float]($cy + $radius * [Math]::Sin($angle))
    )
  }
  return $points
}

$data = Get-Content -Raw -Encoding UTF8 -LiteralPath $InputPath | ConvertFrom-Json
$nodes = @($data.responseData.nodes)
$nodeById = @{}
foreach ($node in $nodes) { $nodeById[$node.id] = $node }
$uniqueEdgeKeys = @{}
foreach ($node in $nodes) {
  foreach ($connection in @($node.connectedNodes)) {
    $pair = @($node.id, $connection.targetNodeId) | Sort-Object
    $uniqueEdgeKeys[$pair -join '-'] = $true
  }
}
$displayRaidName = if ($data.raid.guildRaidsType -eq 'guildRaidsMiddleAges4') { $textSteelCitadel } elseif ($data.raid.raidName) { [string]$data.raid.raidName } else { $textRaidMap }
$displayDifficulty = if ($data.raid.difficultyLevel) { "$textDifficulty $($data.raid.difficultyLevel)" } else { "$($nodes.Count) nodes" }
$displayMapMeta = "$($nodes.Count) $textNodes | $($uniqueEdgeKeys.Count) $textRoutes"

$width = 945
$height = 1180
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$bitmap.SetResolution(96, 96)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0b0d12'))

$cHeader = [System.Drawing.ColorTranslator]::FromHtml('#132431')
$cBorder = [System.Drawing.ColorTranslator]::FromHtml('#34536b')
$cWhite = [System.Drawing.ColorTranslator]::FromHtml('#f5f8fb')
$cBlueText = [System.Drawing.ColorTranslator]::FromHtml('#76c3ff')
$cFinished = [System.Drawing.ColorTranslator]::FromHtml('#0c59df')
$cOpen = [System.Drawing.ColorTranslator]::FromHtml('#55d510')
$cBlocked = [System.Drawing.ColorTranslator]::FromHtml('#4c5d70')
$cBoss = [System.Drawing.ColorTranslator]::FromHtml('#d91b15')
$cStart = [System.Drawing.ColorTranslator]::FromHtml('#17b8dd')
$cEdge = [System.Drawing.ColorTranslator]::FromHtml('#426077')
$cEdgeDone = [System.Drawing.ColorTranslator]::FromHtml('#1c75ef')
$cInk = [System.Drawing.ColorTranslator]::FromHtml('#06101a')
$cAvoid = [System.Drawing.ColorTranslator]::FromHtml('#f0a512')

$brushHeader = [System.Drawing.SolidBrush]::new($cHeader)
$brushWhite = [System.Drawing.SolidBrush]::new($cWhite)
$brushBlueText = [System.Drawing.SolidBrush]::new($cBlueText)
$brushInk = [System.Drawing.SolidBrush]::new($cInk)
$penBorder = [System.Drawing.Pen]::new($cBorder, 3)

$g.FillRectangle($brushHeader, 0, 0, $width, 225)
$fontStatus = [System.Drawing.Font]::new('Arial', 27, [System.Drawing.FontStyle]::Bold)
$fontHeader = [System.Drawing.Font]::new('Arial', 42, [System.Drawing.FontStyle]::Bold)
$fontMenu = [System.Drawing.Font]::new('Arial', 48, [System.Drawing.FontStyle]::Regular)
$fontRaid = [System.Drawing.Font]::new('Arial', 28, [System.Drawing.FontStyle]::Bold)
$fontMeta = [System.Drawing.Font]::new('Arial', 21, [System.Drawing.FontStyle]::Bold)
$fontBadge = [System.Drawing.Font]::new('Arial', 17, [System.Drawing.FontStyle]::Bold)
$fontNode = [System.Drawing.Font]::new('Arial', 18, [System.Drawing.FontStyle]::Bold)
$fontLegend = [System.Drawing.Font]::new('Arial', 18, [System.Drawing.FontStyle]::Bold)
$fontSection = [System.Drawing.Font]::new('Arial', 40, [System.Drawing.FontStyle]::Bold)
$fontInfo = [System.Drawing.Font]::new('Arial', 31, [System.Drawing.FontStyle]::Bold)
$fontProgress = [System.Drawing.Font]::new('Arial', 28, [System.Drawing.FontStyle]::Bold)
$fontSub = [System.Drawing.Font]::new('Arial', 22, [System.Drawing.FontStyle]::Bold)

$g.DrawString('22:56', $fontStatus, $brushWhite, 55, 18)
$g.DrawString('o  o  || ||   25', $fontStatus, $brushWhite, 645, 18)
$menuPen = [System.Drawing.Pen]::new($cWhite, 6)
$menuPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$menuPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
foreach ($menuY in @(125, 144, 163)) { $g.DrawLine($menuPen, 42, $menuY, 84, $menuY) }
Draw-CenteredText $g $textAppTitle $fontHeader $brushWhite 135 81 675 120
$soundPath = New-RoundedRectPath 815 96 92 92 28
$g.DrawPath($penBorder, $soundPath)
Draw-CenteredText $g ')))' $fontStatus $brushWhite 815 96 92 92

$mapPath = New-RoundedRectPath 20 255 905 750 58
$g.FillPath($brushHeader, $mapPath)
$g.DrawPath($penBorder, $mapPath)
$g.DrawString($displayRaidName, $fontRaid, $brushWhite, 58, 283)
$g.DrawString($displayMapMeta, $fontMeta, $brushBlueText, 58, 326)
$badgePath = New-RoundedRectPath 682 283 198 48 16
$badgeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1d3850'))
$g.FillPath($badgeBrush, $badgePath)
Draw-CenteredText $g $displayDifficulty $fontBadge $brushBlueText 682 283 198 48

$mapLeft = 58.0
$mapTop = 405.0
$stepX = 51.0
$stepY = 54.0
$positions = @{}
foreach ($node in $nodes) {
  $positions[$node.id] = [System.Drawing.PointF]::new(
    [float]($mapLeft + ($node.position.x - 1) * $stepX),
    [float]($mapTop + ($node.position.y - 1) * $stepY)
  )
}

$seenEdges = @{}
foreach ($node in $nodes) {
  foreach ($connection in @($node.connectedNodes)) {
    $pair = @($node.id, $connection.targetNodeId) | Sort-Object
    $key = $pair -join '-'
    if ($seenEdges.ContainsKey($key)) { continue }
    $seenEdges[$key] = $true
    $target = $nodeById[$connection.targetNodeId]
    $done = $node.state.state -eq 'finished' -and $target.state.state -eq 'finished'
    $edgePen = [System.Drawing.Pen]::new($(if ($done) { $cEdgeDone } else { $cEdge }), 8)
    $edgePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $edgePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($edgePen, $positions[$node.id], $positions[$connection.targetNodeId])
    $edgePen.Dispose()
  }
}

foreach ($node in $nodes) {
  $state = $node.state.state
  $typeClass = $node.type.__class__
  $isFinalBoss = $node.type.fightType -eq 'final-boss'
  $fill = if ($isFinalBoss) { $cBoss } elseif ($typeClass -like '*Start') { $cStart } elseif ($state -eq 'open') { $cOpen } elseif ($state -eq 'blocked') { $cBlocked } else { $cFinished }
  $point = $positions[$node.id]
  $points = Get-HexPoints $point.X $point.Y 34
  $nodeBrush = [System.Drawing.SolidBrush]::new($fill)
  $strokeColor = if ($node.id -eq $data.responseData.currentNode) { [System.Drawing.ColorTranslator]::FromHtml('#7bd3ff') } elseif ($node.state.indicator.value -eq 'avoid') { $cAvoid } else { [System.Drawing.ColorTranslator]::FromHtml('#080b0f') }
  $strokeWidth = if ($node.id -eq $data.responseData.currentNode) { 10 } elseif ($node.state.indicator.value -eq 'avoid') { 9 } else { 8 }
  $nodePen = [System.Drawing.Pen]::new($strokeColor, $strokeWidth)
  $nodePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.FillPolygon($nodeBrush, $points)
  $g.DrawPolygon($nodePen, $points)
  Draw-CenteredText $g $node.id.ToUpperInvariant() $fontNode $brushInk ($point.X - 36) ($point.Y - 28) 72 56
  $nodeBrush.Dispose(); $nodePen.Dispose()
}

$legendY = 948
$legendItems = @(
  @($textFinished, $cFinished, 93),
  @($textOpen, $cOpen, 315),
  @($textBlocked, $cBlocked, 501),
  @($textBoss, $cBoss, 757)
)
foreach ($item in $legendItems) {
  $dotBrush = [System.Drawing.SolidBrush]::new($item[1])
  $g.FillRectangle($dotBrush, [int]$item[2], $legendY, 23, 23)
  $g.DrawRectangle([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#070a0e'), 2), [int]$item[2], $legendY, 23, 23)
  $g.DrawString($item[0], $fontLegend, $brushWhite, [int]$item[2] + 32, $legendY - 2)
  $dotBrush.Dispose()
}

$g.DrawString($textSelectedNode, $fontSection, $brushBlueText, 43, 1037)
$currentNode = $nodeById[$data.responseData.currentNode]
$selectedNode = $null
foreach ($connection in @($currentNode.connectedNodes)) {
  $candidate = $nodeById[$connection.targetNodeId]
  if ($candidate.state.state -eq 'open') { $selectedNode = $candidate; break }
}
if (-not $selectedNode) { $selectedNode = $nodes | Where-Object { $_.state.state -eq 'open' } | Select-Object -First 1 }
if (-not $selectedNode) { $selectedNode = $currentNode }
$selectedType = if ($selectedNode.type.__class__ -like '*Donation*') {
  if ($selectedNode.type.type -eq 'goods') { $textGoods } else { $textResources }
} elseif ($selectedNode.type.__class__ -like '*Start*') {
  $textStart
} else {
  $textFight
}
$selectedProgress = if ($null -eq $selectedNode.state.currentProgress) { 0 } else { $selectedNode.state.currentProgress }
$selectedRequired = if ($null -eq $selectedNode.type.requiredProgress) { 0 } else { $selectedNode.type.requiredProgress }
$selectedColor = if ($selectedNode.type.fightType -eq 'final-boss') { $cBoss } elseif ($selectedNode.type.__class__ -like '*Start') { $cStart } elseif ($selectedNode.state.state -eq 'open') { $cOpen } elseif ($selectedNode.state.state -eq 'blocked') { $cBlocked } else { $cFinished }
$infoPath = New-RoundedRectPath 610 1026 292 96 28
$g.FillPath($brushHeader, $infoPath)
$g.DrawPath($penBorder, $infoPath)
$openBrush = [System.Drawing.SolidBrush]::new($selectedColor)
$g.FillRectangle($openBrush, 638, 1054, 40, 40)
$g.DrawString($selectedNode.id.ToUpperInvariant(), $fontInfo, $brushWhite, 697, 1044)
$g.DrawString("$selectedProgress / $selectedRequired", $fontProgress, $brushWhite, 756, 1048)
$g.DrawString($selectedType, $fontSub, $brushBlueText, 700, 1090)

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bitmap.Dispose()
$brushHeader.Dispose(); $brushWhite.Dispose(); $brushBlueText.Dispose(); $brushInk.Dispose(); $badgeBrush.Dispose(); $openBrush.Dispose(); $penBorder.Dispose(); $menuPen.Dispose()
$fontStatus.Dispose(); $fontHeader.Dispose(); $fontMenu.Dispose(); $fontRaid.Dispose(); $fontMeta.Dispose(); $fontBadge.Dispose(); $fontNode.Dispose(); $fontLegend.Dispose(); $fontSection.Dispose(); $fontInfo.Dispose(); $fontProgress.Dispose(); $fontSub.Dispose()
$soundPath.Dispose(); $mapPath.Dispose(); $badgePath.Dispose(); $infoPath.Dispose()

Write-Output $OutputPath
