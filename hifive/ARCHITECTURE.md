# HiFive Smart Tolling — 전체 아키텍처 문서

> 본 문서는 HiFive 차세대 스마트톨링 플랫폼을 구성하는 **3개 시스템(FastAPI Edge / Spring Boot Backend / Vue 3 Frontend)** 이 어떤 폴더와 파일로 짜여 있고, 어떤 코드가 어디에 들어 있으며, 무엇이 무엇과 연결되고, 실제 요청이 어떤 흐름으로 흘러가는지를 한 곳에서 설명합니다.

---

## 1. 한눈에 보는 시스템 구성

```
                                        +-----------------------------+
                                        |   사용자 브라우저            |
                                        |   http://localhost:5173      |
                                        +--------------+--------------+
                                                       |
                                                       | (1) HTTP / 세션 쿠키
                                                       v
+---------------------+   (2) HTTP /api/*    +-----------------------------+
|  Vue 3 + Pinia       |  ---------------->  |  Spring Boot Backend         |
|  frontend/           |   axios + proxy      |  backend/                    |
|  Vite dev :5173      |  <----------------   |  Tomcat :8080                |
+---------------------+   JSON response       |   - /api/auth/*              |
                                              |   - /api/board               |
                                              |   - gRPC server :9090        |
                                              +-------------+----------------+
                                                            ^
                                                            | (3) gRPC + Protobuf
                                                            |     양방향 스트림
                                                            |
+-----------------+   (A) HTTP POST   +------------------+
|  YOLOv8/OpenCV  | ----------------> |  FastAPI Edge    |
|  카메라 / Vision |  /v1/yolo/...    |  fastapi-edge/   | -----------------+
|  GPS 수신기      | ----------------> |  uvicorn :8000   |
+-----------------+   /v1/gps/...     +------------------+

(1) 브라우저 ↔ Vue: SPA가 axios 로 백엔드 호출, 세션 쿠키 유지
(2) Vue ↔ Spring Boot: REST + 세션 인증 (회원/게시판/정산 조회)
(3) FastAPI ↔ Spring Boot: gRPC 양방향 스트리밍 (실시간 통과 이벤트)
(A) YOLO/GPS ↔ FastAPI: HTTP 로 검출 결과·GPS 좌표 푸시
```

| 계층            | 폴더              | 런타임          | 기본 포트 | 주 책임                                                              |
|-----------------|-------------------|-----------------|-----------|----------------------------------------------------------------------|
| Edge (현장)     | `fastapi-edge/`   | uvicorn (Python)| **8000**  | YOLO/OCR 결과 수신 → 가상 통과선 판정 → gRPC 송신                    |
| Backend (서버)  | `backend/`        | Spring Boot 3   | **8080**  | 회원·게시판 REST API + gRPC 수신 + 정산 + DB 저장                    |
| Frontend (UI)   | `frontend/`       | Vite + Vue 3    | **5173**  | 랜딩/회원/대시보드 SPA, Pinia 상태관리, 백엔드 호출                  |
| Backend↔Edge 채널 | (proto 공유)    | gRPC            | **9090**  | `proto/tolling.proto` 한 파일로 양쪽 stub 생성                       |

---

## 2. 시스템별 역할 요약

### 2.1 FastAPI Edge (`fastapi-edge/`)
도로 카메라 옆 엣지 디바이스에서 동작합니다. YOLOv8/OpenCV가 검출한 차량/번호판 결과를 HTTP로 받고, **가상 통과선(Crossing line) 알고리즘**으로 ENTRY/EXIT을 판정한 다음, **gRPC + Protobuf**로 백엔드에 실시간 송신합니다. 백엔드가 죽어 있어도 자체 큐에 쌓고 지수 백오프로 재연결합니다. OCR 신뢰도가 낮은 케이스는 단건 RPC로 분기해 검수 큐에 적재되도록 합니다.

### 2.2 Spring Boot Backend (`backend/`)
- **REST 측면**: `/api/auth/*` 회원가입/로그인/로그아웃, `/api/board` 게시판/검수 글 CRUD. Spring Session 기반의 세션 쿠키 인증.
- **gRPC 측면**: FastAPI에서 보낸 `PassageEventRequest`를 수신·역직렬화·정산 처리·DB 적재. (서버 stub은 같은 `tolling.proto`에서 java로 생성)
- 정산/요금 계산, 미납 관리, 검수 큐 보정 API 등 비즈니스 로직 전반.

