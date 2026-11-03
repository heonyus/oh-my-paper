@echo off
rem oh-my-paper launcher for Windows: runs the CLI from its own checkout, wherever it is called
rem from. The counterpart of bin/oh-my-paper. node_modules\.bin\tsx is a cmd shim on Windows, so
rem node runs tsx's own entry point instead.
setlocal
pushd "%~dp0.." || exit /b 1
node "%CD%\node_modules\tsx\dist\cli.mjs" "%CD%\src\cli\main.ts" %*
set "OH_MY_PAPER_STATUS=%ERRORLEVEL%"
popd
exit /b %OH_MY_PAPER_STATUS%
