# AICE Associate — 5일 합격 커리큘럼

국가공인 AI 자격증 AICE Associate 단기 합격을 위한 학습 가이드 페이지입니다.

## 🚀 GitHub Pages 배포 방법

### 1단계 — 저장소 생성

```bash
git init
git add .
git commit -m "feat: AICE study guide 초기 배포"
```

GitHub에서 새 repository를 생성한 후:

```bash
git remote add origin https://github.com/<username>/<repo-name>.git
git branch -M main
git push -u origin main
```

### 2단계 — GitHub Pages 활성화

1. GitHub 저장소 → **Settings** 탭
2. 좌측 메뉴 → **Pages**
3. **Source**: `Deploy from a branch`
4. **Branch**: `main` / `/ (root)`
5. **Save** 클릭

약 1~2분 후 `https://<username>.github.io/<repo-name>/` 에서 접근 가능합니다.

## 📁 파일 구조

```
aice-study/
├── index.html   # 메인 페이지
├── style.css    # 스타일시트
├── app.js       # 인터랙션 (탭 전환, 체크리스트, 복사 버튼 등)
└── README.md    # 배포 가이드 (이 파일)
```

## ✨ 기능

- **Day별 탭** — 5일 커리큘럼 탭 전환 (마지막 방문 탭 기억)
- **코드 복사 버튼** — 각 코드 블록 원클릭 복사
- **D-Day 카운터** — 시험까지 남은 날 자동 표시
- **체크리스트** — D-1 점검 항목 체크 및 상태 저장
- **반응형** — 모바일/태블릿/데스크탑 모두 지원

## 📚 시험 정보

| 항목 | 내용 |
|------|------|
| 시험명 | AICE Associate (국가공인) |
| 주관 | KT × 한국경제신문 |
| 문항 수 | 14문항 |
| 시험 시간 | 90분 |
| 합격 기준 | 80점 이상 |
| 응시 방식 | 온라인 오픈북 (Chrome + 웹캠) |
| 사용 언어 | Python (pandas, sklearn, tensorflow) |
