# PromptLife GitHub Bootstrap provisioning helper.
# Windows PowerShell 5.1+ compatible. Launched by github-bootstrap.cmd.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$Root = if ($env:PL_PROJECT_ROOT) { $env:PL_PROJECT_ROOT } else { Split-Path -Parent $PSScriptRoot }
Set-Location $Root
$LogPath = Join-Path $Root 'bootstrap-last.log'
$ResultPath = Join-Path $Root 'bootstrap-result.txt'

function Write-Step([string]$Kind, [string]$Message) {
    $line = '[{0}] {1}' -f $Kind, $Message
    Write-Host $line
}

function Fail([string]$Message, [string]$Recovery = '') {
    Write-Step 'ERROR' $Message
    if ($Recovery) { Write-Step 'RECOVERY' $Recovery }
    throw $Message
}

function Has-Command([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$File,
        [Parameter(Mandatory=$false)][string[]]$Arguments = @(),
        [switch]$Quiet,
        [switch]$AllowFailure
    )
    if (-not $Quiet) {
        Write-Host ('       > {0} {1}' -f $File, ($Arguments -join ' '))
    }

    # Important: stream native output to the console, but return ONLY the
    # integer process exit code. Earlier versions leaked command output into
    # the PowerShell success stream, so `$pushCode = Invoke-Native ...`
    # became an array such as ["Everything up-to-date", 0] and was then
    # incorrectly treated as a failed push.
    $oldPreference = $ErrorActionPreference
    $hadPsNativePreference = $false
    $oldPsNativePreference = $null
    try {
        $ErrorActionPreference = 'Continue'
        if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
            $hadPsNativePreference = $true
            $oldPsNativePreference = $PSNativeCommandUseErrorActionPreference
            $PSNativeCommandUseErrorActionPreference = $false
        }

        if ($Quiet) {
            & $File @Arguments *> $null
        } else {
            & $File @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
        }
        $code = [int]$LASTEXITCODE
    }
    finally {
        if ($hadPsNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $oldPsNativePreference
        }
        $ErrorActionPreference = $oldPreference
    }

    if (($code -ne 0) -and (-not $AllowFailure)) {
        throw ('Command failed ({0}): {1} {2}' -f $code, $File, ($Arguments -join ' '))
    }
    return [int]$code
}

