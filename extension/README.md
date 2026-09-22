# oh-my-paper Connector

논문 사이트에서 링크를 클릭하면 브라우저 내장 PDF 뷰어 대신 로컬 oh-my-paper
리더로 이동하는 크롬 확장입니다.

## 동작 방식

1. **사이트 링크 가로채기** (`content.js`) — 지원 사이트에서 논문/PDF 링크
   클릭을 잡아 백그라운드로 전달합니다. Cmd/Ctrl/Shift 클릭은 가로채지
   않아 사이트에서 새 탭으로 열 수 있습니다.
   - arXiv: `/abs/`, `/pdf/`, `/html/` 링크
   - OpenReview: `/forum?id=`, `/pdf?id=` 링크
   - ACL Anthology: 논문 페이지(`2024.acl-long.1` 등)와 `.pdf` 링크
   - Semantic Scholar: `/paper/` 링크와 외부 `.pdf` 링크
2. **확장 내부 다운로드 + 업로드** (`background.js`) — 랜딩 링크는 확장 안에서
   PDF URL로 해석한 뒤 **브라우저 세션 그대로** 내려받습니다(쿠키·챌린지
   통과 — OpenReview처럼 서버 fetch를 막는 사이트도 동작). 받은 바이트를
   `POST /api/documents`로 서버에 올리고 탭을 `/?doc=<id>`로 이동합니다.
3. **PDF 응답 가로채기** — 어느 사이트든 탭이 `application/pdf` 응답을
   받으면 같은 다운로드+업로드 경로로 보냅니다.
4. **서버 측 `/open?url=`** — 확장이 해석하지 못하는 랜딩 링크(Semantic
   Scholar 논문 페이지 등)와 확장 없이 직접 여는 경우의 경로. 서버가
   사이트별 규칙 + S2 openAccessPdf API로 PDF를 해석·다운로드·임포트하고
   앱이 문서를 엽니다. 확장 측 다운로드가 실패해도 이 경로로 폴백합니다.

## 설치

1. 로컬 서버가 떠 있어야 합니다 (`npm run start:web`, 포트는
   `OH_MY_PAPER_WEB_PORT`로 결정 — 기본값 8788).
2. `chrome://extensions` → 우측 상단 **개발자 모드** 켜기.
3. **압축해제된 확장 프로그램을 로드** → 이 `extension/` 폴더를 선택.

## 포트 변경

서버를 다른 포트로 띄우면 `background.js` 맨 위의 `APP_ORIGIN`을 바꿔주세요.
(`content.js`는 포트를 쓰지 않습니다.)
