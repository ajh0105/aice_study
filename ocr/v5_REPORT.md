# v5.final 준비 결과

## 개요
스펙대로 한국 번호판 OCR v5 학습 코드 모듈 골격을 [d:/aa/training/v5/](d:/aa/training/v5/)에 생성. 학습은 미실시 (요청: "준비만해").

## 디렉토리 구조

```
d:/aa/training/v5/
  __init__.py
  config.py            # 경로/하이퍼파라미터/curriculum 스케줄
  vocab.py             # 학습 데이터 라벨에서 vocab + rare 산출
  hard_split.py        # hard val 자동 추출 (200~300장)
  dataset.py           # group-aware split + LPDataset (curriculum mixing)
  augmentation.py      # cv2 only curriculum aug (compression/blur/gamma/persp)
  model.py             # STN(BN) + Backbone + CBAM + 2-layer BiLSTM
  loss.py              # FocalCTC(γ=1.2) + sample reweight + LS toggle
  sampler.py           # synthetic mix 검증 helper
  optimizer_ema.py     # AdamW + warmup→cosine + EMA(ep10+)
  metrics.py           # overall/hard/rare/ECE/conf hist
  checkpoint.py        # composite score (0.5*hard+0.3*rare+0.2*overall) + ECE penalty
  grammar.py           # CTC beam search + 한국 번호판 패턴 검증
  inference.py         # V5Inference 클래스 + ONNX export
  train.py             # main loop (AMP, grad clip, EMA, early stop)
  run_3seeds.py        # 3-run 재현성 (seeds 42/3407/2026)
  REPORT.md            # 이 문서
```

## 결정사항 (사용자 답 미수신 → 합리적 기본값으로 진행)

| 항목 | 결정 | 근거 |
|---|---|---|
| Real 데이터 | aaa(13,260) + a1(69,706) = 82,966장 | 스펙 "Real manifold 유지" + 가장 깨끗 |
| Synthetic 풀 | [d:/aa/processed_v3/synth_images/](d:/aa/processed_v3/synth_images/) 재사용 | 5~8K 스펙 충족 추정, 새 생성 불필요 |
| Hard val 풀 | aaa+a1 안에서 추출 | 학습 데이터 manifold 와 동일 분포 |
| 모델 입력 | 48×160 (스펙 그대로) | v3는 32×128, v5는 v1과 동일 해상도 |
| Vocab | 데이터에서 재산출 (`vocab.py` 자동) | 51자 가정 X, 실제 분포 확인 |
| Rare | 빈도 하위 30% ∪ 명시 10자 | 스펙 그대로 |
| 출력 | [d:/aa/training/checkpoints_v5/](d:/aa/training/checkpoints_v5/) | 버전별 분리 |

## 주요 구현 디테일

### 1. Data leakage 방지 (`dataset.build_splits`)
- group key = plate label string
- val_ratio=0.05 → 그룹 단위 split
- hard val에 있는 path는 train/val pool에서 제외 (3중 격리)

### 2. Hard validation (`hard_split.py`)
- 5가지 조건 OR 결합
  - h ≤ 40px
  - Laplacian variance < 100
  - skew angle > 15° (Otsu+minAreaRect)
  - rare hangul 포함
  - visible char ratio < 0.85 (Otsu binarized 비율)
- 같은 plate label은 최대 1개 (group leakage 방지)
- target 200~300장

### 3. Synthetic curriculum (`config.synth_ratio`, `dataset.LPDataset.set_epoch`)
- ratio: 1-20→10%, 21-50→20%, 51-70→25%, 71+→20%
- DataLoader 재생성 X — `set_epoch(ep)` 호출로 동적 mix
- 매 epoch 시작 시 `_refresh_indices()` → real 전체 + ratio 만큼의 synth 무작위 표집

