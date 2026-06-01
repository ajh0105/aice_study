# 번호판 OCR 버전 히스토리 (v1 → ocrv6.5)

작성일: 2026-05-24  
프로젝트: 한국 고속도로 CCTV 번호판 OCR  
최종 버전: **ocrv6.5** — comp 0.9980 / hard 1.0000 (전 카테고리)

---

## 전체 버전 성능 한눈에 보기

| 버전 | 상태 | Val | Hard | Rare | Conf | ECE | **Comp** | 비고 |
|------|------|-----|------|------|------|-----|---------|------|
| v1 | 완료 | — | — | — | — | — | baseline | 베이스라인 |
| v2 | 미완료 | — | — | — | — | — | — | 실험 중 중단 |
| v3 | 완료 | 0.9858 | — | — | — | — | 0.9858 | 첫 완성 버전 |
| v4 | 미완료 | — | — | — | — | — | — | 실험 중 중단 |
| **v5** | **완료** | 0.9870 | ~0.9800† | 1.0000 | 0.9924 | 0.0052 | **0.9874** | 기준 모델 |
| ocrv6.pt | 완료 | 0.9903 | 0.9920 | 0.9748 | 0.9880 | 0.0005 | **0.9865** | rare 회귀 |
| ocrv6.1 | 실패 | 0.53 | — | — | — | — | — | vocab 버그 |
| ocrv6.2 | 실패 | ~0.0 | — | — | — | — | — | vocab 버그 |
| ocrv6.3 | 완료 | 0.9970 | 1.0000 | 0.9748 | 0.9966 | 0.0041 | **0.9918** | rare 여전히 회귀 |
| ocrv6.4 | 완료 | 0.9892 | 0.9880 | 0.9904 | 0.9880 | 0.0061 | **0.9890** | rare 회복 근접 |
| **ocrv6.5** | **완료** | **0.9972** | **1.0000** | **0.9952** | **0.9970** | 0.0112 | **0.9980** | ★ 최종 |

> † v5 Hard는 746장 기준, ocrv6 계열은 250장 기준 (직접 비교 주의)

---

## v1 — 베이스라인

- **상태**: 완료
- **환경**: 이전 개발 환경 (v5까지)
- **아키텍처**: STN + BiLSTM + FocalCTC
- **입력**: 48×160 RGB
- **데이터**: 초기 실데이터 일부
- **특징**:
  - 한국 번호판 OCR 시스템의 첫 번째 end-to-end 구현
  - CTC blank=0, 1-indexed vocab 규약 수립
  - FocalCTC γ=2.0 사용 (이후 버전에서 1.2로 완화)
- **성능**: baseline 수준 (구체적 지표 기록 없음)

---

## v2 — 실험 (미완료)

- **상태**: 미완료 (중단)
- **시도**: CBAM 추가, Mixup augmentation, EMA 도입
- **입력 변경**: 48×160 → **32×128** (다운스케일)
- **중단 이유**: 소형 번호판에서 32×128이 문자를 뭉개는 문제 발견
- **교훈**: 입력 해상도는 48×160 이상 유지 필요

---

## v3 — 첫 완성 버전 (98.58%)

- **상태**: 완료
- **Val Accuracy**: **98.58%**
- **주요 변경**:
  - albumentations 기반 강화 augmentation
  - 실데이터 + 합성 데이터 혼합 (총 82,488장)
  - 입력 해상도 다시 논의 중 (32×128 유지)
- **한계**:
  - albumentations가 Python 버전 업 이후 호환성 문제 발생
  - rare 한글 학습 부족
  - hard 케이스 (야간/블러/기울임) 별도 평가 없음

---

## v4 — 실험 (미완료)

- **상태**: 미완료 (중단)
- **시도**: Mixup 제거 실험 (v3 대비 성능 영향 측정 목적)
- **중단 이유**: 명확한 개선이 없어 v5 설계로 직행

---

## v5 — 기준 모델 (98.65%)

