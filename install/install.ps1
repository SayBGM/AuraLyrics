$ErrorActionPreference = "Stop"

$Repo = if ($env:AURA_LYRICS_REPO) { $env:AURA_LYRICS_REPO } elseif ($env:DYNAMIC_PIP_LYRICS_REPO) { $env:DYNAMIC_PIP_LYRICS_REPO } else { "backgwangmin/spotify-lyris" }
$ExtensionName = "aura-lyrics.js"
$BaseUrl = "https://github.com/$Repo/releases/latest/download"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
	throw "spicetify CLI was not found in PATH."
}

$ExtensionDir = (& spicetify -e path root).Trim()
New-Item -ItemType Directory -Force -Path $ExtensionDir | Out-Null

$Target = Join-Path $ExtensionDir $ExtensionName
Write-Host "Installing $ExtensionName to $ExtensionDir"
Invoke-WebRequest -Uri "$BaseUrl/$ExtensionName" -OutFile $Target

& spicetify config extensions $ExtensionName
& spicetify apply

Write-Host "AuraLyrics installed."
