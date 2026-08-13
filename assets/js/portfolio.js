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
  const projectDepartureDuration = 1420;
  const projectReturnDuration = 1080;
  const projectDisplayFontReady = document.fonts?.load
    ? document.fonts.load('400 4rem "Dune Rise"', 'DYSON SWARM').then((fonts) => fonts.length > 0).catch(() => false)
    : Promise.resolve(false);

  const gateShouldReturn = () => history.state?.eyeGateReturn === true ||
    sessionStorage.getItem(eyeReturnKey) === '1' ||
    sessionStorage.getItem(eyeSessionKey) === '1';

  eyeTrackingLocked = gateShouldReturn();

  const waitForGateLayout = async () => {
    const image = mark?.querySelector('.reactive-mark__image');
    const waits = [];
    // External font hosts must never hold the eye behind the return veil.
    // The short ceiling still lets cached fonts settle before geometry is read.
    if (document.fonts?.ready) {
      waits.push(Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 120))
      ]));
    }
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
    const markRect = mark.getBoundingClientRect();
    const size = Math.max(markRect.width * .032, 1);
    // Exact centre of the transparent pupil aperture in the 1024 × 1024 logo.
    const centerX = markRect.left + (markRect.width * .5);
    const centerY = markRect.top + (markRect.height * (456.5 / 1024));
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
    document.querySelectorAll('.project-portal, .project-portal-backdrop, .project-world-signal, .project-world-title').forEach((portal) => portal.remove());
    document.querySelectorAll('[data-project-link].is-launching').forEach((link) => link.classList.remove('is-launching'));
    document.querySelectorAll('[data-project-media], [data-project-hero-media]').forEach((media) => { media.style.visibility = ''; });
  };

  const readProjectTransition = () => {
    try { return JSON.parse(sessionStorage.getItem(projectTransitionKey) || 'null'); }
    catch (error) { return null; }
  };

  const writeProjectTransition = (value) => sessionStorage.setItem(projectTransitionKey, JSON.stringify(value));

  const rectData = (rect) => ({
    left: rect.left,
    top: rect.top,
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1)
  });

  const validRect = (rect) => rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;

  const createProjectPortal = (media, fromRect, toRect, label = '', useDisplayFont = true) => {
    const portal = document.createElement('div');
    const backdrop = document.createElement('span');
    const signal = label ? document.createElement('span') : null;
    const title = label ? document.createElement('strong') : null;
    const clone = media.cloneNode(true);
    const translateX = toRect.left - fromRect.left;
    const translateY = toRect.top - fromRect.top;
    const scaleX = toRect.width / fromRect.width;
    const scaleY = toRect.height / fromRect.height;
    const worldScale = Math.max(window.innerWidth / fromRect.width, window.innerHeight / fromRect.height) * 1.12;
    const worldX = ((window.innerWidth - (fromRect.width * worldScale)) / 2) - fromRect.left;
    const worldY = ((window.innerHeight - (fromRect.height * worldScale)) / 2) - fromRect.top;

    clone.removeAttribute('loading');
    clone.removeAttribute('controls');
    clone.removeAttribute('data-project-media');
    clone.removeAttribute('data-project-hero-media');
    clone.className = 'project-portal__media';
    portal.className = 'project-portal';
    backdrop.className = 'project-portal-backdrop';
    if (signal && title) {
      signal.className = 'project-world-signal';
      title.className = `project-world-title${useDisplayFont ? ' project-display' : ' project-world-title--fallback'}`;
      title.textContent = label;
    }
    Object.assign(portal.style, {
      left: `${fromRect.left}px`, top: `${fromRect.top}px`, width: `${fromRect.width}px`, height: `${fromRect.height}px`,
      '--portal-x': `${translateX}px`, '--portal-y': `${translateY}px`,
      '--portal-scale-x': scaleX, '--portal-scale-y': scaleY,
      '--portal-world-x': `${worldX}px`, '--portal-world-y': `${worldY}px`, '--portal-world-scale': worldScale
    });
    portal.appendChild(clone);
    if (clone instanceof HTMLVideoElement) {
      clone.muted = true;
      clone.play().catch(() => {});
    }
    if (signal && title) document.documentElement.append(backdrop, signal, portal, title);
    else document.documentElement.append(backdrop, portal);
    return { portal, backdrop, signal, title };
  };

  const animateProjectPortalToElement = async (media, fromRect, onComplete) => {
    if (media instanceof HTMLImageElement && media.decode) await media.decode().catch(() => {});
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const toRect = rectData(media.getBoundingClientRect());
    if (!validRect(fromRect) || !validRect(toRect)) {
      document.documentElement.classList.remove('project-entry-boot');
      onComplete?.(toRect);
      return;
    }
    const { portal, backdrop, signal, title } = createProjectPortal(media, fromRect, toRect);
    media.style.visibility = 'hidden';
    portal.classList.add('no-transition');
    backdrop.classList.add('no-transition', 'is-active');
    document.documentElement.classList.remove('project-entry-boot');
    void portal.offsetWidth;
    portal.classList.remove('no-transition');
    backdrop.classList.remove('no-transition');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      portal.classList.add('is-at-target');
      backdrop.classList.remove('is-active');
    }));

    window.setTimeout(() => {
      portal.remove();
      backdrop.remove();
      signal?.remove();
      title?.remove();
      media.style.visibility = '';
      onComplete?.(toRect);
    }, projectReturnDuration + 80);
  };

  const departIntoProject = (link, media, fromRect, label, useDisplayFont) => {
    document.querySelectorAll('.project-portal, .project-portal-backdrop, .project-world-signal, .project-world-title').forEach((element) => element.remove());
    document.querySelectorAll('[data-project-media], [data-project-hero-media]').forEach((element) => { element.style.visibility = ''; });
    const worldRect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const { portal, backdrop, signal, title } = createProjectPortal(media, fromRect, worldRect, label, useDisplayFont);
    media.style.visibility = 'hidden';
    link.classList.add('is-launching');
    document.body.classList.add('project-portal-leaving');
    void portal.offsetWidth;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      portal.classList.add('is-departing-world');
      backdrop.classList.add('is-departing-world');
      signal.classList.add('is-departing');
      title.classList.add('is-departing');
    }));
    window.setTimeout(() => {
      writeProjectTransition({ id: link.dataset.projectId, phase: 'enter', rect: worldRect, label });
      window.location.assign(link.href);
    }, projectDepartureDuration);
  };

  const showProjectArrival = () => {
    const state = readProjectTransition();
    const hero = document.querySelector('[data-project-hero]');
    const media = hero?.querySelector('[data-project-hero-media]');
    if (!state || state.phase !== 'enter' || hero?.dataset.projectId !== state.id || !media || reduceMotion.matches || !validRect(state.rect)) {
      document.documentElement.classList.remove('project-entry-boot');
      return;
    }
    writeProjectTransition({ id: state.id, phase: 'inside', heroRect: rectData(media.getBoundingClientRect()) });
    animateProjectPortalToElement(media, state.rect, (heroRect) => {
      writeProjectTransition({ id: state.id, phase: 'inside', heroRect });
    });
  };

  const showProjectReturn = () => {
    const state = readProjectTransition();
    const link = state?.phase === 'inside' ? document.querySelector(`[data-project-link][data-project-id="${state.id}"]`) : null;
    const media = link?.querySelector('[data-project-media]');
    if (!media || reduceMotion.matches || !validRect(state?.heroRect)) return;
    link.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'start' });
    animateProjectPortalToElement(media, state.heroRect, () => sessionStorage.removeItem(projectTransitionKey));
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
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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

  const portfolioNav = document.querySelector('.portfolio-nav');
  if (portfolioNav) {
    let lastNavScroll = 0;
    window.addEventListener('scroll', () => {
      lastNavScroll = performance.now();
      portfolioNav.classList.add('nav-hover-locked');
    }, { passive: true });
    window.addEventListener('pointermove', () => {
      if (performance.now() - lastNavScroll > 100) portfolioNav.classList.remove('nav-hover-locked');
    }, { passive: true });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') portfolioNav.classList.remove('nav-hover-locked');
    });
  }

  document.querySelectorAll('.nav-logo').forEach((logo) => {
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

  document.querySelectorAll('[data-language-menu]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!reduceMotion.matches && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        sessionStorage.setItem(eyeReturnKey, '1');
        sessionStorage.removeItem(projectTransitionKey);
      }
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
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      const media = link.querySelector('[data-project-media]');
      if (!media || link.classList.contains('is-arming') || link.classList.contains('is-launching')) return;

      event.preventDefault();
      link.classList.add('is-arming');
      const useDisplayFont = await projectDisplayFontReady;
      if (!link.isConnected) return;
      link.classList.remove('is-arming');
      const rect = rectData(media.getBoundingClientRect());
      const label = link.querySelector('h3')?.textContent.trim() || link.dataset.projectId;
      departIntoProject(link, media, rect, label, useDisplayFont);
    });
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (link.hasAttribute('data-language-link') || link.hasAttribute('data-project-link') || reduceMotion.matches || event.defaultPrevented) return;
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

  document.querySelectorAll('.work-section').forEach((section) => {
    const backToHall = section.querySelector('[data-back-to-hall]');
    if (!backToHall) return;
    document.documentElement.appendChild(backToHall);
    let updateQueued = false;
    const updateBackToHall = () => {
      const rect = section.getBoundingClientRect();
      backToHall.classList.toggle('is-visible', rect.top <= window.innerHeight * .2 && rect.bottom > 0);
      updateQueued = false;
    };
    const queueBackToHallUpdate = () => {
      if (updateQueued) return;
      updateQueued = true;
      window.requestAnimationFrame(updateBackToHall);
    };
    window.addEventListener('scroll', queueBackToHallUpdate, { passive: true });
    window.addEventListener('resize', queueBackToHallUpdate, { passive: true });
    updateBackToHall();
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