### 2.3 Vue 3 Frontend (`frontend/`)
- 랜딩(`/`)과 회사소개/솔루션/기술/도입안내/문의 등 정적 페이지
- 회원가입/로그인 폼
- 관리자용 **실시간 관제 대시보드**: KPI, 통과 로그, GPS 구간, 게시판/검수
- Pinia로 인증·게시판 상태 관리, axios 인스턴스로 백엔드 호출, Vue Router로 라우팅과 인증 가드

---

## 3. 폴더 구조 & 파일별 역할

### 3.1 FastAPI Edge — `fastapi-edge/`

```
fastapi-edge/
├── proto/
│   └── tolling.proto              # ★ Edge↔Backend gRPC 계약 (양쪽이 공유)
├── scripts/
│   ├── generate_proto.py          # proto → python stub 생성 (크로스플랫폼)
│   ├── generate_proto.sh          # 같은 작업의 bash 버전
│   └── smoke_test.py              # 서버 5단계 기능 자동 검증
├── app/
│   ├── main.py                    # FastAPI 인스턴스 + lifespan(gRPC 워커 기동/정리)
│   ├── core/config.py             # 환경변수 기반 Settings (EDGE_ prefix)
│   ├── models/schemas.py          # YOLO 입력 Pydantic 스키마
│   ├── services/
│   │   ├── crossing.py            # 가상 통과선 알고리즘 (선분 교차 + 방향 판정)
│   │   ├── gps_service.py         # 트랙/차로별 GPS 캐시
│   │   └── grpc_client.py         # 비동기 gRPC 스트리밍 클라이언트 (큐 + 백오프)
│   ├── api/routes.py              # /v1/yolo/detections, /v1/gps/..., /healthz
│   └── grpc_generated/            # protoc 산출물 (tolling_pb2.py, tolling_pb2_grpc.py)
├── requirements.txt
├── README.md
└── RUN.md                         # 실행/점검/운영 모드 가이드
```

**파일별 핵심 코드와 연결**

- `proto/tolling.proto`
  - `service TollingEventService` 안에 3개 RPC: `SendPassageEvent` (단건), `StreamPassageEvents` (양방향 스트림), `Heartbeat`
  - 메시지 타입: `PassageEventRequest`(plate / lane_id / vehicle_type / direction / GPS / track 정보), `PassageEventResponse`, `GpsPoint`, `TrackInfo`, enum `VehicleType`/`CrossingDirection`/`ProcessingStatus`
  - **연결**: 이 한 파일이 Edge(Python)와 Backend(Java) 양쪽 stub의 단일 소스입니다.

- `app/main.py` → `FastAPI(lifespan=...)`
  - 부팅 시 `CrossingLineDetector`, `GpsCache`, `TollingGrpcClient`를 생성해 `app.state`에 보관
  - `await app.state.grpc_client.start()` — 백엔드와의 gRPC 채널 오픈 + 스트림 워커 태스크 기동
  - 종료 시 `await app.state.grpc_client.stop()` — 채널 정리

- `app/api/routes.py` → 의존성 주입(`Depends`)으로 위 3개 서비스를 받아 사용
  - `POST /v1/yolo/detections` → 각 검출에 대해 `detector.evaluate(det)` 실행 → `decision.crossed=True`이면 `grpc_client.enqueue_event(...)` 호출
  - `POST /v1/gps/track/{id}` / `/v1/gps/lane/{id}` → `gps_cache.upsert_*` 로 캐시 갱신
  - `GET /healthz` → 단순 ok

- `app/services/crossing.py` (`CrossingLineDetector`)
  - 트랙별 직전 중심좌표를 보존, (직전→현재) 선분이 통과선 선분과 교차하면 통과로 판정
  - 외적 부호로 ENTRY/EXIT 구분, 같은 트랙 중복 판정 방지(2초 cooldown), 5초 미관측 트랙 GC

- `app/services/grpc_client.py` (`TollingGrpcClient`)
  - 내부에 `asyncio.Queue` 보유 → 정상 트래픽은 `StreamPassageEvents`로 스트리밍
  - **저신뢰 OCR(`plate_confidence < threshold`)** 은 단건 `SendPassageEvent`로 분기 → 백엔드의 검수(`PENDING_REVIEW`) 큐로 적재되도록
  - 채널이 끊기면 0.5s → 1s → 2s → 4s 백오프로 재연결, `event_id`(UUID)로 멱등성 보장