- **상태**: 완료  
- **모델 파일**: `reference/ocrv5/checkpoints/deploy_candidate_seed42.pt` (32 MB)
- **Val Accuracy**: **98.70%**
- **operational_hard_score**: **98.65%**
- **Rare**: **1.0000** ← 이후 버전들의 회귀 기준점

### 아키텍처

```
입력 (B, 3, 48, 160)
    │
    STN (Spatial Transformer Network)   ← 기울기/원근 자동 보정
    │
    VGG-like Backbone 4-stage (BN)
      b1: 48×160 → 24×80   채널 64
      b2: 24×80  → 12×40   채널 128
      b3: 12×40  →  6×40   채널 256  (높이만 축소)
      b4:  6×40  →  1×40   채널 512  (높이 완전 축소)
    │ (B, 512, 1, 40) → reshape → (B, 40, 512)
    CBAM (채널·공간 어텐션)
    │
    2-layer BiLSTM (hidden=256, bidirectional)
    │ (B, 40, 512)
    Linear (512 → 51)
    │
    CTC Decoder (beam width=10 + 한국 번호판 grammar)
    │
    출력: "01가1234"
```

### 주요 설계 결정

| 결정 | 내용 | 이유 |
|------|------|------|
| 입력 48×160 복귀 | v2에서 다운스케일했다가 복귀 | 소형 번호판 글자 뭉개짐 방지 |
| FocalCTC γ=1.2 | v1~v4의 γ=2.0에서 완화 | 극단적 hard mining 억제 |
| Rare reweight 1.2 | 바·배·사·아·자·허 포함 샘플 20% 가중 | rare 학습 강화 |
| Composite checkpoint | 0.5×hard + 0.3×rare + 0.2×val | 운영 환경 기준 최적 epoch 선정 |
| Grammar decoder | beam(10) + NN한글NNNN 패턴 | 문법 오류 후처리 교정 |
| 3-run 검증 | seed 42/3407/2026 | 재현성 확보 |
| AdamW | Adam → AdamW (wd=1e-4) | 정규화 강화 |
| EMA | epoch 10부터 decay=0.999 | 안정적 수렴 |

### 학습 조건

```
데이터  : 실데이터 82,966장 + 합성 10,000장
Split   : group-aware (plate label 기준 8:2)
Batch   : 96
LR      : AdamW 1e-3 + warmup(5ep) + CosineAnnealing
Augment : cv2 curriculum (p1:0.15 → p2:0.25 → p3:0.35, 3단계)
EMA     : ep10~, decay=0.999
PATIENCE: 10 / MAX_EPOCHS 100
```

### 성능

| 지표 | v5 |
|------|----|
| Val (overall) | 0.9870 |
| Hard (~746장) | ~0.9800 |
| Rare | **1.0000** |
| Confusable | 0.9924 |
| ECE | 0.0052 |
| Comp | 0.9874 |

---

## ocrv6.pt — 현재 환경 첫 학습 (comp 0.9865)

- **상태**: 완료
- **환경**: 현재 개발 환경으로 이전 후 첫 학습
- **데이터**: dataset2 (55,177 train + 13,765 val = 68,942장, YOLO confidence ≥ 0.5 필터)
- **BEST**: ep43
- **특징**:
  - v5 학습 방식 그대로 현재 환경에서 재학습
  - Rare가 0.9748로 v5(1.0000) 대비 회귀 발생

### 성능

| 지표 | ocrv6.pt |
|------|---------|
| Val | 0.9903 |
| Hard | 0.9920 |
| Rare | **0.9748** (v5 대비 -2.52%p) |
| Confusable | 0.9880 |
| ECE | **0.0005** |
| Comp | 0.9865 |

---

## ocrv6.1 — 실패 (val=0.53 고착)

