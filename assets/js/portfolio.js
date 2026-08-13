(() => {
  const gate = document.querySelector('[data-language-gate]');
  const mark = document.querySelector('[data-reactive-mark]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const eyeSessionKey = 'portfolio-eye-entered';
  const eyeReturnKey = 'portfolio-eye-return';
  const projectTransitionKey = 'portfolio-project-transition';
  let gateEntrancePlayed = false;
  let eyeTrackingLocked = false;
  let lastPointerPosition = null;
  let updateEyeFromPointer = null;
  const eyeShakeDuration = 720;
  const eyeDiveDuration = 1120;

  const gateShouldReturn = () => history.state?.eyeGateReturn === true ||
    sessionStorage.getItem(eyeReturnKey) === '1' ||
    sessionStorage.getItem(eyeSessionKey) === '1';

  eyeTrackingLocked = gateShouldReturn();

  const waitForGateLayout = async () => {
    const image = mark?.querySelector('.reactive-mark__image');
    const waits = [];
    if (document.fonts?.ready) waits.push(document.fonts.ready);
    if (image?.decode) waits.push(image.decode().catch(() => {}));
    await Promise.all(waits);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  };

  const setPupilTransitionGeometry = () => {
    const pupil = mark?.querySelector('.reactive-mark__pupil');
    const transition = document.querySelector('[data-pupil-transition]');
    if (!pupil || !transition) return false;

    // The pupil follows the pointer. Always transition through its real,
    // centered resting position so the circle cannot drift between frames.
    mark.classList.add('eye-geometry-locked');
    mark.style.setProperty('--rx', '0deg');
    mark.style.setProperty('--ry', '0deg');
    mark.style.setProperty('--px', '0px');
    mark.style.setProperty('--py', '0px');
    void pupil.offsetWidth;
    const rect = pupil.getBoundingClientRect();
    const size = Math.max(rect.width, 1);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(centerX, window.innerWidth - centerX), Math.max(centerY, window.innerHeight - centerY));
    transition.style.setProperty('--pupil-x', `${centerX}px`);
    transition.style.setProperty('--pupil-y', `${centerY}px`);
    transition.style.setProperty('--pupil-size', `${size}px`);
    transition.style.setProperty('--pupil-scale', `${(radius * 3.2) / size}`);
    document.documentElement.appendChild(transition);
    return true;
  };

  const resetNavigationState = () => {
    document.documentElement.classList.remove('gate-preparing', 'gate-exiting', 'gate-entering', 'gate-settling', 'gate-return-boot');
    document.body.classList.remove('gate-preparing', 'gate-exiting', 'gate-entering', 'gate-settling', 'page-leaving', 'project-portal-leaving');
    document.querySelectorAll('.project-portal, .project-portal-backdrop').forEach((portal) => portal.remove());
    document.querySelectorAll('[data-project-media], [data-project-hero-media]').forEach((media) => { media.style.visibility = ''; });
  };

  const readProjectTransition = () => {
    try { return JSON.parse(sessionStorage.getItem(projectTransitionKey) || 'null'); }
    catch (error) { return null; }
  };

  const writeProjectTransition = (value) => sessionStorage.setItem(projectTransitionKey, JSON.stringify(value));

  const createProjectPortal = (media, rect) => {
    const portal = document.createElement('div');
    const backdrop = document.createElement('span');
    const clone = media.cloneNode(true);
    const scale = Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height) * 1.035;
    const translateX = (window.innerWidth / 2) - (rect.left + rect.width / 2);
    const translateY = (window.innerHeight / 2) - (rect.top + rect.height / 2);

    clone.removeAttribute('loading');
    clone.removeAttribute('controls');
    clone.removeAttribute('data-project-media');
    clone.removeAttribute('data-project-hero-media');
    clone.className = 'project-portal__media';
    portal.className = 'project-portal';
    backdrop.className = 'project-portal-backdrop';
    Object.assign(portal.style, {
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      '--portal-x': `${translateX}px`, '--portal-y': `${translateY}px`, '--portal-scale': scale
    });
    portal.appendChild(clone);
    if (clone instanceof HTMLVideoElement) {
      clone.muted = true;
      clone.play().catch(() => {});
    }
    document.documentElement.append(backdrop, portal);
    return { portal, backdrop };
  };

  const animateProjectPortalToElement = async (media, fromFullscreen, onComplete) => {
    if (media instanceof HTMLImageElement && media.decode) await media.decode().catch(() => {});
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const rect = media.getBoundingClientRect();
    const { portal, backdrop } = createProjectPortal(media, rect);
    media.style.visibility = 'hidden';

    if (fromFullscreen) {
      portal.classList.add('no-transition', 'is-fullscreen');
      backdrop.classList.add('no-transition', 'is-active');
      document.documentElement.classList.remove('project-entry-boot');
      void portal.offsetWidth;
      portal.classList.remove('no-transition');
      backdrop.classList.remove('no-transition');
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        portal.classList.remove('is-fullscreen');
        backdrop.classList.remove('is-active');
      }));
    } else {
      void portal.offsetWidth;
      window.requestAnimationFrame(() => {
        portal.classList.add('is-fullscreen');
        backdrop.classList.add('is-active');
      });
    }

    window.setTimeout(() => {
      portal.remove();
      backdrop.remove();
      media.style.visibility = '';
      onComplete?.();
    }, 980);
  };

  const showProjectArrival = () => {
    const state = readProjectTransition();
    const hero = document.querySelector('[data-project-hero]');
    const media = hero?.querySelector('[data-project-hero-media]');
    if (!state || state.phase !== 'enter' || hero?.dataset.projectId !== state.id || !media || reduceMotion.matches) {
      document.documentElement.classList.remove('project-entry-boot');
      return;
    }
    writeProjectTransition({ id: state.id, phase: 'inside' });
    animateProjectPortalToElement(media, true);
  };

  const showProjectReturn = () => {
    const state = readProjectTransition();
    const link = state?.phase === 'inside' ? document.querySelector(`[data-project-link][data-project-id="${state.id}"]`) : null;
    const media = link?.querySelector('[data-project-media]');
    if (!media || reduceMotion.matches) return;
    animateProjectPortalToElement(media, true, () => sessionStorage.removeItem(projectTransitionKey));
  };

  const showGateReturn = async () => {
    if (!gate || reduceMotion.matches || gateEntrancePlayed) return;
    if (!gateShouldReturn()) return;

    gateEntrancePlayed = true;
    eyeTrackingLocked = true;
    await waitForGateLayout();
    if (!setPupilTransitionGeometry()) {
      gateEntrancePlayed = false;
      return;
    }
    sessionStorage.removeItem(eyeReturnKey);
    sessionStorage.removeItem(eyeSessionKey);
    document.documentElement.classList.add('gate-return-mode');
    document.documentElement.classList.remove('gate-exiting', 'gate-return-boot');
    document.documentElement.classList.add('gate-entering');
    window.setTimeout(() => {
      document.documentElement.classList.remove('gate-entering');
      document.documentElement.classList.add('gate-settling');
      history.replaceState({ ...history.state, eyeGateReturn: false }, '');
    }, eyeDiveDuration);
    window.setTimeout(() => {
      document.documentElement.classList.remove('gate-settling');
      eyeTrackingLocked = false;
      if (mark && lastPointerPosition && updateEyeFromPointer) {
        mark.classList.remove('eye-geometry-locked');
        mark.classList.add('eye-tracking-resuming');
        updateEyeFromPointer(lastPointerPosition.x, lastPointerPosition.y);
        window.setTimeout(() => mark.classList.remove('eye-tracking-resuming'), 620);
      } else {
        mark?.classList.remove('eye-geometry-locked');
      }
    }, eyeDiveDuration + eyeShakeDuration);
  };

  window.addEventListener('pageshow', (event) => {
    // Never animate a document frozen by the browser's history cache. Reload it
    // once and let the boot veil keep the transition visually continuous.
    if (gate && event.persisted) {
      sessionStorage.setItem(eyeReturnKey, '1');
      window.location.reload();
      return;
    }
    if (gateShouldReturn()) showGateReturn();
    else {
      resetNavigationState();
      showProjectArrival();
      showProjectReturn();
    }
  });
  window.addEventListener('pagehide', () => {
    if (gate && !reduceMotion.matches && gateShouldReturn()) document.documentElement.classList.add('gate-return-boot');
    gateEntrancePlayed = false;
  });
  resetNavigationState();

  document.querySelectorAll('.nav-logo').forEach((logo) => {
    logo.addEventListener('click', (event) => {
      if (!reduceMotion.matches && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        sessionStorage.setItem(eyeReturnKey, '1');
      }
    });

    if (reduceMotion.matches) return;

    logo.addEventListener('pointermove', (event) => {
      const rect = logo.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      logo.style.setProperty('--nav-pupil-x', `${Math.max(-1, Math.min(1, x)) * 1.8}px`);
      logo.style.setProperty('--nav-pupil-y', `${Math.max(-1, Math.min(1, y)) * 1.4}px`);
    });

    logo.addEventListener('pointerleave', () => {
      logo.style.setProperty('--nav-pupil-x', '0px');
      logo.style.setProperty('--nav-pupil-y', '0px');
    });
  });

  if (gate && mark && !reduceMotion.matches) {
    updateEyeFromPointer = (clientX, clientY) => {
      lastPointerPosition = { x: clientX, y: clientY };
      if (eyeTrackingLocked) return;
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

    window.addEventListener('pointermove', (event) => updateEyeFromPointer(event.clientX, event.clientY), { passive: true });
    window.addEventListener('pointerleave', () => {
      ['--rx', '--ry'].forEach((property) => mark.style.setProperty(property, '0deg'));
      ['--px', '--py'].forEach((property) => mark.style.setProperty(property, '0px'));
    });
  }

  document.querySelectorAll('[data-language-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      eyeTrackingLocked = true;
      sessionStorage.setItem(eyeSessionKey, '1');
      history.replaceState({ ...history.state, eyeGateReturn: true }, '');
      setPupilTransitionGeometry();
      document.documentElement.classList.add('gate-preparing');
      window.setTimeout(() => {
        document.documentElement.classList.remove('gate-preparing');
        document.documentElement.classList.add('gate-exiting');
      }, eyeShakeDuration);
      window.setTimeout(() => window.location.assign(link.href), eyeShakeDuration + eyeDiveDuration);
    });
  });

  document.querySelectorAll('[data-project-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      const media = link.querySelector('[data-project-media]');
      if (!media) return;

      event.preventDefault();
      const rect = media.getBoundingClientRect();
      const { portal, backdrop } = createProjectPortal(media, rect);
      writeProjectTransition({ id: link.dataset.projectId, phase: 'enter' });
      media.style.visibility = 'hidden';
      document.body.classList.add('project-portal-leaving');
      void portal.offsetWidth;
      window.requestAnimationFrame(() => {
        portal.classList.add('is-fullscreen');
        backdrop.classList.add('is-active');
      });
      window.setTimeout(() => window.location.assign(link.href), 920);
    });
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (link.hasAttribute('data-language-link') || reduceMotion.matches || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin || target.protocol === 'mailto:' || target.protocol === 'tel:') return;
      if (target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
      event.preventDefault();
      document.body.classList.add('page-leaving');
      window.setTimeout(() => window.location.assign(target.href), 320);
    });
  });

  document.querySelectorAll('[data-project-track]').forEach((track) => {
    const section = track.closest('.work-section');
    const previous = section?.querySelector('[data-project-previous]');
    const next = section?.querySelector('[data-project-next]');
    const cards = [...track.querySelectorAll('.project-card')];
    if (!previous || !next || cards.length < 2) return;

    const activeIndex = () => {
      const trackLeft = track.getBoundingClientRect().left;
      return cards.reduce((closest, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
        return distance < closest.distance ? { index, distance } : closest;
      }, { index: 0, distance: Infinity }).index;
    };

    const updateControls = () => {
      const index = activeIndex();
      previous.disabled = index === 0;
      next.disabled = index === cards.length - 1;
    };

    const goTo = (index) => {
      cards[Math.max(0, Math.min(cards.length - 1, index))].scrollIntoView({
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'start'
      });
    };

    previous.addEventListener('click', () => goTo(activeIndex() - 1));
    next.addEventListener('click', () => goTo(activeIndex() + 1));
    track.addEventListener('scroll', () => window.requestAnimationFrame(updateControls), { passive: true });
    window.addEventListener('resize', updateControls, { passive: true });
    updateControls();
  });

  document.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const track = gallery.querySelector('[data-gallery-track]');
    const previous = gallery.querySelector('[data-gallery-previous]');
    const next = gallery.querySelector('[data-gallery-next]');
    const slides = [...gallery.querySelectorAll('.project-gallery__slide')];
    if (!track || !previous || !next || slides.length < 2) return;

    const activeIndex = () => Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))));
    const updateControls = () => {
      const index = activeIndex();
      previous.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    };
    const goTo = (index) => slides[Math.max(0, Math.min(slides.length - 1, index))].scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start'
    });

    previous.addEventListener('click', () => goTo(activeIndex() - 1));
    next.addEventListener('click', () => goTo(activeIndex() + 1));
    track.addEventListener('scroll', () => window.requestAnimationFrame(updateControls), { passive: true });
    window.addEventListener('resize', updateControls, { passive: true });
    updateControls();
  });
})();