- `app/services/gps_service.py` (`GpsCache`)
  - 트랙 ID 또는 차로 ID 기준으로 가장 최근 `GpsSample` 보관 (스레드 안전)

- `app/core/config.py`
  - `pydantic_settings.BaseSettings` — `EDGE_GRPC_TARGET`, `EDGE_EDGE_NODE_ID`, `EDGE_LOW_OCR_CONFIDENCE_THRESHOLD`, 통과선 좌표 4개 등 모든 튜닝 노브

### 3.2 Spring Boot Backend — `backend/`

```
backend/
├── build.gradle
├── settings.gradle
├── src/main/
│   ├── java/com/hifive/iot/
│   │   ├── IotApplication.java                # @SpringBootApplication 진입점
│   │   ├── controller/
│   │   │   ├── AuthController.java            # /api/auth/{signup,login,logout}
│   │   │   └── BoardController.java           # /api/board GET/POST
│   │   ├── service/
│   │   │   ├── MemberService.java             # signUp / login 비즈니스 로직
│   │   │   └── BoardService.java              # findAll / create
│   │   ├── dto/
│   │   │   ├── SignUpRequest.java             # record(memberId,password,memberName,plateNumber)
│   │   │   ├── LoginRequest.java              # record(memberId,password)
│   │   │   ├── AuthResponse.java              # record(success,message,member)
│   │   │   ├── MemberResponse.java            # record(memberId,memberName,plateNumber)
│   │   │   └── BoardPostRequest.java          # record(title,content,plateNumber,vehicleCount,recognitionConfidence)
│   │   └── entity/
│   │       ├── Member.java                    # record(memberId,password,memberName,plateNumber)
│   │       └── BoardPost.java                 # record(postId,title,content,writerName,plateNumber,vehicleCount,recognitionConfidence,createdAt)
│   └── resources/application.yml
└── src/test/java/...                          # IotApplicationTests
```

**파일별 핵심 코드와 연결**

- `IotApplication.java`
  - `@SpringBootApplication` + `main(SpringApplication.run(...))` — Tomcat 기동, 컴포넌트 스캔, autoconfig 활성화

- `controller/AuthController.java` (`@RestController @RequestMapping("/api/auth")`)
  - `POST /signup` → `memberService.signUp(req)` → `boolean created` 결과로 201 또는 409
  - `POST /login` → `memberService.login(memberId, password)` → 성공 시 `HttpSession`에 `loginMember` 속성 저장, `MemberResponse` 반환
  - `POST /logout` → `session.invalidate()`
  - **연결**: 응답 DTO `AuthResponse`로 항상 `{success, message, member}` 형태 반환 → Vue의 `useAuthStore.login()`이 `data.member`를 그대로 멤버 정보로 저장

- `controller/BoardController.java` (`@RestController @RequestMapping("/api/board")`)
  - `GET` → `boardService.findAll()` → `List<BoardPost>` 직렬화
  - `POST` → 세션에서 `loginMember` 꺼내 작성자명 확정, `boardService.create(req, writerName)`
  - **연결**: Vue의 `useBoardStore.fetchAll() / create()`가 호출

- `service/MemberService.java` / `service/BoardService.java`
  - 현재 in-memory 컬렉션 기반 단순 구현 (PostgreSQL/JPA 도입 시 이 클래스만 교체)

- `dto/`, `entity/`
  - 모두 Java 17 `record` — 불변·간결. 백엔드 ↔ 프론트 간 JSON 계약 그대로

- `application.yml`
  - 포트, 세션 타임아웃 등. (gRPC 서버는 별도로 `9090`을 추가 구성하면 됨)

### 3.3 Vue 3 Frontend — `frontend/`

