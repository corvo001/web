(() => {
  const gate = document.querySelector('[data-language-gate]');
  const mark = document.querySelector('[data-reactive-mark]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (gate && mark && !reduceMotion.matches) {
    const updateEye = (clientX, clientY) => {
      const rect = mark.getBoundingClientRect();
      const x = (clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
      const y = (clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
      const limitedX = Math.max(-1, Math.min(1, x));
      const limitedY = Math.max(-1, Math.min(1, y));
      mark.style.setProperty('--ry', `${limitedX * 4}deg`);
      mark.style.setProperty('--rx', `${limitedY * -4}deg`);
      mark.style.setProperty('--px', `${limitedX * 8}px`);
      mark.style.setProperty('--py', `${limitedY * 6}px`);
    };

    window.addEventListener('pointermove', (event) => updateEye(event.clientX, event.clientY), { passive: true });
    window.addEventListener('pointerleave', () => {
      ['--rx', '--ry'].forEach((property) => mark.style.setProperty(property, '0deg'));
      ['--px', '--py'].forEach((property) => mark.style.setProperty(property, '0px'));
    });
  }

  document.querySelectorAll('[data-language-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      document.body.classList.add('gate-exiting');
      window.setTimeout(() => window.location.assign(link.href), 820);
    });
  });
})();
