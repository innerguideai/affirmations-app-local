/* ============================================================
   AI Affirm — tour.js
   Interactive walkthrough shown once on first use.
   Fires for all users (guest and account) if ig_tour_done !== '1'.
   ============================================================ */

const IG_TOUR_STEPS = [
  {
    targetId: 'emotionBubbles',
    title: 'How are you feeling?',
    body: 'Tap any emotion to get affirmations tailored to exactly how you feel right now.',
    position: 'below',
  },
  {
    targetId: null,
    title: 'Drill deeper (optional)',
    body: 'After picking an emotion, quick follow-up questions help tailor affirmations to what\'s actually driving the feeling. You can dismiss them any time.',
    position: 'center',
  },
  {
    targetId: null,
    title: 'Your affirmations',
    body: 'You can scroll through up to 3 saved affirmations for this emotion. Tap Next to move between them, and rate each one with the stars.',
    position: 'center',
  },
  {
    targetId: null,
    title: 'AI✦ affirmation',
    body: 'Want something more personal? The AI button generates a unique affirmation written just for your situation in real time.',
    position: 'center',
  },
  {
    targetId: 'themeToggleButton',
    title: 'Change your theme',
    body: 'Tap here to switch backgrounds — Cherry Blossom, Winter, Spring, and more. Pick the one that matches your mood.',
    position: 'above',
  },
  {
    targetId: 'profile-menu-btn',
    title: 'Settings & more',
    body: 'Tap the menu for your streak calendar, top emotions, reminder settings, and account options.',
    position: 'below',
  },
];

/* Wait for any CSS animations on el to finish before firing callback.
   Uses Web Animations API (.finished promise) with animationend fallback.
   If no animations are running, callback fires synchronously. */
function waitForAnimations(el, callback) {
  if (typeof el.getAnimations !== 'function') { callback(); return; }
  const active = el.getAnimations().filter(a => a.playState === 'running');
  if (active.length === 0) { callback(); return; }
  Promise.all(active.map(a => a.finished))
    .then(() => requestAnimationFrame(callback))
    .catch(() => callback());   // if animation is cancelled, proceed anyway
}

function startIgTour() {
  const spotlight = document.getElementById('ig-tour-spotlight');
  const backdrop  = document.getElementById('ig-tour-backdrop');
  const tooltip   = document.getElementById('ig-tour-tooltip');
  const dotsEl    = document.getElementById('ig-tour-dots');
  const stepLabel = document.getElementById('ig-tour-step-label');
  const titleEl   = document.getElementById('ig-tour-title');
  const bodyEl    = document.getElementById('ig-tour-body');
  const nextBtn   = document.getElementById('ig-tour-next');
  const skipBtn   = document.getElementById('ig-tour-skip');
  const arrowEl   = document.getElementById('ig-tour-arrow');

  if (!spotlight || !tooltip) return;

  let currentStep = 0;

  function endTour() {
    spotlight.style.display = 'none';
    backdrop.style.display  = 'none';
    tooltip.style.display   = 'none';
    try { localStorage.setItem('ig_tour_done', '1'); } catch (_) {}
  }

  function showStep(index) {
    if (index >= IG_TOUR_STEPS.length) { endTour(); return; }

    const step   = IG_TOUR_STEPS[index];
    const isLast = index === IG_TOUR_STEPS.length - 1;

    stepLabel.textContent = `${index + 1} of ${IG_TOUR_STEPS.length}`;
    titleEl.textContent   = step.title;
    bodyEl.textContent    = step.body;
    nextBtn.textContent   = isLast ? 'Done' : 'Next';

    dotsEl.innerHTML = IG_TOUR_STEPS.map((_, i) =>
      `<div class="tour-dot ${i === index ? 'active' : ''}"></div>`
    ).join('');

    const targetEl = step.targetId ? document.getElementById(step.targetId) : null;
    const PAD = 8;

    if (!targetEl || step.position === 'center') {
      spotlight.style.display = 'none';
      backdrop.style.display  = 'block';
      arrowEl.className       = 'tour-arrow';
      tooltip.style.display   = 'block';
      tooltip.style.left      = '50%';
      tooltip.style.top       = '50%';
      tooltip.style.bottom    = '';
      tooltip.style.transform = 'translate(-50%, -50%)';
    } else {
      /* Show backdrop while waiting for any entrance animation to finish,
         then swap to spotlight once element is in its final position. */
      backdrop.style.display  = 'block';
      spotlight.style.display = 'none';

      waitForAnimations(targetEl, () => {
        const rect = targetEl.getBoundingClientRect();
        backdrop.style.display = 'none';

        spotlight.style.display = 'block';
        spotlight.style.top     = `${rect.top    - PAD}px`;
        spotlight.style.left    = `${rect.left   - PAD}px`;
        spotlight.style.width   = `${rect.width  + PAD * 2}px`;
        spotlight.style.height  = `${rect.height + PAD * 2}px`;

        tooltip.style.display   = 'block';
        tooltip.style.transform = '';
        const tipW = Math.min(300, window.innerWidth - 32);
        let tipLeft = rect.left + rect.width / 2 - tipW / 2;
        tipLeft = Math.max(16, Math.min(tipLeft, window.innerWidth - tipW - 16));
        tooltip.style.left  = `${tipLeft}px`;
        tooltip.style.width = `${tipW}px`;

        if (step.position === 'below') {
          tooltip.style.top    = `${rect.bottom + PAD + 16}px`;
          tooltip.style.bottom = '';
          arrowEl.className    = 'tour-arrow up';
          arrowEl.style.left   = `${rect.left + rect.width / 2 - tipLeft - 9}px`;
        } else {
          tooltip.style.top    = '';
          tooltip.style.bottom = '';
          requestAnimationFrame(() => {
            const tipH = tooltip.offsetHeight;
            tooltip.style.top = `${rect.top - PAD - 16 - tipH}px`;
          });
          arrowEl.className  = 'tour-arrow down';
          arrowEl.style.left = `${rect.left + rect.width / 2 - tipLeft - 9}px`;
        }
      });
    }
  }

  nextBtn.onclick = () => { currentStep++; showStep(currentStep); };
  skipBtn.onclick = endTour;

  showStep(0);
}

window.startIgTour = startIgTour;
