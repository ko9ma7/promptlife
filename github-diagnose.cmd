@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title PromptLife GitHub Diagnose

echo ============================================================================
echo PromptLife GitHub Diagnose
echo ============================================================================
where gh >nul 2>nul
if errorlevel 1 (
  echo [ERROR] GitHub CLI ^(gh^) not found.
  goto :end
)

echo [CHECK] Active GitHub CLI account:
gh auth status --active -h github.com
echo.
for /f "usebackq delims=" %%U in (`gh api user --jq .login 2^>nul`) do set "GH_USER=%%U"
if not defined GH_USER (
  echo [ERROR] Could not resolve the active GitHub account.
  echo [RECOVERY] Run: gh auth login --web
  goto :end
)
echo [OK] Active account: %GH_USER%
echo [CHECK] Looking for: https://github.com/%GH_USER%/promptlife
gh api repos/%GH_USER%/promptlife --jq "{full_name:.full_name,html_url:.html_url,visibility:.visibility,default_branch:.default_branch}"
if errorlevel 1 (
  echo [ERROR] No repository named promptlife is visible to this active account.
  echo [RECOVERY] Run github-bootstrap.cmd again and confirm the displayed account.
) else (
  echo [OK] Repository exists. Opening it now...
  start "" "https://github.com/%GH_USER%/promptlife"
)
:end
echo.
echo Press any key to close.
pause >nul
