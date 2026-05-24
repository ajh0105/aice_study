/* ═══════════════════════════════════════════════════════
   OCR Academy — script.js
   ═══════════════════════════════════════════════════════ */

/* ── 네비게이션 ────────────────────────────────────────── */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-target="${id}"]`);
  if (navItem) navItem.classList.add('active');

  document.getElementById('topbar-title').textContent =
    navItem ? navItem.querySelector('.nav-label').textContent : '';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 바 차트 애니메이션 실행
  if (id === 'sec-perf') setTimeout(animateBars, 200);
  if (id === 'sec-perf') setTimeout(drawRadar, 300);

  // 사이드바 닫기 (모바일)
  document.getElementById('sidebar').classList.remove('open');
}

/* ── 읽기 진행 바 ──────────────────────────────────────── */
window.addEventListener('scroll', () => {
  const docH  = document.documentElement.scrollHeight - window.innerHeight;
  const pct   = docH > 0 ? (window.scrollY / docH) * 100 : 0;
  document.getElementById('reading-progress-inner').style.width = pct + '%';
});

/* ── 트러블슈팅 아코디언 ─────────────────────────────────── */
function toggleTs(header) {
  const body = header.nextElementSibling;
  const isOpen = header.classList.contains('open');
  document.querySelectorAll('.ts-header').forEach(h => {
    h.classList.remove('open');
    h.nextElementSibling.classList.remove('show');
  });
  if (!isOpen) {
    header.classList.add('open');
    body.classList.add('show');
  }
}

/* ── Q&A 아코디언 ────────────────────────────────────────── */
function toggleQa(qEl) {
  const answer = qEl.nextElementSibling;
  const isOpen = qEl.classList.contains('open');
  document.querySelectorAll('.qa-q').forEach(q => {
    q.classList.remove('open');
    q.nextElementSibling.classList.remove('show');
  });
  if (!isOpen) {
    qEl.classList.add('open');
    answer.classList.add('show');
  }
}

/* ── 바 차트 애니메이션 ──────────────────────────────────── */
function animateBars() {
  document.querySelectorAll('.bar-fill').forEach(bar => {
    const target = bar.dataset.width;
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = target; }, 50);
  });
}

/* ── 레이더/캔버스 차트 ──────────────────────────────────── */
function drawRadar() {
  const canvas = document.getElementById('radarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) / 2 - 40;

  ctx.clearRect(0, 0, W, H);

  const axes  = ['Val', 'Hard', 'Rare', 'Conf', 'Comp'];
  const n     = axes.length;
  const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;

  // 배경 그리드
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(scale => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = cx + R * scale * Math.cos(angle(i));
      const y = cy + R * scale * Math.sin(angle(i));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  });

  // 축
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(angle(i)), cy + R * Math.sin(angle(i)));
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();
  }

  // 레이블
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  axes.forEach((label, i) => {
    const x = cx + (R + 22) * Math.cos(angle(i));
    const y = cy + (R + 22) * Math.sin(angle(i));
    ctx.fillText(label, x, y);
  });

  // 데이터셋
  const datasets = [
    { label: 'v5',      values: [0.9870, 0.9800, 1.0000, 0.9924, 0.9874], color: '#3b82f6' },
    { label: 'ocrv6.3', values: [0.9970, 1.0000, 0.9748, 0.9966, 0.9918], color: '#f59e0b' },
    { label: 'ocrv6.5', values: [0.9972, 1.0000, 0.9952, 0.9970, 0.9980], color: '#10b981' },
  ];

  const minVal = 0.97;
  const normalize = v => Math.max(0, (v - minVal) / (1.0 - minVal));

  datasets.forEach(({ values, color }) => {
    ctx.beginPath();
    values.forEach((v, i) => {
      const r = R * normalize(v);
      const x = cx + r * Math.cos(angle(i));
      const y = cy + r * Math.sin(angle(i));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color + '30';
    ctx.fill();
  });
}

/* ── 햄버거 메뉴 (모바일) ────────────────────────────────── */
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ── 초기화 ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  showSection('sec-intro');
});
