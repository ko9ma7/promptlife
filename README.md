# PromptLife

**말 한 줄로 생태계를 만들고 브라우저 안에서 진화시키는 WebGPU 실험실.**

PromptLife는 자연어로 적은 생명체 성향을 수치 규칙으로 컴파일하고, 브라우저에서 수천~수만 개체가 이동·먹이 경쟁·포식·번식·돌연변이를 반복하도록 만든 로컬 우선 생태계 시뮬레이터입니다.

<!-- deployment-url:start -->
**Live:** https://ko9ma7.github.io/promptlife/
<!-- deployment-url:end -->

## Preview

첫 화면은 실제 시뮬레이션 캔버스, 실시간 Population 패널, Mutation, God Mode, AI Scientist를 하나의 실험실 UI로 구성합니다. WebGPU가 가능한 브라우저에서는 개체 이동과 에너지 갱신을 WGSL compute shader로 수행하고, 지원되지 않는 환경에서는 동일한 규칙의 CPU fallback을 사용합니다.

- 서비스/SNS 미리보기: `public/og-image.png` (1200×630)
- GitHub Repository Social Preview: `public/repo-preview.png` (1280×640)

## Features

- 자연어 Creature Prompt → 행동 규칙 JSON 컴파일
- 속도·시야·빛 선호·군집 회피·공격성·번식률을 실제 simulation 파라미터에 반영
- WebGPU/WGSL compute 기반 agent movement / energy simulation
- 최대 50,000 agent 슬롯
- Blue/Red population, food, generation, extinction, dominant trait 실시간 통계
- 번식·수명·에너지·포식 압력에 따른 개체수 변화
- Mutation: 속도/시야/번식률/크기/수명/색상 중 개체 단위 랜덤 변이
- 캔버스 휠 확대, 드래그 이동, 클릭 기반 개체 Inspect
- 선택 개체 중심 확대 및 실시간 개체 상세 정보 표시
- 현재 보기 / 확대 보기 / 색상 분리 결과를 WEBP 이미지로 저장
- God Mode: 빙하기, 포식자 투입, 물 의존성, 야간 Red-only 명령
- AI Scientist: 실제 snapshot/event log를 기반으로 개체수 변화 원인 설명
- LocalStorage 기반 Prompt 보존
- 모바일/태블릿/데스크톱 반응형 UI
- WebGPU 미지원 환경 CPU fallback
- GitHub Pages + GitHub Actions 자동 배포
- Windows 10/11 `github-bootstrap.cmd` 원클릭 Repository/Pages provisioning

## Architecture

```text
Natural language
  ↓
Local Rule Compiler
  ↓
Species / World Rules
  ↓
WebGPU WGSL Compute (movement + energy)
  ↓
Ecology Tick (predation + birth + death + mutation)
  ↓
Canvas visualization + Stats + Event Log
  ↓
AI Scientist local log analysis
```

API Key는 프론트엔드에 포함하지 않습니다. 기본 기능은 네트워크 없이 동작합니다. 실제 LLM을 연결할 때는 별도 Serverless Proxy를 두고 `자연어 → 규칙 JSON`, `로그 → 분석문` 단계만 외부 모델에 위임하는 구조를 권장합니다.

## Tech Stack

- HTML5 / CSS3
- JavaScript ES Modules
- WebGPU / WGSL compute shader
- Canvas 2D visualization
- Client-side WEBP export
- LocalStorage
- Node.js zero-dependency build/test scripts
- GitHub Pages + GitHub Actions
- GitHub CLI (`gh`) — Windows bootstrap에서 Repository/Pages/Release provisioning

외부 UI/runtime dependency가 없어 GitHub Pages에서 asset 경로와 dependency 공급망을 단순하게 유지합니다.

## Project Structure