```
frontend/
├── index.html                           # Vite 진입 HTML
├── vite.config.js                       # /api → :8080 proxy 설정
├── tailwind.config.js / postcss.config.js
├── package.json
└── src/
    ├── main.js                          # Vue + Pinia + Router 부트스트랩
    ├── App.vue                          # 글로벌 레이아웃, home 라우트는 자체 chrome 사용
    ├── router/index.js                  # 9개 라우트 + requiresAuth/hideAuth 가드
    ├── api/
    │   ├── client.js                    # axios 인스턴스 (withCredentials: true)
    │   ├── auth.js                      # /api/auth/* 래퍼
    │   └── board.js                     # /api/board 래퍼
    ├── stores/
    │   ├── auth.js                      # Pinia: signUp/login/logout/hydrate
    │   └── board.js                     # Pinia: fetchAll/create + lowConfidencePosts
    ├── components/
    │   ├── AppHeader.vue                # 일반 라우트용 글로벌 헤더
    │   └── AppFooter.vue                # 일반 라우트용 글로벌 푸터
    ├── styles/
    │   ├── main.css                     # Tailwind 베이스 + 공용 토큰
    │   └── home.css                     # ★ index.html 디자인 그대로 옮긴 메인 전용 CSS
    ├── composables/
    │   ├── heroWave.js                  # 메인 hero 배경 wave canvas
    │   └── decisionFlow.js              # Architecture 섹션 노드/패킷 다이어그램
    └── views/
        ├── HomeView.vue                 # 메인. 자식 섹션 컴포넌트 5개를 합성
        ├── home/
        │   ├── HomeHeader.vue           # 메인 전용 site-header (스크롤 blur)
        │   ├── SectionHero.vue          # Hero (도로/갠트리/차량 + waveCanvas)
        │   ├── SectionCore.vue          # Core Engine 4개 카드
        │   ├── SectionArchitecture.vue  # Edge to Decision (networkCanvas + 3 metrics)
        │   └── SectionCta.vue           # Footer CTA
        ├── LoginView.vue
        ├── SignupView.vue
        ├── DashboardView.vue            # 실시간 KPI/로그/GPS/게시판
        ├── CompanyView.vue
        ├── SolutionView.vue
        ├── TechnologyView.vue
        ├── GuideView.vue
        └── ContactView.vue              # 1:1 문의 (게시판 API 재활용)
```

**파일별 핵심 코드와 연결**

- `main.js` — `createApp(App).use(createPinia()).use(router).mount('#app')` + `main.css` 로드
- `App.vue` — `route.name === 'home'`이면 글로벌 chrome 숨기고, 그 외에는 `AppHeader/AppFooter` 노출. `onMounted`에서 `useAuthStore().hydrate()` 호출로 세션 복구
- `router/index.js`
  - 라우트: `/`(home), `/login`(hideAuth), `/signup`(hideAuth), `/dashboard`(requiresAuth), `/company`, `/solution`, `/technology`, `/guide`, `/contact`
  - `beforeEach`에서 `requiresAuth`면 비로그인 시 `/login?redirect=...`로, `hideAuth`면 이미 로그인 상태일 때 `/`로 리다이렉트
- `api/client.js` — `axios.create({ withCredentials: true, ... })`. dev에선 vite proxy가 `/api` → `localhost:8080` 으로 보냄
- `api/auth.js` — `signUp/login/logout` 3개 함수만, 각각 백엔드 `/api/auth/*` 엔드포인트와 1:1
- `api/board.js` — `list/create` 2개 함수, 백엔드 `/api/board` GET/POST
- `stores/auth.js` (`useAuthStore`)
  - state: `member, loading, error`. getter: `isLoggedIn`
  - `signUp(form)`, `login(form)` → `authApi` 호출 후 결과를 reactive에 반영, `localStorage`에 멤버 정보 저장
  - `hydrate()` — 새로고침 시 localStorage에서 멤버 복구 → `App.vue`가 부팅 시 호출
- `stores/board.js` (`useBoardStore`)
  - state: `posts, loading, error`. getter: `total`, `lowConfidencePosts`(신뢰도 0.7 미만 필터)
  - `fetchAll()`은 `createdAt`이 LocalDateTime 배열로 와도 ISO 문자열로 정규화
- `views/DashboardView.vue`
  - 시계/KPI/통과 로그를 setInterval로 시뮬레이션, GPS 구간 패널, 게시판(=검수 게시판) 표시
  - mount 시 `board.fetchAll()` 호출 → 실 백엔드 글이 있으면 표시
- `views/HomeView.vue`
  - 자식 섹션 5개를 단순 합성. mount 시 `html.home-active` 클래스 부여(scroll-snap 등 글로벌 영향), `IntersectionObserver`로 reveal/카운트업 트리거
