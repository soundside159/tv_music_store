@echo off
setlocal enableextensions
chcp 65001 >nul
cd /d "%~dp0"
REM Same as deploy.bat but never waits for a key. Optional arg = commit message.
REM Output is also written to deploy_auto.log so the assistant can read the result.
if "%~2"=="--logged" goto :main
call "%~f0" "%~1" --logged > "%~dp0deploy_auto.log" 2>&1
set "RC=%errorlevel%"
type "%~dp0deploy_auto.log"
exit /b %RC%

:main

echo ============================================
echo   TV Music Store - AUTO deploy to main (no prompts)
echo ============================================
echo.

set "MSG=site update %DATE% %TIME:~0,5%"
if not "%~1"=="" set "MSG=%~1"
echo.

REM --- clear a stale git lock left by an interrupted/parallel git process ---
if exist ".git\index.lock" (
  echo Removing stale .git\index.lock ...
  del /f /q ".git\index.lock" >nul 2>&1
)
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1

REM --- find npm (double-click cmd may not have it in PATH) ---
set "NPM="
for /f "delims=" %%i in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%i"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM if exist "%APPDATA%\npm\npm.cmd" set "NPM=%APPDATA%\npm\npm.cmd"

if defined NPM (
  echo [1/5] Local build check ...
  call "%NPM%" run build
  if errorlevel 1 (
    echo.
    echo *** BUILD FAILED - fix it, then run again. Nothing was pushed. ***
      exit /b 1
  )
) else (
  echo [1/5] npm not found in PATH - skipping local build ^(Cloudflare builds anyway^).
)
echo.

echo [2/5] git add ...
git add -A
if errorlevel 1 (
  echo.
  echo *** git add failed. If it mentions index.lock, close other git/editor windows and retry. ***
  exit /b 1
)

echo [3/5] git commit ...
git commit -m "%MSG%"
if errorlevel 1 echo   ^(nothing new to commit - will still sync and push^)
echo.

echo [4/5] git pull --rebase origin main ...
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo *** REBASE CONFLICT - undoing with: git rebase --abort ***
  git rebase --abort
  echo Two edits touched the same lines. Resolve manually or ask the assistant.
  echo Nothing was pushed.
  exit /b 1
)
echo.

echo [5/5] git push origin main ...
git push origin main
if errorlevel 1 (
  echo.
  echo *** PUSH FAILED - see message above. ***
  exit /b 1
)

echo.
echo ============================================
echo   DONE. Cloudflare builds ~1-3 min.
echo   Then hard-refresh the site: Ctrl+F5
echo ============================================
exit /b 0
