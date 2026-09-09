@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title PromptLife GitHub Upload NOW v8

rem ============================================================================
rem PromptLife v8 - minimal, PowerShell-free upload path.
rem Existing remote main is preserved. No force-push is used.
rem ============================================================================
set "REPO_NAME=promptlife"
set "REPO_OWNER="
set "REPO_VISIBILITY=public"
set "REPO_DESCRIPTION=Prompt-driven WebGPU artificial-life ecosystem simulator with mutation, zoom inspection, WebP export, God Mode, and simulation-log analysis."
set "DEFAULT_BRANCH=main"
set "COMMIT_MESSAGE=feat: add zoom inspection and WebP export"
set "OPEN_RESULT_IN_BROWSER=1"

cls
echo ============================================================================
echo PromptLife GitHub Upload NOW v8
echo ============================================================================
echo [CHECK] Project folder: %CD%
echo [CHECK] This uploader does NOT use the provisioning PowerShell script.
echo [CHECK] Existing origin/main history is preserved. Force-push is never used.
echo.

if not exist "package.json" goto :missing_project
if not exist "src\main.js" goto :missing_project
if not exist ".github\workflows\deploy.yml" goto :missing_project

where git >nul 2>&1
if errorlevel 1 goto :missing_git
where node >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node
where gh >nul 2>&1
if errorlevel 1 goto :missing_gh

echo [OK] Required tools detected.
for /f "delims=" %%A in ('git --version') do echo [OK] %%A
for /f "delims=" %%A in ('node --version') do echo [OK] Node.js %%A
for /f "delims=" %%A in ('npm --version') do echo [OK] npm %%A
for /f "delims=" %%A in ('gh --version ^| findstr /b "gh version"') do echo [OK] %%A

echo.
echo [CHECK] GitHub authentication
gh auth status --active -h github.com >nul 2>&1
if errorlevel 1 (
  echo [WARN] No active GitHub CLI login. Starting browser login...
  gh auth login --hostname github.com --git-protocol https --web
  if errorlevel 1 goto :auth_failed
)

set "GH_USER="
for /f "usebackq delims=" %%A in (`gh api user --jq .login 2^>nul`) do set "GH_USER=%%A"
if not defined GH_USER goto :auth_failed
if defined REPO_OWNER set "GH_USER=%REPO_OWNER%"
set "FULL_REPO=!GH_USER!/%REPO_NAME%"
set "REPO_URL=https://github.com/!FULL_REPO!"
set "REMOTE_URL=https://github.com/!FULL_REPO!.git"
set "PAGES_URL=https://!GH_USER!.github.io/%REPO_NAME%/"

echo [OK] Active GitHub account: !GH_USER!
echo [CHECK] Target repository: !REPO_URL!
echo.
set /p "CONFIRM=Type YES to upload this project to '!FULL_REPO!': "
if /I not "!CONFIRM!"=="YES" goto :cancelled

echo.
echo [CHECK] Build verification
call npm.cmd ci
if errorlevel 1 goto :npm_failed
call npm.cmd test
if errorlevel 1 goto :npm_failed
call npm.cmd run build
if errorlevel 1 goto :npm_failed
echo [OK] npm ci / test / build passed.

echo.
echo [CHECK] GitHub repository
call gh repo view "!FULL_REPO!" >nul 2>&1
if errorlevel 1 (
  echo [CHECK] Repository does not exist. Creating it now...
  if /I "%REPO_VISIBILITY%"=="private" (
    call gh repo create "!FULL_REPO!" --private --description "%REPO_DESCRIPTION%"
  ) else if /I "%REPO_VISIBILITY%"=="internal" (
    call gh repo create "!FULL_REPO!" --internal --description "%REPO_DESCRIPTION%"
  ) else (
    call gh repo create "!FULL_REPO!" --public --description "%REPO_DESCRIPTION%"
  )
  if errorlevel 1 goto :repo_failed
)
call gh repo view "!FULL_REPO!" --json nameWithOwner,url --jq ".nameWithOwner + \"    \" + .url"
if errorlevel 1 goto :repo_failed
echo [OK] Repository verified.

echo.
echo [CHECK] Local Git setup
if not exist ".git" (
  git init
  if errorlevel 1 goto :git_failed
)
git branch -M "%DEFAULT_BRANCH%"
if errorlevel 1 goto :git_failed

git config user.name >nul 2>&1
if errorlevel 1 git config user.name "!GH_USER!"
git config user.email >nul 2>&1
if errorlevel 1 git config user.email "!GH_USER!@users.noreply.github.com"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "!REMOTE_URL!"
) else (
  git remote set-url origin "!REMOTE_URL!"
)
if errorlevel 1 goto :git_failed
echo [OK] origin = !REMOTE_URL!

