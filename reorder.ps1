$html = Get-Content -Path 'C:\Users\USER\Downloads\autoloop\index.html' -Raw -Encoding UTF8

# 1. Delete Agitate
$html = $html -replace '(?s)\s*<!-- AGITATION -->.*?</section>', ''

# 2. Swap 'What''s Inside' and 'Contrast'
$html = $html -replace '(?s)(<!-- WHAT''S INSIDE -->.*?</section>)(\s*)(<!-- BEFORE / AFTER -->.*?</section>)', "$3$2$1"

# 3. Swap 'Stack' and 'Checkout'
$stackMatch = [regex]::Match($html, '(?s)\s*<!-- VALUE STACK -->.*?</section>')
$checkoutMatch = [regex]::Match($html, '(?s)\s*<!-- CHECKOUT -->.*?</section>')

if ($stackMatch.Success -and $checkoutMatch.Success) {
    $stackStr = $stackMatch.Value
    $checkoutStr = $checkoutMatch.Value
    
    # Replace in HTML
    $html = $html.Replace($stackStr, '%%PLACEHOLDER_STACK%%')
    $html = $html.Replace($checkoutStr, '%%PLACEHOLDER_CHECKOUT%%')
    
    $html = $html.Replace('%%PLACEHOLDER_STACK%%', $checkoutStr)
    $html = $html.Replace('%%PLACEHOLDER_CHECKOUT%%', $stackStr)
}

# 4. Remove all section labels
$html = $html -replace '(?s)\s*<p class="section-label.*?</p>', ''

# 5. Fix any remaining "Take back control" CTAs (like the sticky bar)
$html = $html -replace '>Take back control</a>', '>Get The Autoloop System</a>'
$html = $html -replace '>Take\s+back\s+control</a>', '>Get The Autoloop System</a>'

Set-Content -Path 'C:\Users\USER\Downloads\autoloop\index.html' -Value $html -Encoding UTF8
Write-Output "Done!"