### 4. Augmentation curriculum (`augmentation.make_augment`)
- albumentations 비의존 (Python 3.14 호환 위해 cv2+numpy)
- phase: light(p≈0.15) / medium(p≈0.25) / heavy(p≈0.35)
- strength도 동시 변화 (jpeg q range, blur kernel, gamma range, perspective magnitude)
- `make_deterministic_augment(seed)` 옵션

### 5. Loss (`loss.FocalCTC`)
- per-sample CTC → focal modulator `(1-exp(-loss))^γ` (γ=1.2)
- sample_weight: rare hangul 포함 시 1.2 (`make_sample_weights`)
- label smoothing 토글 (기본 0.0)

### 6. Model (`model.V5OCR`) — 입력 (3,48,160) → 출력 (B,40,V)
- **STN**: Conv 3→16→32→64+BN, AdaptiveAvgPool(4,12), FC 3072→128→64→6, identity init
- **Backbone**: 4-stage VGG-like
  - b1: 3→64, MaxPool 2  →  (24,80)
  - b2: 64→128, MaxPool 2  →  (12,40)
  - b3: 128→256, MaxPool (2,1) → (6,40)
  - b4: 256→512, MaxPool (6,1) → (1,40)
- **CBAM**: ChannelAttention(r=16) → SpatialAttention(7×7) — `use_cbam=False` 토글 가능
- **BiLSTM**: 2-layer, hidden 256, dropout 0.1, bidirectional → 512
- **Classifier**: Linear(512 → num_classes)

### 7. Optim/EMA
- AdamW lr=1e-3, wd=1e-4
- LinearLR(warm 5ep) → CosineAnnealingLR(나머지) — SequentialLR
- EMA decay=0.999, epoch ≥ 10에서만 update
- AMP (GradScaler), grad clip 5.0

### 8. Metrics
- overall (sequence accuracy)
- hard accuracy (고정 hard val items 별도 평가)
- rare accuracy (rare 포함 라벨 부분집합 acc, 없으면 None → composite 가중치 재정규화)
- ECE (M=15 bins)
- confidence histogram (M=20 bins)
- train-val gap (train_loss proxy 사용 — TODO: 정확한 train acc 필요시 별도 패스)

### 9. Checkpoint (`checkpoint.CheckpointSelector`)
- composite = 0.5·hard + 0.3·rare + 0.2·overall (rare=None이면 hard/overall 정규화)
- ECE 1.5x 증가 → composite −0.005
- ECE 2x 증가 → 즉시 제외 (`forbid=True`)
- Best 기준 EMA 모델
- `best.pt`, `last.pt` 양쪽 저장

### 10. Inference (`V5Inference`)
- preprocess: bilinear 48×160 → BGR2RGB → /255 → (x-0.5)/0.5
- AMP autocast (cuda)
- grammar decoder ON (beam_width=10)
- EMA state 우선 로드
- `export_onnx(...)`: TensorRT용 ONNX 내보내기 (opset 17, dynamic batch)

### 11. Grammar Decoder (`grammar.beam_search_decode`)
- log-domain prefix beam search (CTC 표준)
- `is_valid_kr_plate()`: NN한글NNNN 또는 NNN한글NNNN
- pattern 통과 first-rank 후보 우선; 모두 실패 시 top-1 반환
- batch 처리 helper `grammar_decode_batch`

### 12. 3-run 검증 (`run_3seeds.py`)
- seeds [42, 3407, 2026]
- 각 run의 best epoch metrics 수집
- mean hard ≥ 0.987 / std ≤ 0.0008 PASS 표시

## 실행 순서 (학습 시작 시)

```powershell
# 1. vocab + rare 산출 (1회)
python -m v5.vocab

# 2. hard val 추출 (1회)
python -m v5.hard_split

# 3. group-aware split (1회)
python -m v5.dataset

# 4. 단일 seed 학습
python -m v5.train --seed 42

# 5. 3-run 재현성
python -m v5.run_3seeds

# 6. ONNX export (TensorRT 빌드는 외부 trtexec)
python -c "from v5.inference import export_onnx; export_onnx('d:/aa/training/checkpoints_v5/best.pt', 'd:/aa/training/checkpoints_v5/best.onnx')"
```

