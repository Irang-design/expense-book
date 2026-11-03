# 차곡 — 개인 가계부

HTML/CSS/JavaScript + Node.js/Express + Neon PostgreSQL 개인 가계부입니다. 지출 CRUD, 날짜별 검색, 월별 총액과 카테고리 합계·막대그래프를 제공합니다. 모든 지출은 Neon에 저장하며 SQLite/localStorage를 사용하지 않습니다.

## 로컬 실행

Node.js 22 이상을 설치한 뒤 실행하세요. Windows PowerShell에서 npm 스크립트 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

```sh
npm install
```

`.env.example`을 `.env`로 복사하고 다음 두 값을 **로컬 파일에서 직접** 설정합니다. 비밀 값을 채팅이나 GitHub 소스에 붙여 넣지 마세요.

```dotenv
DATABASE_URL=Neon에서 발급받은 PostgreSQL 연결 문자열
APP_PASSWORD=길고_추측하기_어려운_개인_비밀번호
PORT=3000
```

Neon 콘솔에서 프로젝트를 만들고 Connect에서 `sslmode=require`가 포함된 연결 문자열을 복사하세요. 데이터베이스 사용자는 테이블 생성 권한이 필요합니다. 첫 인증된 데이터 요청에서 `expenses` 테이블이 자동 생성되며 기존 데이터는 유지됩니다.

```sh
npm run dev
# 또는 npm start
```

http://localhost:3000 에서 APP_PASSWORD로 로그인하세요. 환경변수가 없어도 서버는 열리지만 로그인 또는 데이터 API는 설정 안내 오류를 반환합니다. 샘플 지출을 생성하거나 다른 저장소로 대체하지 않습니다.

## GitHub + Vercel 배포

1. GitHub에 빈 저장소를 만들고 이 프로젝트를 푸시합니다. `.env`와 `node_modules`는 제외됩니다.
   ```sh
   git init
   git add .
   git commit -m "Build personal expense book"
   git branch -M main
   git remote add origin https://github.com/YOUR_ACCOUNT/expense-book.git
   git push -u origin main
   ```
2. Vercel에서 **Add New → Project → 해당 GitHub 저장소**를 가져옵니다. 프로젝트 루트가 이 폴더인지 확인합니다. Express 자동 감지 및 `server.js` 기본 export를 사용하며 별도 프런트엔드 빌드는 없습니다.
3. Vercel 프로젝트의 Environment Variables에 `DATABASE_URL`과 `APP_PASSWORD`를 등록합니다. 프로덕션/프리뷰 환경을 필요한 대로 선택합니다. 프리뷰에서 운영 DB에 접근시키고 싶지 않다면 별도 Neon 브랜치를 사용하세요.
4. Deploy를 실행합니다. 변수 변경 뒤에는 재배포하세요. 이후 GitHub main 브랜치 푸시가 배포에 반영됩니다.

Vercel은 `server.js`의 Express 앱을 서버리스 함수로 실행합니다. DB는 Neon HTTP 드라이버로 연결하며 로컬 디스크에 의존하지 않습니다. `public/`의 정적 자산도 Express로 제공합니다.

## 동작 및 보안

- 월 선택은 월 전체 통계를 갱신합니다. 날짜 검색은 내역 목록에만 적용되며 합계와 그래프는 선택한 월 전체 기준입니다.
- 금액은 1~999,999,999,999원의 정수, 항목은 1~100자입니다. 날짜와 카테고리를 서버에서 검증하고 SQL은 매개변수 쿼리를 사용합니다.
- 인증 쿠키는 HMAC 서명, 8시간 만료, HttpOnly, SameSite=Strict를 사용합니다. Vercel/프로덕션에서는 Secure도 적용됩니다. APP_PASSWORD를 바꾸면 기존 인증 쿠키가 무효화됩니다.
- 로그아웃은 해당 브라우저 쿠키를 삭제합니다. 복사된 쿠키를 개별 서버 폐기하는 기능은 없으며 비밀번호 변경으로 모든 기존 쿠키를 무효화할 수 있습니다.
- 로그인은 인스턴스당 15분 10회로 제한합니다. 서버리스 다중 인스턴스 전체에 걸친 강제 제한이 필요하면 공유 저장소 기반 제한이나 Vercel 방화벽 규칙을 추가하세요.
- 변경 요청은 교차 출처를 차단합니다. API는 인증을 요구하며 응답 캐시를 끕니다. 오류 응답에 접속 정보나 DB 오류 원문을 노출하지 않습니다.
- 비밀 파일은 정적 제공 폴더 밖에 두며 `.gitignore`로 제외합니다. 클라이언트 코드에는 환경변수를 주입하지 않습니다.
- 단일 개인 비밀번호 방식으로, 다중 사용자 계정 분리는 제공하지 않습니다.

## 검증

```sh
npm test
```

실제 Neon CRUD까지 확인하려면 서버가 실행된 상태에서 `node scripts/check-live.js`를 실행하세요. 검증용 내역 한 건을 생성하고 삭제하므로 실제 DB에 쓰기 권한이 필요합니다.

테스트는 실제 DB를 변경하지 않고 날짜/금액 검증, 인증 실패·성공, 쿠키 변조, 미인증 차단, 교차 출처 차단, 비밀 파일 비공개, DB 미설정 오류를 확인합니다. 실제 Neon 연결 및 CRUD 영속성은 `.env` 설정 후 브라우저에서 추가 → 새로고침 → 수정 → 삭제로 확인하세요.

공식 참고: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [Neon 서버리스 드라이버](https://github.com/neondatabase/serverless).
