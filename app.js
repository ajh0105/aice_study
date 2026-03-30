/* =============================================
   AICE Associate Study Guide — app.js
   ============================================= */

// ── TAB SWITCHING ──
(function initTabs() {
  const tabs    = document.querySelectorAll('.day-tab');
  const panels  = document.querySelectorAll('.day-content');

  function activateDay(n) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.day === String(n)));
    panels.forEach(p => p.classList.toggle('active', p.id === `day-${n}`));
    // persist selection
    try { localStorage.setItem('aice_active_day', n); } catch(e) {}
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateDay(tab.dataset.day));
  });

  // restore last visited day
  try {
    const saved = localStorage.getItem('aice_active_day');
    if (saved && document.getElementById(`day-${saved}`)) {
      activateDay(saved);
    }
  } catch(e) {}
})();


// ── D-DAY COUNTER ──
(function updateDday() {
  const examDate = new Date('2026-04-04T09:00:00+09:00');
  const now      = new Date();
  const diffMs   = examDate - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // update chips if still in the future
  const chip = document.querySelector('.meta-chip .mono');
  if (chip && chip.textContent === 'D-5') {
    if (diffDays > 0) {
      chip.textContent = `D-${diffDays}`;
    } else if (diffDays === 0) {
      chip.textContent = 'D-Day!';
      chip.style.color = '#f87171';
    } else {
      chip.textContent = '시험 종료';
    }
  }
})();


// ── CHECKLIST PERSISTENCE ──
(function initChecklist() {
  const items = document.querySelectorAll('.check-item input[type="checkbox"]');

  items.forEach((cb, i) => {
    const key = `aice_check_${i}`;
    // restore
    try { if (localStorage.getItem(key) === '1') cb.checked = true; } catch(e) {}
    // save on change
    cb.addEventListener('change', () => {
      try { localStorage.setItem(key, cb.checked ? '1' : '0'); } catch(e) {}
      updateCheckProgress();
    });
  });

  function updateCheckProgress() {
    const total   = items.length;
    const checked = [...items].filter(c => c.checked).length;
    // Optional: show count in title
    document.title = checked === total && total > 0
      ? '✅ AICE 체크리스트 완료!'
      : 'AICE Associate — 5일 합격 커리큘럼';
  }

  updateCheckProgress();
})();


// ── ANIMATE TIME BARS ON SCROLL ──
(function animateTimeBars() {
  const bars = document.querySelectorAll('.time-bar');
  if (!bars.length) return;

  // Store targets and zero them initially
  const targets = [];
  bars.forEach(bar => {
    targets.push(bar.style.width);
    bar.style.width = '0%';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      bars.forEach((bar, i) => {
        setTimeout(() => { bar.style.width = targets[i]; }, i * 120);
      });
      observer.disconnect();
    });
  }, { threshold: 0.3 });

  const timePlan = document.querySelector('.time-plan');
  if (timePlan) observer.observe(timePlan);
})();


// ── CODE BLOCK: COPY ON CLICK ──
(function addCopyButtons() {
  document.querySelectorAll('.code-block').forEach(block => {
    const btn = document.createElement('button');
    btn.textContent = '복사';
    btn.style.cssText = `
      position: absolute;
      top: 10px; right: 10px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #94a3b8;
      font-size: 11px;
      font-family: inherit;
      padding: 3px 10px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s;
    `;
    btn.addEventListener('mouseenter', () => btn.style.color = '#e2e8f0');
    btn.addEventListener('mouseleave', () => btn.style.color = '#94a3b8');

    btn.addEventListener('click', () => {
      const code = block.querySelector('code');
      // get plain text without HTML tags
      const text = code ? code.innerText : block.innerText;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ 복사됨';
        setTimeout(() => { btn.textContent = '복사'; }, 1800);
      }).catch(() => {
        btn.textContent = '실패';
        setTimeout(() => { btn.textContent = '복사'; }, 1800);
      });
    });

    block.style.position = 'relative';
    block.appendChild(btn);
  });
})();


// ── SMOOTH SCROLL FOR ANCHOR LINKS ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
