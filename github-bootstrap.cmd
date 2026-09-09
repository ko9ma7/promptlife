@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title PromptLife GitHub Bootstrap v4

rem ============================================================================
rem PromptLife GitHub Bootstrap v4 - Windows 10/11 one-click launcher
rem Edit only these values for normal customization.
rem ============================================================================
set "REPO_NAME=promptlife"
set "REPO_OWNER="
set "EXPECTED_GITHUB_USER="
set "REPO_VISIBILITY=public"
set "REPO_DESCRIPTION=Prompt-driven WebGPU artificial-life ecosystem simulator with mutation, God Mode, and simulation-log analysis."
set "REPO_TOPICS=webgpu simulation artificial-life evolution ecosystem javascript canvas github-pages"
set "DEFAULT_BRANCH=main"
set "RELEASE_TAG=v1.0.0"
set "CUSTOM_DOMAIN="
set "AUTO_INSTALL_TOOLS=1"
set "WAIT_FOR_DEPLOY=1"
set "CONFIRM_ACCOUNT=1"
set "OPEN_RESULT_IN_BROWSER=1"
rem ============================================================================

set "PL_REPO_NAME=%REPO_NAME%"
set "PL_REPO_OWNER=%REPO_OWNER%"
set "PL_EXPECTED_GITHUB_USER=%EXPECTED_GITHUB_USER%"
set "PL_REPO_VISIBILITY=%REPO_VISIBILITY%"
set "PL_REPO_DESCRIPTION=%REPO_DESCRIPTION%"
set "PL_REPO_TOPICS=%REPO_TOPICS%"
set "PL_DEFAULT_BRANCH=%DEFAULT_BRANCH%"
set "PL_RELEASE_TAG=%RELEASE_TAG%"
set "PL_CUSTOM_DOMAIN=%CUSTOM_DOMAIN%"
set "PL_AUTO_INSTALL_TOOLS=%AUTO_INSTALL_TOOLS%"
set "PL_WAIT_FOR_DEPLOY=%WAIT_FOR_DEPLOY%"
set "PL_CONFIRM_ACCOUNT=%CONFIRM_ACCOUNT%"
set "PL_OPEN_RESULT_IN_BROWSER=%OPEN_RESULT_IN_BROWSER%"
set "PL_PROJECT_ROOT=%CD%"

cls
echo ============================================================================
echo PromptLife GitHub Bootstrap v4
echo ============================================================================
echo [CHECK] Project folder: %CD%
echo [CHECK] This version treats a missing repo (HTTP 404) as CREATE, not as a fatal PowerShell error.
echo.

if not exist "package.json" goto :not_extracted
if not exist "scripts\github-bootstrap.ps1" goto :missing_helper
if not exist ".github\workflows\deploy.yml" goto :missing_project
if not exist "src\main.js" goto :missing_project

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-bootstrap.ps1"
set "BOOTSTRAP_RC=%ERRORLEVEL%"

echo.
echo ============================================================================
if "%BOOTSTRAP_RC%"=="0" (
  echo [OK] VERIFIED bootstrap finished successfully.
  echo [OK] Open "bootstrap-result.txt" to see the exact GitHub URLs.
) else (
  echo [ERROR] Bootstrap stopped with exit code %BOOTSTRAP_RC%.
  echo [ERROR] It did NOT pass final GitHub repository verification.
)
echo [CHECK] Full log: "%~dp0bootstrap-last.log"
echo [CHECK] Result:   "%~dp0bootstrap-result.txt"
echo ============================================================================
echo.
echo Press any key to close this window.
pause >nul
exit /b %BOOTSTRAP_RC%

:not_extracted
echo [ERROR] package.json was not found next to github-bootstrap.cmd.
echo [RECOVERY] Right-click the ZIP ^> Extract All... then run the .cmd from the extracted folder.
goto :launcher_fail

:missing_helper
echo [ERROR] scripts\github-bootstrap.ps1 is missing.
echo [RECOVERY] Extract the complete project ZIP again.
goto :launcher_fail

:missing_project
echo [ERROR] One or more required PromptLife project files are missing.
echo [RECOVERY] Extract the complete project ZIP again into a normal folder and rerun.
goto :launcher_fail

:launcher_fail
echo.
echo ============================================================================
echo [ERROR] Bootstrap did not start.
echo ============================================================================
echo Press any key to close this window.
pause >nul
exit /b 1
