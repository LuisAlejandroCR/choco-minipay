# Submit ChocoLedger + ChocoGateway to Celoscan (Etherscan V2) + Blockscout using the standard-json
# payload prepared by scripts/verify-prep.cjs, then poll each GUID. Run from contracts/.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$verifyDir = $PSScriptRoot
$root = Split-Path $verifyDir -Parent

$manifest = Get-Content (Join-Path $verifyDir 'manifest.json') -Raw | ConvertFrom-Json
$sourceCode = Get-Content (Join-Path $verifyDir 'standard-input.json') -Raw

# Celoscan API key from contracts/.env
$apiKey = ((Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^CELOSCAN_API_KEY=' }) -replace '^CELOSCAN_API_KEY=', '').Trim()

$targets = @(
  @{ name = 'Celoscan(V2)'; uri = 'https://api.etherscan.io/v2/api?chainid=42220'; apikey = $apiKey },
  @{ name = 'Blockscout';   uri = 'https://celo.blockscout.com/api';               apikey = '' }
)

$submissions = @()
foreach ($t in $targets) {
  foreach ($c in $manifest.contracts) {
    $body = @{
      module                = 'contract'
      action                = 'verifysourcecode'
      codeformat            = 'solidity-standard-json-input'
      sourceCode            = $sourceCode
      contractaddress       = $c.address
      contractname          = $c.contractname
      compilerversion       = $manifest.compilerversion
      constructorArguements = $c.constructorArgs
    }
    if ($t.apikey) { $body.apikey = $t.apikey }
    try {
      $r = Invoke-RestMethod -Method Post -Uri $t.uri -Body $body -ContentType 'application/x-www-form-urlencoded'
      Write-Host ("[{0}] {1}: status={2} msg={3} result={4}" -f $t.name, $c.name, $r.status, $r.message, $r.result)
      if ($r.status -eq '1') { $submissions += @{ target = $t; contract = $c.name; guid = $r.result } }
    } catch {
      Write-Host ("[{0}] {1}: SUBMIT ERROR {2}" -f $t.name, $c.name, $_.Exception.Message)
    }
  }
}

Start-Sleep -Seconds 12
Write-Host "`n--- Poll ---"
foreach ($s in $submissions) {
  $poll = @{ module = 'contract'; action = 'checkverifystatus'; guid = $s.guid }
  if ($s.target.apikey) { $poll.apikey = $s.target.apikey }
  try {
    $r = Invoke-RestMethod -Method Get -Uri $s.target.uri -Body $poll
    Write-Host ("[{0}] {1} ({2}): {3}" -f $s.target.name, $s.contract, $s.guid, $r.result)
  } catch {
    Write-Host ("[{0}] {1}: POLL ERROR {2}" -f $s.target.name, $s.contract, $_.Exception.Message)
  }
}
