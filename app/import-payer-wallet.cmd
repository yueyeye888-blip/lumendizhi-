@echo off
title Import Payer Wallet
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\import-payer-wallet.ps1" -InstallRoot "%~dp0"
echo.
pause
