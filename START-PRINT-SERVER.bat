@echo off
title Restaurant Billing - Print Server
color 0A

echo.
echo  =============================================
echo    Restaurant Billing - Print Bridge Server
echo  =============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org  (click the LTS version)
    echo.
    echo  After installing, double-click this file again.
    echo.
    pause
    exit /b 1
)

:: Navigate to the print-server folder (same folder as this .bat file)
cd /d "%~dp0print-server"

echo  Starting print server...
echo  Keep this window open while billing.
echo.

node server.js

:: If server crashes or exits, pause so the user can read the error
echo.
echo  ============================================
echo   Server stopped. Press any key to close.
echo  ============================================
pause
