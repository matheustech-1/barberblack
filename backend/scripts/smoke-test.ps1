param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBase,
  [string]$AdminUser = "admin",
  [string]$AdminPassword = ""
)

$ErrorActionPreference = "Stop"

function Get-ApiRoot([string]$Base) {
  $normalized = ""
  if ($null -ne $Base) {
    $normalized = $Base.Trim().TrimEnd("/")
  }
  if (-not $normalized) {
    throw "ApiBase is required."
  }

  if ($normalized -match "/api$") {
    return $normalized
  }

  return "$normalized/api"
}

function Write-Step([string]$Message) {
  Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-Pass([string]$Message) {
  Write-Host "OK: $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
  Write-Host "FAIL: $Message" -ForegroundColor Red
}

$apiRoot = Get-ApiRoot $ApiBase
$failed = $false

Write-Host "Smoke test API root: $apiRoot"

try {
  Write-Step "GET /health"
  $health = Invoke-RestMethod -Method GET -Uri "$apiRoot/health"
  if ($health.status -ne "ok") {
    throw "Unexpected health payload."
  }
  Write-Pass "/health"
} catch {
  $failed = $true
  Write-Fail "/health -> $($_.Exception.Message)"
}

try {
  Write-Step "GET /services"
  $services = Invoke-RestMethod -Method GET -Uri "$apiRoot/services"
  $count = @($services.services).Count
  Write-Pass "/services (count=$count)"
} catch {
  $failed = $true
  Write-Fail "/services -> $($_.Exception.Message)"
}

if ($AdminPassword) {
  try {
    Write-Step "POST /admin/login"
    $body = @{
      username = $AdminUser
      password = $AdminPassword
    } | ConvertTo-Json -Compress

    $login = Invoke-RestMethod -Method POST -Uri "$apiRoot/admin/login" -ContentType "application/json" -Body $body
    if (-not $login.token) {
      throw "Token not returned."
    }
    Write-Pass "/admin/login"

    Write-Step "GET /admin/appointments"
    $headers = @{ Authorization = "Bearer $($login.token)" }
    $appointments = Invoke-RestMethod -Method GET -Uri "$apiRoot/admin/appointments" -Headers $headers
    $appointmentsCount = @($appointments.appointments).Count
    Write-Pass "/admin/appointments (count=$appointmentsCount)"
  } catch {
    $failed = $true
    Write-Fail "admin routes -> $($_.Exception.Message)"
  }
} else {
  Write-Host "Admin checks skipped. Pass -AdminPassword to include admin routes." -ForegroundColor Yellow
}

if ($failed) {
  Write-Host "Smoke test finished with failures." -ForegroundColor Red
  exit 1
}

Write-Host "Smoke test finished successfully." -ForegroundColor Green
exit 0

