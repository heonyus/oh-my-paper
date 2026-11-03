# oh-my-paper installer for Windows
#
#   irm https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.ps1 | iex
#
# The Windows counterpart of install.sh, step for step: clones (or updates) the app into
# ~\.oh-my-paper\app, installs dependencies, builds the web app, puts an `oh-my-paper` command in
# ~\.local\bin (added to the user PATH) and starts the setup wizard. Where no one can answer it (no
# console: an AI agent, a script), or with -Yes, it sets up without questions instead
# (`oh-my-paper onboard --yes`); add -NoOcr to leave out the document engine there. `irm | iex`
# passes no arguments, so OH_MY_PAPER_YES=1 and OH_MY_PAPER_NO_OCR=1 do the same.
# Override with OH_MY_PAPER_HOME, OH_MY_PAPER_BIN_DIR, OH_MY_PAPER_REPO, OH_MY_PAPER_BRANCH.
# Set OH_MY_PAPER_NO_ONBOARD=1 to skip any setup after the install.
#
# The file stays ASCII: Windows PowerShell 5.1 reads a script file in the ANSI code page, so the
# Korean wording and the box-drawing glyphs are \u escapes, decoded by U at run time.
# tests/unit/installScriptWindows.test.ts keeps the wording the same as install.sh's.