function Capture-Native {
    param(
        [Parameter(Mandatory=$true)][string]$File,
        [Parameter(Mandatory=$false)][string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    # Native programs such as `gh` write expected conditions (for example a
    # missing repository -> HTTP 404) to STDERR. Windows PowerShell can turn
    # that STDERR into an ErrorRecord and, with ErrorActionPreference=Stop,
    # abort the script before we get a chance to inspect LASTEXITCODE.
    # Temporarily downgrade PowerShell error escalation while the native
    # command runs, then decide success/failure from the process exit code.
    $oldPreference = $ErrorActionPreference
    $hadPsNativePreference = $false
    $oldPsNativePreference = $null
    try {
        $ErrorActionPreference = 'Continue'
        if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
            $hadPsNativePreference = $true
            $oldPsNativePreference = $PSNativeCommandUseErrorActionPreference
            $PSNativeCommandUseErrorActionPreference = $false
        }
        $output = & $File @Arguments 2>$null
        $code = $LASTEXITCODE
    }
    finally {
        if ($hadPsNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $oldPsNativePreference
        }
        $ErrorActionPreference = $oldPreference
    }

    if (($code -ne 0) -and (-not $AllowFailure)) {
        throw ('Command failed ({0}): {1} {2}' -f $code, $File, ($Arguments -join ' '))
    }
    return ,@($code, ($output -join "`n"))
}

function Test-NativeSuccess {
    param(
        [Parameter(Mandatory=$true)][string]$File,
        [Parameter(Mandatory=$false)][string[]]$Arguments = @()
    )
    $result = Capture-Native $File $Arguments -AllowFailure
    return ($result[0] -eq 0)
}

function Refresh-Path {
    $extra = @(
        "$env:ProgramFiles\Git\cmd",
        "$env:ProgramFiles\nodejs",
        "$env:ProgramFiles\GitHub CLI",
        "$env:LocalAppData\Programs\GitHub CLI"
    )
    foreach ($p in $extra) {
        if ((Test-Path $p) -and (($env:Path -split ';') -notcontains $p)) {
            $env:Path = "$p;$env:Path"
        }
    }
}

function Ensure-Tool([string]$Command, [string]$WingetId, [string]$DisplayName) {
    if (Has-Command $Command) {
        Write-Step 'OK' "$DisplayName detected."
        return
    }
    Write-Step 'WARN' "$DisplayName is not installed or is not available in PATH."
    if ($env:PL_AUTO_INSTALL_TOOLS -ne '1') {
        Fail "$DisplayName is required." "Install $DisplayName, then rerun github-bootstrap.cmd."
    }
    if (-not (Has-Command 'winget')) {
        Fail 'winget is unavailable.' "Install $DisplayName manually, then rerun github-bootstrap.cmd."
    }
    Write-Step 'CHECK' "Installing $DisplayName with winget..."
    Invoke-Native 'winget' @('install','--id',$WingetId,'-e','--accept-package-agreements','--accept-source-agreements','--silent') | Out-Null
    Refresh-Path
    if (-not (Has-Command $Command)) {
        Fail "$DisplayName was installed but this terminal cannot see it yet." 'Close this window, reopen the extracted project folder, and rerun github-bootstrap.cmd.'
    }
    Write-Step 'OK' "$DisplayName installed successfully."
}

function Get-GitHubLogin {
    $result = Capture-Native 'gh' @('api','user','--jq','.login') -AllowFailure
    if (($result[0] -ne 0) -or (-not $result[1].Trim())) { return '' }
    return $result[1].Trim()
}

function Get-RepoJson([string]$FullRepo) {
    $result = Capture-Native 'gh' @('api',"repos/$FullRepo",'--jq','{full_name:.full_name,html_url:.html_url,visibility:.visibility,default_branch:.default_branch}') -AllowFailure
    if (($result[0] -ne 0) -or (-not $result[1].Trim())) { return $null }
    try { return ($result[1] | ConvertFrom-Json) } catch { return $null }
}

function Wait-ForRepo([string]$FullRepo) {
    for ($i = 0; $i -lt 12; $i++) {
        $repo = Get-RepoJson $FullRepo
        if ($null -ne $repo) { return $repo }
        Start-Sleep -Seconds 2
    }
    return $null
}

function Wait-ForWorkflow([string]$FullRepo, [string]$WorkflowFile) {
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-NativeSuccess 'gh' @('workflow','view',$WorkflowFile,'-R',$FullRepo)) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Get-LatestRunId([string]$FullRepo, [string]$WorkflowFile, [string]$Branch) {
    for ($i = 0; $i -lt 20; $i++) {
        $result = Capture-Native 'gh' @('run','list','-R',$FullRepo,'--workflow',$WorkflowFile,'--branch',$Branch,'--limit','1','--json','databaseId','--jq','.[0].databaseId') -AllowFailure
        if (($result[0] -eq 0) -and $result[1].Trim()) { return $result[1].Trim() }
        Start-Sleep -Seconds 3
    }
    return ''
}

function Get-RunIdForCommit([string]$FullRepo, [string]$WorkflowFile, [string]$Branch, [string]$CommitSha, [int]$Attempts = 8) {
    if (-not $CommitSha) { return '' }
    $jq = '.[] | select(.headSha == "' + $CommitSha + '") | .databaseId'
    for ($i = 0; $i -lt $Attempts; $i++) {
        $result = Capture-Native 'gh' @('run','list','-R',$FullRepo,'--workflow',$WorkflowFile,'--branch',$Branch,'--limit','10','--json','databaseId,headSha,event,status,conclusion','--jq',$jq) -AllowFailure
        if (($result[0] -eq 0) -and $result[1].Trim()) {
            return (($result[1].Trim() -split "`n")[0]).Trim()
        }
        Start-Sleep -Seconds 2
    }
    return ''
}

function Confirm-Account([string]$Login) {
    if ($env:PL_CONFIRM_ACCOUNT -eq '0') { return }
    Write-Host ''
    Write-Step 'CHECK' "ACTIVE GITHUB ACCOUNT: $Login"
    Write-Step 'CHECK' "Profile: https://github.com/$Login"
    Write-Host ''
    $answer = Read-Host "Type YES to create/use the repository under '$Login'"
    if ($answer.Trim().ToUpperInvariant() -ne 'YES') {
        Fail "GitHub account was not confirmed: $Login" 'Run: gh auth status ; if needed run: gh auth switch ; then rerun github-bootstrap.cmd.'
    }
}

try {
    if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ResultPath) { Remove-Item $ResultPath -Force -ErrorAction SilentlyContinue }
    Start-Transcript -Path $LogPath -Force | Out-Null

    Write-Host '============================================================================'
    Write-Host 'PromptLife GitHub Bootstrap / Provisioning v10'
    Write-Host '============================================================================'
    Write-Step 'CHECK' "Project folder: $Root"

    $required = @('package.json','package-lock.json','index.html','src\main.js','.github\workflows\deploy.yml','scripts\build.mjs')
    foreach ($item in $required) {
        if (-not (Test-Path (Join-Path $Root $item))) {
            Fail "Required project file is missing: $item" 'Extract the complete ZIP into a normal folder before running github-bootstrap.cmd.'
        }
    }
    Write-Step 'OK' 'Project extraction looks complete.'

    Write-Host ''
    Write-Step 'CHECK' 'Required tools'
    Ensure-Tool 'git' 'Git.Git' 'Git'
    Ensure-Tool 'node' 'OpenJS.NodeJS.LTS' 'Node.js'
    Ensure-Tool 'gh' 'GitHub.cli' 'GitHub CLI'
    Refresh-Path

    Write-Step 'OK' ((& git --version) -join ' ')
    Write-Step 'OK' ('Node.js ' + ((& node --version) -join ' '))
    Write-Step 'OK' ('npm ' + ((& npm --version) -join ' '))
    Write-Step 'OK' ((& gh --version | Select-Object -First 1))

    Write-Host ''
    Write-Step 'CHECK' 'GitHub authentication'
    $authOk = Test-NativeSuccess 'gh' @('auth','status','--active','-h','github.com')
    if (-not $authOk) {
        Write-Step 'WARN' 'No active GitHub CLI account. Starting browser login.'
        Invoke-Native 'gh' @('auth','login','--hostname','github.com','--git-protocol','https','--web') | Out-Null
    }

    $GitHubLogin = Get-GitHubLogin
    if (-not $GitHubLogin) {
        Fail 'GitHub authentication is unavailable after login.' 'Run: gh auth login --hostname github.com --git-protocol https --web'
    }

    $ExpectedUser = if ($env:PL_EXPECTED_GITHUB_USER) { $env:PL_EXPECTED_GITHUB_USER.Trim() } else { '' }
    if ($ExpectedUser -and ($GitHubLogin -ine $ExpectedUser)) {
        Write-Step 'WARN' "Active account is '$GitHubLogin', but EXPECTED_GITHUB_USER is '$ExpectedUser'."
        $switchOk = Test-NativeSuccess 'gh' @('auth','switch','--hostname','github.com','--user',$ExpectedUser)
        if ($switchOk) { $GitHubLogin = Get-GitHubLogin }
        if ($GitHubLogin -ine $ExpectedUser) {
            Fail "Could not switch to expected GitHub account '$ExpectedUser'." "Run: gh auth status ; gh auth switch --hostname github.com --user $ExpectedUser"
        }
    }

    Write-Step 'OK' "Authenticated GitHub account: $GitHubLogin"
    Confirm-Account $GitHubLogin
    Invoke-Native 'gh' @('auth','setup-git','--hostname','github.com') -Quiet -AllowFailure | Out-Null

    Write-Host ''
    Write-Step 'CHECK' 'Local Git repository'
    if (-not (Test-Path (Join-Path $Root '.git'))) {
        Invoke-Native 'git' @('init') -Quiet | Out-Null
        Write-Step 'OK' 'Initialized local Git repository.'
    } else { Write-Step 'OK' 'Existing local Git repository detected.' }

    $Branch = if ($env:PL_DEFAULT_BRANCH) { $env:PL_DEFAULT_BRANCH } else { 'main' }
    Invoke-Native 'git' @('branch','-M',$Branch) -Quiet | Out-Null
    Write-Step 'OK' "Local branch: $Branch"

    $nameResult = Capture-Native 'git' @('config','user.name') -AllowFailure
    if (($nameResult[0] -ne 0) -or (-not $nameResult[1].Trim())) {
        Invoke-Native 'git' @('config','user.name',$GitHubLogin) -Quiet | Out-Null
        Write-Step 'WARN' "git user.name was missing; set locally to $GitHubLogin."
    } else { Write-Step 'OK' ('Git user.name: ' + $nameResult[1].Trim()) }

    $emailResult = Capture-Native 'git' @('config','user.email') -AllowFailure
    if (($emailResult[0] -ne 0) -or (-not $emailResult[1].Trim())) {
        $fallbackEmail = "$GitHubLogin@users.noreply.github.com"
        Invoke-Native 'git' @('config','user.email',$fallbackEmail) -Quiet | Out-Null
        Write-Step 'WARN' 'git user.email was missing; set locally to the GitHub noreply address.'
    } else { Write-Step 'OK' ('Git user.email: ' + $emailResult[1].Trim()) }

    $RepoOwner = if ($env:PL_REPO_OWNER) { $env:PL_REPO_OWNER } else { $GitHubLogin }
    $RepoName = if ($env:PL_REPO_NAME) { $env:PL_REPO_NAME } else { 'promptlife' }
    $Visibility = if ($env:PL_REPO_VISIBILITY) { $env:PL_REPO_VISIBILITY.ToLowerInvariant() } else { 'public' }
    $Description = if ($env:PL_REPO_DESCRIPTION) { $env:PL_REPO_DESCRIPTION } else { 'PromptLife WebGPU ecosystem simulator.' }
    $FullRepo = "$RepoOwner/$RepoName"
    if (@('public','private','internal') -notcontains $Visibility) {
        Fail "Invalid repository visibility: $Visibility" 'Set REPO_VISIBILITY to public, private, or internal at the top of github-bootstrap.cmd.'
    }

    Write-Host ''
    Write-Step 'CHECK' "TARGET REPOSITORY: https://github.com/$FullRepo"
    if ($RepoOwner -ine $GitHubLogin) {
        Write-Step 'WARN' "Repository owner differs from active account ($GitHubLogin). This only works if you can create repositories for $RepoOwner."
    }

    $DeployUrl = if ($env:PL_CUSTOM_DOMAIN) {
        "https://$($env:PL_CUSTOM_DOMAIN.TrimEnd('/'))/"
    } elseif ($RepoName -ieq "$RepoOwner.github.io") {
        "https://$RepoOwner.github.io/"
    } else {
        "https://$RepoOwner.github.io/$RepoName/"
    }

    if ($env:PL_CUSTOM_DOMAIN) {
        Set-Content -Path (Join-Path $Root 'public\CNAME') -Value $env:PL_CUSTOM_DOMAIN -Encoding ASCII
        Write-Step 'OK' "Custom domain prepared: $($env:PL_CUSTOM_DOMAIN)"
    }

    if (Test-Path (Join-Path $Root 'scripts\update-readme-deploy-url.ps1')) {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\update-readme-deploy-url.ps1') -Url $DeployUrl
        if ($LASTEXITCODE -ne 0) { Write-Step 'WARN' 'README deployment URL could not be updated automatically.' }
    }

    Write-Host ''
    Write-Step 'CHECK' 'GitHub repository creation / verification'
    $RepoInfo = Get-RepoJson $FullRepo
    if ($null -eq $RepoInfo) {
        Write-Step 'CHECK' "Repository does not exist yet. Creating $FullRepo as $Visibility..."
        $visibilityArg = "--$Visibility"
        Write-Step 'CHECK' ('Executing: gh repo create {0} {1} --description <configured text>' -f $FullRepo, $visibilityArg)
        Invoke-Native 'gh' @('repo','create',$FullRepo,$visibilityArg,'--description',$Description)
        $RepoInfo = Wait-ForRepo $FullRepo
        if ($null -eq $RepoInfo) {
            Fail "gh repo create returned, but GitHub API still cannot find $FullRepo." "Run: gh repo view $FullRepo --web ; or: gh api repos/$FullRepo"
        }
        Write-Step 'OK' 'Repository creation verified by GitHub API.'
    } else {
        Write-Step 'OK' 'Repository already exists and was verified by GitHub API.'
    }

    if ($RepoInfo.full_name -ine $FullRepo) {
        Fail "Repository verification returned a different repository: $($RepoInfo.full_name)" "Open: $($RepoInfo.html_url)"
    }
    $RepoUrl = $RepoInfo.html_url
    Write-Step 'OK' "VERIFIED REPOSITORY URL: $RepoUrl"

    $ExpectedRemote = "https://github.com/$FullRepo.git"
    $originResult = Capture-Native 'git' @('remote','get-url','origin') -AllowFailure
    if ($originResult[0] -ne 0) {
        Invoke-Native 'git' @('remote','add','origin',$ExpectedRemote) -Quiet | Out-Null
        Write-Step 'OK' "Added origin: $ExpectedRemote"
    } else {
        $currentOrigin = $originResult[1].Trim()
        if (($currentOrigin -notmatch [regex]::Escape("github.com/$FullRepo")) -and ($currentOrigin -ne $ExpectedRemote)) {
            Write-Step 'WARN' "Existing origin points elsewhere: $currentOrigin"
            Invoke-Native 'git' @('remote','set-url','origin',$ExpectedRemote) -Quiet | Out-Null
            Write-Step 'OK' "origin updated to: $ExpectedRemote"
        } else { Write-Step 'OK' "origin: $currentOrigin" }
    }

    Write-Host ''
    Write-Step 'CHECK' 'Dependencies, tests, and production build'
    Invoke-Native 'npm.cmd' @('ci') | Out-Null
    Write-Step 'OK' 'Dependencies ready.'
    Invoke-Native 'npm.cmd' @('test')
    Write-Step 'OK' 'Tests passed.'
    Invoke-Native 'npm.cmd' @('run','build')
    Write-Step 'OK' 'Production build passed.'

    Write-Host ''
    Write-Step 'CHECK' 'Remote history synchronization'
    $RemoteBranchExists = Test-NativeSuccess 'git' @('ls-remote','--exit-code','origin',"refs/heads/$Branch")
    if ($RemoteBranchExists) {
        Invoke-Native 'git' @('fetch','origin',$Branch,'--quiet') -Quiet | Out-Null
        Write-Step 'OK' "Fetched origin/$Branch."

        # Always anchor the local branch to the verified remote history while
        # leaving the extracted PromptLife files untouched in the working tree.
        # This handles both an unborn fresh repository and a previous failed
        # local root commit without force-pushing or losing the remote history.
        $HadLocalHead = Test-NativeSuccess 'git' @('rev-parse','--verify','HEAD')
        if ($HadLocalHead) {
            Invoke-Native 'git' @('branch','-f','bootstrap-local-backup','HEAD') -Quiet -AllowFailure | Out-Null
            Write-Step 'OK' 'Saved the previous local HEAD as bootstrap-local-backup.'
        }
        Invoke-Native 'git' @('reset','--mixed',"origin/$Branch") | Out-Null
        Write-Step 'OK' "Local $Branch is anchored to origin/$Branch; extracted PromptLife files remain in the working tree."
    } else {
        Write-Step 'OK' "Remote branch origin/$Branch does not exist yet."
    }

    Write-Host ''
    Write-Step 'CHECK' 'Commit current PromptLife files'
    Invoke-Native 'git' @('add','-A') -Quiet | Out-Null
    $HasHead = Test-NativeSuccess 'git' @('rev-parse','--verify','HEAD')
    $IndexClean = Test-NativeSuccess 'git' @('diff','--cached','--quiet')
    $HasChanges = -not $IndexClean
    if ($HasChanges) {
        $commitMessage = if ($HasHead) { 'feat: add zoom inspection and WebP export' } else { 'feat: launch PromptLife WebGPU evolution lab' }
        Invoke-Native 'git' @('commit','-m',$commitMessage) | Out-Null
        Write-Step 'OK' 'Current PromptLife files committed.'
    } elseif (-not $HasHead) {
        Fail 'No files are available for an initial commit.' 'Verify that the complete PromptLife project was extracted.'
    } else {
        Write-Step 'OK' 'Nothing new to commit; remote and extracted project already match.'
    }
    Write-Host ''
    Write-Step 'CHECK' "Pushing $Branch to GitHub"
    $pushCode = Invoke-Native 'git' @('push','-u','origin',$Branch) -AllowFailure
    if ($pushCode -ne 0) {
        Write-Step 'WARN' 'Push failed. Refreshing workflow permission and retrying once.'
        $refreshCode = Invoke-Native 'gh' @('auth','refresh','-h','github.com','-s','workflow') -AllowFailure
        if ($refreshCode -eq 0) { $pushCode = Invoke-Native 'git' @('push','-u','origin',$Branch) -AllowFailure }
        if ($pushCode -ne 0) {
            Fail 'Push failed.' "Run: gh auth refresh -h github.com -s workflow ; then: git push -u origin $Branch"
        }
    }

    $remoteHead = Capture-Native 'gh' @('api',"repos/$FullRepo/commits/$Branch",'--jq','.sha') -AllowFailure
    if (($remoteHead[0] -ne 0) -or (-not $remoteHead[1].Trim())) {
        Fail "Git push returned success, but GitHub API cannot find branch '$Branch'." "Open: $RepoUrl/branches"
    }
    Write-Step 'OK' "$Branch push verified by GitHub API. Remote commit: $($remoteHead[1].Trim().Substring(0,7))"

    if ($env:PL_UPLOAD_ONLY -eq '1') {
        $uploadResult = @(
            'PromptLife GitHub Upload SUCCESS',
            ('Timestamp: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')),
            ('GitHub account: ' + $GitHubLogin),
            ('Repository: ' + $RepoUrl),
            ('Branch: ' + $Branch),
            ('Remote commit: ' + $remoteHead[1].Trim())
        ) -join "`r`n"
        Set-Content -Path $ResultPath -Value $uploadResult -Encoding UTF8
        Write-Host ''
        Write-Host '============================================================================'
        Write-Step 'OK' 'UPLOAD-ONLY GITHUB VERIFICATION PASSED'
        Write-Step 'OK' "Repository : $RepoUrl"
        Write-Step 'OK' "Branch     : $Branch"
        Write-Step 'OK' "Result     : $ResultPath"
        Write-Host '============================================================================'
        if ($env:PL_OPEN_RESULT_IN_BROWSER -ne '0') {
            try { Start-Process $RepoUrl } catch { Write-Step 'WARN' 'Could not open the Repository in the browser automatically.' }
        }
        $global:LASTEXITCODE = 0
        return
    }

    Write-Host ''
    Write-Step 'CHECK' 'Repository metadata'
    $metaCode = Invoke-Native 'gh' @('repo','edit',$FullRepo,'--description',$Description,'--homepage',$DeployUrl,'--default-branch',$Branch) -AllowFailure
    if ($metaCode -ne 0) { Write-Step 'WARN' 'One or more repository metadata fields could not be applied.' }
    $topics = @()
    if ($env:PL_REPO_TOPICS) { $topics = $env:PL_REPO_TOPICS -split '\s+' }
    foreach ($topic in $topics) {
        if ($topic) {
            $topicOk = Test-NativeSuccess 'gh' @('repo','edit',$FullRepo,'--add-topic',$topic)
            if (-not $topicOk) { Write-Step 'WARN' "Topic could not be applied: $topic" }
        }
    }
    Write-Step 'OK' 'Repository metadata processed.'

    Write-Host ''
    Write-Step 'CHECK' 'GitHub Pages configuration'
    $pagesCheck = Capture-Native 'gh' @('api',"repos/$FullRepo/pages") -AllowFailure
    if ($pagesCheck[0] -ne 0) {
        $pagesCreate = Capture-Native 'gh' @('api','-X','POST',"repos/$FullRepo/pages",'-f','build_type=workflow') -AllowFailure
        if ($pagesCreate[0] -ne 0) {
            Write-Step 'WARN' 'Pages could not be enabled automatically. The workflow is still present.'
            Write-Step 'RECOVERY' "Open $RepoUrl/settings/pages and select GitHub Actions, then rerun this script."
        } else { Write-Step 'OK' 'GitHub Pages enabled with GitHub Actions publishing.' }
    } else {
        $pagesUpdate = Capture-Native 'gh' @('api','-X','PUT',"repos/$FullRepo/pages",'-f','build_type=workflow') -AllowFailure
        if ($pagesUpdate[0] -eq 0) { Write-Step 'OK' 'Existing Pages site confirmed with workflow publishing.' }
        else { Write-Step 'WARN' 'Existing Pages site was found, but build_type could not be updated automatically.' }
    }

    Write-Host ''
    Write-Step 'CHECK' 'GitHub Actions deployment workflow'
    if (-not (Wait-ForWorkflow $FullRepo 'deploy.yml')) {
        Fail 'GitHub has not indexed deploy.yml yet.' "Open $RepoUrl/actions and rerun github-bootstrap.cmd."
    }
    Write-Step 'OK' 'deploy.yml is visible to GitHub Actions.'

    $workflowEnableOk = Test-NativeSuccess 'gh' @('workflow','enable','deploy.yml','-R',$FullRepo)
    if ($workflowEnableOk) { Write-Step 'OK' 'deploy.yml workflow enabled.' }
    else { Write-Step 'WARN' 'Workflow enable was not accepted; it may already be enabled.' }

    # A push to main already triggers deploy.yml. Do not immediately dispatch a
    # second workflow because Pages concurrency can cancel the first run. First
    # locate the run for the exact commit that we just verified on GitHub.
    $CurrentSha = $remoteHead[1].Trim()
    $RunId = Get-RunIdForCommit $FullRepo 'deploy.yml' $Branch $CurrentSha 8
    if ($RunId) {
        Write-Step 'OK' "Push-triggered deployment found for commit $($CurrentSha.Substring(0,7)); no duplicate dispatch needed."
    } else {
        Write-Step 'CHECK' 'No push-triggered run found yet; dispatching deploy.yml once.'
        $workflowRun = Invoke-Native 'gh' @('workflow','run','deploy.yml','-R',$FullRepo,'--ref',$Branch) -AllowFailure
        if ($workflowRun -eq 0) { Write-Step 'OK' 'Deployment workflow dispatched.' }
        else { Write-Step 'WARN' 'Explicit dispatch was not accepted; checking existing runs once more.' }
        $RunId = Get-RunIdForCommit $FullRepo 'deploy.yml' $Branch $CurrentSha 12
    }

    if (-not $RunId) {
        $RunId = Get-LatestRunId $FullRepo 'deploy.yml' $Branch
    }
    if (-not $RunId) {
        Fail 'No deployment workflow run could be found.' "Open $RepoUrl/actions/workflows/deploy.yml"
    }
    Write-Step 'OK' "Deployment run ID: $RunId"

    $DeployOk = $false
    if ($env:PL_WAIT_FOR_DEPLOY -ne '0') {
        Write-Step 'CHECK' 'Waiting for GitHub Pages deployment result...'
        $watchCode = Invoke-Native 'gh' @('run','watch',$RunId,'-R',$FullRepo,'--exit-status') -AllowFailure
        if ($watchCode -ne 0) {
            Fail 'Deployment workflow failed.' "Run: gh run view $RunId -R $FullRepo --log-failed"
        }
        $DeployOk = $true
        Write-Step 'OK' 'GitHub Actions deployment completed successfully.'
    } else { Write-Step 'WARN' 'WAIT_FOR_DEPLOY=0; deployment was started but not awaited.' }

    $pagesResult = Capture-Native 'gh' @('api',"repos/$FullRepo/pages",'--jq','.html_url') -AllowFailure
    if (($pagesResult[0] -eq 0) -and $pagesResult[1].Trim()) { $DeployUrl = $pagesResult[1].Trim() }
    Test-NativeSuccess 'gh' @('repo','edit',$FullRepo,'--homepage',$DeployUrl) | Out-Null

    if ($DeployOk) {
        Write-Host ''
        Write-Step 'CHECK' 'Initial tag and release'
        $Tag = if ($env:PL_RELEASE_TAG) { $env:PL_RELEASE_TAG } else { 'v1.0.0' }
        $remoteTagExists = Test-NativeSuccess 'git' @('ls-remote','--exit-code','--tags','origin',"refs/tags/$Tag")
        if (-not $remoteTagExists) {
            $localTagExists = Test-NativeSuccess 'git' @('rev-parse',"refs/tags/$Tag")
            if (-not $localTagExists) { Invoke-Native 'git' @('tag','-a',$Tag,'-m',"PromptLife $Tag") | Out-Null }
            Invoke-Native 'git' @('push','origin',$Tag) | Out-Null
            Write-Step 'OK' "Tag $Tag pushed."
        } else { Write-Step 'OK' "Tag $Tag already exists; creation skipped." }

        $releaseCheck = Capture-Native 'gh' @('release','view',$Tag,'-R',$FullRepo) -AllowFailure
        if ($releaseCheck[0] -ne 0) {
            $releaseCode = Invoke-Native 'gh' @('release','create',$Tag,'-R',$FullRepo,'--title',"PromptLife $Tag",'--notes','PromptLife release: prompt-driven WebGPU ecosystem simulation, zoom inspection, WebP export, Mutation, God Mode, and AI Scientist log analysis.') -AllowFailure
            if ($releaseCode -eq 0) { Write-Step 'OK' "GitHub Release $Tag created." }
            else { Write-Step 'WARN' "Release creation failed. Recovery: gh release create $Tag -R $FullRepo --generate-notes" }
        } else { Write-Step 'OK' "GitHub Release $Tag already exists; creation skipped." }
    }

    # FINAL HARD VERIFICATION. Do not report success unless GitHub returns the repository now.
    $FinalRepo = Get-RepoJson $FullRepo
    if ($null -eq $FinalRepo) {
        Fail "Final verification failed: GitHub API cannot find $FullRepo." "Run: gh api repos/$FullRepo ; gh auth status --active -h github.com"
    }

    $resultText = @(
        'PromptLife GitHub Bootstrap SUCCESS',
        ('Timestamp: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')),
        ('GitHub account: ' + $GitHubLogin),
        ('Repository: ' + $FinalRepo.html_url),
        ('Repository full name: ' + $FinalRepo.full_name),
        ('Visibility: ' + $FinalRepo.visibility),
        ('Branch: ' + $Branch),
        ('Deployment: ' + $DeployUrl),
        ('Actions: ' + $FinalRepo.html_url + '/actions/workflows/deploy.yml'),
        ('Log: ' + $LogPath)
    ) -join "`r`n"
    Set-Content -Path $ResultPath -Value $resultText -Encoding UTF8

    Write-Host ''
    Write-Host '============================================================================'
    Write-Step 'OK' 'FINAL GITHUB API VERIFICATION PASSED'
    Write-Step 'OK' "GitHub account : $GitHubLogin"
    Write-Step 'OK' "Repository     : $($FinalRepo.html_url)"
    Write-Step 'OK' "Deployment     : $DeployUrl"
    Write-Step 'OK' "Result file    : $ResultPath"
    Write-Step 'OK' "Diagnostic log : $LogPath"
    Write-Host '============================================================================'

    if ($env:PL_OPEN_RESULT_IN_BROWSER -ne '0') {
        try {
            Start-Process $FinalRepo.html_url
            if ($DeployOk) { Start-Sleep -Seconds 1; Start-Process $DeployUrl }
            Write-Step 'OK' 'Opened the verified Repository in your browser.'
        } catch { Write-Step 'WARN' 'Could not open the browser automatically.' }
    }

    Write-Host 'You can safely run github-bootstrap.cmd again; existing resources are reused.'
    $global:LASTEXITCODE = 0
}
catch {
    Write-Host ''
    Write-Host '============================================================================'
    Write-Step 'ERROR' $_.Exception.Message
    Write-Step 'ERROR' "Full diagnostic log: $LogPath"
    Write-Step 'RECOVERY' 'Fix the reported step, then rerun github-bootstrap.cmd. Existing GitHub resources will be reused.'
    Write-Host '============================================================================'
    $global:LASTEXITCODE = 1
}
finally {
    try { Stop-Transcript | Out-Null } catch { }
}

exit $global:LASTEXITCODE