```text
promptlife/
├─ .github/
│  ├─ workflows/deploy.yml
│  └─ REPOSITORY_METADATA.md
├─ public/
│  ├─ favicon.ico
│  ├─ favicon.svg
│  ├─ favicon-32x32.png
│  ├─ apple-touch-icon.png
│  ├─ icon-192.png
│  ├─ icon-512.png
│  ├─ og-image.png
│  ├─ repo-preview.png
│  ├─ site.webmanifest
│  ├─ manifest.webmanifest
│  ├─ robots.txt
│  └─ 404.html
├─ src/
│  ├─ rules/compiler.js
│  ├─ scientist/analyzer.js
│  ├─ simulation/engine.js
│  ├─ main.js
│  └─ styles.css
├─ scripts/
│  ├─ build.mjs
│  ├─ check.mjs
│  ├─ dev.mjs
│  └─ update-readme-deploy-url.ps1
├─ .gitattributes
├─ .gitignore
├─ .nojekyll
├─ github-bootstrap.cmd
├─ index.html
├─ LICENSE
├─ package-lock.json
├─ package.json
└─ README.md
```

## Local Development

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:5173/`입니다. dependency가 없기 때문에 `npm install`은 lockfile 검증/생성 용도이며 외부 runtime package 설치가 필요하지 않습니다.

## Test

```bash
npm test
```

필수 자산, JavaScript syntax, HTML 브랜딩 metadata를 검증합니다.

## Build

```bash
npm run build
```

`dist/` 폴더가 생성됩니다. HTML에서 runtime asset을 상대경로로 참조하므로 `https://USERNAME.github.io/REPOSITORY/` 같은 repository 하위 경로에서도 동작합니다.

배포 URL을 알고 있는 환경에서는 canonical/OG URL과 sitemap을 함께 생성할 수 있습니다.

```bash
SITE_URL=https://USERNAME.github.io/REPOSITORY/ npm run build
```

Windows `cmd.exe`에서는:

```cmd
set SITE_URL=https://USERNAME.github.io/REPOSITORY/
npm run build
```

## Bootstrap v6 repair notes

- v5의 PowerShell `--description` 로그 문자열 파서 오류를 수정했습니다.
- 원격 `main`에 기존 commit이 있어 `fetch first`로 push가 거절되는 경우를 자동 처리합니다.
- 새 폴더에서는 `origin/main`을 먼저 local HEAD 기준으로 잡고 현재 프로젝트 파일을 그 위에 commit합니다.
- 이전 실패로 별도 local root commit이 생긴 폴더에서는 `force push` 대신 `ours` merge commit으로 원격 history를 parent로 보존합니다.
- 빠른 업로드만 필요하면 `github-upload-now.cmd`를 실행하고, 성공 후 `github-bootstrap.cmd`로 Pages/Actions/Release를 이어서 설정할 수 있습니다.

## Windows GitHub Upload v8

가장 먼저 `github-upload-now.cmd`를 실행하는 것을 권장합니다. v8의 이 파일은 PowerShell provisioning helper를 사용하지 않고 **GitHub Repository 확인 → 원격 main fetch → 현재 프로젝트 파일 commit → push → GitHub API 검증**만 수행하는 최소 업로더입니다. 기존 원격 `main`이 있으면 그 commit을 기준으로 현재 파일을 새 commit으로 올리며 force-push하지 않습니다.

```cmd
github-upload-now.cmd
```

업로드가 `[OK] UPLOAD VERIFIED SUCCESSFULLY`로 끝난 뒤 전체 Pages/Release 설정이 필요하면 `github-bootstrap.cmd`를 실행합니다.

## Windows One-click GitHub Bootstrap

> v1.1.1 fixes Windows Node syntax-check paths by converting file URLs with `fileURLToPath()`, avoiding invalid paths such as `C:\C:\...`.

Windows 10/11에서는 프로젝트 폴더의 다음 파일을 실행합니다.

```cmd
github-bootstrap.cmd
```

기본 설정은 파일 최상단에 모여 있습니다.

