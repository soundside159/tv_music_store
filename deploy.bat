@echo off
setlocal enableextensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   TV Music Store - deploy to main
echo ============================================
echo.

set "MSG=site update %DATE% %TIME:~0,5%"
set /p "INPUT=Commit message (Enter = auto): "
if not "%INPUT%"=="" set "MSG=%INPUT%"
echo.

echo [1/5] git pull --ff-only ...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo *** PULL FAILED. Resolve manually, then run again. ***
  pause
  exit /b 1
)
echo.

echo [2/5] npm run lint ... warnings are OK, only errors stop deploy
call npm run lint
if errorlevel 1 (
  echo.
  echo *** LINT ERRORS. Fix them, then run again. ***
  pause
  exit /b 1
)
echo.

echo [3/5] npm run build ...
call npm run build
if errorlevel 1 (
  echo.
  echo *** BUILD FAILED. Fix it, then run again. ***
  pause
  exit /b 1
)
echo.

echo [4/5] git add + commit ...
git add -A
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo *** NOTHING TO COMMIT or commit failed. See above. ***
  pause
  exit /b 1
)
echo.

echo [5/5] git push origin main ...
git push origin main
if errorlevel 1 (
  echo.
  echo *** PUSH FAILED. See message above. ***
  pause
  exit /b 1
)

echo.
echo ============================================
echo   DONE. Cloudflare builds ~1-3 min.
echo   Then hard-refresh the site: Ctrl+F5
echo ============================================
pause
exit /b 0
