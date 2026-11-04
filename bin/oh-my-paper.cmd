@echo off
rem oh-my-paper launcher for Windows: runs the CLI from its own checkout, wherever it is called
rem from. The counterpart of bin/oh-my-paper. node_modules\.bin\tsx is a cmd shim on Windows, and
rem tsx's own CLI would run the app in a second node that console events never reach, so node runs
rem it with tsx's loader. --import takes a URL there: a bare C:\ path reads as a scheme.
if not exist "%~dp0..\node_modules\tsx\dist\loader.mjs" (
  echo oh-my-paper: the install is incomplete. Run the installer again: 1>&2
  echo   irm https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.ps1 ^| iex 1>&2
  exit /b 1
)
rem cmd reads all of the last line before running it, and the failed goto ends this batch file
rem first, as npm's own shims do: an update that rewrites this file cannot make cmd read on in the
rem new one, and Ctrl+C does not ask "Terminate batch job (Y/N)?". node's exit status is the result.
goto #_undefined_# 2>NUL || title %COMSPEC% & node --import "file:///%~dp0..\node_modules\tsx\dist\loader.mjs" "%~dp0..\src\cli\main.ts" %*