```cmd
set "REPO_NAME=promptlife"
set "REPO_OWNER="
set "REPO_VISIBILITY=public"
set "DEFAULT_BRANCH=main"
set "RELEASE_TAG=v1.1.0"
set "CUSTOM_DOMAIN="
set "AUTO_INSTALL_TOOLS=1"
set "USE_EXISTING_ORIGIN=1"
set "WAIT_FOR_DEPLOY=1"
```

`REPO_OWNER`를 비워두면 현재 `gh` 로그인 계정을 사용합니다. 기본 공개 범위는 `public`입니다. `private` Pages 사용 가능 여부는 GitHub 플랜에 따라 달라질 수 있습니다.

Bootstrap v6는 기존 원격 `main` 이력이 있으면 이를 먼저 가져와 현재 프로젝트를 그 이력 위에 커밋합니다. 이전 실패로 로컬에 별도 root commit이 생긴 경우에도 force-push하지 않고 원격 commit을 merge parent로 보존합니다.

Bootstrap은 다음 작업을 순서대로 수행합니다.

1. Git / Node.js / npm / GitHub CLI 확인
2. 누락 도구를 `winget`으로 자동 설치 (`AUTO_INSTALL_TOOLS=1`)
3. `gh auth status` 확인 후 필요 시 브라우저 로그인 시작
4. Git Repository 초기화 및 `main` 설정
5. Git 사용자 이름/이메일 확인; 없으면 repository-local 값 설정
6. 기존 `origin`/Repository가 있으면 재사용
7. `npm ci → npm test → npm run build`
8. Conventional Commit 방식으로 변경사항 commit
9. GitHub Repository가 없으면 생성
10. `origin` 연결 및 `main` push
11. Description / Homepage / Topics / default branch 설정
12. GitHub Pages를 `workflow` 방식으로 활성화
13. `deploy.yml` 활성화 및 `workflow_dispatch`
14. 최신 Actions run을 찾아 `gh run watch --exit-status`로 완료 확인
15. 실제 Pages URL 조회 및 최종 출력
16. 배포 성공 시 `v1.0.0` tag와 GitHub Release 생성

이미 Repository, remote, 설정, tag 또는 release가 존재하면 중복 생성하지 않습니다. 원격 Git history가 로컬과 다르면 먼저 안전한 rebase를 시도하며, 자동 해결이 불가능할 때는 force-push하지 않고 복구 명령을 보여줍니다.

### Bootstrap 기본 Repository metadata

- **Repository:** `promptlife`
- **Visibility:** `public`
- **Description:** `Prompt-driven WebGPU artificial-life ecosystem simulator with mutation, God Mode, and simulation-log analysis.`
- **Default branch:** `main`
- **Initial commit:** `feat: launch PromptLife WebGPU evolution lab`
- **Initial tag/release:** `v1.1.0`
- **Topics:** `webgpu`, `simulation`, `artificial-life`, `evolution`, `ecosystem`, `javascript`, `canvas`, `github-pages`

동일 값은 `.github/REPOSITORY_METADATA.md`에도 정리되어 있습니다.

## Manual GitHub Pages Deployment

Bootstrap을 사용하지 않는 경우:

1. Repository에 `main` branch를 push합니다.
2. **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. `.github/workflows/deploy.yml`이 `npm ci → npm test → npm run build → configure-pages → upload-pages-artifact → deploy-pages`를 실행합니다.
4. workflow는 Repository 이름과 `public/CNAME`을 기준으로 `SITE_URL`을 자동 결정합니다.
5. 배포 완료 후 `https://USERNAME.github.io/REPOSITORY/`에서 사용할 수 있습니다.

## GitHub Repository Setup

Repository Social Preview에는 `public/repo-preview.png`를 업로드하세요.

- **Settings → General → Social preview → Edit → Upload an image**

