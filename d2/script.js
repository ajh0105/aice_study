/* ================================================================
   AICE Associate 치트시트 — script.js
================================================================ */

// ── 1. Dark Mode ──────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

const savedTheme = localStorage.getItem('aice-theme') || 'light';
html.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('aice-theme', next);
});

// ── 2. Tab Navigation ─────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(`tab-${target}`)?.classList.add('active');

    // Scroll to top of content
    document.querySelector('.main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ── 3. Copy Button ────────────────────────────────────────────
const toast = document.getElementById('toast');
let toastTimer = null;

function showToast(msg = '📋 복사됨!') {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const block = document.getElementById(targetId);
    if (!block) return;

    const text = block.querySelector('code')?.innerText || block.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ 완료';
      btn.classList.add('copied');
      showToast('📋 코드 복사됨!');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('📋 코드 복사됨!');
    });
  });
});

// ── 4. Search ─────────────────────────────────────────────────
const searchInput  = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// Index of searchable content
const searchIndex = [
  // ── Preprocess
  { tab: 'preprocess', id: 'code-import',    label: 'Import 완전판',             preview: 'import pandas as pd, numpy, sklearn...' },
  { tab: 'preprocess', id: 'code-eda',       label: 'EDA 기본 패턴',             preview: 'df.shape, info, describe, isnull().sum()' },
  { tab: 'preprocess', id: 'code-missing',   label: '결측치 처리',               preview: 'fillna(median), fillna(mode()[0])' },
  { tab: 'preprocess', id: 'code-encode',    label: '인코딩',                    preview: 'get_dummies, LabelEncoder, map' },
  { tab: 'preprocess', id: 'code-split',     label: '피처/타겟 분리 & 분할',      preview: 'X=df.drop, train_test_split, stratify=y' },
  { tab: 'preprocess', id: 'code-scale',     label: '스케일링 ⚠️',               preview: 'fit_transform(train), transform(test)' },
  { tab: 'preprocess', id: 'code-viz',       label: '시각화 패턴',               preview: 'histplot, boxplot, heatmap, countplot' },
  // ── Model
  { tab: 'model',      id: 'code-clf',       label: '분류 모델 학습 & 평가',     preview: 'RandomForestClassifier, accuracy_score, roc_auc_score' },
  { tab: 'model',      id: 'code-reg',       label: '회귀 모델 학습 & 평가',     preview: 'RandomForestRegressor, RMSE, r2_score' },
  { tab: 'model',      id: 'code-grid',      label: 'GridSearchCV 튜닝',         preview: 'param_grid, cv=5, best_params_, best_estimator_' },
  { tab: 'model',      id: 'code-imbalance', label: '클래스 불균형 처리',        preview: 'class_weight=balanced, compute_class_weight, threshold' },
  // ── DeepLearning
  { tab: 'deeplearning', id: 'code-dl-binary', label: '이진 분류 딥러닝',       preview: 'sigmoid, binary_crossentropy, EarlyStopping, Dropout' },
  { tab: 'deeplearning', id: 'code-dl-reg',    label: '회귀 딥러닝',            preview: 'linear, mse, Dense, model.predict' },
  { tab: 'deeplearning', id: 'code-dl-imbalance', label: '딥러닝 클래스 불균형', preview: 'compute_class_weight, class_weight=cw_dict' },
];