- **상태**: 실패
- **시도**: ocrv6.pt 기반에 ohjj 합성 데이터(6,399장) 추가 학습
- **실패 원인**:
  1. **Vocab 0-indexed 버그**: `char2idx = {c: i for ...}` → blank=0과 숫자"0"=0이 충돌
  2. **ohjj 도메인 충돌**: 고속도로 CCTV 극저해상도 데이터가 gradient 교란
- **교훈**: blank=0, char 1-indexed 규약 절대 유지. 도메인 충돌 시 합산 학습 금지

---

## ocrv6.2 — 실패 (ep1 즉시 붕괴)

- **상태**: 실패
- **시도**: ocrv6.pt 기반 파인튜닝 (ohjj 데이터 포함)
- **실패 원인**: ocrv6.1과 동일한 vocab 0-indexed 버그 + 도메인 충돌
- **증상**: ep1부터 val≈0.0000로 붕괴

---

## ocrv6.3 — 파인튜닝 완성 (comp 0.9918)

- **상태**: 완료
- **모델 파일**: `ocrv6.3/pt/best.pt` (31.9 MB, ep2)
- **방식**: ocrv6.pt → LR=5e-5 파인튜닝

### 주요 수정

- **Vocab 버그 수정**: 1-indexed 규약 복원
- **LR**: 1e-3 → **5e-5** (파인튜닝)
- **EMA 시작**: ep2부터 (기존 ep10)

### 성능

| 지표 | ocrv6.3 |
|------|---------|
| Val | **0.9970** |
| Hard | **1.0000** |
| Rare | **0.9748** (여전히 v5 대비 회귀) |
| Confusable | **0.9966** |
| ECE | 0.0041 |
| Comp | **0.9918** |

### 남은 문제
- Rare 0.9748: v5의 1.0000에서 여전히 회귀. WeightedRandomSampler(2배) 부족
- 3-run 재현성 검증 미실시
- ONNX 변환 미완료

---

## ocrv6.4 — From Scratch 재학습 (comp 0.9890)

- **상태**: 완료 (early-stop ep20)
- **모델 파일**: `ocrv6.4/pt/best.pt` (33 MB, ep8)
- **방식**: v5 방식으로 처음부터 새 데이터셋 학습

### 새 데이터셋 구성 (build_dataset.py)

```
실데이터   (ocrv6 dataset2 재분할) : ~62,000장
합성데이터  ohjj + yakhyo          : ~17,600장
제외       지역명 번호판 (~17,767장): PAT7/PAT8 불일치
─────────────────────────────────────────────────
Train: 63,753장  /  Val: 15,889장  (total 79,642)
```

### Hard Val Set (hard_split.py, 250장)

| 카테고리 | 수량 | 조건 |
|---------|------|------|
| small_plate | 63 | w≤80px 또는 h≤32px |
| motion_blur | 62 | Laplacian variance < 200 |
| night | 50 | 평균 휘도 < 80 |
| crop_cut | 38 | 가장자리 fg 비율 > 0.25 |
| skew | 25 | Hough 기반 기울기 > 5° |
| rare | 12 | 바·배·사·아·자·허 포함 |

### 트러블슈팅

**문제 1 — ep10 early-stop** (1차 학습 시도):
```
원인: best_comp=0.0 초기값 → ep1 comp=0.0이 BEST 조건 불만족
      → no_improve가 ep1부터 누적 → patience=10 소진
수정: best_comp=-1.0 / NUM_WORKERS=0 / PATIENCE_START=20
```

**문제 2 — ep20 early-stop + EMA 충격** (2차 학습 시도):
```
ep 8: rare=0.9904  (raw model BEST)
ep10: EMA 시작 → EMA 모델 평가로 전환 → rare=0.9809 (급락)
ep20: no_improve=13 → early-stop

원인: EMA 전환 시 raw model → EMA model로 평가 대상 변경되면서 충격
결론: ocrv6.5 파인튜닝으로 전환
```

### 성능 (ep8 BEST)

