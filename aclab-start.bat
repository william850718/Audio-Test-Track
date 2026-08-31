@echo off
rem ---------------------------------------------------------------------------
rem  AudioTracker - local preview
rem
rem  Opening index.html straight from disk does not work any more. The page loads
rem  its code as ES modules, and a browser refuses to fetch a module over file://
rem  (its origin is "null", so the CORS check can never pass) - the script simply
rem  never runs, and every button is dead with nothing in the console to explain
rem  it. The deployed site is unaffected: GitHub Pages serves over https.
rem
rem  This serves the folder over http on 8765 and opens it. Close the window, or
rem  press Ctrl+C, to stop.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python was not found on PATH, and it is what serves the files.
  echo   Install it from https://www.python.org/downloads/ - tick
  echo   "Add python.exe to PATH" during setup - then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo   AudioTracker is at  http://127.0.0.1:8765/
echo   Leave this window open while you use it.
echo.

start "" "http://127.0.0.1:8765/"
python -m http.server 8765 --bind 127.0.0.1