- `composables/heroWave.js`, `composables/decisionFlow.js`
  - 캔버스 애니메이션 코드. 각 섹션 컴포넌트에서 `onMounted`에 호출 → `dispose()`로 정리
- `styles/home.css`
  - 기존 `index.html` `<style>`을 그대로 옮긴 약 800줄. 모든 selector를 `.home-page` 안으로 스코프해 다른 라우트에 영향 없음

---

## 4. 데이터 / 호출 흐름 (시나리오별)

### 4.1 ★ 차량 통과 → 정산 (실시간 톨링 핵심 흐름)

```
[카메라 + YOLOv8/OpenCV]
   │ 1. 프레임에서 차량/번호판 ROI 추출, OCR
   │ 2. 결과 1배치를 HTTP POST 로 엣지에 전송
   ▼
[FastAPI Edge]  POST /v1/yolo/detections   (app/api/routes.py)
   │ 3. routes.receive_detections()
   │    각 detection 에 대해:
   │      gps = det.gps or gps_cache.latest_for(track_id, lane_id)
   │      decision = detector.evaluate(det)        # 통과선 판정
   │      if decision.crossed:
   │          await grpc_client.enqueue_event(det, decision, gps)
   │
   │ 4. enqueue_event() 가
   │      plate_confidence < 0.7 면 ⇒ asyncio.create_task(_send_unary(req))   (단건 RPC)
   │      그 외 정상이면        ⇒ self._queue.put_nowait(req)                (스트림 큐)
   ▼
[gRPC 채널]   localhost:9090   (Protobuf 바이너리, JSON 대비 -70%)
   │ 5. 정상: StreamPassageEvents (양방향 스트림)
   │    저신뢰: SendPassageEvent (단건)
   ▼
[Spring Boot Backend]
   │ 6. 수신·역직렬화 → DB 적재
   │ 7. plate / lane / direction / GPS 로 요금 계산
   │ 8. 저신뢰는 PENDING_REVIEW 상태로 검수 큐에 적재
   │ 9. PassageEventResponse(event_id, status, message) 응답
   ▼
[Vue 대시보드]
  10. 관리자가 /dashboard 에서 실시간 통과 로그·KPI 모니터링
  11. 저신뢰 로그는 amber 하이라이트, 보정 후 재전송 가능
```

**끊김에 강한 설계**: 6단계의 백엔드가 죽어 있어도 4단계의 큐는 계속 받고, `_stream_worker`가 0.5s → 1s → 2s → 4s ... 백오프로 재연결합니다. event_id(UUID)가 멱등성 키라서 중복 도달도 백엔드가 거를 수 있습니다.

### 4.2 사용자 회원가입 → 로그인 → 대시보드 진입

```
[브라우저: /signup]
  1. SignupView.vue 의 form 입력 후 submit
  2. handleSubmit() → useAuthStore().signUp(form)
     → authApi.signUp() → axios POST /api/auth/signup
                                        │  (vite proxy)
                                        ▼
[Spring Boot]  AuthController.signUp()
  3. memberService.signUp(req)
     → 신규: 201 CREATED + AuthResponse(true,"가입완료", null)
     → 중복: 409 CONFLICT + AuthResponse(false,"이미 사용 중", null)
  4. Vue 가 message 표시 후 800ms 뒤 router.push('/login')

[브라우저: /login]
  5. LoginView.vue submit → useAuthStore().login(form)
     → authApi.login() → POST /api/auth/login

[Spring Boot]  AuthController.login()
  6. memberService.login(id, pw) → Optional<Member>
  7. 성공 시 session.setAttribute("loginMember", member)
     → AuthResponse(true,"로그인됨", MemberResponse.from(member)) + Set-Cookie: JSESSIONID
  8. Vue: store.member = data.member, localStorage 저장

[Vue 라우터]
  9. router.push(route.query.redirect ?? '/dashboard')
 10. router.beforeEach 가 requiresAuth + isLoggedIn 통과 → DashboardView.vue 마운트

[DashboardView.vue]
 11. onMounted: clock/KPI/log 시뮬레이션 + board.fetchAll()
 12. axios 가 자동으로 JSESSIONID 쿠키 동봉(withCredentials: true)
 13. 백엔드 BoardController.findAll() → List<BoardPost> JSON 반환
 14. store.posts 갱신 → 화면 반영
```

### 4.3 1:1 문의 / 게시판

