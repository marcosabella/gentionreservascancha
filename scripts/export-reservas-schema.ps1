$ErrorActionPreference = 'Stop'

# Obtain the official schema-only export script, including temporary credentials.
# Credentials stay in memory and are passed to the container on stdin.
$dumpScriptLines = @(& supabase db dump --linked --schema public --dry-run)
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the schema export.' }
$dumpScript = $dumpScriptLines -join "`n"
$scriptStart = $dumpScript.IndexOf('#!/usr/bin/env bash')
if ($scriptStart -lt 0 -or $dumpScript -notmatch '--schema-only') {
  throw 'Unexpected export script; refusing to export.'
}
$dumpScript = $dumpScript.Substring($scriptStart)

# Reuse the installed PostgreSQL 17 image; the source database also uses 17.
$schemaLines = @($dumpScript | & docker run --rm -i --entrypoint bash public.ecr.aws/supabase/postgres:17.6.1.106 -c "tr -d '\r' | bash")
if ($LASTEXITCODE -ne 0) { throw 'Schema export failed.' }
$schemaText = ($schemaLines -join "`n") + "`n"
if ($schemaText -notmatch 'CREATE TABLE' -or $schemaText -match '(?m)^COPY .* FROM stdin;') {
  throw 'Unexpected schema output; refusing to save.'
}
$outputPath = Join-Path $PSScriptRoot '../supabase/pura-vida-public-schema.sql'
[System.IO.File]::WriteAllText($outputPath, $schemaText, [System.Text.UTF8Encoding]::new($false))
Write-Output ('Saved schema-only export: {0} bytes' -f ([System.Text.Encoding]::UTF8.GetByteCount($schemaText)))
