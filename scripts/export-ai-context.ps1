param(
  [string]$OutputDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
$markdownPath = Join-Path $outputRoot "RYADOM_CODEBASE_UTF8.md"
$archivePath = Join-Path $outputRoot "RYADOM_SOURCE_UTF8.zip"
$utf8 = [System.Text.UTF8Encoding]::new($false)

[System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null

$includedDirectories = @("src", "prisma", "scripts", "docs", "public")
$topLevelFiles = @(
  ".dockerignore",
  ".env.local.example",
  ".env.production.example",
  ".gitignore",
  "AGENTS.md",
  "Caddyfile",
  "Dockerfile",
  "docker-compose.yml",
  "eslint.config.mjs",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "prisma.config.ts",
  "README.md",
  "tsconfig.json"
)

function Get-RelativePath([string]$fullPath) {
  $absolutePath = [System.IO.Path]::GetFullPath($fullPath)
  if (-not $absolutePath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "File is outside the project root: $absolutePath"
  }
  return $absolutePath.Substring($projectRoot.Length).TrimStart([char[]]@("\", "/")).Replace("\", "/")
}

function Test-IsSafeProjectFile([System.IO.FileInfo]$file) {
  $relative = Get-RelativePath $file.FullName
  if ($relative -match "(^|/)(node_modules|\.next|\.git|artifacts|src/generated)(/|$)") { return $false }
  if ($relative -match "^public/uploads/") { return $false }
  if ($file.Name -eq ".env.production" -or $file.Name -eq ".env.local") { return $false }
  if ($file.Name -match "\.(log|db|sqlite|pem|key|p12|pfx)$") { return $false }
  return $true
}

$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
foreach ($name in $topLevelFiles) {
  $path = Join-Path $projectRoot $name
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $files.Add((Get-Item -LiteralPath $path))
  }
}
foreach ($directory in $includedDirectories) {
  $path = Join-Path $projectRoot $directory
  if (Test-Path -LiteralPath $path -PathType Container) {
    Get-ChildItem -LiteralPath $path -Recurse -File |
      Where-Object { Test-IsSafeProjectFile $_ } |
      ForEach-Object { $files.Add($_) }
  }
}
$files = @($files | Sort-Object { Get-RelativePath $_.FullName } -Unique)

$textExtensions = @(
  ".css", ".example", ".graphql", ".html", ".js", ".json", ".jsx", ".md",
  ".mjs", ".prisma", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".txt", ".webmanifest", ".yaml", ".yml"
)
$textNames = @(".dockerignore", ".gitignore", "Caddyfile", "Dockerfile")

function Get-CodeLanguage([System.IO.FileInfo]$file) {
  switch ($file.Extension.ToLowerInvariant()) {
    ".ts" { return "typescript" }
    ".tsx" { return "tsx" }
    ".js" { return "javascript" }
    ".jsx" { return "jsx" }
    ".mjs" { return "javascript" }
    ".json" { return "json" }
    ".css" { return "css" }
    ".prisma" { return "prisma" }
    ".sql" { return "sql" }
    ".sh" { return "bash" }
    ".yml" { return "yaml" }
    ".yaml" { return "yaml" }
    ".md" { return "markdown" }
    ".svg" { return "xml" }
    ".webmanifest" { return "json" }
    default { return "text" }
  }
}

$builder = [System.Text.StringBuilder]::new()
[void]$builder.AppendLine('# Ryadom: AI codebase export')
[void]$builder.AppendLine()
[void]$builder.AppendLine('Encoding: UTF-8 without BOM. Secrets, real .env files, dependencies, build output, generated Prisma Client and user uploads are excluded.')
[void]$builder.AppendLine()
[void]$builder.AppendLine('## File tree')
[void]$builder.AppendLine()
[void]$builder.AppendLine('`````text')
foreach ($file in $files) { [void]$builder.AppendLine((Get-RelativePath $file.FullName)) }
[void]$builder.AppendLine('`````')

foreach ($file in $files) {
  if ($textExtensions -notcontains $file.Extension.ToLowerInvariant() -and $textNames -notcontains $file.Name) { continue }
  $relative = Get-RelativePath $file.FullName
  $content = [System.IO.File]::ReadAllText($file.FullName)
  [void]$builder.AppendLine()
  [void]$builder.AppendLine(('## `' + $relative + '`'))
  [void]$builder.AppendLine()
  [void]$builder.AppendLine(('`````' + (Get-CodeLanguage $file)))
  [void]$builder.Append($content.TrimEnd())
  [void]$builder.AppendLine()
  [void]$builder.AppendLine('`````')
}

[System.IO.File]::WriteAllText($markdownPath, $builder.ToString(), $utf8)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $entryName = Get-RelativePath $file.FullName
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $file.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

$markdownHash = (Get-FileHash -LiteralPath $markdownPath -Algorithm SHA256).Hash.ToLowerInvariant()
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[pscustomobject]@{
  Files = $files.Count
  Markdown = $markdownPath
  MarkdownBytes = (Get-Item -LiteralPath $markdownPath).Length
  MarkdownSha256 = $markdownHash
  Archive = $archivePath
  ArchiveBytes = (Get-Item -LiteralPath $archivePath).Length
  ArchiveSha256 = $archiveHash
}