```
[브라우저: /contact]
  1. ContactView.vue submit → useBoardStore().create(form)
     → boardApi.create() → POST /api/board
[Spring Boot]
  2. BoardController.create() — 세션의 loginMember 가 있으면 그 이름, 없으면 "방문자"
  3. boardService.create(req, writerName) → 201 CREATED
[Vue]
  4. board.create() 가 성공하면 board.fetchAll() 자동 재호출 → 목록 갱신
```

게시판은 동시에 **검수 게시판** 으로도 사용됩니다. `recognitionConfidence < 0.7` 인 글은 `useBoardStore.lowConfidencePosts` getter에 잡혀 대시보드에서 amber 색으로 강조됩니다.

---

## 5. 컴포넌트 간 연결 매트릭스

### 5.1 Vue 화면 ↔ Pinia ↔ axios ↔ Spring Boot

| Vue 화면                       | Pinia action                    | axios 모듈           | Spring Boot 엔드포인트          | DTO/Entity                        |
|-------------------------------|---------------------------------|----------------------|---------------------------------|-----------------------------------|
| `SignupView.vue`              | `useAuthStore().signUp()`       | `api/auth.signUp()`  | `POST /api/auth/signup`         | `SignUpRequest` → `AuthResponse`  |
| `LoginView.vue`               | `useAuthStore().login()`        | `api/auth.login()`   | `POST /api/auth/login`          | `LoginRequest` → `AuthResponse`   |
| `AppHeader/HomeHeader.vue`    | `useAuthStore().logout()`       | `api/auth.logout()`  | `POST /api/auth/logout`         | —                                 |
| `DashboardView.vue` (init)    | `useBoardStore().fetchAll()`    | `api/board.list()`   | `GET /api/board`                | → `List<BoardPost>`               |
| `DashboardView.vue` (글 등록) | `useBoardStore().create()`      | `api/board.create()` | `POST /api/board`               | `BoardPostRequest`                |
| `ContactView.vue`             | `useBoardStore().create()`      | `api/board.create()` | `POST /api/board`               | `BoardPostRequest` (1:1 문의 재활용)|

> 세션 인증: 모든 axios 호출은 `withCredentials: true`로 `JSESSIONID` 쿠키를 자동 동봉합니다. 운영에서는 Spring Security CORS 설정에 `http://localhost:5173` 을 `allowCredentials=true` 로 허용해 주세요.

### 5.2 FastAPI ↔ gRPC stub ↔ Spring Boot

| FastAPI 측 코드                                  | proto 정의                                  | Spring Boot 측 코드 (구축 예정)         |
|--------------------------------------------------|---------------------------------------------|----------------------------------------|
| `app/services/grpc_client.py:_stream_loop()`     | `rpc StreamPassageEvents(stream … ) returns(stream …)` | `@GrpcService` 의 `streamPassageEvents()` |
| `app/services/grpc_client.py:_send_unary()`      | `rpc SendPassageEvent(...)`                 | `sendPassageEvent()` — 검수 큐 적재     |
| `app/services/grpc_client.py:_build_request()`   | `message PassageEventRequest`               | `TollingProto.PassageEventRequest`     |
| `app/services/crossing.py:CrossingDecision`      | `enum CrossingDirection {ENTRY, EXIT}`      | 같은 enum                               |
| `app/models/schemas.py:VehicleTypeEnum`          | `enum VehicleType`                          | 같은 enum                               |

> 단일 소스: `proto/tolling.proto` 한 파일이 양쪽 stub의 origin입니다. Edge는 `scripts/generate_proto.py`로 Python stub을 만들고, Backend는 build.gradle에 `protobuf-gradle-plugin`을 추가해 Java stub을 만들면 됩니다.

### 5.3 FastAPI 내부 객체 그래프

```
FastAPI(app)
  └─ lifespan
       ├─ app.state.settings        : Settings           (core/config.py)
       ├─ app.state.detector        : CrossingLineDetector (services/crossing.py)
       ├─ app.state.gps_cache       : GpsCache           (services/gps_service.py)
       └─ app.state.grpc_client     : TollingGrpcClient  (services/grpc_client.py)
                                       │
                                       ├─ asyncio.Queue (송신 버퍼)
                                       ├─ grpc.aio.Channel → :9090
                                       └─ _stream_worker Task (백그라운드)

routes.receive_detections(batch, Depends(...))
  ├─ detector.evaluate(det)              ← 통과 판정
  ├─ gps_cache.latest_for(track,lane)    ← GPS 결합
  └─ grpc_client.enqueue_event(...)      ← 단건 또는 큐
```