## 사전 의존성 (학습 시작 전 확인)

| 패키지 | 비고 |
|---|---|
| torch (CUDA) | 시스템에 이미 cu128 설치됨 (Python 3.14) |
| opencv-python | 설치됨 |
| numpy | 설치됨 |
| **albumentations 미사용** | cv2+numpy로 대체 (Python 3.14 호환 이슈 회피) |

> Python 3.14 환경에서 그대로 사용 가능. paddleocr venv (`d:/aa/venv_paddle`)는 v5 학습과 무관.

## 가정/제약 (확인 필요)

1. **synth gt 파일**: [d:/aa/processed_v3/gt_synth.txt](d:/aa/processed_v3/gt_synth.txt) 형식 = `filename\tlabel`. 파일 형식이 다르면 `dataset.load_synth_samples()` 수정 필요.
2. **a1 라벨 추출**: `_ocr-{X}.jpg` 패턴 사용 — auto_label_filter.py 의 a1 분류 로직과 일치 (ocr==label).
3. **aaa 라벨 추출**: `_v3-{X}_v1-{Y}` 에서 X (X==Y 일치 보장됨).
4. **train acc proxy**: 현재 `1 - mean(train_loss)` 임시값. 실제 train acc 계산이 필요하면 epoch 끝에 train sub-sample 평가 패스 추가.
5. **Hard val visible char ratio**: Otsu 기반 단순 휴리스틱. 더 정밀한 측정(텍스트 마스크 비율)이 필요하면 후처리 가능.

## 변경 사항 vs v3

| 항목 | v3 | v5 |
|---|---|---|
| 입력 해상도 | 32×128 | **48×160** |
| 출력 시퀀스 | 32 | **40** |
| STN | Conv 3→8→10 (BN 없음) | **Conv 3→16→32→64+BN, FC 3→레이어** |
| Mixup | α=0.2 | **제거** |
| Optimizer | Adam | **AdamW + wd=1e-4** |
| LR scheduler | warmup + cosine | 동일 |
| Loss | FocalCTC γ=2.0 + LS=0.1 | **FocalCTC γ=1.2 + sample reweight 1.2 (rare)** + LS=0.0 |
| EMA 시작 | ep5 | **ep10** |
| Augment | albumentations heavy | **cv2 curriculum (light→medium→heavy)** |
| Synth mix | 고정 비율 | **epoch 기반 curriculum (10→20→25→20%)** |
| Validation | overall만 | **overall + hard(고정) + rare + ECE + gap + hist** |
| Checkpoint | val_acc | **composite score + ECE penalty** |
| Decoder | greedy CTC | **beam(10) + 한국 번호판 grammar 검증** |
| 데이터 누수 | label group X | **group-aware split (plate string)** |

## 다음 액션 (사용자 결정 대기)

1. 학습 시작 명령 실행 (`python -m v5.train --seed 42`)
2. 또는 사전 단계 검토:
   - `python -m v5.vocab` → vocab/rare 통계 확인
   - `python -m v5.hard_split` → hard val 후보 분포 확인
   - 결과를 보고 임계값(40px, 100, 15°, 0.85) 조정 가능

## 오픈 이슈 / 차후 개선

- **vocab 의 num_classes**: 학습 시작 후 확정. 모델은 학습 진입 시점에 vocab 산출 결과로 초기화 (train.py가 자동).
- **synth 부족 시**: `synth_ratio` curriculum이 자동으로 가용 만큼만 사용 (n_synth = min(필요량, pool)).
- **TensorRT INT8 calibration**: `inference.export_onnx`만 제공. INT8 calibration set 500~1000장은 별도 dump 스크립트 필요 (TODO).