function doSearch(q) {
  if (!q.trim()) {
    searchResults.classList.remove('open');
    return;
  }

  const lower = q.toLowerCase();
  const hits = searchIndex.filter(item =>
    item.label.toLowerCase().includes(lower) ||
    item.preview.toLowerCase().includes(lower) ||
    item.id.toLowerCase().includes(lower)
  ).slice(0, 6);

  if (hits.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item" style="color:var(--text-muted)">검색 결과 없음</div>';
    searchResults.classList.add('open');
    return;
  }

  searchResults.innerHTML = hits.map(item => `
    <div class="search-result-item" data-tab="${item.tab}" data-id="${item.id}">
      <div class="result-label">${tabLabel(item.tab)}</div>
      <div>${item.label}</div>
      <div class="result-code">${item.preview}</div>
    </div>
  `).join('');

  searchResults.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const tabName = el.dataset.tab;
      const codeId  = el.dataset.id;

      // Switch to correct tab
      const matchBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
      if (matchBtn) matchBtn.click();

      // Scroll to code block
      setTimeout(() => {
        const target = document.getElementById(codeId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.closest('.code-section')?.classList.add('flash');
          setTimeout(() => target.closest('.code-section')?.classList.remove('flash'), 1200);
        }
      }, 100);

      searchResults.classList.remove('open');
      searchInput.value = '';
    });
  });

  searchResults.classList.add('open');
}

function tabLabel(tab) {
  const map = {
    preprocess: '🔧 전처리',
    model: '🤖 모델',
    deeplearning: '🧠 딥러닝',
  };
  return map[tab] || tab;
}

searchInput.addEventListener('input', e => doSearch(e.target.value));
searchInput.addEventListener('focus', e => { if (e.target.value) doSearch(e.target.value); });

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    searchResults.classList.remove('open');
  }
});

// Flash animation
const flashStyle = document.createElement('style');
flashStyle.textContent = `
  .flash { animation: flashAnim .6s ease; }
  @keyframes flashAnim {
    0%   { outline: 3px solid #3b82f6; outline-offset: 2px; }
    100% { outline: 3px solid transparent; }
  }
`;
document.head.appendChild(flashStyle);

// ── 5. Checklist persistence ──────────────────────────────────
const checkItems = document.querySelectorAll('.check-item input[type="checkbox"]');

// Load saved state
const savedChecks = JSON.parse(localStorage.getItem('aice-checks') || '{}');
checkItems.forEach((cb, i) => {
  if (savedChecks[i]) {
    cb.checked = true;
    cb.closest('.check-item').classList.add('done');
  }
  cb.addEventListener('change', () => {
    const parent = cb.closest('.check-item');
    parent.classList.toggle('done', cb.checked);
    // Save state
    const state = {};
    checkItems.forEach((c, idx) => { state[idx] = c.checked; });
    localStorage.setItem('aice-checks', JSON.stringify(state));
    if (cb.checked) showToast('✅ 체크 완료!');
  });
});

// ── 6. Syntax Highlighting (lightweight) ──────────────────────
const KEYWORDS = /\b(import|from|for|in|if|else|elif|return|print|def|class|True|False|None|and|or|not|as|with|pass)\b/g;
const STRINGS  = /((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g;
const COMMENTS = /(#[^\n]*)/g;
const NUMBERS  = /\b(\d+\.?\d*)\b/g;
const FUNCS    = /\b([a-zA-Z_]\w*)\s*(?=\()/g;

function highlight(code) {
  // Escape HTML first
  let s = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply in safe order
  s = s.replace(STRINGS,  '<span class="token-string">$1</span>');
  s = s.replace(COMMENTS, '<span class="token-comment">$1</span>');
  s = s.replace(KEYWORDS, '<span class="token-keyword">$1</span>');
  s = s.replace(NUMBERS,  '<span class="token-number">$1</span>');
  s = s.replace(FUNCS,    '<span class="token-func">$1</span>');
  return s;
}

document.querySelectorAll('.code-block code').forEach(el => {
  el.innerHTML = highlight(el.textContent);
});

// ── 7. Tab sticky position recalculate on resize ──────────────
function recalcTabTop() {
  const header = document.querySelector('.site-header');
  const nav    = document.querySelector('.tab-nav');
  if (header && nav) {
    nav.style.top = header.offsetHeight + 'px';
  }
}
window.addEventListener('resize', recalcTabTop);
recalcTabTop();