Bootstrap이 Description, Homepage, Topics, default branch를 자동 적용합니다. Social Preview 이미지 업로드는 GitHub 웹 UI에서 수행해야 합니다.

## Configuration

- 초기 개체수: UI slider 1,000~30,000
- 엔진 최대 슬롯: `src/simulation/engine.js`의 `MAX_AGENTS = 50000`
- 기본 Creature / World Rule: `src/rules/compiler.js`
- 색상/spacing/radius: `src/styles.css`의 `:root`
- Bootstrap Repository 설정: `github-bootstrap.cmd` 상단 변수

## Custom Domain

`github-bootstrap.cmd`의 `CUSTOM_DOMAIN`에 도메인을 지정하면 `public/CNAME`을 자동 생성하고 Homepage/빌드 URL을 해당 HTTPS 도메인으로 설정합니다.

수동 설정 시 `public/CNAME`에 도메인을 한 줄로 기록하고 GitHub Pages의 **Custom domain**에 동일 도메인을 등록한 뒤 DNS를 연결하세요. 인증서가 준비되면 **Enforce HTTPS**를 활성화합니다.

## Browser Support

WebGPU 지원 브라우저에서는 GPU compute가 활성화됩니다. 그 외 환경에서는 CPU fallback으로 전환됩니다. 실제 50,000개체 처리량은 기기 GPU/브라우저/해상도에 따라 달라질 수 있습니다.

## License

MIT License. `LICENSE` 파일을 참고하세요.


## Windows Bootstrap troubleshooting

`github-bootstrap.cmd`는 ZIP 내부에서 바로 실행하지 마세요. 먼저 `promptlife.zip`을 **모두 압축 해제**한 뒤, `package.json`, `src`, `scripts`, `.github` 폴더와 같은 위치에 있는 `github-bootstrap.cmd`를 실행해야 합니다.

새 bootstrap은 성공/실패와 관계없이 마지막에 키 입력을 기다리므로 더블클릭 실행에서도 창이 자동으로 사라지지 않습니다. 전체 실행 기록은 프로젝트 루트의 `bootstrap-last.log`에 저장됩니다.

로그인 후 중단될 경우 가장 먼저 `bootstrap-last.log`의 마지막 `[ERROR]` 또는 `[RECOVERY]` 줄을 확인하세요. 다시 실행해도 이미 생성된 Repository, origin, Pages 설정, tag, release는 중복 생성하지 않고 재사용합니다.

## Windows GitHub Bootstrap v3

Use `github-bootstrap.cmd` from the fully extracted project folder. The v3 bootstrap does not report success merely because a command returned exit code 0: it verifies the exact repository again through the GitHub API, verifies that the `main` branch is visible remotely, then writes `bootstrap-result.txt` with the authenticated GitHub account, verified repository URL, Pages URL, Actions URL, and diagnostic log path.

During startup, the script displays the active GitHub CLI account and requires typing `YES` before it creates or reuses `ACCOUNT/promptlife`. If you use multiple GitHub accounts, set `EXPECTED_GITHUB_USER` at the top of `github-bootstrap.cmd` or switch accounts with `gh auth switch`.

If you only want to diagnose the previous bootstrap attempt, run `github-diagnose.cmd`. It checks the active GitHub CLI account and queries `ACCOUNT/promptlife` directly through the GitHub API.

Generated local diagnostic files `bootstrap-last.log` and `bootstrap-result.txt` are ignored by Git.

## Windows bootstrap v4 hotfix

If an older bootstrap stopped at `gh: Not Found (HTTP 404)` immediately after **GitHub repository creation / verification**, that was a bootstrap bug: a missing repository is supposed to return 404 before creation. v4 treats that condition as "create the repository" instead of a fatal PowerShell error.

For the shortest recovery path, run `github-upload-now.cmd` first. It only creates/verifies the GitHub repository and pushes `main`. After that succeeds, run `github-bootstrap.cmd` to configure Pages, Actions, metadata, and the initial release.