echo.
echo [CHECK] Remote history synchronization
git ls-remote --exit-code origin "refs/heads/%DEFAULT_BRANCH%" >nul 2>&1
set "REMOTE_EXISTS=!errorlevel!"
if "!REMOTE_EXISTS!"=="0" (
  git fetch origin "%DEFAULT_BRANCH%"
  if errorlevel 1 goto :git_failed
  echo [OK] Fetched origin/%DEFAULT_BRANCH%.

  rem Save any previous local commit as a backup, then anchor main to the remote
  rem commit while leaving all current extracted project files untouched.
  git rev-parse --verify HEAD >nul 2>&1
  if "!errorlevel!"=="0" (
    git branch -f bootstrap-local-backup HEAD >nul 2>&1
    echo [OK] Previous local HEAD saved as bootstrap-local-backup.
  )
  git reset --mixed "origin/%DEFAULT_BRANCH%"
  if errorlevel 1 goto :git_failed
  echo [OK] Local %DEFAULT_BRANCH% anchored to origin/%DEFAULT_BRANCH%.
) else (
  echo [OK] Remote %DEFAULT_BRANCH% does not exist yet; creating first branch.
)

echo.
echo [CHECK] Commit current PromptLife files
git add -A
if errorlevel 1 goto :git_failed

git diff --cached --quiet
set "DIFF_RC=!errorlevel!"
if "!DIFF_RC!"=="1" (
  git commit -m "%COMMIT_MESSAGE%"
  if errorlevel 1 goto :git_failed
  echo [OK] Current project committed.
) else if "!DIFF_RC!"=="0" (
  echo [OK] Nothing new to commit; files already match the remote tree.
) else (
  goto :git_failed
)

echo.
echo [CHECK] Pushing %DEFAULT_BRANCH% to GitHub
git push -u origin "%DEFAULT_BRANCH%"
if errorlevel 1 goto :push_failed

set "REMOTE_SHA="
for /f "usebackq delims=" %%A in (`gh api "repos/!FULL_REPO!/commits/%DEFAULT_BRANCH%" --jq .sha 2^>nul`) do set "REMOTE_SHA=%%A"
if not defined REMOTE_SHA goto :verify_failed

echo [OK] GitHub API verified remote main commit: !REMOTE_SHA!
(
  echo PromptLife GitHub Upload SUCCESS
  echo Repository: !REPO_URL!
  echo Branch: %DEFAULT_BRANCH%
  echo Remote commit: !REMOTE_SHA!
  echo Pages: !PAGES_URL!
) > "bootstrap-result.txt"

echo.
echo ============================================================================
echo [OK] UPLOAD VERIFIED SUCCESSFULLY
echo [OK] Repository : !REPO_URL!
echo [OK] Commit     : !REMOTE_SHA!
echo [CHECK] Pages   : !PAGES_URL!
echo [NEXT] The existing GitHub Pages workflow should run automatically after this push.
echo ============================================================================
if "%OPEN_RESULT_IN_BROWSER%"=="1" start "" "!REPO_URL!"
echo.
echo Press any key to close this window.
pause >nul
exit /b 0

:missing_project
echo [ERROR] Complete PromptLife files were not found in this folder.
echo [RECOVERY] Extract the whole ZIP first and run github-upload-now.cmd inside the extracted promptlife-v8 folder.
goto :fail

:missing_git
echo [ERROR] Git is not installed or not in PATH.
echo [RECOVERY] Install Git for Windows, reopen this folder, and run again.
goto :fail

:missing_node
echo [ERROR] Node.js/npm is not installed or not in PATH.
echo [RECOVERY] Install Node.js LTS, reopen this folder, and run again.
goto :fail

:missing_gh
echo [ERROR] GitHub CLI (gh) is not installed or not in PATH.
echo [RECOVERY] Install GitHub CLI, reopen this folder, and run again.
goto :fail

:auth_failed
echo [ERROR] GitHub CLI authentication failed.
echo [RECOVERY] Run: gh auth login --hostname github.com --git-protocol https --web
goto :fail

:repo_failed
echo [ERROR] GitHub repository create/verify failed.
echo [RECOVERY] Run: gh repo view !FULL_REPO!
goto :fail

:npm_failed
echo [ERROR] Build verification failed. Nothing was pushed.
echo [RECOVERY] Run: npm test ^&^& npm run build
goto :fail

:git_failed
echo [ERROR] Local Git synchronization failed. Nothing was force-pushed.
echo [RECOVERY] Run: git status ^& git log --oneline --graph --all -10
goto :fail

:push_failed
echo [ERROR] Git push failed.
echo [RECOVERY] Run: gh auth setup-git
echo [RECOVERY] Then: git push -u origin %DEFAULT_BRANCH%
goto :fail

:verify_failed
echo [ERROR] Push returned, but GitHub API could not verify the remote commit.
echo [RECOVERY] Run: gh api repos/!FULL_REPO!/commits/%DEFAULT_BRANCH% --jq .sha
goto :fail

:cancelled
echo [WARN] Upload cancelled because YES was not entered.
goto :fail

:fail
echo.
echo ============================================================================
echo [ERROR] UPLOAD NOT VERIFIED
echo ============================================================================
echo Press any key to close this window.
pause >nul
exit /b 1
