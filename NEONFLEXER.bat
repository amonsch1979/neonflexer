@echo off
title MAGICTOOLBOX NEONFLEXER
echo ============================================
echo   MAGICTOOLBOX NEONFLEXER
echo   Starting local server...
echo ============================================
echo.

cd /d "%~dp0"

:: Try Python first
where python >nul 2>&1
if %errorlevel%==0 (
    echo Found Python - starting server on http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server.
    start "" http://localhost:8000
    python -m http.server 8000
    goto :end
)

:: Try Python3
where python3 >nul 2>&1
if %errorlevel%==0 (
    echo Found Python3 - starting server on http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server.
    start "" http://localhost:8000
    python3 -m http.server 8000
    goto :end
)

:: Try Node.js npx serve
where npx >nul 2>&1
if %errorlevel%==0 (
    echo Found Node.js - starting server on http://localhost:3000
    echo.
    echo Press Ctrl+C to stop the server.
    start "" http://localhost:3000
    npx serve -l 3000 .
    goto :end
)

:: Fallback: PowerShell HTTP server (no installs needed on Windows 10/11)
echo No Python or Node found - using PowerShell server on http://localhost:8080
echo.
echo Press Ctrl+C to stop the server.
start "" http://localhost:8080
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:end
pause
