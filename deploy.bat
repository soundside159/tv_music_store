@echo off
setlocal enableextensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   TV Music Store - deploy to main
echo ============================================
echo.

REM --- commit message (ask, with default) ---
set "MSG=catalog: increase track title-to-versions gap to narrow waveforms"
set /p "INPUT=Commit message [Enter = default]: "
if not "%INPUT%"=="" set "MSG=%INPUT%"
echo.

REM --- locate npm (not always in PATH for double-click cmd) ---
set "NPM="
for /f "delims=" %%i in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%i"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM=%ProgramFiles(x86)%\nodejs\npm.cmd"
if not defined NPM if exist "%APPDATA%\npm\npm.cmd" set "NPM=%APPDATA%\npm\npm.cmd"

if defined NPM (
  echo [1/4] Build with "%NPM%" ...
  call "%NPM%" run build
  if errorlevel 1 (
    echo.
    echo BUILD FAILED - push aborted. Fix the build, then run again.
    pause
    exit /b 1
  )
) else (
  echo [1/4] npm not found in PATH - skipping local build.
  echo       Cloudflare Pages will build on the server after push.
)
echo.

echo [2/4] git add...
git add -A
if errorlevel 1 goto fail

echo [3/4] git commit...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo Nothing to commit or commit failed. Check "git status".
  pause
  exit /b 1
)

echo [4/4] git push origin main...
git push origin main
if errorlevel 1 goto fail

echo.
echo ============================================
echo   DONE. Cloudflare Pages will auto-deploy.
echo ============================================
pause
exit /b 0

:fail
echo.
echo ERROR - see message above. (Is git installed and in PATH?)
pause
exit /b 1
