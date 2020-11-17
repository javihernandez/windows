<#
  This script installs and setup CouchDB.

  If the script is copied and run from a temporary folder (like when running via vagrant)
    the -originalBuildScriptPath parameter should be passed with the path to the original
    "provisioning" folder
#>
param ( # default to script path if no parameter is given
    [string]$originalBuildScriptPath = (Split-Path -parent $PSCommandPath)
)

Import-Module "$($originalBuildScriptPath)/Provisioning.psm1" -Force

<#
  The support for specifying the retries and the retry delay when using
  Invoke-WebRequest has been added recently and is available since the 6.1.x series.
  See https://github.com/PowerShell/PowerShell/releases/tag/v6.1.0-preview.4

  After our vm receives such update, we will be able to pass -MaximumRetryCount and
  -RetryIntervalSec as parameters when calling Invoke-WebRequest.
#>
Function iwr-Retry {
    Param (
        [Parameter(Mandatory=$true)]
        [string] $Uri,
        [string] $Method = "GET",
        [int] $Retries = 5,
        [int] $Delay = 5
    )

    $retryCount = 0
    $completed = $false
    $response = $null

    while (-not $completed) {
        try {
            $response = iwr -Uri $Uri -Method $Method
            $completed = $true
        } catch {
            if ($retryCount -ge $Retries) {
                Write-Warning "Request to $Uri failed the maximum number of $retryCount times."
                throw
            } else {
                Write-Warning "Request to $Uri failed. Retrying in $Delay seconds."
                Start-Sleep $Delay
                $retryCount++
            }
        }
    }
}

netsh advfirewall firewall add rule name="Open Port 25984" dir=in action=allow protocol=TCP localport=25984
netsh advfirewall firewall add rule name="Open Port 25986" dir=in action=allow protocol=TCP localport=25986

# Check listening Ports
netstat -an | select-string -pattern "listening"

Write-Output "Adding CouchDB to the system"
$couchDBInstallerURL = "http://archive.apache.org/dist/couchdb/binary/win/2.3.0/couchdb-2.3.0.msi"
$couchDBInstaller = Join-Path $originalBuildScriptPath "couchdb-2.3.0.msi"

# Download msi file
Write-Output "Downloading CouchDB from $couchDBInstallerURL"
try {
    $r1 = iwr $couchDBInstallerURL -OutFile $couchDBInstaller
} catch {
    Write-Error "ERROR: Couldn't download CouchDB installer from the specified location. Error was $_"
    exit 1
}

# Install couchdb
$msiexec = "msiexec.exe"
Write-Output "Installing CouchDB ..."
try {
    Invoke-Command $msiexec "/i $couchDBInstaller /passive"
} catch {
    Write-Error "ERROR: CouchDB couldn't be installed"
    exit 1
}

# Replace the default listening ports
# By default, CouchDB will be installed at C:\CouchDB.
Write-Output "Changing default listening port to 25984 ..."
$couchDBConfigFile = Join-Path (Join-Path "C:\CouchDB" "etc") "default.ini"
((Get-Content -path $couchDBConfigFile -Raw) -replace "5984","25984") | Set-Content -Path $couchDBConfigFile
((Get-Content -path $couchDBConfigFile -Raw) -replace "5986","25986") | Set-Content -Path $couchDBConfigFile

# In addition to that, we must restart CouchDB in order for the changes to take effect
Write-Output "Restarting CouchDB ..."
Restart-Service -Name "Apache CouchDB"

# Check service status
Get-Service -Name "Apache CouchDB"

# Check listening Ports
netstat -an | select-string -pattern "listening"

# Set-up CouchDB to run as a single node server as described
# here: https://docs.couchdb.org/en/stable/setup/single-node.html
Write-Output "Configuring CouchDB ..."
try {
    # Let's retry the first request until CouchDB is ready.
    # When the maximum retries is reached, the error is propagated.
    #
    $r1 = iwr-Retry -Method PUT -Uri http://127.0.0.1:25984/_users
    $r2 = iwr -Method PUT -Uri http://127.0.0.1:25984/_replicator
    $r3 = iwr -Method PUT -Uri http://127.0.0.1:25984/_global_changes
} catch {
    Write-Error "ERROR: CouchDB couldn't be configured. Error was $_"
    exit 1
}

Write-Output "Restarting CouchDB ..."
Restart-Service -Name "Apache CouchDB"

Write-Output "CouchDB is now installed and configured"
exit 0
