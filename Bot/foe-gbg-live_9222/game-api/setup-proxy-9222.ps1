$ErrorActionPreference = 'Stop'

$configPath = Join-Path $PSScriptRoot '.proxy-9222.json'
$password = Read-Host 'Enter the SOCKS5 password for proxy 9222' -AsSecureString
if ($password.Length -eq 0) {
  throw 'The proxy password cannot be empty.'
}

$config = [ordered]@{
  version = 1
  type = 'socks5'
  host = '95.135.39.68'
  port = 50101
  username = 'vadimkaa75'
  encryptedPassword = ConvertFrom-SecureString $password
}

$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host 'Proxy 9222 was saved locally with Windows DPAPI encryption.'
Write-Host 'The encrypted password can only be decrypted by this Windows user.'
