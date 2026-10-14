# oh-my-paper Connector

논문 사이트에서 링크를 누르면 브라우저에서 볼지 로컬 oh-my-paper 리더에서
볼지 고르게 해 주는 크롬 확장입니다. 고르기 전에는 아무 데로도 이동하지
않습니다.

## 동작 방식

1. **링크 옆 선택 창** (`content.js`, `chooser.js`) — 지원 사이트에서
   논문/PDF 링크를 누르면 링크 옆에 **oh-my-paper에서 열기**와 **여기서
   열기**가 뜹니다. 여기서 열기는 원래 클릭대로 이동하고, Esc나 바깥을
   누르면 그냥 닫힙니다. Cmd/Ctrl/Shift 클릭은 가로채지 않아 사이트에서 새
   탭으로 열 수 있습니다.
   - arXiv: `/abs/`, `/pdf/`, `/html/` 링크
   - OpenReview: `/forum?id=`, `/pdf?id=` 링크
   - ACL Anthology: 논문 페이지(`2024.acl-long.1` 등)와 `.pdf` 링크
   - Semantic Scholar: `/paper/` 링크와 외부 `.pdf` 링크
2. **확장 내부 다운로드 + 업로드** (`background.js`) — 랜딩 링크는 확장 안에서
   PDF URL로 해석한 뒤 **브라우저 세션 그대로** 내려받습니다(쿠키·챌린지
   통과 — OpenReview처럼 서버 fetch를 막는 사이트도 동작). 받은 바이트를
   `POST /api/documents`로 서버에 올리고 탭을 `/?doc=<id>`로 이동합니다.
3. **PDF 탭의 버튼** — 어느 사이트든 탭이 PDF를 열면 브라우저 뷰어에 그대로
   두고, 오른쪽 아래에 **oh-my-paper에서 열기** 버튼을 띄웁니다. 누를 때만
   같은 다운로드+업로드 경로로 보냅니다.
4. **서버 측 `/open?url=`** — 확장이 해석하지 못하는 랜딩 링크(Semantic
   Scholar 논문 페이지 등)와 확장 없이 직접 여는 경우의 경로. 서버가
   사이트별 규칙 + S2 openAccessPdf API로 PDF를 해석·다운로드·임포트하고
   앱이 문서를 엽니다. 확장 측 다운로드가 실패해도 이 경로로 폴백합니다.
5. **툴바 버튼** — 보고 있는 탭의 논문을 바로 oh-my-paper로 보냅니다. 위
   사이트 규칙에 더해, 탭이 PDF를 보여 주고 있으면 그 PDF를, 학술 사이트가
   `citation_pdf_url` 메타 태그로 PDF를 알려 주면(Nature, ACM, bioRxiv 등)
   그 PDF를 가져옵니다. 논문이 아닌 페이지에서는 탭을 그대로 두고 옆 탭에
   oh-my-paper를 엽니다.

## 서버가 꺼져 있을 때

oh-my-paper에서 열기를 골랐는데 로컬 서버가 응답하지 않으면, 툴바 버튼에
`off` 배지가 붙고 켜는 방법을 알려 주는 탭이 옆에 열립니다. 서버가 켜지는
대로 고른 논문을 이어서 엽니다.

## 설치

1. 로컬 서버가 떠 있어야 합니다 (`oh-my-paper` 또는 `npm run start:web`,
   포트는 `OH_MY_PAPER_WEB_PORT`로 결정 — 기본값 8788).
2. `chrome://extensions` → 우측 상단 **개발자 모드** 켜기.
3. **압축해제된 확장 프로그램을 로드** → 이 `extension/` 폴더를 선택.
4. 퍼즐 아이콘에서 **oh-my-paper Connector**를 고정하면 툴바 버튼이 보입니다.

코드를 받은 뒤에는 `chrome://extensions`에서 확장의 새로고침 버튼을 눌러야
바뀐 내용이 적용됩니다.

## 포트 변경

서버를 다른 포트로 띄우면 `background.js` 맨 위의 `APP_ORIGIN`을 바꿔주세요.
(다른 파일은 포트를 쓰지 않습니다.)
