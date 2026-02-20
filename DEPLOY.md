# 🧠 MindMap 무료 배포 가이드 (Render)

이 가이드는 현재까지 개발된 마인드맵 프로젝트를 **Render** 플랫폼을 사용하여 무료로 배포하는 방법을 안내합니다.

## 1. 전제 조건
- **GitHub 계정**: 코드를 업로드할 저장소가 필요합니다.
- **Render 계정**: [render.com](https://render.com/)에서 가입하세요.

## 2. 코드 업로드
현재 로컬 프로젝트 파일들을 하나의 GitHub 저장소에 푸시하세요.
- 루트 폴더에 `package.json`, `frontend/`, `backend/`가 모두 포함되어 있어야 합니다.

## 3. PostgreSQL 데이터베이스 생성
1. Render 대시보드에서 **New +** -> **PostgreSQL** 선택.
2. Name: `mindmap-db` (원하는 이름).
3. Region: `Singapore` (또는 가까운 위치).
4. `Create Database` 버튼 클릭.
5. 생성 완료 후 **Internal Database URL** 또는 **External Database URL**을 복사해 두세요.

## 4. 웹 서비스 배포
1. Render 대시보드에서 **New +** -> **Web Service** 선택.
2. 앞서 생성한 GitHub 저장소 연결.
3. 배포 설정:
   - **Name**: `my-mindmap` (원하는 이름).
   - **Region**: DB와 같은 위치.
   - **Runtime**: `Node`.
   - **Build Command**: (기본값 또는 생략 가능, 루트 `package.json`이 자동 인식됨).
   - **Start Command**: `npm start`.
4. **Environment Variables** (중요!):
   - `DATABASE_URL`: 복사해 둔 PostgreSQL URL 붙여넣기.
   - `JWT_SECRET`: 자신만의 보안 키 문자열 (예: `super-secret-key-1234`).
5. `Create Web Service` 클릭.

## 5. 확인
배포가 완료되면 Render에서 제공하는 URL(예: `https://my-mindmap.onrender.com`)로 접속할 수 있습니다!
초기 계정은 `admin / 1234`로 생성됩니다.

---
> [!NOTE]
> Render 무료 티어는 15분 이상 요청이 없으면 서버가 잠자기 모드로 들어갑니다. 다시 접속할 때 약 30초 정도의 로딩 시간이 걸릴 수 있습니다.
