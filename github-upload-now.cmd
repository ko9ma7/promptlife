@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title PromptLife - Create Repository and Upload NOW

echo ============================================================================
echo PromptLife - GitHub Repository Create + Upload NOW
echo ============================================================================
echo [CHECK] Folder: %CD%
echo.

where gh >nul 2>&1 || goto :no_gh
where git >nul 2>&1 || goto :no_git

gh auth status --active -h github.com >nul 2>&1
if errorlevel 1 (
  echo [WARN] GitHub CLI login is required.
  gh auth login --hostname github.com --git-protocol https --web
  if errorlevel 1 goto :auth_fail
)

for /f "usebackq delims=" %%I in (`gh api user --jq .login 2^>nul`) do set "GH_USER=%%I"
if not defined GH_USER goto :auth_fail
set "REPO_NAME=promptlife"
set "FULL_REPO=%GH_USER%/%REPO_NAME%"
set "REPO_URL=https://github.com/%FULL_REPO%"
set "REMOTE_URL=https://github.com/%FULL_REPO%.git"

echo [OK] Active GitHub account: %GH_USER%
echo [CHECK] Target repository: %REPO_URL%
echo.

echo [CHECK] Checking whether repository already exists...
gh repo view "%FULL_REPO%" >nul 2>&1
if errorlevel 1 (
  echo [CHECK] Repository not found. Creating it NOW...
  echo        ^> gh repo create %FULL_REPO% --public
  gh repo create "%FULL_REPO%" --public --description "Prompt-driven WebGPU artificial-life ecosystem simulator with mutation, God Mode, and simulation-log analysis."
  if errorlevel 1 goto :repo_create_fail
) else (
  echo [OK] Repository already exists. Reusing it.
)

echo [CHECK] Verifying repository after create/reuse...
gh repo view "%FULL_REPO%" --json nameWithOwner,url --jq "[.nameWithOwner,.url] | @tsv"
if errorlevel 1 goto :repo_verify_fail
echo [OK] Repository exists on GitHub.

if not exist ".git" (
  echo [CHECK] Initializing local Git repository...
  git init
  if errorlevel 1 goto :git_fail
)

git branch -M main

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTE_URL%"
) else (
  git remote set-url origin "%REMOTE_URL%"
)
if errorlevel 1 goto :git_fail

echo [OK] origin = %REMOTE_URL%

git add -A
if errorlevel 1 goto :git_fail

git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  echo [CHECK] Creating initial commit...
  git commit -m "feat: launch PromptLife WebGPU evolution lab"
  if errorlevel 1 goto :commit_fail
) else (
  git diff --cached --quiet
  if errorlevel 1 (
    echo [CHECK] Committing pending project changes...
    git commit -m "chore: upload PromptLife project"
    if errorlevel 1 goto :commit_fail
  ) else (
    echo [OK] No uncommitted project changes.
  )
)

echo [CHECK] Pushing main branch to GitHub...
git push -u origin main
if errorlevel 1 (
  echo [WARN] First push failed. Refreshing workflow permission once...
  gh auth refresh -h github.com -s workflow
  git push -u origin main
  if errorlevel 1 goto :push_fail
)

echo [CHECK] Verifying remote main branch...
git ls-remote --exit-code origin refs/heads/main >nul 2>&1
if errorlevel 1 goto :push_verify_fail

echo.
echo ============================================================================
echo [OK] REPOSITORY CREATED / VERIFIED / PUSHED
echo [OK] Repository: %REPO_URL%
echo ============================================================================
>bootstrap-upload-result.txt echo Repository: %REPO_URL%
>>bootstrap-upload-result.txt echo GitHub account: %GH_USER%
>>bootstrap-upload-result.txt echo Branch: main
start "" "%REPO_URL%"
echo.
echo Next: run github-bootstrap.cmd v4 to configure Pages, Actions and Release.
echo Press any key to close.
pause >nul
exit /b 0

:no_gh
echo [ERROR] GitHub CLI ^(gh^) was not found.
echo [RECOVERY] winget install --id GitHub.cli -e
goto :fail
:no_git
echo [ERROR] Git was not found.
echo [RECOVERY] winget install --id Git.Git -e
goto :fail
:auth_fail
echo [ERROR] GitHub authentication failed.
echo [RECOVERY] gh auth login --hostname github.com --web
goto :fail
:repo_create_fail
echo [ERROR] GitHub repository creation command failed.
echo [RECOVERY] Run manually: gh repo create %FULL_REPO% --public
goto :fail
:repo_verify_fail
echo [ERROR] Repository still cannot be verified after creation.
echo [RECOVERY] Run: gh repo view %FULL_REPO% --web
goto :fail
:git_fail
echo [ERROR] Local Git setup failed.
echo [RECOVERY] Run: git status ^& git remote -v
goto :fail
:commit_fail
echo [ERROR] Git commit failed.
echo [RECOVERY] Run: git status ^& git add -A ^& git commit -m "chore: upload PromptLife project"
goto :fail
:push_fail
echo [ERROR] Git push failed.
echo [RECOVERY] Run: gh auth refresh -h github.com -s workflow
echo [RECOVERY] Then: git push -u origin main
goto :fail
:push_verify_fail
echo [ERROR] git push returned but origin/main could not be verified.
echo [RECOVERY] Run: git ls-remote origin refs/heads/main
goto :fail
:fail
echo.
echo ============================================================================
echo [ERROR] Upload did not complete.
echo ============================================================================
echo Press any key to close.
pause >nul
exit /b 1
