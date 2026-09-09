param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = 'Stop'
$readme = Join-Path $PSScriptRoot '..\README.md'
$content = Get-Content -LiteralPath $readme -Raw -Encoding UTF8
$start = '<!-- deployment-url:start -->'
$end = '<!-- deployment-url:end -->'
$replacement = "$start`r`n**Live:** $Url`r`n$end"

if ($content.Contains($start) -and $content.Contains($end)) {
  $pattern = [regex]::Escape($start) + '.*?' + [regex]::Escape($end)
  $content = [regex]::Replace($content, $pattern, $replacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)
} else {
  $content += "`r`n`r`n## Live Deployment`r`n`r`n$replacement`r`n"
}

Set-Content -LiteralPath $readme -Value $content -Encoding UTF8 -NoNewline
Write-Host "[OK] README deployment URL: $Url"
