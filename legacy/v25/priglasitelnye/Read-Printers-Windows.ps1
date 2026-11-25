# Read local installed printer names and driver defaults for the print editor.
# No printers, queues, drivers or settings are changed. No test pages are printed.
# Run this file on the computer from which you will print, not on a web server.
[CmdletBinding()]
param(
    [string]$OutputPath = ([IO.Path]::Combine([Environment]::GetFolderPath('DesktopDirectory'), 'Printers-Windows.json')),
    [switch]$SkipDriverDefaults
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$warnings = New-Object 'System.Collections.Generic.List[string]'
function Read-Property($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if ([IO.File]::Exists($resolvedOutput)) {
    try { $previous = [IO.File]::ReadAllText($resolvedOutput) | ConvertFrom-Json }
    catch { throw 'The output file already exists and is not a printer catalog. Choose another -OutputPath.' }
    if ((Read-Property $previous 'schema') -ne 'print-editor-printers' -or (Read-Property $previous 'version') -ne 1 -or (Read-Property $previous 'source') -ne 'windows') {
        throw 'The output file already exists and is not a printer catalog. Choose another -OutputPath.'
    }
}

$cimPrinters = @()
if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
    try { $cimPrinters = @(Get-CimInstance -ClassName Win32_Printer -OperationTimeoutSec 10 -ErrorAction Stop) }
    catch { $warnings.Add('Windows did not return WMI printer details. Some default/connection values are unknown.') }
}

$installed = @()
if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
    try { $installed = @(Get-Printer -ErrorAction Stop) }
    catch { $warnings.Add('Get-Printer was unavailable. The export used the local WMI list.') }
}
if ($installed.Count -eq 0 -and $cimPrinters.Count -gt 0) { $installed = $cimPrinters }
if ($installed.Count -gt 100) { throw 'More than 100 installed printer queues. Export a smaller list.' }

$canReadDefaults = -not $SkipDriverDefaults -and [bool](Get-Command Get-PrintConfiguration -ErrorAction SilentlyContinue)
if (-not $canReadDefaults) { $warnings.Add('Driver defaults were not read. Printer names remain usable.') }

$records = @()
foreach ($printer in $installed) {
    $name = [string](Read-Property $printer 'Name')
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $detail = $cimPrinters | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    $default = Read-Property $detail 'Default'
    $network = Read-Property $detail 'Network'
    $local = Read-Property $detail 'Local'
    $connection = 'unknown'
    if ($network -eq $true) { $connection = 'network' }
    elseif ($local -eq $true) { $connection = 'local' }
    elseif ([string](Read-Property $printer 'Type') -eq 'Connection') { $connection = 'network' }

    $paper = $null
    $color = $null
    $duplex = $null
    if ($canReadDefaults) {
        try {
            $configuration = Get-PrintConfiguration -PrinterName $name -ErrorAction Stop
            $paperValue = Read-Property $configuration 'PaperSize'
            if ($null -ne $paperValue) { $paper = [string]$paperValue }
            $colorValue = Read-Property $configuration 'Color'
            if ($colorValue -is [bool]) { $color = $colorValue }
            switch ([string](Read-Property $configuration 'DuplexingMode')) {
                'OneSided' { $duplex = 'simplex' }
                'TwoSidedLongEdge' { $duplex = 'long' }
                'TwoSidedShortEdge' { $duplex = 'short' }
            }
        }
        catch { $warnings.Add('Driver defaults were not returned for one installed queue; its values are unknown.') }
    }
    $records += [ordered]@{
        name = $name
        driverName = [string](Read-Property $printer 'DriverName')
        isDefault = $default
        connection = $connection
        reported = [ordered]@{ paperSize = $paper; color = $color; duplex = $duplex }
    }
}

$result = [ordered]@{
    schema = 'print-editor-printers'
    version = 1
    source = 'windows'
    exportedAt = [DateTime]::UtcNow.ToString('o')
    printers = @($records)
    warnings = @($warnings | Select-Object -Unique)
}
$json = $result | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($resolvedOutput, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('Saved {0} printer queue(s): {1}' -f $records.Count, $resolvedOutput)
Write-Output 'Import the JSON into the print wizard. Feed direction and stack order still require the marked-paper test.'