| 지표 | ocrv6.4 | Hard 카테고리별 |
|------|---------|----------------|
| Val | 0.9892 | S=1.000 |
| Hard | 0.9880 | **B=0.952 ← 약점** |
| Rare | 0.9904 | N=1.000 |
| Confusable | 0.9880 | C=1.000 |
| ECE | 0.0061 | K=1.000 |
| Comp | 0.9890 | R=1.000 |

---

## ocrv6.5 — 파인튜닝 최종 (comp 0.9980) ★

- **상태**: 완료 (early-stop ep24, BEST ep9)
- **모델 파일**: `ocrv6.5/pt/best.pt` (31.8 MB, ep9)
- **방식**: ocrv6.4 ep8 best.pt → LR=5e-5 파인튜닝

### 핵심 변경 (ocrv6.4 대비)

| 항목 | ocrv6.4 | ocrv6.5 | 이유 |
|------|---------|---------|------|
| 시작점 | 랜덤 | ocrv6.4 ep8 | 이미 수렴한 가중치 재사용 |
| LR | 1e-3 | **5e-5** | 파인튜닝 안정화 |
| EMA | ep10~, decay=0.999 | **제거** | EMA가 지표 고착 원인 |
| RARE_REWEIGHT | 3.0 | **4.0** | rare 추가 강화 |
| Augmentation | p1→p2→p3 커리큘럼 | **고정 p2** | 커리큘럼 불필요 |
| GRAD_CLIP | 5.0 | **2.0** | tight clip |
| PATIENCE | 10 / start=20 | **15 / start=5** | 파인튜닝 반영 |

### EMA 제거 배경

EMA_DECAY=0.9995로 처음 설계했으나, 50 epoch 내 새 학습 반영률이 `1-0.9995^50 ≈ 2.5%`에 불과해 지표가 완전히 고착되는 문제 발생. LR=5e-5 파인튜닝은 이미 안정적이므로 EMA 불필요.

### 학습 경과

```
ep  1: val=0.9959  hard=0.996  rare=0.9952  comp=0.9957  (BEST)
ep  3: val=0.9969  hard=0.996  rare=0.9952  comp=0.9959  (BEST)
ep  9: val=0.9972  hard=1.000  rare=0.9952  comp=0.9980  (BEST) ← 최종
ep 24: early-stop  no_improve=15

Hard 카테고리 ep9:
  S=1.000  B=1.000  N=1.000  C=1.000  K=1.000  R=1.000  (전 카테고리 완벽)
```

### 성능 (ep9 BEST)

| 지표 | ocrv6.5 | Hard 카테고리별 |
|------|---------|----------------|
| Val | **0.9972** | S=**1.000** |
| Hard | **1.0000** | B=**1.000** ← 해결 |
| Rare | **0.9952** | N=**1.000** |
| Confusable | **0.9970** | C=**1.000** |
| ECE | 0.0112 | K=**1.000** |
| **Comp** | **0.9980** | R=**1.000** |

### v5 대비 최종 성과

| 지표 | v5 | ocrv6.5 | 변화 |
|------|----|---------|------|
| Val | 0.9870 | **0.9972** | **+1.02%p** ↑ |
| Hard | ~0.9800 | **1.0000** | **+2.00%p** ↑ |
| Rare | **1.0000** | 0.9952 | -0.48%p (목표 0.99 초과) |
| Confusable | 0.9924 | **0.9970** | **+0.46%p** ↑ |
| ECE | **0.0052** | 0.0112 | 소폭 악화 |
| **Comp** | 0.9874 | **0.9980** | **+1.06%p** ↑ |

---

## 전체 개발 교훈

### 1. Vocab 규약 — 절대 변경 금지

```python
# 반드시 이 방식 유지 (blank=0, char 1-indexed)
char2idx = {c: i + 1 for i, c in enumerate(chars)}
idx2char = {i + 1: c for i, c in enumerate(chars)}
idx2char[0] = ""  # blank

# 이렇게 하면 val=0.0000 버그 발생 (ocrv6.1/6.2 실패 원인)
char2idx = {c: i for i, c in enumerate(chars)}  # 금지
```

