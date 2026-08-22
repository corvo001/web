(() => {
  const gate = document.querySelector('[data-language-gate]');
  const mark = document.querySelector('[data-reactive-mark]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const languageBridgeKey = 'portfolio-language-bridge-v2';
  const languageReturnKey = 'portfolio-language-return-v5';
  const projectTransitionKey = 'portfolio-project-transition';
  const archiveTransitionKey = 'portfolio-archive-transition';
  const pageTransitionKey = 'portfolio-page-transition';
  const contactTransferKey = 'portfolio-contact-transfer-v1';
  let eyeTrackingLocked = false;
  let languageArrivalPlaying = false;
  let gateInitialStateHandled = false;
  let archiveArrivalPlaying = false;
  let projectArrivalPlaying = false;
  let navigationInProgress = false;
  let eyeTrackingReleaseTimer = 0;
  let eyeTrackingReleaseGeneration = 0;
  let lastPointerPosition = null;
  let updateEyeFromPointer = null;
  let frozenNavigationAnimations = [];
  let frozenNavigationSvgs = [];
  let frozenNavigationStyleElements = [];
  let contactTransferState = 'idle';
  let contactTransferGeneration = 0;
  const eyePrepareDuration = 360;
  const eyeDiveDuration = 860;
  const languageReturnStageDuration = 1320;
  const eyeCodeDuration = 1640;
  const projectDepartureDuration = 1280;
  const projectArrivalDuration = 720;
  const projectCardOpenDuration = 520;
  const archiveCycleDuration = 1600;
  const archiveHandoffDuration = 880;
  const pageDepartureDuration = 460;
  const contactTransferDepartureDuration = 900;
  const contactTransferArrivalDuration = 720;
  let projectDisplayFontAvailable = false;
  const warmedProjectVideos = new Map();
  const warmedNavigationPages = new Map();

  document.querySelectorAll('.about-process').forEach((process) => {
    const svg = process.querySelector('.about-process__visual');
    const cycleSignal = process.querySelector('.about-process__signal');
    if (!svg || !cycleSignal || typeof svg.setCurrentTime !== 'function') return;

    let timelineSyncing = false;
    const resetMotionTimeline = () => {
      if (timelineSyncing || reduceMotion.matches || document.hidden) return;
      timelineSyncing = true;

      try {
        svg.pauseAnimations?.();
        svg.setCurrentTime(0);
        svg.unpauseAnimations?.();
      } finally {
        window.requestAnimationFrame(() => { timelineSyncing = false; });
      }
    };
    const restartTimeline = () => {
      if (reduceMotion.matches || document.hidden) return;
      if (typeof process.getAnimations === 'function') {
        process.getAnimations({ subtree: true }).forEach((animation) => {
          try { animation.currentTime = 0; }
          catch (error) { /* A detached animation can disappear between collection and reset. */ }
        });
      }
      resetMotionTimeline();
    };
    const restartOnNextFrame = () => window.requestAnimationFrame(restartTimeline);

    cycleSignal.addEventListener('animationiteration', resetMotionTimeline);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) restartOnNextFrame();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) restartOnNextFrame();
    });
    restartOnNextFrame();
  });

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

  const startProjectCardPreview = (video) => {
    if (!(video instanceof HTMLVideoElement) || reduceMotion.matches || document.hidden) return;
    ensureVideoSource(video);
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const playAttempt = video.play();
    if (playAttempt?.catch) playAttempt.catch(() => {});
  };

  const stopProjectCardPreview = (video) => {
    if (!(video instanceof HTMLVideoElement)) return;
    video.pause();
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

  eyeTrackingLocked = Boolean(gate && (
    document.documentElement.classList.contains('gate-natural-entry') ||
    document.documentElement.classList.contains('language-return-settled')
  ));

  const lockEyeAtRest = () => {
    if (!mark) return false;
    mark.classList.add('eye-geometry-locked');
    mark.style.setProperty('--rx', '0deg');
    mark.style.setProperty('--ry', '0deg');
    mark.style.setProperty('--px', '0px');
    mark.style.setProperty('--py', '0px');
    return true;
  };

  if (gate && document.documentElement.classList.contains('language-return-settled')) lockEyeAtRest();

  const setPupilTransitionGeometry = () => {
    const pupil = mark?.querySelector('.reactive-mark__pupil');
    const transition = document.querySelector('[data-pupil-transition]');
    if (!pupil || !transition || !lockEyeAtRest()) return false;

    // The pupil follows the pointer. Always transition through its real,
    // centered resting position so the circle cannot drift between frames.
    void pupil.offsetWidth;
    const markRect = mark.getBoundingClientRect();
    const size = Math.max(markRect.width * .032, 1);
    // Exact centre of the transparent pupil aperture in the 1024 × 1024 logo.
    const centerX = markRect.left + (markRect.width * .5);
    const centerY = markRect.top + (markRect.height * (456.5 / 1024));
    const radius = Math.hypot(Math.max(centerX, window.innerWidth - centerX), Math.max(centerY, window.innerHeight - centerY));
    const coverRadius = radius + 2;
    transition.style.setProperty('--pupil-x', `${centerX}px`);
    transition.style.setProperty('--pupil-y', `${centerY}px`);
    transition.style.setProperty('--pupil-radius', `${size / 2}px`);
    transition.style.setProperty('--pupil-cover-radius', `${coverRadius}px`);
    ['--pupil-start-x', '--pupil-start-y', '--pupil-start-radius', '--pupil-start-edge-opacity'].forEach((property) => {
      transition.style.removeProperty(property);
    });
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--language-eye-x', `${centerX}px`);
    rootStyle.setProperty('--language-eye-y', `${centerY}px`);
    rootStyle.setProperty('--language-eye-body-y', `${window.scrollY + centerY}px`);
    rootStyle.setProperty('--language-eye-pupil-radius', `${size / 2}px`);
    rootStyle.setProperty('--language-eye-cover-radius', `${coverRadius}px`);
    document.documentElement.appendChild(transition);
    return { x: centerX, y: centerY, radius: size / 2, coverRadius };
  };

  const freezeNavigationSource = () => {
    document.documentElement.classList.add('navigation-source-frozen');
    frozenNavigationStyleElements = [...document.querySelectorAll([
      '[data-project-media]',
      '.portfolio-nav',
      '.portfolio-footer',
      '.hero-copy',
      '.hero-project-controls',
      '.hero-project__interest',
      '.project-index-card__info'
    ].join(','))];
    frozenNavigationStyleElements.forEach((element) => {
      const style = window.getComputedStyle(element);
      element.style.setProperty('--navigation-frozen-opacity', style.opacity);
      element.style.setProperty('--navigation-frozen-visibility', style.visibility);
      element.style.setProperty('--navigation-frozen-transform', style.transform);
    });
    document.querySelectorAll('video').forEach((video) => {
      clearProjectVideoRetries(video);
      video.pause();
    });
    frozenNavigationSvgs = [...document.querySelectorAll('svg')];
    frozenNavigationSvgs.forEach((svg) => svg.pauseAnimations?.());
    try {
      frozenNavigationAnimations = (document.body?.getAnimations?.({ subtree: true }) || []).filter((animation) => {
        const target = animation.effect?.target;
        return target !== document.body && target !== document.documentElement;
      });
      frozenNavigationAnimations.forEach((animation) => animation.pause());
    } catch (error) { /* CSS pause remains the compatibility fallback. */ }
  };

  const releaseNavigationSource = () => {
    frozenNavigationAnimations.forEach((animation) => {
      try {
        if (animation.playState === 'paused') animation.play();
      } catch (error) { /* The animation may have been detached during navigation. */ }
    });
    frozenNavigationSvgs.forEach((svg) => svg.unpauseAnimations?.());
    frozenNavigationStyleElements.forEach((element) => {
      element.style.removeProperty('--navigation-frozen-opacity');
      element.style.removeProperty('--navigation-frozen-visibility');
      element.style.removeProperty('--navigation-frozen-transform');
    });
    frozenNavigationAnimations = [];
    frozenNavigationSvgs = [];
    frozenNavigationStyleElements = [];
  };

  const nextPaint = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });

  const readSettledLanguageReturn = () => {
    try {
      const state = JSON.parse(sessionStorage.getItem(languageReturnKey) || 'null');
      const expectedPath = state?.path === window.location.pathname;
      const recent = Date.now() - Number(state?.startedAt || 0) < 10000;
      return state?.version === 5 && state?.phase === 'settled' && expectedPath && recent ? state : null;
    } catch (error) {
      return null;
    }
  };

  const createLanguageReturnStage = () => {
    const stage = document.createElement('div');
    const logoSource = document.querySelector('.nav-logo img')?.src || '/assets/images/logo-original-transparent.png?v=228737cd';
    stage.className = 'language-return-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <main class="language-return-stage__gate language-gate">
        <div class="gate-inner">
          <div class="reactive-mark eye-geometry-locked">
            <img class="reactive-mark__image" alt="" decoding="sync">
            <span class="reactive-mark__pupil"></span>
          </div>
          <nav class="language-options">
            <a href="/es/" tabindex="-1"><span>Selecciona idioma</span><strong>ES</strong></a>
            <span class="language-divider"></span>
            <a href="/en/" tabindex="-1"><span>Select language</span><strong>EN</strong></a>
          </nav>
        </div>
      </main>
      <span class="language-return-stage__aperture"></span>`;
    stage.querySelector('.reactive-mark__image').src = logoSource;
    document.documentElement.appendChild(stage);
    return stage;
  };

  const setLanguageReturnStageGeometry = (stage) => {
    const stagePupil = stage?.querySelector('.reactive-mark__pupil');
    if (!stagePupil) return false;
    const pupilRect = stagePupil.getBoundingClientRect();
    if (!pupilRect.width || !pupilRect.height) return false;
    const centerX = pupilRect.left + (pupilRect.width * .5);
    const centerY = pupilRect.top + (pupilRect.height * .5);
    const pupilRadius = Math.max(Math.min(pupilRect.width, pupilRect.height) * .5, 1);
    const coverRadius = Math.hypot(
      Math.max(centerX, window.innerWidth - centerX),
      Math.max(centerY, window.innerHeight - centerY)
    ) + 2;
    stage.style.setProperty('--language-return-stage-x', `${centerX}px`);
    stage.style.setProperty('--language-return-stage-y', `${centerY}px`);
    stage.style.setProperty('--language-return-stage-pupil-radius', `${pupilRadius}px`);
    stage.style.setProperty('--language-return-stage-cover-radius', `${coverRadius}px`);
    return true;
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

  const readPageTransition = () => {
    try { return JSON.parse(sessionStorage.getItem(pageTransitionKey) || 'null'); }
    catch (error) { return null; }
  };

  const readContactTransfer = () => {
    try { return JSON.parse(sessionStorage.getItem(contactTransferKey) || 'null'); }
    catch (error) { return null; }
  };

  const createContactTransfer = (metrics = {}) => {
    const root = document.createElement('div');
    root.className = 'contact-transfer';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <svg class="contact-transfer__vector" preserveAspectRatio="none" focusable="false">
        <line class="contact-transfer__beam" pathLength="1"></line>
        <line class="contact-transfer__spine contact-transfer__spine--top" pathLength="1"></line>
        <line class="contact-transfer__spine contact-transfer__spine--bottom" pathLength="1"></line>
        <line class="contact-transfer__handoff" pathLength="1"></line>
      </svg>
      <span class="contact-transfer__cover"><span class="contact-transfer__fill"></span></span>
      <span class="contact-transfer__packet"></span>`;

    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const centerX = viewportWidth * .5;
    const centerY = viewportHeight * .5;
    const originX = Math.min(Math.max(metrics.x ?? centerX, 0), viewportWidth);
    const originY = Math.min(Math.max(metrics.y ?? centerY, 0), viewportHeight);
    const hasReceiver = Number.isFinite(metrics.targetX) && Number.isFinite(metrics.targetY);
    const targetX = Math.min(Math.max(metrics.targetX ?? centerX, 0), viewportWidth);
    const targetY = Math.min(Math.max(metrics.targetY ?? centerY, 0), viewportHeight);
    const handoffOriginX = hasReceiver ? 0 : centerX;
    const compactHandoff = hasReceiver && window.matchMedia('(max-width: 700px)').matches;
    const handoffOriginY = compactHandoff ? targetY : centerY;
    root.style.setProperty('--contact-transfer-center-shift', `${-centerX}px`);
    root.style.setProperty('--contact-transfer-exit-shift', `${-(centerX + viewportWidth)}px`);
    root.style.setProperty('--contact-transfer-receiver-shift', `${targetX - centerX - viewportWidth}px`);
    root.style.setProperty('--contact-transfer-packet-x', `${handoffOriginX}px`);
    root.style.setProperty('--contact-transfer-packet-y', `${handoffOriginY}px`);
    root.style.setProperty('--contact-transfer-packet-dx', `${targetX - handoffOriginX}px`);
    root.style.setProperty('--contact-transfer-packet-dy', `${targetY - handoffOriginY}px`);
    if (hasReceiver) root.classList.add('has-contact-receiver');

    const vector = root.querySelector('.contact-transfer__vector');
    const beam = root.querySelector('.contact-transfer__beam');
    const spineTop = root.querySelector('.contact-transfer__spine--top');
    const spineBottom = root.querySelector('.contact-transfer__spine--bottom');
    const handoff = root.querySelector('.contact-transfer__handoff');
    vector.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
    beam.setAttribute('x1', originX);
    beam.setAttribute('y1', originY);
    beam.setAttribute('x2', centerX);
    beam.setAttribute('y2', centerY);
    [spineTop, spineBottom].forEach((spine) => {
      spine.setAttribute('x1', centerX);
      spine.setAttribute('y1', centerY);
      spine.setAttribute('x2', centerX);
    });
    spineTop.setAttribute('y2', 0);
    spineBottom.setAttribute('y2', viewportHeight);
    handoff.setAttribute('x1', handoffOriginX);
    handoff.setAttribute('y1', handoffOriginY);
    handoff.setAttribute('x2', targetX);
    handoff.setAttribute('y2', targetY);
    document.documentElement.appendChild(root);
    return root;
  };

  const clearContactTransfer = ({ preserveReceiver = false } = {}) => {
    contactTransferGeneration += 1;
    contactTransferState = 'idle';
    document.body?.classList.remove('contact-transfer-leaving', 'contact-transfer-arriving');
    document.querySelectorAll('.contact-transfer').forEach((transition) => transition.remove());
    document.querySelectorAll('.about-contact-cta.is-contact-transferring').forEach((link) => link.classList.remove('is-contact-transferring'));
    document.querySelectorAll('.contact-card.is-contact-receiver-armed').forEach((card) => card.classList.remove('is-contact-receiver-armed'));
    if (!preserveReceiver) {
      document.querySelectorAll('.contact-card.is-contact-receiving').forEach((card) => card.classList.remove('is-contact-receiving'));
    }
  };

  const runContactTransferDeparture = async (transition, link) => {
    const generation = ++contactTransferGeneration;
    contactTransferState = 'preparing';
    await nextPaint();
    if (generation !== contactTransferGeneration) return { status: 'cancelled', generation };
    if (!transition.isConnected) return { status: 'failed', generation };
    link.classList.add('is-contact-transferring');
    document.body.classList.add('contact-transfer-leaving');
    transition.classList.add('is-departing');
    contactTransferState = 'departing';
    await waitForMotion(transition, 'animationend', contactTransferDepartureDuration, 'contact-transfer-departure-clock');
    if (generation !== contactTransferGeneration) return { status: 'cancelled', generation };
    if (!transition.isConnected) return { status: 'failed', generation };
    contactTransferState = 'covered';
    return { status: 'completed', generation };
  };

  const resetNavigationState = () => {
    navigationInProgress = false;
    languageArrivalPlaying = false;
    window.clearTimeout(eyeTrackingReleaseTimer);
    eyeTrackingReleaseTimer = 0;
    eyeTrackingReleaseGeneration += 1;
    clearContactTransfer();
    document.documentElement.classList.remove('gate-preparing', 'gate-exiting', 'language-return-staging', 'language-return-running', 'navigation-source-frozen');
    releaseNavigationSource();
    if (!document.documentElement.classList.contains('language-bridge-enter')) {
      ['--language-eye-x', '--language-eye-y', '--language-eye-body-y', '--language-eye-pupil-radius', '--language-eye-cover-radius'].forEach((property) => {
        document.documentElement.style.removeProperty(property);
      });
    }
    document.body.classList.remove('gate-preparing', 'gate-exiting', 'page-leaving', 'page-arriving', 'project-portal-leaving', 'archive-leaving', 'archive-arriving');
    document.body.style.removeProperty('opacity');
    document.body.style.removeProperty('transform');
    document.querySelectorAll('.archive-transition').forEach((transition) => transition.remove());
    document.querySelectorAll('.project-portal-backdrop, .project-world-signal, .project-world-title').forEach((portal) => portal.remove());
    document.querySelectorAll('.language-return-stage').forEach((stage) => stage.remove());
    document.querySelectorAll('[data-project-link].is-launching').forEach((link) => link.classList.remove('is-launching'));
  };

  const showContactTransferArrival = async () => {
    if (!document.documentElement.classList.contains('contact-transfer-boot')) return;
    const transfer = readContactTransfer();
    try { sessionStorage.removeItem(contactTransferKey); }
    catch (error) { /* The critical boot timeout remains the final fallback. */ }
    const isExpectedArrival = transfer?.type === 'about-contact' &&
      transfer?.version === 1 &&
      transfer?.phase === 'handoff' &&
      transfer?.path === window.location.pathname &&
      document.body.classList.contains('info-contact-page');
    if (reduceMotion.matches || !isExpectedArrival) {
      document.body.classList.add('page-arrival-complete');
      document.documentElement.classList.remove('contact-transfer-boot');
      return;
    }

    const generation = ++contactTransferGeneration;
    let transition;
    let receiver;
    let receiverSignal;
    let receiverPrepared = false;
    let receiverRunning = false;
    let viewportChanged = false;
    const arrivalViewport = { width: window.innerWidth, height: window.innerHeight };
    let resolveViewportChange;
    const viewportChange = new Promise((resolve) => { resolveViewportChange = resolve; });
    const abortOnViewportChange = () => {
      if (window.innerWidth === arrivalViewport.width && window.innerHeight === arrivalViewport.height) return;
      viewportChanged = true;
      resolveViewportChange();
    };
    window.addEventListener('resize', abortOnViewportChange);
    try {
      receiver = document.querySelector('.contact-card');
      receiverSignal = receiver?.querySelector('.contact-card__signal');
      receiver?.classList.add('is-contact-receiver-armed');
      const receiverRect = receiverSignal?.getBoundingClientRect();
      receiverPrepared = Boolean(receiverRect && Number.isFinite(receiverRect.left) && Number.isFinite(receiverRect.top));
      transition = createContactTransfer(receiverPrepared ? {
        targetX: receiverRect.left + (receiverRect.width * .5),
        targetY: receiverRect.top + (receiverRect.height * .5)
      } : {});
      contactTransferState = 'arriving';
      transition.classList.add('is-arrival-ready');
      await nextPaint();
      if (generation !== contactTransferGeneration || !transition.isConnected) return;
      if (receiverPrepared) {
        receiver?.classList.remove('is-contact-receiver-armed');
        receiver?.classList.add('is-contact-receiving');
        receiverRunning = true;
        void waitForMotion(receiverSignal, 'animationend', 1200, 'contact-card-receive').then(() => {
          receiver?.classList.remove('is-contact-receiving');
        });
      }
      document.body.classList.add('contact-transfer-arriving');
      transition.classList.add('is-arriving');
      document.documentElement.classList.remove('contact-transfer-boot');
      await Promise.race([
        waitForMotion(transition, 'animationend', contactTransferArrivalDuration, 'contact-transfer-arrival-clock'),
        viewportChange
      ]);
      if (viewportChanged) {
        receiver?.classList.remove('is-contact-receiving');
        receiverRunning = false;
      }
    } catch (error) {
      /* Reveal the destination immediately if the visual handoff cannot start. */
    } finally {
      window.removeEventListener('resize', abortOnViewportChange);
      document.documentElement.classList.remove('contact-transfer-boot');
      clearContactTransfer({ preserveReceiver: receiverRunning });
      document.body.classList.add('page-arrival-complete');
    }
  };

  const showPageArrival = async () => {
    if (document.documentElement.classList.contains('contact-transfer-boot')) return;
    if (!document.documentElement.classList.contains('page-transition-boot')) return;
    const pageTransition = readPageTransition();
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

  const finishLanguageArrival = () => {
    sessionStorage.removeItem(languageBridgeKey);
    document.documentElement.classList.remove(
      'language-bridge-enter',
      'language-bridge-entering'
    );
    ['--language-eye-x', '--language-eye-y', '--language-eye-body-y', '--language-eye-pupil-radius', '--language-eye-cover-radius'].forEach((property) => {
      document.documentElement.style.removeProperty(property);
    });
    languageArrivalPlaying = false;
  };

  const showLanguageArrival = async () => {
    const enteringHall = document.documentElement.classList.contains('language-bridge-enter');
    if (languageArrivalPlaying || !enteringHall) return;
    languageArrivalPlaying = true;

    if (reduceMotion.matches) {
      if (enteringHall) document.body.classList.add('page-arrival-complete');
      finishLanguageArrival();
      return;
    }

    sessionStorage.removeItem(pageTransitionKey);
    document.documentElement.classList.remove('page-transition-boot');
    const activeHallMedia = document.querySelector('.hero-project.is-active [data-project-media]');
    if (activeHallMedia instanceof HTMLVideoElement) ensureVideoSource(activeHallMedia);
    if (activeHallMedia) waitForRenderableMedia(activeHallMedia).catch(() => {});
    await nextPaint();
    document.documentElement.classList.add('language-bridge-entering');
    await waitForMotion(document.body, 'animationend', eyeDiveDuration, 'language-hall-arrive');
    document.body.classList.add('page-arrival-complete');
    finishLanguageArrival();
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
      <span class="archive-transition__meta">CORVO</span>
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

  const departIntoProject = async (link, media, label, useDisplayFont, destinationReady = Promise.resolve()) => {
    document.querySelectorAll('.project-portal-backdrop, .project-world-signal, .project-world-title').forEach((element) => element.remove());
    const { backdrop, signal, title } = createProjectDeparture(label, useDisplayFont);
    const cardVisual = link.querySelector('.project-index-card__visual');
    link.classList.add('is-launching');
    if (cardVisual) {
      await nextPaint();
      await waitForMotion(cardVisual, 'animationend', projectCardOpenDuration, 'project-card-open');
    }
    freezeNavigationSource();
    document.body.classList.add('project-portal-leaving');
    void backdrop.offsetWidth;
    await nextPaint();
    backdrop.classList.add('is-departing-world');
    signal.classList.add('is-departing');
    title?.classList.add('is-departing');
    const departureFinished = waitForMotion(backdrop, 'animationend', projectDepartureDuration, 'project-world-backdrop');
    await Promise.allSettled([departureFinished, destinationReady]);
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
      await waitForMotion(document.documentElement, 'animationend', projectArrivalDuration, 'project-door-left-reveal');
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
    if (document.documentElement.classList.contains('navigation-source-frozen')) return;
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
    if (document.documentElement.classList.contains('navigation-source-frozen')) return;
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
    sessionStorage.removeItem(languageBridgeKey);
    sessionStorage.removeItem(languageReturnKey);
    document.documentElement.classList.remove(
      'page-transition-boot',
      'gate-natural-entry',
      'gate-preparing',
      'gate-exiting',
      'language-return-settled'
    );
    document.body.classList.remove('gate-preparing', 'gate-exiting');
    document.documentElement.classList.add('gate-entrance-skip');
    window.clearTimeout(eyeTrackingReleaseTimer);
    const releaseGeneration = ++eyeTrackingReleaseGeneration;
    eyeTrackingLocked = true;
    lastPointerPosition = null;
    lockEyeAtRest();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (releaseGeneration !== eyeTrackingReleaseGeneration) return;
      eyeTrackingReleaseTimer = window.setTimeout(() => {
        if (releaseGeneration !== eyeTrackingReleaseGeneration) return;
        lastPointerPosition = null;
        mark?.classList.add('eye-tracking-resuming');
        mark?.classList.remove('eye-geometry-locked');
        eyeTrackingLocked = false;
        window.setTimeout(() => mark?.classList.remove('eye-tracking-resuming'), 620);
        eyeTrackingReleaseTimer = 0;
      }, 320);
    }));
    languageArrivalPlaying = false;
    navigationInProgress = false;
  };

  const showNaturalGateEntrance = () => {
    if (!gate) return;
    gateInitialStateHandled = true;
    window.clearTimeout(eyeTrackingReleaseTimer);
    eyeTrackingReleaseTimer = 0;
    eyeTrackingReleaseGeneration += 1;
    languageArrivalPlaying = false;
    navigationInProgress = false;
    sessionStorage.removeItem(languageBridgeKey);
    sessionStorage.removeItem(languageReturnKey);
    document.documentElement.classList.remove(
      'language-return-settled',
      'gate-entrance-skip',
      'gate-preparing',
      'gate-exiting'
    );
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

  // pageshow is the single owner of destination arrivals. Starting the bridge
  // during script evaluation as well used to restart it when pageshow fired.
  window.addEventListener('pageshow', (event) => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (gate) {
      // A frozen source document can be restored from the back-forward cache.
      // Release that captured frame before consuming the fresh return state,
      // otherwise every language handoff after the first remains paused.
      if (event.persisted) {
        resetNavigationState();
        if (readSettledLanguageReturn()) {
          document.documentElement.classList.add('gate-entrance-skip', 'language-return-settled');
        }
      }
      if (gateInitialStateHandled && !event.persisted) return;
      if (event.persisted) gateInitialStateHandled = false;
      if (document.documentElement.classList.contains('language-return-settled')) {
        gateInitialStateHandled = true;
        showResolvedGate();
      } else showNaturalGateEntrance();
    } else {
      const projectState = readProjectTransition();
      if (projectState?.phase === 'enter' && document.querySelector('[data-project-hero]')) {
        document.documentElement.classList.add('project-entry-boot');
      }
      if (sessionStorage.getItem(archiveTransitionKey) && document.body.classList.contains('work-page')) {
        document.documentElement.classList.add('archive-entry-boot');
      }
      resetNavigationState();
      if (event.persisted) {
        const pendingContactTransfer = readContactTransfer();
        if (pendingContactTransfer?.sourcePath === window.location.pathname) {
          try { sessionStorage.removeItem(contactTransferKey); }
          catch (error) { /* Storage may be disabled. */ }
        }
      }
      showLanguageArrival();
      showContactTransferArrival();
      showPageArrival();
      showProjectArrival();
      resumeProjectVideos();
      showProjectReturn();
      showArchiveArrival();
    }
  });
  window.addEventListener('pagehide', (event) => {
    // Store only stable documents in the back-forward cache. Transition data
    // remains in sessionStorage, while the frozen visual state is discarded.
    if (event.persisted) resetNavigationState();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeProjectVideos();
  });
  window.addEventListener('focus', resumeProjectVideos);
  window.addEventListener('online', resumeProjectVideos);

  const portfolioNav = document.querySelector('.portfolio-nav');
  if (portfolioNav) {
    let lastNavScroll = 0;
    portfolioNav.querySelectorAll('.nav-logo, .nav-links a, .language-switch').forEach((control) => {
      let touchAnimationTimer;
      control.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        window.clearTimeout(touchAnimationTimer);
        control.classList.remove('is-touch-active');
        void control.offsetWidth;
        control.classList.add('is-touch-active');
        touchAnimationTimer = window.setTimeout(() => control.classList.remove('is-touch-active'), 720);
      }, { passive: true });
    });
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
      sessionStorage.removeItem(pageTransitionKey);
      sessionStorage.removeItem(projectTransitionKey);
      const gateReady = warmNavigationPage(link);
      const stage = createLanguageReturnStage();
      const stageReadiness = [];
      if (document.fonts?.ready) stageReadiness.push(document.fonts.ready);
      const stageImage = stage.querySelector('.reactive-mark__image');
      if (stageImage?.decode) stageReadiness.push(stageImage.decode());
      await Promise.allSettled(stageReadiness);
      await nextPaint();
      // Lock scrolling and measure in the same task so no intermediate,
      // scrollbar-shifted frame can be painted before the animation starts.
      document.documentElement.classList.add('language-return-staging');
      if (!setLanguageReturnStageGeometry(stage)) {
        document.documentElement.classList.remove('language-return-staging', 'language-return-running');
        stage.remove();
        window.location.assign(link.href);
        return;
      }
      const refreshStageGeometry = () => setLanguageReturnStageGeometry(stage);
      window.addEventListener('resize', refreshStageGeometry, { passive: true });
      window.visualViewport?.addEventListener('resize', refreshStageGeometry, { passive: true });
      freezeNavigationSource();
      const departureReady = waitForMotion(document.body, 'animationend', languageReturnStageDuration, 'language-return-source-v5');
      document.documentElement.classList.add('language-return-running');
      await Promise.allSettled([gateReady, departureReady]);
      window.removeEventListener('resize', refreshStageGeometry);
      window.visualViewport?.removeEventListener('resize', refreshStageGeometry);
      sessionStorage.setItem(languageReturnKey, JSON.stringify({
        version: 5,
        phase: 'settled',
        path: new URL(link.href, window.location.href).pathname,
        startedAt: Date.now()
      }));
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
      sessionStorage.removeItem(pageTransitionKey);
      sessionStorage.removeItem(projectTransitionKey);
      const eyeGeometry = setPupilTransitionGeometry();
      if (!eyeGeometry) {
        sessionStorage.removeItem(languageBridgeKey);
        window.location.assign(link.href);
        return;
      }
      document.documentElement.classList.add('gate-preparing');
      await waitForMotion(gate.querySelector('.gate-inner'), 'animationend', eyePrepareDuration, 'eye-entry-tremor');
      document.documentElement.classList.remove('gate-preparing');
      freezeNavigationSource();
      await hallWarmup;
      document.documentElement.classList.add('gate-exiting');
      await waitForMotion(document.querySelector('[data-pupil-transition]'), 'animationend', eyeDiveDuration, 'pupil-cover');
      sessionStorage.setItem(languageBridgeKey, JSON.stringify({
        version: 2,
        direction: 'enter',
        path: new URL(link.href, window.location.href).pathname,
        startedAt: Date.now()
      }));
      window.location.assign(link.href);
    });
  });

  const projectIndexControllers = new WeakMap();
  let activeProjectIndexController = null;

  document.querySelectorAll('[data-project-link]').forEach((link) => {
    const isIndexCard = link.classList.contains('project-index-card');
    const media = link.querySelector('[data-project-media]');
    const previewVideo = isIndexCard ? link.querySelector('video[data-project-media]') : null;
    let touchInterestEngaged = false;
    let touchInterestTimer = 0;
    let indexController = null;

    const warmProjectDestination = () => {
      warmProjectVideo(link);
      warmNavigationPage(link);
    };

    if (isIndexCard) {
      const hoverTarget = link.querySelector('.project-index-card__aperture') || link;
      let hovered = false;
      let focused = false;
      let touching = false;
      let touchActivationPending = false;
      let touchGestureCancelled = false;
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartScrollY = 0;
      let touchPreviewTimer = 0;
      let touchCancellationTimer = 0;

      const resetTouchCancellation = () => {
        window.clearTimeout(touchCancellationTimer);
        touchCancellationTimer = 0;
        touchGestureCancelled = false;
      };

      const syncPreview = () => {
        const previewing = !document.hidden && !link.hidden && !link.classList.contains('is-launching') && (
          hovered || focused || touching
        );
        if (!previewing) {
          link.classList.remove('is-previewing');
          stopProjectCardPreview(previewVideo);
          if (activeProjectIndexController === indexController) activeProjectIndexController = null;
          return;
        }
        if (activeProjectIndexController && activeProjectIndexController !== indexController) {
          activeProjectIndexController.close();
        }
        activeProjectIndexController = indexController;
        link.classList.add('is-previewing');
        startProjectCardPreview(previewVideo);
      };

      indexController = {
        close() {
          window.clearTimeout(touchPreviewTimer);
          touchPreviewTimer = 0;
          resetTouchCancellation();
          hovered = false;
          focused = false;
          touching = false;
          touchActivationPending = false;
          syncPreview();
        },
        preload() {
          if (previewVideo && !reduceMotion.matches) ensureVideoSource(previewVideo);
        },
        replay() {
          if (link.classList.contains('is-previewing')) startProjectCardPreview(previewVideo);
        },
        consumeTouchActivation() {
          const touchActivation = { touch: touchActivationPending, cancelled: touchGestureCancelled };
          touchActivationPending = false;
          resetTouchCancellation();
          return touchActivation;
        },
        cancelTouchGesture() {
          window.clearTimeout(touchPreviewTimer);
          window.clearTimeout(touchCancellationTimer);
          touchActivationPending = false;
          touchGestureCancelled = true;
          touchCancellationTimer = window.setTimeout(resetTouchCancellation, 700);
          touching = false;
          syncPreview();
        },
        cancelIfScrolled() {
          if (touching && Math.abs(window.scrollY - touchStartScrollY) > 14) this.cancelTouchGesture();
        },
        beginLaunch() {
          window.clearTimeout(touchPreviewTimer);
          touchActivationPending = false;
          touching = true;
        }
      };
      projectIndexControllers.set(link, indexController);

      hoverTarget.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        hovered = true;
        syncPreview();
      });
      hoverTarget.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'touch') return;
        hovered = false;
        syncPreview();
      });
      link.addEventListener('focus', () => {
        window.requestAnimationFrame(() => {
          focused = link.matches(':focus-visible');
          syncPreview();
        });
      });
      link.addEventListener('blur', () => { focused = false; syncPreview(); });
      link.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        window.clearTimeout(touchPreviewTimer);
        resetTouchCancellation();
        touchActivationPending = true;
        touchStartX = event.clientX;
        touchStartY = event.clientY;
        touchStartScrollY = window.scrollY;
        touching = true;
        syncPreview();
      }, { passive: true });
      link.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'mouse' || !touching) return;
        if (Math.hypot(event.clientX - touchStartX, event.clientY - touchStartY) > 14) {
          indexController.cancelTouchGesture();
        }
      }, { passive: true });
      link.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'mouse') return;
        window.clearTimeout(touchPreviewTimer);
        touchPreviewTimer = window.setTimeout(() => {
          touching = false;
          syncPreview();
        }, 540);
      }, { passive: true });
      link.addEventListener('pointercancel', (event) => {
        if (event.pointerType === 'mouse') return;
        indexController.cancelTouchGesture();
      }, { passive: true });
      link.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        indexController.close();
        link.blur();
      });
      previewVideo?.addEventListener('canplay', () => indexController.replay());
      indexController.close();
    } else {
      const resetTouchInterest = () => {
        window.clearTimeout(touchInterestTimer);
        touchInterestTimer = 0;
        touchInterestEngaged = false;
        link.classList.remove('is-touch-interest');
      };
      const showTouchInterest = (event) => {
        if (event.pointerType === 'mouse') return;
        window.clearTimeout(touchInterestTimer);
        touchInterestEngaged = true;
        link.classList.add('is-touch-interest');
      };
      const releaseTouchInterest = (event) => {
        if (event.pointerType === 'mouse') return;
        window.clearTimeout(touchInterestTimer);
        if (event.type === 'pointercancel') {
          resetTouchInterest();
          return;
        }
        touchInterestTimer = window.setTimeout(resetTouchInterest, 520);
      };
      link.addEventListener('pointerdown', showTouchInterest, { passive: true });
      link.addEventListener('pointerup', releaseTouchInterest, { passive: true });
      link.addEventListener('pointercancel', releaseTouchInterest, { passive: true });
      window.addEventListener('pageshow', resetTouchInterest);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resetTouchInterest();
      });
      resetTouchInterest();
    }

    link.addEventListener('pointerenter', warmProjectDestination, { passive: true });
    link.addEventListener('focus', warmProjectDestination, { passive: true });
    if (!isIndexCard) link.addEventListener('touchstart', warmProjectDestination, { passive: true, once: true });
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      if (!media) return;
      if (link.classList.contains('is-launching') || navigationInProgress) {
        event.preventDefault();
        return;
      }

      let touchActivation = { touch: false, cancelled: false };
      if (isIndexCard) {
        touchActivation = indexController.consumeTouchActivation();
        if (touchActivation.cancelled) {
          event.preventDefault();
          return;
        }
      }

      event.preventDefault();
      navigationInProgress = true;
      indexController?.beginLaunch();
      const destinationReady = Promise.allSettled([warmProjectVideo(link), warmNavigationPage(link)]);
      if ((isIndexCard && touchActivation.touch) || (!isIndexCard && touchInterestEngaged)) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      document.querySelectorAll('.archive-transition').forEach((transition) => transition.remove());
      sessionStorage.removeItem(archiveTransitionKey);
      const useDisplayFont = projectDisplayFontAvailable;
      const label = link.querySelector('h2, h3')?.textContent.trim() || link.dataset.projectId;
      departIntoProject(link, media, label, useDisplayFont, destinationReady).catch(() => {
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

  window.addEventListener('scroll', () => activeProjectIndexController?.cancelIfScrolled(), { passive: true });
  window.addEventListener('pageshow', () => activeProjectIndexController?.close());
  document.addEventListener('visibilitychange', () => activeProjectIndexController?.close());

  document.querySelectorAll('[data-home-projects]').forEach((projects) => {
    const slides = [...projects.querySelectorAll('.hero-project')];
    if (slides.length < 2) return;

    const coverIndex = slides.findIndex((slide) => slide.dataset.projectId === 'dyson-swarm');
    let active = coverIndex >= 0 ? coverIndex : 0;
    let historyIndex = 0;
    let scrollSoftenTimer = 0;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeTracking = false;
    let suppressProjectClickUntil = 0;
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
    projects.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) {
        swipeTracking = false;
        return;
      }
      swipeStartX = event.touches[0].clientX;
      swipeStartY = event.touches[0].clientY;
      swipeTracking = true;
    }, { passive: true });
    projects.addEventListener('touchend', (event) => {
      if (!swipeTracking || !event.changedTouches.length) return;
      swipeTracking = false;
      const deltaX = event.changedTouches[0].clientX - swipeStartX;
      const deltaY = event.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;

      suppressProjectClickUntil = performance.now() + 420;
      if (deltaX < 0) chooseNext();
      else choosePrevious();
    }, { passive: true });
    projects.addEventListener('touchcancel', () => {
      swipeTracking = false;
    }, { passive: true });
    projects.addEventListener('click', (event) => {
      if (performance.now() >= suppressProjectClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
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
          projectIndexControllers.get(card)?.close();
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

    buttons.forEach((button) => button.addEventListener('click', () => {
      selectCategory(button);
      if (window.matchMedia('(hover: none), (pointer: coarse)').matches) button.blur();
    }));
    filter.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch') return;
      window.requestAnimationFrame(() => event.target.closest('summary, button')?.blur());
    }, { passive: true });
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
  if (indexCapsules.length && 'IntersectionObserver' in window) {
    const capsuleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target.closest('.project-index-card');
        const controller = projectIndexControllers.get(card);
        if (entry.isIntersecting) controller?.preload();
        else controller?.close();
      });
    }, { rootMargin: '30% 0px', threshold: 0.08 });
    indexCapsules.forEach((capsule) => capsuleObserver.observe(capsule));
  }

  document.querySelectorAll('[data-work-entry]').forEach((link) => {
    const target = new URL(link.href, window.location.href);
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      if (target.pathname === window.location.pathname) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      freezeNavigationSource();
      await warmNavigationPage(link);
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

  document.querySelectorAll('[data-contact-entry]').forEach((link) => {
    ['pointerenter', 'focus', 'touchstart'].forEach((eventName) => {
      link.addEventListener(eventName, () => { warmNavigationPage(link); }, { passive: true, once: true });
    });
    link.addEventListener('click', async (event) => {
      if (reduceMotion.matches || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      const target = new URL(link.href, window.location.href);
      if (target.pathname === window.location.pathname) return;
      event.preventDefault();
      if (navigationInProgress || contactTransferState !== 'idle') return;
      navigationInProgress = true;
      try {
        warmNavigationPage({ href: target.href });
        const signalRect = link.querySelector('.about-contact-cta__signal')?.getBoundingClientRect();
        if (!signalRect || !Number.isFinite(signalRect.left) || !Number.isFinite(signalRect.top)) {
          window.location.assign(target.href);
          return;
        }
        const transition = createContactTransfer({
          x: signalRect.left + (signalRect.width * .5),
          y: signalRect.top + (signalRect.height * .5)
        });
        document.querySelectorAll('.archive-transition, .project-portal-backdrop, .project-world-signal, .project-world-title').forEach((element) => element.remove());
        sessionStorage.removeItem(archiveTransitionKey);
        sessionStorage.removeItem(projectTransitionKey);
        sessionStorage.removeItem(pageTransitionKey);
        sessionStorage.removeItem(contactTransferKey);
        const departureResult = await runContactTransferDeparture(transition, link);
        if (departureResult.status !== 'completed') {
          if (departureResult.generation !== contactTransferGeneration) return;
          clearContactTransfer();
          navigationInProgress = false;
          if (departureResult.status === 'failed') window.location.assign(target.href);
          return;
        }
        try {
          sessionStorage.setItem(contactTransferKey, JSON.stringify({
            type: 'about-contact',
            version: 1,
            phase: 'handoff',
            sourcePath: window.location.pathname,
            path: target.pathname,
            startedAt: Date.now()
          }));
        } catch (error) { /* A covered source can still navigate without an animated arrival. */ }
        window.location.assign(target.href);
      } catch (error) {
        try { sessionStorage.removeItem(contactTransferKey); }
        catch (storageError) { /* Storage may be disabled. */ }
        clearContactTransfer();
        navigationInProgress = false;
        window.location.assign(target.href);
      }
    });
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      if (link.hasAttribute('data-language-link') || link.hasAttribute('data-language-menu') || link.hasAttribute('data-project-link') || link.hasAttribute('data-work-entry') || link.hasAttribute('data-contact-entry') || reduceMotion.matches || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin || target.protocol === 'mailto:' || target.protocol === 'tel:') return;
      if (target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
      event.preventDefault();
      if (navigationInProgress) return;
      navigationInProgress = true;
      freezeNavigationSource();
      await warmNavigationPage(link);
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