function Install-OhMyPaper {
  param([string[]]$Arguments)
  $ErrorActionPreference = 'Stop'

  function U([string]$Text) { [regex]::Unescape($Text) }

  $Repo = if ($env:OH_MY_PAPER_REPO) { $env:OH_MY_PAPER_REPO } else { 'https://github.com/heonyus/oh-my-paper.git' }
  $Branch = if ($env:OH_MY_PAPER_BRANCH) { $env:OH_MY_PAPER_BRANCH } else { 'main' }
  $AppDir = if ($env:OH_MY_PAPER_HOME) { $env:OH_MY_PAPER_HOME } else { Join-Path $HOME '.oh-my-paper\app' }
  $BinDir = if ($env:OH_MY_PAPER_BIN_DIR) { $env:OH_MY_PAPER_BIN_DIR } else { Join-Path $HOME '.local\bin' }

  # The installer's language: OH_MY_PAPER_LANG, then the POSIX locale variables, then the languages
  # Windows lists as preferred (its display language when it lists none); English otherwise.
  # Exported so the setup wizard speaks the same language.
  function Get-UiLanguage {
    foreach ($tag in @($env:OH_MY_PAPER_LANG, $env:LC_ALL, $env:LC_MESSAGES, $env:LANG)) {
      if (-not $tag -or $tag -eq 'C' -or $tag -like 'C.*' -or $tag -eq 'POSIX') { continue }
      if ($tag -like 'ko*') { return 'ko' }
      return 'en'
    }
    try {
      $international = Get-ItemProperty -Path 'HKCU:\Control Panel\International\User Profile' -Name Languages -ErrorAction Stop
      $first = @($international.Languages)[0]
      if ($first) { if ($first -like 'ko*') { return 'ko' } else { return 'en' } }
    } catch { }
    if ([Globalization.CultureInfo]::CurrentUICulture.Name -like 'ko*') { return 'ko' }
    return 'en'
  }
  $UiLang = Get-UiLanguage
  $env:OH_MY_PAPER_LANG = $UiLang

  # The Korean or the English wording, by the installer's language.
  function M([string]$Ko, [string]$En) { if ($UiLang -eq 'ko') { U $Ko } else { U $En } }

  function Test-Flag([string]$Value) { return [bool]$Value -and $Value -notmatch '^(0|false|no)$' }
  $Yes = Test-Flag $env:OH_MY_PAPER_YES
  $NoOcr = Test-Flag $env:OH_MY_PAPER_NO_OCR
  foreach ($arg in $Arguments) {
    switch -regex ($arg) {
      '^(-y|--yes|-yes)$' { $Yes = $true; continue }
      '^(--no-ocr|-noocr)$' { $NoOcr = $true; continue }
      default {
        [Console]::Error.WriteLine("$(M '\uBAA8\uB974\uB294 \uC635\uC158\uC785\uB2C8\uB2E4:' 'Unknown option:') $arg (--yes, --no-ocr)")
        throw 'oh-my-paper-install-stopped:2'
      }
    }
  }
  $Log = Join-Path ([IO.Path]::GetTempPath()) ("oh-my-paper-install.{0}.log" -f [Guid]::NewGuid().ToString('N').Substring(0, 6))

  # A console both ends can use, so the wizard can take answers; not one an agent or script drives.
  function Test-Console {
    try {
      if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { return $false }
      if ([Environment]::GetCommandLineArgs() -match '^[-/]noni') { return $false }
      return [Environment]::UserInteractive
    } catch { return $false }
  }
  $CanDraw = $false
  try { $CanDraw = (-not [Console]::IsOutputRedirected) -and ([Console]::WindowWidth -gt 0) } catch { }
  $UseColor = $CanDraw -and -not (Test-Path env:NO_COLOR)

  # Unicode glyphs where the terminal is known to draw them (Windows Terminal, VS Code and the
  # like), the ASCII stand-ins clack uses elsewhere, as the wizard does.
  $Unicode = [bool]($env:WT_SESSION -or $env:TERM_PROGRAM -eq 'vscode' -or
    $env:TERMINAL_EMULATOR -eq 'JetBrains-JediTerm' -or $env:ConEmuTask -eq '{cmd::Cmder}' -or
    $env:TERM -eq 'xterm-256color' -or $env:TERM -eq 'alacritty')
  if ($Unicode) {
    $G = @{ Bar = (U '\u2502'); Top = (U '\u250C'); End = (U '\u2514'); Step = (U '\u25C6'); Ok = (U '\u2714');
      Warn = (U '\u25B2'); Fail = (U '\u2716'); Arrow = (U '\u2192'); Dot = (U '\u00B7');
      Frames = @((U '\u25D2'), (U '\u25D0'), (U '\u25D3'), (U '\u25D1')) }
  } else {
    $G = @{ Bar = '|'; Top = 'T'; End = '-'; Step = '*'; Ok = '+'; Warn = '!'; Fail = 'x'; Arrow = '->';
      Dot = '-'; Frames = @('|', '/', '-', '\') }
  }

  # Writes text and color pairs on one line; a color of '' keeps the console's own.
  function Out-Line([object[]]$Parts, [switch]$NoNewline) {
    for ($i = 0; $i -lt $Parts.Count; $i += 2) {
      $text = [string]$Parts[$i]
      $color = [string]$Parts[$i + 1]
      if ($color -and $UseColor) { Write-Host $text -NoNewline -ForegroundColor $color }
      else { Write-Host $text -NoNewline }
    }
    if (-not $NoNewline) { Write-Host '' }
  }

  # Terminal columns a string occupies: Hangul and other wide CJK characters take two.
  function Get-Width([string]$Text) {
    $width = 0
    foreach ($char in $Text.ToCharArray()) {
      $code = [int]$char
      if (($code -ge 0x1100 -and $code -le 0x115F) -or ($code -ge 0x2E80 -and $code -le 0xA4CF) -or
        ($code -ge 0xAC00 -and $code -le 0xD7A3) -or ($code -ge 0xF900 -and $code -le 0xFAFF) -or
        ($code -ge 0xFF00 -and $code -le 0xFF60)) { $width += 2 } else { $width += 1 }
    }
    return $width
  }

  # A row redrawn in place: its parts, cut to the console width and padded to clear the last one.
  function Out-Row([object[]]$Parts, [int]$Width) {
    $used = 0
    for ($i = 0; $i -lt $Parts.Count; $i += 2) {
      $text = [string]$Parts[$i]
      while ($text -and ($used + (Get-Width $text)) -gt $Width) { $text = $text.Substring(0, $text.Length - 1) }
      $used += Get-Width $text
      Out-Line @($text, $Parts[$i + 1]) -NoNewline
    }
    Write-Host (' ' * [Math]::Max(0, $Width - $used))
  }

  function Write-Banner {
    Write-Host ''
    Out-Line @('  ', '', (U '\u250C\u2500\u2510\u252C \u252C   \u250C\u252C\u2510\u252C \u252C   \u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510\u250C\u2500\u2510\u252C\u2500\u2510'), 'Green')
    Out-Line @('  ', '', (U '\u2502 \u2502\u251C\u2500\u2524\u2500\u2500\u2500\u2502\u2502\u2502\u2514\u252C\u2518\u2500\u2500\u2500\u251C\u2500\u2518\u251C\u2500\u2524\u251C\u2500\u2518\u251C\u2524 \u251C\u252C\u2518'), 'Green', '   installer', 'DarkGray')
    Out-Line @('  ', '', (U '\u2514\u2500\u2518\u2534 \u2534   \u2534 \u2534 \u2534    \u2534  \u2534 \u2534\u2534  \u2514\u2500\u2518\u2534\u2514\u2500'), 'Yellow')
    Write-Host ''
  }
  function Write-Step([string]$Text) { Write-Host ''; Out-Line @($G.Step, 'Green', "  $Text", 'White') }
  function Write-Ok([string]$Text) { Out-Line @($G.Bar, 'DarkGray', '  ', '', $G.Ok, 'Green', " $Text", '') }
  function Write-Warn([string]$Text) { Out-Line @($G.Bar, 'DarkGray', '  ', '', $G.Warn, 'Yellow', " $Text", '') }

  # The log's last lines, as UTF-8 whatever the console's code page, while a step may still write.
  function Read-LogLines([int]$Bytes) {
    try {
      $stream = [IO.File]::Open($Log, 'Open', 'Read', 'ReadWrite')
      try {
        $null = $stream.Seek([Math]::Max(0, $stream.Length - $Bytes), 'Begin')
        $text = (New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)).ReadToEnd()
      } finally { $stream.Dispose() }
    } catch { return @() }
    return @($text -split "[`r`n]+" | Where-Object { $_.Trim() })
  }

  function Stop-Install([string]$Message, [string]$Hint) {
    Out-Line @($G.Bar, 'DarkGray', '  ', '', $G.Fail, 'Red', " $Message", '')
    if ($Hint) { Out-Line @($G.Bar, 'DarkGray', "    $($G.Arrow) $Hint", 'DarkGray') }
    Out-Line @($G.End, 'DarkGray', "  $(M '\uC124\uCE58\uB97C \uBA48\uCDC4\uC2B5\uB2C8\uB2E4. \uB85C\uADF8:' 'Installation stopped. Log:') $Log", '')
    throw 'oh-my-paper-install-stopped:1'
  }

  # The newest line of the log, as the spinner's dim second line: progress redraws split, color
  # codes dropped, npm package downloads shown by name. The Codex CLI, by far the largest
  # download, is left out so its name does not linger there.
  function Get-LatestLine([int]$Width) {
    $lines = @(Read-LogLines 4096 | Where-Object { $_ -notmatch '@openai/codex|@openai%2fcodex' })
    if ($lines.Count -eq 0) { return '' }
    $line = $lines[-1] -replace "$([char]27)\[[0-9;]*[A-Za-z]", ''
    $line = $line -replace '^npm http cache [^ ]*/([^/ ]+)\.tgz .*', '$1'
    $line = $line -replace '^npm http fetch [A-Z]+ [0-9]+ [^ ]*/([^/ ]+)\.tgz .*', '$1'
    if ($line.Length -gt $Width) { $line = $line.Substring(0, $Width) }
    return $line
  }

  # Runs a cmd.exe command line with a spinner and its latest output line beneath it; the full
  # output goes to the log and is shown only on failure.
  function Invoke-Logged([string]$Label, [string]$CommandLine) {
    $process = Start-Process -FilePath $env:ComSpec -NoNewWindow -PassThru `
      -ArgumentList "/d /s /c `"($CommandLine) >> `"$Log`" 2>&1`""
    $null = $process.Handle # keeps the exit code readable once it ends
    if ($CanDraw) {
      # Three rows are made first, so redrawing the two never scrolls the console under them.
      Write-Host ''
      Write-Host ''
      Write-Host ''
      $top = [Math]::Max(0, [Console]::CursorTop - 3)
      $frame = 0
      $width = 20
      while (-not $process.HasExited) {
        $width = [Math]::Max(20, [Console]::WindowWidth - 1)
        [Console]::SetCursorPosition(0, $top)
        Out-Row @($G.Bar, 'DarkGray', '  ', '', $G.Frames[$frame % 4], 'Cyan', " $Label", '') $width
        Out-Row @($G.Bar, 'DarkGray', '    ', '', (Get-LatestLine ($width - 6)), 'DarkGray') $width
        $frame += 1
        Start-Sleep -Milliseconds 120
      }
      [Console]::SetCursorPosition(0, $top)
      Write-Host (' ' * $width)
      Write-Host (' ' * $width)
      [Console]::SetCursorPosition(0, $top)
    }
    $process.WaitForExit()
    if ($process.ExitCode -eq 0) {
      Write-Ok $Label
      return
    }
    foreach ($line in @(Read-LogLines 16384 | Select-Object -Last 12)) {
      Out-Line @($G.Bar, 'DarkGray', "    $line", '')
    }
    Stop-Install "$Label $(M '\uC2E4\uD328' 'failed')"
  }

  # PATH as Windows holds it for new programs, so a Node.js or Git installed after this console
  # opened (winget does not touch open consoles) is found without opening a new one.
  function Update-SessionPath {
    $seen = @{}
    foreach ($entry in ($env:Path -split ';')) { if ($entry) { $seen[$entry.TrimEnd('\').ToLowerInvariant()] = $true } }
    foreach ($scope in @('Machine', 'User')) {
      $stored = [Environment]::GetEnvironmentVariable('Path', $scope)
      if (-not $stored) { continue }
      foreach ($entry in ($stored -split ';')) {
        if ($entry -and -not $seen.ContainsKey($entry.TrimEnd('\').ToLowerInvariant())) {
          $env:Path = "$env:Path;$entry"
          $seen[$entry.TrimEnd('\').ToLowerInvariant()] = $true
        }
      }
    }
  }

  function Get-OsArchitecture {
    try { return [string][Runtime.InteropServices.RuntimeInformation]::OSArchitecture } catch { }
    if ($env:PROCESSOR_ARCHITEW6432) { return $env:PROCESSOR_ARCHITEW6432 }
    return $env:PROCESSOR_ARCHITECTURE
  }

  Write-Banner
  Out-Line @($G.Top, 'DarkGray', "  $(M 'oh-my-paper \uC124\uCE58' 'Installing oh-my-paper')", 'White', "  ($AppDir)", 'DarkGray')

  Write-Step "1/4  $(M '\uC2DC\uC2A4\uD15C \uD655\uC778' 'System check')"
  if ((Test-Path variable:IsWindows) -and -not $IsWindows) {
    Stop-Install (M '\uC774 \uC124\uCE58 \uD504\uB85C\uADF8\uB7A8\uC740 Windows\uC6A9\uC785\uB2C8\uB2E4' 'This installer is for Windows') 'curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash'
  }
  $arch = Get-OsArchitecture
  if ($arch -match '^(X64|AMD64)$') {
    Write-Ok 'Windows x64'
  } else {
    Write-Warn "Windows $arch $(U '\u2014') $(M 'Windows ARM\uC5D0\uC11C\uB294 \uBB38\uC11C \uC5D4\uC9C4(OCR)\uC774 \uB3D9\uC791\uD558\uC9C0 \uC54A\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uB098\uBA38\uC9C0\uB294 \uADF8\uB300\uB85C \uC124\uCE58\uD569\uB2C8\uB2E4' 'The document engine (OCR) may not work on Windows on ARM. Everything else installs as usual')"
  }
  Update-SessionPath
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Stop-Install (M 'git\uC774 \uC5C6\uC2B5\uB2C8\uB2E4' 'git is not installed') 'winget install --id Git.Git -e'
  }
  Write-Ok "git $(((& git --version) -replace '^git version ', '').Trim())"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Install (M 'Node.js\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4 (22 \uC774\uC0C1 \uD544\uC694)' 'Node.js is not installed (22 or later needed)') "winget install --id OpenJS.NodeJS.LTS -e  $(M '\uB610\uB294' 'or')  https://nodejs.org"
  }
  $nodeVersion = ([string](& node -v)).Trim()
  $nodeMajor = 0
  [void][int]::TryParse(($nodeVersion.TrimStart('v') -split '\.')[0], [ref]$nodeMajor)
  if ($nodeMajor -lt 22) {
    Stop-Install "Node.js $nodeVersion $(U '\u2014') $(M '22 \uC774\uC0C1\uC774 \uD544\uC694\uD569\uB2C8\uB2E4' '22 or later is needed')" 'winget upgrade --id OpenJS.NodeJS.LTS -e'
  }
  Write-Ok "Node.js $nodeVersion"
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-Install (M 'npm\uC774 \uC5C6\uC2B5\uB2C8\uB2E4' 'npm is not installed') (M 'Node.js\uB97C \uB2E4\uC2DC \uC124\uCE58\uD558\uC138\uC694' 'Reinstall Node.js')
  }

  Write-Step "2/4  $(M '\uB0B4\uB824\uBC1B\uAE30' 'Download')"
  if (Test-Path -LiteralPath (Join-Path $AppDir '.git')) {
    # A fast-forward, or, when the published history was replaced (the repository was cleaned up
    # and pushed anew) and nothing in the install was edited, the new history itself.
    Invoke-Logged (M '\uCD5C\uC2E0 \uBC84\uC804\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8' 'Update to the latest version') `
      ("git -C `"$AppDir`" fetch --progress origin `"$Branch`" && (git -C `"$AppDir`" merge --ff-only `"origin/$Branch`" || " +
      "(git -C `"$AppDir`" diff --quiet HEAD -- && git -C `"$AppDir`" reset --hard `"origin/$Branch`"))")
  } else {
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $AppDir)
    Invoke-Logged (M '\uC800\uC7A5\uC18C \uBCF5\uC81C' 'Clone the repository') `
      "git clone --progress --depth 1 --branch `"$Branch`" `"$Repo`" `"$AppDir`""
  }

  Write-Step "3/4  $(M '\uC124\uCE58\uC640 \uBE4C\uB4DC' 'Install and build')"
  Out-Line @($G.Bar, 'DarkGray', "  $(M '\uCC98\uC74C\uC5D0\uB294 \uBA87 \uBD84 \uAC78\uB9BD\uB2C8\uB2E4' 'The first run takes a few minutes')", 'DarkGray')
  # A running oh-my-paper holds its programs open, and Windows deletes no program in use, so they
  # move aside first (scripts/release-locked-files.mjs); npm ci then replaces node_modules whole.
  $release = Join-Path $AppDir 'scripts\release-locked-files.mjs'
  $prepare = if (Test-Path -LiteralPath $release) { "node `"$release`" `"$AppDir`" & " } else { '' }
  Invoke-Logged (M '\uC758\uC874\uC131 \uC124\uCE58' 'Install dependencies') `
    "$($prepare)call npm --prefix `"$AppDir`" ci --no-audit --no-fund --loglevel=http --foreground-scripts"
  Invoke-Logged (M '\uC6F9 \uC571 \uBE4C\uB4DC' 'Build the web app') "call npm --prefix `"$AppDir`" run build:web"

  Write-Step "4/4  $(M '\uBA85\uB839\uC5B4 \uC5F0\uACB0' 'Link the command')"
  $null = New-Item -ItemType Directory -Force -Path $BinDir
  # A one-line command that hands over to the app's own launcher. cmd.exe reads it in the console's
  # code page, so the app's folder is written through %USERPROFILE% when it lies there.
  $launcher = Join-Path $AppDir 'bin\oh-my-paper.cmd'
  $userProfile = [Environment]::GetFolderPath('UserProfile').TrimEnd('\')
  if ($launcher.StartsWith("$userProfile\", [StringComparison]::OrdinalIgnoreCase)) {
    $launcher = '%USERPROFILE%' + $launcher.Substring($userProfile.Length)
  }
  $shim = Join-Path $BinDir 'oh-my-paper.cmd'
  try { $oem = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) }
  catch { $oem = [Text.Encoding]::UTF8 }
  [IO.File]::WriteAllText($shim, "@`"$launcher`" %*`r`n", $oem)
  Write-Ok $shim
  $onPath = @($env:Path -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ieq $BinDir.TrimEnd('\') }).Count -gt 0
  if (-not $onPath) {
    try {
      # The user PATH is edited in the registry as it is stored, so entries such as
      # %USERPROFILE%\bin keep their variables; setting and clearing a variable through .NET then
      # tells Explorer, so terminals opened from now on see the change.
      $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
      try {
        $current = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
        $listed = @($current -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ieq $BinDir.TrimEnd('\') }).Count -gt 0
        if (-not $listed) {
          $value = if ($current.TrimEnd(';')) { "$($current.TrimEnd(';'));$BinDir" } else { $BinDir }
          $key.SetValue('Path', $value, $kind)
        }
      } finally { $key.Close() }
      [Environment]::SetEnvironmentVariable('OH_MY_PAPER_PATH_NOTICE', '1', 'User')
      [Environment]::SetEnvironmentVariable('OH_MY_PAPER_PATH_NOTICE', $null, 'User')
      Write-Ok (M '\uC0AC\uC6A9\uC790 PATH\uC5D0 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4 \u2014 \uC0C8 \uD130\uBBF8\uB110\uBD80\uD130 \uC801\uC6A9\uB429\uB2C8\uB2E4' 'Added to your user PATH \u2014 takes effect in new terminals')
    } catch {
      Write-Warn "$(M 'PATH\uC5D0 \uCD94\uAC00\uD558\uC138\uC694:' 'Add this to your PATH:') $BinDir"
    }
    $env:Path = "$BinDir;$env:Path"
  }

  Out-Line @($G.End, 'DarkGray', "  $(M '\uC124\uCE58 \uC644\uB8CC' 'Installed')", 'Green')
  Remove-Item -LiteralPath $Log -Force -ErrorAction SilentlyContinue

  if ($env:OH_MY_PAPER_NO_ONBOARD) {
    Write-Host ''
    Out-Line @("  $(M '\uB2E4\uC74C:' 'Next:') ", '', 'oh-my-paper onboard', 'White', "  $($G.Arrow) $(M '\uC124\uC815 \uB9C8\uBC95\uC0AC' 'setup wizard')", '')
    Out-Line @('         ', '', 'oh-my-paper', 'White', "          $($G.Arrow) $(M '\uC571 \uC2DC\uC791' 'start the app')", '')
    Write-Host ''
    return 0
  }
  # The wizard gets this console itself (Start-Process -NoNewWindow hands it over), so it can
  # read the keyboard; without one, or with -Yes, it prepares what it can on its own.
  $onboard = if (-not $Yes -and (Test-Console)) { 'onboard' } elseif ($NoOcr) { 'onboard --yes --no-ocr' } else { 'onboard --yes' }
  $wizard = Start-Process -FilePath $env:ComSpec -ArgumentList "/d /s /c `"`"$shim`" $onboard`"" -NoNewWindow -PassThru
  $null = $wizard.Handle
  $wizard.WaitForExit()
  return $wizard.ExitCode
}

# Exit codes reach a caller only from a one-shot PowerShell (-File, -Command); in a console
# someone typed `irm | iex` into, `exit` would close their window, so the code goes to
# $LASTEXITCODE there instead.
$ohMyPaperOneShot = [bool]$PSCommandPath -or (
  ([Environment]::GetCommandLineArgs() -match '^[-/](c|co|com|comm|comma|comman|command|e|ec|enc|encodedcommand|f|file)$') -and
  -not ([Environment]::GetCommandLineArgs() -match '^[-/]noe'))
$ohMyPaperStatus = 0
try {
  $ohMyPaperStatus = [int](@(Install-OhMyPaper -Arguments $args) | Select-Object -Last 1)
} catch {
  if ("$_" -match '^oh-my-paper-install-stopped:(\d+)$') { $ohMyPaperStatus = [int]$Matches[1] } else { throw }
}
if ($ohMyPaperOneShot) { exit $ohMyPaperStatus }
$global:LASTEXITCODE = $ohMyPaperStatus
