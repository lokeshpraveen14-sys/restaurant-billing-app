@echo off
title Restaurant Billing - Print Server
color 0A

echo.
echo  ======================================================
echo    Restaurant Billing - Resilient Thermal Print Server
echo  ======================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org  (LTS version)
    echo.
    echo  After installing, double-click this file again.
    echo.
    pause
    exit /b 1
)

:: Navigate to the print-server folder
cd /d "%~dp0print-server"

echo  Starting print server...
echo  Keep this window open while billing.
echo.

:run_server
node server.js

:: If server exits unexpectedly, wait 3 seconds and restart automatically
echo.
echo  [WARNING] Print server process stopped.
echo  Auto-restarting in 3 seconds... (Press Ctrl+C to stop)
timeout /t 3 /nobreak >nul
echo.
goto run_server
