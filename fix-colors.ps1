$appDir = "C:\Users\Arthur Reis\OneDrive\Documentos\PROJETOS ZANART\XUA-DELIVERY\xua-delivery\apps\web\app"
$srcDir = "C:\Users\Arthur Reis\OneDrive\Documentos\PROJETOS ZANART\XUA-DELIVERY\xua-delivery\apps\web\src"

$allFiles = @()
$allFiles += Get-ChildItem -Path $appDir -Recurse -Filter "*.tsx"
$allFiles += Get-ChildItem -Path $srcDir -Recurse -Filter "*.tsx"
$allFiles += Get-ChildItem -Path $srcDir -Recurse -Filter "*.ts"

foreach ($f in $allFiles) {
  $c = [System.IO.File]::ReadAllText($f.FullName)
  $orig = $c
  $c = $c -replace 'bg-linear-to-r from-\[#0041c8\] to-\[#0055ff\]', 'bg-primary hover:bg-primary-hover'
  $c = $c -replace 'bg-linear-to-br from-\[#0041c8\] to-\[#0055ff\]', 'bg-linear-to-br from-primary to-primary-hover'
  $c = $c -replace 'bg-linear-to-b from-\[#0041c8\] to-\[#0055ff\]', 'bg-linear-to-b from-primary to-primary-hover'
  $c = $c -replace 'bg-linear-to-br from-\[#001a40\] to-\[#0041c8\]', 'bg-linear-to-br from-secondary-foreground to-primary'
  $c = $c -replace 'from-\[#0041c8\] to-\[#0055ff\]', 'from-primary to-primary-hover'
  $c = $c -replace '\[#0041c8\]', 'primary'
  $c = $c -replace '\[#0055ff\]', 'primary-hover'
  $c = $c -replace '\[#001a40\]', 'secondary-foreground'
  $c = $c -replace 'color="#0041c8"', 'color="#1B4A9A"'
  $c = $c -replace 'color="#0055ff"', 'color="#5697E9"'
  $c = $c -replace 'rgba\(0,65,200,', 'rgba(27,74,154,'
  $c = $c -replace 'rgba\(0,85,255,', 'rgba(86,151,233,'
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c)
    Write-Host "Updated: $($f.Name)"
  }
}
Write-Host "Done."