### 2. 도메인 합산 학습 금지

ohjj(고속도로 CCTV 극저해상도) + 일반 실데이터 합산 시 gradient 교란 발생.  
해결책: 도메인별 단독 학습 후 별도 파인튜닝.

### 3. EMA 시작 타이밍

| 상황 | 권장 |
|------|------|
| From scratch (LR=1e-3) | ep10+ 이후 EMA 시작 |
| Fine-tuning (LR=5e-5) | EMA 제거 또는 decay≤0.99로 빠른 추적 |
| EMA_DECAY=0.9995, 50ep | 반영률 2.5% → 지표 고착 위험 |

### 4. best_comp 초기값

```python
best_comp = -1.0   # 반드시 음수로 초기화
# best_comp = 0.0 이면 ep1 comp=0.0이 BEST 조건 불만족 → no_improve 누적
```

### 5. Windows DataLoader

```python
NUM_WORKERS = 0    # Windows spawn 방식은 DataLoader 불안정
# NUM_WORKERS = 4  # 이 설정이 ep10 early-stop 원인 중 하나였음
```

### 6. 파인튜닝 > From Scratch (동일 문제)

ocrv6.4 ep8(rare=0.9904)을 시작점으로 파인튜닝한 ocrv6.5가 comp=0.9980으로 훨씬 빠르고 높은 성능 달성.  
ocrv6.3 선례(ep1~2에서 comp 0.9918)가 파인튜닝 효과를 이미 검증.

---

## 향후 로드맵

| 단계 | 내용 | 우선순위 |
|------|------|---------|
| 1 | ocrv6.5 3-run 재현성 검증 (seed 42/3407/2026) | 높음 |
| 2 | ONNX 변환 (opset 17, dynamic batch) | 높음 |
| 3 | TensorRT 엔진 변환 및 배포 테스트 | 중간 |
| 4 | ohjj 도메인 별도 파인튜닝 | 중간 |
| 5 | 지역명 번호판 지원 (detection 분기 방식) | 낮음 |

---

## 파일 위치 전체 맵

```
260521_ocr_project/
├── reference/
│   └── ocrv5/
│       ├── checkpoints/
│       │   ├── deploy_candidate_seed42.pt    v5 배포 모델 (32 MB)
│       │   └── deploy_candidate_seed42.onnx  ONNX 변환본
│       └── code/
│           ├── model.py      V5OCR 클래스 (모든 버전 공유)
│           ├── inference.py  V5Inference
│           └── ...
│
├── ocrv6/
│   └── pt/ocrv6.pt           ocrv6.pt (63.7 MB, ep43)
│
├── ocrv6.3/
│   ├── pt/best.pt             ocrv6.3 BEST (31.9 MB, ep2)
│   └── artifacts/             vocab, rare_chars, hard set
│
├── ocrv6.4/
│   ├── pt/
│   │   ├── best.pt            ocrv6.4 BEST (33 MB, ep8, comp=0.9890)
│   │   └── last.pt
│   ├── dataset/
│   │   ├── train/images/      63,753장
│   │   └── val/images/        15,889장
│   ├── artifacts/
│   │   ├── vocab.json
│   │   ├── rare_chars.json
│   │   └── splits/hard_dev_indices.json   hard val 250장
│   ├── scripts/
│   │   ├── build_dataset.py
│   │   ├── hard_split.py
│   │   └── train.py
│   └── logs/
│       ├── train.csv
│       └── metrics.json
│
├── ocrv6.5/                   ★ 최종 버전
│   ├── pt/
│   │   ├── best.pt            ★ 최종 모델 (31.8 MB, ep9, comp=0.9980)
│   │   └── last.pt
│   ├── artifacts/             (ocrv6.4에서 복사)
│   ├── scripts/train.py       파인튜닝 스크립트
│   ├── logs/
│   └── REPORT.md              개발 상세 보고서
│
└── VERSION_HISTORY.md         ← 이 파일
```
