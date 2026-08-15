(() => {
  const gate = document.querySelector('[data-language-gate]');
  const mark = document.querySelector('[data-reactive-mark]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const supportsCrossDocumentViewTransitions = 'onpagereveal' in window;
  const eyeSessionKey = 'portfolio-eye-entered';
  const eyeReturnKey = 'portfolio-eye-return';
  const eyeHallTransitionKey = 'portfolio-eye-hall-transition';
  const eyeGateTransitionKey = 'portfolio-eye-gate-transition';
  const projectTransitionKey = 'portfolio-project-transition';
  const archiveTransitionKey = 'portfolio-archive-transition';
  const pageTransitionKey = 'portfolio-page-transition';
  let eyeTrackingLocked = false;
  let gateReturnPlaying = false;
  let gateInitialStateHandled = false;
  let hallEyeArrivalPlaying = false;
  let archiveArrivalPlaying = false;
  let projectArrivalPlaying = false;
  let navigationInProgress = false;
  let lastPointerPosition = null;
  let updateEyeFromPointer = null;
  let frozenEyeAnimations = [];
  let frozenEyeSvgs = [];
  const eyePrepareDuration = 360;
  const eyeDiveDuration = 920;
  const eyeCodeDuration = 1640;
  const projectDepartureDuration = 1280;
  const projectArrivalDuration = 620;
  const archiveCycleDuration = 1600;
  const archiveHandoffDuration = 880;
  const pageDepartureDuration = 460;
  let projectDisplayFontAvailable = false;
  const warmedProjectVideos = new Map();
  const warmedNavigationPages = new Map();

  const consumeResponse = async (response) => {
    const reader = response.body?.getReader();
    if (!reader) {
      await response.arrayBuffer();
      return;
    }
    while (!(await reader.read()).done) { /* Fill the HTTP cache before the handoff. */ }
  };

  const collectNavigationResources = (html, target) => {
    const targetDocument = new DOMParser().parseFromString(html, 'text/html');
    const resources = new Set();
    const resolve = (value) => {
      if (!value) return null;
      const resource = new URL(value, target);
      return resource.origin === window.location.origin ? resource.href : null;
    };
    const add = (value) => {
      const resource = resolve(value);
      if (resource) resources.add(resource);
    };

    targetDocument.querySelectorAll('link[rel="stylesheet"][href], link[rel="preload"][href]').forEach((element) => add(element.getAttribute('href')));
    targetDocument.querySelectorAll('script[src]').forEach((element) => add(element.getAttribute('src')));
    targetDocument.querySelectorAll('.nav-logo img[src], .reactive-mark__image[src]').forEach((element) => add(element.getAttribute('src')));
    const activeMedia = targetDocument.querySelector(
      '[data-project-hero-media], .hero-project.is-active [data-project-media], .project-index-card [data-project-media]'
    );
    const preparedMedia = activeMedia || targetDocument.querySelector('.reactive-mark__image');
    if (activeMedia) {
      add(activeMedia.getAttribute('src'));
      add(activeMedia.getAttribute('data-src'));
      add(activeMedia.getAttribute('poster'));
    }
    return {
      resources: [...resources],
      activeMedia: preparedMedia ? {
        type: preparedMedia.tagName.toLowerCase(),
        source: resolve(preparedMedia.getAttribute('src') || preparedMedia.getAttribute('data-src')),
        poster: resolve(preparedMedia.getAttribute('poster'))
      } : null
    };
  };

  const primeNavigationMedia = (media, signal) => {
    if (!media?.source) return Promise.resolve();
    if (media.type === 'img') {
      return new Promise((resolve, reject) => {
        const image = new Image();
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        };
        const onAbort = () => finish(new DOMException('Image preload aborted', 'AbortError'));
        const timeout = window.setTimeout(() => finish(new Error('Image decode timed out')), 2000);
        signal.addEventListener('abort', onAbort, { once: true });
        image.decoding = 'async';
        image.src = media.source;
        const decode = image.decode?.();
        if (decode) decode.then(() => finish(), () => finish(new Error('Image decode failed')));
        else {
          image.addEventListener('load', () => finish(), { once: true });
          image.addEventListener('error', () => finish(new Error('Image preload failed')), { once: true });
        }
      });
    }
    if (media.type !== 'video') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
        if (error) reject(error);
        else resolve();
      };
      const onReady = () => finish();
      const onError = () => finish(new Error('Media decode failed'));
      const onAbort = () => finish(new DOMException('Media preload aborted', 'AbortError'));
      const timeout = window.setTimeout(() => finish(new Error('Media decode timed out')), 3000);
      signal.addEventListener('abort', onAbort, { once: true });
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = 'auto';
      if (media.poster) video.poster = media.poster;
      video.src = media.source;
      video.load();
    });
  };

  const warmNavigationPage = (link) => {
    const target = link?.href;
    if (!target) return Promise.resolve(false);
    const activeWarmup = warmedNavigationPages.get(target);
    if (activeWarmup) return activeWarmup;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const warmup = fetch(target, { cache: 'force-cache', priority: 'high', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Page preload failed: ${response.status}`);
        const html = await response.text();
        const { resources, activeMedia } = collectNavigationResources(html, target);
        await Promise.all(resources.map(async (resource) => {
          const assetResponse = await fetch(resource, { cache: 'force-cache', priority: 'high', signal: controller.signal });
          if (!assetResponse.ok) throw new Error(`Asset preload failed: ${assetResponse.status}`);
          await consumeResponse(assetResponse);
        }));
        await primeNavigationMedia(activeMedia, controller.signal);
        return true;
      })
      .catch(() => {
        warmedNavigationPages.delete(target);
        return false;
      })
      .finally(() => window.clearTimeout(timeout));
    warmedNavigationPages.set(target, warmup);
    return warmup;
  };

  const ensureVideoSource = (video) => {
    const source = video?.dataset.src;
    if (!source || video.getAttribute('src')) return;
    video.preload = 'auto';
    video.src = source;
    video.removeAttribute('data-src');
    video.load();
  };

  const warmProjectVideo = (link) => {
    const source = link?.dataset.projectVideo;
    if (!source) return Promise.resolve(false);
    const activeWarmup = warmedProjectVideos.get(source);
    if (activeWarmup) return activeWarmup;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const warmup = fetch(source, { cache: 'force-cache', priority: 'high', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Video preload failed: ${response.status}`);
        await consumeResponse(response);
        return true;
      })
      .catch(() => {
        warmedProjectVideos.delete(source);
        return false;
      })
      .finally(() => window.clearTimeout(timeout));
    warmedProjectVideos.set(source, warmup);
    return warmup;
  };

  if (document.fonts?.load) {
    document.fonts.load('400 4rem "Dune Rise"', 'DYSON SWARM')
      .then((fonts) => { projectDisplayFontAvailable = fonts.length > 0; })
      .catch(() => {});
  }

  const navigationType = performance.getEntriesByType('navigation')[0]?.type;
  const gateHasReturnState = () => history.state?.eyeGateReturn === true ||
    sessionStorage.getItem(eyeReturnKey) === '1' ||
    sessionStorage.getItem(eyeSessionKey) === '1';

  eyeTrackingLocked = gate && document.documentElement.classList.contains('gate-natural-entry');

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
    const coverRadius = radius + 2;
    const handoffRadius = Math.max((size / 2) + 1, coverRadius * .52);
    transition.style.setProperty('--pupil-x', `${centerX}px`);
    transition.style.setProperty('--pupil-y', `${centerY}px`);
    transition.style.setProperty('--pupil-radius', `${size / 2}px`);
    transition.style.setProperty('--pupil-cover-radius', `${coverRadius}px`);
    transition.style.setProperty('--pupil-handoff-radius', `${handoffRadius}px`);
    ['--pupil-start-x', '--pupil-start-y', '--pupil-start-radius', '--pupil-start-edge-opacity'].forEach((property) => {
      transition.style.removeProperty(property);
    });
    document.documentElement.appendChild(transition);
    return { x: centerX, y: centerY, radius: size / 2, coverRadius, handoffRadius };
  };

  const readEyeGateTransition = () => {
    try {
      const state = JSON.parse(sessionStorage.getItem(eyeGateTransitionKey) || 'null');
      const isExpectedGate = state?.path === window.location.pathname;
      const isRecent = Date.now() - Number(state?.startedAt || 0) < 8000;
      return isExpectedGate && isRecent ? state : null;
    } catch (error) {
      return null;
    }
  };

  const hasManualEyeTransition = (key) => {
    try {
      const state = JSON.parse(sessionStorage.getItem(key) || 'null');
      return state?.mode === 'manual' && Date.now() - Number(state.startedAt || 0) < 8000;
    } catch (error) {
      return false;
    }
  };

  const freezeEyeHandoffSource = () => {
    document.documentElement.classList.add('eye-handoff-frozen');
    document.querySelectorAll('video').forEach((video) => {
      clearProjectVideoRetries(video);
      video.pause();
    });
    frozenEyeSvgs = [...document.querySelectorAll('svg')];
    frozenEyeSvgs.forEach((svg) => svg.pauseAnimations?.());
    try {
      frozenEyeAnimations = (document.body?.getAnimations?.({ subtree: true }) || []).filter((animation) => {
        const target = animation.effect?.target;
        return target !== document.body && target !== document.documentElement;
      });
      frozenEyeAnimations.forEach((animation) => animation.pause());
    } catch (error) { /* CSS pause remains the compatibility fallback. */ }
  };

  const releaseEyeHandoffSource = () => {
    frozenEyeAnimations.forEach((animation) => {
      if (animation.playState === 'paused') animation.play();
    });
    frozenEyeSvgs.forEach((svg) => svg.unpauseAnimations?.());
    frozenEyeAnimations = [];
    frozenEyeSvgs = [];
  };

  const nextPaint = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });

  const waitForGateLayout = async () => {
    const waits = [];
    if (document.fonts?.ready) {
      waits.push(Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 90))
      ]));
    }
    await Promise.all(waits);
    await nextPaint();
  };

  const waitForMotion = (element, eventName, duration, propertyName = '') => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      element?.removeEventListener(eventName, onEnd);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target !== element) return;
      if (propertyName && event.propertyName !== propertyName && event.animationName !== propertyName) return;
      finish();
    };
    const timeout = window.setTimeout(finish, duration + 180);
    element?.addEventListener(eventName, onEnd);
  });

  const resetNavigationState = () => {
    navigationInProgress = false;
    document.documentElement.classList.remove('gate-preparing', 'gate-exiting', 'gate-entering', 'eye-gate-leaving', 'eye-handoff-frozen', 'navigation-loading');
    releaseEyeHandoffSource();
    if (!document.documentElement.classList.contains('eye-hall-entry-boot')) {
      ['--hall-eye-x', '--hall-eye-y', '--hall-eye-body-y', '--hall-eye-handoff-radius', '--hall-eye-cover-radius'].forEach((property) => {
        document.documentElement.style.removeProperty(property);
      });
    }
    document.body.classList.remove('gate-preparing', 'gate-exiting', 'gate-entering', 'page-leaving', 'page-arriving', 'project-portal-leaving', 'archive-leaving', 'archive-arriving');
    document.querySelectorAll('.archive-transition').forEach((transition) => transition.remove());
    document.querySelectorAll('.project-portal-backdrop, .project-world-signal, .project-world-title').forEach((portal) => portal.remove());
    document.querySelectorAll('[data-project-link].is-launching').forEach((link) => link.classList.remove('is-launching'));
    document.querySelectorAll('.is-navigation-loading').forEach((link) => link.classList.remove('is-navigation-loading'));
  };

  const showPageArrival = async () => {
    if (!document.documentElement.classList.contains('page-transition-boot')) return;
    sessionStorage.removeItem(pageTransitionKey);
    if (reduceMotion.matches) {
      document.body.classList.add('page-arrival-complete');
      document.documentElement.classList.remove('page-transition-boot');
      return;
    }
    document.body.classList.add('page-arriving');
    await nextPaint();
    document.documentElement.classList.remove('page-transition-boot');
    await waitForMotion(document.body, 'animationend', 680, 'page-transition-in');
    document.body.classList.add('page-arrival-complete');
    document.body.classList.remove('page-arriving');
  };

  const showHallEyeArrival = async () => {
    if (hallEyeArrivalPlaying || !document.documentElement.classList.contains('eye-hall-entry-boot')) return;
    hallEyeArrivalPlaying = true;
    sessionStorage.removeItem(eyeHallTransitionKey);
    if (reduceMotion.matches) {
      document.body.classList.add('page-arrival-complete');
      document.documentElement.classList.remove('eye-hall-entry-boot', 'eye-hall-entering');
      hallEyeArrivalPlaying = false;
      return;
    }
    const activeHallMedia = document.querySelector('.hero-project.is-active [data-project-media]');
    if (activeHallMedia instanceof HTMLVideoElement) ensureVideoSource(activeHallMedia);
    // The poster is already renderable. Waiting for a decoded video frame here
    // stopped the eye exactly at the page boundary and exposed the load.
    if (activeHallMedia) waitForRenderableMedia(activeHallMedia).catch(() => {});
    document.documentElement.classList.add('eye-hall-entering');
    await waitForMotion(document.body, 'animationend', eyeDiveDuration, 'hall-eye-reveal');
    document.body.classList.add('page-arrival-complete');
    document.documentElement.classList.remove('eye-hall-entry-boot', 'eye-hall-entering');
    ['--hall-eye-x', '--hall-eye-y', '--hall-eye-body-y', '--hall-eye-handoff-radius', '--hall-eye-cover-radius'].forEach((property) => {
      document.documentElement.style.removeProperty(property);
    });
    hallEyeArrivalPlaying = false;
  };

  const readProjectTransition = () => {
    try { return JSON.parse(sessionStorage.getItem(projectTransitionKey) || 'null'); }
    catch (error) { return null; }
  };

  const writeProjectTransition = (value) => sessionStorage.setItem(projectTransitionKey, JSON.stringify(value));

  const createArchiveTransition = (label) => {
    const authorizedLabel = document.documentElement.lang === 'en'
      ? 'ACCESS AUTHORIZED'
      : 'ACCESO AUTORIZADO';
    const transition = document.createElement('div');
    transition.className = 'archive-transition';
    transition.setAttribute('aria-hidden', 'true');
    transition.innerHTML = `
      <span class="archive-transition__grid"></span>
      <span class="archive-transition__scan"></span>
      <span class="archive-transition__frame archive-transition__frame--outer"></span>
      <span class="archive-transition__frame archive-transition__frame--inner"></span>
      <span class="archive-transition__aperture"></span>
      <span class="archive-transition__handoff"></span>
      <span class="archive-transition__shutter archive-transition__shutter--left"></span>
      <span class="archive-transition__shutter archive-transition__shutter--right"></span>
      <span class="archive-transition__meta">CORVO 001</span>
      <strong class="archive-transition__title">${label}</strong>
      <span class="archive-transition__status">${authorizedLabel}</span>`;
    document.documentElement.appendChild(transition);
    return transition;
  };

  const showArchiveArrival = async () => {
    if (archiveArrivalPlaying) return;
    let state = null;
    try { state = JSON.parse(sessionStorage.getItem(archiveTransitionKey) || 'null'); }
    catch (error) { state = null; }
    sessionStorage.removeItem(archiveTransitionKey);
    const isExpectedArchive = state?.path === window.location.pathname;
    const isRecentArchive = Date.now() - Number(state?.startedAt || 0) < 8000;

    if (state?.phase !== 'handoff' || !isExpectedArchive || !isRecentArchive || !document.body.classList.contains('work-page') || reduceMotion.matches) {
      document.documentElement.classList.remove('archive-entry-boot');
      return;
    }

    archiveArrivalPlaying = true;
    // Resume from the exact closed-shutter handoff frame. Page-load time must
    // never advance the visual timeline or the second half visibly skips.
    const transition = createArchiveTransition(state.label || '');
    try {
      transition.style.setProperty('--archive-cycle-delay', (-archiveHandoffDuration) + 'ms');
      transition.classList.add('is-cycling');
      document.body.classList.add('archive-arriving');
      await nextPaint();
      document.documentElement.classList.remove('archive-entry-boot');
      await waitForMotion(transition, 'animationend', archiveCycleDuration - archiveHandoffDuration, 'archive-cycle-shell');
      document.body.classList.add('page-arrival-complete');
    } finally {
      document.body.classList.remove('archive-arriving');
      transition.remove();
      archiveArrivalPlaying = false;
    }
  };

  const createProjectDeparture = (label = '', useDisplayFont = true) => {
    const backdrop = document.createElement('span');
    const signal = document.createElement('span');
    const title = label ? document.createElement('strong') : null;
    backdrop.className = 'project-portal-backdrop';
    signal.className = 'project-world-signal';
    if (title) {
      title.className = `project-world-title${useDisplayFont ? ' project-display' : ' project-world-title--fallback'}`;
      title.setAttribute('aria-hidden', 'true');
      title.style.setProperty('--letter-count', label.length);
      [...label].forEach((character, index) => {
        const letter = document.createElement('span');
        letter.className = 'project-world-title__letter';
        letter.style.setProperty('--letter-index', index);
        letter.style.setProperty('--letter-direction', index % 2 ? 1 : -1);
        letter.textContent = character === ' ' ? '\u00a0' : character;
        title.appendChild(letter);
      });
    }
    if (title) document.documentElement.append(backdrop, signal, title);
    else document.documentElement.append(backdrop, signal);
    return { backdrop, signal, title };
  };

  const departIntoProject = async (link, media, label, useDisplayFont) => {
    document.querySelectorAll('.project-portal-backdrop, .project-world-signal, .project-world-title').forEach((element) => element.remove());
    const { backdrop, signal, title } = createProjectDeparture(label, useDisplayFont);
    link.classList.add('is-launching');
    document.body.classList.add('project-portal-leaving');
    void backdrop.offsetWidth;
    await nextPaint();
    backdrop.classList.add('is-departing-world');
    signal.classList.add('is-departing');
    title?.classList.add('is-departing');
    await waitForMotion(backdrop, 'animationend', projectDepartureDuration, 'project-world-backdrop');
    writeProjectTransition({
      id: link.dataset.projectId,
      phase: 'enter',
      originUrl: window.location.href,
      path: new URL(link.href, window.location.href).pathname,
      startedAt: Date.now(),
      label
    });
    window.location.assign(link.href);
  };

  const waitForRenderableMedia = async (media) => {
    if (media instanceof HTMLVideoElement) {
      media.muted = true;
      media.defaultMuted = true;
      media.playsInline = true;
      media.preload = 'auto';
      const playAttempt = media.play();
      if (playAttempt?.catch) playAttempt.catch(() => {});
      if (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            media.removeEventListener('loadeddata', finish);
            media.removeEventListener('error', finish);
            resolve();
          };
          const timeout = window.setTimeout(finish, 1800);
          media.addEventListener('loadeddata', finish, { once: true });
          media.addEventListener('error', finish, { once: true });
        });
      }
      if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && media.requestVideoFrameCallback) {
        await Promise.race([
          new Promise((resolve) => media.requestVideoFrameCallback(resolve)),
          new Promise((resolve) => window.setTimeout(resolve, 500))
        ]);
      }
    } else if (media instanceof HTMLImageElement && !media.complete) {
      await Promise.race([
        media.decode?.().catch(() => {}) || Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, 1200))
      ]);
    }
    await nextPaint();
  };

  const showProjectArrival = async () => {
    if (projectArrivalPlaying) return;
    const state = readProjectTransition();
    const hero = document.querySelector('[data-project-hero]');
    const media = hero?.querySelector('[data-project-hero-media]');
    const isExpectedProject = state?.path === window.location.pathname;
    const isRecentProject = Date.now() - Number(state?.startedAt || 0) < 8000;
    if (!state || state.phase !== 'enter' || !isExpectedProject || !isRecentProject || hero?.dataset.projectId !== state.id || !media) {
      document.documentElement.classList.remove('project-entry-boot');
      if (state?.phase === 'enter') sessionStorage.removeItem(projectTransitionKey);
      return;
    }
    projectArrivalPlaying = true;
    try {
      await waitForRenderableMedia(media);
      writeProjectTransition({ ...state, phase: 'inside' });
      if (reduceMotion.matches) {
        document.body.classList.add('page-arrival-complete');
        document.documentElement.classList.remove('project-entry-boot');
        return;
      }
      document.documentElement.classList.add('project-entry-arriving');
      await nextPaint();
      document.documentElement.classList.remove('project-entry-boot');
      await waitForMotion(document.documentElement, 'animationend', projectArrivalDuration, 'project-world-reveal');
      document.body.classList.add('page-arrival-complete');
    } finally {
      document.documentElement.classList.remove('project-entry-arriving');
      projectArrivalPlaying = false;
    }
  };

  const projectVideos = [...document.querySelectorAll('video[data-project-hero-media]')];
  const projectVideoRetryTimers = new WeakMap();
  const clearProjectVideoRetries = (video) => {
    (projectVideoRetryTimers.get(video) || []).forEach((timer) => window.clearTimeout(timer));
    projectVideoRetryTimers.delete(video);
  };
  const playProjectVideo = (video) => {
    if (document.documentElement.classList.contains('eye-handoff-frozen')) return;
    if (video.dataset.userPaused === 'true') return;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'auto');
    if (video.ended && Number.isFinite(video.duration)) video.currentTime = 0;
    const playAttempt = video.play();
    if (playAttempt?.catch) playAttempt.catch(() => {});
  };
  const primeProjectVideo = (video) => {
    clearProjectVideoRetries(video);
    playProjectVideo(video);
    const timers = [90, 320, 900, 1800, 3600, 6000].map((delay) => window.setTimeout(() => {
      if (!document.hidden && video.paused && video.dataset.userPaused !== 'true') playProjectVideo(video);
    }, delay));
    projectVideoRetryTimers.set(video, timers);
  };
  const resumeProjectVideos = () => {
    if (document.documentElement.classList.contains('eye-media-held') || document.documentElement.classList.contains('eye-handoff-frozen')) return;
    projectVideos.forEach(primeProjectVideo);
    document.querySelectorAll('.hero-project.is-active video[data-project-media]').forEach((video) => {
      ensureVideoSource(video);
      primeProjectVideo(video);
    });
  };

  projectVideos.forEach((video) => {
    ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach((eventName) => {
      video.addEventListener(eventName, () => playProjectVideo(video));
    });
    video.addEventListener('playing', () => clearProjectVideoRetries(video));
    video.addEventListener('pause', () => {
      if (document.hidden || video.dataset.userPaused === 'true') return;
      window.setTimeout(() => {
        if (video.paused && video.dataset.userPaused !== 'true') primeProjectVideo(video);
      }, 120);
    });
    primeProjectVideo(video);
  });

  const formatVideoTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  };

  document.querySelectorAll('[data-project-video-controls]').forEach((controls) => {
    const frame = controls.closest('[data-project-hero]');
    const video = frame?.querySelector('video[data-project-hero-media]');
    const toggle = controls.querySelector('[data-project-video-toggle]');
    const progress = controls.querySelector('[data-project-video-progress]');
    const current = controls.querySelector('[data-project-video-current]');
    const duration = controls.querySelector('[data-project-video-duration]');
    const fullscreen = controls.querySelector('[data-project-video-fullscreen]');
    if (!video || !toggle || !progress || !current || !duration || !fullscreen) return;

    video.controls = false;
    controls.hidden = false;

    const updatePlaybackState = () => {
      const isPlaying = !video.paused && !video.ended;
      toggle.dataset.state = isPlaying ? 'playing' : 'paused';
      toggle.setAttribute('aria-label', isPlaying ? toggle.dataset.labelPause : toggle.dataset.labelPlay);
    };
    const updateTimeline = () => {
      const ratio = video.duration ? Math.min(video.currentTime / video.duration, 1) : 0;
      progress.value = String(Math.round(ratio * 1000));
      progress.style.setProperty('--video-progress', `${ratio * 100}%`);
      current.textContent = formatVideoTime(video.currentTime);
      duration.textContent = formatVideoTime(video.duration);
    };

    toggle.addEventListener('click', () => {
      if (video.paused) {
        video.dataset.userPaused = 'false';
        primeProjectVideo(video);
      } else {
        video.dataset.userPaused = 'true';
        clearProjectVideoRetries(video);
        video.pause();
      }
    });
    progress.addEventListener('input', () => {
      if (video.duration) video.currentTime = (Number(progress.value) / 1000) * video.duration;
    });
    fullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else if (frame.requestFullscreen) frame.requestFullscreen();
      else video.webkitEnterFullscreen?.();
    });
    video.addEventListener('play', updatePlaybackState);
    video.addEventListener('pause', updatePlaybackState);
    video.addEventListener('timeupdate', updateTimeline);
    video.addEventListener('durationchange', updateTimeline);
    updatePlaybackState();
    updateTimeline();
  });

  const showProjectReturn = () => {
    const state = readProjectTransition();
    if (state?.phase !== 'inside' || (!document.body.classList.contains('work-page') && !document.body.classList.contains('home-page'))) return;
    sessionStorage.removeItem(projectTransitionKey);
  };

  const showResolvedGate = () => {
    if (!gate) return;
    sessionStorage.removeItem(pageTransitionKey);
    sessionStorage.removeItem(eyeReturnKey);
    sessionStorage.removeItem(eyeSessionKey);
    sessionStorage.removeItem(eyeHallTransitionKey);
    sessionStorage.removeItem(eyeGateTransitionKey);
    history.replaceState({ ...history.state, eyeGateReturn: false }, '');
    document.documentElement.classList.remove('page-transition-boot', 'gate-natural-entry', 'gate-return-pending', 'gate-return-mode', 'gate-preparing', 'gate-exiting', 'gate-entering');
    document.body.classList.remove('gate-preparing', 'gate-exiting', 'gate-entering');
    document.documentElement.classList.add('gate-entrance-skip');
    eyeTrackingLocked = false;
    gateReturnPlaying = false;
    navigationInProgress = false;
    mark?.classList.remove('eye-geometry-locked');
  };

  const showGateReturn = async () => {
    if (!gate || reduceMotion.matches || gateReturnPlaying || !gateHasReturnState()) {
      if (reduceMotion.matches) showResolvedGate();
      return;
    }

    gateReturnPlaying = true;
    gateInitialStateHandled = true;
    sessionStorage.removeItem(pageTransitionKey);
    document.documentElement.classList.remove('page-transition-boot');
    navigationInProgress = false;
    eyeTrackingLocked = true;
    document.documentElement.classList.add('gate-return-pending');
    await waitForGateLayout();
    if (!setPupilTransitionGeometry()) {
      gateReturnPlaying = false;
      showResolvedGate();
      return;
    }

    const gateTransition = readEyeGateTransition();
    const transition = document.querySelector('[data-pupil-transition]');
    if (gateTransition && transition) {
      transition.style.setProperty('--pupil-start-x', `${Number(gateTransition.x) || (window.innerWidth / 2)}px`);
      transition.style.setProperty('--pupil-start-y', `${Number(gateTransition.y) || (window.innerHeight / 2)}px`);
      transition.style.setProperty('--pupil-start-radius', `${Math.max(Number(gateTransition.handoffRadius) || 1, 1)}px`);
      transition.style.setProperty('--pupil-start-edge-opacity', '.96');
    }

    sessionStorage.removeItem(eyeReturnKey);
    sessionStorage.removeItem(eyeSessionKey);
    sessionStorage.removeItem(eyeGateTransitionKey);
    document.documentElement.classList.remove('gate-natural-entry', 'gate-entrance-skip', 'gate-return-pending', 'gate-preparing', 'gate-exiting');
    document.documentElement.classList.add('gate-return-mode', 'gate-entering');
    await waitForMotion(transition, 'animationend', eyeDiveDuration, 'pupil-emerge');

    document.documentElement.classList.remove('gate-entering', 'gate-return-mode');
    history.replaceState({ ...history.state, eyeGateReturn: false }, '');
    eyeTrackingLocked = false;
    gateReturnPlaying = false;
    if (mark && lastPointerPosition && updateEyeFromPointer) {
      mark.classList.remove('eye-geometry-locked');
      mark.classList.add('eye-tracking-resuming');
      updateEyeFromPointer(lastPointerPosition.x, lastPointerPosition.y);
      window.setTimeout(() => mark.classList.remove('eye-tracking-resuming'), 620);
    } else {
      mark?.classList.remove('eye-geometry-locked');
    }
  };

  const showNaturalGateEntrance = () => {
    if (!gate) return;
    gateInitialStateHandled = true;
    gateReturnPlaying = false;
    navigationInProgress = false;
    sessionStorage.removeItem(eyeReturnKey);
    sessionStorage.removeItem(eyeSessionKey);
    sessionStorage.removeItem(eyeGateTransitionKey);
    history.replaceState({ ...history.state, eyeGateReturn: false }, '');
    document.documentElement.classList.remove('gate-return-pending', 'gate-return-mode', 'gate-entrance-skip', 'gate-preparing', 'gate-exiting', 'gate-entering');
    document.documentElement.classList.add('gate-natural-entry');
    mark?.classList.remove('eye-geometry-locked');
    if (reduceMotion.matches) {
      showResolvedGate();
      return;
    }
    eyeTrackingLocked = true;
    window.setTimeout(() => {
      eyeTrackingLocked = false;
      if (lastPointerPosition && updateEyeFromPointer) updateEyeFromPointer(lastPointerPosition.x, lastPointerPosition.y);
    }, eyeCodeDuration);
  };

  window.addEventListener('pageshow', (event) => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (gate) {
      if (document.documentElement.classList.contains('eye-mpa-returning')) {
        gateInitialStateHandled = true;
        return;
      }
      if (gateInitialStateHandled && !event.persisted) return;
      if (event.persisted) gateInitialStateHandled = false;
      const shouldAnimateReturn = gateHasReturnState() && (event.persisted || navigationType !== 'reload');
      if (shouldAnimateReturn) showGateReturn();
      else showNaturalGateEntrance();
    } else {
      const projectState = readProjectTransition();
      if (projectState?.phase === 'enter' && document.querySelector('[data-project-hero]')) {
        document.documentElement.classList.add('project-entry-boot');
      }
      if (sessionStorage.getItem(archiveTransitionKey) && document.body.classList.contains('work-page')) {
        document.documentElement.classList.add('archive-entry-boot');
      }
      resetNavigationState();
      showHallEyeArrival();
      showPageArrival();
      showProjectArrival();
      resumeProjectVideos();
      showProjectReturn();
      showArchiveArrival();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeProjectVideos();
  });
  window.addEventListener('focus', resumeProjectVideos);
  window.addEventListener('online', resumeProjectVideos);
  window.addEventListener('portfolio-eye-transition-finished', resumeProjectVideos);
  resetNavigationState();
  if ((!supportsCrossDocumentViewTransitions || hasManualEyeTransition(eyeHallTransitionKey)) && document.documentElement.classList.contains('eye-hall-entry-boot')) showHallEyeArrival();
  if ((!supportsCrossDocumentViewTransitions || hasManualEyeTransition(eyeGateTransitionKey)) && gate && document.documentElement.classList.contains('gate-return-pending') && gateHasReturnState()) showGateReturn();

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
    const warmLanguageGate = () => warmNavigationPage(link);
    link.addEventListener('pointerenter', warmLanguageGate, { passive: true });
    link.addEventListener('focus', warmLanguageGate, { passive: true });
    link.addEventListener('touchstart', warmLanguageGate, { passive: true, once: true });
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      freezeEyeHandoffSource();
      // Finish priming the gate before the eye moves. The previous 240 ms
      // deadline often expired on the published site and exposed the document
      // load halfway through an otherwise correct animation.
      await warmNavigationPage(link);
      sessionStorage.setItem(eyeReturnKey, '1');
      sessionStorage.removeItem(pageTransitionKey);
      sessionStorage.removeItem(projectTransitionKey);

      const centerX = window.innerWidth / 2;
      const centerY = (window.innerHeight / 2) - Math.min(76, window.innerHeight * .08);
      const coverRadius = Math.hypot(
        Math.max(centerX, window.innerWidth - centerX),
        Math.max(centerY, window.innerHeight - centerY)
      ) + 2;
      const handoffRadius = Math.max(coverRadius * .52, 1);
      sessionStorage.setItem(eyeGateTransitionKey, JSON.stringify({
        x: centerX,
        y: centerY,
        coverRadius,
        handoffRadius,
        mode: 'manual',
        path: new URL(link.href, window.location.href).pathname,
        startedAt: Date.now()
      }));
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--hall-eye-x', `${centerX}px`);
      rootStyle.setProperty('--hall-eye-y', `${centerY}px`);
      rootStyle.setProperty('--hall-eye-body-y', `${window.scrollY + centerY}px`);
      rootStyle.setProperty('--hall-eye-handoff-radius', `${handoffRadius}px`);
      rootStyle.setProperty('--hall-eye-cover-radius', `${coverRadius}px`);
      document.documentElement.classList.add('eye-gate-leaving');
      await waitForMotion(document.body, 'animationend', eyeDiveDuration, 'hall-eye-collapse');
      window.location.assign(link.href);
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
    const warmLanguageHall = () => warmNavigationPage(link);
    link.addEventListener('pointerenter', warmLanguageHall, { passive: true });
    link.addEventListener('focus', warmLanguageHall, { passive: true });
    link.addEventListener('touchstart', warmLanguageHall, { passive: true, once: true });
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      eyeTrackingLocked = true;
      const hallWarmup = warmNavigationPage(link);
      sessionStorage.setItem(eyeSessionKey, '1');
      history.replaceState({ ...history.state, eyeGateReturn: true }, '');
      const eyeGeometry = setPupilTransitionGeometry();
      if (!eyeGeometry) {
        sessionStorage.removeItem(eyeHallTransitionKey);
        window.location.assign(link.href);
        return;
      }
      const hallTransitionState = {
        ...eyeGeometry,
        mode: 'manual',
        path: new URL(link.href, window.location.href).pathname
      };
      document.documentElement.classList.add('gate-preparing');
      await Promise.all([
        waitForMotion(gate.querySelector('.gate-inner'), 'animationend', eyePrepareDuration, 'eye-entry-tremor'),
        hallWarmup
      ]);
      document.documentElement.classList.remove('gate-preparing');
      // Timestamp the handoff only once every destination resource is ready;
      // slow networks must not make the destination reject a now-stale state.
      sessionStorage.setItem(eyeHallTransitionKey, JSON.stringify({
        ...hallTransitionState,
        startedAt: Date.now()
      }));
      document.documentElement.classList.add('gate-exiting');
      await waitForMotion(document.querySelector('[data-pupil-transition]'), 'animationend', eyeDiveDuration);
      window.location.assign(link.href);
    });
  });

  document.querySelectorAll('[data-project-link]').forEach((link) => {
    const warmProjectDestination = () => {
      warmProjectVideo(link);
      warmNavigationPage(link);
    };
    link.addEventListener('pointerenter', warmProjectDestination, { passive: true });
    link.addEventListener('focus', warmProjectDestination, { passive: true });
    link.addEventListener('touchstart', warmProjectDestination, { passive: true, once: true });
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      const media = link.querySelector('[data-project-media]');
      if (!media || link.classList.contains('is-launching')) return;

      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      link.classList.add('is-navigation-loading');
      document.documentElement.classList.add('navigation-loading');
      await Promise.allSettled([warmProjectVideo(link), warmNavigationPage(link)]);
      link.classList.remove('is-navigation-loading');
      document.documentElement.classList.remove('navigation-loading');
      document.querySelectorAll('.archive-transition').forEach((transition) => transition.remove());
      sessionStorage.removeItem(archiveTransitionKey);
      const useDisplayFont = projectDisplayFontAvailable;
      const label = link.querySelector('h2, h3')?.textContent.trim() || link.dataset.projectId;
      departIntoProject(link, media, label, useDisplayFont).catch(() => {
        writeProjectTransition({
          id: link.dataset.projectId,
          phase: 'enter',
          label,
          path: new URL(link.href, window.location.href).pathname,
          startedAt: Date.now()
        });
        window.location.assign(link.href);
      });
    });
  });

  document.querySelectorAll('[data-home-projects]').forEach((projects) => {
    const slides = [...projects.querySelectorAll('.hero-project')];
    if (slides.length < 2) return;

    const coverIndex = slides.findIndex((slide) => slide.dataset.projectId === 'dyson-swarm');
    let active = coverIndex >= 0 ? coverIndex : 0;
    let historyIndex = 0;
    let scrollSoftenTimer = 0;
    const history = [active];
    const controls = projects.parentElement?.querySelector('.hero-project-controls');
    const previous = controls?.querySelector('[data-home-project-previous]');
    const next = controls?.querySelector('[data-home-project-next]');

    slides.forEach((slide) => {
      const video = slide.querySelector('video[data-project-media]');
      if (!video) return;
      const recoverPlayback = () => {
        if (!document.hidden && slide.classList.contains('is-active')) playProjectVideo(video);
      };
      ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach((eventName) => {
        video.addEventListener(eventName, recoverPlayback);
      });
      video.addEventListener('playing', () => clearProjectVideoRetries(video));
      video.addEventListener('pause', () => {
        if (document.hidden || !slide.classList.contains('is-active')) return;
        window.setTimeout(() => {
          if (video.paused && slide.classList.contains('is-active')) primeProjectVideo(video);
        }, 120);
      });
    });

    const show = (index) => {
      active = index;
      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === active;
        const video = slide.querySelector('video');
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', String(!isActive));
        slide.tabIndex = isActive ? 0 : -1;
        if (video) {
          if (isActive) {
            ensureVideoSource(video);
            primeProjectVideo(video);
          } else {
            clearProjectVideoRetries(video);
            video.pause();
          }
        }
      });
      if (previous) previous.disabled = historyIndex === 0;
    };
    const chooseNext = () => {
      const offset = 1 + Math.floor(Math.random() * (slides.length - 1));
      const newProject = (active + offset) % slides.length;
      history.splice(historyIndex + 1);
      history.push(newProject);
      historyIndex += 1;
      show(newProject);
    };
    const choosePrevious = () => {
      if (historyIndex === 0) return;
      historyIndex -= 1;
      show(history[historyIndex]);
    };
    const softenDuringScroll = () => {
      projects.classList.add('is-scroll-softened');
      window.clearTimeout(scrollSoftenTimer);
      scrollSoftenTimer = window.setTimeout(() => {
        projects.classList.remove('is-scroll-softened');
      }, 280);
    };

    show(active);
    previous?.addEventListener('click', choosePrevious);
    next?.addEventListener('click', chooseNext);
    projects.addEventListener('wheel', softenDuringScroll, { passive: true });
    projects.addEventListener('touchmove', softenDuringScroll, { passive: true });
  });

  document.querySelectorAll('[data-project-filter]').forEach((filter) => {
    const grid = filter.closest('.project-index__body')?.querySelector('[data-project-index-grid]');
    const empty = filter.closest('.project-index__body')?.querySelector('[data-project-index-empty]');
    const label = filter.querySelector('[data-project-filter-label]');
    const triggerLabel = filter.querySelector('[data-project-filter-trigger-label]');
    const buttons = [...filter.querySelectorAll('[data-project-filter-value]')];
    const cards = [...(grid?.querySelectorAll('[data-project-category]') || [])];
    if (!grid || !label || !buttons.length) return;

    const selectCategory = (button) => {
      const category = button.dataset.projectFilterValue;
      let visibleCount = 0;
      cards.forEach((card) => {
        const visible = category === 'ALL' || card.dataset.projectCategory === category;
        card.hidden = !visible;
        if (!visible) {
          card.querySelector('video[data-project-media]')?.pause();
          card.querySelector('.project-index-card__visual')?.classList.remove('is-proximity-active');
        }
        if (visible) visibleCount += 1;
      });
      buttons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
      const currentLabel = button.textContent.trim();
      label.textContent = currentLabel;
      if (triggerLabel) triggerLabel.textContent = currentLabel;
      filter.dataset.projectFilterCurrent = category;
      if (empty) empty.hidden = visibleCount > 0;
      filter.open = false;
    };

    buttons.forEach((button) => button.addEventListener('click', () => selectCategory(button)));
    filter.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      filter.open = false;
      filter.querySelector('summary')?.focus();
    });
    document.addEventListener('pointerdown', (event) => {
      if (filter.open && !filter.contains(event.target)) filter.open = false;
    }, { passive: true });
  });

  const indexCapsules = [...document.querySelectorAll('.project-index-card__visual')];
  if (indexCapsules.length) {
    const capsuleStates = new WeakMap();
    const desktopPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let lastCapsulePointer = null;
    let capsulePointerFrame = 0;
    const distanceToSegment = (point, start, end) => {
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const lengthSquared = (segmentX * segmentX) + (segmentY * segmentY);
      if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
      const projection = Math.max(0, Math.min(1,
        (((point.x - start.x) * segmentX) + ((point.y - start.y) * segmentY)) / lengthSquared
      ));
      return Math.hypot(
        point.x - (start.x + (projection * segmentX)),
        point.y - (start.y + (projection * segmentY))
      );
    };
    const distanceToDiamond = (rect, point) => {
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;
      const normalizedDistance = (Math.abs(point.x - centerX) / halfWidth)
        + (Math.abs(point.y - centerY) / halfHeight);
      if (normalizedDistance <= 1) return 0;
      const vertices = [
        { x: centerX, y: rect.top },
        { x: rect.right, y: centerY },
        { x: centerX, y: rect.bottom },
        { x: rect.left, y: centerY }
      ];
      return Math.min(...vertices.map((vertex, index) =>
        distanceToSegment(point, vertex, vertices[(index + 1) % vertices.length])
      ));
    };
    const updateCapsule = (capsule) => {
      const state = capsuleStates.get(capsule);
      const card = capsule.closest('.project-index-card');
      const video = capsule.querySelector('video[data-project-media]');
      if (!state || !card) return;
      const proximityActive = desktopPointer.matches ? state.pointerNear : state.near;
      const active = !document.hidden && !card.hidden && !reduceMotion.matches && (proximityActive || state.hovered || state.focused);
      capsule.classList.toggle('is-proximity-active', active);
      if (active) warmProjectVideo(card);
      if (!video) return;
      if (active) {
        ensureVideoSource(video);
        video.play().catch(() => {});
      }
      else video.pause();
    };

    const updatePointerProximity = () => {
      capsulePointerFrame = 0;
      if (!desktopPointer.matches || !lastCapsulePointer) return;
      indexCapsules.forEach((capsule) => {
        const state = capsuleStates.get(capsule);
        const card = capsule.closest('.project-index-card');
        if (!state || !card || card.hidden) return;
        const rect = capsule.getBoundingClientRect();
        const activationRange = Math.min(52, Math.max(28, rect.width * .1));
        const releaseRange = activationRange + 14;
        const pointerDistance = distanceToDiamond(rect, lastCapsulePointer);
        const pointerNear = pointerDistance <= (state.pointerNear ? releaseRange : activationRange);
        if (pointerNear === state.pointerNear) return;
        state.pointerNear = pointerNear;
        updateCapsule(capsule);
      });
    };
    const schedulePointerProximity = () => {
      if (!capsulePointerFrame) capsulePointerFrame = window.requestAnimationFrame(updatePointerProximity);
    };

    indexCapsules.forEach((capsule) => {
      const card = capsule.closest('.project-index-card');
      const video = capsule.querySelector('video[data-project-media]');
      const state = { near: false, pointerNear: false, hovered: false, focused: false };
      capsuleStates.set(capsule, state);
      video?.pause();

      capsule.addEventListener('pointerenter', () => { state.hovered = true; updateCapsule(capsule); });
      capsule.addEventListener('pointerleave', () => { state.hovered = false; updateCapsule(capsule); });
      card?.addEventListener('focus', () => { state.focused = true; updateCapsule(capsule); });
      card?.addEventListener('blur', () => { state.focused = false; updateCapsule(capsule); });
    });

    if ('IntersectionObserver' in window) {
      const capsuleObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const state = capsuleStates.get(entry.target);
          if (!state) return;
          state.near = entry.isIntersecting;
          updateCapsule(entry.target);
        });
      }, { rootMargin: '-22% 0px -22% 0px', threshold: 0.15 });
      indexCapsules.forEach((capsule) => capsuleObserver.observe(capsule));
    }

    window.addEventListener('pointermove', (event) => {
      lastCapsulePointer = { x: event.clientX, y: event.clientY };
      schedulePointerProximity();
    }, { passive: true });
    window.addEventListener('scroll', schedulePointerProximity, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      lastCapsulePointer = null;
      indexCapsules.forEach((capsule) => {
        const state = capsuleStates.get(capsule);
        if (!state?.pointerNear) return;
        state.pointerNear = false;
        updateCapsule(capsule);
      });
    });
    desktopPointer.addEventListener?.('change', () => {
      indexCapsules.forEach((capsule) => {
        const state = capsuleStates.get(capsule);
        if (state) state.pointerNear = false;
        updateCapsule(capsule);
      });
      schedulePointerProximity();
    });

    document.addEventListener('visibilitychange', () => {
      indexCapsules.forEach((capsule) => {
        if (document.hidden) capsule.querySelector('video[data-project-media]')?.pause();
        else updateCapsule(capsule);
      });
    });
  }

  document.querySelectorAll('[data-work-entry]').forEach((link) => {
    const target = new URL(link.href, window.location.href);
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      if (target.pathname === window.location.pathname) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      link.classList.add('is-navigation-loading');
      document.documentElement.classList.add('navigation-loading');
      await warmNavigationPage(link);
      link.classList.remove('is-navigation-loading');
      document.documentElement.classList.remove('navigation-loading');
      document.querySelectorAll('.archive-transition, .project-portal-backdrop, .project-world-signal, .project-world-title').forEach((transition) => transition.remove());
      if (window.location.pathname.startsWith(target.pathname)) {
        sessionStorage.removeItem(archiveTransitionKey);
        document.body.classList.add('page-leaving');
        await waitForMotion(document.body, 'animationend', pageDepartureDuration, 'page-transition-out');
        window.location.assign(target.href);
        return;
      }
      const label = link.dataset.workLabel || link.textContent.trim();
      const transition = createArchiveTransition(label);
      const handoff = transition.querySelector('.archive-transition__handoff');
      document.body.classList.add('archive-leaving');
      await nextPaint();
      transition.classList.add('is-cycling');
      await waitForMotion(handoff, 'animationend', archiveHandoffDuration, 'archive-cycle-handoff');

      // Navigation can take a few frames even after preloading. Freeze every
      // CSS animation at the fully closed handoff so the source page cannot
      // begin opening its shutters before the destination takes ownership.
      transition.classList.add('is-handoff-held');
      try {
        transition.getAnimations?.({ subtree: true }).forEach((animation) => animation.pause());
      } catch (error) { /* CSS pause remains the compatibility fallback. */ }
      void transition.offsetWidth;
      sessionStorage.setItem(archiveTransitionKey, JSON.stringify({
        label,
        path: target.pathname,
        phase: 'handoff',
        startedAt: Date.now()
      }));
      window.location.assign(target.href);
    });
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      if (link.hasAttribute('data-language-link') || link.hasAttribute('data-language-menu') || link.hasAttribute('data-project-link') || link.hasAttribute('data-work-entry') || reduceMotion.matches || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin || target.protocol === 'mailto:' || target.protocol === 'tel:') return;
      if (target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      link.classList.add('is-navigation-loading');
      document.documentElement.classList.add('navigation-loading');
      await warmNavigationPage(link);
      link.classList.remove('is-navigation-loading');
      document.documentElement.classList.remove('navigation-loading');
      document.querySelectorAll('.archive-transition, .project-portal-backdrop, .project-world-signal, .project-world-title').forEach((transition) => transition.remove());
      sessionStorage.removeItem(archiveTransitionKey);
      if (!/^\/(?:es|en)\/$/.test(target.pathname)) sessionStorage.removeItem(projectTransitionKey);
      sessionStorage.setItem(pageTransitionKey, JSON.stringify({ path: target.pathname, startedAt: Date.now() }));
      document.body.classList.add('page-leaving');
      await waitForMotion(document.body, 'animationend', pageDepartureDuration, 'page-transition-out');
      window.location.assign(target.href);
    });
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