---

## 6. 실행 / 운영

### 6.1 로컬에서 처음 띄우는 순서

```bash
# 1) Spring Boot Backend  (REST + gRPC 9090)
cd backend
./gradlew bootRun                       # → http://localhost:8080

# 2) FastAPI Edge (별도 터미널)
cd fastapi-edge
python -m venv .venv && .\.venv\Scripts\Activate.ps1     # Windows PS
pip install -r requirements.txt
python scripts/generate_proto.py        # ★ proto stub 생성 (필수)
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs (Swagger), http://localhost:8000/healthz

# 3) Vue Frontend (또 다른 터미널)
cd frontend
npm install
npm run dev                             # → http://localhost:5173
```

각 서비스는 다른 서비스가 떠 있지 않아도 부팅됩니다 — 단, FastAPI는 백엔드(`localhost:9090`)가 없으면 gRPC 재연결 로그를 반복 출력하고, Vue는 `/api/*` 호출이 502가 됩니다. Vue는 mock UI(시계/KPI/통과 로그 시뮬레이션)는 백엔드 없이도 보입니다.

### 6.2 핵심 환경 변수

| 시스템 | 변수 | 용도 | 기본값 |
|--------|------|------|--------|
| FastAPI | `EDGE_GRPC_TARGET` | Spring Boot gRPC 주소 | `localhost:9090` |
| FastAPI | `EDGE_EDGE_NODE_ID` | 엣지 식별자 | `EDGE-LOCAL-01` |
| FastAPI | `EDGE_LOW_OCR_CONFIDENCE_THRESHOLD` | 검수 분기 임계값 | `0.7` |
| FastAPI | `EDGE_CROSSING_LINE_P{1,2}_{X,Y}` | 통과선 양 끝 좌표 | `(0,540)–(1920,540)` |
| Vue (Vite) | `VITE_API_BASE_URL` | 백엔드 base URL | `''`(dev proxy 사용) |
| Spring Boot | `application.yml` | 포트·세션·DB 설정 | `8080` |

### 6.3 배포 모드 권장 사항

- FastAPI: `gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2`
- Spring Boot: 표준 `java -jar` 또는 컨테이너
- Vue: `npm run build` → `dist/` 산출물을 nginx/Spring Boot 정적 리소스로 서빙
- gRPC: 운영 환경에서는 `EDGE_GRPC_USE_TLS=true` + 인증서 사용 권장

### 6.4 빠른 검증 체크리스트

1. `curl http://localhost:8000/healthz` → `{"status":"ok"}`
2. `curl http://localhost:8080/api/board` → `[]` 또는 글 배열
3. 브라우저에서 `http://localhost:5173/signup` → 가입 → 로그인 → `/dashboard`까지 도달
4. FastAPI 터미널에서 `python scripts/smoke_test.py` 실행 → 5단계 PASS

---

## 부록 A. 파일 위치 빠른 참조

- gRPC 계약: `fastapi-edge/proto/tolling.proto`
- 통과선 알고리즘: `fastapi-edge/app/services/crossing.py`
- 백엔드 송신 큐: `fastapi-edge/app/services/grpc_client.py`
- 회원/게시판 API: `backend/src/main/java/com/hifive/iot/controller/`
- 인증 상태: `frontend/src/stores/auth.js`
- 게시판 상태: `frontend/src/stores/board.js`
- 메인 화면 디자인: `frontend/src/styles/home.css` + `frontend/src/views/home/*`
- 대시보드: `frontend/src/views/DashboardView.vue`

## 부록 B. 다음 단계 권장

1. Spring Boot 측 gRPC 서버 모듈 추가 (`grpc-spring-boot-starter` + `protobuf-gradle-plugin`)
2. PostgreSQL + JPA 도입 (현재 in-memory 서비스 → Repository 교체)
3. Spring Security CORS 허용: `http://localhost:5173` + `allowCredentials=true`
4. 대시보드 mock 데이터를 실제 통과 이벤트(SSE/WebSocket)로 교체
5. CI: proto 변경 시 양쪽 stub 자동 재생성
