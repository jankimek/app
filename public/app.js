(function () {
  const app = document.getElementById('app');
  // Keep the native post picker outside #app. Mobile pickers can stay open
  // long enough for a WebSocket or full-app refresh to rebuild #app; if the file
  // input lived inside that tree, its eventual change event was lost.
  const postMediaInput = document.createElement('input');
  postMediaInput.id = 'post-input';
  postMediaInput.type = 'file';
  postMediaInput.accept = 'image/*,video/*';
  postMediaInput.multiple = true;
  postMediaInput.hidden = true;
  postMediaInput.tabIndex = -1;
  document.body.appendChild(postMediaInput);

  let postMediaPickerMode = 'replace';

  function openPostMediaPicker() {
    const options = arguments[0] || {};
    postMediaPickerMode = options.append ? 'append' : 'replace';
    postMediaInput.value = '';
    postMediaInput.click();
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let stableViewportHeight = 0;
  let stableViewportWidth = 0;
  let viewportUpdateFrame = 0;
  let pendingViewportForceStable = false;
  let appliedViewportState = '';

  function focusedEditable() {
    return document.activeElement?.matches?.('input, textarea, [contenteditable="true"]');
  }

  function setViewportHeight(forceStable = false) {
    const viewport = window.visualViewport;
    const visualHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const layoutHeight = Math.max(visualHeight, Math.round(window.innerHeight || visualHeight));
    const visualTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const root = document.documentElement;
    const layoutWidth = Math.max(1, Math.round(root.clientWidth || window.innerWidth));
    const keyboardSized = Boolean(stableViewportHeight && stableViewportHeight - visualHeight > 90);
    const keyboardOpen = Boolean(
      keyboardSized &&
      (focusedEditable() || root.classList.contains('keyboard-open'))
    );
    const mobileViewport = window.matchMedia('(max-width: 860px)').matches;
    const stableSizeChanged = Boolean(
      forceStable ||
      !stableViewportHeight ||
      layoutWidth !== stableViewportWidth ||
      (!mobileViewport && !keyboardOpen && layoutHeight !== stableViewportHeight)
    );
    const messages = document.getElementById('messages');
    const keepMessagesAtBottom = Boolean(
      stableSizeChanged &&
      messages &&
      messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80
    );

    // Mobile Safari changes visualViewport/innerHeight while its URL and
    // toolbar chrome settles. Keep the layout viewport stable until a real
    // width/orientation change so the chat grid cannot jump after opening.
    if (stableSizeChanged) {
      stableViewportHeight = layoutHeight;
      stableViewportWidth = layoutWidth;
    }

    const nextViewportState = `${stableViewportHeight}|${visualHeight}|${visualTop}|${keyboardOpen ? 'open' : 'closed'}`;
    if (nextViewportState === appliedViewportState) return;
    appliedViewportState = nextViewportState;
    root.style.setProperty('--app-height', `${stableViewportHeight}px`);
    root.style.setProperty('--visual-height', `${visualHeight}px`);
    root.style.setProperty('--visual-top', `${visualTop}px`);
    root.classList.toggle('keyboard-open', keyboardOpen);
    if (keepMessagesAtBottom) requestAnimationFrame(scrollMessagesToBottom);
  }

  function scheduleViewportHeight(forceStable = false) {
    pendingViewportForceStable ||= forceStable;
    if (viewportUpdateFrame) return;
    viewportUpdateFrame = requestAnimationFrame(() => {
      viewportUpdateFrame = 0;
      const force = pendingViewportForceStable;
      pendingViewportForceStable = false;
      setViewportHeight(force);
    });
  }

  setViewportHeight(true);
  window.addEventListener('resize', () => scheduleViewportHeight());
  window.addEventListener('orientationchange', () => setTimeout(() => scheduleViewportHeight(true), 180));
  window.visualViewport?.addEventListener('resize', () => scheduleViewportHeight());
  window.visualViewport?.addEventListener('scroll', () => scheduleViewportHeight());

  const state = {
    authMode: 'login',
    needsTwoFactor: false,
    me: null,
    twoFactorEnabled: false,
    isModerator: false,
    twoFactorSetup: null,
    tab: 'home',
    lastTab: 'home',
    tabTransition: false,
    tabDirection: 'right',
    navigationStack: [],
    forwardNavigationEntries: new Map(),
    navigationGeneration: Number.isInteger(history.state?.navGeneration) ? history.state.navGeneration : 0,
    routeForward: null,
    navigationBusy: false,
    pendingHistoryBack: null,
    socialTransition: null,
    contacts: [],
    chats: [],
    groups: [],
    activePeer: null,
    activeGroup: null,
    groupComposer: null,
    chatProfileOpen: false,
    chatReturnAnimation: false,
    chatOpening: false,
    chatLoading: false,
    chatOpenToken: 0,
    conversationCache: new Map(),
    conversationScroll: new Map(),
    messages: [],
    hasOlderMessages: false,
    loadingOlderMessages: false,
    composerDrafts: {},
    highlightMessageId: null,
    searchResults: [],
    userQuery: '',
    userSearching: false,
    searchProfileOpen: false,
    searchProfileSocialView: null,
    profileReturnScroll: null,
    conversationQuery: '',
    conversationResults: [],
    conversationSearching: false,
    profileSocialView: null,
    chatProfileSocialView: null,
    recommendations: [],
    publicProfile: null,
    recentProfiles: JSON.parse(localStorage.getItem('recentProfiles') || '[]'),
    pendingRequestCount: 0,
    notifications: [],
    requests: [],
    homeFeed: [],
    feedMode: localStorage.getItem('feedMode') || 'for_you',
    feedMenuOpen: false,
    feedLoading: false,
    explorePosts: [],
    exploreLoading: false,
    clips: [],
    clipMode: 'for_you',
    clipViewer: null,
    clipMuted: localStorage.getItem('clipMuted') !== '0',
    notes: [],
    postComposer: null,
    postPublishing: false,
    musicPicker: null,
    profileMediaTab: 'posts',
    searchProfileMediaTab: 'posts',
    profilePosts: new Map(),
    expandedPosts: new Set(),
    noteComposer: null,
    noteRecording: null,
    settingsSection: 'main',
    blockedUsers: [],
    accountActivity: { comments: [], reposts: [] },
    hiddenRecommendations: JSON.parse(localStorage.getItem('hiddenRecommendations') || '[]'),
    unreadByPeer: {},
    messageNotifications: localStorage.getItem('messageNotifications') !== '0' &&
      'Notification' in window && Notification.permission !== 'denied',
    notificationPromptDismissed: sessionStorage.getItem('notificationPromptDismissed') === '1',
    toasts: [],
    actionSheet: null,
    messageFocus: null,
    messageFocusClosing: false,
    messageFocusNeedsRefresh: false,
    messageFocusNeedsRefresh: false,
    lastMessageTap: null,
    storyPublishing: false,
    gifPool: [],
    chatGifResults: [],
    chatGifLoading: false,
    chatGifProvider: '',
    chatGifError: '',
    sendingGifId: null,
    pendingGifs: [],
    gifLoading: false,
    overlayClosing: false,
    profileEditOpen: false,
    settingsOpen: false,
    settingsOpening: false,
    settingsClosing: false,
    recommendationsOpen: false,
    avatarCrop: null,
    storyEditor: null,
    storyViewer: null,
    storyCommentPosting: new Set(),
    cameraCapture: null,
    highlightComposer: null,
    mediaViewer: null,
    stickerPanel: false,
    chatTrayTab: 'stickers',
    chatGifQuery: '',
    stickerCreator: null,
    stickerSets: [],
    activeStickerSet: 'all',
    stickerSetEditor: null,
    stickerSavePrompt: null,
    chatCustomizationOpen: false,
    chatAppearance: defaultChatAppearance(),
    stickers: [],
    stickerMap: new Map(),
    replyTo: null,
    typingPeerId: null,
    typingGroup: null,
    ws: null,
    typingTimer: null,
    recorder: null,
    recordStream: null,
    recordChunks: [],
    drag: null,
    storyTextDrag: null,
    storyTextGesture: null,
    storyMediaDrag: null,
    storyMediaGesture: null,
    storyStickerDrag: null,
    storyStickerGesture: null,
    storyDraw: null,
    storyVideoTrimDrag: null,
    postCropDrag: null,
    postCropGesture: null,
    commentSheetDrag: null,
    edgeSwipe: null,
    tabSwipe: null,
    suppressClickUntil: 0,
    scrollMemory: {},
    longPressTimer: null,
    longPressTriggered: false,
    call: freshCallState()
  };

  const cropPointers = new Map();
  const postCropPointers = new Map();
  const storyTextPointers = new Map();
  const storyMediaPointers = new Map();
  const storyStickerPointers = new Map();
  const toastTimers = new Map();
  let storyTextTransformFrame = 0;
  let storyMediaTransformFrame = 0;
  let storyDrawFrame = 0;
  let pendingStoryStroke = null;
  let storyLocationTimer = null;
  let storyGifTimer = null;
  let storyCommentGifTimer = null;
  let storyLocationRequestId = 0;
  let storyGifRequestId = 0;
  let storyCommentGifRequestId = 0;
  let storyCountdownTimer = null;
  let cameraStream = null;
  let cameraCloseTimer = null;
  let chatScrollSettleCleanup = null;
  let navigationMaintenanceFrame = 0;
  let navigationMaintenanceIdle = 0;

  function freshCallState() {
    return {
      peerId: null,
      pc: null,
      localStream: null,
      remoteStream: null,
      incoming: null,
      active: false,
      video: false,
      status: ''
    };
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderMentionText(value) {
    return String(value || '').split(/(@[a-zA-Z0-9_.]{3,24})/g).map((part) => {
      if (!/^@[a-zA-Z0-9_.]{3,24}$/.test(part)) return esc(part);
      return `<button class="inline-mention" data-action="view-user-profile" data-username="${esc(part.slice(1))}">${esc(part)}</button>`;
    }).join('');
  }

  function formValue(form, name) {
    return (new FormData(form).get(name) || '').toString();
  }

  async function api(path, options = {}) {
    const headers = options.headers || {};
    const init = {
      method: options.method || 'GET',
      headers,
      credentials: 'same-origin'
    };
    if (options.signal) init.signal = options.signal;
    if (options.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json', ...headers };
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(path, init);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const error = new Error(data.error || data || res.statusText);
      error.data = data;
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso));
  }

  function shortTime(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  }

  function compactRelativeTime(iso) {
    const then = new Date(iso || 0).getTime();
    if (!Number.isFinite(then)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 52) return `${weeks}w`;
    return `${Math.floor(days / 365)}y`;
  }

  function publicUsernameFromPath() {
    const match = /^\/u\/([^/]+)\/?$/.exec(location.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function sharedPostIdFromLocation() {
    const params = new URL(location.href).searchParams;
    return params.get('post') || params.get('clip') || null;
  }

  function profilePath(username) {
    return `/u/${encodeURIComponent(username || '')}`;
  }

  function captureNavigationView() {
    return {
      tab: state.tab,
      lastTab: state.lastTab,
      profileSocialView: state.profileSocialView,
      chatProfileOpen: state.chatProfileOpen,
      chatProfileSocialView: state.chatProfileSocialView,
      searchProfileOpen: state.searchProfileOpen,
      searchProfileSocialView: state.searchProfileSocialView,
      publicProfileUsername: state.publicProfile?.username || null,
      activePeerId: state.activePeer?.id || null,
      activeGroupId: state.activeGroup?.id || null,
      clipViewer: state.clipViewer ? { ...state.clipViewer } : null
    };
  }

  function currentAppShell() {
    return app.querySelector(':scope > .app-shell:not(.route-page-underlay)');
  }

  function captureNavigationEntry(kind = 'page') {
    capturePersistentScroll();
    const liveShell = currentAppShell();
    clearTabTransitionAnimation(liveShell);
    const messageScroll = captureMessagesScroll();
    const liveScroll = captureLiveScroll(liveShell);
    // A page that just finished a back transition stays fixed until it is
    // needed again. Normalize it while it is still the current page, before
    // renderApp detaches it for the next forward transition.
    releaseNavigationShellLayer(liveShell);
    return {
      kind,
      view: captureNavigationView(),
      activePeer: state.activePeer,
      activeGroup: state.activeGroup,
      publicProfile: state.publicProfile,
      messages: state.messages,
      chatAppearance: state.chatAppearance,
      hasOlderMessages: state.hasOlderMessages,
      chatLoading: state.chatLoading,
      highlightMessageId: state.highlightMessageId,
      messageScroll,
      scrollMemory: { ...state.scrollMemory },
      liveShell,
      liveScroll,
      // The retained shell is the route snapshot. Serializing the entire app
      // on every navigation produces large short-lived allocations that make
      // mobile garbage collection show up as an end-of-transition hitch.
      previewHtml: liveShell ? '' : currentAppShell()?.outerHTML || ''
    };
  }

  function pushNavigationEntry(entry, url = location.href) {
    if (!entry) return;
    const nextDepth = state.navigationStack.length + 1;
    for (const depth of [...state.forwardNavigationEntries.keys()]) {
      if (depth >= nextDepth) state.forwardNavigationEntries.delete(depth);
    }
    state.navigationStack.push(entry);
    state.routeForward = entry;
    history.pushState({
      appManaged: true,
      navDepth: state.navigationStack.length,
      navGeneration: state.navigationGeneration,
      view: captureNavigationView()
    }, '', url);
  }

  function syncCurrentNavigationHistory() {
    const current = history.state;
    if (!state.routeForward || !current?.appManaged || current.navDepth !== state.navigationStack.length) return;
    history.replaceState({
      ...current,
      navGeneration: state.navigationGeneration,
      view: captureNavigationView()
    }, '', location.href);
  }

  function restoreForwardNavigationEntry(targetDepth) {
    if (targetDepth !== state.navigationStack.length + 1) return null;
    const entry = state.forwardNavigationEntries.get(targetDepth);
    if (!entry) return null;
    // Refresh this retained source page before reusing it for another back.
    Object.assign(entry, captureNavigationEntry(entry.kind));
    state.navigationStack.push(entry);
    state.routeForward = entry;
    return entry;
  }

  function cancelForwardNavigationAnimation(surface = currentAppShell()) {
    if (!state.routeForward) return;
    state.routeForward = null;
    surface?.classList.remove('route-page-current', 'route-page-entering');
  }

  function restoreScrollPosition(element, top = 0, left = 0) {
    if (!element) return false;
    const nextTop = Number.isFinite(top) ? top : 0;
    const nextLeft = Number.isFinite(left) ? left : 0;
    let changed = false;
    if (element.scrollTop !== nextTop) {
      element.scrollTop = nextTop;
      changed = true;
    }
    if (element.scrollLeft !== nextLeft) {
      element.scrollLeft = nextLeft;
      changed = true;
    }
    return changed;
  }

  function restorePreviewScroll(root, entry) {
    if (!root || !entry) return;
    root.querySelectorAll('[data-scroll-memory]').forEach((element) => {
      const position = entry.scrollMemory?.[element.dataset.scrollMemory];
      if (!position) return;
      restoreScrollPosition(element, position.top, position.left);
    });
    const messages = root.querySelector('.messages');
    if (messages && entry.messageScroll) restoreScrollPosition(messages, entry.messageScroll.top, messages.scrollLeft);
  }

  function sanitizeNavigationPreview(root) {
    root?.querySelectorAll('[id]').forEach((element) => {
      element.dataset.navigationId = element.id;
      element.removeAttribute('id');
    });
    const shell = root?.querySelector(':scope > .app-shell');
    releaseNavigationShellLayer(shell);
    clearTabTransitionAnimation(shell);
    shell?.classList.remove(
      'route-page-current',
      'route-page-entering',
      'route-page-exiting',
      'route-swipe-current'
    );
  }

  function restoreNavigationPreviewIds(root) {
    root?.querySelectorAll('[data-navigation-id]').forEach((element) => {
      element.id = element.dataset.navigationId;
      delete element.dataset.navigationId;
    });
  }

  function clearTabTransitionAnimation(root) {
    const content = root?.matches?.('.tab-content') ? root : root?.querySelector?.('.tab-content');
    content?.classList.remove('animate-tab', 'from-left', 'from-right');
  }

  function settleTabTransitionAnimation(root = currentAppShell()) {
    const content = root?.querySelector?.('.tab-content.animate-tab');
    if (!content) return;
    afterVisualMotion(content, 'animationend', 250, () => clearTabTransitionAnimation(content));
  }

  function navigationPreviewTarget(preview) {
    return preview?.navigationTarget || preview?.querySelector(':scope > .app-shell') || null;
  }

  function navigationUnderlayOffset() {
    return isMobileLayout() ? '-18%' : '-4%';
  }

  function navigationMotionDuration(duration) {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : duration;
  }

  function releaseNavigationShellLayer(shell) {
    if (!shell || (!shell.classList.contains('route-page-underlay') && !shell.classList.contains('route-page-active-fixed'))) return;
    shell.classList.remove('route-page-underlay', 'route-page-active-fixed');
    shell.style.position = '';
    shell.style.inset = '';
    shell.style.width = '';
    shell.style.zIndex = '';
    shell.style.pointerEvents = '';
    shell.style.willChange = '';
    shell.style.transform = '';
    shell.style.opacity = '';
    shell.style.transition = '';
    shell.style.boxShadow = '';
  }

  function prepareNavigationUnderlay(preview, target, surface) {
    if (!preview || !target || !surface) return false;
    preview.navigationTarget = target;
    preview.navigationSurface = surface;
    preview.navigationSurfaceZIndex = surface.style.zIndex;
    preview.style.background = 'transparent';
    preview.style.transform = 'none';
    preview.style.opacity = '1';
    preview.style.zIndex = '2';
    preview.style.setProperty('--route-backdrop-opacity', '.22');
    target.classList.remove('route-page-active-fixed');
    target.classList.add('route-page-underlay');
    target.style.position = 'fixed';
    target.style.inset = '0';
    target.style.width = '100%';
    target.style.zIndex = '1';
    target.style.pointerEvents = 'none';
    target.style.willChange = 'transform';
    target.style.transform = `translateX(${navigationUnderlayOffset()})`;
    surface.style.zIndex = '3';
    return true;
  }

  function stopNavigationUnderlayAnimations(preview) {
    preview?.navigationTargetAnimation?.cancel?.();
    preview?.navigationBackdropAnimation?.cancel?.();
    if (preview) {
      preview.navigationTargetAnimation = null;
      preview.navigationBackdropAnimation = null;
    }
  }

  function animateNavigationUnderlay(preview, duration = 260) {
    const target = navigationPreviewTarget(preview);
    if (!preview || !target) return;
    const offset = `translateX(${navigationUnderlayOffset()})`;
    const timing = {
      duration: navigationMotionDuration(duration),
      easing: 'cubic-bezier(.28,.74,.22,1)',
      fill: 'forwards'
    };
    stopNavigationUnderlayAnimations(preview);
    target.style.transition = '';
    target.style.transform = offset;
    preview.style.opacity = '1';
    if (typeof target.animate === 'function') {
      preview.navigationTargetAnimation = target.animate([
        { transform: offset },
        { transform: 'translateX(0)' }
      ], timing);
    } else {
      target.style.transition = `transform ${timing.duration}ms ${timing.easing}`;
      requestAnimationFrame(() => {
        if (target.isConnected) target.style.transform = 'translateX(0)';
      });
    }
    if (typeof preview.animate === 'function') {
      preview.navigationBackdropAnimation = preview.animate([
        { opacity: 1 },
        { opacity: 0 }
      ], timing);
    } else {
      preview.style.transition = `opacity ${timing.duration}ms ${timing.easing}`;
      requestAnimationFrame(() => {
        if (preview.isConnected) preview.style.opacity = '0';
      });
    }
  }

  function settleNavigationUnderlay(preview) {
    const target = navigationPreviewTarget(preview);
    stopNavigationUnderlayAnimations(preview);
    if (target) target.style.transform = 'translateX(0)';
    if (preview) {
      preview.style.opacity = '0';
      preview.style.setProperty('--route-backdrop-opacity', '0');
    }
  }

  function activateNavigationShellLayer(shell) {
    if (!shell) return;
    shell.classList.remove('route-page-underlay');
    shell.classList.add('route-page-active-fixed');
    shell.style.position = 'fixed';
    shell.style.inset = '0';
    shell.style.width = '100%';
    shell.style.zIndex = '';
    shell.style.pointerEvents = '';
    shell.style.willChange = '';
    shell.style.transform = '';
    shell.style.opacity = '';
    shell.style.transition = '';
    shell.style.boxShadow = '';
  }

  function captureLiveScroll(root) {
    if (!root) return [];
    return [...root.querySelectorAll('[data-scroll-memory], .messages, .chat-profile-content, .post-carousel-track')]
      .map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  }

  function restoreLiveScroll(positions) {
    let changed = false;
    for (const position of positions || []) {
      if (!position.element?.isConnected) continue;
      changed = restoreScrollPosition(position.element, position.top, position.left) || changed;
    }
    return changed;
  }

  function restoreLiveScrollAfterMove(positions) {
    restoreLiveScroll(positions);
    requestAnimationFrame(() => restoreLiveScroll(positions));
  }

  function scheduleNavigationMaintenance() {
    if (navigationMaintenanceFrame) cancelAnimationFrame(navigationMaintenanceFrame);
    if (navigationMaintenanceIdle) {
      if (window.cancelIdleCallback) window.cancelIdleCallback(navigationMaintenanceIdle);
      else clearTimeout(navigationMaintenanceIdle);
      navigationMaintenanceIdle = 0;
    }
    navigationMaintenanceFrame = requestAnimationFrame(() => {
      navigationMaintenanceFrame = 0;
      refreshNavigationEdgeZone();
      const run = () => {
        navigationMaintenanceIdle = 0;
        resizeComposerInput();
        attachCallStreams();
        attachCameraStream();
        attachStoryEditorVideo();
        attachStoryViewerVideo();
      };
      if (window.requestIdleCallback) navigationMaintenanceIdle = window.requestIdleCallback(run, { timeout: 160 });
      else navigationMaintenanceIdle = setTimeout(run, 100);
    });
  }

  function stashNavigationPreview(preview) {
    if (!preview) return;
    const entry = preview.navigationEntry;
    const shell = navigationPreviewTarget(preview);
    stopNavigationUnderlayAnimations(preview);
    if (entry && shell) {
      entry.liveScroll = captureLiveScroll(shell);
      shell.remove();
      releaseNavigationShellLayer(shell);
      entry.liveShell = shell;
    } else {
      shell?.remove();
    }
    preview.remove();
    if (preview.navigationSurface?.isConnected) {
      preview.navigationSurface.style.zIndex = preview.navigationSurfaceZIndex || '';
    }
  }

  function stashNavigationPreviews() {
    app.querySelectorAll(':scope > .route-page-preview').forEach(stashNavigationPreview);
  }

  function installNavigationPreview(entry, mode = 'back') {
    stashNavigationPreviews();
    if (!entry?.liveShell && !entry?.previewHtml) return null;
    const current = currentAppShell();
    if (!current) return null;
    const preview = document.createElement('div');
    preview.className = `route-page-preview route-preview-${mode}`;
    preview.setAttribute('aria-hidden', 'true');
    preview.navigationEntry = entry;
    const liveShell = entry.liveShell;
    preview.usesLiveShell = Boolean(liveShell);
    const liveScroll = entry.liveScroll?.length
      ? entry.liveScroll
      : (liveShell ? captureLiveScroll(liveShell) : []);
    if (liveShell) {
      if (!entry.liveScroll?.length) entry.liveScroll = liveScroll;
      liveShell.remove();
      preview.append(liveShell);
    } else {
      preview.innerHTML = entry.previewHtml;
    }
    app.insertBefore(preview, current);
    sanitizeNavigationPreview(preview);
    const target = preview.querySelector(':scope > .app-shell');
    if (!target) {
      preview.remove();
      return null;
    }
    // Keep the retained page as a direct fixed underlay for the full gesture.
    // This moves its layout work to the start and avoids reparenting the full
    // chat DOM at the last animation frame.
    current.after(preview);
    preview.after(target);
    prepareNavigationUnderlay(preview, target, current);
    if (preview.usesLiveShell) restoreLiveScrollAfterMove(liveScroll);
    else restorePreviewScroll(target, entry);
    return preview;
  }

  function refreshNavigationEdgeZone() {
    const edge = app.querySelector(':scope > .navigation-edge-zone');
    if (!state.navigationStack.length) {
      edge?.remove();
      return;
    }
    if (edge) return;
    const zone = document.createElement('div');
    zone.className = 'navigation-edge-zone';
    zone.setAttribute('aria-hidden', 'true');
    currentAppShell()?.after(zone);
  }

  function promoteNavigationPreview(preview, entry) {
    const target = navigationPreviewTarget(preview);
    const current = currentAppShell();
    // A render can replace every route layer while a back animation is still
    // waiting for its final frame. Never let that stale callback remove the
    // newly rendered shell and promote a detached snapshot: that leaves the
    // app empty and exposes the black page background on mobile Safari.
    const validHandoff = Boolean(
      preview?.isConnected &&
      preview.parentElement === app &&
      preview.navigationEntry === entry &&
      target?.isConnected &&
      target.parentElement === app &&
      target.classList.contains('route-page-underlay') &&
      current?.isConnected &&
      current.parentElement === app &&
      current === preview.navigationSurface &&
      current !== target
    );
    if (!validHandoff) return false;
    const usesLiveShell = Boolean(preview.usesLiveShell);
    // Moving a live page out of the fixed preview can reset native scroll
    // containers even though the DOM nodes themselves are retained. Keep the
    // live positions and put them back after the page is in its final layout.
    const liveScroll = captureLiveScroll(target);
    if (!usesLiveShell) restorePreviewScroll(target, entry);
    restoreNavigationPreviewIds(target);
    settleNavigationUnderlay(preview);
    activateNavigationShellLayer(target);
    current.remove();
    preview.remove();
    if (usesLiveShell) restoreLiveScroll(liveScroll);
    else {
      restorePreviewScroll(target, entry);
      requestAnimationFrame(() => restorePreviewScroll(target, entry));
    }
    entry.liveShell = null;
    scheduleNavigationMaintenance();
    return true;
  }

  function afterVisualMotion(element, eventName, fallbackMs, callback, propertyName = '') {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      element?.removeEventListener(eventName, onEnd);
      callback();
    };
    const onEnd = (event) => {
      if (event.target === element && (!propertyName || event.propertyName === propertyName)) finish();
    };
    const timer = setTimeout(finish, fallbackMs);
    element?.addEventListener(eventName, onEnd);
  }

  function deferNavigationHandoff(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  }

  function canUseAppHistoryBack() {
    const current = history.state;
    return Boolean(
      current?.appManaged &&
      Number.isInteger(current.navDepth) &&
      current.navDepth === state.navigationStack.length
    );
  }

  function requestNavigationBack() {
    if (state.navigationBusy) return false;
    const entry = state.navigationStack[state.navigationStack.length - 1];
    if (!entry) return false;

    // A retained page should only be promoted after the browser has moved to
    // its matching history record. Previously the UI animated first and then
    // called history.back(), which allowed mobile edge navigation to undo it.
    if (!canUseAppHistoryBack()) return animateNavigationBack({ skipHistory: true });
    state.pendingHistoryBack = { entry, source: 'button' };
    state.navigationBusy = 'awaiting-history';
    history.back();
    return true;
  }

  function beginSwipeNavigationBack(entry, preview) {
    const pending = {
      entry,
      preview,
      source: 'swipe',
      historyArrived: false,
      visualFinished: false,
      settling: false
    };
    state.pendingHistoryBack = pending;
    state.navigationBusy = 'awaiting-history';
    if (canUseAppHistoryBack()) history.back();
    else pending.historyArrived = true;
    return pending;
  }

  function settleSwipeNavigationBack(pending) {
    if (!pending || pending.source !== 'swipe' || pending.settling || !pending.historyArrived || !pending.visualFinished) return;
    pending.settling = true;
    deferNavigationHandoff(() => {
      finishNavigationBack(pending.entry, { preview: pending.preview }).catch((error) => alert(error.message));
    });
  }

  async function restoreNavigationEntry(entry, options = {}) {
    if (!entry) return false;
    rememberActiveConversation();
    const view = entry.view || {};
    state.tab = view.tab || 'home';
    state.lastTab = view.lastTab || state.tab;
    state.profileSocialView = view.profileSocialView || null;
    state.chatProfileOpen = Boolean(view.chatProfileOpen);
    state.chatProfileSocialView = view.chatProfileSocialView || null;
    state.searchProfileOpen = Boolean(view.searchProfileOpen);
    state.searchProfileSocialView = view.searchProfileSocialView || null;
    state.clipViewer = view.clipViewer ? { ...view.clipViewer } : null;
    state.activePeer = entry.activePeer || null;
    state.activeGroup = entry.activeGroup || null;
    state.publicProfile = entry.publicProfile || null;
    state.messages = entry.messages || [];
    state.chatAppearance = entry.chatAppearance || defaultChatAppearance();
    state.hasOlderMessages = Boolean(entry.hasOlderMessages);
    state.chatLoading = Boolean(entry.chatLoading);
    state.highlightMessageId = entry.highlightMessageId || null;
    state.scrollMemory = { ...state.scrollMemory, ...(entry.scrollMemory || {}) };
    state.routeForward = null;
    state.chatOpening = false;
    state.chatReturnAnimation = false;
    if (!promoteNavigationPreview(options.preview, entry)) {
      renderApp({ scrollSnapshot: entry.messageScroll, scroll: 'restore' });
    }
    return true;
  }

  async function finishNavigationBack(entry, options = {}) {
    if (!entry || state.navigationBusy === 'finishing') return;
    // Root-tab changes and other navigation resets invalidate the pending
    // animation. Its delayed callback must not restore an obsolete route.
    if (state.navigationStack[state.navigationStack.length - 1] !== entry) return;
    state.navigationBusy = 'finishing';
    try {
      if (state.navigationStack[state.navigationStack.length - 1] === entry) {
        state.forwardNavigationEntries.set(state.navigationStack.length, entry);
        state.navigationStack.pop();
      }
      await restoreNavigationEntry(entry, { preview: options.preview });
    } finally {
      if (state.pendingHistoryBack?.entry === entry) state.pendingHistoryBack = null;
      state.navigationBusy = false;
    }
  }

  function animateNavigationBack(options = {}) {
    if (state.navigationBusy) return false;
    const entry = state.navigationStack[state.navigationStack.length - 1];
    const current = currentAppShell();
    if (!entry || !current) return false;
    rememberActiveConversation();
    state.navigationBusy = true;
    cancelForwardNavigationAnimation(current);
    const preview = installNavigationPreview(entry, 'back');
    // Without a connected underlay, sliding the only visible shell away would
    // expose the black app background. Finish through the fresh-render fallback.
    if (!preview) {
      deferNavigationHandoff(() => {
        finishNavigationBack(entry, { ...options, preview: null }).catch((error) => alert(error.message));
      });
      return true;
    }
    if (options.instant) {
      settleNavigationUnderlay(preview);
      deferNavigationHandoff(() => {
        finishNavigationBack(entry, { ...options, preview }).catch((error) => alert(error.message));
      });
      return true;
    }
    current.classList.add('route-page-exiting');
    animateNavigationUnderlay(preview);
    afterVisualMotion(current, 'animationend', 280, () => {
      deferNavigationHandoff(() => {
        finishNavigationBack(entry, { ...options, preview }).catch((error) => alert(error.message));
      });
    });
    return true;
  }

  function beginDetailNavigation(kind, url = location.href) {
    const entry = captureNavigationEntry(kind);
    pushNavigationEntry(entry, url);
    return entry;
  }

  function initials(user) {
    const label = user?.displayName || user?.username || '?';
    return label.trim().slice(0, 2).toUpperCase();
  }

  function activeProfileStory(user) {
    return (user?.stories || []).find((story) => (
      !story.saved && story.file && new Date(story.expiresAt || 0).getTime() > Date.now()
    )) || null;
  }

  function avatarHtml(user) {
    const avatarUrl = user?.avatar?.url;
    const story = activeProfileStory(user);
    const storyRing = story ? `<span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>` : '';
    return `<span class="avatar ${story ? 'has-story' : ''}">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc(initials(user))}${storyRing}</span>`;
  }

  function groupAvatarHtml(group, className = '') {
    if (group?.avatar?.url) {
      return `<span class="avatar group-avatar ${esc(className)}"><img src="${esc(group.avatar.url)}" alt=""></span>`;
    }
    const members = (group?.members || []).filter((member) => member?.id !== state.me?.id).slice(0, 3);
    if (!members.length) return `<span class="avatar group-avatar ${esc(className)}">${icon('group')}</span>`;
    return `<span class="avatar group-avatar group-avatar-stack ${esc(className)}">${members.map((member) => (
      member.avatar?.url
        ? `<img src="${esc(member.avatar.url)}" alt="">`
        : `<i>${esc(initials(member))}</i>`
    )).join('')}</span>`;
  }

  function icon(name) {
    const icons = {
      messages: '<svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v7A3.5 3.5 0 0 1 16.5 16H9l-5 4v-4.5A3.5 3.5 0 0 1 4 12.5v-7Z"/><path d="M8 8h8M8 12h5"/></svg>',
      home: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
      profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      logout: '<svg viewBox="0 0 24 24"><path d="M10 17v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1"/><path d="M15 7l5 5-5 5M20 12H8"/></svg>',
      back: '<svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"/></svg>',
      video: '<svg viewBox="0 0 24 24"><path d="M4 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="m17 10 5-3v10l-5-3"/></svg>',
      clips: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="m10 8 6 4-6 4Z"/></svg>',
      file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
      sticker: '<svg viewBox="0 0 24 24"><path d="M20 13.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6.5"/><path d="M14 20c0-3.3 2.7-6 6-6"/><path d="M9 9h.01M15 9h.01M8.5 14a5 5 0 0 0 7 0"/></svg>',
      mic: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4"/></svg>',
      play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"/></svg>',
      send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>',
      bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>',
      trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 16h10l1-16"/></svg>',
      mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
      block: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg>',
      story: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
      edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
      menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
      lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
      heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z"/></svg>',
      comment: '<svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4.1-1L3 21l1.5-5.1A8.5 8.5 0 1 1 21 12Z"/></svg>',
      text: '<svg viewBox="0 0 24 24"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
      filter: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
      eyedropper: '<svg viewBox="0 0 24 24"><path d="m19 3 2 2-9.5 9.5-2-2L19 3Z"/><path d="m8.5 11.5 4 4-6.8 6.8H2v-3.7l6.5-7.1Z"/></svg>',
      poll: '<svg viewBox="0 0 24 24"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
      rotate: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
      smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
      pen: '<svg viewBox="0 0 24 24"><path d="M16 4l4 4L8 20H4v-4L16 4Z"/><path d="m14 6 4 4"/></svg>',
      eraser: '<svg viewBox="0 0 24 24"><path d="m7 21-4-4 11-11a3 3 0 0 1 4 0l1 1a3 3 0 0 1 0 4L9 21H7Z"/><path d="m11 9 5 5M7 21h13"/></svg>',
      music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
      stickers: '<svg viewBox="0 0 24 24"><path d="M20 13.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6.5"/><path d="M14 20c0-3.3 2.7-6 6-6"/><path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0"/></svg>',
      alignLeft: '<svg viewBox="0 0 24 24"><path d="M4 6h14M4 10h10M4 14h14M4 18h8"/></svg>',
      alignCenter: '<svg viewBox="0 0 24 24"><path d="M5 6h14M8 10h8M5 14h14M9 18h6"/></svg>',
      alignRight: '<svg viewBox="0 0 24 24"><path d="M6 6h14M10 10h10M6 14h14M12 18h8"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
      location: '<svg viewBox="0 0 24 24"><path d="M12 22s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
      more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
      undo: '<svg viewBox="0 0 24 24"><path d="m9 8-5 4 5 4"/><path d="M20 18a7 7 0 0 0-7-7H4"/></svg>',
      pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
      scissors: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.6 8.5 11.4 7M8.6 15.5 20 8.5"/></svg>',
      volume: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>',
      fit: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
      palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18h1.4a1.8 1.8 0 0 0 1.2-3.2 1.8 1.8 0 0 1 1.2-3.2H18A3 3 0 0 0 21 11.5 8.5 8.5 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7.5" r=".8"/><circle cx="14" cy="7.5" r=".8"/><circle cx="17" cy="10.5" r=".8"/></svg>',
      gif: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M8.5 10.5H6.8a2.3 2.3 0 0 0 0 4.6h1.7v-2H7M11.5 10.5v4.6M14.5 15.1v-4.6h3.2M14.5 12.7h2.6"/></svg>',
      refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></svg>',
      plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
      forward: '<svg viewBox="0 0 24 24"><path d="m14 5 7 7-7 7v-4c-5 0-8.5 1.5-11 4 1-6 4.5-10 11-10V5Z"/></svg>',
      pin: '<svg viewBox="0 0 24 24"><path d="m8 3 8 8M14 3l7 7-4 1-5 5-1 5-7-7 5-1 5-5V3Z"/><path d="m9 15-6 6"/></svg>',
      camera: '<svg viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></svg>',
      grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
      bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>',
      repost: '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
      tagged: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/></svg>',
      archive: '<svg viewBox="0 0 24 24"><path d="M3 5h18v4H3zM5 9v11h14V9M9 13h6"/></svg>',
      group: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a5 5 0 0 1 7-4.6"/></svg>'
    };
    return `<span class="ui-icon" aria-hidden="true">${icons[name] || ''}</span>`;
  }

  function navButton(tab, label, iconName) {
    const active = state.tab === tab || (state.tab === 'notifications' && tab === 'home');
    const unreadDot = tab === 'chats' && hasUnreadMessages();
    const symbol = tab === 'profile'
      ? `<span class="nav-profile-avatar">${state.me?.avatar?.url ? `<img src="${esc(state.me.avatar.url)}" alt="">` : esc(initials(state.me))}</span>`
      : icon(iconName);
    return `
      <button class="bottom-tab ${active ? 'active' : ''}" data-action="tab" data-tab="${tab}" title="${esc(label)}" aria-label="${esc(label)}">
        ${symbol}
        <span class="nav-label">${esc(label)}</span>
        ${unreadDot ? '<span class="red-dot tab-dot"></span>' : ''}
      </button>
    `;
  }

  function hasUnreadMessages() {
    return Object.values(state.unreadByPeer).some((count) => Number(count) > 0);
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function tabIndex(tab) {
    return { home: 0, notifications: 0, search: 1, clips: 2, chats: 3, profile: 4 }[tab] ?? 0;
  }

  function hasActiveConversation() {
    return Boolean(state.activePeer || state.activeGroup);
  }

  function hasVisibleConversation() {
    return !state.clipViewer && state.tab === 'chats' && hasActiveConversation();
  }

  function activeConversationKey() {
    return state.activeGroup?.id || state.activePeer?.id || null;
  }

  function conversationCacheKey(kind, id) {
    return id ? `${kind}:${id}` : null;
  }

  function rememberConversation(key, value) {
    if (!key || !value) return;
    state.conversationCache.delete(key);
    state.conversationCache.set(key, value);
    while (state.conversationCache.size > 8) {
      state.conversationCache.delete(state.conversationCache.keys().next().value);
    }
  }

  function rememberActiveConversation() {
    const key = state.activeGroup
      ? conversationCacheKey('group', state.activeGroup.id)
      : conversationCacheKey('peer', state.activePeer?.id);
    if (!key) return;
    const scroll = captureMessagesScroll() || state.conversationScroll.get(key) || null;
    if (scroll) state.conversationScroll.set(key, scroll);
    rememberConversation(key, {
      messages: state.messages,
      appearance: state.chatAppearance,
      hasMore: state.hasOlderMessages,
      scroll
    });
  }

  function activeChatId() {
    if (state.activeGroup) return state.activeGroup.id;
    return state.activePeer ? [state.me.id, state.activePeer.id].sort().join('__') : null;
  }

  function activeMessagesUrl(suffix = '') {
    if (state.activeGroup) return `/api/groups/${encodeURIComponent(state.activeGroup.id)}/messages${suffix}`;
    return state.activePeer ? `/api/chats/${encodeURIComponent(state.activePeer.id)}/messages${suffix}` : '';
  }

  function activeAppearanceUrl() {
    if (state.activeGroup) return `/api/groups/${encodeURIComponent(state.activeGroup.id)}/appearance`;
    return state.activePeer ? `/api/chats/${encodeURIComponent(state.activePeer.id)}/appearance` : '';
  }

  function activeConversationTitle() {
    return state.activeGroup?.name || state.activePeer?.displayName || 'Chat';
  }

  function discardNavigationForMainTab() {
    if (!state.navigationStack.length && !state.routeForward && !state.pendingHistoryBack) return;
    state.navigationGeneration += 1;
    state.navigationStack = [];
    state.forwardNavigationEntries.clear();
    state.routeForward = null;
    state.pendingHistoryBack = null;
    state.navigationBusy = false;
    history.replaceState({
      ...(history.state || {}),
      appManaged: true,
      route: 'app',
      navDepth: 0,
      navGeneration: state.navigationGeneration,
      view: captureNavigationView()
    }, '', location.href);
  }

  function switchMainTab(nextTab, options = {}) {
    if (!['home', 'chats', 'search', 'clips', 'profile'].includes(nextTab)) return;
    if (nextTab === state.tab) {
      if (state.clipViewer) requestNavigationBack();
      else if (nextTab !== 'chats' && hasActiveConversation()) {
        rememberActiveConversation();
        state.activePeer = null;
        state.activeGroup = null;
        state.chatLoading = false;
        state.chatOpenToken += 1;
        state.chatProfileOpen = false;
        state.chatProfileSocialView = null;
        renderApp();
      }
      return;
    }
    const leavingPublicProfile = state.searchProfileOpen;
    const profileReturnScroll = state.profileReturnScroll;
    state.lastTab = state.tab;
    state.tabTransition = options.animate !== false;
    state.tabDirection = tabIndex(nextTab) < tabIndex(state.tab) ? 'left' : 'right';
    state.tab = nextTab;
    state.clipViewer = null;
    if (leavingPublicProfile) {
      state.searchProfileOpen = false;
      state.searchProfileSocialView = null;
      state.publicProfile = null;
      history.replaceState({
        appManaged: true,
        route: 'app',
        navDepth: state.navigationStack.length,
        navGeneration: state.navigationGeneration,
        view: captureNavigationView()
      }, '', '/');
    }
    if (isMobileLayout() || nextTab !== 'chats') {
      rememberActiveConversation();
      state.activePeer = null;
      state.activeGroup = null;
      state.chatLoading = false;
      state.chatOpenToken += 1;
      state.chatProfileOpen = false;
      state.chatProfileSocialView = null;
    } else if (hasActiveConversation()) {
      state.chatProfileOpen = false;
      state.chatProfileSocialView = null;
    }
    if (state.tab !== 'profile') state.profileSocialView = null;
    // Selecting a root tab leaves the detail route rather than stacking a
    // second copy of that tab behind it. Otherwise a later Back transition
    // animates to the stale retained shell and visibly hitches at the end.
    discardNavigationForMainTab();
    if (leavingPublicProfile) renderApp({ scrollSnapshot: profileReturnScroll });
    else renderApp();
    if (leavingPublicProfile) state.profileReturnScroll = null;
  }

  function tabSwipeTarget(dx) {
    const tabs = ['home', 'search', 'clips', 'chats', 'profile'];
    const index = tabIndex(state.tab);
    const targetIndex = index + (dx < 0 ? 1 : -1);
    return tabs[targetIndex] || null;
  }

  function ensureTabSwipePreview(swipe, dx) {
    const targetTab = tabSwipeTarget(dx);
    if (!targetTab) return null;
    if (swipe.preview?.isConnected && swipe.targetTab === targetTab) return swipe.preview;
    swipe.preview?.remove();
    const preview = document.createElement('div');
    preview.className = 'side-content tab-content tab-swipe-preview';
    preview.dataset.tab = targetTab;
    preview.innerHTML = renderTabContent(targetTab);
    const sidebar = swipe.surface.closest('.sidebar');
    sidebar?.insertBefore(preview, sidebar.querySelector('.bottom-tabs'));
    swipe.preview = preview;
    swipe.targetTab = targetTab;
    return preview;
  }

  function clearTabSwipePreview(swipe) {
    if (!swipe) return;
    swipe.surface.style.transform = '';
    swipe.surface.style.opacity = '';
    swipe.surface.style.transition = '';
    swipe.preview?.remove();
  }

  function describeMessage(message) {
    if (!message) return '';
    if (message.deletedAt) return 'Deleted message';
    if (message.kind === 'post') return message.sharedPost?.isClip ? 'Shared a clip' : 'Shared a post';
    if (message.text) return message.text;
    if (message.attachment?.name) return `${message.kind}: ${message.attachment.name}`;
    return message.kind || 'message';
  }

  async function init() {
    await loadStickers();
    loadStickerSets();
    const publicName = publicUsernameFromPath();
    const sharedPostId = sharedPostIdFromLocation();
    try {
      const me = await api('/api/me');
      state.me = me.user;
      state.twoFactorEnabled = me.twoFactorEnabled;
      state.pendingRequestCount = me.pendingRequestCount || 0;
    } catch {
      state.me = null;
    }

    if (!state.me && publicName) {
      await loadPublicProfile(publicName);
      if (sharedPostId) await loadSharedLinkPost(sharedPostId, { publicOnly: true });
      renderPublicScreen();
      history.replaceState({ appManaged: true, route: 'profile', username: publicName }, '', location.href);
      return;
    }

    if (!state.me) {
      renderAuth();
      return;
    }

    await loadContactsAndChats();
    await loadSocialSurfaces();
    await loadGifPool();
    if (publicName) {
      state.tab = 'search';
      await loadPublicProfile(publicName);
      state.searchProfileOpen = Boolean(state.publicProfile);
      if (state.publicProfile) await loadProfilePosts(state.publicProfile, state.searchProfileMediaTab, { render: false }).catch(() => []);
    }
    if (sharedPostId) await loadSharedLinkPost(sharedPostId);
    renderApp();
    history.replaceState({
      appManaged: true,
      route: publicName ? 'profile' : 'app',
      username: publicName || null,
      internalProfile: false,
      navDepth: 0,
      navGeneration: state.navigationGeneration,
      view: captureNavigationView()
    }, '', location.href);
    connectWs();
  }

  async function fetchPublicProfile(username) {
    const data = await api(`/api/users/${encodeURIComponent(username)}`);
    return data.user;
  }

  async function loadPublicProfile(username) {
    try {
      state.publicProfile = await fetchPublicProfile(username);
    } catch {
      state.publicProfile = null;
    }
  }

  function renderAuth(error = '') {
    app.innerHTML = `
      <main class="auth-screen">
        <section class="auth-box auth-box-single">
          <div class="auth-card">
            <div class="auth-mark">${icon('messages')}</div>
            <div class="auth-tabs">
              <button type="button" class="${state.authMode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">Log in</button>
              <button type="button" class="${state.authMode === 'register' ? 'active' : ''}" data-action="auth-mode" data-mode="register">Create</button>
            </div>
            <form class="form" data-form="auth">
              ${state.authMode === 'register' ? `
                <label class="field">Username
                  <input name="username" autocomplete="username" placeholder="emran_01" required>
                </label>
                <label class="field">Email <small>Optional</small>
                  <input name="email" type="email" autocomplete="email" placeholder="you@example.com">
                </label>
                <label class="field">Phone <small>Optional</small>
                  <input name="phone" type="tel" autocomplete="tel" placeholder="+49 123 456789">
                </label>
              ` : `
                <label class="field">Email, phone, or username
                  <input name="identifier" autocomplete="username" required>
                </label>
              `}
              <label class="field">Password
                <input name="password" type="password" autocomplete="${state.authMode === 'login' ? 'current-password' : 'new-password'}" required>
              </label>
              ${state.needsTwoFactor ? `
                <label class="field">2FA code
                  <input name="twoFactorCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
                </label>
              ` : ''}
              <button class="primary" type="submit">${state.authMode === 'login' ? 'Log in' : 'Create account'}</button>
              <div class="error">${esc(error)}</div>
            </form>
          </div>
        </section>
      </main>
    `;
  }

  function renderPublicScreen() {
    const user = state.publicProfile;
    if (!user) {
      app.innerHTML = `
        <main class="public-profile-screen">
          <section class="public-profile-page public-profile-missing">
            <div class="auth-mark">${icon('profile')}</div>
            <h1>User not found</h1>
            <p class="hint">This profile link does not match an account.</p>
            <button class="primary" data-action="show-login">Log in or create account</button>
          </section>
        </main>
      `;
      return;
    }
    const highlights = (user.highlights || []).filter((highlight) => highlight.cover?.file);
    app.innerHTML = `
      <main class="public-profile-screen">
        <section class="public-profile-page">
          <header class="public-profile-header">
            <strong>@${esc(user.username)}</strong>
            <button class="public-login-btn" data-action="show-login">Log in</button>
          </header>
          <section class="public-profile-overview">
            ${profilePictureElement(user, 'big-avatar')}
            <div class="profile-stat-grid">
              ${user.followersVisible ? `
                <span class="profile-stat"><strong>${user.followerCount ?? 0}</strong><span>followers</span></span>
                <span class="profile-stat"><strong>${user.followingCount ?? 0}</strong><span>following</span></span>
              ` : '<span class="private-social-note">Private account</span>'}
            </div>
            <div class="profile-details">
              <strong>${esc(user.displayName)}</strong>
              ${user.bio ? `<p>${esc(user.bio)}</p>` : ''}
            </div>
          </section>
          <button class="primary public-profile-cta" data-action="show-login">Log in to follow or message</button>
          ${highlights.length ? `
            <section class="highlight-strip public-highlights">
              <div class="highlight-head"><strong>Highlights</strong></div>
              <div class="highlight-row">
                ${highlights.map((highlight) => `
                  <article class="highlight-item">
                    <span class="highlight-media">
                      ${highlight.cover.file.mime?.startsWith('video/')
                        ? `<video src="${esc(highlight.cover.file.url)}" muted playsinline preload="metadata"></video>`
                        : `<img src="${esc(highlight.cover.file.url)}" alt="">`}
                    </span>
                    <small>${esc(highlight.title || 'Highlight')}</small>
                  </article>
                `).join('')}
              </div>
            </section>
          ` : ''}
          ${renderPublicProfileSuggestions(user)}
          <div class="public-profile-lock">
            ${icon('lock')}
            <strong>${user.socialPublic === false ? 'This account is private' : 'Join to see more'}</strong>
            <small>${user.socialPublic === false ? 'Follow this account to see their stories.' : 'Log in to connect with this account.'}</small>
          </div>
        </section>
        <div id="media-viewer-slot">${renderMediaViewer()}</div>
      </main>
    `;
  }

  function renderPublicProfileSuggestions(user) {
    if (!user?.followersVisible) return '';
    const seen = new Set([user.id]);
    const suggestions = [...(user.followers || []), ...(user.following || [])]
      .filter((candidate) => {
        if (!candidate?.id || seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      })
      .slice(0, 8);
    if (!suggestions.length) return '';
    return `
      <section class="profile-suggestion-section public-profile-suggestions">
        <div class="section-heading"><h2>Suggested profiles</h2><small>From this account's network</small></div>
        <div class="recommendation-row profile-recommendation-row" data-scroll-memory="public-suggestions:${esc(user.username)}">
          ${suggestions.map((candidate) => `
            <article class="recommend-card">
              <a class="recommend-identity" href="${esc(accountProfileHref(candidate))}">
                ${avatarHtml(candidate)}
                <strong>${esc(candidate.displayName)}</strong>
                <small>@${esc(candidate.username)}</small>
              </a>
              <button class="mini-btn account-action primary-action" data-action="show-login">Follow</button>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function captureMessagesScroll() {
    const messages = document.getElementById('messages');
    if (!messages) return null;
    return {
      top: messages.scrollTop,
      bottom: messages.scrollHeight - messages.scrollTop - messages.clientHeight,
      height: messages.scrollHeight,
      clientHeight: messages.clientHeight
    };
  }

  function capturePersistentScroll() {
    document.querySelectorAll('[data-scroll-memory]').forEach((element) => {
      const key = element.dataset.scrollMemory;
      if (!key) return;
      state.scrollMemory[key] = { top: element.scrollTop, left: element.scrollLeft };
    });
  }

  function restorePersistentScroll() {
    document.querySelectorAll('[data-scroll-memory]').forEach((element) => {
      const position = state.scrollMemory[element.dataset.scrollMemory];
      if (!position) return;
      element.scrollTop = position.top || 0;
      element.scrollLeft = position.left || 0;
    });
  }

  function restoreMessagesScroll(snapshot, options = {}) {
    const messages = document.getElementById('messages');
    if (!messages || !snapshot) return;
    messages.scrollLeft = 0;
    if (options.anchor === 'bottom') {
      messages.scrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight - snapshot.bottom);
      return;
    }
    messages.scrollTop = Math.min(snapshot.top, Math.max(0, messages.scrollHeight - messages.clientHeight));
  }

  function preserveMessagesScroll(callback, options = {}) {
    const snapshot = captureMessagesScroll();
    const result = callback();
    restoreMessagesScroll(snapshot, options);
    requestAnimationFrame(() => restoreMessagesScroll(snapshot, options));
    return result;
  }

  function centerStoryActiveChoice(root = document) {
    const rail = root.querySelector?.('.story-text-choice-rail');
    const active = rail?.querySelector('.active');
    if (!rail || !active) return;
    const left = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }

  function applyRenderScroll(scrollMode, scrollSnapshot) {
    if (state.highlightMessageId) scrollHighlightedMessage();
    else if (scrollMode === 'bottom') scrollMessagesToBottom();
    else if (scrollMode === 'restore') restoreMessagesScroll(scrollSnapshot);
    else restoreMessagesScroll(scrollSnapshot, { anchor: 'bottom' });
  }

  function waitForChatMedia(messages, onLayout = null) {
    const media = [...messages.querySelectorAll('img, video')];
    if (!media.length) return Promise.resolve();
    return Promise.all(media.map((element) => new Promise((resolve) => {
      if ((element.tagName === 'IMG' && element.complete) || (element.tagName === 'VIDEO' && element.readyState >= 1)) {
        resolve();
        return;
      }
      const done = () => {
        element.removeEventListener('load', done);
        element.removeEventListener('error', done);
        element.removeEventListener('loadedmetadata', done);
        onLayout?.();
        resolve();
      };
      element.addEventListener('load', done, { once: true });
      element.addEventListener('error', done, { once: true });
      element.addEventListener('loadedmetadata', done, { once: true });
    })));
  }

  function stabilizeBottomScroll(options = {}) {
    chatScrollSettleCleanup?.();
    const token = state.chatOpenToken;
    const messages = document.getElementById('messages');
    if (!messages || state.chatLoading) return;
    const minimumSettleMs = currentAppShell()?.classList.contains('route-page-entering') ? 360 : 0;
    let cancelled = false;
    let finishing = false;
    let shown = false;
    let frame = 0;
    let revealTimer = 0;
    let showTimer = 0;
    let safetyTimer = 0;
    let resizeObserver = null;
    const showMessages = (animate = options.reveal) => {
      if (shown || !messages.isConnected) return;
      shown = true;
      messages.classList.remove('chat-settling');
      if (animate) {
        messages.classList.add('chat-settled');
        revealTimer = setTimeout(() => messages.classList.remove('chat-settled'), 220);
      }
    };
    const cleanup = (animate = options.reveal) => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(showTimer);
      clearTimeout(safetyTimer);
      resizeObserver?.disconnect();
      messages.removeEventListener('pointerdown', cancel);
      messages.removeEventListener('touchstart', cancel);
      messages.removeEventListener('wheel', cancel);
      showMessages(animate);
      if (!animate) {
        clearTimeout(revealTimer);
        messages.classList.remove('chat-settled');
      }
      if (chatScrollSettleCleanup === cleanup) chatScrollSettleCleanup = null;
    };
    const cancel = () => cleanup(false);
    chatScrollSettleCleanup = cleanup;
    messages.addEventListener('pointerdown', cancel, { once: true, passive: true });
    messages.addEventListener('touchstart', cancel, { once: true, passive: true });
    messages.addEventListener('wheel', cancel, { once: true, passive: true });
    const settle = () => {
      if (cancelled || token !== state.chatOpenToken || !messages.isConnected) return;
      messages.scrollLeft = 0;
      messages.scrollTop = messages.scrollHeight;
    };
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(settle);
      resizeObserver.observe(messages);
      [...messages.children].forEach((message) => resizeObserver.observe(message));
    }
    settle();
    const finish = () => {
      if (cancelled || finishing || token !== state.chatOpenToken || !messages.isConnected) return;
      finishing = true;
      frame = requestAnimationFrame(() => {
        settle();
        frame = requestAnimationFrame(() => {
          settle();
          cleanup();
        });
      });
    };
    if (options.reveal) showTimer = setTimeout(showMessages, 850);
    safetyTimer = setTimeout(finish, 15000);
    Promise.all([
      waitForChatMedia(messages, settle),
      new Promise((resolve) => setTimeout(resolve, minimumSettleMs))
    ]).then(finish);
  }

  function renderApp(options = {}) {
    clearActiveMessagePress();
    if (state.messageFocus) closeMessageFocus({ immediate: true, skipRefresh: true });
    capturePersistentScroll();
    const scrollSnapshot = Object.prototype.hasOwnProperty.call(options, 'scrollSnapshot')
      ? options.scrollSnapshot
      : captureMessagesScroll();
    const scrollMode = options.scroll || 'preserve';
    const forwardEntry = state.routeForward;
    const forwardLiveShell = forwardEntry?.liveShell || null;
    const forwardLiveScroll = forwardLiveShell ? captureLiveScroll(forwardLiveShell) : [];
    if (forwardEntry && forwardLiveShell) forwardEntry.liveScroll = forwardLiveScroll;
    forwardLiveShell?.remove();
    app.innerHTML = `
      ${forwardEntry?.previewHtml && !forwardLiveShell ? `<div class="route-page-preview route-preview-forward" aria-hidden="true">${forwardEntry.previewHtml}</div>` : ''}
      <div class="app-shell ${forwardEntry ? 'route-page-current route-page-entering' : ''} ${hasVisibleConversation() ? 'chat-open' : ''} ${state.searchProfileOpen ? 'profile-route-open' : ''} ${state.clipViewer ? 'clip-viewer-root social-root' : ''} ${state.tab === 'home' && !hasVisibleConversation() && !state.clipViewer ? 'home-root' : ''} ${state.tab !== 'chats' && !hasVisibleConversation() && !state.searchProfileOpen && !state.clipViewer ? 'social-root' : ''}">
        ${renderSidebar()}
        ${renderChatPane()}
      </div>
      ${state.navigationStack.length ? '<div class="navigation-edge-zone" aria-hidden="true"></div>' : ''}
      <div id="call-dock-slot">${renderCallDock()}</div>
      <div id="toast-slot">${renderToastStack()}</div>
      <div id="action-sheet-slot">${renderActionSheet()}</div>
      <div id="message-focus-slot">${renderMessageFocus()}</div>
      <div id="profile-edit-slot">${renderProfileEditModal()}</div>
      <div id="settings-slot">${renderSettingsModal()}</div>
      <div id="avatar-crop-slot">${renderAvatarCropper()}</div>
      <div id="camera-capture-slot">${renderCameraCapture()}</div>
      <div id="story-editor-slot">${renderStoryEditor()}</div>
      <div id="story-viewer-slot">${renderStoryViewer()}</div>
      <div id="highlight-composer-slot">${renderHighlightComposer()}</div>
      <div id="post-composer-slot">${renderPostComposer()}</div>
      <div id="note-composer-slot">${renderNoteComposer()}</div>
      <div id="music-picker-slot">${renderMusicPicker()}</div>
      <div id="media-viewer-slot">${renderMediaViewer()}</div>
      <div id="chat-customization-slot">${renderChatCustomization()}</div>
      <div id="sticker-creator-slot">${renderStickerCreator()}</div>
      <div id="sticker-manager-slot">${renderStickerManager()}</div>
      <div id="group-composer-slot">${renderGroupComposer()}</div>
      <input id="avatar-input" type="file" accept="image/*" hidden>
      <input id="story-input" type="file" accept="image/*,video/*" hidden>
      <input id="note-audio-input" type="file" accept="audio/*" hidden>
      <input id="group-avatar-input" type="file" accept="image/*" hidden>
    `;
    syncActionSheetAccessibility();
    syncCurrentNavigationHistory();
    if (forwardEntry && forwardLiveShell) {
      const preview = document.createElement('div');
      preview.className = 'route-page-preview route-preview-forward';
      preview.setAttribute('aria-hidden', 'true');
      preview.navigationEntry = forwardEntry;
      preview.usesLiveShell = true;
      preview.append(forwardLiveShell);
      app.insertBefore(preview, currentAppShell());
    }
    state.tabTransition = false;
    settleTabTransitionAnimation(currentAppShell());
    const forwardPreview = app.querySelector(':scope > .route-preview-forward');
    if (forwardPreview) forwardPreview.navigationEntry = forwardEntry;
    if (forwardPreview && forwardLiveShell) forwardPreview.usesLiveShell = true;
    sanitizeNavigationPreview(forwardPreview);
    resizeComposerInput();
    applyRenderScroll(scrollMode, scrollSnapshot);
    restorePersistentScroll();
    if (forwardPreview?.usesLiveShell) restoreLiveScrollAfterMove(forwardLiveScroll);
    else if (forwardEntry) restorePreviewScroll(forwardPreview, forwardEntry);
    setTimeout(() => {
      resizeComposerInput();
      if (state.storyEditor?.textEditing) {
        const storyText = document.getElementById('story-editor-text');
        storyText?.focus({ preventScroll: true });
        storyText?.setSelectionRange?.(storyText.value.length, storyText.value.length);
        resizeStoryTextInput(storyText);
        centerStoryActiveChoice();
      }
      attachCallStreams();
      attachCameraStream();
      attachStoryEditorVideo();
      attachStoryViewerVideo();
      initializePostCarousels();
      attachClipPlayback();
      state.chatReturnAnimation = false;
      state.chatOpening = false;
    }, 0);
    if (forwardEntry) {
      setTimeout(() => {
        if (state.routeForward !== forwardEntry) return;
        state.routeForward = null;
        stashNavigationPreview(app.querySelector(':scope > .route-preview-forward'));
        currentAppShell()?.querySelector('.chat-pane.chat-opening')?.classList.remove('chat-opening');
        currentAppShell()?.classList.remove('route-page-current', 'route-page-entering');
      }, 310);
    }
  }

  function updateSlot(id, html) {
    const slot = document.getElementById(id);
    if (!slot) return false;
    slot.innerHTML = html;
    return true;
  }

  function updateActionSheetSlot() {
    const updated = updateSlot('action-sheet-slot', renderActionSheet());
    if (updated) syncActionSheetAccessibility();
    return updated;
  }

  function updateMessageFocusSlot() {
    const updated = updateSlot('message-focus-slot', renderMessageFocus());
    syncMessageFocusAccessibility();
    return updated;
  }

  function updateProfileModalSlots() {
    updateSlot('profile-edit-slot', renderProfileEditModal());
    updateSlot('settings-slot', renderSettingsModal());
    updateSlot('avatar-crop-slot', renderAvatarCropper());
  }

  function updateCameraCaptureSlot() {
    if (!updateSlot('camera-capture-slot', renderCameraCapture())) return false;
    requestAnimationFrame(attachCameraStream);
    return true;
  }

  function updateStoryEditorView() {
    const editor = state.storyEditor;
    const currentVideo = document.getElementById('story-editor-video');
    if (editor?.isVideo && currentVideo) editor.videoCurrentTime = currentVideo.currentTime;
    if (!updateSlot('story-editor-slot', renderStoryEditor())) return false;
    requestAnimationFrame(() => {
      attachStoryEditorVideo();
      if (state.storyEditor?.textEditing) {
        const input = document.getElementById('story-editor-text');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange?.(input.value.length, input.value.length);
        resizeStoryTextInput(input);
        centerStoryActiveChoice();
      }
    });
    return true;
  }

  function updateStoryViewerView() {
    if (!updateSlot('story-viewer-slot', renderStoryViewer())) return false;
    requestAnimationFrame(() => {
      attachStoryViewerVideo();
      startStoryCountdownClock();
    });
    return true;
  }

  function updateHighlightComposerSlot() {
    return updateSlot('highlight-composer-slot', renderHighlightComposer());
  }

  function unloadPostComposerVideos() {
    document.querySelectorAll('#post-composer-slot video').forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }

  function updatePostComposerSlot() {
    unloadPostComposerVideos();
    const updated = updateSlot('post-composer-slot', renderPostComposer());
    if (updated) requestAnimationFrame(attachPostComposerPreview);
    return updated;
  }

  function updateNoteComposerSlot() {
    document.getElementById('note-composer-audio')?.pause?.();
    return updateSlot('note-composer-slot', renderNoteComposer());
  }

  function updateMusicPickerSlot() {
    const currentInput = document.getElementById('music-search');
    const preserveSearchFocus = document.activeElement === currentInput;
    const selectionStart = currentInput?.selectionStart || 0;
    document.querySelector('#music-picker-slot audio')?.pause?.();
    const updated = updateSlot('music-picker-slot', renderMusicPicker());
    syncMusicPickerAccessibility();
    if (updated && preserveSearchFocus && state.musicPicker && !state.musicPicker.selected) {
      const nextInput = document.getElementById('music-search');
      nextInput?.focus({ preventScroll: true });
      const cursor = Math.min(selectionStart, nextInput?.value.length || 0);
      nextInput?.setSelectionRange?.(cursor, cursor);
    }
    return updated;
  }

  function updateMediaViewerSlot() {
    return updateSlot('media-viewer-slot', renderMediaViewer());
  }

  function updateChatCustomizationSlot() {
    return updateSlot('chat-customization-slot', renderChatCustomization());
  }

  function updateStickerCreatorSlot() {
    return updateSlot('sticker-creator-slot', renderStickerCreator());
  }

  function updateStickerManagerSlot() {
    return updateSlot('sticker-manager-slot', renderStickerManager());
  }

  function updateRecommendationsSection() {
    capturePersistentScroll();
    const current = document.querySelector('.suggestion-section');
    if (!current) return false;
    const template = document.createElement('template');
    template.innerHTML = renderRecommendations().trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    restorePersistentScroll();
    return true;
  }

  function renderSidebar() {
    const viewingClip = Boolean(state.clipViewer);
    const scrollKey = viewingClip
      ? `clip-viewer:${state.clipViewer.postId}:${state.clipViewer.mediaIndex || 0}`
      : state.searchProfileOpen && state.publicProfile
      ? `public-profile:${state.publicProfile.username}:${state.searchProfileSocialView || 'main'}`
      : `tab:${state.tab}:${state.tab === 'home' ? state.feedMode : (state.profileSocialView || 'main')}`;
    const contentTab = viewingClip ? 'clip-viewer' : state.tab;
    return `
      <aside class="sidebar">
        <div class="side-content tab-content ${state.tabTransition ? `animate-tab ${state.tabDirection === 'right' ? 'from-right' : 'from-left'}` : ''}" data-tab="${esc(contentTab)}" data-scroll-memory="${esc(scrollKey)}">
          ${viewingClip ? renderClipsPanel({ viewer: true }) : renderTabContent(state.tab)}
        </div>
        <nav class="bottom-tabs" aria-label="Main navigation">
          <div class="desktop-brand" aria-label="New Around">New Around</div>
          ${navButton('home', 'Home', 'home')}
          ${navButton('search', 'Search', 'search')}
          ${navButton('clips', 'Clips', 'clips')}
          <button class="bottom-tab bottom-tab-create" data-action="open-post-create" title="Create post" aria-label="Create post">${icon('plus')}</button>
          ${navButton('chats', 'Messages', 'messages')}
          ${navButton('profile', 'Profile', 'profile')}
        </nav>
      </aside>
    `;
  }

  function renderTabContent(tab) {
    if (tab === 'home') return renderHomePanel();
    if (tab === 'chats') return renderChatsPanel();
    if (tab === 'search') return renderSearchPanel();
    if (tab === 'clips') return renderClipsPanel();
    if (tab === 'notifications') return renderNotificationsPage();
    return renderProfilePanel();
  }

  function feedModeLabel(mode = state.feedMode) {
    return mode === 'following' ? 'Followed' : mode === 'favorites' ? 'Favorites' : 'For you';
  }

  function homeStoryUsers() {
    const followed = (state.me?.following || []).filter((user) => activeProfileStory(user));
    const fallback = state.recommendations.filter((user) => activeProfileStory(user));
    const seen = new Set();
    return [state.me, ...(followed.length ? followed : fallback)].filter((user) => {
      if (!user?.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return user.id === state.me?.id || Boolean(activeProfileStory(user));
    }).slice(0, 20);
  }

  function renderHomeStories() {
    const users = homeStoryUsers();
    return `
      <section class="home-story-rail" aria-label="Stories" data-scroll-memory="home-stories">
        ${users.map((user) => {
          const story = activeProfileStory(user);
          const mine = user.id === state.me?.id;
          return `
            <button class="home-story" data-action="${story ? 'view-story' : 'open-story-create'}" ${story ? `data-story-id="${esc(story.id)}"` : ''}>
              <span class="home-story-avatar ${story ? 'has-story' : ''}">
                ${user.avatar?.url ? `<img src="${esc(user.avatar.url)}" alt="">` : esc(initials(user))}
                ${mine ? '<i>+</i>' : ''}
              </span>
              <small>${mine ? 'Your story' : esc(user.username)}</small>
            </button>
          `;
        }).join('')}
      </section>
    `;
  }

  function postAuthor(post) {
    return post?.author || post?.owner || post?.user || null;
  }

  function postMedia(post) {
    return postMediaItems(post)[0]?.media || null;
  }

  function postMediaItems(post) {
    const rawItems = Array.isArray(post?.mediaItems) && post.mediaItems.length
      ? post.mediaItems
      : [{
          fileId: post?.media?.id || post?.file?.id || '',
          media: post?.media || post?.file || post?.attachment || null,
          edits: post?.edits || {},
          crop: post?.crop,
          adjustments: post?.adjustments,
          filter: post?.filter
        }];
    return rawItems.map((item, index) => {
      const media = item?.media || item?.file || (index === 0 ? (post?.media || post?.file || post?.attachment) : null);
      const edits = item?.edits || (index === 0 ? post?.edits : {}) || {};
      return {
        id: item?.fileId || media?.id || `${post?.id || 'post'}-${index}`,
        fileId: item?.fileId || media?.id || '',
        media,
        edits,
        crop: item?.crop || edits.crop || (index === 0 ? post?.crop : {}) || {},
        adjustments: item?.adjustments || edits.adjustments || (index === 0 ? post?.adjustments : {}) || {},
        filter: item?.filter || edits.filter || (index === 0 ? post?.filter : 'normal') || 'normal',
        altText: String(item?.altText || (index === 0 ? post?.altText : '') || ''),
        mediaType: item?.mediaType || (String(media?.mime || '').startsWith('video/') ? 'video' : 'image')
      };
    }).filter((item) => item.media?.url);
  }

  function postFilterStyle(post) {
    const edits = post?.edits || {};
    const adjustments = post?.adjustments || edits.adjustments || edits;
    const presetName = post?.filter || edits.filter || 'normal';
    const preset = {
      normal: '',
      vivid: 'saturate(1.28) contrast(1.06)',
      warm: 'sepia(.16) saturate(1.18) hue-rotate(-8deg)',
      cool: 'saturate(1.08) hue-rotate(12deg)',
      mono: 'grayscale(1) contrast(1.08)',
      fade: 'saturate(.74) contrast(.9) brightness(1.08)',
      noir: 'grayscale(1) contrast(1.35) brightness(.84)'
    }[presetName] || '';
    const brightness = clamp(Number(adjustments.brightness ?? 100), 60, 140) / 100;
    const contrast = clamp(Number(adjustments.contrast ?? 100), 60, 140) / 100;
    const saturation = clamp(Number(adjustments.saturation ?? 100), 0, 200) / 100;
    const warmth = clamp(Number(adjustments.warmth ?? 0), -50, 50);
    return `${preset} brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${warmth * -0.16}deg)`;
  }

  function postCropStyle(post) {
    const crop = post?.crop || post?.edits?.crop || post?.edits || {};
    const aspect = String(crop.aspect || crop.aspectRatio || '');
    const zoom = clamp(Number(crop.zoom ?? 1), 1, 5);
    const x = clamp(Number(crop.x ?? crop.offsetX ?? 0), -100, 100);
    const y = clamp(Number(crop.y ?? crop.offsetY ?? 0), -100, 100);
    const rotation = clamp(Number(crop.rotation ?? 0), -360, 360);
    return `object-fit:${aspect.startsWith('mixed') ? 'contain' : 'cover'};object-position:${50 + x / 2}% ${50 + y / 2}%;transform:scale(${zoom}) rotate(${rotation}deg);filter:${postFilterStyle(post)}`;
  }

  function postAspect(postOrItem) {
    const crop = postOrItem?.crop || postOrItem?.edits?.crop || postOrItem?.edits || {};
    const raw = String(crop.aspect || crop.aspectRatio || 'portrait').toLowerCase();
    if (raw.startsWith('mixed:')) {
      const ratio = clamp(Number(raw.split(':')[1]), 0.75, 1.91);
      return { name: 'mixed', ratio: Number.isFinite(ratio) ? ratio : 1 };
    }
    if (raw.startsWith('original:')) {
      const ratio = clamp(Number(raw.split(':')[1]), 0.75, 1.91);
      return { name: 'original', ratio: Number.isFinite(ratio) ? ratio : 1 };
    }
    if (raw === 'square' || raw === '1:1') return { name: 'square', ratio: 1 };
    if (raw === 'landscape' || raw === '1.91:1') return { name: 'landscape', ratio: 1.91 };
    if (raw === 'portrait34' || raw === '3:4') return { name: 'portrait34', ratio: 3 / 4 };
    if (raw === 'original') return { name: 'original', ratio: 1 };
    return { name: 'portrait', ratio: 4 / 5 };
  }

  function renderPostVisual(item, post, options = {}) {
    const media = item?.media;
    if (!media?.url) return '<div class="post-media-missing">Media unavailable</div>';
    const isVideo = item.mediaType === 'video' || String(media.mime || '').startsWith('video/');
    const visual = { ...post, ...item, edits: item.edits, crop: item.crop, adjustments: item.adjustments, filter: item.filter };
    if (isVideo) {
      const crop = item.crop || {};
      const x = clamp(Number(crop.x ?? crop.offsetX ?? 0), -100, 100);
      const y = clamp(Number(crop.y ?? crop.offsetY ?? 0), -100, 100);
      const aspect = String(crop.aspect || crop.aspectRatio || '');
      const label = item.altText || `Open video by ${postAuthor(post)?.username || 'user'}`;
      return `<video class="post-native-video ${options.grid ? '' : 'post-video-preview'}" src="${esc(media.url)}" style="object-fit:${aspect.startsWith('mixed') ? 'contain' : 'cover'};object-position:${50 + x / 2}% ${50 + y / 2}%;filter:${esc(postFilterStyle(visual))}" playsinline webkit-playsinline muted loop preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" ${options.grid ? '' : `data-action="open-home-video" data-post-id="${esc(post.id)}" data-media-index="${Number(options.mediaIndex || 0)}" role="button" tabindex="0"`} aria-label="${esc(label)}"></video>${options.grid ? '' : `<span class="post-video-open-cue" aria-hidden="true">${icon('play')}</span><button class="post-video-sound" data-action="toggle-home-video-sound" aria-label="Turn sound on">${icon('mute')}</button>`}`;
    }
    return `<img src="${esc(media.url)}" style="${esc(postCropStyle(visual))}" alt="${esc(item.altText || post.title || `Post by ${postAuthor(post)?.username || 'user'}`)}" loading="lazy">`;
  }

  function renderPostPersonTags(post, mediaIndex) {
    const tags = post.personTags || post.peopleTags || [];
    return tags.filter((tag) => Number(tag.mediaIndex || 0) === mediaIndex).map((tag) => {
      const tagged = tag.user || tag.person || null;
      return `<button class="post-person-tag" style="left:${clamp(Number(tag.x || 50), 2, 98)}%;top:${clamp(Number(tag.y || 50), 2, 98)}%" data-action="view-user-profile" data-username="${esc(tagged?.username || tag.username || '')}">@${esc(tagged?.username || tag.username || '')}</button>`;
    }).join('');
  }

  function renderPostMedia(post, options = {}) {
    const items = postMediaItems(post);
    if (!items.length) return '<div class="post-media-missing">Media unavailable</div>';
    const first = items[0];
    const isVideo = first.mediaType === 'video';
    const aspect = postAspect(first);
    if (options.grid) {
      return `
        <div class="post-media-frame post-media-grid aspect-${esc(aspect.name)}" style="--post-aspect:${aspect.ratio}">
          ${renderPostVisual(first, post, { grid: true, mediaIndex: 0 })}
          ${isVideo ? `<span class="post-video-mark">${icon('play')}</span>` : ''}
          ${items.length > 1 ? `<span class="post-carousel-mark" aria-label="${items.length} items">${icon('clips')}</span>` : ''}
        </div>
      `;
    }
    return `
      <div class="post-media-frame aspect-${esc(aspect.name)} ${items.length > 1 ? 'has-carousel' : ''}" style="--post-aspect:${aspect.ratio}" data-post-carousel="${esc(post.id)}">
        <div class="post-carousel-track" data-post-id="${esc(post.id)}">
          ${items.map((item, index) => `<div class="post-carousel-slide" data-carousel-index="${index}">${renderPostVisual(item, post, { mediaIndex: index })}${renderPostPersonTags(post, index)}</div>`).join('')}
        </div>
        ${items.length > 1 ? `
          <span class="post-carousel-count" aria-live="polite"><b>1</b>/${items.length}</span>
          <button class="post-carousel-arrow previous" data-action="post-carousel-previous" data-post-id="${esc(post.id)}" aria-label="Previous item" disabled>${icon('back')}</button>
          <button class="post-carousel-arrow next" data-action="post-carousel-next" data-post-id="${esc(post.id)}" aria-label="Next item">${icon('back')}</button>
          <div class="post-carousel-dots" aria-hidden="true">${items.map((_, index) => `<i class="${index === 0 ? 'active' : ''}"></i>`).join('')}</div>
        ` : ''}
      </div>
    `;
  }

  function syncPostCarousel(track) {
    if (!track?.matches?.('.post-carousel-track')) return;
    const slides = Array.from(track.children);
    if (!slides.length) return;
    const index = clamp(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)), 0, slides.length - 1);
    const frame = track.closest('.post-media-frame');
    const count = frame?.querySelector('.post-carousel-count b');
    if (count) count.textContent = String(index + 1);
    frame?.querySelectorAll('.post-carousel-dots i').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
    const previous = frame?.querySelector('.post-carousel-arrow.previous');
    const next = frame?.querySelector('.post-carousel-arrow.next');
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      slide.toggleAttribute('inert', !active);
      slide.querySelectorAll('video').forEach((video) => {
        if (active && video.matches('[data-action="open-home-video"]')) video.tabIndex = 0;
        else if (active) video.removeAttribute('tabindex');
        else {
          video.tabIndex = -1;
          video.pause();
        }
      });
    });
  }

  function initializePostCarousels(root = document) {
    root.querySelectorAll?.('.post-carousel-track').forEach(syncPostCarousel);
  }

  function movePostCarousel(postId, direction) {
    const selectorId = window.CSS?.escape ? CSS.escape(String(postId)) : String(postId).replace(/"/g, '\\"');
    const track = document.querySelector(`.post-carousel-track[data-post-id="${selectorId}"]`);
    if (!track) return;
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const nextIndex = clamp(index + direction, 0, track.children.length - 1);
    track.scrollTo({ left: nextIndex * track.clientWidth, behavior: 'smooth' });
    setTimeout(() => syncPostCarousel(track), 280);
  }

  function renderPostComments(post) {
    const comments = (post.comments || []).filter((comment) => comment?.user && String(comment.text || '').trim());
    const topComment = comments.at(-1);
    return `
      <div class="post-comments">
        ${topComment ? `
          <button class="post-comment-preview" data-action="open-post-comments" data-post-id="${esc(post.id)}" aria-label="Open comments. Latest from ${esc(topComment.user.username || 'user')}: ${esc(topComment.text || '')}">
            <span class="highlight-comment-preview-card">
              ${avatarHtml(topComment.user)}
              <span class="highlight-comment-preview-copy">
                <strong>${esc(topComment.user.username || 'user')}</strong>
                <span>${esc(topComment.text || '')}</span>
              </span>
            </span>
          </button>
        ` : ''}
        ${comments.length > 1 ? `<button class="post-comments-more" data-action="open-post-comments" data-post-id="${esc(post.id)}">View all ${comments.length} comments</button>` : ''}
      </div>
    `;
  }

  function renderPostCard(post) {
    const author = postAuthor(post);
    if (!author) return '';
    const description = String(post.description || post.caption || '');
    const expanded = state.expandedPosts.has(post.id) || description.length <= 135;
    const hashtags = post.hashtags || post.tags || [];
    const liked = Boolean(post.likedByMe);
    const saved = Boolean(post.savedByMe);
    const showLikeCount = !post.hideLikeCounts || author.id === state.me?.id;
    const reposted = Boolean(post.repostedByMe);
    return `
      <article class="feed-post" data-post-id="${esc(post.id)}">
        <header class="post-head">
          <a href="${esc(accountProfileHref(author))}" data-action="view-user-profile" data-username="${esc(author.username)}">
            ${avatarHtml(author)}
            <span><strong>${esc(author.username)}</strong><small>${post.location ? `${esc(post.location)} · ` : ''}${esc(shortTime(post.createdAt))}</small></span>
          </a>
          ${author.id === state.me?.id ? `<button data-action="post-owner-menu" data-post-id="${esc(post.id)}" aria-label="Post options">${icon('more')}</button>` : ''}
        </header>
        ${renderPostMedia(post)}
        <div class="post-action-row">
          <button class="${liked ? 'active' : ''}" data-action="toggle-post-like" data-post-id="${esc(post.id)}" aria-label="${liked ? 'Unlike' : 'Like'}" aria-pressed="${liked}">${icon('heart')}</button>
          <button data-action="open-post-comments" data-post-id="${esc(post.id)}" aria-label="Comment">${icon('comment')}</button>
          ${post.allowReposts === false ? '' : `<button class="${reposted ? 'active' : ''}" data-action="toggle-post-repost" data-post-id="${esc(post.id)}" aria-label="${reposted ? 'Undo repost' : 'Repost'}" aria-pressed="${reposted}">${icon('repost')}</button>`}
          <button data-action="share-post" data-post-id="${esc(post.id)}" aria-label="Share">${icon('send')}</button>
          <button class="post-save ${saved ? 'active' : ''}" data-action="toggle-post-save" data-post-id="${esc(post.id)}" aria-label="${saved ? 'Unsave' : 'Save'}" aria-pressed="${saved}">${icon('bookmark')}</button>
        </div>
        <div class="post-copy">
          <strong data-post-like-count>${showLikeCount ? `${Number(post.likeCount || 0).toLocaleString()} likes` : 'Like count hidden'}</strong>
          ${post.title ? `<h3>${esc(post.title)}</h3>` : ''}
          ${description ? `<p>${expanded ? renderMentionText(description) : renderMentionText(`${description.slice(0, 135).trim()}…`)} ${expanded ? '' : `<button data-action="expand-post" data-post-id="${esc(post.id)}">read more</button>`}</p>` : ''}
          ${hashtags.length ? `<p class="post-hashtags">${hashtags.map((tag) => `#${esc(String(tag).replace(/^#/, ''))}`).join(' ')}</p>` : ''}
          <small class="post-counts"><button data-action="open-post-comments" data-post-id="${esc(post.id)}" data-post-comment-count>${Number(post.commentCount ?? post.comments?.length ?? 0)} comments</button><span>·</span><span data-post-repost-count>${Number(post.repostCount || 0)} reposts</span></small>
          ${renderPostComments(post)}
          ${post.allowComments === false ? '<small class="post-comments-off">Comments are turned off.</small>' : ''}
        </div>
      </article>
    `;
  }

  function renderHomePanel() {
    const feed = state.homeFeed || [];
    const suggestions = visibleRecommendations().slice(0, 5);
    return `
      <section class="home-page">
        <header class="home-topbar">
          <div class="feed-picker-wrap">
            <button class="feed-picker" data-action="toggle-feed-menu" aria-expanded="${state.feedMenuOpen}" aria-label="Choose feed"><span class="home-brand">New Around</span>${icon('chevron')}</button>
            ${state.feedMenuOpen ? `
              <div class="feed-picker-menu">
                ${['for_you', 'following', 'favorites'].map((mode) => `<button class="${state.feedMode === mode ? 'active' : ''}" data-action="set-feed-mode" data-mode="${mode}">${esc(feedModeLabel(mode))}${state.feedMode === mode ? icon('check') : ''}</button>`).join('')}
              </div>
            ` : ''}
          </div>
          <div class="home-head-actions">
            <button class="icon-btn" data-action="open-post-create" aria-label="Create post">${icon('plus')}</button>
            <button class="icon-btn notification-btn" data-action="open-notifications" aria-label="Notifications">${icon('bell')}${state.pendingRequestCount ? '<span class="red-dot"></span>' : ''}</button>
            <button class="icon-btn notification-btn" data-action="tab" data-tab="chats" aria-label="Messages">${icon('messages')}${hasUnreadMessages() ? '<span class="red-dot"></span>' : ''}</button>
          </div>
        </header>
        <div class="home-layout">
          <main class="home-primary">
            ${renderHomeStories()}
            ${renderNotificationPermissionPrompt()}
            <section class="home-feed" aria-live="polite">
              ${state.feedLoading
                ? '<div class="feed-loading"><i></i><i></i><i></i></div>'
                : feed.length
                  ? feed.map(renderPostCard).join('')
                  : `<div class="empty-state feed-empty">${icon('home')}<strong>No posts here yet</strong><small>${state.feedMode === 'favorites' ? 'Favorite an account from their profile to build this feed.' : 'Share the first post or follow more accounts.'}</small><button class="primary" data-action="open-post-create">Create post</button></div>`}
            </section>
          </main>
          <aside class="home-suggestions" aria-label="Suggested accounts">
            <button class="home-current-user" data-action="tab" data-tab="profile">
              ${avatarHtml(state.me)}
              <span><strong>${esc(state.me?.username || '')}</strong><small>${esc(state.me?.displayName || '')}</small></span>
              <b>Profile</b>
            </button>
            <header><strong>Suggested for you</strong><button data-action="tab" data-tab="search">See all</button></header>
            ${suggestions.map((user) => `<div class="home-suggestion-row">${avatarHtml(user)}<button class="home-suggestion-name" data-action="view-user-profile" data-username="${esc(user.username)}"><strong>${esc(user.username)}</strong><small>${esc(user.displayName || 'Suggested for you')}</small></button><button class="home-follow-link" data-action="${user.requested ? 'cancel-request' : 'send-request'}" data-user-id="${esc(user.id)}">${user.requested ? 'Requested' : 'Follow'}</button></div>`).join('')}
            <small class="home-legal">About · Help · Privacy · Terms<br>© ${new Date().getFullYear()} New Around</small>
          </aside>
        </div>
      </section>
    `;
  }

  function clipPosts() {
    const seen = new Set();
    const friends = new Set([state.me?.id, ...(state.me?.following || []).map((user) => user.id)].filter(Boolean));
    return [...(state.clips || []), ...(state.explorePosts || []), ...(state.homeFeed || [])].filter((post) => {
      if (!post?.id || seen.has(post.id)) return false;
      seen.add(post.id);
      const items = postMediaItems(post);
      return items.length === 1 && items[0].mediaType === 'video' && (state.clipMode !== 'friends' || friends.has(post.ownerId || postAuthor(post)?.id));
    });
  }

  function clipViewerEntries() {
    const viewer = state.clipViewer;
    const entries = [];
    const seen = new Set();
    if (viewer) {
      const post = postById(viewer.postId);
      const mediaIndex = clamp(Number(viewer.mediaIndex || 0), 0, Math.max(0, postMediaItems(post).length - 1));
      const item = postMediaItems(post)[mediaIndex];
      if (post && item?.mediaType === 'video') {
        entries.push({ post, mediaIndex });
        seen.add(post.id);
      }
    }
    clipPosts().forEach((post) => {
      if (seen.has(post.id)) return;
      entries.push({ post, mediaIndex: 0 });
      seen.add(post.id);
    });
    return entries;
  }

  function renderClipCard(post, options = {}) {
    const mediaIndex = clamp(Number(options.mediaIndex || 0), 0, Math.max(0, postMediaItems(post).length - 1));
    const item = postMediaItems(post)[mediaIndex];
    const media = item?.media;
    const author = postAuthor(post);
    if (!media?.url || !author || item.mediaType !== 'video') return '';
    const crop = item.crop || {};
    const x = clamp(Number(crop.x ?? crop.offsetX ?? 0), -100, 100);
    const y = clamp(Number(crop.y ?? crop.offsetY ?? 0), -100, 100);
    const aspect = postAspect(item);
    const letterbox = aspect.name === 'mixed' || aspect.ratio > 1.15;
    const liked = Boolean(post.likedByMe);
    const reposted = Boolean(post.repostedByMe);
    const saved = Boolean(post.savedByMe);
    const showLikeCount = !post.hideLikeCounts || author.id === state.me?.id;
    const knownAuthor = userById(author.id) || author;
    const following = Boolean(knownAuthor.isFollowing || (state.me?.following || []).some((user) => user.id === author.id));
    const followControl = author.id === state.me?.id || following
      ? ''
      : knownAuthor.outgoingRequest
        ? '<button class="clip-follow" disabled>Requested</button>'
        : knownAuthor.socialPublic === false && !knownAuthor.isContact
          ? `<button class="clip-follow" data-action="add-contact" data-username="${esc(author.username)}" aria-label="Request to follow ${esc(author.username)}">Follow</button>`
          : `<button class="clip-follow" data-action="follow-user" data-user-id="${esc(author.id)}" aria-label="Follow ${esc(author.username)}">Follow</button>`;
    const caption = String(post.description || post.caption || '');
    const music = post.music || null;
    return `
      <article class="clip-card" data-post-id="${esc(post.id)}" data-media-index="${mediaIndex}">
        <div class="clip-stage">
          <div class="clip-viewport ${letterbox ? 'letterbox' : ''}">
            <video class="clip-video" data-clip-video src="${esc(media.url)}" style="object-position:${50 + x / 2}% ${50 + y / 2}%;filter:${esc(postFilterStyle(item))}" playsinline webkit-playsinline loop ${state.clipMuted || music ? 'muted' : ''} preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" tabindex="0" aria-label="${esc(item.altText || `Clip by ${author.username}. Tap to pause or play.`)}"></video>
            ${music?.audioUrl ? `<audio class="clip-music" src="${esc(music.audioUrl)}" preload="metadata" data-start="${Number(music.start || 0)}" data-end="${Number(music.start || 0) + Number(music.clipDuration || 30)}"></audio>` : ''}
            <div class="clip-shade" aria-hidden="true"></div>
            <span class="clip-play-indicator" aria-hidden="true">${icon('play')}</span>
            <span class="clip-like-burst" aria-hidden="true">${icon('heart')}</span>
            <div class="clip-copy">
              <div class="clip-author-row">
                <a href="${esc(accountProfileHref(author))}" data-action="view-user-profile" data-username="${esc(author.username)}">${avatarHtml(author)}<strong>${esc(author.username)}</strong></a>
                ${followControl}
              </div>
              ${caption ? `<p>${renderMentionText(caption)}</p>` : ''}
              <small class="clip-audio-line">${icon('music')} ${music ? `${esc(music.title)} · ${esc(music.artist)}` : `Original audio · ${esc(author.username)}`}</small>
            </div>
            <span class="clip-progress" aria-hidden="true"><i></i></span>
          </div>
          <aside class="clip-actions" aria-label="Clip actions">
            <button class="clip-like-action ${liked ? 'active' : ''}" data-action="toggle-post-like" data-post-id="${esc(post.id)}" aria-label="${liked ? 'Unlike' : 'Like'}" aria-pressed="${liked}">${icon('heart')}<small data-clip-like-count>${showLikeCount ? Number(post.likeCount || 0).toLocaleString() : '—'}</small></button>
            <button data-action="open-post-comments" data-post-id="${esc(post.id)}" aria-label="Comments">${icon('comment')}<small data-clip-comment-count>${Number(post.commentCount || 0).toLocaleString()}</small></button>
            ${post.allowReposts === false ? '' : `<button class="clip-repost-action ${reposted ? 'active' : ''}" data-action="toggle-post-repost" data-post-id="${esc(post.id)}" aria-label="${reposted ? 'Undo repost' : 'Repost'}" aria-pressed="${reposted}">${icon('repost')}<small data-clip-repost-count>${Number(post.repostCount || 0).toLocaleString()}</small></button>`}
            <button data-action="share-post" data-post-id="${esc(post.id)}" aria-label="Share">${icon('send')}</button>
            <button class="clip-save-action ${saved ? 'active' : ''}" data-action="toggle-post-save" data-post-id="${esc(post.id)}" aria-label="${saved ? 'Unsave' : 'Save'}" aria-pressed="${saved}">${icon('bookmark')}</button>
            <button data-action="post-options" data-post-id="${esc(post.id)}" aria-label="More options">${icon('more')}</button>
            <button class="clip-audio-cover" data-action="view-user-profile" data-username="${esc(author.username)}" aria-label="View ${esc(author.username)}">${music?.artworkUrl ? `<img src="${esc(music.artworkUrl)}" alt="${esc(music.title)} artwork">` : author.avatar?.url ? `<img src="${esc(author.avatar.url)}" alt="">` : esc(initials(author))}</button>
          </aside>
        </div>
      </article>
    `;
  }

  function renderClipsPanel(options = {}) {
    const viewer = Boolean(options.viewer || state.clipViewer);
    const entries = viewer ? clipViewerEntries() : clipPosts().map((post) => ({ post, mediaIndex: 0 }));
    return `
      <section class="clips-page ${viewer ? 'is-viewer' : ''}" aria-label="Clips">
        <header class="clips-head">
          <button class="clips-leading" data-action="${viewer ? 'close-clip-viewer' : 'open-post-create'}" aria-label="${viewer ? 'Back to previous page' : 'Create a clip'}">${icon(viewer ? 'back' : 'plus')}</button>
          <div class="clips-tabs" role="tablist"><button class="${state.clipMode === 'for_you' ? 'active' : ''}" data-action="set-clip-mode" data-mode="for_you" role="tab" aria-selected="${state.clipMode === 'for_you'}">Clips</button><button class="${state.clipMode === 'friends' ? 'active' : ''}" data-action="set-clip-mode" data-mode="friends" role="tab" aria-selected="${state.clipMode === 'friends'}">Friends</button></div>
          <button class="clips-sound" data-action="toggle-clip-sound" aria-label="${state.clipMuted ? 'Turn sound on' : 'Mute clips'}" aria-pressed="${state.clipMuted ? 'true' : 'false'}">${icon(state.clipMuted ? 'mute' : 'volume')}</button>
        </header>
        <div class="clips-feed" data-scroll-memory="${viewer ? `clip-viewer-feed:${esc(state.clipViewer?.postId || '')}` : 'clips-feed'}">
          ${entries.length ? entries.map(({ post, mediaIndex }) => renderClipCard(post, { mediaIndex })).join('') : `<div class="clips-empty">${icon('clips')}<strong>No clips yet</strong><small>Share a video post and it will appear here.</small><button class="primary" data-action="open-post-create">Share a video</button></div>`}
        </div>
      </section>
    `;
  }

  function toggleHomeVideoSound(button) {
    const video = button?.closest('.post-carousel-slide, .post-media-frame')?.querySelector('.post-video-preview');
    if (!video) return;
    video.muted = !video.muted;
    button.innerHTML = icon(video.muted ? 'mute' : 'volume');
    button.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Mute video');
    const cue = video.parentElement?.querySelector('.post-video-open-cue');
    if (!video.muted) video.play().then(() => { if (cue) cue.hidden = true; }).catch(() => {});
  }

  function openPostClip(postId, mediaIndex = 0, sourceVideo = null) {
    const post = postById(postId);
    const items = postMediaItems(post);
    const index = clamp(Number(mediaIndex || 0), 0, Math.max(0, items.length - 1));
    if (!post || items[index]?.mediaType !== 'video') return false;
    const url = new URL(location.href);
    url.searchParams.set('clip', post.id);
    url.searchParams.set('media', String(index));
    beginDetailNavigation('clip-viewer', url.toString());
    const sourceTime = Number(sourceVideo?.currentTime || 0);
    if (sourceVideo && !sourceVideo.muted) {
      state.clipMuted = false;
      localStorage.setItem('clipMuted', '0');
    }
    sourceVideo?.pause?.();
    state.clipViewer = { postId: post.id, mediaIndex: index, sourceTab: state.tab, sourceTime };
    state.actionSheet = null;
    renderApp();
    return true;
  }

  function closeClipViewer() {
    if (!state.clipViewer) return;
    navigationBackOr(() => {
      state.clipViewer = null;
      const url = new URL(location.href);
      url.searchParams.delete('clip');
      url.searchParams.delete('media');
      history.replaceState({ ...(history.state || {}), view: captureNavigationView() }, '', url.toString());
      renderApp();
    });
  }

  let clipPlaybackObserver = null;
  let clipTapTimer = null;

  function syncClipMusic(video) {
    const audio = video?.closest('.clip-card')?.querySelector('.clip-music');
    if (!audio) return;
    const start = Math.max(0, Number(audio.dataset.start || 0));
    const end = Math.max(start + 1, Number(audio.dataset.end || start + 30));
    const sectionLength = Math.max(1, end - start);
    const targetTime = start + (Math.max(0, Number(video.currentTime || 0)) % sectionLength);
    audio.muted = state.clipMuted;
    if (video.paused || state.clipMuted) {
      audio.pause();
      return;
    }
    const synchronize = () => {
      if (!Number.isFinite(audio.currentTime) || audio.currentTime < start || audio.currentTime >= end || Math.abs(audio.currentTime - targetTime) > .45) {
        try { audio.currentTime = targetTime; } catch {}
      }
      if (audio.paused) {
        audio.play().catch(() => {
          audio.pause();
          if (!state.clipMuted) {
            state.clipMuted = true;
            localStorage.setItem('clipMuted', '1');
            syncClipSoundUi();
          }
        });
      }
    };
    if (audio.readyState >= 1) synchronize();
    else if (!audio._clipMetadataBound) {
      audio._clipMetadataBound = true;
      audio.addEventListener('loadedmetadata', () => {
        audio._clipMetadataBound = false;
        syncClipMusic(video);
      }, { once: true });
    }
  }

  function syncClipPlaybackUi(video) {
    const card = video?.closest('.clip-card');
    if (!card) return;
    card.classList.toggle('is-paused', video.paused);
    card.classList.toggle('is-playing', !video.paused);
    const progress = Number.isFinite(video.duration) && video.duration > 0 ? clamp(video.currentTime / video.duration, 0, 1) : 0;
    const line = card.querySelector('.clip-progress i');
    if (line) line.style.transform = `scaleX(${progress})`;
    syncClipMusic(video);
  }

  function syncClipSoundUi() {
    document.querySelectorAll('.clips-sound').forEach((button) => {
      button.innerHTML = icon(state.clipMuted ? 'mute' : 'volume');
      button.setAttribute('aria-label', state.clipMuted ? 'Turn sound on' : 'Mute clips');
      button.setAttribute('aria-pressed', state.clipMuted ? 'true' : 'false');
    });
  }

  function toggleClipSound() {
    state.clipMuted = !state.clipMuted;
    localStorage.setItem('clipMuted', state.clipMuted ? '1' : '0');
    const root = currentAppShell()?.querySelector('.clips-feed');
    root?.querySelectorAll('.clip-video').forEach((video) => {
      video.muted = Boolean(video.closest('.clip-card')?.querySelector('.clip-music')) || state.clipMuted;
      syncClipMusic(video);
    });
    syncClipSoundUi();
    const active = root?.querySelector('.clip-card.is-playing .clip-video') || root?.querySelector('.clip-video');
    active?.play?.().catch(() => {});
  }

  function toggleClipPlayback(surface) {
    const video = surface?.matches?.('.clip-video') ? surface : surface?.querySelector?.('.clip-video');
    if (!video) return;
    if (video.paused) video.play().then(() => syncClipMusic(video)).catch(() => {});
    else {
      video.pause();
      video.closest('.clip-card')?.querySelector('.clip-music')?.pause?.();
    }
    syncClipPlaybackUi(video);
  }

  function attachClipPlayback() {
    clipPlaybackObserver?.disconnect();
    clipPlaybackObserver = null;
    const root = currentAppShell()?.querySelector('.clips-feed');
    const videos = Array.from(root?.querySelectorAll('.clip-video') || []);
    if (!videos.length) return;
    const sourceTime = Number(state.clipViewer?.sourceTime || 0);
    videos.forEach((video) => {
      video.muted = Boolean(video.closest('.clip-card')?.querySelector('.clip-music')) || state.clipMuted;
      const audio = video.closest('.clip-card')?.querySelector('.clip-music');
      if (audio && !audio._clipBoundaryBound) {
        audio._clipBoundaryBound = true;
        const clampAudioSection = () => {
          const start = Math.max(0, Number(audio.dataset.start || 0));
          const end = Math.max(start + 1, Number(audio.dataset.end || start + 30));
          if (audio.currentTime >= end || audio.ended) {
            audio.pause();
            try { audio.currentTime = start; } catch {}
            if (!video.paused && !state.clipMuted) syncClipMusic(video);
          }
        };
        audio.addEventListener('timeupdate', clampAudioSection);
        audio.addEventListener('ended', clampAudioSection);
        audio.addEventListener('error', () => {
          if (!state.clipMuted) {
            state.clipMuted = true;
            localStorage.setItem('clipMuted', '1');
            syncClipSoundUi();
          }
        });
      }
      if (!video._clipPlaybackBound) {
        video._clipPlaybackBound = true;
        video.addEventListener('play', () => syncClipPlaybackUi(video));
        video.addEventListener('pause', () => {
          video.closest('.clip-card')?.querySelector('.clip-music')?.pause?.();
          syncClipPlaybackUi(video);
        });
        video.addEventListener('timeupdate', () => syncClipPlaybackUi(video));
        video.addEventListener('loadedmetadata', () => syncClipPlaybackUi(video));
      }
      syncClipPlaybackUi(video);
    });
    if (sourceTime > 0) {
      const restoreTime = () => {
        try { videos[0].currentTime = Math.min(sourceTime, Math.max(0, Number(videos[0].duration || sourceTime))); } catch {}
      };
      if (videos[0].readyState >= 1) restoreTime();
      else videos[0].addEventListener('loadedmetadata', restoreTime, { once: true });
      // The handoff time is only for the first Home-to-viewer transition.
      // Subsequent UI refreshes (like/save/comment) must not rewind the clip.
      if (state.clipViewer) state.clipViewer.sourceTime = 0;
    }
    if (!('IntersectionObserver' in window)) {
      videos[0].play().catch(() => {});
      return;
    }
    clipPlaybackObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
          videos.filter((item) => item !== video).forEach((item) => {
            item.pause();
            item.closest('.clip-card')?.querySelector('.clip-music')?.pause?.();
          });
          video.muted = Boolean(video.closest('.clip-card')?.querySelector('.clip-music')) || state.clipMuted;
          video.play().catch(() => {
            video.muted = true;
            state.clipMuted = true;
            localStorage.setItem('clipMuted', '1');
            syncClipSoundUi();
            video.play().catch(() => {});
          });
        } else {
          video.pause();
        }
        syncClipPlaybackUi(video);
      });
    }, { root, threshold: [0, 0.72, 1] });
    videos.forEach((video) => clipPlaybackObserver.observe(video));
  }

  function composerFilterStyle(composer) {
    return postFilterStyle({ filter: composer.filter, adjustments: composer.adjustments });
  }

  function activePostComposerItem(composer = state.postComposer) {
    if (!composer?.items?.length) return null;
    return composer.items[clamp(Number(composer.activeIndex || 0), 0, composer.items.length - 1)] || composer.items[0];
  }

  function syncPostComposerAliases(composer = state.postComposer) {
    const item = activePostComposerItem(composer);
    if (!composer || !item) return null;
    Object.assign(composer, {
      file: item.file,
      previewUrl: item.previewUrl,
      posterUrl: item.posterUrl,
      name: item.name,
      type: item.type,
      isVideo: item.isVideo,
      crop: item.crop,
      filter: item.filter,
      activeAdjustment: item.activeAdjustment,
      adjustments: item.adjustments
    });
    composer.sizeError = composer.items.map((entry) => entry.sizeError).filter(Boolean).join(' ');
    return item;
  }

  function postComposerAspectRatio(composer = state.postComposer) {
    const item = activePostComposerItem(composer);
    const name = item?.crop?.aspect || composer?.aspect || 'portrait';
    if (name === 'square') return 1;
    if (name === 'landscape') return 1.91;
    if (name === 'portrait34') return 3 / 4;
    if (name === 'mixed') return clamp(Number(composer?.items?.[0]?.naturalAspect || 1), 0.75, 1.91);
    if (name === 'original') return clamp(Number(composer?.originalAspect || composer?.items?.[0]?.naturalAspect || 1), 0.75, 1.91);
    return 4 / 5;
  }

  function syncPostComposerAspectFromOrder(composer = state.postComposer) {
    if (!composer?.items?.length) return;
    composer.originalAspect = clamp(Number(composer.items[0]?.naturalAspect || 1), 0.25, 4);
    if (composer.aspect === 'original') {
      const aspectRatio = `original:${clamp(composer.originalAspect, 0.75, 1.91).toFixed(4)}`;
      composer.items.forEach((item) => Object.assign(item.crop, { aspect: 'original', aspectRatio }));
    }
    syncPostComposerAliases(composer);
  }

  function postComposerMediaStyle(composer) {
    const fit = composer.crop.aspect === 'mixed' ? 'contain' : 'cover';
    if (composer.isVideo) {
      const x = clamp(Number(composer.crop.x || 0), -100, 100);
      const y = clamp(Number(composer.crop.y || 0), -100, 100);
      return `object-fit:${fit};object-position:${50 + x / 2}% ${50 + y / 2}%;filter:${composerFilterStyle(composer)}`;
    }
    const zoom = clamp(Number(composer.crop.zoom || 1), 1, 3);
    const x = clamp(Number(composer.crop.x || 0), -100, 100);
    const y = clamp(Number(composer.crop.y || 0), -100, 100);
    return `object-fit:${fit};object-position:${50 + x / 2}% ${50 + y / 2}%;transform:scale(${zoom}) rotate(${composer.crop.rotation}deg);filter:${composerFilterStyle(composer)}`;
  }

  function updatePostComposerMediaStyle() {
    if (!state.postComposer) return;
    syncPostComposerAliases(state.postComposer);
    const style = postComposerMediaStyle(state.postComposer);
    document.querySelectorAll('#post-composer-slot .post-composer-media > img, #post-composer-slot .post-composer-media > video').forEach((media) => {
      media.style.cssText = style;
    });
  }

  function syncPostCropControls() {
    const crop = state.postComposer?.crop;
    if (!crop) return;
    document.querySelectorAll('#post-composer-slot [data-post-crop]').forEach((input) => {
      const value = crop[input.dataset.postCrop];
      if (Number.isFinite(Number(value))) input.value = String(value);
    });
  }

  function syncPostPreviewUi(video) {
    const controls = video?.closest('.post-composer-media')?.querySelector('.post-preview-controls');
    if (!controls || !video) return;
    const play = controls.querySelector('[data-action="toggle-post-preview-play"]');
    const progress = controls.querySelector('[data-post-preview-progress]');
    const ratio = Number.isFinite(video.duration) && video.duration > 0 ? clamp(video.currentTime / video.duration, 0, 1) : 0;
    if (progress) {
      progress.value = String(Math.round(ratio * 1000));
      progress.setAttribute('aria-valuetext', `${Math.round(ratio * 100)}% played`);
    }
    if (play) {
      play.innerHTML = icon(video.paused ? 'play' : 'pause');
      play.setAttribute('aria-label', video.paused ? 'Play preview' : 'Pause preview');
      play.setAttribute('aria-pressed', video.paused ? 'false' : 'true');
    }
  }

  function syncPostPreviewMusic(video) {
    const audio = video?.closest('.post-composer-media')?.querySelector('.post-preview-music');
    if (!audio || !state.postComposer?.music) return;
    const start = Math.max(0, Number(audio.dataset.start || 0));
    const end = Math.max(start + 1, Number(audio.dataset.end || start + 30));
    const sectionLength = Math.max(1, end - start);
    const muted = Boolean(state.postComposer.previewMuted);
    audio.muted = muted;
    if (video.paused || muted) {
      audio.pause();
      return;
    }
    const synchronize = () => {
      const target = start + (Math.max(0, Number(video.currentTime || 0)) % sectionLength);
      if (!Number.isFinite(audio.currentTime) || audio.currentTime < start || audio.currentTime >= end || Math.abs(audio.currentTime - target) > .35) {
        try { audio.currentTime = target; } catch {}
      }
      if (audio.paused) {
        audio.play().catch(() => {
          audio.pause();
          if (state.postComposer) state.postComposer.previewMuted = true;
          syncPostPreviewUi(video);
        });
      }
    };
    if (audio.readyState >= 1) synchronize();
    else audio.addEventListener('loadedmetadata', synchronize, { once: true });
  }

  function attachPostComposerPreview() {
    const media = document.querySelector('#post-composer-slot .post-composer-media');
    const video = media?.querySelector('video');
    if (!video || video._postPreviewBound) return;
    video._postPreviewBound = true;
    const audio = media.querySelector('.post-preview-music');
    const sync = () => {
      syncPostPreviewUi(video);
      syncPostPreviewMusic(video);
    };
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('play', sync);
    video.addEventListener('pause', () => {
      audio?.pause();
      syncPostPreviewUi(video);
    });
    video.addEventListener('timeupdate', sync);
    video.addEventListener('ended', () => {
      audio?.pause();
      syncPostPreviewUi(video);
    });
    audio?.addEventListener('timeupdate', () => {
      const start = Math.max(0, Number(audio.dataset.start || 0));
      const end = Math.max(start + 1, Number(audio.dataset.end || start + 30));
      if (audio.currentTime >= end) {
        audio.pause();
        try { audio.currentTime = start + (Math.max(0, Number(video.currentTime || 0)) % Math.max(1, end - start)); } catch {}
        if (!video.paused && !state.postComposer?.previewMuted) syncPostPreviewMusic(video);
      }
    });
    audio?.addEventListener('ended', () => { if (!video.paused && !state.postComposer?.previewMuted) syncPostPreviewMusic(video); });
    syncPostPreviewUi(video);
  }

  function renderPostComposerMedia(composer, taggable = false) {
    syncPostComposerAliases(composer);
    const style = postComposerMediaStyle(composer);
    const cropGesture = !taggable && Number(composer.stage || 1) === 1;
    const media = composer.isVideo
      ? `<video src="${esc(composer.previewUrl)}" ${composer.posterUrl ? `poster="${esc(composer.posterUrl)}"` : ''} style="${esc(style)}" ${composer.music || composer.previewMuted !== false ? 'muted' : ''} playsinline webkit-playsinline preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback"></video>`
      : `<img src="${esc(composer.previewUrl)}" style="${esc(style)}" alt="Post preview">`;
    return `
      <div class="post-composer-media aspect-${esc(composer.crop.aspect || 'portrait')} ${taggable ? 'taggable' : ''}" style="--post-aspect:${postComposerAspectRatio(composer)}" ${taggable ? 'data-action="pick-post-tag-position"' : cropGesture ? 'data-post-crop-surface' : ''}>
        ${media}
        ${composer.isVideo && composer.music?.audioUrl ? `<audio class="post-preview-music" src="${esc(composer.music.audioUrl)}" preload="metadata" data-start="${Number(composer.music.start || 0)}" data-end="${Number(composer.music.start || 0) + Number(composer.music.clipDuration || 30)}"></audio>` : ''}
        ${cropGesture ? `<span class="post-crop-gesture-layer ${composer.isVideo ? 'is-video' : ''}" aria-hidden="true"></span>` : ''}
        ${composer.isVideo ? `<div class="post-preview-controls"><button data-action="toggle-post-preview-play" aria-label="Play preview" aria-pressed="false">${icon('play')}</button><input class="post-preview-progress" data-post-preview-progress type="range" min="0" max="1000" value="0" aria-label="Preview playback position" aria-valuetext="0% played"><button data-action="toggle-post-preview-sound" aria-label="${composer.previewMuted === false ? 'Mute preview' : 'Turn preview sound on'}" aria-pressed="${composer.previewMuted === false ? 'true' : 'false'}">${icon(composer.previewMuted === false ? 'volume' : 'mute')}</button></div>` : ''}
        ${composer.items?.length > 1 ? `<span class="post-composer-count">${Number(composer.activeIndex || 0) + 1}/${composer.items.length}</span>` : ''}
        ${(composer.personTags || []).map((tag, index) => ({ tag, index })).filter(({ tag }) => Number(tag.mediaIndex || 0) === Number(composer.activeIndex || 0)).map(({ tag, index }) => `<button class="post-tag-draft" style="left:${tag.x}%;top:${tag.y}%" data-action="remove-post-tag" data-tag-index="${index}">@${esc(tag.username)}</button>`).join('')}
        ${composer.pendingTagPoint && Number(composer.pendingTagPoint.mediaIndex || 0) === Number(composer.activeIndex || 0) ? `<span class="post-tag-target" style="left:${composer.pendingTagPoint.x}%;top:${composer.pendingTagPoint.y}%"></span>` : ''}
      </div>
    `;
  }

  function renderPostMusicControl(composer, compact = false) {
    if (!composer.isVideo || composer.items?.length !== 1) return '';
    const music = composer.music || null;
    return `
      <section class="post-music-control ${compact ? 'compact' : ''}">
        ${music ? `
          <span class="music-artwork">${music.artworkUrl ? `<img src="${esc(music.artworkUrl)}" alt="">` : icon('music')}</span>
          <span><strong>${esc(music.title)}</strong><small>${esc(music.artist)} · ${esc(formatClipTime(music.start || 0))}–${esc(formatClipTime(Number(music.start || 0) + Number(music.clipDuration || 30)))}</small></span>
          <button data-action="open-post-music" aria-label="Change music">${icon('edit')}</button>
          <button data-action="remove-post-music" aria-label="Remove music">${icon('x')}</button>
        ` : `
          <span class="post-music-icon">${icon('music')}</span>
          <span><strong>Add music</strong><small>Search tracks and choose the section</small></span>
          <button data-action="open-post-music" aria-label="Add music">${icon('plus')}</button>
        `}
      </section>
    `;
  }

  function renderPostMediaRail(composer) {
    if (!composer.items?.length) return '';
    return `
      <div class="post-selection-rail" aria-label="Selected photos and videos">
        ${composer.items.map((item, index) => `
          <div class="post-selection-item ${index === composer.activeIndex ? 'active' : ''}">
            <button class="post-selection-thumb" data-action="select-post-media" data-media-index="${index}" aria-label="Edit item ${index + 1}">
              ${item.isVideo ? `<video src="${esc(item.previewUrl)}" muted playsinline preload="metadata"></video><i>${icon('play')}</i>` : `<img src="${esc(item.previewUrl)}" alt="">`}
              <b>${index + 1}</b>
            </button>
            ${composer.items.length > 1 ? `<button class="post-selection-remove" data-action="remove-post-media" data-media-index="${index}" aria-label="Remove item ${index + 1}">${icon('x')}</button>` : ''}
            ${index === composer.activeIndex && composer.items.length > 1 ? `<span class="post-selection-order"><button data-action="move-post-media-previous" data-media-index="${index}" aria-label="Move item earlier" ${index === 0 ? 'disabled' : ''}>${icon('back')}</button><button data-action="move-post-media-next" data-media-index="${index}" aria-label="Move item later" ${index === composer.items.length - 1 ? 'disabled' : ''}>${icon('back')}</button></span>` : ''}
          </div>
        `).join('')}
        ${composer.items.length < 20 ? `<button class="post-selection-add" data-action="add-post-media" aria-label="Add more photos or videos">${icon('plus')}<small>Add</small></button>` : ''}
      </div>
    `;
  }

  function postComposerCandidates() {
    const seen = new Set();
    return [state.me, ...state.contacts, ...state.recommendations, ...state.searchResults].filter((user) => {
      if (!user?.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  }

  function renderPostComposer() {
    const composer = state.postComposer;
    if (!composer) return '';
    const stage = clamp(Number(composer.stage || 1), 1, 3);
    const adjustment = composer.activeAdjustment || 'saturation';
    return `
      <div class="post-composer-overlay">
        <section class="post-composer-page ${state.postPublishing ? 'is-publishing' : ''}" role="dialog" aria-modal="true" aria-label="Create post" aria-busy="${state.postPublishing}">
          <header class="post-composer-head">
            <button data-action="${state.postPublishing || stage === 1 ? 'close-post-composer' : 'post-composer-back'}" aria-label="${state.postPublishing ? 'Cancel upload' : stage === 1 ? 'Close' : 'Back'}">${state.postPublishing || stage === 1 ? icon('x') : icon('back')}</button>
            <span><strong>${stage === 1 ? 'New post' : stage === 2 ? 'Edit' : 'Share'}</strong><small>${stage === 1 ? 'Crop and arrange' : stage === 2 ? 'Style and add music' : 'Finish your post'}</small></span>
            ${stage < 3 ? `<button class="post-next" data-action="post-composer-next">Next</button>` : `<button class="post-next" data-action="publish-post" ${state.postPublishing || composer.sizeError ? 'disabled' : ''}>${state.postPublishing ? 'Sharing…' : composer.sizeError ? 'Too large' : 'Share'}</button>`}
          </header>
          ${composer.sizeError ? `<div class="post-stage-meta"><p class="post-media-warning" role="alert">${esc(composer.sizeError)}</p></div>` : ''}
          ${stage === 1 ? `
            <div class="post-editor-body">
              ${renderPostComposerMedia(composer)}
              ${renderPostMediaRail(composer)}
              <div class="post-crop-controls">
                <p class="post-crop-hint">${composer.isVideo ? 'Drag to choose the framing. Use the controls on the preview to play or mute it.' : 'Drag to reposition. Pinch or use the slider to zoom.'}</p>
                <div class="post-aspect-row">
                  ${[['mixed','Mixed'],['original','Original'],['square','1:1'],['portrait','4:5'],['portrait34','3:4'],['landscape','1.91:1']].map(([value,label]) => `<button class="${composer.crop.aspect === value ? 'active' : ''}" data-action="set-post-aspect" data-aspect="${value}">${label}</button>`).join('')}
                </div>
                ${composer.isVideo ? '' : `<label>Zoom <input type="range" min="1" max="3" step=".01" value="${composer.crop.zoom}" data-post-crop="zoom"></label>`}
                <label>Horizontal <input type="range" min="-100" max="100" step="1" value="${composer.crop.x}" data-post-crop="x"></label>
                <label>Vertical <input type="range" min="-100" max="100" step="1" value="${composer.crop.y}" data-post-crop="y"></label>
                <div class="post-crop-actions ${composer.isVideo ? 'single' : ''}"><button class="secondary" data-action="reset-post-crop">Reset</button>${composer.isVideo ? '' : `<button class="secondary" data-action="rotate-post-media">${icon('rotate')} Rotate</button>`}</div>
              </div>
            </div>
          ` : stage === 2 ? `
            <div class="post-editor-body">
              ${renderPostComposerMedia(composer)}
              ${renderPostMediaRail(composer)}
              <div class="post-filter-rail" data-scroll-memory="post-filters">
                ${[['normal','Original'],['vivid','Vivid'],['warm','Warm'],['cool','Cool'],['mono','Mono'],['fade','Fade'],['noir','Noir']].map(([value,label]) => `<button class="${composer.filter === value ? 'active' : ''}" data-action="set-post-filter" data-filter="${value}"><span style="filter:${postFilterStyle({filter:value})}">${composer.isVideo ? `<img class="post-video-filter-poster" data-video-poster ${composer.posterUrl ? `src="${esc(composer.posterUrl)}"` : 'hidden'} alt=""><i class="post-video-filter-placeholder" ${composer.posterUrl ? 'hidden' : ''}>${icon('play')}</i>` : `<img src="${esc(composer.previewUrl)}" alt="">`}</span><small>${label}</small></button>`).join('')}
              </div>
              <div class="post-adjust-tabs">
                ${['brightness','contrast','saturation','warmth'].map((name) => `<button class="${adjustment === name ? 'active' : ''}" data-action="select-post-adjustment" data-adjustment="${name}">${name}</button>`).join('')}
              </div>
              <label class="post-adjust-slider"><span>${adjustment}</span><input type="range" min="${adjustment === 'warmth' ? -50 : adjustment === 'saturation' ? 0 : 60}" max="${adjustment === 'warmth' ? 50 : adjustment === 'saturation' ? 200 : 140}" value="${composer.adjustments[adjustment]}" data-post-adjust="${adjustment}"><output>${composer.adjustments[adjustment]}</output></label>
              ${renderPostMusicControl(composer)}
            </div>
          ` : `
            <div class="post-details-layout">
              <div>
                ${renderPostComposerMedia(composer, true)}
                ${renderPostMediaRail(composer)}
                <small class="post-tag-help">Tap the photo or video to place a person tag.</small>
                ${composer.pendingTagPoint ? `
                  <div class="post-tag-picker">
                    <input id="post-tag-username" list="post-tag-candidates" placeholder="Username to tag" autocomplete="off">
                    <datalist id="post-tag-candidates">${postComposerCandidates().filter((user) => user.id !== state.me?.id).map((user) => `<option value="${esc(user.username)}">${esc(user.displayName)}</option>`).join('')}</datalist>
                    <button data-action="add-post-person-tag">Add tag</button>
                  </div>
                ` : ''}
              </div>
              <div class="post-details-fields">
                ${renderPostMusicControl(composer, true)}
                <label>Title <input id="post-title" maxlength="100" value="${esc(composer.title)}" placeholder="Give this post a title"></label>
                <label>Caption <textarea id="post-description" maxlength="2200" placeholder="Write a caption…">${esc(composer.description)}</textarea></label>
                <label>Tags <input id="post-hashtags" maxlength="300" value="${esc(composer.hashtags)}" placeholder="#travel #summer"></label>
                <label>Location <input id="post-location" maxlength="100" value="${esc(composer.location || '')}" placeholder="Add a location"></label>
                <label>Alt text · item ${Number(composer.activeIndex || 0) + 1}<textarea id="post-alt-text" maxlength="500" placeholder="Describe this media for people who use screen readers">${esc(activePostComposerItem(composer)?.altText || '')}</textarea></label>
                <label class="switch-row compact"><span><strong>Allow reposts</strong><small>Other people can share this post to their profile.</small></span><input id="post-allow-reposts" type="checkbox" ${composer.allowReposts ? 'checked' : ''}></label>
                <label class="switch-row compact"><span><strong>Allow comments</strong><small>People can reply to this post.</small></span><input id="post-allow-comments" type="checkbox" ${composer.allowComments ? 'checked' : ''}></label>
                <label class="switch-row compact"><span><strong>Hide like counts</strong><small>You will still be able to see the count.</small></span><input id="post-hide-like-counts" type="checkbox" ${composer.hideLikeCounts ? 'checked' : ''}></label>
              </div>
            </div>
          `}
        </section>
      </div>
    `;
  }

  function renderNoteRail() {
    const notes = state.notes || [];
    const mine = notes.find((note) => (note.owner || note.user)?.id === state.me?.id);
    const ordered = mine ? [mine, ...notes.filter((note) => note !== mine)] : notes;
    return `
      <section class="note-rail" aria-label="Notes" data-scroll-memory="chat-notes">
        <button class="note-item own-note" data-action="open-note-composer">
          <span class="note-bubble">${mine ? esc(mine.text || 'Your note') : 'Leave a note'}</span>
          <span class="note-avatar">${state.me.avatar?.url ? `<img src="${esc(state.me.avatar.url)}" alt="">` : esc(initials(state.me))}<i>+</i></span>
          <small>You</small>
        </button>
        ${ordered.filter((note) => (note.owner || note.user)?.id !== state.me?.id).map((note) => {
          const owner = note.owner || note.user;
          return `
            <article class="note-item">
              <button class="note-main" data-action="play-note" data-note-id="${esc(note.id)}">
                <span class="note-bubble">
                  ${note.audio ? `<b>${esc(note.audioTitle || 'Audio note')}</b><em>${esc(note.audioArtist || owner.displayName || owner.username)}</em>` : ''}
                  ${esc(note.text || '')}
                </span>
                <span class="note-avatar">${owner.avatar?.url ? `<img src="${esc(owner.avatar.url)}" alt="">` : esc(initials(owner))}</span>
                <small>${esc(owner.username)}</small>
              </button>
              ${note.audio?.url ? `<audio id="note-audio-${esc(note.id)}" src="${esc(note.audio.url)}" preload="none"></audio>` : ''}
            </article>
          `;
        }).join('')}
      </section>
    `;
  }

  function renderNoteComposer() {
    const composer = state.noteComposer;
    if (!composer) return '';
    const selectedMusic = composer.music || null;
    const hasAudio = Boolean(composer.audio || selectedMusic);
    return `
      <div class="center-overlay note-composer-overlay" data-action="close-note-composer">
        <section class="center-modal note-composer" data-stop-close>
          <header class="modal-head"><h2>New note</h2><button class="icon-btn" data-action="close-note-composer">${icon('x')}</button></header>
          <div class="note-composer-preview">
            <span>${esc(composer.text || 'Share a thought…')}</span>
            ${profilePictureElement(state.me, 'note-preview-avatar', { own: true })}
          </div>
          <label class="note-text-field"><textarea id="note-text" maxlength="60" placeholder="Share a thought…">${esc(composer.text || '')}</textarea><output>${String(composer.text || '').length}/60</output></label>
          <section class="note-audio-editor">
            <div><strong>${icon('music')} Add music</strong><small>Optional · choose a section up to 30 seconds</small></div>
            ${selectedMusic ? `
              <div class="note-selected-music">
                <span class="music-artwork">${selectedMusic.artworkUrl ? `<img src="${esc(selectedMusic.artworkUrl)}" alt="">` : icon('music')}</span>
                <span><strong>${esc(selectedMusic.title)}</strong><small>${esc(selectedMusic.artist)} · ${esc(formatClipTime(selectedMusic.start || 0))}–${esc(formatClipTime(Number(selectedMusic.start || 0) + Number(selectedMusic.clipDuration || 30)))}</small></span>
                <button data-action="open-note-music" aria-label="Change music">${icon('edit')}</button>
                <button data-action="remove-note-music" aria-label="Remove music">${icon('x')}</button>
              </div>
            ` : composer.audio ? `
              <div class="note-selected-music local-audio">
                <span class="music-artwork">${icon('mic')}</span>
                <span><strong>${esc(composer.audioTitle || 'Original audio')}</strong><small>${esc(composer.audioArtist || 'From your device')}</small></span>
                <button data-action="toggle-note-local-preview" aria-label="Play original audio" aria-pressed="false">${icon('play')}</button>
                <button data-action="remove-note-audio" aria-label="Remove audio">${icon('x')}</button>
              </div>
              <audio id="note-composer-audio" src="${esc(composer.audio.dataUrl)}" preload="metadata"></audio>
            ` : ''}
            <div class="note-audio-actions">
              <button class="secondary" data-action="open-note-music">${icon('music')} Music</button>
              <button class="secondary" data-action="choose-note-audio">${icon('file')} Device</button>
              <button class="secondary ${state.noteRecording ? 'recording' : ''}" data-action="${state.noteRecording ? 'stop-note-recording' : 'start-note-recording'}">${icon('mic')} ${state.noteRecording ? 'Stop recording' : 'Record'}</button>
            </div>
          </section>
          <div class="note-composer-footer">
            ${composer.hasExisting ? '<button class="danger-text" data-action="delete-note">Delete note</button>' : ''}
            <button class="primary note-share" data-action="share-note" ${!String(composer.text || '').trim() && !hasAudio ? 'disabled' : ''}>Share note</button>
          </div>
        </section>
      </div>
    `;
  }

  function musicWaveformBars(trackId) {
    const seed = Array.from(String(trackId || 'music')).reduce((total, char) => (total * 33 + char.charCodeAt(0)) % 9973, 17);
    return Array.from({ length: 52 }, (_, index) => {
      const height = 20 + ((seed * (index + 7) * 19 + index * index * 11) % 78);
      return `<i style="--music-peak:${height}%"></i>`;
    }).join('');
  }

  function renderMusicPicker() {
    const picker = state.musicPicker;
    if (!picker) return '';
    const track = picker.selected || null;
    const clipDuration = track ? Math.min(Number(picker.clipDuration || 30), Number(track.trackDuration || 30)) : 30;
    const maxStart = track ? Math.max(0, Number(track.trackDuration || 0) - clipDuration) : 0;
    const start = track ? clamp(Number(picker.start || 0), 0, maxStart) : 0;
    const durationChoices = track ? ([15, 30].filter((seconds) => seconds <= Number(track.trackDuration || 0)) || []) : [];
    if (track && !durationChoices.length) durationChoices.push(Math.max(1, Math.floor(Number(track.trackDuration || clipDuration))));
    return `
      <div class="music-picker-overlay" data-action="close-music-picker">
        <section class="music-picker-sheet" data-stop-close role="dialog" aria-modal="true" aria-label="Add music">
          <header class="music-picker-head">
            <button data-action="${track ? 'music-picker-back' : 'close-music-picker'}" aria-label="${track ? 'Back to music search' : 'Close music'}">${icon(track ? 'back' : 'x')}</button>
            <span><strong>${track ? 'Choose a section' : 'Add music'}</strong>${track ? '<small>Drag the waveform or use the start slider</small>' : '<small>Openly licensed tracks</small>'}</span>
            ${track ? '<button class="music-picker-done" data-action="apply-music-selection">Done</button>' : '<span></span>'}
          </header>
          ${track ? `
            <div class="music-segment-editor">
              <div class="music-segment-track">
                <span class="music-artwork large">${track.artworkUrl ? `<img src="${esc(track.artworkUrl)}" alt="">` : icon('music')}</span>
                <span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>
                <button class="music-preview-toggle" data-action="toggle-music-segment-preview" aria-label="Play selected section" aria-pressed="false">${icon('play')}</button>
              </div>
              <audio id="music-picker-audio" src="${esc(track.audioUrl)}" preload="metadata" data-start="${start}" data-end="${start + clipDuration}"></audio>
              <div class="music-segment-summary"><strong>${esc(formatClipTime(start))}–${esc(formatClipTime(start + clipDuration))}</strong><span>${Math.round(clipDuration)} seconds</span></div>
              <div class="music-waveform-window" style="--music-position:${maxStart ? start / maxStart : 0}">
                <div class="music-waveform-bars">${musicWaveformBars(track.catalogId)}</div>
                <span class="music-window-edge start"></span><span class="music-window-edge end"></span>
                <input class="music-waveform-range" data-music-segment-start type="range" min="0" max="${maxStart}" step="0.1" value="${start}" aria-label="Choose the start of the selected music section">
              </div>
              <label class="music-segment-slider"><span>Start</span><input id="music-segment-start" data-music-segment-start type="range" min="0" max="${maxStart}" step="0.1" value="${start}"><output>${esc(formatClipTime(start))}</output></label>
              <div class="music-duration-options" role="group" aria-label="Section length">
                ${durationChoices.map((seconds) => `<button class="${Math.round(clipDuration) === seconds ? 'active' : ''}" data-action="set-music-duration" data-duration="${seconds}">${seconds}s</button>`).join('')}
              </div>
              <p class="music-license-copy">${esc(track.attribution || `${track.title} by ${track.artist}`)} ${track.licenseUrl ? `<a href="${esc(track.licenseUrl)}" target="_blank" rel="noopener noreferrer">License</a>` : ''}</p>
            </div>
          ` : `
            <div class="music-search-view">
              <label class="music-search-field">${icon('search')}<input id="music-search" value="${esc(picker.query || '')}" placeholder="Search music" autocomplete="off" enterkeyhint="search"><button data-action="clear-music-search" aria-label="Clear search" ${picker.query ? '' : 'hidden'}>${icon('x')}</button></label>
              <div class="music-category-rail">
                ${['For you', 'Pop', 'Electronic', 'Hip hop', 'Acoustic', 'Cinematic'].map((label) => `<button data-action="music-category" data-query="${esc(label === 'For you' ? 'instrumental' : label)}">${esc(label)}</button>`).join('')}
              </div>
              <div class="music-results" aria-live="polite">
                ${picker.loading ? `<div class="music-results-loading"><i></i><span>Finding tracks…</span></div>` : picker.tracks?.length ? picker.tracks.map((item) => `
                  <article class="music-result-row">
                    <button class="music-result-main" data-action="select-music-track" data-track-id="${esc(item.catalogId)}">
                      <span class="music-artwork">${item.artworkUrl ? `<img src="${esc(item.artworkUrl)}" alt="" loading="lazy">` : icon('music')}</span>
                      <span><strong>${esc(item.title)}</strong><small>${esc(item.artist)} · ${esc(formatClipTime(item.trackDuration || 0))}</small></span>
                    </button>
                    <button class="music-result-play" data-action="preview-music-track" data-track-id="${esc(item.catalogId)}" aria-label="Preview ${esc(item.title)}">${icon('play')}</button>
                  </article>
                `).join('') : picker.error ? `<div class="music-results-empty is-error"><p>${esc(picker.error)}</p><button data-action="retry-music-search">Try again</button></div>` : '<div class="music-results-empty">No matching tracks. Try another title, artist, or mood.</div>'}
              </div>
              <footer class="music-provider-credit"><a href="https://openverse.org" target="_blank" rel="noopener noreferrer">Search powered by Openverse</a><span>CC BY, CC0 and public-domain music</span></footer>
            </div>
          `}
        </section>
      </div>
    `;
  }

  function renderChatsPanel() {
    const query = state.conversationQuery.trim();
    const conversations = [
      ...state.chats.map((chat) => ({ type: 'direct', id: chat.peer.id, latest: chat.latest, chat })),
      ...state.groups.map((group) => ({ type: 'group', id: group.id, latest: group.latest, group }))
    ].sort((a, b) => String(b.latest?.createdAt || '').localeCompare(String(a.latest?.createdAt || '')));
    const chatRows = conversations.length ? conversations.map((conversation) => {
      const unread = state.unreadByPeer[conversation.id] || 0;
      if (conversation.type === 'group') {
        const group = conversation.group;
        const sender = group.latest?.sender;
        const preview = group.latest ? `${sender?.id === state.me.id ? 'You' : (sender?.displayName || 'Member')}: ${describeMessage(group.latest)}` : `${group.memberCount} members`;
        return `
          <button class="chat-item group-chat-item ${state.activeGroup?.id === group.id ? 'active' : ''} ${unread ? 'unread' : ''}" data-action="open-group" data-group-id="${esc(group.id)}">
            ${groupAvatarHtml(group)}
            <span class="person"><strong>${esc(group.name)}</strong><small>${esc(preview)}</small></span>
            <span class="chat-meta"><small>${group.latest ? esc(shortTime(group.latest.createdAt)) : ''}</small></span>
          </button>
        `;
      }
      const chat = conversation.chat;
      return `
        <button class="chat-item ${state.activePeer?.id === chat.peer.id ? 'active' : ''} ${unread ? 'unread' : ''}" data-action="open-chat" data-user-id="${esc(chat.peer.id)}" data-peer-id="${esc(chat.peer.id)}">
          ${avatarHtml(chat.peer)}
          <span class="person">
            <strong>${esc(chat.peer.displayName)}</strong>
            <small>${chat.peer.hasBlocked ? 'Blocked' : chat.peer.muteUntil !== undefined && chat.peer.muteUntil !== null ? 'Muted - ' : ''}${esc(chat.latest ? describeMessage(chat.latest) : 'No messages yet')}</small>
          </span>
          <span class="chat-meta">
            <small>${chat.latest ? esc(shortTime(chat.latest.createdAt)) : ''}</small>
          </span>
        </button>
      `;
    }).join('') : '<div class="empty-state">Search for a username and add someone to start chatting.</div>';
    const searchRows = state.conversationSearching
      ? '<div class="empty-state">Searching conversations...</div>'
      : state.conversationResults.length ? state.conversationResults.map((result) => {
        const mine = result.message.senderId === state.me.id;
        const label = mine ? 'You' : (result.sender?.displayName || result.peer?.displayName || 'Member');
        if (result.group) return `
          <button class="chat-item conversation-hit" data-action="open-group" data-group-id="${esc(result.group.id)}" data-message-id="${esc(result.message.id)}">
            ${groupAvatarHtml(result.group)}
            <span class="person"><strong>${esc(result.group.name)}</strong><small>${esc(label)}: ${esc(result.snippet || describeMessage(result.message))}</small></span>
            <small>${esc(shortTime(result.message.createdAt))}</small>
          </button>
        `;
        return `
          <button class="chat-item conversation-hit" data-action="open-chat" data-user-id="${esc(result.peer.id)}" data-peer-id="${esc(result.peer.id)}" data-message-id="${esc(result.message.id)}">
            ${avatarHtml(result.peer)}
            <span class="person">
              <strong>${esc(result.peer.displayName)}</strong>
              <small>${esc(label)}: ${esc(result.snippet || describeMessage(result.message))}</small>
            </span>
            <small>${esc(shortTime(result.message.createdAt))}</small>
          </button>
        `;
      }).join('') : '<div class="empty-state">No conversation references match that search.</div>';

    return `
      ${renderNoteRail()}
      <section class="messages-head">
        <div class="messages-search-row">
          <input class="search-input conversation-search" id="conversation-search" placeholder="Search conversations" autocomplete="off" value="${esc(state.conversationQuery)}">
        </div>
      </section>
      <section class="panel-heading">
        <h2>Messages</h2>
        <button class="icon-btn new-group-btn" data-action="new-group" title="New group chat" aria-label="New group chat">${icon('edit')}</button>
      </section>
      <section class="chat-list">
        ${query ? searchRows : chatRows}
      </section>
    `;
  }

  function renderSearchPanel() {
    if (state.searchProfileOpen && state.publicProfile) {
      const profileView = state.searchProfileSocialView
        ? renderSearchProfileSocialPage(state.publicProfile)
        : renderSearchProfilePage(state.publicProfile);
      return `
        <div class="search-profile-mobile">${profileView}</div>
        <div class="search-profile-desktop-context">${renderSearchBrowsePanel()}</div>
      `;
    }
    return renderSearchBrowsePanel();
  }

  function renderSearchBrowsePanel() {
    const recommendations = visibleRecommendations();
    const query = state.userQuery.trim();
    return `
      <section class="search-page">
        <header class="search-page-head">
          <span class="search-field-icon">${icon('search')}</span>
          <input class="search-input" id="user-search" placeholder="Search" autocomplete="off" value="${esc(state.userQuery)}">
          ${state.userQuery ? `<button class="search-clear" data-action="clear-user-search" aria-label="Clear search">${icon('x')}</button>` : ''}
        </header>
        ${query ? `
          <section class="search-results-section">
            <div class="section-heading"><h2>Accounts</h2></div>
            <div class="result-list" id="search-results">${renderSearchResults()}</div>
          </section>
        ` : `
          <section class="search-explore-section">
            <div class="section-heading"><h2>Explore</h2><small>Popular right now</small></div>
            ${renderExploreGrid()}
          </section>
          <section class="search-discover">
            <div class="section-heading">
              <h2>Suggested for you</h2>
              <small>People you may know</small>
            </div>
            <div class="suggested-user-list">
              ${recommendations.length
                ? recommendations.map((user) => renderAccountRow(user, { dismissible: true })).join('')
                : `<div class="search-empty">${icon('profile')}<strong>No suggestions yet</strong><small>Try searching for a username.</small></div>`}
            </div>
          </section>
        `}
      </section>
    `;
  }

  function renderProfileStats(user, action) {
    if (!user.followersVisible) return `<span class="profile-stat profile-post-stat"><strong>${user.postCount ?? 0}</strong><span>posts</span></span><span class="private-social-note">Private account</span>`;
    return `
      <span class="profile-stat profile-post-stat"><strong>${user.postCount ?? 0}</strong><span>posts</span></span>
      <button type="button" class="social-stat-btn profile-stat" data-action="${esc(action)}" data-social="followers">
        <strong>${user.followerCount ?? 0}</strong><span>followers</span>
      </button>
      <button type="button" class="social-stat-btn profile-stat" data-action="${esc(action)}" data-social="following">
        <strong>${user.followingCount ?? 0}</strong><span>following</span>
      </button>
    `;
  }

  function profilePictureElement(user, className = 'big-avatar', options = {}) {
    const avatarUrl = user?.avatar?.url || '';
    const story = activeProfileStory(user);
    const content = avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc(initials(user));
    const ring = story ? `<span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>` : '';
    const expandable = Boolean(avatarUrl && (options.own || user?.avatarViewable !== false));
    if (!expandable) return `<span class="avatar ${esc(className)}">${content}${ring}</span>`;
    return `
      <button class="avatar ${esc(className)} profile-picture-button" data-action="view-profile-picture" data-src="${esc(avatarUrl)}" data-name="@${esc(user.username)}" aria-label="View profile picture">
        ${content}${ring}
      </button>
    `;
  }

  function renderProfileAvatarStack(user, className = 'big-avatar') {
    const story = activeProfileStory(user);
    return `
      <div class="profile-avatar-stack ${esc(className)}-stack">
        ${profilePictureElement(user, className, { own: user?.id === state.me?.id })}
        ${story ? `<button class="profile-story-view" data-action="view-story" data-story-id="${esc(story.id)}" aria-label="View story">${icon('play')}</button>` : ''}
      </div>
    `;
  }

  function renderSearchProfilePage(user) {
    const canSeeMedia = user.followersVisible !== false;
    return `
      <section class="search-profile-page">
        <header class="page-header search-profile-header">
          <button class="icon-btn" data-action="close-search-profile" aria-label="Back">${icon('back')}</button>
          <h2>@${esc(user.username)}</h2>
          <button class="icon-btn" data-action="open-profile-menu" data-user-id="${esc(user.id)}" aria-label="Profile options">${icon('more')}</button>
        </header>
        <section class="search-profile-hero">
          <div class="profile-identity-layout">
            ${renderProfileAvatarStack(user)}
            <div class="profile-identity-copy">
              <h1>${esc(user.displayName)}</h1>
              <small>@${esc(user.username)}</small>
              <div class="profile-stat-grid">${renderProfileStats(user, 'open-search-social')}</div>
            </div>
          </div>
          <div class="search-profile-copy profile-details">
            ${user.bio ? `<p>${esc(user.bio)}</p>` : '<p class="profile-empty-bio">No bio yet.</p>'}
            ${user.website ? `<a href="${esc(user.website)}" target="_blank" rel="noopener">${esc(user.website)}</a>` : ''}
            ${user.age !== undefined && user.age !== null ? `<small>${esc(user.age)} years old</small>` : ''}
            ${user.gender ? `<small>${esc(user.gender)}</small>` : ''}
          </div>
        </section>
        <div class="search-profile-actions">${renderSearchProfileActions(user)}</div>
        ${renderHighlights(user, false)}
        ${renderProfileSuggestions(user)}
        ${canSeeMedia ? renderProfileMedia(user, false) : `<div class="profile-private-media">${icon('lock')}<strong>This account is private</strong><small>Follow this account to see their posts.</small></div>`}
      </section>
    `;
  }

  function renderSearchProfileSocialPage(user) {
    const view = state.searchProfileSocialView === 'following' ? 'following' : 'followers';
    const users = view === 'followers' ? (user.followers || []) : (user.following || []);
    return `
      <section class="social-page">
        <header class="page-header">
          <button class="icon-btn" data-action="close-search-social" aria-label="Back">${icon('back')}</button>
          <h2>@${esc(user.username)}</h2>
        </header>
        <div class="segmented social-switch is-${view} ${state.socialTransition ? `social-switch-${state.socialTransition}` : ''}">
          <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-search-social" data-social="followers"><strong>${user.followerCount ?? 0}</strong> Followers</button>
          <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-search-social" data-social="following"><strong>${user.followingCount ?? 0}</strong> Following</button>
        </div>
        <div class="social-user-list ${state.socialTransition ? `social-list-slide social-list-${state.socialTransition}` : ''}">
          ${users.length ? users.map((item) => renderAccountRow(item, { social: true })).join('') : `<div class="empty-state">No ${view} yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderProfilePanel() {
    if (state.profileSocialView) return renderProfileSocialPage();
    const profileUrl = `${location.origin}/u/${state.me.username}`;
    const story = activeProfileStory(state.me);
    return `
      <header class="profile-page-header">
        <strong>@${esc(state.me.username)}</strong>
        <button class="icon-btn" data-action="open-settings" aria-label="Settings">${icon('menu')}</button>
      </header>
      <section class="profile-hero">
        <div class="profile-identity-layout">
          <div class="profile-avatar-column">
            <div class="profile-avatar-wrap">
              ${profilePictureElement(state.me, 'profile-avatar-btn', { own: true })}
              ${story ? `<button class="profile-story-view" data-action="view-story" data-story-id="${esc(story.id)}" aria-label="View your story">${icon('play')}</button>` : ''}
              <button class="profile-avatar-add" data-action="open-story-create" aria-label="Create story">+</button>
              ${state.notes.find((note) => (note.owner || note.user)?.id === state.me.id) ? `<button class="profile-note-bubble" data-action="open-note-composer">${esc(state.notes.find((note) => (note.owner || note.user)?.id === state.me.id)?.text || 'Your note')}</button>` : ''}
            </div>
            <button class="profile-link-icon" data-action="show-profile-link" data-link="${esc(profileUrl)}" aria-label="Share profile link">${icon('link')}</button>
          </div>
          <div class="profile-identity-copy">
            <h1>${esc(state.me.displayName)}</h1>
            <small>@${esc(state.me.username)}</small>
            <div class="profile-stat-grid">${renderProfileStats(state.me, 'open-social')}</div>
          </div>
        </div>
        <div class="profile-details">
          ${state.me.bio ? `<p class="profile-bio">${esc(state.me.bio)}</p>` : ''}
          ${state.me.website ? `<a href="${esc(state.me.website)}" target="_blank" rel="noopener">${esc(state.me.website)}</a>` : ''}
          <span class="profile-optional-meta">${state.me.age !== undefined && state.me.age !== null ? `${esc(state.me.age)} years old` : ''}${state.me.gender ? `${state.me.age !== undefined && state.me.age !== null ? ' · ' : ''}${esc(state.me.gender)}` : ''}</span>
        </div>
        <div class="profile-owner-actions">
          <button data-action="open-profile-edit">Edit profile</button>
          <button data-action="open-highlight-archive">${icon('archive')} Archive</button>
        </div>
      </section>
      ${renderHighlights(state.me, true)}
      ${renderRecommendations()}
      ${renderProfileMedia(state.me, true)}
    `;
  }

  function profilePostKey(user, tab) {
    return `${user?.id || user?.username || 'unknown'}:${tab || 'posts'}`;
  }

  function profilePostsFor(user, tab) {
    return state.profilePosts.get(profilePostKey(user, tab)) || [];
  }

  function renderProfileMedia(user, own = false) {
    const tab = own ? state.profileMediaTab : state.searchProfileMediaTab;
    const posts = profilePostsFor(user, tab);
    const labels = [
      ['posts', 'Photos and videos', 'grid'],
      ['saved', 'Saved posts', 'bookmark'],
      ['reposts', 'Reposts', 'repost'],
      ['tagged', 'Tagged photos', 'tagged']
    ];
    return `
      <section class="profile-media-section" data-profile-id="${esc(user.id)}" data-own="${own}">
        <div class="profile-media-tabs" role="tablist">
          ${labels.map(([value, label, iconName]) => `<button class="${tab === value ? 'active' : ''}" data-action="set-profile-media-tab" data-tab="${value}" data-user-id="${esc(user.id)}" data-own="${own}" role="tab" aria-selected="${tab === value}" aria-label="${label}" ${!own && value === 'saved' ? 'title="Saved posts are private"' : ''}>${icon(iconName)}</button>`).join('')}
        </div>
        ${!own && tab === 'saved'
          ? `<div class="profile-media-empty">${icon('lock')}<strong>Saved posts are private</strong><small>Only ${esc(user.displayName)} can see this collection.</small></div>`
          : posts.length
            ? `<div class="profile-post-grid">${posts.map((post) => `<button data-action="open-profile-post" data-post-id="${esc(post.id)}">${renderPostMedia(post, { grid: true })}</button>`).join('')}</div>`
            : `<div class="profile-media-empty">${icon(tab === 'saved' ? 'bookmark' : tab === 'reposts' ? 'repost' : tab === 'tagged' ? 'tagged' : 'grid')}<strong>No ${tab === 'posts' ? 'posts' : tab} yet</strong><small>${own && tab === 'posts' ? 'Photos and videos you share will appear here.' : 'Nothing to show in this tab.'}</small></div>`}
      </section>
    `;
  }

  function updateProfileMediaSection(user, own = false) {
    const escapedId = window.CSS?.escape ? CSS.escape(String(user?.id || '')) : String(user?.id || '').replace(/"/g, '\\"');
    const current = document.querySelector(`.profile-media-section[data-profile-id="${escapedId}"][data-own="${own}"]`);
    if (!current) return false;
    const scrollHost = current.closest('.side-content');
    const scrollTop = scrollHost?.scrollTop ?? 0;
    const template = document.createElement('template');
    template.innerHTML = renderProfileMedia(user, own).trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    if (scrollHost) scrollHost.scrollTop = scrollTop;
    return true;
  }

  function renderProfileSocialPage() {
    const view = state.profileSocialView === 'following' ? 'following' : 'followers';
    const users = view === 'followers' ? (state.me.followers || []) : (state.me.following || []);
    const empty = view === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
    return `
      <section class="social-page">
        <header class="page-header">
          <button class="icon-btn" data-action="close-social" aria-label="Back">${icon('back')}</button>
          <h2>@${esc(state.me.username)}</h2>
        </header>
        <div class="segmented social-switch is-${view} ${state.socialTransition ? `social-switch-${state.socialTransition}` : ''}">
          <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-social" data-social="followers"><strong>${state.me.followerCount ?? 0}</strong> Followers</button>
          <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-social" data-social="following"><strong>${state.me.followingCount ?? 0}</strong> Following</button>
        </div>
        <div class="social-user-list ${state.socialTransition ? `social-list-slide social-list-${state.socialTransition}` : ''}">
          ${users.length ? users.map((item) => renderSocialAccountRow(item, `
            <button class="mini-btn account-action social-row-action" data-action="${view === 'followers' ? 'remove-follower' : 'unfollow-user'}" data-user-id="${esc(item.id)}">${view === 'followers' ? 'Remove' : 'Unfollow'}</button>
          `)).join('') : `<div class="empty-state">${empty}</div>`}
        </div>
      </section>
    `;
  }

  function renderRecommendations() {
    const recommendations = mixedProfileSuggestions(state.me);
    return `
      <section class="suggestion-section">
        <div class="suggestion-heading-row">
          <button class="suggestion-toggle" data-action="toggle-recommendations" aria-expanded="${state.recommendationsOpen}">
            <span><strong>Suggested for you</strong><small>Accounts you may know</small></span>
            <span class="chevron ${state.recommendationsOpen ? 'open' : ''}">${icon('chevron')}</span>
          </button>
          <button class="suggestion-see-all" data-action="recommendation-see-all">See all</button>
        </div>
        ${state.recommendationsOpen ? `
          <div class="recommendation-row" data-scroll-memory="profile-suggestions:${esc(state.me?.id || 'me')}">
            ${recommendations.length
              ? recommendations.map((user) => renderRecommendationCard(user, { dismissible: true })).join('')
              : '<p class="hint">Friends of friends will appear here after you add more people.</p>'}
          </div>
        ` : ''}
      </section>
    `;
  }

  function visibleRecommendations() {
    const hidden = new Set(state.hiddenRecommendations || []);
    return state.recommendations.filter((user) => !hidden.has(user.id) && user.recommendable !== false);
  }

  function recentProfileSnapshot(user) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio || '',
      avatar: user.avatar || null,
      url: user.url || profilePath(user.username),
      socialPublic: user.socialPublic !== false,
      avatarViewable: user.avatarViewable !== false,
      recommendable: user.recommendable !== false,
      isContact: Boolean(user.isContact),
      isFollowing: Boolean(user.isFollowing),
      followsViewer: Boolean(user.followsViewer),
      hasBlocked: Boolean(user.hasBlocked),
      blockedBy: Boolean(user.blockedBy)
    };
  }

  function rememberViewedProfile(user) {
    if (!user?.id || user.id === state.me?.id) return;
    state.recentProfiles = [
      recentProfileSnapshot(user),
      ...(state.recentProfiles || []).filter((item) => item?.id !== user.id)
    ].slice(0, 16);
    localStorage.setItem('recentProfiles', JSON.stringify(state.recentProfiles));
  }

  function mixedProfileSuggestions(profile) {
    const hidden = new Set(state.hiddenRecommendations || []);
    const seen = new Set([state.me?.id, profile?.id].filter(Boolean));
    const sources = [
      profile?.followers || [],
      profile?.following || [],
      state.recentProfiles || [],
      state.recommendations || []
    ];
    const mixed = [];
    const longest = Math.max(0, ...sources.map((source) => source.length));
    for (let index = 0; index < longest && mixed.length < 12; index += 1) {
      for (const source of sources) {
        const candidate = source[index];
        if (!candidate?.id || seen.has(candidate.id) || hidden.has(candidate.id)) continue;
        if (candidate.recommendable === false) continue;
        if (candidate.hasBlocked || candidate.blockedBy) continue;
        seen.add(candidate.id);
        mixed.push(userById(candidate.id) || candidate);
        if (mixed.length >= 12) break;
      }
    }
    return mixed;
  }

  function renderProfileSuggestions(profile) {
    const suggestions = mixedProfileSuggestions(profile);
    if (!suggestions.length) return '';
    return `
      <section class="profile-suggestion-section">
        <div class="section-heading"><h2>Suggested for you</h2><small>Related accounts</small></div>
        <div class="recommendation-row profile-recommendation-row" data-scroll-memory="profile-network:${esc(profile?.username || state.me?.username || 'profile')}">
          ${suggestions.map((user) => renderRecommendationCard(user, { dismissible: true })).join('')}
        </div>
      </section>
    `;
  }

  function storyFilterCss(filter, edits = {}) {
    const preset = {
      normal: '',
      oslo: 'brightness(1.06) contrast(0.96) saturate(0.88) sepia(0.06)',
      paris: 'brightness(1.08) contrast(0.9) saturate(0.78) sepia(0.08)',
      lagos: 'brightness(1.04) contrast(1.04) saturate(1.24) sepia(0.16) hue-rotate(-7deg)',
      melbourne: 'brightness(1.02) contrast(1.08) saturate(0.84) sepia(0.1)',
      jakarta: 'brightness(1.02) contrast(1.02) saturate(1.3) sepia(0.12) hue-rotate(-9deg)',
      abu_dhabi: 'brightness(0.98) contrast(1.12) saturate(0.92) sepia(0.2)',
      buenos_aires: 'brightness(1.05) contrast(0.96) saturate(1.18)',
      new_york: 'brightness(0.94) contrast(1.2) saturate(0.72)',
      jaipur: 'brightness(1.03) contrast(1.06) saturate(1.36) sepia(0.22) hue-rotate(-10deg)',
      cairo: 'brightness(1.08) contrast(0.94) saturate(0.82) sepia(0.17)',
      tokyo: 'brightness(1.02) contrast(1.08) saturate(0.9) hue-rotate(7deg)',
      rio: 'brightness(1.02) contrast(1.08) saturate(1.48)',
      warm: 'sepia(0.22) saturate(1.22) hue-rotate(-8deg)',
      cool: 'saturate(1.15) hue-rotate(12deg)',
      mono: 'grayscale(1)',
      noir: 'grayscale(1) contrast(1.28) brightness(0.82)'
    }[filter] || '';
    const brightness = clamp(Number(edits.brightness ?? 100), 60, 140) / 100;
    const contrast = clamp(Number(edits.contrast ?? 100), 60, 140) / 100;
    const saturation = clamp(Number(edits.saturation ?? 100), 0, 180) / 100;
    const warmth = clamp(Number(edits.warmth ?? 0), -50, 50);
    const fade = clamp(Number(edits.fade ?? 0), 0, 60);
    const blur = clamp(Number(edits.blur ?? 0), 0, 8);
    const adjustments = [
      `brightness(${brightness})`,
      `contrast(${contrast * (1 - fade / 180)})`,
      `saturate(${saturation})`,
      warmth ? `sepia(${Math.abs(warmth) / 240}) hue-rotate(${warmth * -0.28}deg)` : '',
      fade ? `opacity(${1 - fade / 240})` : '',
      blur ? `blur(${blur}px)` : ''
    ].filter(Boolean).join(' ');
    return `${preset} ${adjustments}`.trim() || 'none';
  }

  function storyMediaTransformCss(edits = {}) {
    const offsetX = clamp(Number(edits.mediaOffsetX ?? 0), -40, 40);
    const offsetY = clamp(Number(edits.mediaOffsetY ?? 0), -40, 40);
    const zoom = clamp(Number(edits.zoom ?? 1), 1, 3);
    const rotation = [0, 90, 180, 270].includes(Number(edits.mediaRotation)) ? Number(edits.mediaRotation) : 0;
    return `translate(${offsetX}%,${offsetY}%) rotate(${rotation}deg) scale(${zoom})`;
  }

  function storyMediaFit(edits = {}) {
    return edits.mediaFit === 'contain' ? 'contain' : 'cover';
  }

  function storyTextFontCss(font) {
    return {
      serif: 'Georgia, serif',
      mono: '"SFMono-Regular", Consolas, monospace',
      script: '"Brush Script MT", "Segoe Script", cursive',
      strong: '"Arial Black", Arial, sans-serif',
      rounded: '"Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
      condensed: '"Arial Narrow", "Roboto Condensed", sans-serif',
      journal: '"Segoe Print", "Bradley Hand", cursive',
      editor: 'Rockwell, "American Typewriter", Georgia, serif',
      deco: '"Century Gothic", "Trebuchet MS", sans-serif',
      elegant: 'Didot, "Bodoni MT", "Times New Roman", serif',
      poster: '"Rockwell Extra Bold", Rockwell, Georgia, serif',
      literature: 'Palatino, "Book Antiqua", Georgia, serif',
      directional: '"Trebuchet MS", Arial, sans-serif',
      meme: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      system: 'Inter, system-ui, sans-serif'
    }[font] || 'Inter, system-ui, sans-serif';
  }

  function storyTextStyle(edits = {}) {
    const x = clamp(Number(edits.textX || 50), 5, 95);
    const y = clamp(Number(edits.textY || 50), 5, 95);
    const rotation = clamp(Number(edits.textRotation || 0), -180, 180);
    const color = /^#[0-9a-f]{6}$/i.test(String(edits.textColor || '')) ? edits.textColor : '#ffffff';
    const size = clamp(Number(edits.textSize || 44), 22, 96);
    const align = ['left', 'center', 'right'].includes(edits.textAlign) ? edits.textAlign : 'center';
    const bg = /^#[0-9a-f]{6}$/i.test(String(edits.textBgColor || '')) ? edits.textBgColor : '#000000';
    const bgAlpha = edits.textBgEnabled ? '0.58' : '0';
    const frame = edits.textFrame ? '1.5px solid rgba(255,255,255,.82)' : '1.5px solid transparent';
    return `left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${rotation}deg);color:${color};font-family:${storyTextFontCss(edits.textFont)};font-size:${size}px;text-align:${align};background:${hexToRgba(bg, bgAlpha)};border:${frame};`;
  }

  function storyTextClass(edits = {}) {
    const effect = ['none', 'shadow', 'glow', 'neon', 'sparkle', 'shimmer', 'pixel', 'outline', 'lift', 'rainbow'].includes(edits.textEffect) ? edits.textEffect : 'shadow';
    const animation = ['none', 'fade', 'rise', 'pop', 'type', 'bounce', 'flicker', 'pulse'].includes(edits.textAnimation) ? edits.textAnimation : 'none';
    return `text-effect-${effect} text-anim-${animation}`;
  }

  function storyTextColumns(value = '') {
    const longestLine = String(value).split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.length), 0);
    return clamp(longestLine || 12, 4, 28);
  }

  function hexToRgba(hex, alpha) {
    const value = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!value) return `rgba(0,0,0,${alpha})`;
    const int = parseInt(value[1], 16);
    return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
  }

  async function sampleStoryColor(kind) {
    if (!state.storyEditor) return;
    if (!window.EyeDropper) {
      document.getElementById(kind === 'draw' ? 'story-draw-custom-color' : 'story-text-custom-color')?.click();
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      const color = /^#[0-9a-f]{6}$/i.test(result.sRGBHex || '') ? result.sRGBHex : '#ffffff';
      if (kind === 'draw') {
        state.storyEditor.drawColor = color;
        document.querySelectorAll('[data-action="story-draw-color"]').forEach((button) => button.classList.toggle('active', button.dataset.color === color));
      } else {
        state.storyEditor.textColor = color;
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
    }
  }

  function storyTextFontOptions() {
    return [
      ['system', 'Modern'],
      ['serif', 'Classic'],
      ['condensed', 'Squeeze'],
      ['script', 'Signature'],
      ['journal', 'Journal'],
      ['editor', 'Editor'],
      ['deco', 'Deco'],
      ['strong', 'Strong'],
      ['elegant', 'Elegant'],
      ['rounded', 'Bubble'],
      ['poster', 'Poster'],
      ['literature', 'Literature'],
      ['mono', 'Typewriter'],
      ['directional', 'Directional'],
      ['meme', 'Meme']
    ];
  }

  function storyTextEffectOptions() {
    return [
      ['none', 'Plain'],
      ['shadow', 'Shadow'],
      ['glow', 'Glow'],
      ['neon', 'Neon'],
      ['sparkle', 'Sparkle'],
      ['shimmer', 'Shimmer'],
      ['pixel', 'Pixel'],
      ['outline', 'Outline'],
      ['lift', 'Lift'],
      ['rainbow', 'Color']
    ];
  }

  function storyTextAnimationOptions() {
    return [
      ['none', 'Still'],
      ['fade', 'Fade'],
      ['rise', 'Rise'],
      ['pop', 'Pop'],
      ['type', 'Type'],
      ['bounce', 'Jump'],
      ['flicker', 'Flicker'],
      ['pulse', 'Pulse']
    ];
  }

  function stickerCreatorDefaults() {
    return {
      text: '',
      panel: 'font',
      textFont: 'rounded',
      textColor: '#ffffff',
      textSize: 64,
      textAlign: 'center',
      textEffect: 'shadow',
      textAnimation: 'none',
      textBgEnabled: false,
      textBgColor: '#111111',
      textFrame: false
    };
  }

  function stickerTextColors() {
    return ['#ffffff', '#111111', '#ff304f', '#ff4fa3', '#ff8a00', '#ffd166', '#2f8b83', '#285f88', '#6c63ff', '#9f7cff'];
  }

  function renderStickerCreatorChoices(editor) {
    const panel = ['font', 'color', 'animation', 'effect'].includes(editor.panel) ? editor.panel : 'font';
    if (panel === 'font') {
      return storyTextFontOptions().map(([font, label]) => `
        <button class="story-font-choice ${editor.textFont === font ? 'active' : ''}" data-action="sticker-creator-font" data-font="${font}" aria-label="${esc(label)} font">
          <span style="font-family:${esc(storyTextFontCss(font))}">${esc(label)}</span>
        </button>
      `).join('');
    }
    if (panel === 'color') {
      return `
        ${stickerTextColors().map((color) => `<button class="story-color-choice ${editor.textColor === color ? 'active' : ''}" style="--swatch:${color}" data-action="sticker-creator-color" data-color="${color}" aria-label="Text color"></button>`).join('')}
        <label class="story-color-choice story-custom-color" title="Custom text color" aria-label="Custom text color"><input id="sticker-creator-color" type="color" value="${esc(editor.textColor)}"></label>
        <label class="sticker-bg-color-choice" title="Background color"><span>BG</span><input id="sticker-creator-bg-color" type="color" value="${esc(editor.textBgColor)}"></label>
      `;
    }
    if (panel === 'effect') {
      return storyTextEffectOptions().map(([effect, label]) => `
        <button class="story-effect-choice ${(editor.textEffect || 'shadow') === effect ? 'active' : ''}" data-action="sticker-creator-effect" data-effect="${effect}">
          <span class="story-text-option-preview text-effect-${effect}" style="color:${esc(editor.textColor)}">Aa</span><small>${esc(label)}</small>
        </button>
      `).join('');
    }
    return storyTextAnimationOptions().map(([animation, label]) => `
      <button class="story-animation-choice ${(editor.textAnimation || 'none') === animation ? 'active' : ''}" data-action="sticker-creator-animation" data-animation="${animation}">
        <span class="story-text-option-preview preview-${animation}">Aa</span><small>${esc(label)}</small>
      </button>
    `).join('');
  }

  function renderStickerCreator() {
    const editor = state.stickerCreator;
    if (!editor) return '';
    const alignIcon = editor.textAlign === 'left' ? 'alignLeft' : editor.textAlign === 'right' ? 'alignRight' : 'alignCenter';
    const background = editor.textBgEnabled ? hexToRgba(editor.textBgColor, 0.72) : 'transparent';
    const frame = editor.textFrame ? '2px solid rgba(255,255,255,.9)' : '2px solid transparent';
    return `
      <div class="sticker-creator-page" data-action="close-sticker-creator">
        <section class="sticker-creator-shell" data-stop-close>
          <header class="sticker-creator-head">
            <button class="icon-btn" data-action="close-sticker-creator" aria-label="Close">${icon('x')}</button>
            <strong>Create sticker</strong>
            <button class="sticker-save-btn" data-action="save-text-sticker" ${editor.text.trim() ? '' : 'disabled'}>Save</button>
          </header>
          <div class="sticker-creator-stage">
            <span class="sticker-live-text ${esc(storyTextClass(editor))}" style="color:${esc(editor.textColor)};font-family:${esc(storyTextFontCss(editor.textFont))};font-size:${esc(editor.textSize)}px;text-align:${esc(editor.textAlign)};background:${esc(background)};border:${esc(frame)}">${esc(editor.text || 'Type your sticker')}</span>
          </div>
          <div class="sticker-creator-input-row">
            <input id="sticker-creator-text" maxlength="80" value="${esc(editor.text)}" placeholder="Type your sticker" autocomplete="off">
            <label class="sticker-size-control" aria-label="Sticker text size">${icon('text')}<input id="sticker-creator-size" type="range" min="32" max="96" step="1" value="${esc(editor.textSize)}"></label>
          </div>
          <div class="sticker-creator-choice-rail story-text-choice-rail story-${esc(editor.panel)}-choices">
            ${renderStickerCreatorChoices(editor)}
          </div>
          <div class="sticker-creator-format-bar">
            <button class="${editor.panel === 'font' ? 'active' : ''}" data-action="sticker-creator-panel" data-panel="font" aria-label="Fonts"><span class="story-aa">Aa</span></button>
            <button class="${editor.panel === 'color' ? 'active' : ''}" data-action="sticker-creator-panel" data-panel="color" aria-label="Colors"><span class="story-color-wheel"></span></button>
            <button class="${editor.panel === 'animation' ? 'active' : ''}" data-action="sticker-creator-panel" data-panel="animation" aria-label="Animations">${icon('play')}</button>
            <button class="${editor.panel === 'effect' ? 'active' : ''}" data-action="sticker-creator-panel" data-panel="effect" aria-label="Effects">${icon('sparkle')}</button>
            <button data-action="cycle-sticker-align" aria-label="Change alignment">${icon(alignIcon)}</button>
            <button class="${editor.textBgEnabled ? 'active' : ''}" data-action="toggle-sticker-bg" aria-label="Text background"><span class="story-aa">A</span></button>
            <button class="${editor.textFrame ? 'active' : ''}" data-action="toggle-sticker-frame" aria-label="Text frame"><span class="story-aa story-aa-frame">A</span></button>
          </div>
        </section>
      </div>
    `;
  }

  function xmlEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[char]));
  }

  function stickerTextLines(value, size) {
    const maxChars = Math.max(6, Math.floor(900 / Math.max(32, Number(size || 64))));
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const parts = word.length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, 'g')) : [word];
      for (const part of parts) {
        const candidate = line ? `${line} ${part}` : part;
        if (candidate.length > maxChars && line) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
      }
    }
    if (line) lines.push(line);
    return (lines.length ? lines : ['Sticker']).slice(0, 4);
  }

  function buildTextStickerSvg(editor) {
    const size = clamp(Number(editor.textSize || 64), 32, 96);
    const lines = stickerTextLines(editor.text, size);
    const lineHeight = size * 1.08;
    const startY = 256 - ((lines.length - 1) * lineHeight) / 2;
    const align = ['left', 'center', 'right'].includes(editor.textAlign) ? editor.textAlign : 'center';
    const x = align === 'left' ? 64 : align === 'right' ? 448 : 256;
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    const color = chatColor(editor.textColor, '#ffffff');
    const background = chatColor(editor.textBgColor, '#111111');
    const effect = storyTextEffectOptions().some(([value]) => value === editor.textEffect) ? editor.textEffect : 'shadow';
    const animation = storyTextAnimationOptions().some(([value]) => value === editor.textAnimation) ? editor.textAnimation : 'none';
    const fill = effect === 'rainbow' ? 'url(#rainbow)' : effect === 'shimmer' ? 'url(#shimmer)' : color;
    const effectStyle = {
      none: '',
      shadow: 'filter:drop-shadow(0 10px 12px rgba(0,0,0,.72));',
      glow: 'filter:url(#glow);',
      neon: 'filter:url(#neon);',
      sparkle: 'filter:url(#sparkle);',
      shimmer: 'filter:drop-shadow(0 6px 10px rgba(0,0,0,.5));',
      pixel: 'font-family:monospace;filter:drop-shadow(5px 5px 0 #ff3c79) drop-shadow(-5px -2px 0 #34d3ff);',
      outline: 'paint-order:stroke fill;stroke:#08090c;stroke-width:13px;stroke-linejoin:round;',
      lift: 'filter:drop-shadow(10px 13px 0 rgba(0,0,0,.68));',
      rainbow: 'filter:drop-shadow(0 6px 10px rgba(0,0,0,.45));'
    }[effect] || '';
    const animationClass = animation === 'none' ? '' : `anim-${animation}`;
    const tspans = lines.map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${xmlEsc(line)}</tspan>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="neon" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="a"/><feFlood flood-color="#ff5fb8"/><feComposite in2="a" operator="in"/><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="sparkle" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="rainbow"><stop stop-color="#ff304f"/><stop offset=".2" stop-color="#ff8a00"/><stop offset=".4" stop-color="#ffd166"/><stop offset=".6" stop-color="#2f8b83"/><stop offset=".8" stop-color="#285f88"/><stop offset="1" stop-color="#9f7cff"/></linearGradient>
        <linearGradient id="shimmer"><stop stop-color="#9ca3af"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".58" stop-color="#dbeafe"/><stop offset="1" stop-color="#9ca3af"><animate attributeName="offset" values=".7;1;.7" dur="1.5s" repeatCount="indefinite"/></stop></linearGradient>
      </defs>
      <style>
        .sticker-text{transform-box:fill-box;transform-origin:center;}
        .anim-fade{animation:a-fade 1.8s ease-in-out infinite}.anim-rise{animation:a-rise 1.8s ease-in-out infinite}.anim-pop{animation:a-pop 1.35s ease-in-out infinite}.anim-type{animation:a-type 1.8s steps(8,end) infinite}.anim-bounce{animation:a-bounce 1.2s ease-in-out infinite}.anim-flicker{animation:a-flicker 1.45s linear infinite}.anim-pulse{animation:a-pulse 1.3s ease-in-out infinite}
        @keyframes a-fade{0%,100%{opacity:.35}50%{opacity:1}}@keyframes a-rise{0%,100%{transform:translateY(18px);opacity:.55}50%{transform:translateY(-8px);opacity:1}}@keyframes a-pop{0%,100%{transform:scale(.86)}50%{transform:scale(1.08)}}@keyframes a-type{0%,18%{opacity:0;letter-spacing:18px}55%,100%{opacity:1;letter-spacing:0}}@keyframes a-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(-20px)}65%{transform:translateY(5px)}}@keyframes a-flicker{0%,18%,22%,62%,66%,100%{opacity:1}20%,64%{opacity:.18}}@keyframes a-pulse{0%,100%{transform:scale(.94)}50%{transform:scale(1.06)}}
      </style>
      ${editor.textBgEnabled ? `<rect x="30" y="102" width="452" height="308" rx="52" fill="${background}" fill-opacity=".76"/>` : ''}
      ${editor.textFrame ? '<rect x="24" y="96" width="464" height="320" rx="58" fill="none" stroke="#ffffff" stroke-opacity=".88" stroke-width="7"/>' : ''}
      <text class="sticker-text ${animationClass}" text-anchor="${anchor}" dominant-baseline="middle" fill="${fill}" font-family="${xmlEsc(storyTextFontCss(editor.textFont))}" font-size="${size}" font-weight="800" style="${effectStyle}">${tspans}</text>
      ${effect === 'sparkle' ? '<g fill="#fff"><circle cx="92" cy="142" r="8"/><circle cx="426" cy="172" r="6"/><circle cx="402" cy="376" r="9"/><circle cx="116" cy="382" r="5"/></g>' : ''}
    </svg>`;
  }

  function storyTextToolPanel(editor) {
    const colors = ['#ffffff', '#111111', '#ff304f', '#ff4fa3', '#ff8a00', '#ffd166', '#2f8b83', '#285f88', '#6c63ff', '#9f7cff'];
    const panel = ['font', 'color', 'animation', 'effect'].includes(editor.textPanel) ? editor.textPanel : 'font';
    const alignIcon = editor.textAlign === 'left' ? 'alignLeft' : editor.textAlign === 'right' ? 'alignRight' : 'alignCenter';
    let choices = '';
    if (panel === 'font') {
      choices = storyTextFontOptions().map(([font, label]) => `
        <button class="story-font-choice ${editor.textFont === font ? 'active' : ''}" data-action="story-font" data-font="${font}" aria-label="${esc(label)} font">
          <span style="font-family:${esc(storyTextFontCss(font))}">${esc(label)}</span>
        </button>
      `).join('');
    }
    if (panel === 'color') {
      choices = `
        <button class="story-color-sampler" data-action="story-text-eyedropper" aria-label="Sample a color">${icon('eyedropper')}</button>
        ${colors.map((color) => `<button class="story-color-choice ${editor.textColor === color ? 'active' : ''}" style="--swatch:${color}" data-action="story-color" data-color="${color}" aria-label="Text color"></button>`).join('')}
        <label class="story-color-choice story-custom-color" title="Custom color" aria-label="Custom text color">
          <input id="story-text-custom-color" type="color" value="${esc(editor.textColor || '#ffffff')}">
        </label>
      `;
    }
    if (panel === 'effect') {
      choices = storyTextEffectOptions().map(([effect, label]) => `
        <button class="story-effect-choice ${(editor.textEffect || 'shadow') === effect ? 'active' : ''}" data-action="story-text-effect" data-effect="${effect}">
          <span class="story-text-option-preview text-effect-${effect}" style="color:${esc(editor.textColor || '#ffffff')}">Aa</span>
          <small>${esc(label)}</small>
        </button>
      `).join('');
    }
    if (panel === 'animation') {
      choices = storyTextAnimationOptions().map(([animation, label]) => `
        <button class="story-animation-choice ${(editor.textAnimation || 'none') === animation ? 'active' : ''}" data-action="story-text-animation" data-animation="${animation}">
          <span class="story-text-option-preview preview-${animation}">Aa</span>
          <small>${esc(label)}</small>
        </button>
      `).join('');
    }
    return `
      <section class="story-text-composer" data-panel="${panel}">
        <div class="story-text-choice-rail story-${panel}-choices" aria-label="${esc(panel)} options">
          ${choices}
        </div>
        <div class="story-text-format-bar" aria-label="Text formatting">
          <button class="${panel === 'font' ? 'active' : ''}" data-action="story-text-panel" data-panel="font" aria-label="Fonts"><span class="story-aa">Aa</span></button>
          <button class="${panel === 'color' ? 'active' : ''}" data-action="story-text-panel" data-panel="color" aria-label="Text color"><span class="story-color-wheel"></span></button>
          <button class="${panel === 'animation' ? 'active' : ''}" data-action="story-text-panel" data-panel="animation" aria-label="Text animation">${icon('play')}</button>
          <button class="${panel === 'effect' ? 'active' : ''}" data-action="story-text-panel" data-panel="effect" aria-label="Text effects">${icon('sparkle')}</button>
          <button data-action="cycle-story-text-align" aria-label="Change alignment">${icon(alignIcon)}</button>
          <button class="${editor.textBgEnabled ? 'active' : ''}" data-action="story-text-bg" aria-label="Text background"><span class="story-aa">A</span></button>
          <button class="${editor.textFrame ? 'active' : ''}" data-action="story-text-frame" aria-label="Text outline"><span class="story-aa story-aa-frame">A</span></button>
        </div>
      </section>
    `;
  }

  function storyBackgroundPresets() {
    return [
      ['midnight', 'Midnight', '#0b1020', '#111827'],
      ['dusk', 'Dusk', '#54205f', '#f05a7e'],
      ['ocean', 'Ocean', '#063970', '#0fa3b1'],
      ['aurora', 'Aurora', '#064e3b', '#397db4'],
      ['sunset', 'Sunset', '#9f1239', '#f59e0b'],
      ['violet', 'Violet', '#312e81', '#a855f7'],
      ['graphite', 'Graphite', '#111111', '#4b5563'],
      ['paper', 'Paper', '#d8d4cb', '#f8fafc'],
      ['rose', 'Rose', '#831843', '#fb7185'],
      ['electric', 'Electric', '#1d4ed8', '#ec4899']
    ];
  }

  function storyBackgroundToolPanel(editor) {
    if (!editor.isBlankStory) return '';
    return `
      <div class="story-background-carousel" aria-label="Story background">
        ${storyBackgroundPresets().map(([preset, label, from, to]) => `
          <button class="${editor.backgroundPreset === preset ? 'active' : ''}" style="--bg-from:${from};--bg-to:${to}" data-action="story-background" data-background="${preset}" aria-label="${esc(label)}">
            <span></span><small>${esc(label)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  function storyFilterToolPanel(editor) {
    const filters = [
      ['normal', 'Normal'], ['oslo', 'Oslo'], ['paris', 'Paris'], ['lagos', 'Lagos'],
      ['melbourne', 'Melbourne'], ['jakarta', 'Jakarta'], ['abu_dhabi', 'Abu Dhabi'],
      ['buenos_aires', 'Buenos Aires'], ['new_york', 'New York'], ['jaipur', 'Jaipur'],
      ['cairo', 'Cairo'], ['tokyo', 'Tokyo'], ['rio', 'Rio'], ['mono', 'Mono'], ['noir', 'Noir']
    ];
    const overlayEffects = [
      ['none', 'None'], ['grain', 'Grain'], ['dream', 'Dream'], ['vhs', 'VHS'],
      ['spotlight', 'Light'], ['sparkle', 'Sparkle'], ['chroma', 'Chroma']
    ];
    const adjustments = [
      ['brightness', 'Brightness', 60, 140, 100],
      ['contrast', 'Contrast', 60, 140, 100],
      ['saturation', 'Saturation', 0, 180, 100],
      ['warmth', 'Warmth', -50, 50, 0],
      ['fade', 'Fade', 0, 60, 0],
      ['vignette', 'Vignette', 0, 80, 0],
      ['blur', 'Blur', 0, 8, 0]
    ];
    const availablePanels = editor.isBlankStory ? ['filters', 'effects', 'adjust', 'background'] : ['filters', 'effects', 'adjust'];
    const panel = availablePanels.includes(editor.filterPanel) ? editor.filterPanel : 'filters';
    const selectedAdjustment = adjustments.find(([name]) => name === editor.activeAdjustment) || adjustments[0];
    let panelContent = '';
    if (panel === 'filters') {
      panelContent = `
        <div class="story-filter-carousel" aria-label="Story filters">
          ${filters.map(([filter, label]) => `
            <button class="${editor.filter === filter ? 'active' : ''}" data-action="story-filter" data-filter="${filter}">
              <span style="background-image:url('${esc(editor.dataUrl)}');filter:${esc(storyFilterCss(filter))}"></span>
              <small>${esc(label)}</small>
            </button>
          `).join('')}
        </div>
      `;
    }
    if (panel === 'effects') {
      panelContent = `
        <div class="story-overlay-effects" aria-label="Story effects">
          ${overlayEffects.map(([effect, label]) => `
            <button class="${(editor.overlayEffect || 'none') === effect ? 'active' : ''}" data-action="story-overlay-effect" data-effect="${effect}">
              <span class="effect-preview effect-${effect}">${icon(effect === 'none' ? 'x' : 'sparkle')}</span>
              <small>${esc(label)}</small>
            </button>
          `).join('')}
        </div>
      `;
    }
    if (panel === 'background') panelContent = storyBackgroundToolPanel(editor);
    if (panel === 'adjust') {
      const [name, label, min, max, fallback] = selectedAdjustment;
      panelContent = `
        <div class="story-adjustment-picker" aria-label="Choose adjustment">
          ${adjustments.map(([adjustment, adjustmentLabel]) => `
            <button class="${name === adjustment ? 'active' : ''}" data-action="story-adjustment-select" data-adjustment="${adjustment}">${esc(adjustmentLabel)}</button>
          `).join('')}
        </div>
        <label class="story-adjustment-control">
          <span>${esc(label)} <output>${esc(editor[name] ?? fallback)}</output></span>
          <input type="range" min="${min}" max="${max}" step="1" value="${esc(editor[name] ?? fallback)}" data-story-adjust="${name}">
        </label>
      `;
    }
    return `
      <section class="story-effects-panel">
        <div class="story-editor-mode-switch" aria-label="Effects mode">
          ${availablePanels.map((mode) => `
            <button class="${panel === mode ? 'active' : ''}" data-action="story-filter-panel" data-panel="${mode}">${esc(mode === 'adjust' ? 'Adjust' : mode[0].toUpperCase() + mode.slice(1))}</button>
          `).join('')}
        </div>
        <div class="story-effect-browser">${panelContent}</div>
      </section>
    `;
  }

  function storyCropToolPanel(editor) {
    return `
      <label class="story-range">Crop zoom
        <input id="story-editor-zoom" type="range" min="1" max="3" step="0.01" value="${esc(editor.zoom || 1)}">
      </label>
      ${editor.isVideo ? `
        <div class="story-mini-grid">
          <label>Start
            <input id="story-trim-start" type="number" min="0" step="0.1" value="${esc(editor.trimStart || 0)}">
          </label>
          <label>End
            <input id="story-trim-end" type="number" min="0" step="0.1" value="${esc(editor.trimEnd || 0)}">
          </label>
        </div>
      ` : ''}
    `;
  }

  function formatClipTime(value) {
    const seconds = Math.max(0, Number(value || 0));
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
  }

  function storyVideoToolPanel(editor) {
    const duration = Math.max(0.1, Number(editor.videoDuration || editor.trimEnd || 1));
    const start = clamp(Number(editor.trimStart || 0), 0, duration);
    const end = clamp(Number(editor.trimEnd || Math.min(duration, 60)), start, duration);
    const current = clamp(Number(editor.videoCurrentTime ?? start), 0, duration);
    const startPercent = (start / duration) * 100;
    const endPercent = (end / duration) * 100;
    const playheadPercent = (current / duration) * 100;
    const frames = editor.videoThumbnails?.length
      ? editor.videoThumbnails
      : Array.from({ length: 8 }, () => '');
    return `
      <section class="story-video-editor" data-stop-close>
        <div class="story-video-time-row">
          <strong data-video-current>${esc(formatClipTime(current))}</strong>
          <span data-video-selection>${esc(formatClipTime(Math.max(0, end - start)))} selected</span>
          <small>${esc(formatClipTime(duration))}</small>
        </div>
        <div class="story-video-timeline" data-action="story-video-scrub" data-duration="${esc(duration)}" aria-label="Video timeline">
          <div class="story-video-filmstrip">
            ${frames.map((frame) => `<span class="story-video-frame" ${frame ? `style="background-image:url('${esc(frame)}')"` : ''}></span>`).join('')}
          </div>
          <span class="story-video-dim story-video-dim-start" style="width:${esc(startPercent)}%"></span>
          <span class="story-video-dim story-video-dim-end" style="left:${esc(endPercent)}%"></span>
          <span class="story-video-trim-window" style="left:${esc(startPercent)}%;width:${esc(Math.max(0, endPercent - startPercent))}%">
            <button type="button" class="story-video-trim-handle start" data-story-video-trim="start" aria-label="Trim start"></button>
            <button type="button" class="story-video-trim-handle end" data-story-video-trim="end" aria-label="Trim end"></button>
          </span>
          <span class="story-video-playhead" style="left:${esc(playheadPercent)}%"></span>
        </div>
        <div class="story-video-controls" aria-label="Video editing controls">
          <button type="button" data-action="story-video-play" aria-label="Play or pause">${icon(editor.videoPlaying ? 'pause' : 'play')}<small>${editor.videoPlaying ? 'Pause' : 'Play'}</small></button>
          <button type="button" class="${editor.videoMuted ? 'active' : ''}" data-action="story-video-mute" aria-label="Mute or unmute">${icon(editor.videoMuted ? 'mute' : 'volume')}<small>${editor.videoMuted ? 'Muted' : 'Sound'}</small></button>
          <button type="button" data-action="story-video-speed" aria-label="Playback speed"><strong>${esc(Number(editor.videoSpeed || 1))}x</strong><small>Speed</small></button>
          <button type="button" class="${storyMediaFit(editor) === 'contain' ? 'active' : ''}" data-action="story-video-fit" aria-label="Fit or fill video">${icon('fit')}<small>${storyMediaFit(editor) === 'contain' ? 'Fit' : 'Fill'}</small></button>
          <button type="button" data-action="story-video-rotate" aria-label="Rotate video">${icon('rotate')}<small>Rotate</small></button>
          <button type="button" data-action="story-video-reset-trim" aria-label="Reset trim">${icon('scissors')}<small>Reset</small></button>
        </div>
      </section>
    `;
  }

  function storySheetHeader(title) {
    return `<div class="story-sheet-grabber"></div><header><button data-action="story-sticker-back" aria-label="Back">${icon('back')}</button><strong>${esc(title)}</strong><span></span></header>`;
  }

  function storyMapEmbedUrl(location) {
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return '';
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    const bbox = [lon - 0.018, lat - 0.012, lon + 0.018, lat + 0.012].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  function storyLocationComposer(editor, type) {
    const selected = editor.selectedLocation;
    const weather = editor.weatherDraft;
    const mapUrl = storyMapEmbedUrl(selected);
    return `
      <section class="story-sticker-sheet story-location-sheet" data-stop-close>
        ${storySheetHeader(type === 'weather' ? 'Weather' : 'Location')}
        <div class="story-native-entry">
          ${icon('search')}
          <input id="story-location-query" value="${esc(editor.locationQuery || '')}" placeholder="Search city, address, or postcode" enterkeyhint="search" autocomplete="street-address" autofocus>
          <button data-action="story-current-location" data-location-type="${esc(type)}" aria-label="Use current location">${icon('location')}</button>
        </div>
        ${editor.locationSearching ? '<div class="story-inline-loading"><span class="spinner"></span></div>' : ''}
        <div class="story-location-results">
          ${(editor.locationResults || []).map((location) => `
            <button data-action="select-story-location" data-location-type="${esc(type)}" data-latitude="${esc(location.latitude)}" data-longitude="${esc(location.longitude)}" data-name="${esc(location.name)}" data-region="${esc(location.region || '')}">
              ${icon('location')}<span><strong>${esc(location.name)}</strong><small>${esc(location.region || '')}</small></span>
            </button>
          `).join('')}
        </div>
        ${selected ? `
          <div class="story-map-preview">
            ${mapUrl ? `<iframe title="Map of ${esc(selected.name)}" src="${esc(mapUrl)}" loading="lazy"></iframe>` : ''}
            <span><strong>${esc(selected.name)}</strong><small>${esc(selected.region || '')}</small></span>
          </div>
          ${type === 'weather' ? `
            <div class="story-weather-preview">
              ${editor.weatherLoading ? '<span class="spinner"></span>' : weather ? `<strong>${esc(weather.symbol || '')} ${Math.round(Number(weather.temperature || 0))}&deg;</strong><span>${esc(weather.condition || '')}</span><small>Feels like ${Math.round(Number(weather.apparentTemperature || weather.temperature || 0))}&deg; · ${esc(weather.provider || '')}</small>` : '<small>Choose a place to load current weather.</small>'}
            </div>
          ` : ''}
          <button class="story-sheet-done" data-action="add-selected-story-location" data-location-type="${esc(type)}" ${type === 'weather' && !weather ? 'disabled' : ''} aria-label="Add ${esc(type)}">${icon('check')}</button>
        ` : (type === 'location' && editor.locationQuery?.trim() ? `<button class="story-use-typed" data-action="use-typed-story-location">Use “${esc(editor.locationQuery.trim())}”</button>` : '')}
      </section>
    `;
  }

  function storyGifComposer(editor) {
    return `
      <section class="story-sticker-sheet story-gif-sheet" data-stop-close>
        ${storySheetHeader('GIFs')}
        <div class="story-native-entry">
          ${icon('search')}<input id="story-gif-search" value="${esc(editor.gifQuery || '')}" placeholder="Search approved GIFs" enterkeyhint="search" autocomplete="off">
          <button data-action="toggle-gif-submit" aria-label="Suggest a GIF">+</button>
        </div>
        ${state.gifLoading ? '<div class="story-inline-loading"><span class="spinner"></span></div>' : ''}
        ${editor.gifSubmitOpen ? `
          <div class="story-gif-submit">
            <input id="story-gif-title" value="${esc(editor.gifSubmissionTitle || '')}" maxlength="60" placeholder="GIF title">
            <input id="story-gif-tags" value="${esc(editor.gifSubmissionTags || '')}" maxlength="160" placeholder="Tags, separated by commas">
            <button data-action="story-gif-file-open">${icon('download')} Choose GIF</button>
            <input id="story-gif-input" type="file" accept="image/gif,image/webp" hidden>
            <small>${state.isModerator ? 'Your uploads are approved immediately.' : 'A moderator reviews submissions before everyone can use them.'}</small>
          </div>
        ` : ''}
        <div class="story-gif-grid">
          ${state.gifPool.length ? state.gifPool.map((gif) => `
            <button data-action="add-gif-sticker" data-gif-id="${esc(gif.id)}" data-gif-url="${esc(gif.file?.url || '')}" data-gif-title="${esc(gif.title || 'GIF')}" aria-label="Add ${esc(gif.title || 'GIF')}"><img src="${esc(gif.file?.url || '')}" alt=""></button>
          `).join('') : '<p>No approved GIFs match yet. Use + to suggest one.</p>'}
        </div>
      </section>
    `;
  }

  function storyQuizComposer(editor) {
    return `
      <section class="story-sticker-sheet" data-stop-close>
        ${storySheetHeader('Quiz')}
        <input class="story-native-text" id="story-quiz-question" value="${esc(editor.quizQuestion || '')}" maxlength="80" placeholder="Ask a question" autofocus>
        <div class="story-option-editor">
          <label><input id="story-quiz-a" value="${esc(editor.quizOptionA || '')}" maxlength="40" placeholder="First answer"><button data-action="story-quiz-correct" data-index="0" class="${Number(editor.quizCorrect || 0) === 0 ? 'active' : ''}" aria-label="Mark first answer correct">${icon('check')}</button></label>
          <label><input id="story-quiz-b" value="${esc(editor.quizOptionB || '')}" maxlength="40" placeholder="Second answer"><button data-action="story-quiz-correct" data-index="1" class="${Number(editor.quizCorrect || 0) === 1 ? 'active' : ''}" aria-label="Mark second answer correct">${icon('check')}</button></label>
        </div>
        <button class="story-sheet-done" data-action="finish-story-quiz" aria-label="Add quiz">${icon('check')}</button>
      </section>
    `;
  }

  function storyStickerToolPanel(editor) {
    const composer = editor.stickerComposer || '';
    if (composer === 'location' || composer === 'weather') return storyLocationComposer(editor, composer);
    if (composer === 'gif') return storyGifComposer(editor);
    if (composer === 'quiz') return storyQuizComposer(editor);
    if (composer === 'poll') {
      return `
        <section class="story-sticker-sheet" data-stop-close>
          ${storySheetHeader('Poll')}
          <input class="story-native-text" id="story-poll-question" value="${esc(editor.pollQuestion || '')}" maxlength="80" placeholder="Ask a question" autofocus>
          <div class="story-poll-options">
            <input id="story-poll-a" value="${esc(editor.pollOptionA || 'Yes')}" maxlength="40" aria-label="First poll option">
            <input id="story-poll-b" value="${esc(editor.pollOptionB || 'No')}" maxlength="40" aria-label="Second poll option">
          </div>
          <button class="story-sheet-done" data-action="finish-story-poll" aria-label="Add poll">${icon('check')}</button>
        </section>
      `;
    }
    if (composer === 'emoji_slider') {
      return `
        <section class="story-sticker-sheet" data-stop-close>
          ${storySheetHeader('Emoji slider')}
          <input class="story-native-text" id="story-slider-question" value="${esc(editor.sliderQuestion || '')}" maxlength="80" placeholder="Ask a question" autofocus>
          <label class="story-emoji-choice"><span>Emoji</span><input id="story-slider-emoji" value="${esc(editor.sliderEmoji || '\ud83d\ude0d')}" maxlength="8"></label>
          <div class="story-slider-preview"><span>${esc(editor.sliderEmoji || '\ud83d\ude0d')}</span><i></i></div>
          <button class="story-sheet-done" data-action="finish-story-slider" aria-label="Add slider">${icon('check')}</button>
        </section>
      `;
    }
    if (composer === 'countdown') {
      return `
        <section class="story-sticker-sheet" data-stop-close>
          ${storySheetHeader('Countdown')}
          <input class="story-native-text" id="story-countdown-title" value="${esc(editor.countdownTitle || '')}" maxlength="60" placeholder="Countdown name" autofocus>
          <input class="story-native-text" id="story-countdown-at" type="datetime-local" value="${esc(editor.countdownAt || '')}">
          <button class="story-sheet-done" data-action="finish-story-countdown" aria-label="Add countdown">${icon('check')}</button>
        </section>
      `;
    }
    if (composer) {
      const labels = { mention: 'Mention', question: 'Questions', hashtag: 'Hashtag', link: 'Link', add_yours: 'Add Yours', captions: 'Captions' };
      const placeholders = { mention: '@username', question: 'Ask me a question', hashtag: '#hashtag', link: 'https://example.com', add_yours: 'Write a prompt', captions: 'Add a caption' };
      return `
        <section class="story-sticker-sheet" data-stop-close>
          ${storySheetHeader(labels[composer] || 'Sticker')}
          <input class="story-native-text" id="story-sticker-text" value="${esc(editor.stickerDraft || '')}" maxlength="160" placeholder="${esc(placeholders[composer] || 'Write something')}" ${composer === 'link' ? 'inputmode="url" autocapitalize="none"' : ''} autofocus>
          <button class="story-sheet-done" data-action="commit-story-sticker" data-sticker-type="${esc(composer)}" aria-label="Add sticker">${icon('check')}</button>
        </section>
      `;
    }
    return `
      <section class="story-sticker-sheet" data-stop-close>
        <div class="story-sheet-grabber"></div>
        <header><span></span><strong>Stickers</strong><button data-action="finish-story-tool" aria-label="Close stickers">${icon('x')}</button></header>
        <label class="story-sticker-search">${icon('search')}<input id="story-sticker-search" value="${esc(editor.stickerSearch || '')}" placeholder="Search"></label>
        <div class="story-sticker-grid">
          <button data-search="add yours prompt chain" data-action="choose-story-sticker" data-sticker-type="add_yours"><span class="add-yours-sticker">ADD YOURS</span></button>
          <button data-search="mention tag user" data-action="choose-story-sticker" data-sticker-type="mention"><span class="mention-sticker">@MENTION</span></button>
          <button data-search="location place map" data-action="choose-story-sticker" data-sticker-type="location"><span class="location-sticker">${icon('location')} LOCATION</span></button>
          <button data-search="link website url" data-action="choose-story-sticker" data-sticker-type="link"><span class="link-sticker">${icon('link')} LINK</span></button>
          <button data-search="gif animated" data-action="choose-story-sticker" data-sticker-type="gif"><span class="gif-sticker">GIF</span></button>
          <button data-search="music audio song" data-action="story-tool" data-tool="audio"><span class="music-sticker">${icon('music')} MUSIC</span></button>
          <button data-search="poll vote" data-action="choose-story-sticker" data-sticker-type="poll"><span class="poll-choice">POLL</span></button>
          <button data-search="emoji slider reaction" data-action="choose-story-sticker" data-sticker-type="emoji_slider"><span class="emoji-slider-sticker">&#x1F60D; SLIDER</span></button>
          <button data-search="question ask" data-action="choose-story-sticker" data-sticker-type="question"><span class="question-sticker">QUESTIONS</span></button>
          <button data-search="quiz trivia answer" data-action="choose-story-sticker" data-sticker-type="quiz"><span class="quiz-sticker">QUIZ</span></button>
          <button data-search="hashtag tag" data-action="choose-story-sticker" data-sticker-type="hashtag"><span class="hashtag-sticker">#HASHTAG</span></button>
          <button data-search="countdown timer" data-action="choose-story-sticker" data-sticker-type="countdown"><span class="countdown-sticker">COUNTDOWN</span></button>
          <button data-search="time clock current" data-action="add-story-sticker" data-sticker-type="time" data-sticker-label="${esc(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()))}"><span class="time-sticker">${esc(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()))}</span></button>
          <button data-search="weather temperature" data-action="choose-story-sticker" data-sticker-type="weather"><span class="weather-sticker">&#x2600;&#xFE0F; WEATHER</span></button>
          <button data-search="captions subtitle words" data-action="choose-story-sticker" data-sticker-type="captions"><span class="captions-sticker">CC CAPTIONS</span></button>
          <button data-search="heart love emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x2764;&#xFE0F;"><span class="raw-emoji">&#x2764;&#xFE0F;</span></button>
          <button data-search="laugh emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x1F602;"><span class="raw-emoji">&#x1F602;</span></button>
          <button data-search="fire emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x1F525;"><span class="raw-emoji">&#x1F525;</span></button>
          <button data-search="sparkle emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x2728;"><span class="raw-emoji">&#x2728;</span></button>
        </div>
      </section>
    `;
  }

  function storyDrawBrushOptions() {
    return [
      ['pen', 'Pen', 'pen'],
      ['marker', 'Marker', 'text'],
      ['neon', 'Neon', 'sparkle'],
      ['chalk', 'Chalk', 'edit'],
      ['eraser', 'Eraser', 'eraser']
    ];
  }

  function storyDrawToolPanel(editor) {
    const colors = ['#ffffff', '#111111', '#ff304f', '#ff4fa3', '#ff8a00', '#ffd166', '#2f8b83', '#285f88', '#6c63ff'];
    return `
      <div class="story-swatch-row story-draw-colors" aria-label="Drawing color">
        <button class="story-draw-sampler" data-action="story-draw-eyedropper" aria-label="Sample a color">${icon('eyedropper')}</button>
        ${colors.map((color) => `<button class="${editor.drawColor === color ? 'active' : ''}" style="--swatch:${color}" data-action="story-draw-color" data-color="${color}" aria-label="Draw color"></button>`).join('')}
        <label class="story-custom-color" title="Custom color" aria-label="Custom drawing color">
          <input id="story-draw-custom-color" type="color" value="${esc(editor.drawColor || '#ffffff')}">
        </label>
      </div>
    `;
  }

  function storyAudioToolPanel(editor) {
    const duration = Math.max(1, Number(editor.audio?.duration || 30));
    const maxStart = Math.max(0, duration - 1);
    return `
      <section class="story-sticker-sheet story-audio-sheet" data-stop-close>
        <div class="story-sheet-grabber"></div>
        <header><span></span><strong>Music</strong><button data-action="finish-story-tool" aria-label="Close music">${icon('x')}</button></header>
        <button class="story-audio-pick" data-action="story-audio-open">${icon('music')}<span>${editor.audio ? 'Choose another track' : 'Choose audio from device'}</span></button>
        <input id="story-audio-input" type="file" accept="audio/*" hidden>
        ${editor.audio ? `
          <div class="story-audio-edit">
            ${renderStoryAudioPlayer(`${editor.audio.dataUrl}#t=${Number(editor.audioStart || 0)},${Number(editor.audioEnd || 30)}`, editor.audio.name || 'Audio', Math.max(1, Number(editor.audioEnd || 30) - Number(editor.audioStart || 0)), 'editor-audio')}
            <div class="story-audio-trim">
              <label><span>Start <output>${esc(formatClipTime(editor.audioStart || 0))}</output></span><input id="story-audio-start" type="range" min="0" max="${esc(maxStart)}" step="0.1" value="${esc(editor.audioStart || 0)}"></label>
              <label><span>End <output>${esc(formatClipTime(editor.audioEnd || Math.min(duration, 30)))}</output></span><input id="story-audio-end" type="range" min="1" max="${esc(duration)}" step="0.1" value="${esc(editor.audioEnd || Math.min(duration, 30))}"></label>
            </div>
            <small>The selected clip is limited to 30 seconds.</small>
          </div>
        ` : '<p class="story-sheet-empty">Choose a song or recording to add it to this story.</p>'}
      </section>
    `;
  }

  function storyMoreToolPanel(editor) {
    return `
      <section class="story-more-menu" data-stop-close>
        <button data-action="download-story-edit">${icon('download')} Save</button>
        <label>Zoom <input id="story-editor-zoom" type="range" min="1" max="3" step="0.01" value="${esc(editor.zoom || 1)}"></label>
      </section>
    `;
  }

  function storyToolPanel(editor) {
    if (editor.activeTool === 'video') return storyVideoToolPanel(editor);
    if (editor.activeTool === 'filter') return storyFilterToolPanel(editor);
    if (editor.activeTool === 'stickers') return storyStickerToolPanel(editor);
    if (editor.activeTool === 'draw') return storyDrawToolPanel(editor);
    if (editor.activeTool === 'audio') return storyAudioToolPanel(editor);
    if (editor.activeTool === 'more') return storyMoreToolPanel(editor);
    if (editor.activeTool === 'text') return storyTextToolPanel(editor);
    return '';
  }

  function storyToolSymbol(tool, iconName) {
    if (tool === 'text') return '<span class="story-aa">Aa</span>';
    return icon(iconName);
  }

  function renderStoryTopToolbar(editor, tools) {
    if (editor.textEditing) {
      return `
        <div class="story-top-bar story-mode-topbar story-text-topbar" data-stop-close>
          <button class="story-top-btn story-close-btn" data-action="close-story-editor" aria-label="Close">${icon('x')}</button>
          <button class="story-done-btn" data-action="finish-story-tool">Done</button>
        </div>
      `;
    }
    if (editor.activeTool === 'draw') {
      return `
        <div class="story-top-bar story-mode-topbar story-draw-topbar" data-stop-close>
          <button class="story-top-btn story-undo-btn" data-action="undo-story-draw" aria-label="Undo last stroke">${icon('undo')}</button>
          <div class="story-brush-row" aria-label="Drawing brush">
            ${storyDrawBrushOptions().map(([brush, label, iconName]) => `
              <button class="${(editor.drawBrush || 'pen') === brush ? 'active' : ''}" data-action="story-draw-brush" data-brush="${brush}" title="${label}" aria-label="${label}">${icon(iconName)}</button>
            `).join('')}
          </div>
          <button class="story-done-btn" data-action="finish-story-tool">Done</button>
        </div>
      `;
    }
    return `
      <div class="story-top-bar" data-stop-close>
        <button class="story-top-btn story-close-btn" data-action="close-story-editor" aria-label="Close">${icon('x')}</button>
        <div class="story-top-tools">
          ${tools.map(([tool, label, iconName]) => `
            <button class="story-top-btn ${editor.activeTool === tool ? 'active' : ''}" data-action="${tool === 'media' ? 'story-pick-media' : 'story-tool'}" data-tool="${tool}" title="${esc(label)}" aria-label="${esc(label)}">
              ${storyToolSymbol(tool, iconName)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderStoryFloatingTray(editor) {
    const tray = storyToolPanel(editor);
    if (!tray) return '';
    return `
      <div class="story-floating-tray story-${esc(editor.activeTool || 'text')}-tray" data-stop-close>
        ${tray}
      </div>
    `;
  }

  function renderStoryMedia(story, compact = false, viewer = false) {
    const edits = story.edits || {};
    const isVideo = story.file?.mime?.startsWith('video/');
    const renderOverlays = isVideo || Number(edits.compositionVersion || 0) >= 2;
    const style = `filter:${storyFilterCss(edits.filter, edits)}; transform:${storyMediaTransformCss(edits)}; object-fit:${storyMediaFit(edits)};`;
    const mediaUrl = isVideo && (edits.trimStart || edits.trimEnd)
      ? `${story.file.url}#t=${Number(edits.trimStart || 0)},${Number(edits.trimEnd || '') || ''}`
      : story.file.url;
    return `
      <div class="story-preview ${compact ? 'compact' : ''}">
        ${isVideo
          ? `<video src="${esc(mediaUrl)}" ${compact || edits.videoMuted ? 'muted' : ''} ${viewer ? 'autoplay' : compact ? '' : 'controls'} playsinline preload="metadata" style="${esc(style)}"></video>`
          : `<img src="${esc(mediaUrl)}" alt="" style="${esc(style)}">`}
        ${renderStoryEffectLayers(edits, compact)}
        ${renderOverlays ? renderStoryDrawings(edits) : ''}
        ${renderOverlays ? renderStoryStickers(edits, viewer ? story : null, compact) : ''}
        ${renderOverlays && edits.text ? `<span class="story-text-overlay ${esc(storyTextClass(edits))}" style="${esc(storyTextStyle(edits))}">${esc(edits.text)}</span>` : ''}
        ${renderOverlays && edits.pollQuestion ? renderPollSticker(edits, compact, viewer ? story : null) : ''}
        ${story.audio && !compact ? renderStoryAudio(story) : ''}
      </div>
    `;
  }

  function renderStoryEffectLayers(edits = {}, compact = false) {
    const effect = ['grain', 'dream', 'vhs', 'spotlight', 'sparkle', 'chroma'].includes(edits.overlayEffect) ? edits.overlayEffect : 'none';
    const vignette = clamp(Number(edits.vignette ?? 0), 0, 80) / 100;
    return `
      ${effect !== 'none' ? `<span class="story-media-effect story-media-effect-${effect} ${compact ? 'compact' : ''}"></span>` : ''}
      ${vignette ? `<span class="story-vignette ${compact ? 'compact' : ''}" style="opacity:${vignette}"></span>` : ''}
    `;
  }

  function storyStickerStyle(sticker = {}) {
    const x = clamp(Number(sticker.x || 50), 5, 95);
    const y = clamp(Number(sticker.y || 42), 5, 95);
    const rotation = clamp(Number(sticker.rotation || 0), -180, 180);
    const size = clamp(Number(sticker.size || 1), 0.7, 1.8);
    return `left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${rotation}deg) scale(${size});`;
  }

  function storyStickerResponse(story, stickerId) {
    return story?.stickerResponses?.[stickerId] || { count: 0, optionCounts: {}, myValue: null, average: null };
  }

  function storyStickerPercent(response, value) {
    const count = Math.max(0, Number(response?.count || 0));
    if (!count) return 0;
    return Math.round((Number(response?.optionCounts?.[String(value)] || 0) / count) * 100);
  }

  function renderStoryStickerContent(sticker, story = null, editor = false) {
    const data = sticker.data || {};
    const response = storyStickerResponse(story, sticker.id);
    const type = sticker.type || 'emoji';
    if (type === 'gif' && data.gifUrl) {
      return `<img class="story-gif-media" src="${esc(data.gifUrl)}" alt="${esc(sticker.label || 'GIF')}" loading="eager">`;
    }
    if (type === 'location') {
      return `${icon('location')}<span><strong>${esc(data.placeName || sticker.label || 'Location')}</strong>${data.region ? `<small>${esc(data.region)}</small>` : ''}</span>`;
    }
    if (type === 'weather') {
      return `<span class="story-weather-symbol">${esc(data.symbol || '')}</span><span><strong>${Math.round(Number(data.temperature || 0))}&deg;</strong><small>${esc(data.condition || data.placeName || 'Weather')}</small></span>`;
    }
    if (type === 'countdown') {
      return `<strong>${esc(sticker.label || 'Countdown')}</strong><time data-countdown-at="${esc(data.targetAt || '')}">${esc(formatStoryCountdown(data.targetAt))}</time>`;
    }
    if (type === 'quiz') {
      const options = Array.isArray(data.options) ? data.options : [];
      return `
        <strong>${esc(sticker.label || 'Quiz')}</strong>
        <span class="story-choice-list">
          ${options.map((option) => editor || !story
            ? `<span>${esc(option)}</span>`
            : `<button type="button" class="${String(response.myValue) === String(option) ? 'selected' : ''}" data-action="respond-story-sticker" data-story-id="${esc(story.id)}" data-sticker-id="${esc(sticker.id)}" data-value="${esc(option)}"><span>${esc(option)}</span>${response.count ? `<small>${storyStickerPercent(response, option)}%</small>` : ''}</button>`).join('')}
        </span>
      `;
    }
    if (type === 'emoji_slider') {
      const current = response.myValue ?? response.average ?? 50;
      return `
        <strong>${esc(sticker.label || 'How do you feel?')}</strong>
        <label class="story-live-slider">
          <span>${esc(data.emoji || '\ud83d\ude0d')}</span>
          <input type="range" min="0" max="100" step="1" value="${esc(Math.round(Number(current)))}" ${story && !editor ? `data-story-slider data-story-id="${esc(story.id)}" data-sticker-id="${esc(sticker.id)}"` : 'disabled'} aria-label="Emoji slider">
        </label>
        ${response.count ? `<small>${response.count} response${response.count === 1 ? '' : 's'}</small>` : ''}
      `;
    }
    if (type === 'question' || type === 'add_yours') {
      return `
        <strong>${esc(sticker.label || (type === 'question' ? 'Ask me a question' : 'Add yours'))}</strong>
        ${story && !editor ? `<button type="button" class="story-sticker-reply" data-action="respond-story-text" data-story-id="${esc(story.id)}" data-sticker-id="${esc(sticker.id)}">${response.myValue ? 'Edit reply' : 'Reply'}</button>` : ''}
      `;
    }
    return esc(sticker.label || '');
  }

  function storyMapLink(sticker) {
    const latitude = Number(sticker?.data?.latitude);
    const longitude = Number(sticker?.data?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (!latitude && !longitude)) return '';
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=14/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  }

  function renderStoryStickers(edits = {}, story = null, compact = false) {
    const stickers = Array.isArray(edits.stickers) ? edits.stickers : [];
    return stickers.map((sticker) => {
      const type = sticker.type || 'emoji';
      const href = type === 'link' ? normalizeStoryLink(sticker.href) : '';
      const mapHref = ['location', 'weather'].includes(type) ? storyMapLink(sticker) : '';
      const content = renderStoryStickerContent(sticker, story, false);
      const className = `story-sticker story-sticker-${esc(type)} ${story ? 'story-viewer-sticker' : ''} ${compact ? 'compact' : ''}`;
      if (href || mapHref) {
        return `<a class="${className}" href="${esc(href || mapHref)}" target="_blank" rel="noopener noreferrer" style="${esc(storyStickerStyle(sticker))}">${type === 'link' ? icon('link') : ''}${content}</a>`;
      }
      const interactive = Boolean(story && ['quiz', 'emoji_slider', 'question', 'add_yours'].includes(type));
      const tag = interactive ? 'div' : 'span';
      return `<${tag} class="${className} ${interactive ? 'story-sticker-interactive' : ''}" style="${esc(storyStickerStyle(sticker))}">${content}</${tag}>`;
    }).join('');
  }

  function renderStoryEditorStickers(editor = {}) {
    const stickers = Array.isArray(editor.stickers) ? editor.stickers : [];
    return stickers.map((sticker) => `
      <button type="button" class="story-sticker story-editor-sticker story-sticker-${esc(sticker.type || 'emoji')}" data-action="story-sticker-drag" data-sticker-id="${esc(sticker.id)}" style="${esc(storyStickerStyle(sticker))}" aria-label="Move ${esc(sticker.label || 'sticker')}">
        ${renderStoryStickerContent(sticker, null, true)}
      </button>
    `).join('');
  }

  function drawingPath(points = []) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${Number(point.x || 0).toFixed(2)} ${Number(point.y || 0).toFixed(2)}`).join(' ');
  }

  function renderStoryDrawings(edits = {}) {
    const drawings = Array.isArray(edits.drawings) ? edits.drawings : [];
    if (!drawings.length) return '';
    return `
      <svg class="story-drawing-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
        ${drawings.map((stroke) => {
          const brush = ['pen', 'marker', 'neon', 'chalk'].includes(stroke.brush) ? stroke.brush : 'pen';
          const widthMultiplier = brush === 'marker' ? 2.2 : brush === 'chalk' ? 1.35 : 1;
          return `<path class="story-brush-${brush}" d="${esc(drawingPath(stroke.points || []))}" stroke="${esc(stroke.color || '#ffffff')}" stroke-width="${(Number(stroke.size || 5) / 10) * widthMultiplier}" />`;
        }).join('')}
      </svg>
    `;
  }

  function renderAudioBars(seed = '', count = 26) {
    let hash = Array.from(String(seed)).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
    return Array.from({ length: count }, (_, index) => {
      hash = (Math.imul(hash ^ (index + 1), 16777619)) >>> 0;
      const height = 22 + (hash % 72);
      return `<i style="--bar-height:${height}%"></i>`;
    }).join('');
  }

  function renderStoryAudioPlayer(source, name, duration = 30, extraClass = '') {
    if (!source) return '';
    return `
      <div class="story-audio-ui ${esc(extraClass)}">
        <button type="button" data-action="toggle-story-audio" aria-label="Play audio">${icon('play')}</button>
        <span class="story-audio-copy"><strong>${esc(name || 'Audio')}</strong><small>${Math.max(1, Math.round(Number(duration || 30)))} sec</small></span>
        <span class="story-audio-wave" aria-hidden="true">${renderAudioBars(name)}</span>
        <audio src="${esc(source)}" preload="metadata"></audio>
      </div>
    `;
  }

  function renderStoryAudio(story) {
    const edits = story.edits || {};
    const start = Number(edits.audioStart || 0);
    const end = Number(edits.audioEnd || 30);
    const source = story.audio?.url ? `${story.audio.url}#t=${start},${end}` : '';
    if (!source) return '';
    return `<div class="story-audio-sticker">${renderStoryAudioPlayer(source, story.audio.name || 'Audio', Math.max(1, end - start), 'viewer-audio')}</div>`;
  }

  function renderPollSticker(edits = {}, compact = false, story = null) {
    if (compact) return '';
    const response = storyStickerResponse(story, 'poll');
    const options = [edits.pollOptionA || 'Yes', edits.pollOptionB || 'No'];
    return `
      <div class="story-poll-sticker">
        <strong>${esc(edits.pollQuestion || '')}</strong>
        ${options.map((option) => story
          ? `<button type="button" class="${String(response.myValue) === String(option) ? 'selected' : ''}" data-action="respond-story-poll" data-story-id="${esc(story.id)}" data-value="${esc(option)}"><span>${esc(option)}</span>${response.count ? `<small>${storyStickerPercent(response, option)}%</small>` : ''}</button>`
          : `<span>${esc(option)}</span>`).join('')}
      </div>
    `;
  }

  function updateStoryPollPreview() {
    const editor = state.storyEditor;
    const preview = document.querySelector('.story-editor-preview');
    if (!editor || !preview) return;
    let sticker = preview.querySelector('.story-poll-sticker');
    if (!editor.pollQuestion) {
      sticker?.remove();
      return;
    }
    if (!sticker) {
      preview.insertAdjacentHTML('beforeend', renderPollSticker(editor));
      sticker = preview.querySelector('.story-poll-sticker');
    }
    if (!sticker) return;
    sticker.querySelector('strong').textContent = editor.pollQuestion || '';
    const options = sticker.querySelectorAll('span');
    if (options[0]) options[0].textContent = editor.pollOptionA || 'Yes';
    if (options[1]) options[1].textContent = editor.pollOptionB || 'No';
  }

  function resizeStoryTextInput(textarea = document.getElementById('story-editor-text')) {
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const maxHeight = Math.max(72, Math.round(viewportHeight * 0.46));
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function updateStoryTextUi() {
    const editor = state.storyEditor;
    const overlay = document.querySelector('.story-draggable-text, .story-live-text');
    if (!editor || !overlay) return;
    overlay.style.cssText = storyTextStyle(editor);
    const live = overlay.classList.contains('story-live-text');
    overlay.className = `${live ? 'story-live-text' : 'story-draggable-text'} ${storyTextClass(editor)}`;
    if (!live) overlay.textContent = editor.text || '';
    if (live) resizeStoryTextInput(overlay);
    const size = document.getElementById('story-text-size');
    updateStoryRangeProgress(size, editor.textSize || 44);
  }

  function updateStoryTextComposerUi() {
    const editor = state.storyEditor;
    const current = document.querySelector('.story-text-composer');
    if (!editor || !current) return;
    const template = document.createElement('template');
    template.innerHTML = storyTextToolPanel(editor).trim();
    const next = template.content.firstElementChild;
    if (!next) return;
    current.replaceWith(next);
    requestAnimationFrame(() => {
      centerStoryActiveChoice(next);
    });
  }

  function updateStoryTextTransformUi() {
    if (storyTextTransformFrame) return;
    storyTextTransformFrame = requestAnimationFrame(() => {
      storyTextTransformFrame = 0;
      const editor = state.storyEditor;
      const overlay = document.querySelector('.story-draggable-text, .story-live-text');
      if (!editor || !overlay) return;
      overlay.style.left = `${clamp(Number(editor.textX || 50), 5, 95)}%`;
      overlay.style.top = `${clamp(Number(editor.textY || 50), 5, 95)}%`;
      overlay.style.transform = `translate(-50%,-50%) rotate(${clamp(Number(editor.textRotation || 0), -180, 180)}deg)`;
      overlay.style.fontSize = `${clamp(Number(editor.textSize || 44), 22, 96)}px`;
      if (overlay.classList.contains('story-live-text')) resizeStoryTextInput(overlay);
      updateStoryRangeProgress(document.getElementById('story-text-size'), editor.textSize || 44);
    });
  }

  function updateStoryMediaUi(refreshEffects = true) {
    const editor = state.storyEditor;
    const preview = document.querySelector('.story-editor-preview');
    const media = preview?.querySelector('img, video');
    if (!editor || !preview || !media) return;
    media.style.filter = storyFilterCss(editor.filter, editor);
    updateStoryMediaTransformUi();
    if (refreshEffects) {
      preview.querySelectorAll('.story-media-effect, .story-vignette').forEach((layer) => layer.remove());
      media.insertAdjacentHTML('afterend', renderStoryEffectLayers(editor));
    }
  }

  function updateStoryMediaTransformUi() {
    if (storyMediaTransformFrame) return;
    storyMediaTransformFrame = requestAnimationFrame(() => {
      storyMediaTransformFrame = 0;
      const editor = state.storyEditor;
      const media = document.querySelector('.story-editor-preview img, .story-editor-preview video');
      if (!editor || !media) return;
      media.style.transform = storyMediaTransformCss(editor);
      media.style.objectFit = storyMediaFit(editor);
      const zoom = document.getElementById('story-editor-zoom');
      if (zoom) zoom.value = String(editor.zoom || 1);
    });
  }

  function normalizeStoryVideoBounds(editor, duration = editor?.videoDuration) {
    if (!editor) return;
    const safeDuration = Math.max(0, Number(duration || 0));
    editor.videoDuration = safeDuration;
    if (!safeDuration) return;
    const start = clamp(Number(editor.trimStart || 0), 0, Math.max(0, safeDuration - 0.1));
    const requestedEnd = Number(editor.trimEnd || 0);
    const end = clamp(requestedEnd > start ? requestedEnd : Math.min(safeDuration, start + 60), start + 0.1, Math.min(safeDuration, start + 60));
    editor.trimStart = start;
    editor.trimEnd = end;
    editor.videoCurrentTime = clamp(Number(editor.videoCurrentTime ?? start), start, end);
  }

  function updateStoryVideoToolUi(updateControls = false) {
    const editor = state.storyEditor;
    const panel = document.querySelector('.story-video-editor');
    if (!editor?.isVideo || !panel) return;
    const duration = Math.max(0.1, Number(editor.videoDuration || editor.trimEnd || 1));
    normalizeStoryVideoBounds(editor, duration);
    const startPercent = (editor.trimStart / duration) * 100;
    const endPercent = (editor.trimEnd / duration) * 100;
    const currentPercent = (clamp(Number(editor.videoCurrentTime || 0), 0, duration) / duration) * 100;
    const startDim = panel.querySelector('.story-video-dim-start');
    const endDim = panel.querySelector('.story-video-dim-end');
    const windowEl = panel.querySelector('.story-video-trim-window');
    const playhead = panel.querySelector('.story-video-playhead');
    if (startDim) startDim.style.width = `${startPercent}%`;
    if (endDim) endDim.style.left = `${endPercent}%`;
    if (windowEl) {
      windowEl.style.left = `${startPercent}%`;
      windowEl.style.width = `${Math.max(0, endPercent - startPercent)}%`;
    }
    if (playhead) playhead.style.left = `${currentPercent}%`;
    const currentLabel = panel.querySelector('[data-video-current]');
    const selectionLabel = panel.querySelector('[data-video-selection]');
    if (currentLabel) currentLabel.textContent = formatClipTime(editor.videoCurrentTime);
    if (selectionLabel) selectionLabel.textContent = `${formatClipTime(editor.trimEnd - editor.trimStart)} selected`;
    if (!updateControls) return;
    const play = panel.querySelector('[data-action="story-video-play"]');
    const mute = panel.querySelector('[data-action="story-video-mute"]');
    const speed = panel.querySelector('[data-action="story-video-speed"] strong');
    const fit = panel.querySelector('[data-action="story-video-fit"]');
    if (play) play.innerHTML = `${icon(editor.videoPlaying ? 'pause' : 'play')}<small>${editor.videoPlaying ? 'Pause' : 'Play'}</small>`;
    if (mute) {
      mute.classList.toggle('active', editor.videoMuted);
      mute.innerHTML = `${icon(editor.videoMuted ? 'mute' : 'volume')}<small>${editor.videoMuted ? 'Muted' : 'Sound'}</small>`;
    }
    if (speed) speed.textContent = `${Number(editor.videoSpeed || 1)}x`;
    if (fit) {
      fit.classList.toggle('active', storyMediaFit(editor) === 'contain');
      const label = fit.querySelector('small');
      if (label) label.textContent = storyMediaFit(editor) === 'contain' ? 'Fit' : 'Fill';
    }
  }

  function waitForMedia(video, eventName) {
    return new Promise((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('Video could not be decoded.'));
      };
      const cleanup = () => {
        video.removeEventListener(eventName, done);
        video.removeEventListener('error', failed);
      };
      video.addEventListener(eventName, done, { once: true });
      video.addEventListener('error', failed, { once: true });
    });
  }

  async function generateStoryVideoThumbnails(editor) {
    if (!editor?.isVideo || editor.videoThumbLoading || editor.videoThumbnails?.length) return;
    editor.videoThumbLoading = true;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = editor.dataUrl;
    try {
      if (video.readyState < 1) await waitForMedia(video, 'loadedmetadata');
      if (video.readyState < 2) await waitForMedia(video, 'loadeddata');
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;
      normalizeStoryVideoBounds(editor, duration);
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 112;
      const context = canvas.getContext('2d');
      const thumbnails = [];
      const count = 8;
      for (let index = 0; index < count; index += 1) {
        const time = Math.min(Math.max(0, duration - 0.05), (duration * index) / Math.max(1, count - 1));
        if (Math.abs(video.currentTime - time) > 0.02) {
          video.currentTime = time;
          await waitForMedia(video, 'seeked');
        }
        if (!video.videoWidth || !video.videoHeight) throw new Error('Video has no display frame.');
        const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const sourceWidth = canvas.width / scale;
        const sourceHeight = canvas.height / scale;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        const sourceY = (video.videoHeight - sourceHeight) / 2;
        context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        thumbnails.push(canvas.toDataURL('image/jpeg', 0.58));
      }
      if (state.storyEditor === editor) {
        editor.videoThumbnails = thumbnails;
        document.querySelectorAll('.story-video-frame').forEach((frame, index) => {
          if (thumbnails[index]) frame.style.backgroundImage = `url("${thumbnails[index]}")`;
        });
      }
    } catch {
      // The timeline remains usable with neutral frames when a browser cannot seek the source codec.
    } finally {
      editor.videoThumbLoading = false;
      video.removeAttribute('src');
      video.load();
    }
  }

  function attachStoryEditorVideo() {
    const editor = state.storyEditor;
    const video = document.getElementById('story-editor-video');
    if (!editor?.isVideo || !video) return;
    editor.videoPlaying = false;
    video.muted = Boolean(editor.videoMuted);
    video.volume = clamp(Number(editor.videoVolume ?? 1), 0, 1);
    video.playbackRate = [0.5, 1, 1.5, 2].includes(Number(editor.videoSpeed)) ? Number(editor.videoSpeed) : 1;
    const prepare = () => {
      if (state.storyEditor !== editor) return;
      normalizeStoryVideoBounds(editor, Number.isFinite(video.duration) ? video.duration : 0);
      if (Math.abs(video.currentTime - editor.videoCurrentTime) > 0.08) video.currentTime = editor.videoCurrentTime;
      updateStoryVideoToolUi(true);
      if (editor.activeTool === 'video') generateStoryVideoThumbnails(editor);
    };
    if (video.readyState >= 1) prepare();
    else video.addEventListener('loadedmetadata', prepare, { once: true });
    video.addEventListener('play', () => {
      if (state.storyEditor !== editor) return;
      editor.videoPlaying = true;
      updateStoryVideoToolUi(true);
    });
    video.addEventListener('pause', () => {
      if (state.storyEditor !== editor) return;
      editor.videoPlaying = false;
      updateStoryVideoToolUi(true);
    });
    video.addEventListener('timeupdate', () => {
      if (state.storyEditor !== editor) return;
      if (editor.trimEnd && video.currentTime >= editor.trimEnd) {
        video.pause();
        video.currentTime = editor.trimStart;
      }
      editor.videoCurrentTime = video.currentTime;
      updateStoryVideoToolUi();
    });
  }

  function attachStoryViewerVideo() {
    const story = storyById(state.storyViewer?.storyId);
    const video = document.querySelector('.story-viewer-stage video');
    if (!story || !video) return;
    const edits = story.edits || {};
    const speed = [0.5, 1, 1.5, 2].includes(Number(edits.videoSpeed)) ? Number(edits.videoSpeed) : 1;
    video.playbackRate = speed;
    video.muted = Boolean(edits.videoMuted);
    video.volume = clamp(Number(edits.videoVolume ?? 1), 0, 1);
    const start = Math.max(0, Number(edits.trimStart || 0));
    const end = Math.max(start, Number(edits.trimEnd || 0));
    const prepare = () => {
      if (start && Math.abs(video.currentTime - start) > 0.08) video.currentTime = start;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) prepare();
    else video.addEventListener('loadedmetadata', prepare, { once: true });
    if (end > start) {
      video.addEventListener('timeupdate', () => {
        if (video.currentTime < end) return;
        video.pause();
        clearStoryAdvance();
        navigateStory(1).catch((error) => alert(error.message));
      });
    }
  }

  async function toggleStoryVideoPlayback() {
    const editor = state.storyEditor;
    const video = document.getElementById('story-editor-video');
    if (!editor?.isVideo || !video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < editor.trimStart || video.currentTime >= editor.trimEnd - 0.04) {
      video.currentTime = editor.trimStart;
    }
    await video.play();
  }

  function updateStoryVideoFromPointer(drag, clientX) {
    const editor = state.storyEditor;
    if (!editor?.isVideo || !drag?.rect?.width) return;
    const duration = Math.max(0.1, Number(editor.videoDuration || 0.1));
    const point = clamp(((clientX - drag.rect.left) / drag.rect.width) * duration, 0, duration);
    if (drag.edge === 'start') {
      editor.trimStart = clamp(point, Math.max(0, editor.trimEnd - 60), Math.max(0, editor.trimEnd - 0.1));
      editor.videoCurrentTime = editor.trimStart;
    } else if (drag.edge === 'end') {
      editor.trimEnd = clamp(point, Math.min(duration, editor.trimStart + 0.1), Math.min(duration, editor.trimStart + 60));
      editor.videoCurrentTime = Math.max(editor.trimStart, editor.trimEnd - 0.03);
    } else {
      editor.videoCurrentTime = clamp(point, editor.trimStart, editor.trimEnd);
    }
    const video = document.getElementById('story-editor-video');
    if (video) {
      video.pause();
      if (Math.abs(video.currentTime - editor.videoCurrentTime) > 0.01) video.currentTime = editor.videoCurrentTime;
    }
    updateStoryVideoToolUi();
  }

  function updateStoryDrawPreview() {
    const preview = document.querySelector('.story-editor-preview');
    if (!state.storyEditor || !preview) return;
    preview.querySelector('.story-drawing-layer')?.remove();
    const html = renderStoryDrawings(state.storyEditor);
    if (html) preview.insertAdjacentHTML('afterbegin', html);
  }

  function updateActiveStoryStrokeUi(stroke) {
    pendingStoryStroke = stroke;
    if (storyDrawFrame) return;
    storyDrawFrame = requestAnimationFrame(() => {
      storyDrawFrame = 0;
      const paths = document.querySelectorAll('.story-editor-preview .story-drawing-layer path');
      const path = paths[paths.length - 1];
      if (path && pendingStoryStroke) path.setAttribute('d', drawingPath(pendingStoryStroke.points || []));
      pendingStoryStroke = null;
    });
  }

  function updateStoryRangeProgress(input, value) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const current = clamp(Number(value || min), min, max);
    const progress = max === min ? 0 : ((current - min) / (max - min)) * 100;
    input.value = String(current);
    input.style.setProperty('--range-progress', `${progress}%`);
  }

  function eraseStoryStrokeAt(point) {
    const editor = state.storyEditor;
    if (!editor) return;
    const drawings = editor.drawings || [];
    let removeIndex = -1;
    for (let index = drawings.length - 1; index >= 0; index -= 1) {
      if ((drawings[index].points || []).some((candidate) => Math.hypot(Number(candidate.x) - point.x, Number(candidate.y) - point.y) < 4.5)) {
        removeIndex = index;
        break;
      }
    }
    if (removeIndex < 0) return;
    editor.drawings = drawings.filter((_, index) => index !== removeIndex);
    updateStoryDrawPreview();
  }

  function updateStoryStickerPreview() {
    const preview = document.querySelector('.story-editor-preview');
    if (!state.storyEditor || !preview) return;
    preview.querySelectorAll('.story-sticker').forEach((item) => item.remove());
    preview.insertAdjacentHTML('beforeend', renderStoryEditorStickers(state.storyEditor));
  }

  function updateStoryEditorStickerUi(stickerId) {
    const sticker = (state.storyEditor?.stickers || []).find((item) => item.id === stickerId);
    const element = Array.from(document.querySelectorAll('.story-editor-sticker'))
      .find((item) => item.dataset.stickerId === stickerId);
    if (sticker && element) element.style.cssText = storyStickerStyle(sticker);
  }

  function renderStoryEngagement(story, compact = false) {
    return `
      <div class="story-engagement ${compact ? 'compact' : ''}">
        <button class="${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="${story.likedByMe ? 'Unlike' : 'Like'} story" aria-pressed="${story.likedByMe ? 'true' : 'false'}">
          ${icon('heart')}<span class="story-like-count">${story.likeCount || 0}</span>
        </button>
        <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="Comments">
          ${icon('comment')}<span>${story.commentCount || 0}</span>
        </button>
      </div>
    `;
  }

  function renderExploreGrid() {
    if (state.exploreLoading) return '<div class="explore-grid explore-loading">' + Array.from({ length: 9 }, () => '<i></i>').join('') + '</div>';
    if (!state.explorePosts.length) return `<div class="search-empty compact">${icon('grid')}<strong>No public posts yet</strong><small>New photos and videos will appear here.</small></div>`;
    return `
      <div class="explore-grid">
        ${state.explorePosts.map((post) => `<button data-action="open-explore-post" data-post-id="${esc(post.id)}" aria-label="Open ${esc(post.title || 'post')}">${renderPostMedia(post, { grid: true })}<span><b>${icon('heart')}${Number(post.likeCount || 0)}</b></span></button>`).join('')}
      </div>
    `;
  }

  function renderHighlightCommentPreview(story) {
    if (!state.storyViewer?.highlightId) return '';
    const comments = (story?.comments || [])
      .filter((comment) => comment.user && (String(comment.text || '').trim() || comment.gif?.file?.url))
      .slice(-3);
    if (!comments.length) return '';
    const latest = comments[comments.length - 1];
    const latestLabel = latest.kind === 'gif' ? 'GIF' : String(latest.text || '').trim();
    return `
      <button class="highlight-comment-preview" data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="Open comments. Latest from ${esc(latest.user.username || 'user')}: ${esc(latestLabel)}">
        ${comments.map((comment, index) => `
          <span class="highlight-comment-preview-card" style="--comment-preview-order:${index}">
            ${avatarHtml(comment.user)}
            <span class="highlight-comment-preview-copy">
              <strong>${esc(comment.user.username || 'user')}</strong>
              ${comment.kind === 'gif' && comment.gif?.file?.url
                ? `<span class="highlight-comment-preview-gif"><img src="${esc(comment.gif.file.url)}" alt=""><span>GIF</span></span>`
                : `<span>${esc(comment.text || '')}</span>`}
            </span>
          </span>
        `).join('')}
      </button>
    `;
  }

  function renderHighlights(user, own) {
    const highlights = (user.highlights || []).filter((highlight) => highlight.cover?.file && highlight.stories?.length);
    if (!own && !highlights.length) return '';
    return `
      <section class="highlight-strip">
        <div class="highlight-head">
          <strong>Highlights</strong>
        </div>
        <div class="highlight-row">
          ${own ? `
            <button class="highlight-add" data-action="open-highlight-composer" aria-label="Add highlight">
              <span>+</span>
              <small>New</small>
            </button>
          ` : ''}
          ${highlights.map((highlight) => `
            <article class="highlight-item">
              <button class="highlight-media" data-action="view-story" data-story-id="${esc(highlight.stories[0].id)}" data-highlight-id="${esc(highlight.id)}" aria-label="View ${esc(highlight.title)}">
                ${renderStoryMedia(highlight.cover, true)}
              </button>
              ${own
                ? `<button class="highlight-title" data-action="rename-highlight" data-highlight-id="${esc(highlight.id)}">${esc(highlight.title || 'Highlight')}</button>`
                : `<small>${esc(highlight.title || 'Highlight')}</small>`}
            </article>
          `).join('') || (own ? '' : '<p class="hint">Save a story to keep it here.</p>')}
        </div>
      </section>
    `;
  }

  function highlightById(user, highlightId) {
    return (user?.highlights || []).find((highlight) => highlight.id === highlightId) || null;
  }

  function highlightMembershipCount(user, storyId) {
    return (user?.highlights || []).filter((highlight) => (
      highlight.stories || []
    ).some((story) => story.id === storyId)).length;
  }

  function renderHighlightComposer() {
    const composer = state.highlightComposer;
    if (!composer || !state.me) return '';
    const highlights = state.me.highlights || [];
    const postedStories = (state.me.stories || []).filter((story) => story.file);
    const isTarget = composer.mode === 'target';
    const isRename = composer.mode === 'rename';
    const isArchive = composer.mode === 'archive';
    const heading = isArchive ? 'Highlight archive' : isRename ? 'Rename highlight' : isTarget ? 'Choose highlight' : 'Add to highlight';
    return `
      <div class="highlight-composer-overlay" data-action="close-highlight-composer">
        <section class="highlight-composer" data-stop-close>
          <header class="highlight-composer-head">
            ${isTarget && composer.source === 'existing'
              ? `<button class="highlight-composer-icon" data-action="highlight-composer-back" aria-label="Back">${icon('back')}</button>`
              : '<span class="highlight-composer-head-spacer"></span>'}
            <strong>${heading}</strong>
            <button class="highlight-composer-icon" data-action="close-highlight-composer" aria-label="Close">${icon('x')}</button>
          </header>
          ${isArchive ? `
            <div class="highlight-target-body highlight-archive-body">
              <div class="highlight-library-head"><strong>Your highlights</strong><small>Rename or remove any collection</small></div>
              ${highlights.length ? `<div class="highlight-target-list">${highlights.map((highlight) => `
                <article class="highlight-target-row highlight-archive-row">
                  <button class="highlight-target-cover" data-action="view-story" data-story-id="${esc(highlight.stories?.[0]?.id || '')}" data-highlight-id="${esc(highlight.id)}">${highlight.cover?.file ? renderStoryMedia(highlight.cover, true) : icon('archive')}</button>
                  <span><strong>${esc(highlight.title || 'Highlight')}</strong><small>${highlight.storyCount || highlight.stories?.length || 0} stories</small></span>
                  <button data-action="rename-highlight" data-highlight-id="${esc(highlight.id)}" aria-label="Rename">${icon('edit')}</button>
                  <button class="danger-text" data-action="delete-highlight" data-highlight-id="${esc(highlight.id)}" aria-label="Delete">${icon('trash')}</button>
                </article>
              `).join('')}</div>` : '<p class="highlight-empty">You have no saved highlights yet.</p>'}
              <button class="highlight-create-story" data-action="highlight-create-story"><span>${icon('plus')}</span><span><strong>Add a highlight</strong><small>Create a story and save it here</small></span>${icon('chevron')}</button>
            </div>
          ` : isRename ? `
            <div class="highlight-name-editor">
              <label for="highlight-rename-input">Name</label>
              <input id="highlight-rename-input" maxlength="32" value="${esc(composer.title || '')}" autocomplete="off" autofocus>
              <button class="highlight-confirm" data-action="save-highlight-name" data-highlight-id="${esc(composer.highlightId)}">Save</button>
            </div>
          ` : isTarget ? `
            <div class="highlight-target-body">
              ${highlights.length ? `
                <div class="highlight-target-list">
                  ${highlights.map((highlight) => `
                    <button class="highlight-target-row" data-action="choose-highlight-target" data-highlight-id="${esc(highlight.id)}">
                      <span class="highlight-target-cover">
                        ${highlight.cover?.file ? renderStoryMedia(highlight.cover, true) : icon('plus')}
                      </span>
                      <span><strong>${esc(highlight.title || 'Highlight')}</strong><small>${highlight.storyCount || highlight.stories?.length || 0} ${(highlight.storyCount || highlight.stories?.length || 0) === 1 ? 'story' : 'stories'}</small></span>
                      ${icon('chevron')}
                    </button>
                  `).join('')}
                </div>
              ` : '<p class="highlight-empty">Create your first highlight for this story.</p>'}
              <div class="highlight-new-target">
                <input id="highlight-new-name" maxlength="32" placeholder="New highlight name" autocomplete="off">
                <button data-action="create-highlight-target">Create</button>
              </div>
            </div>
          ` : `
            <button class="highlight-create-story" data-action="highlight-create-story">
              <span>${icon('plus')}</span>
              <span><strong>Create new story</strong><small>Edit a photo or video, then add it here</small></span>
              ${icon('chevron')}
            </button>
            <div class="highlight-library-head">
              <strong>Posted stories</strong>
              <small>Choose one to add to a highlight</small>
            </div>
            ${postedStories.length ? `
              <div class="highlight-story-grid">
                ${postedStories.map((story) => `
                  <button data-action="select-highlight-story" data-story-id="${esc(story.id)}" aria-label="Add posted story">
                    ${renderStoryMedia(story, true)}
                    ${highlightMembershipCount(state.me, story.id) ? `<span>${highlightMembershipCount(state.me, story.id)}</span>` : ''}
                  </button>
                `).join('')}
              </div>
            ` : '<p class="highlight-empty">Your posted stories will appear here.</p>'}
          `}
        </section>
      </div>
    `;
  }

  function renderTwoFactorPanel() {
    if (state.twoFactorEnabled) {
      return `
        <section class="panel-card">
          <h2>Two-Factor Login</h2>
          <p class="hint">2FA is enabled. Enter a current authenticator code to disable it.</p>
          <div class="toolbar">
            <input class="search-input" id="disable-2fa-code" inputmode="numeric" placeholder="123456">
            <button class="secondary" data-action="disable-2fa">Disable</button>
          </div>
        </section>
      `;
    }
    return `
      <section class="panel-card">
        <h2>Two-Factor Login</h2>
        ${state.twoFactorSetup ? `
          <p class="hint">Add this secret to an authenticator app, then enter the 6-digit code.</p>
          <p><code>${esc(state.twoFactorSetup.secret)}</code></p>
          <input class="search-input" id="enable-2fa-code" inputmode="numeric" placeholder="123456">
          <div class="toolbar" style="margin-top:8px">
            <button class="primary" data-action="enable-2fa">Enable 2FA</button>
          </div>
        ` : `
          <p class="hint">Optional extra login security using a 6-digit authenticator app code.</p>
          <button class="secondary" data-action="setup-2fa">Set up 2FA</button>
        `}
      </section>
    `;
  }

  function renderSearchResults() {
    const query = state.userQuery.trim();
    if (query.length < 2) {
      return `<div class="search-empty compact">${icon('search')}<strong>Keep typing</strong><small>Use at least 2 characters.</small></div>`;
    }
    if (state.userSearching) {
      return Array.from({ length: 4 }, () => `
        <div class="account-row account-row-skeleton" aria-hidden="true">
          <span class="skeleton-avatar"></span><span class="skeleton-copy"></span><span class="skeleton-action"></span>
        </div>
      `).join('');
    }
    if (!state.searchResults.length) {
      return `<div class="search-empty">${icon('search')}<strong>No accounts found</strong><small>Check the spelling or try another name.</small></div>`;
    }
    return state.searchResults.map((user) => renderAccountRow(user)).join('');
  }

  function accountProfileHref(user) {
    return user?.url || profilePath(user?.username);
  }

  function renderAccountIdentity(user, className = 'account-identity') {
    return `
      <a class="${esc(className)}" href="${esc(accountProfileHref(user))}" data-action="view-user-profile" data-username="${esc(user.username)}">
        ${avatarHtml(user)}
        <span class="person">
          <strong>${esc(user.displayName)}</strong>
          <small>@${esc(user.username)}${user.mutualCount ? ` - ${esc(user.mutualCount)} mutual` : ''}</small>
        </span>
      </a>
    `;
  }

  function renderAccountAction(user) {
    const knownUser = userById(user?.id) || user;
    if (!knownUser || knownUser.id === state.me?.id) return '<button class="mini-btn account-action" disabled>You</button>';
    if (knownUser.hasBlocked || knownUser.blockedBy) return '<button class="mini-btn account-action" disabled>Blocked</button>';
    if (knownUser.isFollowing) return `<button class="mini-btn account-action" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}">Unfollow</button>`;
    if (knownUser.socialPublic === false && !knownUser.isContact) {
      if (knownUser.outgoingRequest) return '<button class="mini-btn account-action" disabled>Requested</button>';
      if (knownUser.incomingRequest) return `<button class="mini-btn account-action primary-action" data-action="accept-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Accept</button>`;
      return `<button class="mini-btn account-action primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Follow</button>`;
    }
    return `<button class="mini-btn account-action primary-action" data-action="follow-user" data-user-id="${esc(knownUser.id)}">Follow</button>`;
  }

  function renderAccountRow(user, options = {}) {
    return `
      <article class="account-row ${options.social ? 'social-user-row' : ''}">
        ${renderAccountIdentity(user)}
        <span class="account-row-actions">
          ${renderAccountAction(user)}
          ${options.dismissible ? `<button class="account-dismiss" title="Hide" aria-label="Hide recommendation" data-action="dismiss-recommendation" data-user-id="${esc(user.id)}">${icon('x')}</button>` : ''}
        </span>
      </article>
    `;
  }

  function renderSocialAccountRow(user, actionHtml = '') {
    return `
      <article class="account-row social-user-row">
        ${renderAccountIdentity(user)}
        <span class="account-row-actions">${actionHtml || renderAccountAction(user)}</span>
      </article>
    `;
  }

  function renderRecommendationIdentity(user) {
    const mutualCount = Number(user.mutualCount || 0);
    const reason = mutualCount === 1
      ? 'Followed by someone you know'
      : mutualCount > 1
        ? `Followed by ${mutualCount} people you know`
        : user.followsViewer
          ? 'Follows you'
          : 'Suggested for you';
    return `
      <a class="recommend-identity" href="${esc(accountProfileHref(user))}" data-action="view-user-profile" data-username="${esc(user.username)}">
        ${avatarHtml(user)}
        <strong>${esc(user.username)}</strong>
        ${user.displayName && user.displayName !== user.username ? `<span class="recommend-display-name">${esc(user.displayName)}</span>` : ''}
        <small>${esc(reason)}</small>
      </a>
    `;
  }

  function renderRecommendationAction(user) {
    const knownUser = userById(user?.id) || user;
    if (!knownUser || knownUser.id === state.me?.id) return '<button class="mini-btn account-action" disabled>You</button>';
    if (knownUser.hasBlocked || knownUser.blockedBy) return '<button class="mini-btn account-action" disabled>Blocked</button>';
    if (knownUser.isFollowing) return `<button class="mini-btn account-action" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}" aria-label="Unfollow ${esc(knownUser.username)}">Following</button>`;
    if (knownUser.socialPublic === false && !knownUser.isContact) {
      if (knownUser.outgoingRequest) return '<button class="mini-btn account-action" disabled>Requested</button>';
      if (knownUser.incomingRequest) return `<button class="mini-btn account-action primary-action" data-action="accept-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Accept</button>`;
      return `<button class="mini-btn account-action primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Follow</button>`;
    }
    return `<button class="mini-btn account-action primary-action" data-action="follow-user" data-user-id="${esc(knownUser.id)}">Follow</button>`;
  }

  function renderRecommendationCard(user, options = {}) {
    return `
      <article class="recommend-card" data-recommendation-user-id="${esc(user.id)}">
        ${options.dismissible ? `<button class="recommend-dismiss" title="Hide" aria-label="Hide ${esc(user.username)}" data-action="dismiss-recommendation" data-user-id="${esc(user.id)}">${icon('x')}</button>` : ''}
        ${renderRecommendationIdentity(user)}
        ${renderRecommendationAction(user)}
      </article>
    `;
  }

  function renderSearchProfileActions(user) {
    const knownUser = userById(user?.id) || user;
    if (!knownUser || knownUser.id === state.me?.id) return '<button class="mini-btn" disabled>This is you</button>';
    if (knownUser.hasBlocked || knownUser.blockedBy) return '<button class="mini-btn" disabled>Blocked</button>';
    if (knownUser.incomingRequest) {
      return `
        <button class="mini-btn profile-primary-action" data-action="accept-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Accept</button>
        <button class="mini-btn" data-action="decline-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Decline</button>
      `;
    }
    const privateRequest = knownUser.socialPublic === false && !knownUser.isContact && !knownUser.isFollowing;
    const followControl = knownUser.isFollowing
      ? `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}">Unfollow</button>`
      : privateRequest
        ? knownUser.outgoingRequest
          ? '<button class="mini-btn" disabled>Requested</button>'
          : `<button class="mini-btn profile-primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Follow</button>`
        : `<button class="mini-btn profile-primary-action" data-action="follow-user" data-user-id="${esc(knownUser.id)}">Follow</button>`;
    const contactControl = knownUser.isContact
      ? `<button class="mini-btn" data-action="open-chat" data-user-id="${esc(knownUser.id)}">Message</button>`
      : knownUser.outgoingRequest
        ? '<button class="mini-btn" disabled>Friend requested</button>'
        : `<button class="mini-btn" data-action="add-contact" data-username="${esc(knownUser.username)}">Add friend</button>`;
    return `
      ${followControl}
      ${privateRequest ? '' : contactControl}
    `;
  }

  function defaultChatAppearance() {
    return {
      theme: 'midnight',
      background: 'midnight',
      backgroundColor: '#070a12',
      mineColor: '#55339a',
      theirsColor: '#182131'
    };
  }

  function chatThemePresets() {
    return [
      ['midnight', 'Midnight', '#55339a', '#182131', 'midnight', '#070a12'],
      ['dusk', 'Dusk', '#b73f76', '#35213d', 'dusk', '#160d1c'],
      ['ocean', 'Ocean', '#177fa4', '#173245', 'ocean', '#07151c'],
      ['aurora', 'Aurora', '#23836f', '#293844', 'aurora', '#081713'],
      ['graphite', 'Graphite', '#4f5968', '#20242b', 'graphite', '#0b0d11'],
      ['rose', 'Rose', '#bd4c69', '#39232d', 'rose', '#180d12']
    ];
  }

  function chatBackgroundOptions() {
    return [
      ['plain', 'Plain', '#080b10'],
      ['midnight', 'Midnight', '#111a2e'],
      ['dusk', 'Dusk', '#3b1d3e'],
      ['ocean', 'Ocean', '#0d3444'],
      ['aurora', 'Aurora', '#123c34'],
      ['graphite', 'Graphite', '#242932'],
      ['rose', 'Rose', '#45202e']
    ];
  }

  function chatColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
  }

  function readableTextColor(hex) {
    const value = parseInt(chatColor(hex, '#000000').slice(1), 16);
    const luminance = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
    return luminance > 160 ? '#080b10' : '#f7f8fb';
  }

  function chatAppearanceStyle(settings = state.chatAppearance) {
    const defaults = defaultChatAppearance();
    const backgroundColor = chatColor(settings?.backgroundColor, defaults.backgroundColor);
    const mineColor = chatColor(settings?.mineColor, defaults.mineColor);
    const theirsColor = chatColor(settings?.theirsColor, defaults.theirsColor);
    return `--chat-bg:${backgroundColor};--chat-bubble-top:${mineColor};--chat-bubble-bottom:${theirsColor};--chat-bubble-text:${readableTextColor(mineColor)};--chat-mine:${mineColor};--chat-mine-text:${readableTextColor(mineColor)};--chat-theirs:${theirsColor};--chat-theirs-text:${readableTextColor(theirsColor)};`;
  }

  function renderChatCustomization() {
    if (!state.chatCustomizationOpen || !hasActiveConversation()) return '';
    const settings = { ...defaultChatAppearance(), ...(state.chatAppearance || {}) };
    return `
      <div class="chat-customization-overlay" data-action="close-chat-customization">
        <section class="chat-customization-sheet" data-stop-close>
          <header class="chat-customization-head">
            <button class="icon-btn" data-action="close-chat-customization" aria-label="Close">${icon('x')}</button>
            <span><strong>Chat appearance</strong><small>${esc(state.activeGroup?.name || `@${state.activePeer?.username || ''}`)}</small></span>
            <button class="icon-btn" data-action="reset-chat-appearance" aria-label="Reset appearance">${icon('refresh')}</button>
          </header>
          <section class="chat-appearance-section">
            <h3>Theme</h3>
            <div class="chat-theme-grid">
              ${chatThemePresets().map(([theme, label, mine, theirs, background]) => `
                <button class="chat-theme-choice ${settings.theme === theme ? 'active' : ''}" data-action="set-chat-theme" data-theme="${theme}" aria-label="${esc(label)} theme">
                  <span class="theme-preview" style="--theme-mine:${mine};--theme-theirs:${theirs}" aria-hidden="true"><i></i><i></i></span>
                  <small>${esc(label)}</small>
                  ${settings.theme === theme ? icon('check') : ''}
                </button>
              `).join('')}
            </div>
          </section>
          <section class="chat-appearance-section">
            <h3>Background</h3>
            <div class="chat-background-row">
              ${chatBackgroundOptions().map(([background, label, color]) => `
                <button class="chat-background-choice chat-background-${background} ${settings.background === background ? 'active' : ''}" data-action="set-chat-background" data-background="${background}" style="--choice-bg:${color}" aria-label="${esc(label)} background"><span></span><small>${esc(label)}</small></button>
              `).join('')}
              <label class="chat-background-choice custom-background ${settings.background === 'custom' ? 'active' : ''}" aria-label="Custom background color">
                <input id="chat-background-color" type="color" value="${esc(settings.backgroundColor)}">
                <span style="--choice-bg:${esc(settings.backgroundColor)}"></span><small>Custom</small>
              </label>
            </div>
          </section>
          <section class="chat-appearance-section bubble-color-section">
            <h3>Message gradient</h3>
            <label class="chat-color-row"><span class="chat-color-preview mine" style="--preview-color:${esc(settings.mineColor)}">Aa</span><span><strong>Top color</strong><small>At the top of the screen</small></span><input id="chat-mine-color" type="color" value="${esc(settings.mineColor)}"></label>
            <label class="chat-color-row"><span class="chat-color-preview theirs" style="--preview-color:${esc(settings.theirsColor)}">Aa</span><span><strong>Bottom color</strong><small>At the bottom of the screen</small></span><input id="chat-theirs-color" type="color" value="${esc(settings.theirsColor)}"></label>
          </section>
        </section>
      </div>
    `;
  }

  async function updateChatAppearance(patch) {
    if (!hasActiveConversation()) return;
    const data = await api(activeAppearanceUrl(), { method: 'PATCH', body: patch });
    state.chatAppearance = data.settings;
    rememberActiveConversation();
    applyChatAppearanceUi();
    updateChatCustomizationSlot();
  }

  function applyChatAppearanceUi() {
    const pane = document.querySelector('.chat-pane.active-chat');
    if (!pane) return;
    for (const name of ['midnight', 'dusk', 'ocean', 'aurora', 'graphite', 'rose', 'plain', 'custom']) {
      pane.classList.toggle(`chat-background-${name}`, state.chatAppearance?.background === name);
    }
    pane.setAttribute('style', chatAppearanceStyle());
  }

  function renderChatPane() {
    if (state.searchProfileOpen && state.publicProfile) {
      return `
        <main class="chat-pane searched-profile-pane">
          <div class="searched-profile-scroll" data-scroll-memory="desktop-profile:${esc(state.publicProfile.username)}:${esc(state.searchProfileSocialView || 'main')}">
            ${state.searchProfileSocialView
              ? renderSearchProfileSocialPage(state.publicProfile)
              : renderSearchProfilePage(state.publicProfile)}
          </div>
        </main>
      `;
    }
    if (!hasActiveConversation()) {
      return `
        <main class="chat-pane">
          <div class="empty-state">
            <div>
              <h2>Select a chat</h2>
              <p>Use Search to find users, or Profile to edit your picture and bio.</p>
            </div>
          </div>
        </main>
      `;
    }

    if (state.chatProfileOpen) return renderChatProfilePane();

    const group = state.activeGroup;
    const peer = state.activePeer;
    const key = activeConversationKey();
    return `
      <main class="chat-pane active-chat chat-background-${esc(state.chatAppearance?.background || 'midnight')} ${state.chatReturnAnimation ? 'chat-returning' : ''} ${state.chatOpening ? 'chat-opening' : ''}" style="${esc(chatAppearanceStyle())}">
        <header class="chat-header">
          <button class="icon-btn back-btn" title="Back" aria-label="Back" data-action="back">${icon('back')}</button>
          <button class="chat-profile-button" data-action="open-chat-profile">
            ${group ? groupAvatarHtml(group) : avatarHtml(peer)}
          </button>
          <button class="chat-title" data-action="open-chat-profile">
            <strong>${esc(group?.name || peer.displayName)}</strong>
            <small>${group ? `${group.memberCount} members` : `@${esc(peer.username)}`}</small>
          </button>
          ${peer ? `<div class="toolbar" style="margin-left:auto">
            <button class="icon-btn" title="Voice call" aria-label="Voice call" data-action="audio-call">${icon('phone')}</button>
            <button class="icon-btn" title="Video call" aria-label="Video call" data-action="video-call">${icon('video')}</button>
          </div>` : `<button class="icon-btn group-header-info" data-action="open-chat-profile" aria-label="Group details">${icon('group')}</button>`}
        </header>
        <section class="messages" id="messages">
          ${renderMessagesList()}
        </section>
        <footer class="chat-footer ${state.stickerPanel ? 'tray-open' : ''}">
          <div class="composer">
            ${state.replyTo ? `
              <div class="replying-to">
                <span>Replying to: ${esc(describeMessage(state.replyTo)).slice(0, 120)}</span>
                <button class="icon-btn" title="Cancel reply" aria-label="Cancel reply" data-action="clear-reply">${icon('x')}</button>
              </div>
            ` : ''}
            <div class="composer-row instagram-composer">
              <button class="composer-camera" title="Open camera" aria-label="Open camera" data-action="attach-open">${icon('camera')}</button>
              <textarea id="composer-text" class="composer-input" rows="1" maxlength="8000" placeholder="Message ${esc(activeConversationTitle())}">${esc(state.composerDrafts[key] || '')}</textarea>
              <button class="composer-tool" title="Hold to record voice" aria-label="Hold to record voice" data-action="record-voice">${icon('mic')}</button>
              <button class="composer-tool ${state.stickerPanel ? 'active' : ''}" title="Stickers and GIFs" aria-label="Stickers and GIFs" data-action="sticker-toggle">${icon('sticker')}</button>
              <button class="send-btn" title="Send" aria-label="Send" data-action="send-text">Send</button>
              <input id="file-input" type="file" hidden>
            </div>
          </div>
          ${state.stickerPanel ? renderStickerPanel() : ''}
        </footer>
      </main>
    `;
  }

  function renderChatProfilePane() {
    if (state.activeGroup) return renderGroupProfilePane();
    const peer = state.activePeer;
    const profileScrollKey = `chat-profile:${activeConversationKey()}:main`;
    if (state.chatProfileSocialView) return renderChatProfileSocialPage(peer);
    return `
      <main class="chat-pane profile-pane">
        <header class="chat-header">
          <button class="icon-btn" title="Back to chat" aria-label="Back to chat" data-action="close-chat-profile">${icon('back')}</button>
          <div class="chat-title">
            <strong>Profile</strong>
            <small>@${esc(peer.username)}</small>
          </div>
        </header>
        <section class="chat-profile-content" data-scroll-memory="${esc(profileScrollKey)}">
          <div class="peer-profile-hero">
            ${renderProfileAvatarStack(peer)}
            <strong>${esc(peer.displayName)}</strong>
            <span>@${esc(peer.username)}</span>
            <div class="profile-stat-grid peer-profile-stats">
              ${renderProfileStats(peer, 'open-peer-social')}
            </div>
            <p>${esc(peer.bio || 'No bio yet.')}</p>
            <div class="toolbar">
              ${renderRelationshipButton(peer)}
            </div>
          </div>
          ${renderHighlights(peer, false)}
          ${renderProfileSuggestions(peer)}
          <section class="panel-card chat-export-panel">
            <h2>Export chat</h2>
            <div class="chat-export-actions">
              <button data-action="export-chat" data-format="json" title="Save chat as JSON">${icon('download')}<span>JSON</span></button>
              <button data-action="export-chat" data-format="html" title="Save chat as HTML">${icon('download')}<span>HTML</span></button>
            </div>
          </section>
          <section class="panel-card chat-profile-appearance">
            <button class="profile-setting-link" data-action="open-chat-customization">
              <span class="profile-setting-icon">${icon('palette')}</span>
              <span><strong>Chat appearance</strong><small>Background and message colors</small></span>
              ${icon('chevron')}
            </button>
          </section>
          <section class="panel-card">
            <h2>Controls</h2>
            <div class="profile-control-list">
              <button class="secondary" data-action="mute-menu" data-user-id="${esc(peer.id)}">${icon('mute')} Mute</button>
              <button class="danger" data-action="remove-friend" data-user-id="${esc(peer.id)}">${icon('trash')} Remove friend</button>
              <button class="secondary" data-action="open-report" data-report-type="user" data-user-id="${esc(peer.id)}">Report user</button>
              ${peer.hasBlocked
                ? `<button class="secondary" data-action="unblock-user" data-user-id="${esc(peer.id)}">Unblock</button>`
                : `<button class="danger" data-action="block-user" data-user-id="${esc(peer.id)}">${icon('block')} Block</button>`}
            </div>
            ${peer.blockedBy ? '<p class="hint">This user has blocked messaging.</p>' : ''}
            ${peer.hasBlocked ? '<p class="hint">Messaging is blocked until you unblock this user.</p>' : ''}
          </section>
        </section>
      </main>
    `;
  }

  function renderGroupProfilePane() {
    const group = state.activeGroup;
    if (!group) return '';
    const profileScrollKey = `chat-profile:${activeConversationKey()}:main`;
    return `
      <main class="chat-pane profile-pane group-profile-pane">
        <header class="chat-header">
          <button class="icon-btn" title="Back to group" aria-label="Back to group" data-action="close-chat-profile">${icon('back')}</button>
          <div class="chat-title"><strong>Group details</strong><small>${group.memberCount} members</small></div>
          ${group.isAdmin ? `<button class="icon-btn" data-action="edit-group" aria-label="Edit group">${icon('edit')}</button>` : ''}
        </header>
        <section class="chat-profile-content group-profile-content" data-scroll-memory="${esc(profileScrollKey)}">
          <div class="peer-profile-hero group-profile-hero">
            <button class="group-photo-button ${group.isAdmin ? 'editable' : ''}" ${group.isAdmin ? 'data-action="edit-group"' : ''} aria-label="${group.isAdmin ? 'Edit group' : 'Group picture'}">
              ${groupAvatarHtml(group, 'large')}
              ${group.isAdmin ? `<span>${icon('camera')}</span>` : ''}
            </button>
            <strong>${esc(group.name)}</strong>
            <span>${group.memberCount} members</span>
          </div>
          <section class="panel-card chat-profile-appearance">
            <button class="profile-setting-link" data-action="open-chat-customization">
              <span class="profile-setting-icon">${icon('palette')}</span>
              <span><strong>Chat appearance</strong><small>Background and message colors</small></span>
              ${icon('chevron')}
            </button>
          </section>
          <section class="panel-card group-members-section">
            <header class="group-section-head">
              <span><strong>Members</strong><small>${group.memberCount}</small></span>
              ${group.canAddMembers ? `<button class="group-add-link" data-action="add-group-people">${icon('plus')} Add people</button>` : ''}
            </header>
            <div class="group-member-list">
              ${(group.members || []).map((member) => {
                const isOwner = member.id === group.ownerId;
                const isAdmin = isOwner || (group.adminIds || []).includes(member.id);
                const canManage = group.isAdmin && member.id !== state.me.id && !isOwner;
                return `
                  <article class="group-member-row">
                    <button class="group-member-identity" data-action="view-user-profile" data-username="${esc(member.username)}">
                      ${avatarHtml(member)}
                      <span><strong>${esc(member.displayName)}</strong><small>@${esc(member.username)}${isOwner ? ' · Owner' : isAdmin ? ' · Admin' : ''}</small></span>
                    </button>
                    ${canManage ? `<button class="icon-btn" data-action="group-member-menu" data-user-id="${esc(member.id)}" aria-label="Manage ${esc(member.displayName)}">${icon('more')}</button>` : ''}
                  </article>
                `;
              }).join('')}
            </div>
            ${group.isAdmin ? `
              <label class="switch-row group-invite-switch">
                <span><strong>Members can add people</strong><small>Friends can invite their own friends to this group.</small></span>
                <input type="checkbox" data-action="toggle-group-member-adds" ${group.membersCanAdd ? 'checked' : ''}>
              </label>
            ` : ''}
          </section>
          <section class="panel-card group-chat-actions">
            <button class="profile-setting-link" data-action="export-chat" data-format="json">${icon('download')}<span><strong>Export group chat</strong><small>Save messages as JSON</small></span>${icon('chevron')}</button>
            <button class="profile-setting-link danger-text" data-action="leave-group">${icon('logout')}<span><strong>Leave group</strong><small>You will stop receiving new messages.</small></span>${icon('chevron')}</button>
          </section>
        </section>
      </main>
    `;
  }

  function renderGroupSelectedPeople(selectedIds = []) {
    return selectedIds.map((userId) => {
      const member = userById(userId);
      return member ? `<button data-action="toggle-group-person" data-user-id="${esc(userId)}">${avatarHtml(member)}<small>${esc(member.displayName)}</small>${icon('x')}</button>` : '';
    }).join('');
  }

  function renderGroupComposer() {
    const composer = state.groupComposer;
    if (!composer) return '';
    const mode = composer.mode || 'create';
    const group = state.activeGroup;
    if (mode === 'edit') {
      return `
        <div class="group-composer-overlay" data-action="close-group-composer">
          <section class="group-composer group-edit-composer" role="dialog" aria-modal="true" aria-label="Edit group" data-stop-close>
            <header><button class="icon-btn" data-action="close-group-composer" aria-label="Close">${icon('x')}</button><strong>Edit group</strong><button class="group-done-btn" data-action="save-group-edit">Done</button></header>
            <button class="group-edit-photo" data-action="choose-group-avatar" aria-label="Change group picture">
              ${composer.avatarPreview ? `<span class="avatar group-avatar large"><img src="${esc(composer.avatarPreview)}" alt=""></span>` : groupAvatarHtml(group, 'large')}
              <small>${icon('camera')} Change group picture</small>
            </button>
            <label class="group-name-field"><span>Group name</span><input id="group-name-input" maxlength="60" value="${esc(composer.name || '')}" autocomplete="off"></label>
          </section>
        </div>
      `;
    }
    const existingIds = new Set(group?.members?.map((member) => member.id) || []);
    const contacts = state.contacts
      .filter((contact) => !existingIds.has(contact.id));
    const selected = new Set(composer.selected || []);
    const minimum = mode === 'create' ? 2 : 1;
    return `
      <div class="group-composer-overlay" data-action="close-group-composer">
        <section class="group-composer group-composer-${mode}" role="dialog" aria-modal="true" aria-label="${mode === 'create' ? 'New group' : 'Add people'}" data-stop-close>
          <header>
            <button class="icon-btn" data-action="close-group-composer" aria-label="Close">${icon('x')}</button>
            <strong>${mode === 'create' ? 'New group' : 'Add people'}</strong>
            <button class="group-done-btn" data-action="${mode === 'create' ? 'create-group' : 'confirm-add-group-people'}" ${selected.size < minimum ? 'disabled' : ''}>${mode === 'create' ? 'Create' : 'Add'}</button>
          </header>
          ${mode === 'create' ? `<label class="group-name-field"><span>Name</span><input id="group-name-input" maxlength="60" placeholder="Group name (optional)" value="${esc(composer.name || '')}" autocomplete="off"></label>` : ''}
          <label class="group-people-search">${icon('search')}<input id="group-people-search" placeholder="Search friends" autocomplete="off" value="${esc(composer.query || '')}"></label>
          <div class="group-selected-strip ${selected.size ? 'has-selection' : ''}">${renderGroupSelectedPeople([...selected])}</div>
          <div class="group-contact-list">
            ${contacts.length ? contacts.map((contact) => `
              <button class="group-contact-row ${selected.has(contact.id) ? 'selected' : ''}" data-action="toggle-group-person" data-user-id="${esc(contact.id)}" data-search="${esc(`${contact.displayName} ${contact.username}`.toLowerCase())}">
                ${avatarHtml(contact)}<span><strong>${esc(contact.displayName)}</strong><small>@${esc(contact.username)}</small></span><i>${selected.has(contact.id) ? icon('check') : ''}</i>
              </button>
            `).join('') : ''}
            <p class="group-empty" data-group-empty ${contacts.length ? 'hidden' : ''}>No available friends match this search.</p>
          </div>
          <p class="group-privacy-note">Only friends who allow group invitations can be added.</p>
        </section>
      </div>
    `;
  }

  function updateGroupComposerSlot(options = {}) {
    const slot = document.getElementById('group-composer-slot');
    if (!slot) return renderApp();
    slot.innerHTML = renderGroupComposer();
    if (options.focus) setTimeout(() => document.getElementById(options.focus)?.focus({ preventScroll: true }), 0);
  }

  function syncGroupComposerSelection() {
    const composer = state.groupComposer;
    if (!composer || !['create', 'add'].includes(composer.mode)) return;
    const selected = new Set(composer.selected || []);
    const strip = document.querySelector('.group-selected-strip');
    if (strip) {
      strip.innerHTML = renderGroupSelectedPeople([...selected]);
      strip.classList.toggle('has-selection', Boolean(selected.size));
    }
    document.querySelectorAll('.group-contact-row').forEach((row) => {
      const checked = selected.has(row.dataset.userId);
      row.classList.toggle('selected', checked);
      const marker = row.querySelector(':scope > i');
      if (marker) marker.innerHTML = checked ? icon('check') : '';
    });
    const done = document.querySelector('.group-composer .group-done-btn');
    if (done) done.disabled = selected.size < (composer.mode === 'create' ? 2 : 1);
  }

  function filterGroupComposerPeople(query) {
    const term = String(query || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.group-contact-row').forEach((row) => {
      const match = !term || String(row.dataset.search || '').includes(term);
      row.hidden = !match;
      if (match) visible += 1;
    });
    const empty = document.querySelector('[data-group-empty]');
    if (empty) empty.hidden = visible > 0;
  }

  async function createGroup() {
    const composer = state.groupComposer;
    if (!composer || (composer.selected || []).length < 2) return;
    const data = await api('/api/groups', { method: 'POST', body: { name: composer.name || '', memberIds: composer.selected } });
    state.groupComposer = null;
    await refreshChatsOnly();
    state.groups = state.groups.some((group) => group.id === data.group.id) ? state.groups : [data.group, ...state.groups];
    await openGroup(data.group.id);
  }

  async function addGroupPeople() {
    const composer = state.groupComposer;
    if (!state.activeGroup || !composer?.selected?.length) return;
    const data = await api(`/api/groups/${encodeURIComponent(state.activeGroup.id)}/members`, { method: 'POST', body: { memberIds: composer.selected } });
    state.activeGroup = data.group;
    state.groupComposer = null;
    await refreshChatsOnly();
    renderApp({ scroll: 'preserve' });
  }

  async function saveGroupEdit() {
    const composer = state.groupComposer;
    if (!state.activeGroup || !composer) return;
    const body = { name: composer.name || state.activeGroup.name };
    if (composer.avatarFile) body.avatar = composer.avatarFile;
    const data = await api(`/api/groups/${encodeURIComponent(state.activeGroup.id)}`, { method: 'PATCH', body });
    state.activeGroup = data.group;
    state.groupComposer = null;
    await refreshChatsOnly();
    renderApp({ scroll: 'preserve' });
  }

  async function updateGroupSettings(patch) {
    if (!state.activeGroup) return;
    const data = await api(`/api/groups/${encodeURIComponent(state.activeGroup.id)}`, { method: 'PATCH', body: patch });
    state.activeGroup = data.group;
    await refreshChatsOnly();
    renderApp({ scroll: 'preserve' });
  }

  async function manageGroupMember(userId, action) {
    if (!state.activeGroup) return;
    let url = `/api/groups/${encodeURIComponent(state.activeGroup.id)}`;
    let method = 'POST';
    if (action === 'remove') {
      url += `/members/${encodeURIComponent(userId)}`;
      method = 'DELETE';
    } else {
      url += `/admins/${encodeURIComponent(userId)}`;
      method = action === 'demote' ? 'DELETE' : 'POST';
    }
    const data = await api(url, { method });
    state.activeGroup = data.group;
    state.actionSheet = null;
    await refreshChatsOnly();
    renderApp({ scroll: 'preserve' });
  }

  async function leaveGroup() {
    if (!state.activeGroup) return;
    await api(`/api/groups/${encodeURIComponent(state.activeGroup.id)}/leave`, { method: 'POST' });
    state.activeGroup = null;
    state.chatProfileOpen = false;
    state.messages = [];
    await refreshChatsOnly();
    renderApp();
  }

  function renderChatProfileSocialPage(peer) {
    const view = state.chatProfileSocialView === 'following' ? 'following' : 'followers';
    const users = view === 'followers' ? (peer.followers || []) : (peer.following || []);
    const empty = view === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
    const profileScrollKey = `chat-profile:${activeConversationKey()}:${view}`;
    return `
      <main class="chat-pane profile-pane">
        <header class="chat-header">
          <button class="icon-btn" title="Back" aria-label="Back" data-action="close-peer-social">${icon('back')}</button>
          <div class="chat-title">
            <strong>${esc(view === 'followers' ? 'Followers' : 'Following')}</strong>
            <small>@${esc(peer.username)}</small>
          </div>
        </header>
        <section class="chat-profile-content" data-scroll-memory="${esc(profileScrollKey)}">
          <div class="segmented social-switch is-${view} ${state.socialTransition ? `social-switch-${state.socialTransition}` : ''}">
            <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-peer-social" data-social="followers"><strong>${peer.followerCount ?? 0}</strong> Followers</button>
            <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-peer-social" data-social="following"><strong>${peer.followingCount ?? 0}</strong> Following</button>
          </div>
          <div class="social-user-list ${state.socialTransition ? `social-list-slide social-list-${state.socialTransition}` : ''}">
            ${users.length ? users.map((item) => renderAccountRow(item, { social: true })).join('') : `<div class="empty-state">${empty}</div>`}
          </div>
        </section>
      </main>
    `;
  }

  function renderMessage(message) {
    const mine = message.senderId === state.me.id;
    const highlighted = state.highlightMessageId === message.id;
    const stickerMessage = message.kind === 'sticker' && !message.deletedAt;
    const mediaMessage = ['image', 'video', 'gif'].includes(message.kind) && message.attachment && !message.deletedAt;
    const sharedPostMessage = message.kind === 'post' && !message.deletedAt;
    const sender = message.sender || userById(message.senderId);
    return `
      <article class="message ${mine ? 'mine' : 'theirs'} ${message.deletedAt ? 'deleted' : ''} ${highlighted ? 'highlighted' : ''} ${stickerMessage ? 'sticker-message' : ''} ${mediaMessage ? 'media-message' : ''} ${sharedPostMessage ? 'shared-post-message' : ''}" data-message-id="${esc(message.id)}">
        ${message.pinnedAt ? `<span class="message-context-label">${icon('pin')} Pinned</span>` : ''}
        ${state.activeGroup && sender ? `<span class="group-message-sender" title="${esc(sender.displayName || sender.username)}">${avatarHtml(sender)}</span>` : ''}
        <div class="bubble">
          ${message.forwardedFrom ? '<span class="forwarded-label">Forwarded</span>' : ''}
          ${message.replyPreview ? `<div class="reply-preview">${esc(describeMessage(message.replyPreview)).slice(0, 160)}</div>` : ''}
          ${renderMessageBody(message)}
          ${renderMessageStickerOverlays(message)}
          <div class="swipe-time">${esc(formatTime(message.createdAt))}</div>
        </div>
        ${renderMessageReactions(message)}
      </article>
    `;
  }

  function renderMessageStickerOverlays(message) {
    const stickers = message.messageStickers || [];
    if (!stickers.length) return '';
    return `<span class="message-sticker-overlays">${stickers.map((sticker, index) => `
      <img src="${esc(sticker.file?.url || '')}" alt="" style="--sticker-index:${index}" draggable="false">
    `).join('')}</span>`;
  }

  function renderMessageReactions(message) {
    const reactions = message.reactions || [];
    if (!reactions.length) return '';
    return `<div class="message-reactions">${reactions.map((reaction) => `
      <button data-action="react-message" data-message-id="${esc(message.id)}" data-emoji="${esc(reaction.emoji)}" class="${(reaction.userIds || []).includes(state.me?.id) ? 'mine' : ''}">
        <span>${esc(reaction.emoji)}</span>${reaction.count > 1 ? `<small>${reaction.count}</small>` : ''}
      </button>
    `).join('')}</div>`;
  }

  function messageReactionOptions() {
    return ['\u2764\ufe0f', '\ud83d\ude02', '\ud83d\ude2e', '\ud83d\ude22', '\ud83d\ude21', '\ud83d\udd25'];
  }

  function renderMessageFocus() {
    const focus = state.messageFocus;
    if (!focus) return '';
    const message = state.messages.find((item) => item.id === focus.messageId);
    if (!message) return '';
    const mine = message.senderId === state.me.id;
    return `
      <div class="message-focus-overlay ${state.messageFocusClosing ? 'closing' : ''}" style="${esc(chatAppearanceStyle())}" data-action="close-message-focus" role="dialog" aria-modal="true" aria-label="Message actions" tabindex="-1">
        <section class="message-focus-stage ${mine ? 'mine' : 'theirs'}">
          <div class="message-focus-actions">
        <div class="message-reaction-bar" data-stop-close>
          ${messageReactionOptions().map((emoji) => `<button data-action="react-message" data-message-id="${esc(message.id)}" data-emoji="${esc(emoji)}" class="${(message.reactions || []).some((reaction) => reaction.emoji === emoji && (reaction.userIds || []).includes(state.me.id)) ? 'active' : ''}">${esc(emoji)}</button>`).join('')}
          <button data-action="message-more" data-message-id="${esc(message.id)}" aria-label="More">${icon('plus')}</button>
        </div>
        <div class="message-focus-host"></div>
        <div class="message-action-menu" data-stop-close>
          <button data-action="focus-reply" data-message-id="${esc(message.id)}">${icon('back')}<span>Reply</span></button>
          <button data-action="message-focus-mode" data-mode="sticker">${icon('sticker')}<span>Sticker</span></button>
          <button data-action="message-focus-mode" data-mode="forward">${icon('forward')}<span>Forward</span></button>
          <button data-action="toggle-message-pin" data-message-id="${esc(message.id)}">${icon('pin')}<span>${message.pinnedAt ? 'Unpin' : 'Pin'}</span></button>
          <button data-action="hide-message" data-message-id="${esc(message.id)}">${icon('trash')}<span>Delete for me</span></button>
        </div>
          </div>
          <div class="message-focus-picker-slot"></div>
        </section>
      </div>
    `;
  }

  function renderMessageFocusPicker(mode, message) {
    if (mode === 'forward') return `
      <section class="message-focus-picker" data-stop-close>
        <header><button data-action="message-focus-mode" data-mode="actions" aria-label="Back">${icon('back')}</button><strong>Forward to</strong></header>
        <div class="message-focus-list">
          ${state.chats.length ? state.chats.map((chat) => `
            <button data-action="forward-message" data-message-id="${esc(message.id)}" data-user-id="${esc(chat.peer.id)}">
              ${avatarHtml(chat.peer)}<span><strong>${esc(chat.peer.displayName)}</strong><small>@${esc(chat.peer.username)}</small></span><b>Send</b>
            </button>
          `).join('') : ''}
          ${state.groups.map((group) => `
            <button data-action="forward-message" data-message-id="${esc(message.id)}" data-group-id="${esc(group.id)}">
              ${groupAvatarHtml(group)}<span><strong>${esc(group.name)}</strong><small>${group.memberCount} members</small></span><b>Send</b>
            </button>
          `).join('')}
          ${!state.chats.length && !state.groups.length ? '<p>No chats available.</p>' : ''}
        </div>
      </section>
    `;
    if (mode === 'sticker') return `
      <section class="message-focus-picker sticker-picker" data-stop-close>
        <header><button data-action="message-focus-mode" data-mode="actions" aria-label="Back">${icon('back')}</button><strong>Add a sticker</strong></header>
        <div class="message-focus-stickers">
          ${availableChatStickers().map((sticker) => `<button data-action="attach-message-sticker" data-message-id="${esc(message.id)}" data-sticker-id="${esc(sticker.id)}"><img src="${esc(sticker.dataUrl)}" alt="${esc(sticker.name)}"></button>`).join('')}
        </div>
      </section>
    `;
    return '';
  }

  function renderTypingIndicator() {
    const groupTyping = state.activeGroup && state.typingGroup?.groupId === state.activeGroup.id;
    if (!groupTyping && (!state.activePeer || state.typingPeerId !== state.activePeer.id)) return '';
    const typer = groupTyping ? userById(state.typingGroup.userId) : state.activePeer;
    return `
      <article class="typing-message">
        ${groupTyping && typer ? avatarHtml(typer) : ''}
        <div class="typing-bubble">typing...</div>
      </article>
    `;
  }

  function renderMessagesList() {
    const olderLoader = state.loadingOlderMessages ? '<div class="older-loader"><span class="spinner"></span></div>' : '';
    const openingLoader = state.chatLoading ? '<div class="chat-loading-indicator" role="status" aria-label="Loading messages"><span class="spinner"></span></div>' : '';
    if (state.messages.length) return `${openingLoader}${olderLoader}${state.messages.map(renderMessage).join('')}${renderTypingIndicator()}`;
    if (state.chatLoading) return '<div class="chat-loading-state" role="status"><span class="spinner"></span><small>Loading messages</small></div>';
    if ((state.activePeer && state.typingPeerId === state.activePeer.id) || (state.activeGroup && state.typingGroup?.groupId === state.activeGroup.id)) return renderTypingIndicator();
    return '<div class="empty-state">No messages yet. Send the first one.</div>';
  }

  function reportReasons() {
    return [
      'Spam or scam',
      'Harassment or bullying',
      'Hate or abuse',
      'Sexual content',
      'Violence or threat',
      'Impersonation',
      'Illegal or dangerous activity',
      'Other'
    ];
  }

  function renderRelationshipButton(user) {
    if (!user || user.id === state.me?.id) return '<button class="mini-btn" disabled>You</button>';
    return `${renderSearchProfileActions(user)}<button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>`;
  }

  function renderSharedPostMessage(message) {
    const post = message.sharedPost;
    if (!post) {
      return `<div class="shared-post-unavailable">${icon('clips')}<span><strong>Post unavailable</strong><small>It may have been deleted or made private.</small></span></div>`;
    }
    const author = postAuthor(post);
    const item = postMediaItems(post)[0];
    const media = item?.media;
    const isVideo = item?.mediaType === 'video' || String(media?.mime || '').startsWith('video/');
    const label = post.isClip || isVideo ? 'Watch clip' : 'View post';
    return `
      <button class="shared-post-card" data-action="open-shared-post" data-post-id="${esc(post.id)}" aria-label="${esc(`${label} by ${author?.username || 'user'}`)}">
        <span class="shared-post-author">${author ? avatarHtml(author) : ''}<span><strong>${esc(author?.username || 'user')}</strong><small>${post.isClip || isVideo ? 'Clip' : 'Post'}</small></span></span>
        <span class="shared-post-media">
          ${media?.url
            ? (isVideo
              ? `<video src="${esc(media.url)}" muted playsinline webkit-playsinline preload="metadata" disablepictureinpicture disableremoteplayback aria-hidden="true"></video><i class="shared-post-play">${icon('play')}</i>`
              : `<img src="${esc(media.url)}" alt="" loading="lazy">`)
            : `<i class="shared-post-missing">${icon('clips')}</i>`}
        </span>
        <span class="shared-post-copy"><strong>${label}</strong>${post.description ? `<small>${esc(String(post.description).slice(0, 100))}</small>` : ''}</span>
      </button>
      ${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}
    `;
  }

  function renderMessageBody(message) {
    if (message.deletedAt) return '<div class="message-text">Message deleted</div>';
    if (message.kind === 'post') return renderSharedPostMessage(message);
    const attachment = message.attachment;
    if (message.kind === 'gif' && attachment) {
      const credit = message.mediaCredit;
      return `<img class="chat-gif" src="${esc(attachment.url)}" alt="${esc(attachment.name || 'GIF')}" data-action="open-media" data-src="${esc(attachment.url)}" data-name="${esc(attachment.name || 'GIF')}" data-type="${esc(attachment.mime || 'image/gif')}">${credit?.creator ? `<a class="chat-gif-credit" href="${esc(credit.sourceUrl || credit.licenseUrl || '#')}" ${credit.sourceUrl || credit.licenseUrl ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(credit.creator)} · ${esc(credit.license || credit.provider || 'Openverse')}</a>` : ''}${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
    }
    if (message.kind === 'image' && attachment) {
      return `<img class="media-image" src="${esc(attachment.url)}" alt="${esc(attachment.name)}" data-action="open-media" data-src="${esc(attachment.url)}" data-name="${esc(attachment.name)}" data-type="${esc(attachment.mime || 'image/*')}">${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
    }
    if (message.kind === 'video' && attachment) {
      return `<video class="media-video" src="${esc(attachment.url)}" controls playsinline preload="metadata"></video>${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
    }
    if (message.kind === 'voice' && attachment) {
      return `
        <button class="voice-note" data-action="toggle-voice" data-message-id="${esc(message.id)}">
          <span class="voice-play">${icon('play')}</span>
          <span class="voice-wave">${Array.from({ length: 18 }, (_, index) => `<i style="--h:${24 + ((index * 17) % 42)}%"></i>`).join('')}</span>
          <span class="voice-time">Voice</span>
          <audio src="${esc(attachment.url)}" preload="metadata"></audio>
        </button>
        ${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}
      `;
    }
    if (message.kind === 'document' && attachment) {
      return `
        <div class="doc-tile">
          <span>DOC</span>
          <span class="person">
            <strong>${esc(attachment.name)}</strong>
            <small>${esc(attachment.mime)} - ${Math.ceil(attachment.size / 1024)} KB</small>
          </span>
        </div>
        ${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}
      `;
    }
    if (message.kind === 'sticker' && attachment) {
      const local = state.stickerMap.get(message.stickerId);
      if (local) return `<img class="sticker-img" src="${esc(local.dataUrl)}" alt="${esc(local.name)}" data-action="open-sticker-save" data-message-id="${esc(message.id)}">`;
      return `
        <button class="sticker-download-placeholder" data-action="download-sticker" data-message-id="${esc(message.id)}">
          ${icon('download')}<span>Download sticker</span>
        </button>
      `;
    }
    return `<div class="message-text">${esc(message.text || '')}</div>`;
  }

  function presetStickerSvg(content, animation, from, to) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><style>.p{transform-box:fill-box;transform-origin:center;animation:${animation} 1.25s ease-in-out infinite}@keyframes wave{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(18deg)}}@keyframes pop{0%,100%{transform:scale(.9)}50%{transform:scale(1.08)}}@keyframes float{0%,100%{transform:translateY(14px)}50%{transform:translateY(-16px)}}@keyframes flicker{0%,100%{opacity:1}45%{opacity:.42}52%{opacity:1}58%{opacity:.2}}</style><circle cx="256" cy="256" r="204" fill="url(#g)" fill-opacity=".18"/><text class="p" x="256" y="278" text-anchor="middle" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-size="184" font-weight="900" fill="#fff">${content}</text></svg>`)}`;
  }

  function chatStickerPresets() {
    return [
      { id: 'preset_wave', name: 'Wave', dataUrl: presetStickerSvg('&#x1F44B;', 'wave', '#285f88', '#6c63ff'), animated: true, preset: true },
      { id: 'preset_heart', name: 'Heart', dataUrl: presetStickerSvg('&#x2764;', 'pop', '#ff304f', '#ff4fa3'), animated: true, preset: true },
      { id: 'preset_fire', name: 'Fire', dataUrl: presetStickerSvg('&#x1F525;', 'float', '#ff8a00', '#ff304f'), animated: true, preset: true },
      { id: 'preset_lol', name: 'LOL', dataUrl: presetStickerSvg('LOL', 'pop', '#2f8b83', '#285f88'), animated: true, preset: true },
      { id: 'preset_wow', name: 'WOW', dataUrl: presetStickerSvg('WOW', 'flicker', '#9f7cff', '#ff4fa3'), animated: true, preset: true },
      { id: 'preset_hi', name: 'HI', dataUrl: presetStickerSvg('HI', 'float', '#23836f', '#2f8b83'), animated: true, preset: true }
    ];
  }

  function availableChatStickers() {
    const presets = chatStickerPresets().map((preset) => state.stickerMap.get(preset.id) || preset);
    const presetIds = new Set(presets.map((preset) => preset.id));
    return [...presets, ...state.stickers.filter((sticker) => !presetIds.has(sticker.id))];
  }

  function loadStickerSets() {
    try {
      const parsed = JSON.parse(localStorage.getItem('chat-sticker-sets') || '[]');
      state.stickerSets = Array.isArray(parsed) ? parsed.slice(0, 24).map((set) => ({
        id: String(set.id || `set_${cryptoRandom()}`).slice(0, 80),
        name: String(set.name || 'Sticker set').slice(0, 30),
        stickerIds: Array.from(new Set(Array.isArray(set.stickerIds) ? set.stickerIds.map(String) : [])).slice(0, 80)
      })) : [];
    } catch {
      state.stickerSets = [];
    }
    if (state.activeStickerSet !== 'all' && !state.stickerSets.some((set) => set.id === state.activeStickerSet)) {
      state.activeStickerSet = 'all';
    }
  }

  function saveStickerSets() {
    localStorage.setItem('chat-sticker-sets', JSON.stringify(state.stickerSets));
  }

  function activeSetStickers() {
    const all = availableChatStickers();
    if (state.activeStickerSet === 'all') return all;
    const set = state.stickerSets.find((item) => item.id === state.activeStickerSet);
    const ids = new Set(set?.stickerIds || []);
    return all.filter((sticker) => ids.has(sticker.id));
  }

  function addStickerToActiveSet(stickerId) {
    if (state.activeStickerSet === 'all') return;
    const set = state.stickerSets.find((item) => item.id === state.activeStickerSet);
    if (!set || set.stickerIds.includes(stickerId)) return;
    set.stickerIds.push(stickerId);
    saveStickerSets();
  }

  function renderStickerManager() {
    if (state.stickerSetEditor) {
      const editor = state.stickerSetEditor;
      const selected = new Set(editor.stickerIds || []);
      return `
        <div class="sticker-manager-overlay" data-action="close-sticker-manager">
          <section class="sticker-manager-sheet" data-stop-close>
            <header><button data-action="close-sticker-manager" aria-label="Close">${icon('x')}</button><strong>${editor.id ? 'Edit sticker set' : 'New sticker set'}</strong><button class="sticker-manager-save" data-action="save-sticker-set">Save</button></header>
            <label class="sticker-set-name"><span>Name</span><input id="sticker-set-name" maxlength="30" value="${esc(editor.name || '')}" placeholder="Sticker set name" autocomplete="off"></label>
            <div class="sticker-manager-grid">
              ${state.stickers.length ? state.stickers.map((sticker) => `<button class="${selected.has(sticker.id) ? 'selected' : ''}" data-action="toggle-sticker-set-item" data-sticker-id="${esc(sticker.id)}"><img src="${esc(sticker.dataUrl)}" alt="${esc(sticker.name)}"><span>${icon('check')}</span></button>`).join('') : '<p>Create or download a sticker first.</p>'}
            </div>
            ${editor.id ? `<button class="sticker-set-delete" data-action="delete-sticker-set" data-set-id="${esc(editor.id)}">Delete set</button>` : ''}
          </section>
        </div>
      `;
    }
    if (state.stickerSavePrompt) {
      const prompt = state.stickerSavePrompt;
      const sticker = state.stickerMap.get(prompt.stickerId);
      if (!sticker) return '';
      return `
        <div class="sticker-manager-overlay sticker-save-overlay" data-action="close-sticker-save">
          <section class="sticker-save-sheet" data-stop-close>
            <button class="sticker-save-close" data-action="close-sticker-save" aria-label="Close">${icon('x')}</button>
            <img src="${esc(sticker.dataUrl)}" alt="${esc(sticker.name)}">
            <strong>${esc(sticker.name)}</strong>
            <small>Saved to your device</small>
            <div class="sticker-save-sets">
              ${state.stickerSets.map((set) => `<button class="${set.stickerIds.includes(sticker.id) ? 'active' : ''}" data-action="toggle-sticker-in-set" data-set-id="${esc(set.id)}" data-sticker-id="${esc(sticker.id)}">${set.stickerIds.includes(sticker.id) ? icon('check') : icon('plus')}<span>${esc(set.name)}</span></button>`).join('')}
              <button data-action="new-sticker-set" data-sticker-id="${esc(sticker.id)}">${icon('plus')}<span>New set</span></button>
            </div>
          </section>
        </div>
      `;
    }
    return '';
  }

  function renderStickerPanel() {
    const tab = state.chatTrayTab === 'gifs' ? 'gifs' : 'stickers';
    const gifQuery = state.chatGifQuery.trim().toLowerCase();
    const localGifs = state.gifPool.filter((gif) => !gifQuery || `${gif.title} ${(gif.tags || []).join(' ')}`.toLowerCase().includes(gifQuery));
    const catalogGifs = state.chatGifResults || [];
    const gifs = [...localGifs, ...catalogGifs];
    return `
      <section class="sticker-panel chat-media-tray ${tab === 'stickers' ? 'stickers-tray' : 'gifs-tray'}">
        <header class="chat-tray-head">
          <div class="chat-tray-tabs" role="tablist">
            <button class="${tab === 'stickers' ? 'active' : ''}" data-action="set-chat-tray" data-tray="stickers" role="tab" aria-selected="${tab === 'stickers'}" aria-label="Stickers">${icon('sticker')}</button>
            <button class="${tab === 'gifs' ? 'active' : ''}" data-action="set-chat-tray" data-tray="gifs" role="tab" aria-selected="${tab === 'gifs'}" aria-label="GIFs">${icon('gif')}</button>
          </div>
          <button class="icon-btn chat-tray-close" data-action="sticker-toggle" aria-label="Close">${icon('x')}</button>
        </header>
        ${tab === 'stickers' ? `
          <div class="chat-tray-actions">
            <button data-action="open-sticker-creator">${icon('text')}<span>Create</span></button>
            <button data-action="sticker-file-open">${icon('file')}<span>Photo</span></button>
            <input id="sticker-file-input" type="file" accept="image/*" hidden>
          </div>
          <div class="sticker-set-rail">
            <button class="${state.activeStickerSet === 'all' ? 'active' : ''}" data-action="select-sticker-set" data-set-id="all">All</button>
            ${state.stickerSets.map((set) => `<button class="${state.activeStickerSet === set.id ? 'active' : ''}" data-action="select-sticker-set" data-set-id="${esc(set.id)}">${esc(set.name)}</button>`).join('')}
            <button class="sticker-set-add" data-action="new-sticker-set" aria-label="New sticker set">${icon('plus')}</button>
            ${state.activeStickerSet !== 'all' ? `<button class="sticker-set-edit" data-action="edit-sticker-set" data-set-id="${esc(state.activeStickerSet)}" aria-label="Edit sticker set">${icon('edit')}</button>` : ''}
          </div>
          <div class="sticker-grid">
            ${activeSetStickers().length ? activeSetStickers().map((sticker) => `
              <button class="sticker-tile ${sticker.animated ? 'animated-sticker' : ''}" title="${esc(sticker.name)}" data-action="send-sticker" data-sticker-id="${esc(sticker.id)}">
                <img src="${esc(sticker.dataUrl)}" alt="${esc(sticker.name)}">${sticker.animated ? '<span class="animated-mark">GIF</span>' : ''}
              </button>
            `).join('') : '<p class="sticker-set-empty">This set is empty.</p>'}
          </div>
        ` : `
          <div class="chat-gif-search">
            ${icon('search')}<input id="chat-gif-search" value="${esc(state.chatGifQuery)}" placeholder="Search GIFs" aria-label="Search GIFs" autocomplete="off">
            <button data-action="chat-gif-upload" aria-label="Upload GIF">${icon('plus')}</button>
            <input id="chat-gif-input" type="file" accept="image/gif,image/webp" hidden>
          </div>
          <div class="chat-gif-grid">
            ${localGifs.map((gif) => `<button data-action="send-gif" data-gif-id="${esc(gif.id)}" data-search="${esc(`${gif.title} ${(gif.tags || []).join(' ')}`.toLowerCase())}" aria-label="Send ${esc(gif.title)}" ${state.sendingGifId ? 'disabled' : ''}><img src="${esc(gif.file?.url || '')}" alt="${esc(gif.title)}" loading="lazy"></button>`).join('')}
            ${catalogGifs.map((gif) => `<button class="catalog-gif ${state.sendingGifId === gif.id ? 'sending' : ''}" data-action="send-gif" data-gif-id="${esc(gif.id)}" data-search="${esc(`${gif.title} ${gif.creator || ''}`.toLowerCase())}" aria-label="Send ${esc(gif.title)} by ${esc(gif.creator || 'unknown creator')}" ${state.sendingGifId ? 'disabled' : ''}><img src="${esc(gif.file?.url || '')}" alt="${esc(gif.title)}" loading="lazy"><small>${state.sendingGifId === gif.id ? 'Sending…' : esc(gif.creator || gif.license || 'Openverse')}</small></button>`).join('')}
            ${state.chatGifLoading ? '<div class="chat-gif-loading"><i></i><span>Searching GIFs…</span></div>' : ''}
            ${state.chatGifError ? `<p class="chat-gif-empty is-error">${esc(state.chatGifError)} <button data-action="retry-chat-gif-search">Try again</button></p>` : `<p class="chat-gif-empty" ${gifs.length || state.chatGifLoading ? 'hidden' : ''}>No matching GIFs. Try another word or upload your own.</p>`}
          </div>
          <footer class="chat-gif-provider"><a href="https://openverse.org" target="_blank" rel="noopener noreferrer">Openverse</a><span>Creator and license stay attached when sent</span></footer>
        `}
      </section>
    `;
  }

  function renderNotificationsPage() {
    const requests = state.requests.length ? state.requests.map((request) => `
      <article class="notification-row">
        <a class="notification-identity" href="${esc(accountProfileHref(request.from))}" data-action="view-user-profile" data-username="${esc(request.from.username)}">
          ${avatarHtml(request.from)}
          <span class="person">
            <strong>${esc(request.from.displayName)}</strong>
            <small>@${esc(request.from.username)} requested to add you</small>
          </span>
        </a>
        <span class="toolbar">
          <button class="mini-btn" data-action="accept-request" data-request-id="${esc(request.id)}">Accept</button>
          <button class="mini-btn danger" data-action="decline-request" data-request-id="${esc(request.id)}">Decline</button>
        </span>
      </article>
    `).join('') : '<p class="hint">No unanswered requests.</p>';
    const visibleNotes = state.notifications.filter((note) => ['request_accepted', 'new_follower', 'mention', 'comment_reply', 'comment_like', 'group_added', 'post_tag', 'post_like', 'post_repost', 'post_comment'].includes(note.type));
    const recent = visibleNotes.length ? visibleNotes.map((note) => `
      <article class="notification-row">
        ${note.group ? `
          <button class="notification-identity" data-action="open-group" data-group-id="${esc(note.group.id)}">
            ${groupAvatarHtml(note.group)}
            <span class="person"><strong>${esc(note.group.name)}</strong><small>${esc(note.text || 'You were added to a group')} - ${esc(shortTime(note.createdAt))}</small></span>
          </button>
        ` : note.actor ? `
          <a class="notification-identity" href="${esc(accountProfileHref(note.actor))}" data-action="view-user-profile" data-username="${esc(note.actor.username)}">
            ${avatarHtml(note.actor)}
            <span class="person">
              <strong>${esc(note.actor.displayName || 'Update')}</strong>
              <small>${esc(note.text || note.type)} - ${esc(shortTime(note.createdAt))}</small>
            </span>
          </a>
        ` : `<span class="person"><strong>Update</strong><small>${esc(note.text || note.type)} - ${esc(shortTime(note.createdAt))}</small></span>`}
      </article>
    `).join('') : '<p class="hint">Follower updates will appear here.</p>';
    return `
      <section class="notifications-page">
        <header class="page-header">
          <button class="icon-btn" data-action="back-from-notifications" aria-label="Back">${icon('back')}</button>
          <h2>Notifications</h2>
        </header>
        <h3>Requests</h3>
        <div class="notification-list">${requests}</div>
        <h3>Recent</h3>
        <div class="notification-list">${recent}</div>
        <div class="notification-suggestions-head"><h3>Suggested for you</h3><small>Accounts you may want to follow</small></div>
        <div class="notification-list notification-suggestion-list">
          ${visibleRecommendations().length ? visibleRecommendations().slice(0, 12).map((user) => renderAccountRow(user, { dismissible: true })).join('') : '<p class="hint">No new suggestions right now.</p>'}
        </div>
      </section>
    `;
  }

  function renderNotificationPermissionPrompt() {
    const canPrompt = state.messageNotifications &&
      !state.notificationPromptDismissed &&
      'Notification' in window &&
      window.isSecureContext &&
      Notification.permission === 'default';
    if (!canPrompt) return '';
    return `
      <section class="notification-permission">
        <span class="notification-permission-icon">${icon('bell')}</span>
        <span class="notification-permission-copy">
          <strong>Turn on notifications</strong>
          <small>Messages, requests, and mentions</small>
        </span>
        <button class="mini-btn notification-enable" data-action="enable-notifications">Turn on</button>
        <button class="notification-prompt-close" data-action="dismiss-notification-prompt" aria-label="Dismiss">${icon('x')}</button>
      </section>
    `;
  }

  function renderToastStack() {
    if (!state.toasts.length) return '';
    return `
      <aside class="toast-stack" aria-live="polite" aria-atomic="false">
        ${state.toasts.map((toast) => `
          <article class="app-toast" data-toast-id="${esc(toast.id)}">
            <button class="toast-main" data-action="open-toast" data-toast-id="${esc(toast.id)}">
              ${toast.actor ? avatarHtml(toast.actor) : `<span class="toast-symbol">${icon(toast.kind === 'message' ? 'messages' : 'bell')}</span>`}
              <span class="toast-copy">
                <strong>${esc(toast.title)}</strong>
                <small>${esc(toast.body)}</small>
              </span>
            </button>
            <button class="toast-close" data-action="dismiss-toast" data-toast-id="${esc(toast.id)}" aria-label="Dismiss">${icon('x')}</button>
          </article>
        `).join('')}
      </aside>
    `;
  }

  function storyCommentPosting(sheet) {
    return Boolean(sheet?.commentPosting || (sheet?.storyId && state.storyCommentPosting.has(sheet.storyId)));
  }

  function renderStoryCommentGifChoices(storyId, sheet) {
    const query = String(sheet?.gifQuery || '').trim().toLowerCase();
    const posting = storyCommentPosting(sheet);
    const matching = state.gifPool.filter((gif) => (
      !query || `${gif.title} ${(gif.tags || []).join(' ')}`.toLowerCase().includes(query)
    ));
    return `${state.gifPool.map((gif) => {
      const search = `${gif.title} ${(gif.tags || []).join(' ')}`.toLowerCase();
      const sending = posting && sheet?.postingGifId === gif.id;
      return `<button class="${sending ? 'is-sending' : ''}" data-action="send-story-comment-gif" data-story-id="${esc(storyId)}" data-gif-id="${esc(gif.id)}" data-search="${esc(search)}" aria-label="Comment with ${esc(gif.title || 'GIF')}" ${query && !search.includes(query) ? 'hidden' : ''} ${posting ? 'disabled' : ''}><img src="${esc(gif.file?.url || '')}" alt="${esc(gif.title || 'GIF')}" loading="lazy"></button>`;
    }).join('')}<p class="story-comment-gif-empty" ${matching.length ? 'hidden' : ''}>No approved GIFs found.</p>`;
  }

  function updateStoryCommentGifChoices(sheet) {
    if (state.actionSheet !== sheet || sheet?.type !== 'story-comments' || !sheet.gifPickerOpen) return;
    const grid = document.querySelector('.story-comment-gif-grid');
    if (grid) grid.innerHTML = renderStoryCommentGifChoices(sheet.storyId, sheet);
  }

  function renderPostCommentsSheet(post, sheet) {
    if (!post) return '<p class="hint">Post not found.</p>';
    const comments = (post.comments || []).filter((comment) => comment?.user && String(comment.text || '').trim());
    const posting = Boolean(sheet.commentPosting);
    const creator = postAuthor(post);
    const commentById = new Map(comments.map((comment) => [comment.id, comment]));
    const rootIdFor = (comment) => {
      let current = comment;
      const visited = new Set();
      while (current?.replyTo && commentById.has(current.replyTo) && !visited.has(current.replyTo)) {
        visited.add(current.id);
        current = commentById.get(current.replyTo);
      }
      return current?.id || comment.id;
    };
    const roots = comments.filter((comment) => !comment.replyTo || !commentById.has(comment.replyTo));
    const repliesByRoot = new Map(roots.map((comment) => [comment.id, []]));
    comments.forEach((comment) => {
      const rootId = rootIdFor(comment);
      if (rootId === comment.id) return;
      if (!repliesByRoot.has(rootId)) repliesByRoot.set(rootId, []);
      repliesByRoot.get(rootId).push(comment);
    });
    const expandedCommentIds = new Set(sheet.expandedCommentIds || []);
    const replyComment = commentById.get(sheet.replyToCommentId) || null;
    if (replyComment) expandedCommentIds.add(rootIdFor(replyComment));
    let commentOrder = 0;
    const renderCommentRow = (comment, isReply = false) => {
      const username = comment.user.username || 'user';
      const likeLabel = comment.likeCount === 1 ? '1 like' : `${comment.likeCount || 0} likes`;
      const order = commentOrder++;
      return `
        <article class="story-comment-row post-comment-row ${isReply ? 'reply' : ''} ${comment.pinned ? 'is-pinned' : ''} ${sheet.newCommentId === comment.id ? 'just-posted' : ''}" data-comment-id="${esc(comment.id)}" style="--comment-order:${Math.min(order, 12)}">
          <button class="story-comment-avatar" data-action="view-user-profile" data-username="${esc(username)}" aria-label="View ${esc(username)}'s profile">${avatarHtml(comment.user)}</button>
          <div class="story-comment-content">
            <p><button class="comment-username" data-action="view-user-profile" data-username="${esc(username)}">${esc(username)}</button> <span>${renderMentionText(comment.text || '')}</span></p>
            <div class="story-comment-meta">
              <time datetime="${esc(comment.createdAt)}" title="${esc(formatTime(comment.createdAt))}">${esc(compactRelativeTime(comment.createdAt))}</time>
              <span class="story-comment-like-count ${comment.likeCount ? '' : 'is-empty'}" data-post-comment-like-count="${esc(comment.id)}">${esc(likeLabel)}</span>
              ${comment.pinned ? `<span class="post-comment-pinned">${icon('pin')} Pinned</span>` : ''}
              <button data-action="reply-post-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}" ${posting ? 'disabled' : ''}>Reply</button>
              ${comment.canPin ? `<button data-action="toggle-post-comment-pin" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}">${comment.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
              ${comment.canDelete ? `<button class="post-comment-delete" data-action="delete-post-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}">Delete</button>` : ''}
            </div>
            ${comment.likedByCreator ? `<span class="post-comment-creator-like" title="Liked by ${esc(creator?.username || 'the creator')}">${icon('heart')} Liked by creator</span>` : ''}
          </div>
          <button class="story-comment-like post-comment-like ${comment.likedByMe ? 'active' : ''}" data-action="toggle-post-comment-like" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}" aria-label="${comment.likedByMe ? 'Unlike' : 'Like'} comment" aria-pressed="${comment.likedByMe ? 'true' : 'false'}">${icon('heart')}</button>
        </article>
      `;
    };
    const commentThreads = roots.map((comment) => {
      const replies = repliesByRoot.get(comment.id) || [];
      const expanded = expandedCommentIds.has(comment.id);
      return `
        <section class="story-comment-thread post-comment-thread" data-thread-id="${esc(comment.id)}">
          ${renderCommentRow(comment)}
          ${replies.length ? `
            <button class="story-comment-replies-toggle" data-action="toggle-post-comment-replies" data-comment-id="${esc(comment.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
              <i aria-hidden="true"></i><span>${expanded ? 'Hide replies' : `View ${replies.length === 1 ? '1 reply' : `all ${replies.length} replies`}`}</span>
            </button>
            <div class="story-comment-replies ${expanded ? 'expanded' : ''}">
              ${expanded ? replies.map((reply) => renderCommentRow(reply, true)).join('') : ''}
            </div>
          ` : ''}
        </section>
      `;
    }).join('');
    const quickReactions = ['❤️', '🙌', '🔥', '👏', '😂', '😍'];
    return `
      <header class="story-comments-head">
        <span class="story-sheet-grabber" aria-hidden="true"></span>
        <strong>Comments</strong>
        <button class="story-sheet-icon" data-action="close-overlays" aria-label="Close comments">${icon('x')}</button>
      </header>
      <div class="story-comment-list post-comment-list" role="feed" aria-label="Post comments">
        ${commentThreads || `
          <div class="story-comments-empty">
            <span>${icon('comment')}</span>
            <strong>No comments yet</strong>
            <small>Start the conversation.</small>
          </div>
        `}
      </div>
      ${post.allowComments === false ? `
        <div class="post-comments-disabled">${icon('comment')}<span><strong>Comments are off</strong><small>The author has limited replies on this post.</small></span></div>
      ` : `
        <form class="story-comment-composer post-comment-composer" data-form="post-comment" data-post-id="${esc(post.id)}" aria-busy="${posting}">
          ${replyComment ? `<div class="comment-replying"><span>Replying to <strong>${esc(replyComment.user?.username || 'user')}</strong></span><button type="button" data-action="clear-post-comment-reply" aria-label="Cancel reply" ${posting ? 'disabled' : ''}>${icon('x')}</button></div>` : ''}
          <div class="story-comment-quick-reactions" aria-label="Quick reactions">
            ${quickReactions.map((emoji) => `<button type="button" data-action="add-post-comment-emoji" data-emoji="${emoji}" ${posting ? 'disabled' : ''}>${emoji}</button>`).join('')}
          </div>
          <div class="story-comment-box">
            <button type="button" class="story-comment-composer-avatar" data-action="view-own-profile" aria-label="View your profile" ${posting ? 'disabled' : ''}>${avatarHtml(state.me)}</button>
            <div class="story-comment-field">
              <input id="post-comment-input" name="comment" maxlength="500" placeholder="Add a comment..." aria-label="Add a comment" autocomplete="off" enterkeyhint="send" value="${esc(sheet.commentDraft || '')}" ${posting ? 'disabled' : ''}>
              <button class="story-comment-post post-comment-submit" type="submit" ${posting || !String(sheet.commentDraft || '').trim() ? 'disabled' : ''}>Post</button>
            </div>
          </div>
        </form>
      `}
    `;
  }

  function postShareTargets() {
    const people = [];
    const seen = new Set();
    [...state.chats.map((chat) => chat.peer), ...state.contacts].forEach((user) => {
      if (!user?.id || user.id === state.me?.id || seen.has(user.id) || user.hasBlocked) return;
      seen.add(user.id);
      people.push({ key: `peer:${user.id}`, kind: 'peer', id: user.id, label: user.displayName || user.username, detail: `@${user.username}`, user });
    });
    state.groups.forEach((group) => {
      if (!group?.id) return;
      people.push({ key: `group:${group.id}`, kind: 'group', id: group.id, label: group.name || 'Group', detail: `${group.memberCount || group.members?.length || 0} members`, group });
    });
    return people;
  }

  function renderPostShareSheet(post, sheet) {
    if (!post) return '<p class="hint">Post not found.</p>';
    const selected = new Set(sheet.selectedTargets || []);
    const query = String(sheet.query || '').trim().toLowerCase();
    const targets = postShareTargets();
    const visible = targets.filter((target) => `${target.label} ${target.detail}`.toLowerCase().includes(query));
    return `
      <section class="post-share-shell" aria-label="Share post">
        <header class="post-share-head">
          <span class="story-sheet-grabber" aria-hidden="true"></span>
          <strong>Share</strong>
          <button data-action="close-overlays" aria-label="Close share sheet">${icon('x')}</button>
        </header>
        <label class="post-share-search" for="post-share-search">${icon('search')}<input id="post-share-search" value="${esc(sheet.query || '')}" placeholder="Search" autocomplete="off" enterkeyhint="search"></label>
        <div class="post-share-people" role="list" aria-label="People and groups">
          ${visible.map((target) => `
            <button class="post-share-person ${selected.has(target.key) ? 'selected' : ''}" data-action="toggle-post-share-target" data-target-key="${esc(target.key)}" data-share-search="${esc(`${target.label} ${target.detail}`.toLowerCase())}" aria-pressed="${selected.has(target.key)}">
              <span class="post-share-avatar">${target.kind === 'group' ? groupAvatarHtml(target.group) : avatarHtml(target.user)}<i>${icon('check')}</i></span>
              <strong>${esc(target.label)}</strong>
              <small>${esc(target.detail)}</small>
            </button>
          `).join('')}
          <p class="post-share-empty" ${visible.length ? 'hidden' : ''}>No chats found.</p>
        </div>
        <footer class="post-share-footer">
          <div class="post-share-quick" aria-label="More sharing options">
            <button data-action="copy-post-link" data-post-id="${esc(post.id)}"><span>${icon('link')}</span><small>Copy link</small></button>
            <button data-action="share-post-external" data-post-id="${esc(post.id)}"><span>${icon('send')}</span><small>Share to</small></button>
          </div>
          ${selected.size ? `<button class="post-share-send" data-action="send-shared-post" data-post-id="${esc(post.id)}" ${sheet.sending ? 'disabled' : ''}>${sheet.sending ? '<i class="spinner"></i> Sending…' : `Send separately · ${selected.size}`}</button>` : ''}
        </footer>
      </section>
    `;
  }

  function renderActionSheet() {
    const sheet = state.actionSheet;
    if (!sheet) return '';
    const peer = sheet.peerId ? userById(sheet.peerId) : null;
    const profileUser = sheet.userId ? userById(sheet.userId) : null;
    const message = sheet.messageId ? state.messages.find((item) => item.id === sheet.messageId) : null;
    const sheetPost = sheet.postId ? postById(sheet.postId) : null;
    let body = '';
    if (sheet.type === 'chat-user' && peer) {
      body = `
        <button data-action="mute-menu" data-user-id="${esc(peer.id)}">${icon('mute')} Mute</button>
        <button class="danger-text" data-action="remove-friend" data-user-id="${esc(peer.id)}">${icon('trash')} Remove friend</button>
        <button data-action="open-report" data-report-type="user" data-user-id="${esc(peer.id)}">Report user</button>
        ${peer.hasBlocked
          ? `<button data-action="unblock-user" data-user-id="${esc(peer.id)}">Unblock</button>`
          : `<button class="danger-text" data-action="block-user" data-user-id="${esc(peer.id)}">${icon('block')} Block</button>`}
      `;
    }
    if (sheet.type === 'profile-user' && profileUser) {
      body = `
        <div class="sheet-note"><strong>${esc(profileUser.displayName)}</strong><small>@${esc(profileUser.username)}</small></div>
        <button data-action="toggle-favorite-user" data-user-id="${esc(profileUser.id)}">${icon('bookmark')} ${profileUser.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</button>
        <button data-action="open-report" data-report-type="user" data-user-id="${esc(profileUser.id)}">Report user</button>
        ${profileUser.hasBlocked
          ? `<button data-action="unblock-user" data-user-id="${esc(profileUser.id)}">Unblock</button>`
          : `<button class="danger-text" data-action="block-user" data-user-id="${esc(profileUser.id)}">${icon('block')} Block</button>`}
      `;
    }
    if (sheet.type === 'post-owner') {
      body = `
        <div class="sheet-note"><strong>Post options</strong><small>Manage this post</small></div>
        <button class="danger-text" data-action="delete-post" data-post-id="${esc(sheet.postId)}">${icon('trash')} Delete post</button>
      `;
    }
    if (sheet.type === 'post-options' && sheetPost) {
      const author = postAuthor(sheetPost);
      body = `
        <div class="sheet-note"><strong>Clip options</strong><small>Choose what you want to do.</small></div>
        <button data-action="toggle-post-save" data-post-id="${esc(sheetPost.id)}">${icon('bookmark')} ${sheetPost.savedByMe ? 'Remove from saved' : 'Save'}</button>
        <button data-action="copy-post-link" data-post-id="${esc(sheetPost.id)}">${icon('link')} Copy link</button>
        ${author ? `<button data-action="view-user-profile" data-username="${esc(author.username)}">${icon('profile')} About this account</button>` : ''}
        ${author?.id === state.me?.id
          ? `<button class="danger-text" data-action="delete-post" data-post-id="${esc(sheetPost.id)}">${icon('trash')} Delete post</button>`
          : author ? `<button data-action="open-report" data-report-type="user" data-user-id="${esc(author.id)}">Report</button>` : ''}
      `;
    }
    if (sheet.type === 'post-share') {
      body = renderPostShareSheet(sheetPost, sheet);
    }
    if (sheet.type === 'group-member' && state.activeGroup) {
      const member = userById(sheet.userId);
      const isAdmin = (state.activeGroup.adminIds || []).includes(sheet.userId);
      body = member ? `
        <div class="sheet-note"><strong>${esc(member.displayName)}</strong><small>@${esc(member.username)}</small></div>
        ${state.activeGroup.ownerId === state.me.id ? `<button data-action="manage-group-member" data-user-id="${esc(member.id)}" data-member-action="${isAdmin ? 'demote' : 'promote'}">${isAdmin ? 'Remove as admin' : 'Make admin'}</button>` : ''}
        <button class="danger-text" data-action="manage-group-member" data-user-id="${esc(member.id)}" data-member-action="remove">Remove from group</button>
      ` : '';
    }
    if (sheet.type === 'mute' && peer) {
      const options = [
        ['15 minutes', 15],
        ['30 minutes', 30],
        ['1 hour', 60],
        ['24 hours', 1440],
        ['1 week', 10080],
        ['Forever', '']
      ];
      body = options.map(([label, minutes]) => `<button data-action="set-mute" data-user-id="${esc(peer.id)}" data-minutes="${minutes}">${esc(label)}</button>`).join('');
    }
    if (sheet.type === 'message' && message) {
      body = `
        ${message.attachment ? `<button data-action="download-message-file" data-message-id="${esc(message.id)}">Download file</button><button data-action="download-meta" data-message-id="${esc(message.id)}">Download metadata</button>` : ''}
        ${message.attachment && message.kind === 'image' ? `<button data-action="download-file-meta" data-message-id="${esc(message.id)}">Download image + metadata</button>` : ''}
        ${message.senderId !== state.me.id ? `<button data-action="open-report" data-report-type="message" data-message-id="${esc(message.id)}" data-user-id="${esc(message.senderId)}">Report message</button>` : ''}
        ${message.senderId === state.me.id && !message.deletedAt ? `<button class="danger-text" data-action="delete-message" data-message-id="${esc(message.id)}">${icon('trash')} Unsend for everyone</button>` : ''}
      `;
    }
    if (sheet.type === 'report') {
      const reported = sheet.userId ? userById(sheet.userId) : null;
      const label = sheet.targetType === 'message' ? 'message' : `@${reported?.username || 'user'}`;
      body = `
        <div class="sheet-note">
          <strong>Report ${esc(label)}</strong>
          <small>Choose a reason. The report includes account and network details for review.</small>
        </div>
        ${reportReasons().map((reason) => `
          <button data-action="submit-report" data-report-type="${esc(sheet.targetType)}" data-user-id="${esc(sheet.userId || '')}" data-message-id="${esc(sheet.messageId || '')}" data-reason="${esc(reason)}">${esc(reason)}</button>
        `).join('')}
      `;
    }
    if (sheet.type === 'profile-link') {
      body = `
        <input class="search-input" value="${esc(sheet.link)}" readonly>
        <button data-action="copy-profile-link" data-link="${esc(sheet.link)}">${icon('link')} Copy to clipboard</button>
      `;
    }
    if (sheet.type === 'post-comments') {
      body = renderPostCommentsSheet(postById(sheet.postId), sheet);
    }
    if (sheet.type === 'story-comments') {
      const story = storyById(sheet.storyId);
      const commentPosting = storyCommentPosting(sheet);
      const replyComment = story?.comments?.find((comment) => comment.id === sheet.replyToCommentId) || null;
      const comments = story?.comments || [];
      const commentById = new Map(comments.map((comment) => [comment.id, comment]));
      const rootIdFor = (comment) => {
        let current = comment;
        const visited = new Set();
        while (current?.replyTo && commentById.has(current.replyTo) && !visited.has(current.replyTo)) {
          visited.add(current.id);
          current = commentById.get(current.replyTo);
        }
        return current?.id || comment.id;
      };
      const roots = comments.filter((comment) => !comment.replyTo || !commentById.has(comment.replyTo));
      const repliesByRoot = new Map(roots.map((comment) => [comment.id, []]));
      comments.forEach((comment) => {
        const rootId = rootIdFor(comment);
        if (rootId !== comment.id) {
          if (!repliesByRoot.has(rootId)) repliesByRoot.set(rootId, []);
          repliesByRoot.get(rootId).push(comment);
        }
      });
      const expandedCommentIds = new Set(sheet.expandedCommentIds || []);
      if (replyComment) expandedCommentIds.add(rootIdFor(replyComment));
      let commentOrder = 0;
      const renderCommentRow = (comment, isReply = false) => {
        const order = commentOrder++;
        const username = comment.user?.username || 'user';
        const likeLabel = comment.likeCount === 1 ? '1 like' : `${comment.likeCount || 0} likes`;
        const age = compactRelativeTime(comment.createdAt);
        return `
          <article class="story-comment-row ${isReply ? 'reply' : ''} ${sheet.newCommentId === comment.id ? 'just-posted' : ''}" data-comment-id="${esc(comment.id)}" style="--comment-order:${Math.min(order, 12)}">
            <button class="story-comment-avatar" data-action="view-user-profile" data-username="${esc(username)}" aria-label="View ${esc(username)}'s profile">${avatarHtml(comment.user)}</button>
            <div class="story-comment-content">
              <p><button class="comment-username" data-action="view-user-profile" data-username="${esc(username)}">${esc(username)}</button>${comment.text ? ` <span>${renderMentionText(comment.text)}</span>` : ' <span class="story-comment-kind">GIF</span>'}</p>
              ${comment.kind === 'gif'
                ? (comment.gif?.file?.url
                  ? `<img class="story-comment-gif" src="${esc(comment.gif.file.url)}" alt="${esc(comment.gif.title || 'GIF comment')}" loading="lazy">`
                  : '<span class="story-comment-gif-unavailable">GIF unavailable</span>')
                : ''}
              <div class="story-comment-meta">
                <time datetime="${esc(comment.createdAt)}" title="${esc(formatTime(comment.createdAt))}">${esc(age)}</time>
                <span class="story-comment-like-count ${comment.likeCount ? '' : 'is-empty'}" data-comment-like-count="${esc(comment.id)}">${esc(likeLabel)}</span>
                <button data-action="reply-story-comment" data-story-id="${esc(story.id)}" data-comment-id="${esc(comment.id)}" ${commentPosting ? 'disabled' : ''}>Reply</button>
              </div>
            </div>
            <button class="story-comment-like ${comment.likedByMe ? 'active' : ''}" data-action="like-story-comment" data-story-id="${esc(story.id)}" data-comment-id="${esc(comment.id)}" aria-label="${comment.likedByMe ? 'Unlike' : 'Like'} comment" aria-pressed="${comment.likedByMe ? 'true' : 'false'}">${icon('heart')}</button>
          </article>
        `;
      };
      const commentThreads = roots.map((comment) => {
        const replies = repliesByRoot.get(comment.id) || [];
        const expanded = expandedCommentIds.has(comment.id);
        return `
          <section class="story-comment-thread" data-thread-id="${esc(comment.id)}">
            ${renderCommentRow(comment)}
            ${replies.length ? `
              <button class="story-comment-replies-toggle" data-action="toggle-story-comment-replies" data-comment-id="${esc(comment.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
                <i aria-hidden="true"></i><span>${expanded ? 'Hide replies' : `View ${replies.length === 1 ? '1 reply' : `all ${replies.length} replies`}`}</span>
              </button>
              <div class="story-comment-replies ${expanded ? 'expanded' : ''}">
                ${expanded ? replies.map((reply) => renderCommentRow(reply, true)).join('') : ''}
              </div>
            ` : ''}
          </section>
        `;
      }).join('');
      const quickReactions = [
        ['&#10084;&#65039;', 'heart'],
        ['&#128588;', 'raising hands'],
        ['&#128293;', 'fire'],
        ['&#128079;', 'clapping hands'],
        ['&#128546;', 'crying face'],
        ['&#128525;', 'heart eyes'],
        ['&#128562;', 'surprised face'],
        ['&#128514;', 'tears of joy']
      ];
      const canComment = story && (story.canReply !== false || story.ownerId === state.me?.id);
      body = story ? `
        <header class="story-comments-head">
          <span class="story-sheet-grabber" aria-hidden="true"></span>
          <strong>Comments</strong>
          <button class="story-sheet-icon" data-action="close-overlays" aria-label="Close comments">${icon('x')}</button>
        </header>
        <div class="story-comment-list" role="feed" aria-label="Story comments">
          ${comments.length ? commentThreads : `
            <div class="story-comments-empty">
              <span>${icon('comment')}</span>
              <strong>No comments yet</strong>
              <small>Start the conversation.</small>
            </div>
          `}
        </div>
        ${canComment ? `
          <footer class="story-comment-composer" aria-busy="${commentPosting ? 'true' : 'false'}">
            ${replyComment ? `<div class="comment-replying"><span>Replying to <strong>${esc(replyComment.user?.username || 'user')}</strong></span><button data-action="clear-comment-reply" aria-label="Cancel reply" ${commentPosting ? 'disabled' : ''}>${icon('x')}</button></div>` : ''}
            ${sheet.gifPickerOpen ? `
              <section class="story-comment-gif-picker" aria-label="Choose a GIF">
                <label class="story-comment-gif-search" for="story-comment-gif-search">
                  ${icon('search')}
                  <input id="story-comment-gif-search" value="${esc(sheet.gifQuery || '')}" placeholder="Search GIFs" autocomplete="off" enterkeyhint="search" ${commentPosting ? 'disabled' : ''}>
                </label>
                <div class="story-comment-gif-grid">
                  ${renderStoryCommentGifChoices(story.id, sheet)}
                </div>
                ${state.gifLoading ? '<span class="story-comment-gif-loading"><i class="spinner"></i></span>' : ''}
              </section>
            ` : `
              <div class="story-comment-quick-reactions" aria-label="Quick reactions">
                ${quickReactions.map(([emoji, label]) => `<button data-action="add-story-comment-emoji" data-emoji="${emoji}" aria-label="Add ${label}" ${commentPosting ? 'disabled' : ''}>${emoji}</button>`).join('')}
              </div>
            `}
            <div class="story-comment-box">
              <button class="story-comment-composer-avatar" data-action="view-own-profile" aria-label="View your profile" ${commentPosting ? 'disabled' : ''}>${avatarHtml(state.me)}</button>
              <div class="story-comment-field">
                <input id="story-comment-input" maxlength="280" placeholder="Add a comment..." aria-label="Add a comment" autocomplete="off" enterkeyhint="send" value="${esc(sheet.commentDraft || '')}" ${commentPosting ? 'disabled' : ''}>
                <button class="story-comment-gif-toggle ${sheet.gifPickerOpen ? 'active' : ''}" data-action="toggle-story-comment-gifs" aria-label="${sheet.gifPickerOpen ? 'Close GIF picker' : 'Add a GIF'}" aria-expanded="${sheet.gifPickerOpen ? 'true' : 'false'}" ${commentPosting ? 'disabled' : ''}>${icon('gif')}</button>
                <button class="story-comment-post" data-action="submit-story-comment" data-story-id="${esc(story.id)}" ${commentPosting || !String(sheet.commentDraft || '').trim() ? 'disabled' : ''}>Post</button>
              </div>
            </div>
          </footer>
        ` : '<div class="story-replies-off comments-disabled">Comments are turned off.</div>'}
      ` : '<p class="hint">Story not found.</p>';
    }
    if (sheet.type === 'story-owner') {
      const story = storyById(sheet.storyId);
      const highlightCount = story ? highlightMembershipCount(state.me, story.id) : 0;
      body = story ? `
        <header class="story-owner-menu-head">
          <strong>Story</strong>
          <button class="story-sheet-icon" data-action="close-overlays" aria-label="Close story menu">${icon('x')}</button>
        </header>
        ${highlightCount ? `<span class="story-owner-saved">In ${highlightCount} ${highlightCount === 1 ? 'highlight' : 'highlights'}</span>` : ''}
        <button class="story-owner-action" data-action="save-story" data-story-id="${esc(story.id)}">${icon('plus')}<span>${highlightCount ? 'Add to another highlight' : 'Add to highlight'}</span></button>
        <button class="story-owner-action danger-text" data-action="delete-story" data-story-id="${esc(story.id)}">${icon('trash')}<span>Delete story</span></button>
      ` : '';
    }
    const compact = ['post-comments', 'post-share', 'story-comments', 'story-owner'].includes(sheet.type);
    const compactClass = sheet.type === 'post-comments' ? 'story-comments-sheet post-comments-sheet' : `${sheet.type}-sheet`;
    const dialogLabel = ({
      'post-share': 'Share post',
      'post-comments': 'Post comments',
      'story-comments': 'Story comments',
      'story-owner': 'Story options',
      'post-options': 'Clip options',
      'post-owner': 'Post options',
      message: 'Message options',
      report: 'Report',
      mute: 'Mute options'
    })[sheet.type] || 'Actions';
    return `
      <div class="overlay ${state.storyViewer ? 'over-story' : ''} ${state.overlayClosing ? 'closing' : ''}" data-action="close-overlays">
        <section class="action-sheet ${compact ? `compact-sheet ${compactClass}` : ''} ${sheet.refreshing ? 'sheet-refreshing' : ''} ${state.overlayClosing ? 'closing' : ''}" data-stop-close role="dialog" aria-modal="true" aria-label="${esc(dialogLabel)}" tabindex="-1">
          ${body || '<p class="hint">No actions available.</p>'}
          ${compact ? '' : '<button data-action="close-overlays">Cancel</button>'}
        </section>
      </div>
    `;
  }

  function renderMediaViewer() {
    if (!state.mediaViewer) return '';
    const isVideo = state.mediaViewer.type?.startsWith('video/');
    return `
      <div class="media-viewer" data-action="close-media">
        <button class="icon-btn media-close" data-action="close-media" aria-label="Close">${icon('x')}</button>
        ${isVideo
          ? `<video src="${esc(state.mediaViewer.src)}" controls autoplay playsinline data-stop-close></video>`
          : `<img src="${esc(state.mediaViewer.src)}" alt="${esc(state.mediaViewer.name || '')}" data-stop-close>`}
      </div>
    `;
  }

  function renderCameraCapture() {
    const capture = state.cameraCapture;
    if (!capture) return '';
    const ready = capture.status === 'ready';
    const unavailable = capture.status === 'error';
    const style = [
      `--camera-origin-x:${Number(capture.originX || 50).toFixed(2)}%`,
      `--camera-origin-y:${Number(capture.originY || 50).toFixed(2)}%`,
      `--camera-origin-size:${Math.max(16, Number(capture.originSize || 26)).toFixed(0)}px`
    ].join(';');
    const title = capture.mode === 'story' ? 'Story camera' : 'Camera';
    return `
      <section class="camera-capture-page ${capture.opening ? 'camera-opening' : ''} ${capture.closing ? 'camera-closing' : ''} ${ready ? 'camera-ready' : ''} ${capture.facingMode === 'user' ? 'camera-facing-user' : ''}" style="${esc(style)}" aria-label="${title}" role="dialog" aria-modal="true">
        <div class="camera-capture-surface">
          <video id="camera-preview" class="camera-preview" autoplay muted playsinline></video>
          <div class="camera-scrim camera-scrim-top"></div>
          <div class="camera-scrim camera-scrim-bottom"></div>
          <header class="camera-capture-header">
            <button class="camera-control-button" data-action="close-camera-capture" aria-label="Close camera">${icon('x')}</button>
            <strong>${capture.mode === 'story' ? 'STORY' : 'CAMERA'}</strong>
            <button class="camera-control-button" data-action="camera-flip" aria-label="Switch camera" ${ready ? '' : 'disabled'}>${icon('rotate')}</button>
          </header>
          ${!ready ? `
            <div class="camera-status ${unavailable ? 'camera-status-error' : ''}">
              ${unavailable ? `<strong>Camera unavailable</strong><small>${esc(capture.error || 'You can still choose a photo or video from your library.')}</small>` : '<span class="spinner"></span><small>Opening camera…</small>'}
            </div>
          ` : ''}
          <footer class="camera-capture-controls">
            <button class="camera-library-button" data-action="open-camera-gallery">Library</button>
            <button class="camera-shutter" data-action="camera-shutter" aria-label="Take photo" ${ready ? '' : 'disabled'}><i></i></button>
            ${capture.mode === 'story'
              ? '<button class="camera-library-button" data-action="camera-use-text">Aa</button>'
              : '<span class="camera-control-spacer" aria-hidden="true"></span>'}
          </footer>
        </div>
      </section>
    `;
  }

  function stopCameraStream() {
    cameraStream?.getTracks?.().forEach((track) => track.stop());
    cameraStream = null;
  }

  function attachCameraStream() {
    const video = document.getElementById('camera-preview');
    if (!video || !cameraStream) return;
    if (video.srcObject !== cameraStream) video.srcObject = cameraStream;
    video.play?.().catch(() => {});
  }

  function cameraOriginFrom(source) {
    const rect = source?.getBoundingClientRect?.();
    if (!rect) return { originX: 50, originY: 50, originSize: 26 };
    return {
      originX: ((rect.left + rect.width / 2) / Math.max(1, window.innerWidth)) * 100,
      originY: ((rect.top + rect.height / 2) / Math.max(1, window.innerHeight)) * 100,
      originSize: Math.max(rect.width, rect.height, 22) / 2
    };
  }

  async function startCameraCapture(capture) {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (state.cameraCapture === capture) {
        capture.status = 'error';
        capture.opening = false;
        capture.error = 'This browser does not provide camera access.';
        updateCameraCaptureSlot();
      }
      return;
    }
    stopCameraStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: capture.facingMode || 'environment' } },
        audio: false
      });
      if (state.cameraCapture !== capture || capture.closing) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream = stream;
      capture.status = 'ready';
      capture.opening = false;
      updateCameraCaptureSlot();
    } catch (error) {
      if (state.cameraCapture !== capture || capture.closing) return;
      capture.status = 'error';
      capture.opening = false;
      capture.error = error?.name === 'NotAllowedError'
        ? 'Allow camera access to take a photo, or choose one from your library.'
        : 'Camera could not be opened. Choose a photo or video from your library instead.';
      updateCameraCaptureSlot();
    }
  }

  function openCameraCapture(mode, options = {}, source = null) {
    if (!['story', 'chat'].includes(mode)) return;
    clearTimeout(cameraCloseTimer);
    stopCameraStream();
    const capture = {
      mode,
      publishAsHighlight: Boolean(options.publishAsHighlight),
      facingMode: 'environment',
      status: 'opening',
      opening: true,
      closing: false,
      ...cameraOriginFrom(source)
    };
    state.cameraCapture = capture;
    updateCameraCaptureSlot();
    startCameraCapture(capture);
  }

  function closeCameraCapture(options = {}) {
    const capture = state.cameraCapture;
    if (!capture) return;
    clearTimeout(cameraCloseTimer);
    stopCameraStream();
    if (options.immediate) {
      state.cameraCapture = null;
      updateCameraCaptureSlot();
      return;
    }
    capture.opening = false;
    capture.closing = true;
    updateCameraCaptureSlot();
    cameraCloseTimer = setTimeout(() => {
      if (state.cameraCapture !== capture) return;
      state.cameraCapture = null;
      updateCameraCaptureSlot();
    }, 260);
  }

  async function flipCameraCapture() {
    const capture = state.cameraCapture;
    if (!capture || capture.closing) return;
    capture.facingMode = capture.facingMode === 'user' ? 'environment' : 'user';
    capture.status = 'opening';
    capture.opening = false;
    capture.error = '';
    updateCameraCaptureSlot();
    await startCameraCapture(capture);
  }

  function chooseCameraLibrary() {
    const capture = state.cameraCapture;
    if (!capture) return;
    const input = document.getElementById(capture.mode === 'story' ? 'story-input' : 'file-input');
    if (!input) return;
    input.accept = 'image/*,video/*';
    input.click();
  }

  async function captureCameraPhoto() {
    const capture = state.cameraCapture;
    const video = document.getElementById('camera-preview');
    if (!capture || capture.status !== 'ready' || !video?.videoWidth || !video?.videoHeight) return;
    const canvas = document.createElement('canvas');
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const scale = Math.min(1, 1920 / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Camera photo could not be created.');
    if (capture.facingMode === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Camera photo could not be created.');
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    const mode = capture.mode;
    const publishAsHighlight = capture.publishAsHighlight;
    closeCameraCapture({ immediate: true });
    if (mode === 'story') await beginStoryEditor(file, { publishAsHighlight });
    else await sendFile(file, 'image');
  }

  function renderStoryEditor() {
    const editor = state.storyEditor;
    if (!editor) return '';
    const style = `filter:${storyFilterCss(editor.filter, editor)}; transform:${storyMediaTransformCss(editor)}; object-fit:${storyMediaFit(editor)};`;
    const tools = [
      ['media', 'Choose photo or video', 'story'],
      ...(editor.isVideo ? [['video', 'Edit video', 'scissors']] : []),
      ['audio', 'Music', 'music'],
      ['stickers', 'Stickers', 'stickers'],
      ['text', 'Text', 'text'],
      ['draw', 'Draw', 'pen'],
      ['filter', 'Effects', 'sparkle'],
      ['more', 'More', 'more']
    ];
    return `
      <div class="story-editor-page" data-action="close-story-editor">
        <div class="story-editor-canvas" data-stop-close>
          <div class="story-editor-preview">
            ${editor.isVideo
              ? `<video id="story-editor-video" src="${esc(editor.dataUrl)}" playsinline preload="metadata" style="${esc(style)}"></video>`
              : `<img src="${esc(editor.dataUrl)}" alt="" style="${esc(style)}">`}
            ${renderStoryEffectLayers(editor)}
            ${renderStoryDrawings(editor)}
            ${renderStoryEditorStickers(editor)}
            ${editor.textEditing ? `
              <textarea class="story-live-text ${esc(storyTextClass(editor))}" id="story-editor-text" data-action="story-text-drag" maxlength="120" rows="1" cols="${storyTextColumns(editor.text)}" placeholder="Type something" style="${esc(storyTextStyle(editor))}" autofocus>${esc(editor.text || '')}</textarea>
            ` : editor.text ? `
              <button class="story-draggable-text ${esc(storyTextClass(editor))}" data-action="story-text-drag" style="${esc(storyTextStyle(editor))}">${esc(editor.text)}</button>
            ` : ''}
            ${editor.pollQuestion ? renderPollSticker(editor) : ''}
            ${editor.audio ? `
              <div class="story-audio-sticker">
                ${renderStoryAudioPlayer(`${editor.audio.dataUrl}#t=${Number(editor.audioStart || 0)},${Number(editor.audioEnd || 30)}`, editor.audio.name || 'Audio', Math.max(1, Number(editor.audioEnd || 30) - Number(editor.audioStart || 0)), 'editor-audio')}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="story-object-trash" id="story-object-trash" aria-hidden="true">${icon('trash')}</div>
        ${renderStoryTopToolbar(editor, tools)}
        ${editor.textEditing ? `
          <div class="story-size-control story-text-size-control" data-stop-close>
            <span class="story-size-large">A</span>
            <input class="story-size-slider" id="story-text-size" type="range" min="22" max="96" step="1" value="${esc(editor.textSize || 44)}" style="--range-progress:${esc(((Number(editor.textSize || 44) - 22) / 74) * 100)}%" aria-label="Text size" data-stop-close>
            <span class="story-size-small">A</span>
          </div>
        ` : ''}
        ${editor.activeTool === 'draw' && editor.drawBrush !== 'eraser' ? `
          <div class="story-size-control story-brush-size-control" data-stop-close>
            <span class="story-brush-large"></span>
            <input class="story-size-slider story-brush-slider" id="story-draw-size" type="range" min="2" max="20" step="1" value="${esc(editor.drawSize || 6)}" style="--range-progress:${esc(((Number(editor.drawSize || 6) - 2) / 18) * 100)}%" aria-label="Brush size" data-stop-close>
            <span class="story-brush-small"></span>
          </div>
        ` : ''}
        ${renderStoryFloatingTray(editor)}
        ${editor.activeTool ? '' : `
          <div class="story-share-bar" data-stop-close>
            ${state.storyPublishing ? '<span class="story-upload-progress" aria-label="Posting story"><i></i></span>' : ''}
            <button class="story-share-pill" data-action="${editor.publishAsHighlight ? 'choose-highlight-for-new-story' : 'publish-story'}" ${state.storyPublishing ? 'disabled' : ''}>
              ${avatarHtml(state.me)}
              <strong>${state.storyPublishing ? 'Posting...' : (editor.publishAsHighlight ? 'Add to highlight' : 'Your story')}</strong>
            </button>
            ${editor.publishAsHighlight
              ? `<button class="story-send-story" data-action="publish-story-only" ${state.storyPublishing ? 'disabled' : ''}>${state.storyPublishing ? '<span class="spinner"></span>' : 'Send to story'}</button>`
              : `<button class="story-share-send" data-action="publish-story" aria-label="Share story" ${state.storyPublishing ? 'disabled' : ''}>${state.storyPublishing ? '<span class="spinner"></span>' : icon('send')}</button>`}
          </div>
        `}
      </div>
    `;
  }

  function storyOwnerById(storyId) {
    return storyUsers().find((user) => (user.stories || []).some((story) => story.id === storyId)) || null;
  }

  function storiesForViewer(owner, currentStory) {
    const highlightId = state.storyViewer?.highlightId;
    if (highlightId) {
      const highlight = highlightById(owner, highlightId);
      if (highlight) return (highlight.stories || []).filter((story) => story.file);
    }
    return (owner?.stories || []).filter((story) => (
      story.file && !story.saved && new Date(story.expiresAt || 0).getTime() > Date.now()
    ));
  }

  function renderStoryViewer() {
    const storyId = state.storyViewer?.storyId;
    if (!storyId) return '';
    const story = storyById(storyId);
    const owner = storyOwnerById(storyId);
    if (!story || !owner) return '';
    const stories = storiesForViewer(owner, story);
    const index = Math.max(0, stories.findIndex((item) => item.id === story.id));
    const isVideo = story.file?.mime?.startsWith('video/');
    const ownStory = owner.id === state.me?.id;
    return `
      <section class="story-viewer-page" style="--story-duration:${isVideo ? 12 : 7}s">
        <div class="story-viewer-stage">
          ${renderStoryMedia(story, false, true)}
        </div>
        <div class="story-viewer-top">
          <div class="story-progress" aria-hidden="true">
            ${stories.map((item, itemIndex) => `<span class="${itemIndex < index ? 'complete' : itemIndex === index ? 'active' : ''}"><i></i></span>`).join('')}
          </div>
          <div class="story-viewer-head">
            <div class="story-viewer-owner">
              <span class="avatar">${owner.avatar?.url ? `<img src="${esc(owner.avatar.url)}" alt="">` : esc(initials(owner))}</span>
              <strong>${esc(owner.username)}</strong>
              <small>${esc(shortTime(story.createdAt))}</small>
            </div>
            <div class="story-viewer-head-actions">
              ${ownStory ? `<button data-action="open-story-owner-menu" data-story-id="${esc(story.id)}" aria-label="Story options">${icon('more')}</button>` : ''}
              <button data-action="close-story-viewer" aria-label="Close story">${icon('x')}</button>
            </div>
          </div>
        </div>
        <button class="story-tap-zone story-tap-prev" data-action="story-viewer-prev" aria-label="Previous story"></button>
        <button class="story-tap-zone story-tap-next" data-action="story-viewer-next" aria-label="Next story"></button>
        ${renderHighlightCommentPreview(story)}
        <div class="story-viewer-actions ${ownStory ? 'own-story-actions' : ''}">
          ${ownStory ? `
            <button class="story-owner-metric ${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="${story.likedByMe ? 'Unlike' : 'Like'} story" aria-pressed="${story.likedByMe ? 'true' : 'false'}">
              ${icon('heart')}<span class="story-like-count">${story.likeCount || 0}</span>
            </button>
            <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="View comments">${icon('comment')}<small>${story.commentCount || 0}</small></button>
          ` : `
            ${story.canReply !== false ? `
              <div class="story-reply-pill">
                <input id="story-viewer-comment" maxlength="280" placeholder="Reply..." autocomplete="off">
                <button data-action="submit-story-comment" data-story-id="${esc(story.id)}" aria-label="Post comment">${icon('send')}</button>
              </div>
            ` : '<span class="story-replies-off">Replies are off</span>'}
            <button class="${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="${story.likedByMe ? 'Unlike' : 'Like'} story" aria-pressed="${story.likedByMe ? 'true' : 'false'}">${icon('heart')}</button>
            <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="View comments">${icon('comment')}</button>
          `}
        </div>
      </section>
    `;
  }

  function renderProfileEditModal() {
    if (!state.profileEditOpen) return '';
    const nextNameChange = state.me.nextDisplayNameChangeAt ? new Date(state.me.nextDisplayNameChangeAt) : null;
    const displayNameLocked = Boolean(nextNameChange && nextNameChange.getTime() > Date.now());
    return `
      <div class="center-overlay" data-action="close-modal">
        <section class="center-modal profile-edit-modal" data-stop-close>
          <header class="modal-head">
            <h2>Edit profile</h2>
            <button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button>
          </header>
          <div class="profile-photo-editor">
            ${profilePictureElement(state.me, 'profile-edit-avatar', { own: true })}
            <span><strong>Profile picture</strong><small>Drag and zoom after choosing a photo.</small></span>
            <button type="button" class="profile-photo-change" data-action="change-profile-picture">Change</button>
          </div>
          <form class="form profile-edit-form" data-form="profile-edit">
            <label class="profile-edit-field"><span>Tag username</span>
              <input name="username" value="@${esc(state.me.username)}" readonly aria-readonly="true">
              <small>Your tag username identifies your account and cannot be changed.</small>
            </label>
            <label class="profile-edit-field"><span>Display name</span>
              <input name="displayName" value="${esc(state.me.displayName)}" maxlength="60" ${displayNameLocked ? 'disabled' : ''}>
              <small>${displayNameLocked ? `You can change this again on ${esc(nextNameChange.toLocaleDateString())}.` : 'You can change your display name once every 14 days.'}</small>
            </label>
            <label class="profile-edit-field"><span>Bio</span>
              <textarea name="bio" maxlength="280">${esc(state.me.bio || '')}</textarea>
            </label>
            <label class="profile-edit-field"><span>Website</span>
              <input name="website" type="url" value="${esc(state.me.website || '')}" maxlength="240" placeholder="https://example.com">
            </label>
            <div class="profile-edit-split">
              <label class="profile-edit-field"><span>Age <small>Optional</small></span><input name="age" type="number" inputmode="numeric" min="1" max="120" value="${state.me.age ?? ''}"></label>
              <label class="profile-edit-field"><span>Gender <small>Optional</small></span><input name="gender" maxlength="40" value="${esc(state.me.gender || '')}" placeholder="How you identify"></label>
            </div>
            <fieldset class="profile-visibility-fields">
              <legend>Show on public profile</legend>
              <label><input name="bioVisible" type="checkbox" ${state.me.bioVisible !== false ? 'checked' : ''}> Bio</label>
              <label><input name="websiteVisible" type="checkbox" ${state.me.websiteVisible !== false ? 'checked' : ''}> Website</label>
              <label><input name="ageVisible" type="checkbox" ${state.me.ageVisible === true ? 'checked' : ''}> Age</label>
              <label><input name="genderVisible" type="checkbox" ${state.me.genderVisible === true ? 'checked' : ''}> Gender</label>
            </fieldset>
            <button class="profile-edit-save" type="submit">Save changes</button>
          </form>
        </section>
      </div>
    `;
  }

  function settingsSectionTitle(section) {
    return { account: 'Account', blocked: 'Blocked accounts', comments: 'Your comments', reposts: 'Reposts' }[section] || 'Settings';
  }

  function renderSettingsSubsection(section) {
    if (section === 'account') return `
      <section class="settings-block settings-subpage">
        <h3>Contact details</h3>
        <form class="form settings-account-form" data-form="account-contact">
          <label class="profile-edit-field"><span>Email ${state.me.emailVerified ? '<i class="verified-mark">Verified</i>' : '<i>Not verified</i>'}</span><input name="email" type="email" value="${esc(state.me.email || '')}" autocomplete="email" placeholder="you@example.com"></label>
          ${state.me.email && !state.me.emailVerified ? '<button type="button" class="secondary" data-action="resend-email-verification">Resend verification email</button>' : ''}
          <label class="profile-edit-field"><span>Phone ${state.me.phoneVerified ? '<i class="verified-mark">Verified</i>' : '<i>Optional</i>'}</span><input name="phone" type="tel" value="${esc(state.me.phone || '')}" autocomplete="tel" placeholder="+49 123 456789"></label>
          <button class="primary" type="submit">Save contact details</button>
        </form>
      </section>
      <section class="settings-block settings-subpage">
        <h3>Change password</h3>
        <form class="form settings-account-form" data-form="change-password">
          <label class="profile-edit-field"><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="profile-edit-field"><span>New password</span><input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label>
          <label class="profile-edit-field"><span>Confirm new password</span><input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label>
          <button class="primary" type="submit">Change password</button>
        </form>
      </section>
    `;
    if (section === 'blocked') return `
      <section class="settings-block settings-subpage">
        <p class="hint">Blocked people are removed from search, suggestions, feeds, notes, and messaging.</p>
        <div class="settings-user-list">
          ${state.blockedUsers.length ? state.blockedUsers.map((user) => `
            <article class="account-row">
              <span class="account-identity">${avatarHtml(user)}<span class="person"><strong>${esc(user.displayName)}</strong><small>@${esc(user.username)}</small></span></span>
              <button class="mini-btn" data-action="settings-unblock-user" data-user-id="${esc(user.id)}">Unblock</button>
            </article>
          `).join('') : '<div class="settings-empty-state">No blocked accounts.</div>'}
        </div>
      </section>
    `;
    if (section === 'comments') return `
      <section class="settings-block settings-subpage">
        <p class="hint">A history of comments you have made on posts you can still view.</p>
        <div class="settings-activity-list">
          ${state.accountActivity.comments.length ? state.accountActivity.comments.map((item) => `
            <button data-action="open-activity-post" data-post-id="${esc(item.post?.id || '')}">
              <span class="activity-thumb">${item.post ? renderPostMedia(item.post, { grid: true }) : ''}</span>
              <span><strong>${esc(item.comment?.text || '')}</strong><small>${esc(shortTime(item.createdAt))} · ${esc(postAuthor(item.post)?.username || 'post')}</small></span>
              ${icon('chevron')}
            </button>
          `).join('') : '<div class="settings-empty-state">You have not commented on any visible posts yet.</div>'}
        </div>
      </section>
    `;
    if (section === 'reposts') return `
      <section class="settings-block settings-subpage">
        <label class="switch-row">
          <span><strong>Allow reposts</strong><small>Let other people repost your posts when an individual post also allows it.</small></span>
          <input type="checkbox" data-action="toggle-global-reposts" ${state.me.allowReposts !== false ? 'checked' : ''}>
        </label>
        <h3>Your reposts</h3>
        <div class="settings-activity-list">
          ${state.accountActivity.reposts.length ? state.accountActivity.reposts.map((item) => `
            <button data-action="open-activity-post" data-post-id="${esc(item.post?.id || '')}">
              <span class="activity-thumb">${item.post ? renderPostMedia(item.post, { grid: true }) : ''}</span>
              <span><strong>${esc(item.post?.title || `Post by @${postAuthor(item.post)?.username || 'user'}`)}</strong><small>Reposted ${esc(shortTime(item.createdAt))}</small></span>
              ${icon('chevron')}
            </button>
          `).join('') : '<div class="settings-empty-state">Posts you repost will appear here.</div>'}
        </div>
      </section>
    `;
    return '';
  }

  function renderSettingsModal() {
    if (!state.settingsOpen) return '';
    if (state.settingsSection !== 'main') return `
      <div class="settings-drawer-overlay ${state.settingsOpening ? 'opening' : ''} ${state.settingsClosing ? 'closing' : ''}" data-action="close-settings">
        <aside class="settings-drawer" role="dialog" aria-modal="true" aria-label="${esc(settingsSectionTitle(state.settingsSection))}" data-stop-close>
          <header class="settings-drawer-head">
            <button class="icon-btn" data-action="settings-back" aria-label="Back">${icon('back')}</button>
            <h2>${esc(settingsSectionTitle(state.settingsSection))}</h2>
            <button class="icon-btn" data-action="close-settings" aria-label="Close settings">${icon('x')}</button>
          </header>
          ${renderSettingsSubsection(state.settingsSection)}
        </aside>
      </div>
    `;
    return `
      <div class="settings-drawer-overlay ${state.settingsOpening ? 'opening' : ''} ${state.settingsClosing ? 'closing' : ''}" data-action="close-settings">
        <aside class="settings-drawer ${state.settingsOpening ? 'opening' : ''} ${state.settingsClosing ? 'closing' : ''}" role="dialog" aria-modal="true" aria-label="Settings" data-stop-close>
          <header class="settings-drawer-head">
            <h2>Settings</h2>
            <button class="icon-btn" data-action="close-settings" aria-label="Close settings">${icon('x')}</button>
          </header>
          <nav class="settings-menu-grid" aria-label="Settings sections">
            <button data-action="open-settings-section" data-section="account">${icon('profile')}<span><strong>Account</strong><small>Email, phone, and password</small></span>${icon('chevron')}</button>
            <button data-action="open-settings-section" data-section="blocked">${icon('block')}<span><strong>Blocked</strong><small>Review blocked accounts</small></span>${icon('chevron')}</button>
            <button data-action="open-settings-section" data-section="comments">${icon('comment')}<span><strong>Comments</strong><small>Your comment activity</small></span>${icon('chevron')}</button>
            <button data-action="open-settings-section" data-section="reposts">${icon('repost')}<span><strong>Reposts</strong><small>Sharing controls and activity</small></span>${icon('chevron')}</button>
          </nav>
          <section class="settings-block">
            <h3>${icon('lock')} Account privacy</h3>
            <label class="switch-row">
              <span>
                <strong>Private account</strong>
                <small>Only approved people can see stories and social lists.</small>
              </span>
              <input type="checkbox" data-action="toggle-account-private" ${state.me.socialPublic === false ? 'checked' : ''}>
            </label>
            <label class="switch-row">
              <span>
                <strong>Allow profile picture expansion</strong>
                <small>Let other people open your profile picture full screen.</small>
              </span>
              <input type="checkbox" data-action="toggle-avatar-viewable" ${state.me.avatarViewable !== false ? 'checked' : ''}>
            </label>
            <label class="switch-row">
              <span>
                <strong>Appear in search</strong>
                <small>Allow your account to appear when people search usernames.</small>
              </span>
              <input type="checkbox" data-action="toggle-profile-searchable" ${state.me.searchable !== false ? 'checked' : ''}>
            </label>
            <label class="switch-row">
              <span>
                <strong>Account suggestions</strong>
                <small>Let your profile appear as a suggested account on other profiles.</small>
              </span>
              <input type="checkbox" data-action="toggle-profile-recommendable" ${state.me.recommendable !== false ? 'checked' : ''}>
            </label>
          </section>
          <section class="settings-block">
            <h3>${icon('profile')} Interactions</h3>
            <label class="privacy-choice-row">
              <span><strong>Mentions</strong><small>Who can notify you by using @${esc(state.me.username)}.</small></span>
              <select data-profile-setting="mentionPermission" aria-label="Who can mention you">
                <option value="everyone" ${(state.me.mentionPermission || 'everyone') === 'everyone' ? 'selected' : ''}>Everyone</option>
                <option value="following" ${state.me.mentionPermission === 'following' ? 'selected' : ''}>People you follow</option>
                <option value="nobody" ${state.me.mentionPermission === 'nobody' ? 'selected' : ''}>No one</option>
              </select>
            </label>
            <label class="privacy-choice-row">
              <span><strong>Story replies</strong><small>Choose who can comment or reply to your stories.</small></span>
              <select data-profile-setting="storyReplies" aria-label="Who can reply to stories">
                <option value="everyone" ${(state.me.storyReplies || 'everyone') === 'everyone' ? 'selected' : ''}>Everyone</option>
                <option value="following" ${state.me.storyReplies === 'following' ? 'selected' : ''}>People you follow</option>
                <option value="off" ${state.me.storyReplies === 'off' ? 'selected' : ''}>Off</option>
              </select>
            </label>
            <label class="privacy-choice-row">
              <span><strong>Friend requests</strong><small>Control who can ask to message you.</small></span>
              <select data-profile-setting="friendRequests" aria-label="Who can send friend requests">
                <option value="everyone" ${(state.me.friendRequests || 'everyone') === 'everyone' ? 'selected' : ''}>Everyone</option>
                <option value="followers" ${state.me.friendRequests === 'followers' ? 'selected' : ''}>Followers</option>
                <option value="off" ${state.me.friendRequests === 'off' ? 'selected' : ''}>No one</option>
              </select>
            </label>
            <label class="switch-row">
              <span><strong>Group invitations</strong><small>Allow friends to add you to group chats.</small></span>
              <input type="checkbox" data-action="toggle-group-invites" ${state.me.allowGroupAdds !== false ? 'checked' : ''}>
            </label>
          </section>
          <section class="settings-block">
            <h3>${icon('bell')} Notifications</h3>
            <label class="switch-row">
              <span>
                <strong>Browser notifications</strong>
                <small>Messages, follow requests, and social updates while the site is open. HTTPS is required outside localhost.</small>
              </span>
              <input type="checkbox" data-action="toggle-message-notifications" ${state.messageNotifications ? 'checked' : ''}>
            </label>
          </section>
          ${renderTwoFactorPanel()}
          ${state.isModerator ? renderGifModeration() : ''}
          <section class="settings-block danger-zone">
            <button class="danger logout-btn" data-action="logout">Log out</button>
          </section>
        </aside>
      </div>
    `;
  }

  function renderGifModeration() {
    return `
      <section class="settings-block gif-moderation">
        <h3>${icon('stickers')} GIF submissions</h3>
        <div class="gif-review-list">
          ${state.pendingGifs.length ? state.pendingGifs.map((gif) => `
            <article class="gif-review-row">
              <img src="${esc(gif.file?.url || '')}" alt="">
              <span><strong>${esc(gif.title || 'GIF')}</strong><small>@${esc(gif.submitter?.username || 'user')}</small></span>
              <button data-action="review-gif" data-gif-id="${esc(gif.id)}" data-decision="approve" aria-label="Approve GIF">${icon('check')}</button>
              <button data-action="review-gif" data-gif-id="${esc(gif.id)}" data-decision="reject" aria-label="Reject GIF">${icon('x')}</button>
            </article>
          `).join('') : '<small class="settings-empty">No GIFs waiting for review.</small>'}
        </div>
      </section>
    `;
  }

  function renderAvatarCropper() {
    if (!state.avatarCrop) return '';
    const landscape = Number(state.avatarCrop.naturalWidth || 1) >= Number(state.avatarCrop.naturalHeight || 1);
    return `
      <div class="center-overlay crop-overlay">
        <section class="crop-modal">
          <header class="modal-head">
            <h2>Crop profile picture</h2>
            <button class="icon-btn" data-action="cancel-avatar-crop" aria-label="Close">${icon('x')}</button>
          </header>
          <div class="crop-stage" id="crop-stage">
            <div class="crop-photo-position" style="transform:translate3d(${esc(state.avatarCrop.offsetX || 0)}px,${esc(state.avatarCrop.offsetY || 0)}px,0)">
              <img class="${landscape ? 'crop-landscape' : 'crop-portrait'}" src="${esc(state.avatarCrop.dataUrl)}" alt="" style="transform:translate(-50%,-50%) scale(${esc(state.avatarCrop.zoom || 1)})">
            </div>
            <div class="crop-mask"></div>
            <div class="crop-circle"></div>
          </div>
          <p class="crop-guidance">Drag to reposition. Pinch or use the slider to zoom.</p>
          <label class="zoom-control" aria-label="Profile picture zoom">
            <span class="zoom-symbol small">${icon('profile')}</span>
            <input id="avatar-zoom" type="range" min="1" max="3" step="0.01" value="${esc(state.avatarCrop.zoom || 1)}">
            <span class="zoom-symbol large">${icon('profile')}</span>
          </label>
          <button class="primary crop-confirm" data-action="confirm-avatar-crop">Confirm</button>
        </section>
      </div>
    `;
  }

  function renderCallDock() {
    const call = state.call;
    if (!call.active && !call.incoming) return '';
    const peer = userById(call.peerId || call.incoming?.from);
    if (call.incoming) {
      return `
        <section class="call-dock">
          <h3>Incoming ${call.incoming.video ? 'video' : 'voice'} call</h3>
          <p class="hint">${esc(peer?.displayName || 'Someone')} is calling.</p>
          <div class="toolbar">
            <button class="primary" data-action="accept-call">Accept</button>
            <button class="danger" data-action="reject-call">Reject</button>
          </div>
        </section>
      `;
    }
    return `
      <section class="call-dock">
        <h3>${esc(call.status || 'Call')}</h3>
        <p class="hint">${esc(peer?.displayName || 'Connected user')}</p>
        <div class="call-videos">
          <video id="remote-video" autoplay playsinline></video>
          <video id="local-video" autoplay muted playsinline></video>
        </div>
        <div class="toolbar">
          <button class="danger" data-action="hangup-call">Hang up</button>
        </div>
      </section>
    `;
  }

  async function loadFeed(mode = state.feedMode, options = {}) {
    state.feedMode = ['for_you', 'following', 'favorites'].includes(mode) ? mode : 'for_you';
    localStorage.setItem('feedMode', state.feedMode);
    state.feedLoading = true;
    if (options.render !== false && state.tab === 'home') updateSidebar();
    try {
      const data = await api(`/api/feed?mode=${encodeURIComponent(state.feedMode)}`);
      state.homeFeed = data.posts || [];
    } finally {
      state.feedLoading = false;
      if (options.render !== false && state.tab === 'home') updateSidebar();
    }
  }

  async function loadExplore(options = {}) {
    state.exploreLoading = true;
    try {
      const data = await api('/api/explore');
      state.explorePosts = data.posts || [];
    } finally {
      state.exploreLoading = false;
      if (options.render && state.tab === 'search') updateSidebar();
    }
  }

  async function loadClips(options = {}) {
    const data = await api('/api/clips?limit=60');
    state.clips = data.posts || [];
    if (options.render && state.tab === 'clips') updateSidebar();
    return state.clips;
  }

  async function loadNotes(options = {}) {
    const data = await api('/api/notes');
    state.notes = data.notes || [];
    if (options.render && ['chats', 'profile'].includes(state.tab)) updateSidebar();
  }

  async function loadProfilePosts(user, tab = 'posts', options = {}) {
    if (!user?.username) return [];
    if (tab === 'saved' && user.id !== state.me?.id) {
      state.profilePosts.set(profilePostKey(user, tab), []);
      return [];
    }
    const data = await api(`/api/users/${encodeURIComponent(user.username)}/posts?tab=${encodeURIComponent(tab)}`);
    const posts = data.posts || [];
    state.profilePosts.set(profilePostKey(user, tab), posts);
    if (options.render !== false) updateSidebar();
    return posts;
  }

  async function loadSocialSurfaces(options = {}) {
    await Promise.all([
      loadFeed(state.feedMode, { render: false }).catch(() => { state.homeFeed = []; state.feedLoading = false; }),
      loadExplore().catch(() => { state.explorePosts = []; state.exploreLoading = false; }),
      loadClips().catch(() => { state.clips = []; }),
      loadNotes().catch(() => { state.notes = []; }),
      loadProfilePosts(state.me, state.profileMediaTab, { render: false }).catch(() => [])
    ]);
    if (options.render) updateSidebar();
  }

  function allKnownPosts() {
    return [
      ...state.homeFeed,
      ...state.explorePosts,
      ...state.clips,
      ...state.messages.map((message) => message.sharedPost),
      ...Array.from(state.profilePosts.values()).flat(),
      ...state.accountActivity.reposts.map((item) => item.post || item)
    ].filter(Boolean);
  }

  function postById(postId) {
    return allKnownPosts().find((post) => post.id === postId) || null;
  }

  function replacePost(updatedPost) {
    if (!updatedPost?.id) return;
    const replace = (posts) => (posts || []).map((post) => post.id === updatedPost.id ? { ...post, ...updatedPost } : post);
    const replaceSharedMessage = (message) => message?.sharedPost?.id === updatedPost.id
      ? { ...message, sharedPost: { ...message.sharedPost, ...updatedPost } }
      : message;
    state.homeFeed = replace(state.homeFeed);
    state.explorePosts = replace(state.explorePosts);
    state.clips = replace(state.clips);
    state.messages = state.messages.map(replaceSharedMessage);
    state.chats = state.chats.map((chat) => ({ ...chat, lastMessage: replaceSharedMessage(chat.lastMessage) }));
    state.groups = state.groups.map((group) => ({ ...group, lastMessage: replaceSharedMessage(group.lastMessage) }));
    for (const [key, posts] of state.profilePosts.entries()) state.profilePosts.set(key, replace(posts));
  }

  function syncPostEngagement(post, changedAction = '') {
    if (!post?.id) return false;
    const escapedId = window.CSS?.escape ? CSS.escape(String(post.id)) : String(post.id).replace(/"/g, '\\"');
    const cards = Array.from(document.querySelectorAll(`.feed-post[data-post-id="${escapedId}"], .clip-card[data-post-id="${escapedId}"]`));
    if (!cards.length) return false;
    const states = {
      like: { active: Boolean(post.likedByMe), activeLabel: 'Unlike', idleLabel: 'Like' },
      save: { active: Boolean(post.savedByMe), activeLabel: 'Unsave', idleLabel: 'Save' },
      repost: { active: Boolean(post.repostedByMe), activeLabel: 'Undo repost', idleLabel: 'Repost' }
    };
    for (const card of cards) {
      for (const [action, config] of Object.entries(states)) {
        const button = card.querySelector(`[data-action="toggle-post-${action}"]`);
        if (!button) continue;
        button.classList.remove('is-pending');
        button.classList.toggle('active', config.active);
        button.setAttribute('aria-pressed', config.active ? 'true' : 'false');
        button.setAttribute('aria-label', config.active ? config.activeLabel : config.idleLabel);
        if (action === changedAction) {
          button.classList.remove('post-action-pop');
          void button.offsetWidth;
          button.classList.add('post-action-pop');
        }
      }
      const likeCount = card.querySelector('[data-post-like-count]');
      if (likeCount) likeCount.textContent = post.hideLikeCounts && postAuthor(post)?.id !== state.me?.id
        ? 'Like count hidden'
        : `${Number(post.likeCount || 0).toLocaleString()} likes`;
      const commentCount = card.querySelector('[data-post-comment-count]');
      if (commentCount) commentCount.textContent = `${Number(post.commentCount ?? post.comments?.length ?? 0)} comments`;
      const repostCount = card.querySelector('[data-post-repost-count]');
      if (repostCount) repostCount.textContent = `${Number(post.repostCount || 0)} reposts`;
      const clipLikeCount = card.querySelector('[data-clip-like-count]');
      if (clipLikeCount) clipLikeCount.textContent = post.hideLikeCounts && postAuthor(post)?.id !== state.me?.id ? '—' : Number(post.likeCount || 0).toLocaleString();
      const clipCommentCount = card.querySelector('[data-clip-comment-count]');
      if (clipCommentCount) clipCommentCount.textContent = Number(post.commentCount ?? post.comments?.length ?? 0).toLocaleString();
      const clipRepostCount = card.querySelector('[data-clip-repost-count]');
      if (clipRepostCount) clipRepostCount.textContent = Number(post.repostCount || 0).toLocaleString();
      const currentComments = card.querySelector('.post-comments');
      if (currentComments) {
        const template = document.createElement('template');
        template.innerHTML = renderPostComments(post).trim();
        const nextComments = template.content.firstElementChild;
        if (nextComments) currentComments.replaceWith(nextComments);
      }
    }
    return true;
  }

  const POST_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
  const POST_VIDEO_MAX_BYTES = 128 * 1024 * 1024;

  function releasePostComposerMedia(composer) {
    if (!composer) return;
    composer.uploadController?.abort();
    unloadPostComposerVideos();
    const urls = new Set([
      composer.previewUrl,
      composer.posterUrl,
      ...(composer.items || []).flatMap((item) => [item.previewUrl, item.posterUrl])
    ].filter((url) => String(url || '').startsWith('blob:')));
    composer.previewUrl = '';
    composer.posterUrl = '';
    (composer.items || []).forEach((item) => {
      item.previewUrl = '';
      item.posterUrl = '';
    });
    urls.forEach((url) => URL.revokeObjectURL(url));
  }

  function setPostPublishing(publishing) {
    state.postPublishing = publishing;
    const button = document.querySelector('#post-composer-slot [data-action="publish-post"]');
    if (!button) return;
    button.disabled = publishing;
    button.textContent = publishing ? 'Uploading…' : 'Share';
  }

  function createVideoPoster(previewUrl) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      let settled = false;
      let capturing = false;
      const timeout = setTimeout(() => finish(''), 5000);
      const finish = (posterUrl) => {
        if (settled) {
          if (String(posterUrl || '').startsWith('blob:')) URL.revokeObjectURL(posterUrl);
          return;
        }
        settled = true;
        clearTimeout(timeout);
        video.pause();
        video.removeAttribute('src');
        video.load();
        resolve(posterUrl);
      };
      const capture = () => {
        if (settled || capturing || !video.videoWidth || !video.videoHeight) return;
        capturing = true;
        const scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        try {
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          if (canvas.toBlob) {
            canvas.toBlob((blob) => finish(blob ? URL.createObjectURL(blob) : ''), 'image/jpeg', 0.72);
          } else {
            finish(canvas.toDataURL('image/jpeg', 0.72));
          }
        } catch {
          finish('');
        }
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.addEventListener('loadeddata', capture, { once: true });
      video.addEventListener('seeked', capture, { once: true });
      video.addEventListener('loadedmetadata', () => {
        if (video.readyState >= 2) capture();
        else {
          try { video.currentTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration / 4 : 0.1); } catch {}
        }
      }, { once: true });
      video.addEventListener('error', () => finish(''), { once: true });
      video.src = previewUrl;
      video.load();
    });
  }

  function applyPostVideoPoster(composer) {
    syncPostComposerAliases(composer);
    if (!composer?.posterUrl || state.postComposer !== composer) return;
    document.querySelectorAll('#post-composer-slot [data-video-poster]').forEach((image) => {
      image.src = composer.posterUrl;
      image.hidden = false;
      const placeholder = image.nextElementSibling;
      if (placeholder?.classList.contains('post-video-filter-placeholder')) placeholder.hidden = true;
    });
  }

  async function uploadPostMedia(file, mime, signal) {
    const headers = {
      'Content-Type': mime || file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'post-media'),
      'X-File-Last-Modified': file.lastModified ? new Date(file.lastModified).toISOString() : ''
    };
    const response = await fetch('/api/post-media', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: file,
      signal
    });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(data.error || data || response.statusText);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function discardPendingPostMedia(fileId) {
    if (!fileId) return;
    await api(`/api/post-media/${encodeURIComponent(fileId)}`, { method: 'DELETE' }).catch(() => {});
  }

  function showPostSelectionError(error) {
    console.error(error);
    pushToast({
      key: 'post-selection-error',
      kind: 'social',
      title: 'Could not open that file',
      body: error?.message || 'Choose a different photo or video and try again.'
    });
  }

  function postMediaType(file) {
    const declared = String(file?.type || '').trim().toLowerCase();
    if (declared.startsWith('image/') || declared.startsWith('video/')) return declared;
    if (declared && declared !== 'application/octet-stream') return declared;
    const extension = String(file?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
    return {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
      mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', '3gp': 'video/3gpp', '3g2': 'video/3gpp2'
    }[extension] || declared;
  }

  function createPostComposerItem(file, aspect = 'original') {
    const type = postMediaType(file);
    if (!type.startsWith('image/') && !type.startsWith('video/')) throw new Error(`${file?.name || 'That file'} is not a supported photo or video.`);
    const isVideo = type.startsWith('video/');
    const maximum = isVideo ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES;
    const previewUrl = URL.createObjectURL(file);
    return {
      file,
      previewUrl,
      posterUrl: '',
      sizeError: file.size > maximum
        ? `${file.name || `This ${isVideo ? 'video' : 'image'}`} is ${Math.ceil(file.size / 1024 / 1024)} MB. Choose one under ${Math.floor(maximum / 1024 / 1024)} MB to share.`
        : '',
      name: file.name || (isVideo ? 'post.mp4' : 'post.jpg'),
      type,
      lastModified: file.lastModified || null,
      isVideo,
      naturalAspect: 1,
      altText: '',
      crop: { aspect, aspectRatio: aspect, zoom: 1, x: 0, y: 0, rotation: 0 },
      filter: 'normal',
      activeAdjustment: 'saturation',
      adjustments: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 }
    };
  }

  function readPostMediaAspect(item) {
    return new Promise((resolve) => {
      const media = item.isVideo ? document.createElement('video') : new Image();
      let settled = false;
      const timeout = setTimeout(() => finish(1), 5000);
      const finish = (ratio) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (item.isVideo) {
          media.pause();
          media.removeAttribute('src');
          media.load();
        } else {
          media.src = '';
        }
        resolve(clamp(Number(ratio) || 1, 0.25, 4));
      };
      const ready = () => finish(item.isVideo
        ? Number(media.videoWidth || 1) / Number(media.videoHeight || 1)
        : Number(media.naturalWidth || 1) / Number(media.naturalHeight || 1));
      media.addEventListener(item.isVideo ? 'loadedmetadata' : 'load', ready, { once: true });
      media.addEventListener('error', () => finish(1), { once: true });
      if (item.isVideo) {
        media.muted = true;
        media.preload = 'metadata';
      }
      media.src = item.previewUrl;
      if (item.isVideo) media.load();
    });
  }

  async function hydratePostComposerItem(composer, item) {
    const [naturalAspect, posterUrl] = await Promise.all([
      readPostMediaAspect(item),
      item.isVideo ? createVideoPoster(item.previewUrl) : Promise.resolve('')
    ]);
    if (state.postComposer !== composer || !composer.items.includes(item)) {
      if (String(posterUrl || '').startsWith('blob:')) URL.revokeObjectURL(posterUrl);
      return;
    }
    item.naturalAspect = naturalAspect;
    item.posterUrl = posterUrl;
    if (composer.aspect === 'mixed') Object.assign(item.crop, { aspect: 'mixed', aspectRatio: `mixed:${clamp(naturalAspect, 0.75, 1.91).toFixed(4)}` });
    if (composer.items[0] === item) {
      composer.originalAspect = naturalAspect;
      if (composer.aspect === 'original') {
        const aspectRatio = `original:${clamp(naturalAspect, 0.75, 1.91).toFixed(4)}`;
        composer.items.forEach((entry) => Object.assign(entry.crop, { aspect: 'original', aspectRatio }));
      }
      if (composer.aspect === 'original' || composer.aspect === 'mixed') {
        document.querySelector('#post-composer-slot .post-composer-media')?.style.setProperty('--post-aspect', String(postComposerAspectRatio(composer)));
      }
    }
    syncPostComposerAliases(composer);
    if (activePostComposerItem(composer) === item && item.isVideo) applyPostVideoPoster(composer);
  }

  async function appendPostComposerMedia(files) {
    const composer = state.postComposer;
    if (!composer) return beginPostComposer(files);
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    if (composer.items.length + selectedFiles.length > 20) throw new Error('You can share up to 20 photos and videos in one post.');
    const newItems = selectedFiles.map((file) => createPostComposerItem(file, composer.aspect || 'portrait'));
    if (composer.aspect === 'original') {
      const aspectRatio = `original:${clamp(Number(composer.originalAspect || 1), 0.75, 1.91).toFixed(4)}`;
      newItems.forEach((item) => Object.assign(item.crop, { aspect: 'original', aspectRatio }));
    }
    composer.items.push(...newItems);
    composer.music = null;
    composer.activeIndex = composer.items.length - newItems.length;
    syncPostComposerAliases(composer);
    updatePostComposerSlot();
    await Promise.all(newItems.map((item) => hydratePostComposerItem(composer, item)));
  }

  async function beginPostComposer(file = null) {
    if (!file) {
      openPostMediaPicker();
      return;
    }
    const selectedFiles = Array.isArray(file) ? file.filter(Boolean) : Array.from(typeof file?.length === 'number' && !file?.name ? file : [file]).filter(Boolean);
    if (!selectedFiles.length) return;
    if (selectedFiles.length > 20) throw new Error('You can share up to 20 photos and videos in one post.');
    const items = selectedFiles.map((selectedFile) => createPostComposerItem(selectedFile));
    if (state.postComposer) releasePostComposerMedia(state.postComposer);
    const composer = {
      stage: 1,
      items,
      activeIndex: 0,
      aspect: 'original',
      originalAspect: 1,
      uploadController: null,
      title: '',
      description: '',
      hashtags: '',
      location: '',
      music: null,
      previewMuted: true,
      allowReposts: state.me?.allowReposts !== false,
      allowComments: true,
      hideLikeCounts: false,
      personTags: [],
      pendingTagPoint: null
    };
    syncPostComposerAliases(composer);
    state.postComposer = composer;
    state.postPublishing = false;
    updatePostComposerSlot();
    await Promise.all(items.map((item) => hydratePostComposerItem(composer, item)));
  }

  function closePostComposer() {
    const composer = state.postComposer;
    state.postComposer = null;
    if (state.musicPicker?.context === 'post') state.musicPicker = null;
    state.postPublishing = false;
    state.postCropDrag = null;
    state.postCropGesture = null;
    postCropPointers.clear();
    releasePostComposerMedia(composer);
    updatePostComposerSlot();
  }

  async function publishPost() {
    const composer = state.postComposer;
    if (!composer || state.postPublishing) return;
    syncPostComposerAliases(composer);
    if (composer.sizeError) throw new Error(composer.sizeError);
    composer.title = document.getElementById('post-title')?.value.slice(0, 100) || composer.title;
    composer.description = document.getElementById('post-description')?.value.slice(0, 2200) || composer.description;
    composer.hashtags = document.getElementById('post-hashtags')?.value.slice(0, 300) || composer.hashtags;
    composer.location = (document.getElementById('post-location')?.value ?? composer.location).slice(0, 100);
    const activeItem = activePostComposerItem(composer);
    if (activeItem) activeItem.altText = (document.getElementById('post-alt-text')?.value ?? activeItem.altText).slice(0, 500);
    composer.allowReposts = document.getElementById('post-allow-reposts')?.checked !== false;
    composer.allowComments = document.getElementById('post-allow-comments')?.checked !== false;
    composer.hideLikeCounts = document.getElementById('post-hide-like-counts')?.checked === true;
    const publishItems = composer.items.map((item) => ({
      file: item.file,
      type: item.type,
      crop: { ...item.crop },
      filter: item.filter,
      adjustments: { ...item.adjustments },
      altText: item.altText || ''
    }));
    const publishDetails = {
      title: composer.title,
      description: composer.description,
      hashtags: composer.hashtags,
      location: composer.location,
      allowReposts: composer.allowReposts,
      allowComments: composer.allowComments,
      hideLikeCounts: composer.hideLikeCounts,
      personTags: composer.personTags.map(({ userId, mediaIndex, x, y }) => ({ userId, mediaIndex, x, y })),
      music: composer.music ? {
        catalogId: composer.music.catalogId,
        start: Number(composer.music.start || 0),
        clipDuration: Number(composer.music.clipDuration || 30)
      } : null
    };
    const controller = new AbortController();
    composer.uploadController = controller;
    setPostPublishing(true);
    updatePostComposerSlot();
    let pendingFileId = '';
    const pendingFileIds = [];
    try {
      for (let index = 0; index < publishItems.length; index += 1) {
        const item = publishItems[index];
        const button = document.querySelector('#post-composer-slot [data-action="publish-post"]');
        if (button) button.textContent = `Uploading ${index + 1}/${publishItems.length}`;
        const uploaded = await uploadPostMedia(item.file, item.type, controller.signal);
        pendingFileId = uploaded.file?.id || uploaded.fileId || '';
        if (!pendingFileId) throw new Error('A media upload did not return a file ID.');
        pendingFileIds.push(pendingFileId);
        if (state.postComposer !== composer) throw new DOMException('Post upload cancelled.', 'AbortError');
      }
      const data = await api('/api/posts', {
        method: 'POST',
        signal: controller.signal,
        body: {
          fileId: pendingFileIds[0] || pendingFileId,
          fileIds: pendingFileIds,
          mediaEdits: publishItems.map((item) => ({
            crop: item.crop,
            filter: item.filter,
            adjustments: item.adjustments,
            edits: { crop: item.crop, filter: item.filter, adjustments: item.adjustments }
          })),
          title: publishDetails.title,
          description: publishDetails.description,
          hashtags: publishDetails.hashtags,
          location: publishDetails.location,
          altTexts: publishItems.map((item) => item.altText),
          personTags: publishDetails.personTags,
          music: publishDetails.music,
          allowReposts: publishDetails.allowReposts,
          allowComments: publishDetails.allowComments,
          hideLikeCounts: publishDetails.hideLikeCounts,
          crop: publishItems[0].crop,
          filter: publishItems[0].filter,
          adjustments: publishItems[0].adjustments,
          edits: { crop: publishItems[0].crop, filter: publishItems[0].filter, adjustments: publishItems[0].adjustments }
        }
      });
      pendingFileId = '';
      pendingFileIds.length = 0;
      if (data.user) state.me = data.user;
      state.postComposer = null;
      state.postPublishing = false;
      releasePostComposerMedia(composer);
      updatePostComposerSlot();
      await Promise.all([loadFeed(state.feedMode, { render: false }), loadExplore(), loadClips(), loadProfilePosts(state.me, 'posts', { render: false })]);
      state.profileMediaTab = 'posts';
      state.tab = 'home';
      updateSidebar();
      pushToast({ key: `post-${data.post?.id || Date.now()}`, kind: 'social', title: 'Post shared', body: 'Your photo or video is now live.' });
    } catch (error) {
      await Promise.all(Array.from(new Set([...pendingFileIds, pendingFileId].filter(Boolean))).map(discardPendingPostMedia));
      if (state.postComposer === composer) {
        setPostPublishing(false);
        updatePostComposerSlot();
      }
      if (error?.name === 'AbortError') return;
      throw error;
    } finally {
      composer.uploadController = null;
    }
  }

  async function togglePostAction(postId, action) {
    const escapedId = window.CSS?.escape ? CSS.escape(String(postId)) : String(postId).replace(/"/g, '\\"');
    const buttons = Array.from(document.querySelectorAll(`.feed-post[data-post-id="${escapedId}"] [data-action="toggle-post-${action}"], .clip-card[data-post-id="${escapedId}"] [data-action="toggle-post-${action}"]`));
    if (buttons.some((button) => button.classList.contains('is-pending'))) return;
    buttons.forEach((button) => button.classList.add('is-pending'));
    let data;
    try {
      data = await api(`/api/posts/${encodeURIComponent(postId)}/${action}`, { method: 'POST' });
    } catch (error) {
      buttons.forEach((button) => button.classList.remove('is-pending'));
      throw error;
    }
    replacePost(data.post);
    const synced = syncPostEngagement(data.post, action);
    if (!synced && state.tab === 'clips') {
      renderSidebarState();
      requestAnimationFrame(attachClipPlayback);
    }
    if (action === 'save') await loadProfilePosts(state.me, 'saved', { render: false }).catch(() => []);
    if (action === 'repost') await loadProfilePosts(state.me, 'reposts', { render: false }).catch(() => []);
  }

  function postShareDetails(postId) {
    const post = postById(postId);
    if (!post) return null;
    const author = postAuthor(post);
    const url = new URL(accountProfileHref(author), location.origin);
    url.searchParams.set('post', post.id);
    return {
      post,
      shareData: {
        title: post.title || `Post by @${author?.username || 'user'}`,
        text: String(post.description || '').slice(0, 180),
        url: url.toString()
      }
    };
  }

  function sharePost(postId) {
    const details = postShareDetails(postId);
    if (!details) return;
    currentAppShell()?.querySelector(`.clip-card[data-post-id="${window.CSS?.escape ? CSS.escape(postId) : postId}"] .clip-video`)?.pause?.();
    openActionSheet({ type: 'post-share', postId, query: '', selectedTargets: [], sending: false });
  }

  async function copyTextToClipboard(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { field.remove(); }
    if (!copied) throw new Error('Copying is not available in this browser.');
    return true;
  }

  async function copyPostLink(postId) {
    const details = postShareDetails(postId);
    if (!details) return;
    await copyTextToClipboard(details.shareData.url);
    pushToast({ key: `post-link-${details.post.id}`, kind: 'social', title: 'Link copied', body: 'The post link is ready to share.' });
  }

  async function sharePostExternally(postId) {
    const details = postShareDetails(postId);
    if (!details) return;
    if (navigator.share) {
      try {
        await navigator.share(details.shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyPostLink(postId);
  }

  async function sendSharedPost(postId) {
    const sheet = state.actionSheet?.type === 'post-share' && state.actionSheet.postId === postId ? state.actionSheet : null;
    if (!sheet || sheet.sending || !sheet.selectedTargets?.length) return;
    sheet.sending = true;
    updateActionSheetSlot();
    const delivered = [];
    const failed = [];
    await Promise.all(sheet.selectedTargets.map(async (key) => {
      const [kind, id] = String(key).split(':');
      const url = kind === 'group'
        ? `/api/groups/${encodeURIComponent(id)}/messages`
        : `/api/chats/${encodeURIComponent(id)}/messages`;
      try {
        const data = await api(url, { method: 'POST', body: { kind: 'post', postId } });
        delivered.push({ key, message: data.message });
        if ((kind === 'group' && state.activeGroup?.id === id) || (kind === 'peer' && state.activePeer?.id === id)) {
          if (data.message) upsertMessage(data.message);
        }
      } catch (error) {
        failed.push({ key, error });
      }
    }));
    await refreshChatsOnly();
    if (state.actionSheet === sheet) {
      state.actionSheet = null;
      state.overlayClosing = false;
      updateActionSheetSlot();
      if (state.clipViewer || state.tab === 'clips') requestAnimationFrame(attachClipPlayback);
    }
    if (delivered.length) {
      pushToast({ key: `post-sent-${postId}-${Date.now()}`, kind: 'social', title: 'Sent', body: `Shared to ${delivered.length} ${delivered.length === 1 ? 'chat' : 'chats'}.` });
    }
    if (failed.length) throw new Error(`Could not send to ${failed.length} ${failed.length === 1 ? 'chat' : 'chats'}.`);
  }

  async function loadSharedLinkPost(postId, options = {}) {
    try {
      const data = await api(`/api/posts/${encodeURIComponent(postId)}`);
      const post = data.post;
      const items = postMediaItems(post);
      const first = items[0];
      if (!post || !first?.media?.url) return null;
      if (options.publicOnly) {
        state.mediaViewer = {
          src: first.media.url,
          name: post.title || `Post by ${postAuthor(post)?.username || 'user'}`,
          type: first.media.mime || (first.mediaType === 'video' ? 'video/*' : 'image/*'),
          deepLinkPostId: post.id
        };
        return post;
      }
      state.homeFeed = [post, ...state.homeFeed.filter((item) => item.id !== post.id)];
      if (first.mediaType === 'video') {
        if (items.length === 1) state.clips = [post, ...state.clips.filter((item) => item.id !== post.id)];
        state.mediaViewer = null;
        state.clipViewer = { postId: post.id, mediaIndex: 0, sourceTab: state.tab, sourceTime: 0 };
        const url = new URL(location.href);
        url.searchParams.delete('post');
        url.searchParams.set('clip', post.id);
        url.searchParams.set('media', '0');
        history.replaceState(history.state, '', url.toString());
      } else {
        state.mediaViewer = {
          src: first.media.url,
          name: post.title || `Post by ${postAuthor(post)?.username || 'user'}`,
          type: first.media.mime || 'image/*',
          deepLinkPostId: post.id
        };
      }
      return post;
    } catch {
      return null;
    }
  }

  async function openSharedPost(postId) {
    const data = await api(`/api/posts/${encodeURIComponent(postId)}`);
    const post = data.post;
    if (!post) throw new Error('This post is no longer available.');
    state.homeFeed = [post, ...state.homeFeed.filter((item) => item.id !== post.id)];
    const first = postMediaItems(post)[0];
    if (first?.mediaType === 'video') {
      if (postMediaItems(post).length === 1) state.clips = [post, ...state.clips.filter((item) => item.id !== post.id)];
      openPostClip(post.id, 0);
      return;
    }
    switchMainTab('home', { animate: false });
    setTimeout(() => document.querySelector(`.feed-post[data-post-id="${window.CSS?.escape ? CSS.escape(post.id) : post.id}"]`)?.scrollIntoView({ block: 'start' }), 0);
  }

  async function commentOnPost(postId, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const sheet = state.actionSheet?.type === 'post-comments' && state.actionSheet.postId === postId
      ? state.actionSheet
      : null;
    const replyToCommentId = sheet?.replyToCommentId || null;
    if (sheet?.commentPosting) return;
    if (sheet) {
      sheet.commentDraft = clean;
      sheet.commentPosting = true;
      document.querySelector('.post-comment-composer')?.setAttribute('aria-busy', 'true');
      document.querySelectorAll('.post-comment-composer input, .post-comment-composer button').forEach((control) => { control.disabled = true; });
    }
    let data;
    try {
      data = await api(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        body: { text: clean, replyTo: replyToCommentId }
      });
    } catch (error) {
      if (sheet && state.actionSheet === sheet) {
        sheet.commentPosting = false;
        updateActionSheetSlot();
        requestAnimationFrame(() => document.getElementById('post-comment-input')?.focus({ preventScroll: true }));
      }
      throw error;
    }
    replacePost(data.post);
    syncPostEngagement(data.post);
    if (sheet && state.actionSheet === sheet) {
      const expandedCommentIds = new Set(sheet.expandedCommentIds || []);
      if (data.comment?.replyTo) {
        const byId = new Map((data.post.comments || []).map((comment) => [comment.id, comment]));
        let rootId = data.comment.replyTo;
        const visited = new Set();
        while (byId.get(rootId)?.replyTo && !visited.has(rootId)) {
          visited.add(rootId);
          rootId = byId.get(rootId).replyTo;
        }
        expandedCommentIds.add(rootId);
      }
      state.actionSheet = {
        ...sheet,
        commentDraft: '',
        commentPosting: false,
        newCommentId: data.comment?.id || null,
        replyToCommentId: null,
        expandedCommentIds: [...expandedCommentIds]
      };
      updateActionSheetSlot();
      requestAnimationFrame(() => {
        const list = document.querySelector('.post-comment-list');
        list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        document.getElementById('post-comment-input')?.focus({ preventScroll: true });
      });
      setTimeout(() => {
        if (state.actionSheet?.type === 'post-comments' && state.actionSheet.postId === postId) state.actionSheet.newCommentId = null;
      }, 520);
    }
  }

  function addPostCommentEmoji(emoji, sourceButton) {
    if (state.actionSheet?.type !== 'post-comments' || state.actionSheet.commentPosting) return;
    const input = document.getElementById('post-comment-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`.slice(0, 500);
    input.value = next;
    state.actionSheet.commentDraft = next;
    const submit = document.querySelector('.post-comment-submit');
    if (submit) submit.disabled = !next.trim();
    sourceButton?.classList.remove('reaction-pop');
    void sourceButton?.offsetWidth;
    sourceButton?.classList.add('reaction-pop');
    input.focus({ preventScroll: true });
    const caret = Math.min(next.length, start + emoji.length);
    input.setSelectionRange?.(caret, caret);
  }

  function togglePostCommentReplies(commentId) {
    if (state.actionSheet?.type !== 'post-comments') return;
    const expanded = new Set(state.actionSheet.expandedCommentIds || []);
    if (expanded.has(commentId)) expanded.delete(commentId);
    else expanded.add(commentId);
    state.actionSheet.expandedCommentIds = [...expanded];
    updatePostCommentsSheet();
  }

  function beginPostCommentReply(postId, commentId) {
    if (state.actionSheet?.type !== 'post-comments' || state.actionSheet.postId !== postId || state.actionSheet.commentPosting) return;
    const post = postById(postId);
    const comment = post?.comments?.find((item) => item.id === commentId);
    if (!comment) return;
    state.actionSheet.replyToCommentId = comment.id;
    state.actionSheet.commentDraft = `@${comment.user?.username || ''} `;
    const expanded = new Set(state.actionSheet.expandedCommentIds || []);
    const byId = new Map((post.comments || []).map((item) => [item.id, item]));
    let rootId = comment.id;
    const visited = new Set();
    while (byId.get(rootId)?.replyTo && !visited.has(rootId)) {
      visited.add(rootId);
      rootId = byId.get(rootId).replyTo;
    }
    expanded.add(rootId);
    state.actionSheet.expandedCommentIds = [...expanded];
    updatePostCommentsSheet({ useStateDraft: true, focus: true, commentId });
  }

  function clearPostCommentReply() {
    if (state.actionSheet?.type !== 'post-comments' || state.actionSheet.commentPosting) return;
    const post = postById(state.actionSheet.postId);
    const comment = post?.comments?.find((item) => item.id === state.actionSheet.replyToCommentId);
    const currentDraft = document.getElementById('post-comment-input')?.value || state.actionSheet.commentDraft || '';
    const prefix = comment ? `@${comment.user?.username || ''} ` : '';
    state.actionSheet.replyToCommentId = null;
    state.actionSheet.commentDraft = prefix && currentDraft.startsWith(prefix) ? currentDraft.slice(prefix.length) : currentDraft;
    updatePostCommentsSheet({ useStateDraft: true, focus: true });
  }

  function updatePostCommentsSheet(options = {}) {
    if (state.actionSheet?.type !== 'post-comments') return;
    const list = document.querySelector('.post-comment-list');
    const scrollTop = list?.scrollTop || 0;
    const draft = options.useStateDraft
      ? state.actionSheet.commentDraft || ''
      : document.getElementById('post-comment-input')?.value ?? state.actionSheet.commentDraft ?? '';
    state.actionSheet.commentDraft = draft;
    state.actionSheet.refreshing = true;
    updateActionSheetSlot();
    state.actionSheet.refreshing = false;
    requestAnimationFrame(() => {
      const nextList = document.querySelector('.post-comment-list');
      if (nextList) nextList.scrollTop = scrollTop;
      if (options.commentId) {
        const escapedId = window.CSS?.escape ? CSS.escape(options.commentId) : String(options.commentId).replace(/"/g, '\\"');
        const row = document.querySelector(`.post-comment-row[data-comment-id="${escapedId}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: options.smooth ? 'smooth' : 'auto' });
        if (options.heart) {
          const button = row?.querySelector('.post-comment-like');
          button?.classList.add('heart-pop');
          setTimeout(() => button?.classList.remove('heart-pop'), 520);
        }
      }
      if (options.focus) {
        const input = document.getElementById('post-comment-input');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange?.(input.value.length, input.value.length);
      }
    });
  }

  async function mutatePostComment(postId, commentId, action) {
    const escapedId = window.CSS?.escape ? CSS.escape(commentId) : String(commentId).replace(/"/g, '\\"');
    const row = document.querySelector(`.post-comment-row[data-comment-id="${escapedId}"]`);
    const control = row?.querySelector(`[data-action="${action}"]`);
    if (control?.classList.contains('is-pending')) return;
    control?.classList.add('is-pending');
    let data;
    try {
      const endpoint = action === 'delete-post-comment'
        ? `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`
        : `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/${action === 'toggle-post-comment-pin' ? 'pin' : 'like'}`;
      data = await api(endpoint, { method: action === 'delete-post-comment' ? 'DELETE' : 'POST' });
    } catch (error) {
      control?.classList.remove('is-pending');
      throw error;
    }
    replacePost(data.post);
    syncPostEngagement(data.post);
    if (state.actionSheet?.type === 'post-comments' && state.actionSheet.postId === postId) {
      updatePostCommentsSheet({
        commentId: action === 'delete-post-comment' ? null : commentId,
        smooth: action === 'toggle-post-comment-pin',
        heart: action === 'toggle-post-comment-like'
      });
    }
  }

  async function togglePostCommentLike(postId, commentId) {
    return mutatePostComment(postId, commentId, 'toggle-post-comment-like');
  }

  async function togglePostCommentPin(postId, commentId) {
    return mutatePostComment(postId, commentId, 'toggle-post-comment-pin');
  }

  async function deletePostComment(postId, commentId) {
    return mutatePostComment(postId, commentId, 'delete-post-comment');
  }

  async function deletePost(postId) {
    await api(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
    const wasViewing = state.clipViewer?.postId === postId;
    state.actionSheet = null;
    state.homeFeed = state.homeFeed.filter((post) => post.id !== postId);
    state.explorePosts = state.explorePosts.filter((post) => post.id !== postId);
    state.clips = state.clips.filter((post) => post.id !== postId);
    for (const [key, posts] of state.profilePosts.entries()) state.profilePosts.set(key, posts.filter((post) => post.id !== postId));
    const escapedId = window.CSS?.escape ? CSS.escape(String(postId)) : String(postId).replace(/"/g, '\\"');
    document.querySelectorAll(`[data-post-id="${escapedId}"]`).forEach((element) => {
      if (element.matches('.feed-post, .clip-card')) element.remove();
    });
    await loadContactsAndChats();
    updateActionSheetSlot();
    if (wasViewing) closeClipViewer();
    else updateSidebar();
  }

  async function toggleFavoriteUser(userId) {
    const user = userById(userId);
    if (!user) return;
    const data = await api(`/api/favorites/${encodeURIComponent(userId)}`, { method: user.isFavorite ? 'DELETE' : 'POST' });
    const updated = data.user || { ...user, isFavorite: !user.isFavorite };
    Object.assign(user, updated);
    if (state.publicProfile?.id === userId) state.publicProfile = { ...state.publicProfile, ...updated };
    state.actionSheet = null;
    updateActionSheetSlot();
    if (state.feedMode === 'favorites') await loadFeed('favorites', { render: false });
    updateSidebar();
  }

  function openNoteComposer() {
    const current = state.notes.find((note) => (note.owner || note.user)?.id === state.me?.id);
    state.noteComposer = {
      text: current?.text || '',
      audio: null,
      music: current?.music ? { ...current.music } : null,
      audioTitle: current?.audioTitle || '',
      audioArtist: current?.audioArtist || '',
      hasExisting: Boolean(current)
    };
    updateNoteComposerSlot();
  }

  function audioLength(dataUrl) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => resolve(0);
      audio.src = dataUrl;
    });
  }

  async function chooseNoteAudio(file) {
    if (!file || !state.noteComposer) return;
    if (!String(file.type || '').startsWith('audio/')) throw new Error('Choose an audio file.');
    const dataUrl = await fileToDataUrl(file);
    const duration = await audioLength(dataUrl);
    if (duration > 30.15) throw new Error('Audio notes must be 30 seconds or shorter.');
    state.noteComposer.audio = {
      name: file.name || 'note-audio.webm',
      type: file.type || mimeFromDataUrl(dataUrl),
      dataUrl,
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      duration
    };
    state.noteComposer.music = null;
    state.noteComposer.audioTitle = String(file.name || 'Original audio').replace(/\.[^.]+$/, '').slice(0, 80) || 'Original audio';
    state.noteComposer.audioArtist = 'Original audio';
    updateNoteComposerSlot();
  }

  async function startNoteRecording() {
    if (!state.noteComposer || state.noteRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Audio recording is not supported in this browser.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const recording = { recorder, stream, chunks: [], startedAt: Date.now(), timer: null };
    recorder.ondataavailable = (event) => { if (event.data?.size) recording.chunks.push(event.data); };
    recorder.onstop = async () => {
      clearTimeout(recording.timer);
      recording.stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(recording.chunks, { type: recorder.mimeType || 'audio/webm' });
      const dataUrl = await blobToDataUrl(blob);
      if (state.noteComposer) {
        state.noteComposer.audio = { name: 'recorded-note.webm', type: blob.type || 'audio/webm', dataUrl, duration: Math.min(30, (Date.now() - recording.startedAt) / 1000) };
        state.noteComposer.music = null;
        state.noteComposer.audioTitle = 'Recorded audio';
        state.noteComposer.audioArtist = state.me?.username || 'Original audio';
      }
      if (state.noteRecording === recording) state.noteRecording = null;
      updateNoteComposerSlot();
    };
    recorder.start();
    recording.timer = setTimeout(() => stopNoteRecording(), 30000);
    state.noteRecording = recording;
    updateNoteComposerSlot();
  }

  function stopNoteRecording() {
    const recording = state.noteRecording;
    if (!recording) return;
    if (recording.recorder.state !== 'inactive') recording.recorder.stop();
  }

  async function shareNote() {
    if (!state.noteComposer) return;
    const text = (document.getElementById('note-text')?.value || state.noteComposer.text || '').trim().slice(0, 60);
    const audioTitle = (state.noteComposer.music?.title || state.noteComposer.audioTitle || '').trim().slice(0, 80);
    const audioArtist = (state.noteComposer.music?.artist || state.noteComposer.audioArtist || '').trim().slice(0, 80);
    if (!text && !state.noteComposer.audio && !state.noteComposer.music) throw new Error('Write a note or add audio first.');
    await api('/api/me/note', {
      method: 'POST',
      body: {
        text,
        audio: state.noteComposer.audio,
        music: state.noteComposer.music ? {
          catalogId: state.noteComposer.music.catalogId,
          start: Number(state.noteComposer.music.start || 0),
          clipDuration: Number(state.noteComposer.music.clipDuration || 30)
        } : null,
        audioTitle,
        audioArtist,
        audioStart: Number(state.noteComposer.music?.start || 0),
        audioDuration: Number(state.noteComposer.music?.clipDuration || state.noteComposer.audio?.duration || 0) || null
      }
    });
    state.noteComposer = null;
    updateNoteComposerSlot();
    await loadNotes({ render: true });
  }

  async function deleteNote() {
    await api('/api/me/note', { method: 'DELETE' });
    state.noteComposer = null;
    updateNoteComposerSlot();
    await loadNotes({ render: true });
  }

  function playNote(noteId) {
    const selected = document.getElementById(`note-audio-${noteId}`);
    const note = state.notes.find((item) => item.id === noteId);
    document.querySelectorAll('.note-rail audio').forEach((audio) => {
      if (audio !== selected) audio.pause();
    });
    if (!selected) return;
    if (!selected.paused) {
      selected.pause();
      return;
    }
    const start = Math.max(0, Number(note?.audioStart || note?.music?.start || 0));
    const duration = Math.max(0, Number(note?.audioDuration || note?.music?.clipDuration || 0));
    const end = duration ? start + duration : Infinity;
    const begin = () => {
      if (!Number.isFinite(selected.currentTime) || selected.currentTime < start || selected.currentTime >= end) selected.currentTime = start;
      selected.play().catch(() => {});
    };
    selected.ontimeupdate = () => {
      if (selected.currentTime >= end) {
        selected.pause();
        selected.currentTime = start;
      }
    };
    if (selected.readyState >= 1) begin();
    else selected.addEventListener('loadedmetadata', begin, { once: true });
  }

  async function loadContactsAndChats() {
    const [me, contacts, chats, groups, notifications, recommendations] = await Promise.all([
      api('/api/me'),
      api('/api/contacts'),
      api('/api/chats'),
      api('/api/groups').catch(() => ({ groups: [] })),
      api('/api/notifications').catch(() => ({ pendingRequestCount: 0, requests: [], notifications: [] })),
      api('/api/users/recommendations').catch(() => ({ users: [] }))
    ]);
    state.me = me.user;
    state.twoFactorEnabled = me.twoFactorEnabled;
    state.isModerator = Boolean(me.isModerator);
    state.contacts = contacts.users;
    state.chats = chats.chats;
    state.groups = groups.groups || [];
    state.pendingRequestCount = notifications.pendingRequestCount || 0;
    state.requests = notifications.requests || [];
    state.notifications = notifications.notifications || [];
    state.recommendations = recommendations.users || [];
    if (state.activePeer) {
      state.activePeer = userById(state.activePeer.id) || state.activePeer;
    }
    if (state.activeGroup) state.activeGroup = state.groups.find((group) => group.id === state.activeGroup.id) || state.activeGroup;
  }

  let musicSearchTimer = null;
  let musicSearchRequestId = 0;
  let musicCatalogPreviewAudio = null;
  let musicPickerReturnFocus = null;
  let musicPickerWasOpen = false;

  function syncMusicPickerAccessibility() {
    const slot = document.getElementById('music-picker-slot');
    const open = Boolean(state.musicPicker && slot?.querySelector('.music-picker-overlay'));
    Array.from(app.children).forEach((child) => {
      if (child !== slot) child.inert = open;
    });
    if (!open && musicPickerWasOpen) {
      const returnTarget = musicPickerReturnFocus;
      musicPickerReturnFocus = null;
      if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus?.({ preventScroll: true }));
    }
    musicPickerWasOpen = open;
  }

  function stopMusicCatalogPreview() {
    if (musicCatalogPreviewAudio) {
      musicCatalogPreviewAudio.pause();
      musicCatalogPreviewAudio.src = '';
      musicCatalogPreviewAudio = null;
    }
    document.querySelectorAll('[data-action="preview-music-track"]').forEach((button) => { button.innerHTML = icon('play'); });
  }

  async function searchMusicCatalog(query = '') {
    const picker = state.musicPicker;
    if (!picker) return;
    const requestId = ++musicSearchRequestId;
    picker.query = String(query || '').slice(0, 80);
    picker.loading = true;
    picker.error = '';
    updateMusicPickerSlot();
    try {
      const data = await api(`/api/media/music${picker.query.trim() ? `?q=${encodeURIComponent(picker.query.trim())}` : ''}`);
      if (state.musicPicker !== picker || requestId !== musicSearchRequestId) return;
      picker.tracks = data.tracks || [];
      picker.provider = data.provider || 'Openverse';
      picker.error = '';
    } catch (error) {
      if (state.musicPicker !== picker || requestId !== musicSearchRequestId) return;
      picker.tracks = [];
      picker.error = error.message;
    } finally {
      if (state.musicPicker === picker && requestId === musicSearchRequestId) {
        picker.loading = false;
        updateMusicPickerSlot();
        requestAnimationFrame(() => document.getElementById('music-search')?.focus({ preventScroll: true }));
      }
    }
  }

  function openMusicPicker(context) {
    const current = context === 'post' ? state.postComposer?.music : state.noteComposer?.music;
    musicPickerReturnFocus = document.activeElement;
    state.musicPicker = {
      context: context === 'post' ? 'post' : 'note',
      query: '',
      tracks: [],
      loading: !current,
      provider: 'Openverse',
      selected: current ? { ...current } : null,
      start: Number(current?.start || 0),
      clipDuration: Number(current?.clipDuration || 30)
    };
    updateMusicPickerSlot();
    requestAnimationFrame(() => {
      const dialog = document.querySelector('.music-picker-sheet');
      const focusTarget = dialog?.querySelector(current ? 'button:not([disabled])' : '#music-search') || dialog;
      focusTarget?.focus?.({ preventScroll: true });
    });
    if (!current) searchMusicCatalog().catch((error) => alert(error.message));
  }

  function closeMusicPicker() {
    clearTimeout(musicSearchTimer);
    musicSearchRequestId += 1;
    stopMusicCatalogPreview();
    document.getElementById('music-picker-audio')?.pause?.();
    state.musicPicker = null;
    updateMusicPickerSlot();
  }

  function musicPickerTrack(trackId) {
    return state.musicPicker?.tracks?.find((track) => track.catalogId === trackId) || null;
  }

  function selectMusicTrack(trackId) {
    const picker = state.musicPicker;
    const track = musicPickerTrack(trackId);
    if (!picker || !track) return;
    stopMusicCatalogPreview();
    picker.selected = { ...track };
    picker.start = 0;
    picker.clipDuration = Math.min(30, Number(track.trackDuration || 30));
    updateMusicPickerSlot();
  }

  function previewMusicTrack(trackId, button) {
    const track = musicPickerTrack(trackId);
    if (!track?.audioUrl) return;
    if (musicCatalogPreviewAudio?.dataset?.trackId === trackId && !musicCatalogPreviewAudio.paused) {
      stopMusicCatalogPreview();
      return;
    }
    stopMusicCatalogPreview();
    const audio = new Audio(track.audioUrl);
    audio.dataset.trackId = trackId;
    audio.preload = 'metadata';
    const stopAt = 12;
    audio.ontimeupdate = () => { if (audio.currentTime >= stopAt) stopMusicCatalogPreview(); };
    audio.onended = stopMusicCatalogPreview;
    audio.onerror = stopMusicCatalogPreview;
    musicCatalogPreviewAudio = audio;
    if (button) button.innerHTML = icon('pause');
    audio.play().catch(() => stopMusicCatalogPreview());
  }

  function toggleMusicSegmentPreview() {
    const audio = document.getElementById('music-picker-audio');
    const button = document.querySelector('[data-action="toggle-music-segment-preview"]');
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      if (button) {
        button.innerHTML = icon('play');
        button.setAttribute('aria-label', 'Play selected section');
        button.setAttribute('aria-pressed', 'false');
      }
      return;
    }
    const start = Math.max(0, Number(audio.dataset.start || 0));
    const end = Math.max(start + 1, Number(audio.dataset.end || start + 30));
    if (!Number.isFinite(audio.currentTime) || audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start;
    audio.ontimeupdate = () => {
      const liveStart = Math.max(0, Number(audio.dataset.start || 0));
      const liveEnd = Math.max(liveStart + 1, Number(audio.dataset.end || liveStart + 30));
      if (audio.currentTime >= liveEnd) {
        audio.pause();
        audio.currentTime = liveStart;
        if (button) {
          button.innerHTML = icon('play');
          button.setAttribute('aria-label', 'Play selected section');
          button.setAttribute('aria-pressed', 'false');
        }
      }
    };
    audio.onended = () => {
      if (button) {
        button.innerHTML = icon('play');
        button.setAttribute('aria-label', 'Play selected section');
        button.setAttribute('aria-pressed', 'false');
      }
    };
    audio.play().then(() => {
      if (button) {
        button.innerHTML = icon('pause');
        button.setAttribute('aria-label', 'Pause selected section');
        button.setAttribute('aria-pressed', 'true');
      }
    }).catch(() => {});
  }

  function updateMusicSegmentStart(value) {
    if (!state.musicPicker?.selected) return;
    const duration = Number(state.musicPicker.clipDuration || 30);
    const maxStart = Math.max(0, Number(state.musicPicker.selected.trackDuration || 0) - duration);
    const start = clamp(Number(value || 0), 0, maxStart);
    state.musicPicker.start = start;
    document.querySelectorAll('[data-music-segment-start]').forEach((input) => { input.value = String(start); });
    const output = document.querySelector('.music-segment-slider output');
    if (output) output.textContent = formatClipTime(start);
    const summary = document.querySelector('.music-segment-summary strong');
    if (summary) summary.textContent = `${formatClipTime(start)}–${formatClipTime(start + duration)}`;
    const waveform = document.querySelector('.music-waveform-window');
    if (waveform) waveform.style.setProperty('--music-position', String(maxStart ? start / maxStart : 0));
    const audio = document.getElementById('music-picker-audio');
    if (audio) {
      audio.pause();
      audio.dataset.start = String(start);
      audio.dataset.end = String(start + duration);
      try { audio.currentTime = start; } catch {}
    }
    const button = document.querySelector('[data-action="toggle-music-segment-preview"]');
    if (button) {
      button.innerHTML = icon('play');
      button.setAttribute('aria-label', 'Play selected section');
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function applyMusicSelection() {
    const picker = state.musicPicker;
    const track = picker?.selected;
    if (!picker || !track) return;
    const selection = {
      ...track,
      start: Number(picker.start || 0),
      clipDuration: Number(picker.clipDuration || 30)
    };
    if (picker.context === 'post' && state.postComposer) state.postComposer.music = selection;
    if (picker.context === 'note' && state.noteComposer) {
      state.noteComposer.music = selection;
      state.noteComposer.audio = null;
      state.noteComposer.audioTitle = selection.title;
      state.noteComposer.audioArtist = selection.artist;
    }
    const context = picker.context;
    closeMusicPicker();
    if (context === 'post') updatePostComposerSlot();
    else updateNoteComposerSlot();
  }

  async function loadGifPool(query = '') {
    state.gifLoading = true;
    try {
      const [approved, pending] = await Promise.all([
        api(`/api/gifs${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`),
        state.isModerator ? api('/api/gifs?status=pending') : Promise.resolve({ gifs: [] })
      ]);
      state.gifPool = approved.gifs || [];
      state.pendingGifs = pending.gifs || [];
    } finally {
      state.gifLoading = false;
    }
  }

  let chatGifSearchTimer = null;
  let chatGifSearchRequestId = 0;

  async function loadChatGifResults(query = '') {
    const requestId = ++chatGifSearchRequestId;
    const term = String(query || '').trim().slice(0, 80);
    state.chatGifLoading = true;
    state.chatGifError = '';
    if (state.stickerPanel && state.chatTrayTab === 'gifs') updateChatFooter({ suppressFocus: true });
    try {
      const data = await api(`/api/media/gifs${term ? `?q=${encodeURIComponent(term)}` : ''}`);
      if (requestId !== chatGifSearchRequestId || term !== state.chatGifQuery.trim()) return;
      state.chatGifResults = data.gifs || [];
      state.chatGifProvider = data.provider || 'Openverse';
    } catch (error) {
      if (requestId !== chatGifSearchRequestId) return;
      state.chatGifResults = [];
      state.chatGifProvider = '';
      state.chatGifError = error.message || 'GIF search is temporarily unavailable.';
    } finally {
      if (requestId === chatGifSearchRequestId) {
        state.chatGifLoading = false;
        if (state.stickerPanel && state.chatTrayTab === 'gifs') {
          updateChatFooter({ suppressFocus: true });
          requestAnimationFrame(() => {
            const input = document.getElementById('chat-gif-search');
            input?.focus({ preventScroll: true });
            input?.setSelectionRange?.(input.value.length, input.value.length);
          });
        }
      }
    }
  }

  async function submitGif(file, options = {}) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const data = await api('/api/gifs', {
      method: 'POST',
      body: {
        title: options.title || state.storyEditor?.gifSubmissionTitle || file.name.replace(/\.[^.]+$/, ''),
        tags: options.tags || state.storyEditor?.gifSubmissionTags || '',
        file: {
          name: file.name || 'animation.gif',
          type: file.type || mimeFromDataUrl(dataUrl),
          dataUrl,
          lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
        }
      }
    });
    await loadGifPool(state.storyEditor?.gifQuery || '');
    if (data.pending && options.notify !== false) alert('GIF submitted for moderator review.');
    if (state.storyEditor) updateStoryEditorView();
    return data;
  }

  async function submitChatGif(file) {
    const data = await submitGif(file, { notify: false });
    if (data.pending) {
      pushToast({
        key: `gif-review-${data.gif.id}`,
        kind: 'social',
        title: 'GIF submitted',
        body: 'A moderator must approve it before it appears in the shared GIF pool.'
      });
      return;
    }
    await sendMessage({ kind: 'gif', text: '', gifId: data.gif.id });
    state.stickerPanel = false;
    updateChatFooter({ suppressFocus: true });
  }

  async function reviewGif(gifId, decision) {
    await api(`/api/gifs/${encodeURIComponent(gifId)}/${decision === 'approve' ? 'approve' : 'reject'}`, { method: 'POST' });
    await loadGifPool();
    updateProfileModalSlots();
  }

  async function openChat(userId, highlightMessageId = null, options = {}) {
    const peer = userById(userId);
    if (!peer) return;
    if (state.activePeer?.id === userId && !state.chatProfileOpen && !highlightMessageId && !state.chatLoading) return;
    chatScrollSettleCleanup?.();
    const navigationEntry = isMobileLayout() && options.pushNavigation !== false ? captureNavigationEntry('chat') : null;
    rememberActiveConversation();
    const cacheKey = conversationCacheKey('peer', userId);
    const cached = state.conversationCache.get(cacheKey);
    const savedScroll = state.conversationScroll.get(cacheKey) || cached?.scroll || null;
    state.activePeer = peer;
    state.activeGroup = null;
    if (state.searchProfileOpen) {
      state.searchProfileOpen = false;
      state.searchProfileSocialView = null;
      state.publicProfile = null;
    }
    if (isMobileLayout()) {
      state.tab = 'chats';
      state.lastTab = 'chats';
      state.profileSocialView = null;
    }
    state.chatOpening = !highlightMessageId;
    const openToken = ++state.chatOpenToken;
    state.chatLoading = !cached?.messages?.length;
    state.chatProfileOpen = false;
    state.chatProfileSocialView = null;
    state.replyTo = null;
    state.stickerPanel = false;
    state.typingPeerId = null;
    state.highlightMessageId = highlightMessageId;
    state.messages = cached?.messages || [];
    state.chatAppearance = cached?.appearance || defaultChatAppearance();
    state.hasOlderMessages = Boolean(cached?.hasMore);
    state.loadingOlderMessages = false;
    delete state.unreadByPeer[userId];
    if (navigationEntry) pushNavigationEntry(navigationEntry, '/');
    // Opening a conversation from the chat list is a request for the newest
    // messages. Navigation snapshots restore their own live DOM scroll state.
    const scrollMode = highlightMessageId ? 'preserve' : 'bottom';
    if (navigationEntry || !updateChatPane({ scroll: scrollMode, scrollSnapshot: savedScroll })) {
      renderApp({ scroll: scrollMode, scrollSnapshot: savedScroll });
    }
    else updateSidebar();
    if (scrollMode === 'bottom' && cached?.messages?.length) stabilizeBottomScroll();
    try {
      const [data, appearance] = await Promise.all([
        api(`/api/chats/${encodeURIComponent(userId)}/messages?limit=200`),
        api(`/api/chats/${encodeURIComponent(userId)}/appearance`).catch(() => ({ settings: defaultChatAppearance() }))
      ]);
      const cacheValue = {
        messages: data.messages || [],
        appearance: appearance.settings || defaultChatAppearance(),
        hasMore: Boolean(data.hasMore),
        scroll: savedScroll
      };
      rememberConversation(cacheKey, cacheValue);
      if (openToken !== state.chatOpenToken || state.activePeer?.id !== userId) return;
      state.messages = cacheValue.messages;
      state.chatAppearance = cacheValue.appearance;
      state.hasOlderMessages = cacheValue.hasMore;
      state.chatLoading = false;
      applyChatAppearanceUi();
      updateMessagesList({
        scroll: scrollMode,
        scrollSnapshot: savedScroll,
        settle: scrollMode === 'bottom' && !cached
      });
    } catch (error) {
      if (openToken === state.chatOpenToken && state.activePeer?.id === userId) {
        state.chatLoading = false;
        updateMessagesList({ scroll: 'preserve' });
      }
      throw error;
    }
  }

  async function openGroup(groupId, highlightMessageId = null, options = {}) {
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return;
    if (state.activeGroup?.id === groupId && !state.chatProfileOpen && !highlightMessageId && !state.chatLoading) return;
    chatScrollSettleCleanup?.();
    const navigationEntry = isMobileLayout() && options.pushNavigation !== false ? captureNavigationEntry('group-chat') : null;
    rememberActiveConversation();
    const cacheKey = conversationCacheKey('group', groupId);
    const cached = state.conversationCache.get(cacheKey);
    const savedScroll = state.conversationScroll.get(cacheKey) || cached?.scroll || null;
    state.activeGroup = group;
    state.activePeer = null;
    state.chatProfileOpen = false;
    state.chatProfileSocialView = null;
    state.replyTo = null;
    state.stickerPanel = false;
    state.typingPeerId = null;
    state.typingGroup = null;
    state.highlightMessageId = highlightMessageId;
    state.messages = cached?.messages || [];
    state.chatAppearance = cached?.appearance || defaultChatAppearance();
    state.hasOlderMessages = Boolean(cached?.hasMore);
    state.loadingOlderMessages = false;
    state.chatOpening = !highlightMessageId;
    const openToken = ++state.chatOpenToken;
    state.chatLoading = !cached?.messages?.length;
    delete state.unreadByPeer[groupId];
    if (isMobileLayout()) {
      state.tab = 'chats';
      state.lastTab = 'chats';
    }
    if (navigationEntry) pushNavigationEntry(navigationEntry, '/');
    const scrollMode = highlightMessageId ? 'preserve' : 'bottom';
    if (navigationEntry || !updateChatPane({ scroll: scrollMode, scrollSnapshot: savedScroll })) {
      renderApp({ scroll: scrollMode, scrollSnapshot: savedScroll });
    }
    else updateSidebar();
    if (scrollMode === 'bottom' && cached?.messages?.length) stabilizeBottomScroll();
    try {
      const [data, appearance] = await Promise.all([
        api(`/api/groups/${encodeURIComponent(groupId)}/messages?limit=200`),
        api(`/api/groups/${encodeURIComponent(groupId)}/appearance`).catch(() => ({ settings: defaultChatAppearance() }))
      ]);
      const cacheValue = {
        messages: data.messages || [],
        appearance: appearance.settings || defaultChatAppearance(),
        hasMore: Boolean(data.hasMore),
        scroll: savedScroll
      };
      rememberConversation(cacheKey, cacheValue);
      if (openToken !== state.chatOpenToken || state.activeGroup?.id !== groupId) return;
      state.activeGroup = data.group || group;
      state.messages = cacheValue.messages;
      state.chatAppearance = cacheValue.appearance;
      state.hasOlderMessages = cacheValue.hasMore;
      state.chatLoading = false;
      applyChatAppearanceUi();
      updateMessagesList({
        scroll: scrollMode,
        scrollSnapshot: savedScroll,
        settle: scrollMode === 'bottom' && !cached
      });
    } catch (error) {
      if (openToken === state.chatOpenToken && state.activeGroup?.id === groupId) {
        state.chatLoading = false;
        updateMessagesList({ scroll: 'preserve' });
      }
      throw error;
    }
  }

  function userById(userId) {
    if (!userId) return null;
    if (state.me?.id === userId) return state.me;
    const pools = [
      state.contacts,
      state.chats.map((chat) => chat.peer),
      state.groups.flatMap((group) => group.members || []),
      state.searchResults,
      state.conversationResults.flatMap((result) => [result.peer, result.sender]),
      state.recommendations,
      state.recentProfiles,
      state.requests.flatMap((request) => [request.from, request.to]),
      state.notifications.map((note) => note.actor),
      state.notes.map((note) => note.owner || note.user),
      allKnownPosts().map((post) => postAuthor(post)),
      state.publicProfile ? [state.publicProfile] : []
    ];
    return pools.flat().find((user) => user?.id === userId) || null;
  }

  function upsertMessage(message) {
    const index = state.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) state.messages[index] = message;
    else state.messages.push(message);
    state.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    rememberActiveConversation();
  }

  async function loadOlderMessages() {
    if (!hasActiveConversation() || state.loadingOlderMessages || !state.hasOlderMessages || !state.messages.length) return;
    const messagesEl = document.getElementById('messages');
    const previousHeight = messagesEl?.scrollHeight || 0;
    const previousTop = messagesEl?.scrollTop || 0;
    state.loadingOlderMessages = true;
    updateMessagesList({ scroll: 'preserve' });
    try {
      const before = encodeURIComponent(state.messages[0].createdAt);
      const data = await api(activeMessagesUrl(`?limit=200&before=${before}`));
      const existing = new Set(state.messages.map((message) => message.id));
      const older = (data.messages || []).filter((message) => !existing.has(message.id));
      state.messages = [...older, ...state.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      state.hasOlderMessages = Boolean(data.hasMore);
      rememberActiveConversation();
    } finally {
      state.loadingOlderMessages = false;
      updateMessagesList({ scroll: 'preserve' });
      requestAnimationFrame(() => {
        const updated = document.getElementById('messages');
        if (updated) updated.scrollTop = updated.scrollHeight - previousHeight + previousTop;
      });
    }
  }

  async function refreshChatsOnly() {
    try {
      const [chats, groups, notifications, recommendations] = await Promise.all([
        api('/api/chats'),
        api('/api/groups').catch(() => ({ groups: state.groups })),
        api('/api/notifications').catch(() => ({ pendingRequestCount: state.pendingRequestCount, requests: state.requests, notifications: state.notifications })),
        api('/api/users/recommendations').catch(() => ({ users: state.recommendations }))
      ]);
      state.chats = chats.chats;
      state.groups = groups.groups || [];
      if (state.activeGroup) state.activeGroup = state.groups.find((group) => group.id === state.activeGroup.id) || state.activeGroup;
      state.pendingRequestCount = notifications.pendingRequestCount || 0;
      state.requests = notifications.requests || [];
      state.notifications = notifications.notifications || [];
      state.recommendations = recommendations.users || [];
    } catch {
      // Keep the current list visible if a refresh fails.
    }
  }

  async function addContact(username) {
    const data = await api(`/api/contacts/${encodeURIComponent(username)}`, { method: 'POST' });
    state.searchResults = state.searchResults.map((user) => user.id === data.user.id ? data.user : user);
    state.recommendations = state.recommendations.map((user) => user.id === data.user.id ? data.user : user);
    if (state.publicProfile?.id === data.user.id) state.publicProfile = data.user;
    if (state.activePeer?.id === data.user.id) state.activePeer = data.user;
    await loadContactsAndChats();
    await loadSocialSurfaces();
    renderApp();
  }

  async function acceptRequest(requestId) {
    await api(`/api/requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' });
    await loadContactsAndChats();
    await loadSocialSurfaces();
    renderApp();
  }

  async function declineRequest(requestId) {
    await api(`/api/requests/${encodeURIComponent(requestId)}/decline`, { method: 'POST' });
    await loadContactsAndChats();
    renderApp();
  }

  async function removeFriend(userId) {
    const data = await api(`/api/contacts/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    const updateUser = (item) => item?.id === userId ? { ...item, ...(data.user || {}), isContact: false } : item;
    state.searchResults = state.searchResults.map(updateUser);
    state.recommendations = state.recommendations.map(updateUser);
    if (state.publicProfile?.id === userId) state.publicProfile = updateUser(state.publicProfile);
    if (state.activePeer?.id === userId) {
      state.activePeer = null;
      state.chatProfileOpen = false;
      state.chatProfileSocialView = null;
    }
    await loadContactsAndChats();
    state.actionSheet = null;
    renderApp();
  }

  function mergeKnownUser(updatedUser) {
    if (!updatedUser) return;
    const merge = (item) => item?.id === updatedUser.id ? { ...item, ...updatedUser } : item;
    state.contacts = state.contacts.map(merge);
    state.chats = state.chats.map((chat) => chat.peer?.id === updatedUser.id ? { ...chat, peer: merge(chat.peer) } : chat);
    state.searchResults = state.searchResults.map(merge);
    state.recommendations = state.recommendations.map(merge);
    state.recentProfiles = state.recentProfiles.map(merge);
    localStorage.setItem('recentProfiles', JSON.stringify(state.recentProfiles));
    if (state.publicProfile?.id === updatedUser.id) state.publicProfile = merge(state.publicProfile);
    if (state.activePeer?.id === updatedUser.id) state.activePeer = merge(state.activePeer);
  }

  async function setFollowing(userId, following) {
    const data = await api(`/api/follows/${encodeURIComponent(userId)}`, { method: following ? 'POST' : 'DELETE' });
    mergeKnownUser(data.user);
    if (data.me) state.me = data.me;
    await loadContactsAndChats();
    await loadSocialSurfaces();
    state.actionSheet = null;
    renderApp();
  }

  async function removeFollower(userId) {
    const data = await api(`/api/followers/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    mergeKnownUser(data.user);
    if (data.me) state.me = data.me;
    await loadContactsAndChats();
    renderApp();
  }

  async function submitReport({ targetType, userId, messageId, reason }) {
    const data = await api('/api/reports', {
      method: 'POST',
      body: {
        targetType,
        reportedUserId: userId || null,
        messageId: messageId || null,
        reason
      }
    });
    state.actionSheet = null;
    renderApp();
    alert(data.emailSent ? 'Report sent.' : 'Report saved. Email delivery needs server mail setup.');
  }

  async function blockUser(userId) {
    await api(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'POST' });
    await loadContactsAndChats();
    await loadSocialSurfaces();
    if (state.activePeer?.id === userId) state.activePeer = userById(userId) || state.activePeer;
    state.actionSheet = null;
    renderApp();
  }

  async function unblockUser(userId) {
    await api(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    await loadContactsAndChats();
    await loadSocialSurfaces();
    if (state.activePeer?.id === userId) state.activePeer = userById(userId) || state.activePeer;
    state.actionSheet = null;
    renderApp();
  }

  async function setMuteFor(userId, minutes) {
    await api(`/api/mutes/${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: { minutes: minutes === '' ? null : Number(minutes) }
    });
    await loadContactsAndChats();
    if (state.activePeer?.id === userId) state.activePeer = userById(userId) || state.activePeer;
    state.actionSheet = null;
    renderApp();
  }

  async function updateProfilePatch(patch) {
    const body = {
      displayName: state.me.displayName,
      bio: state.me.bio || '',
      website: state.me.website || '',
      age: state.me.age ?? null,
      gender: state.me.gender || '',
      socialPublic: state.me.socialPublic,
      searchable: state.me.searchable !== false,
      recommendable: state.me.recommendable !== false,
      avatarViewable: state.me.avatarViewable !== false,
      allowGroupAdds: state.me.allowGroupAdds !== false,
      mentionPermission: state.me.mentionPermission || 'everyone',
      storyReplies: state.me.storyReplies || 'everyone',
      friendRequests: state.me.friendRequests || 'everyone',
      allowReposts: state.me.allowReposts !== false,
      bioVisible: state.me.bioVisible !== false,
      websiteVisible: state.me.websiteVisible !== false,
      ageVisible: state.me.ageVisible === true,
      genderVisible: state.me.genderVisible === true,
      ...patch
    };
    const data = await api('/api/me/profile', { method: 'PATCH', body });
    state.me = data.user;
    return data.user;
  }

  async function uploadAvatar(file) {
    if (!file) return;
    await uploadAvatarData(await fileToDataUrl(file), file.name, file.lastModified);
  }

  async function uploadAvatarData(dataUrl, name = 'avatar.png', lastModified = null) {
    const body = {
      displayName: state.me.displayName,
      bio: state.me.bio || '',
      website: state.me.website || '',
      age: state.me.age ?? null,
      gender: state.me.gender || '',
      socialPublic: state.me.socialPublic,
      searchable: state.me.searchable !== false,
      recommendable: state.me.recommendable !== false,
      avatarViewable: state.me.avatarViewable !== false,
      mentionPermission: state.me.mentionPermission || 'everyone',
      storyReplies: state.me.storyReplies || 'everyone',
      friendRequests: state.me.friendRequests || 'everyone',
      avatar: {
        name,
        type: mimeFromDataUrl(dataUrl),
        dataUrl,
        lastModified: lastModified ? new Date(lastModified).toISOString() : null
      }
    };
    const data = await api('/api/me/profile', { method: 'PATCH', body });
    state.me = data.user;
    state.avatarCrop = null;
    updateProfileModalSlots();
    updateSidebar();
  }

  async function beginAvatarCrop(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    state.avatarCrop = {
      dataUrl,
      name: file.name || 'avatar.png',
      lastModified: file.lastModified || Date.now(),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      drag: null
    };
    updateProfileModalSlots();
    requestAnimationFrame(updateCropUi);
  }

  function mimeFromDataUrl(dataUrl) {
    return /^data:([^;,]+)/.exec(String(dataUrl || ''))?.[1] || 'image/png';
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function capturePointer(element, pointerId) {
    try {
      element?.setPointerCapture?.(pointerId);
    } catch {
      // The pointer may already have ended between touch events.
    }
  }

  function continueStoryTextDrag() {
    if (!state.storyEditor || storyTextPointers.size !== 1) return;
    const [pointerId, point] = storyTextPointers.entries().next().value;
    const element = document.querySelector('.story-draggable-text, .story-live-text');
    const rect = element?.closest('.story-editor-preview')?.getBoundingClientRect();
    if (!element || !rect) return;
    state.storyTextDrag = {
      pointerId,
      rect,
      startX: point.x,
      startY: point.y,
      x: Number(state.storyEditor.textX || 50),
      y: Number(state.storyEditor.textY || 50),
      pending: false,
      element
    };
    capturePointer(element, pointerId);
    document.getElementById('story-object-trash')?.classList.add('visible');
  }

  function continueStoryMediaDrag() {
    if (!state.storyEditor || storyMediaPointers.size !== 1) return;
    const [pointerId, point] = storyMediaPointers.entries().next().value;
    const preview = document.querySelector('.story-editor-preview');
    const rect = preview?.getBoundingClientRect();
    if (!preview || !rect) return;
    state.storyMediaDrag = {
      pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: Number(state.storyEditor.mediaOffsetX || 0),
      offsetY: Number(state.storyEditor.mediaOffsetY || 0),
      rect
    };
    capturePointer(preview, pointerId);
  }

  function continueAvatarCropDrag() {
    const crop = state.avatarCrop;
    const stage = document.getElementById('crop-stage');
    if (!crop || !stage || cropPointers.size !== 1) return;
    const [pointerId, point] = cropPointers.entries().next().value;
    crop.drag = {
      pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: Number(crop.offsetX || 0),
      offsetY: Number(crop.offsetY || 0)
    };
    capturePointer(stage, pointerId);
  }

  function updateCropUi() {
    const crop = state.avatarCrop;
    if (!crop) return;
    clampAvatarCropPosition(crop);
    const position = document.querySelector('.crop-photo-position');
    if (position) position.style.transform = `translate3d(${crop.offsetX || 0}px,${crop.offsetY || 0}px,0)`;
    const img = document.querySelector('#crop-stage img');
    if (img) img.style.transform = `translate(-50%,-50%) scale(${crop.zoom || 1})`;
    const zoom = document.getElementById('avatar-zoom');
    if (zoom) {
      zoom.value = String(crop.zoom || 1);
      zoom.style.setProperty('--range-progress', `${((Number(crop.zoom || 1) - 1) / 2) * 100}%`);
    }
  }

  function clampAvatarCropPosition(crop) {
    const stage = document.getElementById('crop-stage');
    const circle = stage?.querySelector('.crop-circle');
    if (!stage || !circle) return;
    const stageRect = stage.getBoundingClientRect();
    const circleRect = circle.getBoundingClientRect();
    const naturalWidth = Math.max(1, Number(crop.naturalWidth || 1));
    const naturalHeight = Math.max(1, Number(crop.naturalHeight || 1));
    const baseScale = Math.max(stageRect.width / naturalWidth, stageRect.height / naturalHeight);
    const displayWidth = naturalWidth * baseScale * Number(crop.zoom || 1);
    const displayHeight = naturalHeight * baseScale * Number(crop.zoom || 1);
    const maxX = Math.max(0, (displayWidth - circleRect.width) / 2);
    const maxY = Math.max(0, (displayHeight - circleRect.height) / 2);
    crop.offsetX = clamp(Number(crop.offsetX || 0), -maxX, maxX);
    crop.offsetY = clamp(Number(crop.offsetY || 0), -maxY, maxY);
  }

  async function confirmAvatarCrop() {
    const crop = state.avatarCrop;
    const stage = document.getElementById('crop-stage');
    if (!crop || !stage) return;
    const rect = stage.getBoundingClientRect();
    const circleRect = stage.querySelector('.crop-circle')?.getBoundingClientRect();
    if (!circleRect) return;
    const img = await loadImage(crop.dataUrl);
    const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight) * (crop.zoom || 1);
    const displayW = img.naturalWidth * scale;
    const displayH = img.naturalHeight * scale;
    const imageLeft = (rect.width - displayW) / 2 + Number(crop.offsetX || 0);
    const imageTop = (rect.height - displayH) / 2 + Number(crop.offsetY || 0);
    const circleLeft = circleRect.left - rect.left;
    const circleTop = circleRect.top - rect.top;
    const sourceSize = circleRect.width / scale;
    const sx = clamp((circleLeft - imageLeft) / scale, 0, Math.max(0, img.naturalWidth - sourceSize));
    const sy = clamp((circleTop - imageTop) / scale, 0, Math.max(0, img.naturalHeight - sourceSize));
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, 512, 512);
    await uploadAvatarData(canvas.toDataURL('image/png'), `cropped-${crop.name.replace(/\.[^.]+$/, '')}.png`, crop.lastModified);
  }

  function createStoryEditorState({ dataUrl, name, type, lastModified, textEditing = false, isBlankStory = false, initialTool = null, publishAsHighlight = false }) {
    return {
      dataUrl,
      name: name || 'story',
      type: type || 'image/png',
      lastModified: lastModified || Date.now(),
      isVideo: String(type || '').startsWith('video/'),
      isBlankStory,
      publishAsHighlight: Boolean(publishAsHighlight),
      activeTool: textEditing ? 'text' : initialTool,
      textEditing,
      textPanel: 'font',
      filterPanel: 'filters',
      activeAdjustment: 'brightness',
      filter: 'normal',
      overlayEffect: 'none',
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      fade: 0,
      vignette: 0,
      blur: 0,
      backgroundPreset: isBlankStory ? 'midnight' : null,
      mediaOffsetX: 0,
      mediaOffsetY: 0,
      text: '',
      textX: 50,
      textY: 50,
      textRotation: 0,
      textColor: '#ffffff',
      textFont: 'system',
      textSize: 44,
      textAlign: 'center',
      textEffect: 'shadow',
      textAnimation: 'none',
      textBgEnabled: false,
      textBgColor: '#000000',
      textFrame: false,
      drawings: [],
      drawColor: '#ffffff',
      drawSize: 6,
      drawBrush: 'pen',
      stickers: [],
      stickerDraft: '',
      stickerSearch: '',
      stickerComposer: null,
      locationQuery: '',
      locationResults: [],
      locationSearching: false,
      selectedLocation: null,
      weatherDraft: null,
      weatherLoading: false,
      gifQuery: '',
      gifSubmitOpen: false,
      gifSubmissionTitle: '',
      gifSubmissionTags: '',
      quizQuestion: '',
      quizOptionA: '',
      quizOptionB: '',
      quizCorrect: 0,
      sliderQuestion: '',
      sliderEmoji: '\ud83d\ude0d',
      countdownTitle: '',
      countdownAt: '',
      pollQuestion: '',
      pollOptionA: 'Yes',
      pollOptionB: 'No',
      audio: null,
      audioStart: 0,
      audioEnd: 30,
      zoom: 1,
      trimStart: 0,
      trimEnd: 0,
      videoDuration: 0,
      videoCurrentTime: 0,
      videoThumbnails: [],
      videoThumbLoading: false,
      videoPlaying: false,
      videoMuted: false,
      videoVolume: 1,
      videoSpeed: 1,
      mediaFit: 'cover',
      mediaRotation: 0
    };
  }

  function createStoryBackgroundDataUrl(preset = 'midnight') {
    const selected = storyBackgroundPresets().find(([id]) => id === preset) || storyBackgroundPresets()[0];
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, selected[2]);
    gradient.addColorStop(1, selected[3]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const light = ctx.createRadialGradient(canvas.width * 0.72, canvas.height * 0.18, 0, canvas.width * 0.72, canvas.height * 0.18, canvas.width * 0.85);
    light.addColorStop(0, 'rgba(255,255,255,0.16)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  function applyStoryBackground(preset) {
    const editor = state.storyEditor;
    if (!editor?.isBlankStory) return;
    const valid = storyBackgroundPresets().some(([id]) => id === preset) ? preset : 'midnight';
    editor.backgroundPreset = valid;
    editor.dataUrl = createStoryBackgroundDataUrl(valid);
    const media = document.querySelector('.story-editor-preview img');
    if (media) media.src = editor.dataUrl;
    document.querySelectorAll('[data-action="story-background"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.background === valid);
    });
    document.querySelectorAll('.story-filter-carousel button > span').forEach((preview) => {
      preview.style.backgroundImage = `url("${editor.dataUrl}")`;
    });
    updateStoryMediaUi();
  }

  async function beginStoryEditor(file, options = {}) {
    if (!file) return;
    const publishAsHighlight = Object.prototype.hasOwnProperty.call(options, 'publishAsHighlight')
      ? Boolean(options.publishAsHighlight)
      : Boolean(state.storyEditor?.publishAsHighlight);
    state.storyEditor = createStoryEditorState({
      dataUrl: await fileToDataUrl(file),
      name: file.name || 'story',
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified || Date.now(),
      publishAsHighlight
    });
    updateStoryEditorView();
  }

  function beginBlankStoryEditor(options = {}) {
    state.storyEditor = createStoryEditorState({
      dataUrl: createStoryBackgroundDataUrl('midnight'),
      name: 'story.png',
      type: 'image/png',
      lastModified: Date.now(),
      textEditing: false,
      isBlankStory: true,
      publishAsHighlight: Boolean(options.publishAsHighlight)
    });
    updateStoryEditorView();
  }

  async function beginStoryAudio(file) {
    if (!file || !state.storyEditor) return;
    if (!file.type.startsWith('audio/')) {
      alert('Choose an audio file.');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const duration = await new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 30);
      audio.onerror = () => resolve(30);
      audio.src = dataUrl;
    });
    state.storyEditor.audio = {
      dataUrl,
      name: file.name || 'story-audio',
      type: file.type || 'audio/mpeg',
      lastModified: file.lastModified || Date.now(),
      duration
    };
    state.storyEditor.audioStart = 0;
    state.storyEditor.audioEnd = Math.min(30, duration);
    updateStoryEditorView();
  }

  function formatStoryCountdown(value) {
    const target = new Date(value || '').getTime();
    if (!Number.isFinite(target)) return 'Set a time';
    const remaining = Math.max(0, target - Date.now());
    if (!remaining) return 'Finished';
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days) return `${days}d ${String(hours).padStart(2, '0')}h`;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateStoryCountdowns() {
    document.querySelectorAll('[data-countdown-at]').forEach((item) => {
      item.textContent = formatStoryCountdown(item.dataset.countdownAt);
    });
  }

  function startStoryCountdownClock() {
    clearInterval(storyCountdownTimer);
    storyCountdownTimer = null;
    updateStoryCountdowns();
    if (state.storyViewer && document.querySelector('[data-countdown-at]')) {
      storyCountdownTimer = setInterval(updateStoryCountdowns, 1000);
    }
  }

  function focusStorySheetInput(id) {
    requestAnimationFrame(() => {
      const input = document.getElementById(id);
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange?.(input.value.length, input.value.length);
    });
  }

  async function searchStoryLocations(query, requestId) {
    const editor = state.storyEditor;
    const term = String(query || '').trim();
    if (!editor || term.length < 2) return;
    editor.locationSearching = true;
    updateStoryEditorView();
    focusStorySheetInput('story-location-query');
    try {
      const data = await api(`/api/locations?q=${encodeURIComponent(term)}`);
      if (requestId !== storyLocationRequestId || state.storyEditor !== editor) return;
      editor.locationResults = data.locations || [];
    } finally {
      if (requestId === storyLocationRequestId && state.storyEditor === editor) {
        editor.locationSearching = false;
        updateStoryEditorView();
        focusStorySheetInput('story-location-query');
      }
    }
  }

  async function loadStoryWeather(location) {
    const editor = state.storyEditor;
    if (!editor || !location) return;
    editor.selectedLocation = location;
    editor.weatherDraft = null;
    editor.weatherLoading = true;
    updateStoryEditorView();
    try {
      const data = await api(`/api/weather?lat=${encodeURIComponent(location.latitude)}&lon=${encodeURIComponent(location.longitude)}`);
      if (state.storyEditor !== editor) return;
      editor.weatherDraft = data.weather || null;
    } finally {
      if (state.storyEditor === editor) {
        editor.weatherLoading = false;
        updateStoryEditorView();
      }
    }
  }

  async function selectStoryLocation(location, type = 'location') {
    const editor = state.storyEditor;
    if (!editor || !location) return;
    editor.selectedLocation = location;
    editor.locationResults = [];
    editor.locationQuery = location.name || editor.locationQuery;
    if (type === 'weather') await loadStoryWeather(location);
    else updateStoryEditorView();
  }

  async function useCurrentStoryLocation(type = 'location') {
    if (!state.storyEditor) return;
    if (!navigator.geolocation) throw new Error('Location is not available in this browser.');
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
    const location = {
      name: 'Current location',
      region: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    await selectStoryLocation(location, type);
  }

  async function searchStoryGifs(query, requestId) {
    const editor = state.storyEditor;
    if (!editor) return;
    state.gifLoading = true;
    updateStoryEditorView();
    focusStorySheetInput('story-gif-search');
    try {
      const term = String(query || '').trim();
      const data = await api(`/api/gifs${term ? `?q=${encodeURIComponent(term)}` : ''}`);
      if (requestId !== storyGifRequestId || state.storyEditor !== editor) return;
      state.gifPool = data.gifs || [];
    } finally {
      if (requestId === storyGifRequestId && state.storyEditor === editor) {
        state.gifLoading = false;
        updateStoryEditorView();
        focusStorySheetInput('story-gif-search');
      }
    }
  }

  function normalizeStoryLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  function addStorySticker(type = 'emoji', suppliedLabel = '', suppliedData = {}) {
    const editor = state.storyEditor;
    if (!editor) return;
    const draft = String(suppliedLabel || editor.stickerDraft || '').trim();
    const href = type === 'link' ? normalizeStoryLink(draft) : '';
    if (type === 'link' && !href) {
      alert('Enter a valid website link.');
      return;
    }
    const defaults = {
      emoji: '\u2728',
      gif: 'GIF',
      mention: draft ? (draft.startsWith('@') ? draft : `@${draft}`) : '@username',
      question: draft || 'Ask me',
      hashtag: draft ? (draft.startsWith('#') ? draft : `#${draft.replace(/^@/, '')}`) : '#New',
      countdown: draft || 'Countdown',
      location: draft || 'Location',
      link: href ? new URL(href).hostname.replace(/^www\./, '') : 'Link',
      add_yours: draft || 'Add yours',
      quiz: draft || 'Quiz time',
      emoji_slider: draft || 'How do you feel?',
      time: draft || new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      weather: draft || 'Weather',
      captions: draft || 'Captions'
    };
    const sticker = {
      id: `story_sticker_${cryptoRandom()}`,
      type,
      label: type === 'link' ? defaults.link : (draft || defaults[type] || 'Sticker'),
      href,
      data: suppliedData && typeof suppliedData === 'object' ? suppliedData : {},
      x: 50,
      y: 42,
      rotation: 0,
      size: type === 'emoji' ? 1.25 : 1
    };
    editor.stickers = [...(editor.stickers || []), sticker].slice(-20);
    editor.stickerDraft = '';
    editor.stickerComposer = null;
    editor.activeTool = null;
    updateStoryEditorView();
  }

  async function downloadStoryEdit() {
    const editor = state.storyEditor;
    if (!editor) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (!editor.isVideo) {
      const blob = dataUrlToBlob(await storyEditorOutput());
      downloadBlob(blob, `story-edit-${stamp}.png`);
    } else {
      downloadBlob(dataUrlToBlob(editor.dataUrl), `story-video-${stamp}.${(editor.type || 'video/mp4').split('/')[1] || 'mp4'}`);
    }
    const stateBlob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      edits: storyEditPayload(editor),
      audio: editor.audio ? { name: editor.audio.name, type: editor.audio.type, trimStart: editor.audioStart, trimEnd: Math.min(Number(editor.audioEnd || 30), Number(editor.audioStart || 0) + 30) } : null
    }, null, 2)], { type: 'application/json' });
    downloadBlob(stateBlob, `story-edit-${stamp}.json`);
  }

  function storyEditPayload(editor) {
    return {
      compositionVersion: 3,
      filter: editor.filter,
      overlayEffect: editor.overlayEffect,
      brightness: editor.brightness,
      contrast: editor.contrast,
      saturation: editor.saturation,
      warmth: editor.warmth,
      fade: editor.fade,
      vignette: editor.vignette,
      blur: editor.blur,
      backgroundPreset: editor.backgroundPreset,
      mediaOffsetX: editor.mediaOffsetX,
      mediaOffsetY: editor.mediaOffsetY,
      mediaFit: storyMediaFit(editor),
      mediaRotation: editor.mediaRotation,
      text: editor.text,
      zoom: editor.zoom,
      textX: editor.textX,
      textY: editor.textY,
      textRotation: editor.textRotation,
      textColor: editor.textColor,
      textFont: editor.textFont,
      textSize: editor.textSize,
      textAlign: editor.textAlign,
      textEffect: editor.textEffect,
      textAnimation: editor.textAnimation,
      textBgEnabled: editor.textBgEnabled,
      textBgColor: editor.textBgColor,
      textFrame: editor.textFrame,
      drawings: editor.drawings,
      stickers: editor.stickers,
      pollQuestion: editor.pollQuestion,
      pollOptionA: editor.pollOptionA,
      pollOptionB: editor.pollOptionB,
      audioStart: editor.audioStart,
      audioEnd: Math.min(Number(editor.audioEnd || 30), Number(editor.audioStart || 0) + 30),
      trimStart: editor.trimStart,
      trimEnd: editor.trimEnd,
      videoMuted: Boolean(editor.videoMuted),
      videoVolume: clamp(Number(editor.videoVolume ?? 1), 0, 1),
      videoSpeed: [0.5, 1, 1.5, 2].includes(Number(editor.videoSpeed)) ? Number(editor.videoSpeed) : 1
    };
  }

  async function storyEditorOutput() {
    const editor = state.storyEditor;
    if (!editor || editor.isVideo) return editor?.dataUrl || '';
    const image = await loadImage(editor.dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = storyFilterCss(editor.filter, editor);
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * Number(editor.zoom || 1);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    const mediaOffsetX = (clamp(Number(editor.mediaOffsetX ?? 0), -40, 40) / 100) * canvas.width;
    const mediaOffsetY = (clamp(Number(editor.mediaOffsetY ?? 0), -40, 40) / 100) * canvas.height;
    ctx.drawImage(image, (canvas.width - w) / 2 + mediaOffsetX, (canvas.height - h) / 2 + mediaOffsetY, w, h);
    ctx.filter = 'none';
    drawStoryMediaEffectOnCanvas(ctx, editor, canvas.width, canvas.height);
    drawStoryDrawingsOnCanvas(ctx, editor, canvas.width, canvas.height);
    drawStoryStickersOnCanvas(ctx, editor, canvas.width, canvas.height);
    if (editor.text) {
      const textSize = clamp(Number(editor.textSize || 44), 22, 96) * 1.55;
      ctx.font = `800 ${textSize}px ${storyTextFontCss(editor.textEffect === 'pixel' ? 'mono' : editor.textFont)}`;
      ctx.fillStyle = editor.textColor || '#ffffff';
      ctx.textAlign = ['left', 'center', 'right'].includes(editor.textAlign) ? editor.textAlign : 'center';
      ctx.textBaseline = 'middle';
      applyCanvasTextEffect(ctx, editor);
      ctx.save();
      ctx.translate(canvas.width * (clamp(Number(editor.textX || 50), 5, 95) / 100), canvas.height * (clamp(Number(editor.textY || 50), 5, 95) / 100));
      ctx.rotate((clamp(Number(editor.textRotation || 0), -180, 180) * Math.PI) / 180);
      if (editor.textEffect === 'rainbow') {
        const rainbow = ctx.createLinearGradient(-430, 0, 430, 0);
        ['#ff304f', '#ff8a00', '#ffd166', '#2f8b83', '#285f88', '#9f7cff'].forEach((color, index, colors) => rainbow.addColorStop(index / (colors.length - 1), color));
        ctx.fillStyle = rainbow;
      }
      if (editor.textEffect === 'shimmer') {
        const shimmer = ctx.createLinearGradient(-430, 0, 430, 0);
        ['#aeb4c2', '#ffffff', '#dbeafe', '#ffffff', '#aeb4c2'].forEach((color, index, colors) => shimmer.addColorStop(index / (colors.length - 1), color));
        ctx.fillStyle = shimmer;
      }
      if (editor.textBgEnabled || editor.textFrame) drawCanvasTextBox(ctx, editor.text, textSize, editor);
      wrapCanvasText(ctx, editor.text, 0, 0, canvas.width - 150, textSize * 1.15, { stroke: editor.textEffect === 'outline' });
      ctx.restore();
    }
    if (editor.pollQuestion) {
      const boxW = 760;
      const boxH = 270;
      const x = (canvas.width - boxW) / 2;
      const y = canvas.height * 0.58;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.42)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      roundedRect(ctx, x, y, boxW, boxH, 38);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.font = '800 46px system-ui, sans-serif';
      wrapCanvasText(ctx, editor.pollQuestion, canvas.width / 2, y + 72, boxW - 90, 52);
      ctx.fillStyle = '#f1f5f9';
      roundedRect(ctx, x + 45, y + 150, (boxW - 105) / 2, 72, 28);
      ctx.fill();
      roundedRect(ctx, x + 60 + (boxW - 105) / 2, y + 150, (boxW - 105) / 2, 72, 28);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.fillText(editor.pollOptionA || 'Yes', x + 45 + ((boxW - 105) / 4), y + 195);
      ctx.fillText(editor.pollOptionB || 'No', x + 60 + ((boxW - 105) * 3 / 4), y + 195);
      ctx.restore();
    }
    return canvas.toDataURL('image/png');
  }

  function drawStoryMediaEffectOnCanvas(ctx, editor, width, height) {
    const effect = editor.overlayEffect || 'none';
    ctx.save();
    if (effect === 'grain') {
      ctx.fillStyle = 'rgba(255,255,255,0.075)';
      for (let index = 0; index < 900; index += 1) {
        const x = (index * 73) % width;
        const y = (index * 151) % height;
        ctx.fillRect(x, y, 2 + (index % 3), 2 + (index % 2));
      }
    }
    if (effect === 'dream') {
      const glow = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.4, width * 0.78);
      glow.addColorStop(0, 'rgba(255,255,255,0.2)');
      glow.addColorStop(0.55, 'rgba(237,196,255,0.09)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    if (effect === 'vhs') {
      for (let y = 0; y < height; y += 10) {
        ctx.fillStyle = y % 20 ? 'rgba(0,0,0,0.065)' : 'rgba(255,255,255,0.025)';
        ctx.fillRect(0, y, width, 3);
      }
    }
    if (effect === 'spotlight') {
      const light = ctx.createRadialGradient(width * 0.5, height * 0.42, width * 0.06, width * 0.5, height * 0.42, width * 0.68);
      light.addColorStop(0, 'rgba(255,255,255,0.22)');
      light.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, width, height);
    }
    if (effect === 'sparkle') {
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      for (let index = 0; index < 42; index += 1) {
        const x = ((index * 211) % 997) / 997 * width;
        const y = ((index * 307) % 991) / 991 * height;
        const radius = 2 + (index % 5);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (effect === 'chroma') {
      const red = ctx.createLinearGradient(0, 0, width, 0);
      red.addColorStop(0, 'rgba(255,20,90,0.18)');
      red.addColorStop(0.45, 'rgba(255,20,90,0)');
      red.addColorStop(1, 'rgba(0,220,255,0.16)');
      ctx.fillStyle = red;
      ctx.fillRect(0, 0, width, height);
    }
    const vignette = clamp(Number(editor.vignette ?? 0), 0, 80) / 100;
    if (vignette) {
      const shade = ctx.createRadialGradient(width / 2, height / 2, width * 0.18, width / 2, height / 2, width * 0.78);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, `rgba(0,0,0,${vignette * 0.82})`);
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function applyCanvasTextEffect(ctx, editor) {
    if (editor.textEffect === 'glow') {
      ctx.shadowColor = editor.textColor || '#ffffff';
      ctx.shadowBlur = 22;
      return;
    }
    if (editor.textEffect === 'neon') {
      ctx.shadowColor = '#ff4fa3';
      ctx.shadowBlur = 30;
      return;
    }
    if (editor.textEffect === 'sparkle') {
      ctx.shadowColor = editor.textColor || '#ffffff';
      ctx.shadowBlur = 26;
      return;
    }
    if (editor.textEffect === 'pixel') {
      ctx.shadowColor = 'rgba(255,60,121,.72)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 6;
      ctx.shadowOffsetY = 5;
      return;
    }
    if (editor.textEffect === 'lift') {
      ctx.shadowColor = 'rgba(0,0,0,.72)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 7;
      ctx.shadowOffsetY = 9;
      return;
    }
    if (editor.textEffect === 'outline') {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,.88)';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      return;
    }
    if (['rainbow', 'shimmer'].includes(editor.textEffect)) {
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 10;
      return;
    }
    if (editor.textEffect === 'none') {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      return;
    }
    ctx.shadowColor = 'rgba(0,0,0,.62)';
    ctx.shadowBlur = 14;
  }

  function drawCanvasTextBox(ctx, text, size, editor) {
    const lines = canvasTextLines(ctx, text, 880).slice(0, 5);
    const width = Math.min(930, Math.max(...lines.map((line) => ctx.measureText(line).width), 120) + 70);
    const height = lines.length * size * 1.15 + 42;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = editor.textBgEnabled ? hexToRgba(editor.textBgColor || '#000000', 0.58) : 'transparent';
    roundedRect(ctx, -width / 2, -height / 2, width, height, 26);
    if (editor.textBgEnabled) ctx.fill();
    if (editor.textFrame) {
      ctx.strokeStyle = 'rgba(255,255,255,.82)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function canvasTextLines(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawStoryDrawingsOnCanvas(ctx, editor, width, height) {
    for (const stroke of editor.drawings || []) {
      const points = stroke.points || [];
      if (points.length < 2) continue;
      ctx.save();
      const brush = ['pen', 'marker', 'neon', 'chalk'].includes(stroke.brush) ? stroke.brush : 'pen';
      ctx.strokeStyle = stroke.color || '#ffffff';
      ctx.lineWidth = Math.max(2, Number(stroke.size || 6) * 2.4 * (brush === 'marker' ? 2.2 : brush === 'chalk' ? 1.35 : 1));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (brush === 'marker') ctx.globalAlpha = 0.42;
      if (brush === 'neon') {
        ctx.shadowColor = stroke.color || '#ffffff';
        ctx.shadowBlur = 24;
      }
      if (brush === 'chalk') {
        ctx.globalAlpha = 0.78;
        ctx.setLineDash([3, 4]);
      }
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = (Number(point.x || 0) / 100) * width;
        const y = (Number(point.y || 0) / 100) * height;
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStoryStickersOnCanvas(ctx, editor, width, height) {
    for (const sticker of editor.stickers || []) {
      ctx.save();
      const x = (clamp(Number(sticker.x || 50), 5, 95) / 100) * width;
      const y = (clamp(Number(sticker.y || 42), 5, 95) / 100) * height;
      const scale = clamp(Number(sticker.size || 1), 0.7, 1.8);
      ctx.translate(x, y);
      ctx.rotate((clamp(Number(sticker.rotation || 0), -180, 180) * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.font = sticker.type === 'emoji' ? '96px system-ui, sans-serif' : '800 48px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (sticker.type !== 'emoji') {
        const label = sticker.label || '';
        const boxWidth = Math.min(760, Math.max(180, ctx.measureText(label).width + 90));
        ctx.fillStyle = sticker.type === 'gif' ? 'rgba(255,79,163,.86)' : 'rgba(255,255,255,.9)';
        roundedRect(ctx, -boxWidth / 2, -48, boxWidth, 96, 32);
        ctx.fill();
        ctx.fillStyle = sticker.type === 'gif' ? '#fff' : '#111827';
      } else {
        ctx.fillStyle = '#fff';
      }
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 10;
      ctx.fillText(sticker.label || '', 0, 0);
      ctx.restore();
    }
  }

  async function publishStory(options = {}) {
    const editor = state.storyEditor;
    if (!editor || state.storyPublishing) return;
    const highlightId = options.highlightId || null;
    const highlightTitle = String(options.highlightTitle || '').trim();
    const publishToHighlight = Boolean(highlightId || highlightTitle);
    state.storyPublishing = true;
    updateStoryEditorView();
    try {
      const data = await api('/api/me/story', {
        method: 'POST',
        body: {
          file: {
            name: editor.name,
            type: editor.type,
            dataUrl: editor.dataUrl,
            lastModified: editor.lastModified ? new Date(editor.lastModified).toISOString() : null
          },
          edits: storyEditPayload(editor),
          audio: editor.audio ? {
            name: editor.audio.name,
            type: editor.audio.type,
            dataUrl: editor.audio.dataUrl,
            lastModified: editor.audio.lastModified ? new Date(editor.audio.lastModified).toISOString() : null
          } : null,
          saved: publishToHighlight,
          highlightId,
          highlightTitle
        }
      });
      state.me = data.user;
      state.storyEditor = null;
      state.highlightComposer = null;
      updateStoryEditorView();
      updateHighlightComposerSlot();
      updateSidebar();
      pushToast({
        key: `story-published-${data.story.id}`,
        kind: 'social',
        title: publishToHighlight ? 'Added to highlight' : 'Story shared',
        body: publishToHighlight ? 'The story was added to your highlight.' : 'Your story is live for 24 hours.'
      });
    } finally {
      state.storyPublishing = false;
      if (state.storyEditor === editor) updateStoryEditorView();
    }
  }

  function openHighlightComposer(options = {}) {
    state.actionSheet = null;
    state.overlayClosing = false;
    updateActionSheetSlot();
    state.highlightComposer = options.mode
      ? options
      : { mode: 'source' };
    updateHighlightComposerSlot();
  }

  async function addStoryToHighlightCollection(storyId, highlightId) {
    const data = await api(`/api/highlights/${encodeURIComponent(highlightId)}/stories`, {
      method: 'POST',
      body: { storyId }
    });
    state.me = data.user;
    state.highlightComposer = null;
    updateHighlightComposerSlot();
    updateStoryViewerView();
    updateSidebar();
    pushToast({
      key: `highlight-added-${storyId}-${highlightId}`,
      kind: 'social',
      title: 'Added to highlight',
      body: `Saved in ${data.highlight?.title || 'your highlight'}.`
    });
  }

  async function createHighlightTarget(title) {
    const composer = state.highlightComposer;
    if (!composer) return;
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new Error('Choose a name for the highlight.');
    if (composer.source === 'editor') {
      await publishStory({ highlightTitle: cleanTitle });
      return;
    }
    const data = await api('/api/highlights', {
      method: 'POST',
      body: { title: cleanTitle, storyId: composer.storyId }
    });
    state.me = data.user;
    state.highlightComposer = null;
    updateHighlightComposerSlot();
    updateStoryViewerView();
    updateSidebar();
    pushToast({
      key: `highlight-created-${data.highlight?.id || Date.now()}`,
      kind: 'social',
      title: 'Highlight created',
      body: `${cleanTitle} is now on your profile.`
    });
  }

  async function renameHighlight(highlightId, title) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new Error('Choose a name for the highlight.');
    const data = await api(`/api/highlights/${encodeURIComponent(highlightId)}`, {
      method: 'PATCH',
      body: { title: cleanTitle }
    });
    state.me = data.user;
    state.highlightComposer = null;
    updateHighlightComposerSlot();
    updateStoryViewerView();
    updateSidebar();
  }

  function saveStory(storyId) {
    openHighlightComposer({ mode: 'target', source: 'existing', storyId });
  }

  async function deleteStory(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE' });
    state.me = data.user;
    if (state.storyViewer?.storyId === storyId) {
      clearStoryAdvance();
      state.storyViewer = null;
    }
    state.actionSheet = null;
    updateActionSheetSlot();
    updateStoryViewerView();
    updateSidebar();
  }

  function storyUsers() {
    return [
      state.me,
      state.activePeer,
      state.publicProfile,
      ...state.contacts,
      ...state.chats.map((chat) => chat.peer),
      ...state.searchResults,
      ...state.recommendations,
      ...state.requests.flatMap((request) => [request.from, request.to]),
      ...state.notifications.map((note) => note.actor)
    ].filter(Boolean);
  }

  function storyById(storyId) {
    for (const user of storyUsers()) {
      const story = (user.stories || []).find((item) => item.id === storyId);
      if (story) return story;
    }
    return null;
  }

  function replaceStory(updatedStory) {
    if (!updatedStory) return;
    for (const user of storyUsers()) {
      if (user.id !== updatedStory.ownerId) continue;
      const stories = user.stories || [];
      const index = stories.findIndex((story) => story.id === updatedStory.id);
      if (index >= 0) stories[index] = { ...stories[index], ...updatedStory };
      else stories.unshift(updatedStory);
      user.stories = stories.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      (user.highlights || []).forEach((highlight) => {
        const highlightIndex = (highlight.stories || []).findIndex((story) => story.id === updatedStory.id);
        if (highlightIndex >= 0) highlight.stories[highlightIndex] = { ...highlight.stories[highlightIndex], ...updatedStory };
        if (highlight.cover?.id === updatedStory.id) highlight.cover = { ...highlight.cover, ...updatedStory };
      });
    }
  }

  async function viewStory(storyId, highlightId = null) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/view`, { method: 'POST' });
    replaceStory(data.story);
    state.storyViewer = data.story?.file ? { storyId: data.story.id, highlightId: highlightId || null } : null;
    state.mediaViewer = null;
    updateMediaViewerSlot();
    updateStoryViewerView();
    scheduleStoryAdvance(data.story);
  }

  async function navigateStory(direction) {
    const storyId = state.storyViewer?.storyId;
    const owner = storyOwnerById(storyId);
    const currentStory = storyById(storyId);
    const highlightId = state.storyViewer?.highlightId || null;
    const stories = storiesForViewer(owner, currentStory);
    const index = stories.findIndex((story) => story.id === storyId);
    const next = stories[index + direction];
    if (!next) {
      clearStoryAdvance();
      state.storyViewer = null;
      updateStoryViewerView();
      return;
    }
    await viewStory(next.id, highlightId);
  }

  async function toggleStoryLike(storyId, sourceButton = null) {
    if (!storyId) return;
    const escapedStoryId = window.CSS?.escape ? CSS.escape(storyId) : String(storyId).replace(/"/g, '\\"');
    const buttons = Array.from(document.querySelectorAll(`[data-action="like-story"][data-story-id="${escapedStoryId}"]`));
    if (buttons.some((button) => button.classList.contains('is-pending'))) return;
    if (state.storyViewer?.storyId === storyId) clearStoryAdvance();
    buttons.forEach((button) => button.classList.add('is-pending'));
    let data;
    try {
      data = await api(`/api/stories/${encodeURIComponent(storyId)}/like`, { method: 'POST' });
    } catch (error) {
      buttons.forEach((button) => button.classList.remove('is-pending'));
      if (state.storyViewer?.storyId === storyId) scheduleStoryAdvance(storyById(storyId));
      throw error;
    }
    replaceStory(data.story);
    buttons.forEach((button) => {
      button.classList.remove('is-pending', 'story-heart-pop');
      button.classList.toggle('active', data.story.likedByMe);
      button.setAttribute('aria-pressed', data.story.likedByMe ? 'true' : 'false');
      button.setAttribute('aria-label', data.story.likedByMe ? 'Unlike story' : 'Like story');
      const count = button.querySelector('.story-like-count');
      if (count) count.textContent = String(data.story.likeCount || 0);
    });
    const animatedButton = sourceButton?.matches?.('[data-action="like-story"]') ? sourceButton : buttons[0];
    if (animatedButton) {
      void animatedButton.offsetWidth;
      animatedButton.classList.add('story-heart-pop');
    }
    if (state.storyViewer?.storyId === storyId) scheduleStoryAdvance(data.story);
  }

  async function submitStoryComment(storyId, options = {}) {
    const commentsOpen = state.actionSheet?.type === 'story-comments' && state.actionSheet.storyId === storyId;
    if (state.storyCommentPosting.has(storyId)) return;
    const input = commentsOpen
      ? document.getElementById('story-comment-input')
      : document.getElementById('story-viewer-comment');
    const kind = options.gifId ? 'gif' : 'text';
    const text = kind === 'text' ? (input?.value || '').trim() : '';
    const gifId = kind === 'gif' ? String(options.gifId || '') : '';
    if ((kind === 'text' && !text) || (kind === 'gif' && !gifId)) return;
    const storyBeforePost = storyById(storyId);
    const previousCommentIds = new Set(storyBeforePost?.comments?.map((comment) => comment.id) || []);
    const previousSheet = commentsOpen ? state.actionSheet : null;
    const replyToCommentId = commentsOpen ? previousSheet.replyToCommentId || null : null;
    const repliedToBeforePost = replyToCommentId
      ? storyBeforePost?.comments?.find((comment) => comment.id === replyToCommentId)
      : null;
    const replyPrefixBeforePost = repliedToBeforePost ? `@${repliedToBeforePost.user?.username || ''} ` : '';
    const postButton = document.querySelector('.story-comment-post');
    const gifButton = options.sourceButton?.matches?.('[data-action="send-story-comment-gif"]') ? options.sourceButton : null;
    const gifPicker = gifButton?.closest('.story-comment-gif-picker');
    const commentComposer = commentsOpen ? document.querySelector('.story-comment-composer') : null;
    const commentControls = commentsOpen
      ? [...document.querySelectorAll('.story-comment-composer button, .story-comment-composer input, .story-comment-meta [data-action="reply-story-comment"]')]
      : [input, document.querySelector('.story-viewer-actions [data-action="submit-story-comment"]')].filter(Boolean);
    state.storyCommentPosting.add(storyId);
    commentComposer?.setAttribute('aria-busy', 'true');
    if (previousSheet) {
      previousSheet.commentPosting = true;
      previousSheet.postingGifId = gifId || null;
    }
    if (kind === 'text') {
      postButton?.classList.add('posting');
    }
    commentControls.forEach((control) => { control.disabled = true; });
    gifPicker?.classList.add('is-posting');
    gifButton?.classList.add('is-sending');
    let data;
    try {
      data = await api(`/api/stories/${encodeURIComponent(storyId)}/comments`, {
        method: 'POST',
        body: {
          kind,
          text,
          gifId: gifId || null,
          replyTo: replyToCommentId
        }
      });
    } catch (error) {
      state.storyCommentPosting.delete(storyId);
      commentComposer?.setAttribute('aria-busy', 'false');
      if (previousSheet) {
        previousSheet.commentPosting = false;
        previousSheet.postingGifId = null;
      }
      postButton?.classList.remove('posting');
      gifPicker?.classList.remove('is-posting');
      gifButton?.classList.remove('is-sending');
      commentControls.forEach((control) => { control.disabled = false; });
      syncStoryCommentPostButton();
      if (previousSheet?.pendingGifPool) {
        state.gifPool = previousSheet.pendingGifPool;
        previousSheet.pendingGifPool = null;
        updateStoryCommentGifChoices(previousSheet);
      }
      if (
        state.actionSheet?.type === 'story-comments' &&
        state.actionSheet.storyId === storyId &&
        state.actionSheet !== previousSheet
      ) {
        state.actionSheet.commentPosting = false;
        state.actionSheet.postingGifId = null;
        updateStoryCommentsSheet();
      }
      throw error;
    }
    state.storyCommentPosting.delete(storyId);
    commentComposer?.setAttribute('aria-busy', 'false');
    if (previousSheet) {
      previousSheet.commentPosting = false;
      previousSheet.postingGifId = null;
    }
    replaceStory(data.story);
    if (commentsOpen && state.actionSheet === previousSheet) {
      const newComment = data.story.comments?.find((comment) => !previousCommentIds.has(comment.id));
      const expandedCommentIds = new Set(previousSheet?.expandedCommentIds || []);
      let remainingDraft = previousSheet?.commentDraft || '';
      if (kind === 'gif' && replyPrefixBeforePost && remainingDraft.startsWith(replyPrefixBeforePost)) {
        remainingDraft = remainingDraft.slice(replyPrefixBeforePost.length);
      }
      if (newComment?.replyTo) {
        let rootId = newComment.replyTo;
        const byId = new Map((data.story.comments || []).map((comment) => [comment.id, comment]));
        const visited = new Set();
        while (byId.get(rootId)?.replyTo && !visited.has(rootId)) {
          visited.add(rootId);
          rootId = byId.get(rootId).replyTo;
        }
        expandedCommentIds.add(rootId);
      }
      state.actionSheet = {
        ...previousSheet,
        type: 'story-comments',
        storyId,
        replyToCommentId: null,
        commentDraft: kind === 'gif' ? remainingDraft : '',
        gifPickerOpen: false,
        gifQuery: '',
        commentPosting: false,
        postingGifId: null,
        pendingGifPool: null,
        expandedCommentIds: [...expandedCommentIds],
        newCommentId: newComment?.id || null
      };
      updateStoryCommentsSheet({ bottom: true, focus: kind === 'text' });
      setTimeout(() => {
        if (state.actionSheet?.type === 'story-comments') state.actionSheet.newCommentId = null;
      }, 520);
    } else if (state.actionSheet?.type === 'story-comments' && state.actionSheet.storyId === storyId) {
      state.actionSheet.commentPosting = false;
      state.actionSheet.postingGifId = null;
      updateStoryCommentsSheet({ bottom: true });
    } else if (state.storyViewer?.storyId === storyId) {
      updateStoryViewerView();
      if (!state.actionSheet) scheduleStoryAdvance(data.story);
    }
  }

  function updateStoryCommentsSheet(options = {}) {
    const previous = document.querySelector('.story-comment-list');
    const scrollTop = previous?.scrollTop || 0;
    if (state.actionSheet?.type === 'story-comments') state.actionSheet.refreshing = true;
    updateActionSheetSlot();
    if (state.actionSheet?.type === 'story-comments') state.actionSheet.refreshing = false;
    requestAnimationFrame(() => {
      const list = document.querySelector('.story-comment-list');
      if (list) {
        if (options.bottom) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        else list.scrollTop = scrollTop;
      }
      if (options.focus) {
        const input = document.getElementById('story-comment-input');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange?.(input.value.length, input.value.length);
      }
    });
  }

  function syncStoryCommentPostButton() {
    const input = document.getElementById('story-comment-input');
    const button = document.querySelector('.story-comment-post');
    if (button) button.disabled = !input?.value.trim();
  }

  function addStoryCommentEmoji(emoji, sourceButton) {
    if (state.actionSheet?.type !== 'story-comments' || storyCommentPosting(state.actionSheet)) return;
    const input = document.getElementById('story-comment-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`.slice(0, 280);
    input.value = next;
    state.actionSheet.commentDraft = next;
    syncStoryCommentPostButton();
    sourceButton?.classList.remove('reaction-pop');
    void sourceButton?.offsetWidth;
    sourceButton?.classList.add('reaction-pop');
    input.focus({ preventScroll: true });
    const caret = Math.min(next.length, start + emoji.length);
    input.setSelectionRange?.(caret, caret);
  }

  function toggleStoryCommentReplies(commentId) {
    if (state.actionSheet?.type !== 'story-comments') return;
    const draft = document.getElementById('story-comment-input')?.value || state.actionSheet.commentDraft || '';
    const expanded = new Set(state.actionSheet.expandedCommentIds || []);
    if (expanded.has(commentId)) expanded.delete(commentId);
    else expanded.add(commentId);
    state.actionSheet.commentDraft = draft;
    state.actionSheet.expandedCommentIds = [...expanded];
    updateStoryCommentsSheet();
  }

  async function toggleStoryCommentLike(storyId, commentId) {
    const escapedCommentId = window.CSS?.escape ? CSS.escape(commentId) : String(commentId).replace(/"/g, '\\"');
    const button = document.querySelector(`.story-comment-like[data-comment-id="${escapedCommentId}"]`);
    if (button?.classList.contains('is-pending')) return;
    button?.classList.add('is-pending');
    let data;
    try {
      data = await api(`/api/stories/${encodeURIComponent(storyId)}/comments/${encodeURIComponent(commentId)}/like`, { method: 'POST' });
    } catch (error) {
      button?.classList.remove('is-pending');
      throw error;
    }
    replaceStory(data.story);
    const updated = data.story.comments?.find((comment) => comment.id === commentId);
    if (!updated || !button) return;
    button.classList.remove('is-pending', 'heart-pop');
    button.classList.toggle('active', updated.likedByMe);
    button.setAttribute('aria-pressed', updated.likedByMe ? 'true' : 'false');
    button.setAttribute('aria-label', updated.likedByMe ? 'Unlike comment' : 'Like comment');
    void button.offsetWidth;
    button.classList.add('heart-pop');
    const count = document.querySelector(`[data-comment-like-count="${escapedCommentId}"]`);
    if (count) {
      count.textContent = updated.likeCount === 1 ? '1 like' : `${updated.likeCount || 0} likes`;
      count.classList.toggle('is-empty', !updated.likeCount);
    }
  }

  async function respondToStorySticker(storyId, stickerId, value) {
    clearStoryAdvance();
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/stickers/${encodeURIComponent(stickerId)}/respond`, {
      method: 'POST',
      body: { value }
    });
    replaceStory(data.story);
    updateStoryViewerView();
    scheduleStoryAdvance(data.story);
  }

  async function toggleStoryAudio(button) {
    const player = button?.closest('.story-audio-ui');
    const audio = player?.querySelector('audio');
    if (!audio) return;
    document.querySelectorAll('.story-audio-ui audio').forEach((other) => {
      if (other === audio) return;
      other.pause();
      const otherPlayer = other.closest('.story-audio-ui');
      otherPlayer?.classList.remove('playing');
      const otherButton = otherPlayer?.querySelector('[data-action="toggle-story-audio"]');
      if (otherButton) otherButton.innerHTML = icon('play');
    });
    if (audio.paused) {
      await audio.play();
      player.classList.add('playing');
      button.innerHTML = icon('pause');
      audio.onended = () => {
        player.classList.remove('playing');
        button.innerHTML = icon('play');
      };
    } else {
      audio.pause();
      player.classList.remove('playing');
      button.innerHTML = icon('play');
    }
  }

  async function sendCurrentText() {
    const input = document.getElementById('composer-text');
    const key = activeConversationKey();
    const draft = key ? state.composerDrafts[key] : '';
    const text = (input?.value ?? draft ?? '').trim();
    if (!text || !hasActiveConversation()) return;
    input.value = '';
    delete state.composerDrafts[key];
    await sendMessage({ kind: 'text', text });
  }

  async function sendMessage(payload) {
    if (!hasActiveConversation()) return;
    const body = {
      kind: payload.kind,
      text: payload.text || '',
      replyTo: state.replyTo?.id || null,
      file: payload.file || null,
      stickerId: payload.stickerId || null,
      gifId: payload.gifId || null,
      gifCatalogId: payload.gifCatalogId || null
    };
    state.replyTo = null;
    const data = await api(activeMessagesUrl(), {
      method: 'POST',
      body
    });
    upsertMessage(data.message);
    updateMessagesList({ scroll: 'bottom' });
    updateChatFooter({ focus: true });
    await refreshChatsOnly();
    updateSidebar();
  }

  function classifyFile(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  }

  async function sendFile(file, forcedKind = null, stickerId = null) {
    if (!file || !hasActiveConversation()) return;
    const key = activeConversationKey();
    const dataUrl = await fileToDataUrl(file);
    const input = document.getElementById('composer-text');
    const caption = (input?.value ?? state.composerDrafts[key] ?? '').trim();
    if (input) input.value = '';
    delete state.composerDrafts[key];
    const kind = forcedKind || classifyFile(file);
    await sendMessage({
      kind,
      text: caption,
      stickerId,
      file: {
        name: file.name || `${kind}.bin`,
        type: file.type || 'application/octet-stream',
        dataUrl,
        lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
      }
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function blobToDataUrl(blob) {
    return fileToDataUrl(blob);
  }

  function dataUrlToBlob(dataUrl) {
    const [header, data] = String(dataUrl || '').split(',');
    const mime = /^data:([^;]+)/.exec(header || '')?.[1] || 'application/octet-stream';
    const binary = atob(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  async function downloadMeta(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message?.attachment) return;
    const meta = await api(message.attachment.metaUrl);
    downloadBlob(
      new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
      `${message.attachment.name}.metadata.json`
    );
  }

  async function downloadFileAndMeta(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message?.attachment) return;
    const a = document.createElement('a');
    a.href = message.attachment.downloadUrl;
    a.download = message.attachment.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await downloadMeta(messageId);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportChat(format) {
    if (state.activeGroup) {
      location.href = `/api/groups/${encodeURIComponent(state.activeGroup.id)}/export?format=${format}`;
      return;
    }
    if (state.activePeer) location.href = `/api/chats/${encodeURIComponent(state.activePeer.id)}/export?format=${format}`;
  }

  async function deleteMessage(messageId) {
    await api(`/api/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    const message = state.messages.find((item) => item.id === messageId);
    if (message) {
      message.deletedAt = new Date().toISOString();
      message.text = '';
      message.attachment = null;
    }
    await refreshChatsOnly();
    updateMessagesList({ scroll: 'preserve' });
    updateSidebar();
  }

  async function reactToMessage(messageId, emoji = '\u2764\ufe0f') {
    const data = await api(`/api/messages/${encodeURIComponent(messageId)}/reaction`, {
      method: 'POST',
      body: { emoji }
    });
    upsertMessage(data.message);
    if (state.messageFocus?.messageId === messageId) syncFocusedMessageUi(data.message);
    else updateMessagesList({ scroll: 'preserve' });
  }

  async function toggleMessagePin(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return;
    const data = await api(`/api/messages/${encodeURIComponent(messageId)}/pin`, {
      method: 'POST',
      body: { pinned: !message.pinnedAt }
    });
    upsertMessage(data.message);
    updateMessagesList({ scroll: 'preserve' });
    closeMessageFocus();
  }

  async function hideMessageForMe(messageId) {
    await api(`/api/messages/${encodeURIComponent(messageId)}/me`, { method: 'DELETE' });
    state.messages = state.messages.filter((message) => message.id !== messageId);
    rememberActiveConversation();
    closeMessageFocus({ immediate: true });
    updateMessagesList({ scroll: 'preserve' });
    await refreshChatsOnly();
    updateSidebar();
  }

  async function forwardMessage(messageId, recipientId = null, groupId = null) {
    const data = await api(`/api/messages/${encodeURIComponent(messageId)}/forward`, {
      method: 'POST',
      body: groupId ? { groupId } : { recipientId }
    });
    if ((state.activePeer?.id === recipientId || state.activeGroup?.id === groupId) && data.message) {
      upsertMessage(data.message);
      updateMessagesList({ scroll: 'bottom' });
    }
    closeMessageFocus();
    pushToast({ key: `forward-${messageId}-${groupId || recipientId}`, kind: 'social', title: 'Message forwarded', body: 'Sent to the selected chat.' });
    await refreshChatsOnly();
    updateSidebar();
  }

  async function attachStickerToMessage(messageId, stickerId) {
    const sticker = availableChatStickers().find((item) => item.id === stickerId);
    if (!sticker?.dataUrl) return;
    const type = mimeFromDataUrl(sticker.dataUrl) || 'image/png';
    const extension = type.includes('svg') ? 'svg' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'png';
    const data = await api(`/api/messages/${encodeURIComponent(messageId)}/stickers`, {
      method: 'POST',
      body: {
        file: {
          name: `${sticker.name || 'sticker'}.${extension}`,
          type,
          dataUrl: sticker.dataUrl
        }
      }
    });
    upsertMessage(data.message);
    updateMessagesList({ scroll: 'preserve' });
    closeMessageFocus();
  }

  let userSearchId = 0;

  function focusUserSearch() {
    const input = document.getElementById('user-search');
    if (!input) return;
    input.focus();
    input.setSelectionRange(state.userQuery.length, state.userQuery.length);
  }

  async function searchUsers(query) {
    const trimmed = query.trim();
    const searchId = ++userSearchId;
    state.userQuery = query;
    if (trimmed.length < 2) {
      state.searchResults = [];
      state.userSearching = false;
      renderSidebarState();
      setTimeout(focusUserSearch, 0);
      return;
    }
    const data = await api(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
    if (searchId !== userSearchId || trimmed !== state.userQuery.trim()) return;
    state.searchResults = data.users || [];
    state.userSearching = false;
    renderSidebarState();
    setTimeout(focusUserSearch, 0);
  }

  async function restoreNavigationView(view) {
    const returnScroll = state.profileReturnScroll;
    const profileUsername = view?.publicProfileUsername || null;
    const peer = view?.activePeerId ? userById(view.activePeerId) : null;
    const group = view?.activeGroupId ? state.groups.find((item) => item.id === view.activeGroupId) : null;
    const conversationType = peer ? 'peer' : group ? 'group' : null;
    const conversationId = peer?.id || group?.id || null;
    const cachedConversation = conversationType && conversationId
      ? state.conversationCache.get(conversationCacheKey(conversationType, conversationId))
      : null;
    state.tab = ['home', 'chats', 'search', 'clips', 'notifications', 'profile'].includes(view?.tab) ? view.tab : 'home';
    state.lastTab = ['home', 'chats', 'search', 'clips', 'notifications', 'profile'].includes(view?.lastTab) ? view.lastTab : state.tab;
    state.profileSocialView = view?.profileSocialView || null;
    state.activePeer = peer;
    state.activeGroup = group;
    state.messages = cachedConversation?.messages || [];
    state.chatAppearance = cachedConversation?.appearance || defaultChatAppearance();
    state.hasOlderMessages = Boolean(cachedConversation?.hasMore);
    state.chatLoading = Boolean(conversationId && !cachedConversation);
    state.chatProfileOpen = Boolean(view?.chatProfileOpen && conversationId);
    state.chatProfileSocialView = view?.chatProfileSocialView || null;
    state.searchProfileOpen = Boolean(view?.searchProfileOpen && profileUsername);
    state.searchProfileSocialView = view?.searchProfileSocialView || null;
    state.clipViewer = view?.clipViewer ? { ...view.clipViewer } : null;
    state.publicProfile = state.searchProfileOpen ? await fetchPublicProfile(profileUsername) : null;
    state.tabTransition = false;
    renderApp({ scrollSnapshot: state.searchProfileOpen ? null : returnScroll });
    if (!state.searchProfileOpen) state.profileReturnScroll = null;
    if (conversationId && !cachedConversation) {
      if (peer) await openChat(peer.id, null, { pushNavigation: false });
      else if (group) await openGroup(group.id, null, { pushNavigation: false });
      if (view?.chatProfileOpen) {
        state.chatProfileOpen = true;
        renderApp();
      }
    }
  }

  function openSocialView(scope, nextView) {
    const key = scope === 'search' ? 'searchProfileSocialView' : scope === 'peer' ? 'chatProfileSocialView' : 'profileSocialView';
    const current = state[key];
    if (!current) beginDetailNavigation(`${scope}-social`);
    else if (current !== nextView) state.socialTransition = nextView === 'following' ? 'from-right' : 'from-left';
    state[key] = nextView;
    renderApp();
    if (state.socialTransition) {
      const transition = state.socialTransition;
      setTimeout(() => {
        if (state.socialTransition === transition) state.socialTransition = null;
      }, 230);
    }
  }

  function navigationBackOr(fallback) {
    if (state.navigationBusy) return;
    if (!requestNavigationBack()) fallback?.();
  }

  async function searchStoryCommentGifs(query, requestId) {
    const sheet = state.actionSheet;
    if (sheet?.type !== 'story-comments' || !sheet.gifPickerOpen) return;
    const term = String(query || '').trim();
    const data = await api(`/api/gifs${term ? `?q=${encodeURIComponent(term)}` : ''}`);
    if (
      requestId !== storyCommentGifRequestId ||
      state.actionSheet !== sheet ||
      !sheet.gifPickerOpen ||
      String(sheet.gifQuery || '').trim() !== term
    ) return;
    if (storyCommentPosting(sheet)) {
      sheet.pendingGifPool = data.gifs || [];
      return;
    }
    state.gifPool = data.gifs || [];
    updateStoryCommentGifChoices(sheet);
  }

  function openOwnProfileFromStoryComments() {
    clearStoryAdvance();
    clearTimeout(overlayCloseTimer);
    state.actionSheet = null;
    state.overlayClosing = false;
    state.storyViewer = null;
    state.profileSocialView = null;
    state.searchProfileSocialView = null;
    state.tabTransition = false;
    if (state.tab !== 'profile') {
      switchMainTab('profile', { animate: false });
      return;
    }
    state.searchProfileOpen = false;
    state.publicProfile = null;
    discardNavigationForMainTab();
    if (location.pathname !== '/') history.replaceState(history.state, '', '/');
    renderApp();
  }

  async function openSearchProfile(username, options = {}) {
    const user = await fetchPublicProfile(username);
    if (!user) throw new Error('User not found.');
    rememberViewedProfile(user);
    if (!state.searchProfileOpen) state.profileReturnScroll = captureMessagesScroll();
    if (options.pushHistory !== false) beginDetailNavigation('profile', profilePath(user.username));
    state.clipViewer = null;
    state.lastTab = state.tab;
    state.tab = 'search';
    state.publicProfile = user;
    state.searchProfileOpen = true;
    state.searchProfileSocialView = null;
    state.searchProfileMediaTab = 'posts';
    state.profileSocialView = null;
    state.chatProfileOpen = false;
    state.chatProfileSocialView = null;
    state.tabTransition = false;
    await loadProfilePosts(user, state.searchProfileMediaTab, { render: false }).catch(() => []);
    renderApp();
  }

  function closeSearchProfileNavigation() {
    if (!state.searchProfileOpen) return;
    navigationBackOr(() => {
      state.searchProfileOpen = false;
      state.searchProfileSocialView = null;
      state.publicProfile = null;
      state.tab = 'search';
      state.tabTransition = false;
      history.replaceState({
        appManaged: true,
        route: 'app',
        navDepth: state.navigationStack.length,
        navGeneration: state.navigationGeneration,
        view: captureNavigationView()
      }, '', '/');
      const returnScroll = state.profileReturnScroll;
      state.profileReturnScroll = null;
      renderApp({ scrollSnapshot: returnScroll });
    });
  }

  let conversationSearchId = 0;

  async function searchConversations(query) {
    const trimmed = query.trim();
    const searchId = ++conversationSearchId;
    if (!trimmed) {
      state.conversationResults = [];
      state.conversationSearching = false;
      renderSidebarState();
      return;
    }
    const data = await api(`/api/chats/search?q=${encodeURIComponent(trimmed)}`);
    if (searchId !== conversationSearchId || trimmed !== state.conversationQuery.trim()) return;
    state.conversationResults = data.results || [];
    state.conversationSearching = false;
    renderSidebarState();
    const input = document.getElementById('conversation-search');
    if (input) {
      input.value = state.conversationQuery;
      input.focus();
      input.setSelectionRange(state.conversationQuery.length, state.conversationQuery.length);
    }
  }

  async function setMessageNotifications(enabled) {
    if (!enabled) {
      state.messageNotifications = false;
      localStorage.setItem('messageNotifications', '0');
      renderApp();
      return;
    }
    if (!('Notification' in window)) {
      state.messageNotifications = false;
      localStorage.setItem('messageNotifications', '0');
      alert('This browser does not support browser notifications. In-app alerts will still appear.');
      renderApp();
      return;
    }
    if (!window.isSecureContext) {
      state.messageNotifications = false;
      localStorage.setItem('messageNotifications', '0');
      alert('Browser notifications need HTTPS on iPhone and normal websites. In-app alerts will still appear.');
      renderApp();
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    state.messageNotifications = permission === 'granted';
    state.notificationPromptDismissed = true;
    sessionStorage.setItem('notificationPromptDismissed', '1');
    if (state.messageNotifications) localStorage.setItem('messageNotifications', '1');
    else localStorage.setItem('messageNotifications', '0');
    renderApp();
  }

  function updateToastSlot() {
    const slot = document.getElementById('toast-slot');
    if (slot) slot.innerHTML = renderToastStack();
  }

  function dismissToast(toastId) {
    state.toasts = state.toasts.filter((toast) => toast.id !== toastId);
    clearTimeout(toastTimers.get(toastId));
    toastTimers.delete(toastId);
    updateToastSlot();
  }

  function pushToast(toast) {
    const existing = toast.key ? state.toasts.find((item) => item.key === toast.key) : null;
    const toastId = existing?.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next = { ...existing, ...toast, id: toastId };
    state.toasts = [next, ...state.toasts.filter((item) => item.id !== toastId)].slice(0, 4);
    clearTimeout(toastTimers.get(toastId));
    toastTimers.set(toastId, setTimeout(() => dismissToast(toastId), 5600));
    updateToastSlot();
    if (document.hidden) navigator.vibrate?.(60);
  }

  function showSystemNotification({ title, body, actor, tag, userId = null, groupId = null }) {
    if (!state.messageNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, {
        body,
        icon: actor?.avatar?.url || undefined,
        tag
      });
      notification.onclick = () => {
        window.focus();
        if (groupId) openGroup(groupId).catch((error) => alert(error.message));
        else if (userId) openChat(userId).catch((error) => alert(error.message));
        else {
          state.lastTab = state.tab;
          state.tab = 'notifications';
          refreshChatsOnly().finally(() => renderApp());
        }
        notification.close();
      };
    } catch {
      // Some mobile browsers expose Notification but still block constructor use.
    }
  }

  function showIncomingMessageNotification(message, groupId = null) {
    const sender = userById(message.senderId);
    const group = groupId ? state.groups.find((item) => item.id === groupId) : null;
    const title = group?.name || sender?.displayName || sender?.username || 'New message';
    const body = describeMessage(message);
    pushToast({
      key: `message-${groupId || message.senderId}`,
      kind: 'message',
      title,
      body,
      actor: sender,
      userId: groupId ? null : message.senderId,
      groupId
    });
    showSystemNotification({ title, body, actor: sender, tag: `chat-${groupId || message.senderId}`, userId: groupId ? null : message.senderId, groupId });
  }

  function showSocialNotification(event) {
    if (event.request?.from) {
      const actor = event.request.from;
      const title = 'New follow request';
      const body = `${actor.displayName || actor.username} wants to follow you.`;
      pushToast({ key: `request-${event.request.id}`, kind: 'request', title, body, actor });
      showSystemNotification({ title, body, actor, tag: `request-${event.request.id}` });
      return;
    }
    const note = event.notification;
    if (!note || note.type === 'message' || note.type === 'friend_request' || note.type === 'request_declined') return;
    const actor = note.actor;
    const titles = {
      mention: 'You were mentioned',
      comment_reply: 'New comment reply',
      comment_like: 'Someone liked your comment',
      group_added: 'Added to a group'
    };
    const title = titles[note.type] || 'New follower update';
    const body = note.text || `${actor?.displayName || actor?.username || 'Someone'} sent an update.`;
    pushToast({ key: `social-${note.id}`, kind: note.group ? 'message' : 'social', title, body, actor, groupId: note.group?.id || null });
    showSystemNotification({ title, body, actor, tag: `social-${note.id}`, groupId: note.group?.id || null });
  }

  function connectWs() {
    if (state.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.ws.readyState)) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    state.ws = ws;
    ws.addEventListener('message', async (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      await handleSocketEvent(payload);
    });
    ws.addEventListener('close', () => {
      if (state.me) setTimeout(connectWs, 1500);
    });
  }

  async function handleSocketEvent(event) {
    if (event.type === 'message:new') {
      const currentChatId = activeChatId();
      const incoming = event.message.senderId !== state.me.id;
      const activelyViewing = event.chatId === currentChatId && !document.hidden;
      if (event.chatId === currentChatId) {
        if (event.message.senderId === state.typingPeerId) state.typingPeerId = null;
        if (event.message.senderId === state.typingGroup?.userId) state.typingGroup = null;
        upsertMessage(event.message);
        if (!updateMessagesList({ scroll: 'auto', anchor: 'bottom' })) renderApp();
      }
      if (incoming && !activelyViewing) {
        const unreadKey = event.groupId || event.message.groupId || event.message.senderId;
        state.unreadByPeer[unreadKey] = (state.unreadByPeer[unreadKey] || 0) + 1;
        showIncomingMessageNotification(event.message, event.groupId || event.message.groupId || null);
      }
      await refreshChatsOnly();
      updateSidebar();
    }
    if (event.type === 'message:deleted') {
      const message = state.messages.find((item) => item.id === event.messageId);
      if (message) {
        message.deletedAt = event.deletedAt;
        message.deletedBy = event.deletedBy;
        message.text = '';
        message.attachment = null;
        updateMessagesList({ scroll: 'preserve' });
      }
      await refreshChatsOnly();
      updateSidebar();
    }
    if (event.type === 'message:updated') {
      if (event.chatId === activeChatId() && event.message) {
        upsertMessage(event.message);
        updateMessagesList({ scroll: 'preserve' });
        if (state.messageFocus?.messageId === event.message.id) syncFocusedMessageUi(event.message);
      }
    }
    if (event.type === 'message:hidden') {
      state.messages = state.messages.filter((item) => item.id !== event.messageId);
      rememberActiveConversation();
      updateMessagesList({ scroll: 'preserve' });
      await refreshChatsOnly();
      updateSidebar();
    }
    if (event.type === 'notification:new') {
      state.pendingRequestCount = event.pendingRequestCount ?? state.pendingRequestCount;
      showSocialNotification(event);
      await refreshChatsOnly();
      updateSidebar();
    }
    if (event.type === 'relationship:updated') {
      const activePeerId = state.activePeer?.id || null;
      await loadContactsAndChats();
      if (activePeerId && !state.contacts.some((contact) => contact.id === activePeerId)) {
        state.activePeer = null;
        state.chatProfileOpen = false;
        state.chatProfileSocialView = null;
        renderApp();
      } else {
        if (activePeerId) state.activePeer = userById(activePeerId) || state.activePeer;
        if (state.chatProfileOpen) renderApp();
        else updateSidebar();
      }
    }
    if (event.type === 'group:updated') {
      const activeGroupId = state.activeGroup?.id || null;
      await refreshChatsOnly();
      const updated = state.groups.find((group) => group.id === activeGroupId);
      if (activeGroupId && !updated) {
        state.activeGroup = null;
        state.chatProfileOpen = false;
        state.messages = [];
        renderApp();
      } else {
        if (updated) state.activeGroup = updated;
        if (state.chatProfileOpen) renderApp({ scroll: 'preserve' });
        else updateSidebar();
      }
    }
    if (event.type === 'typing') {
      if (event.groupId === state.activeGroup?.id) {
        state.typingGroup = event.isTyping ? { groupId: event.groupId, userId: event.from } : null;
        if (!updateMessagesList({ scroll: 'preserve', anchor: 'bottom' })) renderApp();
      } else if (event.from === state.activePeer?.id) {
        state.typingPeerId = event.isTyping ? event.from : null;
        if (!updateMessagesList({ scroll: 'preserve', anchor: 'bottom' })) renderApp();
      }
    }
    if (event.type === 'signal') {
      await handleSignal(event.from, event.payload);
    }
  }

  function sendTypingSignal(isTyping) {
    if (!hasActiveConversation() || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify(state.activeGroup
      ? { type: 'typing', groupId: state.activeGroup.id, isTyping }
      : { type: 'typing', to: state.activePeer.id, isTyping }));
  }

  async function startRecording(button) {
    if (state.recorder) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Voice recording needs a modern browser and HTTPS outside localhost.');
      return;
    }
    state.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordChunks = [];
    state.recorder = new MediaRecorder(state.recordStream);
    state.recorder.ondataavailable = (event) => {
      if (event.data.size) state.recordChunks.push(event.data);
    };
    state.recorder.onstop = async () => {
      const blob = new Blob(state.recordChunks, { type: state.recorder.mimeType || 'audio/webm' });
      stopRecordStream();
      state.recorder = null;
      if (blob.size) {
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        await sendFile(file, 'voice');
      }
    };
    button?.classList.add('recording');
    state.recorder.start();
  }

  function stopRecording(button) {
    button?.classList.remove('recording');
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  }

  function stopRecordStream() {
    if (state.recordStream) {
      state.recordStream.getTracks().forEach((track) => track.stop());
      state.recordStream = null;
    }
  }

  function openStickerDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open('chat-local-stickers', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('stickers', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadStickers() {
    try {
      const db = await openStickerDb();
      if (!db) {
        state.stickers = JSON.parse(localStorage.getItem('chat-stickers') || '[]');
      } else {
        state.stickers = await new Promise((resolve, reject) => {
          const tx = db.transaction('stickers', 'readonly');
          const req = tx.objectStore('stickers').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        db.close();
      }
    } catch {
      state.stickers = [];
    }
    state.stickers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    state.stickerMap = new Map(state.stickers.map((sticker) => [sticker.id, sticker]));
  }

  async function saveSticker(sticker) {
    const db = await openStickerDb();
    if (!db) {
      const all = JSON.parse(localStorage.getItem('chat-stickers') || '[]').filter((item) => item.id !== sticker.id);
      all.unshift(sticker);
      localStorage.setItem('chat-stickers', JSON.stringify(all.slice(0, 80)));
    } else {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('stickers', 'readwrite');
        tx.objectStore('stickers').put(sticker);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
    await loadStickers();
  }

  function createTextSticker() {
    state.stickerCreator = stickerCreatorDefaults();
    updateStickerCreatorSlot();
  }

  async function saveTextSticker() {
    const editor = state.stickerCreator;
    const text = editor?.text.trim();
    if (!editor || !text) return;
    const svg = buildTextStickerSvg(editor);
    const sticker = {
      id: `sticker_${cryptoRandom()}`,
      name: text.slice(0, 40),
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      animated: editor.textAnimation !== 'none' || ['shimmer', 'sparkle', 'rainbow'].includes(editor.textEffect),
      createdAt: new Date().toISOString(),
      style: {
        font: editor.textFont,
        color: editor.textColor,
        size: editor.textSize,
        align: editor.textAlign,
        effect: editor.textEffect,
        animation: editor.textAnimation,
        background: editor.textBgEnabled,
        frame: editor.textFrame
      }
    };
    await saveSticker(sticker);
    addStickerToActiveSet(sticker.id);
    state.stickerCreator = null;
    state.stickerPanel = true;
    state.chatTrayTab = 'stickers';
    updateStickerCreatorSlot();
    updateChatFooter();
  }

  async function createImageSticker(file) {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    const scale = Math.min(460 / image.width, 460 / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (512 - w) / 2, (512 - h) / 2, w, h);
    const sticker = {
      id: `sticker_${cryptoRandom()}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Sticker',
      dataUrl: canvas.toDataURL('image/png'),
      createdAt: new Date().toISOString()
    };
    await saveSticker(sticker);
    addStickerToActiveSet(sticker.id);
    state.stickerPanel = true;
    updateChatFooter({ suppressFocus: true });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.slice(0, 5).forEach((item, index) => {
      const lineY = startY + index * lineHeight;
      if (options.stroke) ctx.strokeText(item, x, lineY);
      ctx.fillText(item, x, lineY);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function cryptoRandom() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function sendSticker(stickerId) {
    let sticker = state.stickerMap.get(stickerId) || chatStickerPresets().find((item) => item.id === stickerId);
    if (!sticker) return;
    if (!state.stickerMap.has(sticker.id)) {
      sticker = { ...sticker, createdAt: new Date().toISOString() };
      await saveSticker(sticker);
    }
    const blob = await (await fetch(sticker.dataUrl)).blob();
    const type = blob.type || mimeFromDataUrl(sticker.dataUrl);
    const extension = type.startsWith('image/svg') ? 'svg' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'png';
    const file = new File([blob], `${sticker.name || 'sticker'}.${extension}`, { type: type || 'image/png' });
    await sendFile(file, 'sticker', sticker.id);
  }

  async function sendGif(gifId) {
    const gif = [...state.gifPool, ...(state.chatGifResults || [])].find((item) => item.id === gifId);
    if (!gif?.file?.url || !hasActiveConversation() || state.sendingGifId) return;
    state.sendingGifId = gifId;
    updateChatFooter({ suppressFocus: true });
    try {
      await sendMessage({
        kind: 'gif',
        text: '',
        gifId: gif.catalogId ? null : gif.id,
        gifCatalogId: gif.catalogId || null
      });
      state.stickerPanel = false;
    } finally {
      state.sendingGifId = null;
      updateChatFooter();
    }
  }

  async function downloadSticker(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message?.attachment) return;
    const blob = await (await fetch(message.attachment.url, { credentials: 'same-origin' })).blob();
    const dataUrl = await blobToDataUrl(blob);
    const sticker = {
      id: message.stickerId,
      name: message.attachment.name.replace(/\.[^.]+$/, '') || 'Downloaded sticker',
      dataUrl,
      createdAt: new Date().toISOString()
    };
    await saveSticker(sticker);
    addStickerToActiveSet(sticker.id);
    state.stickerSavePrompt = { messageId, stickerId: sticker.id };
    updateMessagesList({ scroll: 'preserve' });
    updateChatFooter({ suppressFocus: true });
    updateStickerManagerSlot();
  }

  async function setupTwoFactor() {
    state.twoFactorSetup = await api('/api/auth/2fa/setup', { method: 'POST' });
    renderApp();
  }

  async function enableTwoFactor() {
    const code = document.getElementById('enable-2fa-code')?.value || '';
    await api('/api/auth/2fa/enable', { method: 'POST', body: { code } });
    state.twoFactorEnabled = true;
    state.twoFactorSetup = null;
    renderApp();
  }

  async function disableTwoFactor() {
    const code = document.getElementById('disable-2fa-code')?.value || '';
    await api('/api/auth/2fa/disable', { method: 'POST', body: { code } });
    state.twoFactorEnabled = false;
    renderApp();
  }

  function sendSignal(to, payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type: 'signal', to, payload }));
  }

  function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, { kind: 'candidate', candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      if (!state.call.remoteStream) state.call.remoteStream = new MediaStream();
      event.streams[0].getTracks().forEach((track) => state.call.remoteStream.addTrack(track));
      state.call.status = 'Connected';
      updateCallDock();
    };
    pc.onconnectionstatechange = () => {
      state.call.status = pc.connectionState === 'connected' ? 'Connected' : `Call ${pc.connectionState}`;
      updateCallDock();
    };
    return pc;
  }

  async function startCall(video) {
    if (!state.activePeer) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Calls need a modern browser and HTTPS outside localhost.');
      return;
    }
    await endCall(false);
    const peerId = state.activePeer.id;
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    const pc = createPeerConnection(peerId);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    state.call = { ...freshCallState(), peerId, pc, localStream, active: true, video, status: 'Calling...' };
    updateCallDock();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, { kind: 'offer', offer, video });
  }

  async function handleSignal(from, payload) {
    if (!payload) return;
    if (payload.kind === 'offer') {
      state.call = { ...freshCallState(), incoming: { from, offer: payload.offer, video: Boolean(payload.video) } };
      updateCallDock();
      return;
    }
    if (payload.kind === 'answer' && state.call.pc) {
      await state.call.pc.setRemoteDescription(payload.answer);
      state.call.status = 'Connected';
      updateCallDock();
      return;
    }
    if (payload.kind === 'candidate' && state.call.pc) {
      try {
        await state.call.pc.addIceCandidate(payload.candidate);
      } catch {
        // Candidates can arrive during hangup; ignoring that is fine.
      }
      return;
    }
    if (payload.kind === 'reject') {
      await endCall(false);
      alert('Call rejected.');
      return;
    }
    if (payload.kind === 'hangup') {
      await endCall(false);
    }
  }

  async function acceptCall() {
    const incoming = state.call.incoming;
    if (!incoming) return;
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incoming.video });
    const pc = createPeerConnection(incoming.from);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    state.call = {
      ...freshCallState(),
      peerId: incoming.from,
      pc,
      localStream,
      active: true,
      video: incoming.video,
      status: 'Connecting...'
    };
    updateCallDock();
    await pc.setRemoteDescription(incoming.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal(incoming.from, { kind: 'answer', answer });
  }

  async function rejectCall() {
    const incoming = state.call.incoming;
    if (incoming) sendSignal(incoming.from, { kind: 'reject' });
    await endCall(false);
  }

  async function endCall(notify = true) {
    const peerId = state.call.peerId || state.call.incoming?.from;
    if (notify && peerId) sendSignal(peerId, { kind: 'hangup' });
    if (state.call.pc) state.call.pc.close();
    if (state.call.localStream) state.call.localStream.getTracks().forEach((track) => track.stop());
    if (state.call.remoteStream) state.call.remoteStream.getTracks().forEach((track) => track.stop());
    state.call = freshCallState();
    updateCallDock();
  }

  function updateCallDock() {
    const slot = document.getElementById('call-dock-slot');
    if (slot) {
      slot.innerHTML = renderCallDock();
      attachCallStreams();
    }
  }

  function attachCallStreams() {
    const local = document.getElementById('local-video');
    const remote = document.getElementById('remote-video');
    if (local && state.call.localStream && local.srcObject !== state.call.localStream) {
      local.srcObject = state.call.localStream;
    }
    if (remote && state.call.remoteStream && remote.srcObject !== state.call.remoteStream) {
      remote.srcObject = state.call.remoteStream;
    }
  }

  let overlayCloseTimer = null;
  let actionSheetReturnFocus = null;
  let actionSheetWasOpen = false;
  let messageFocusCloseTimer = null;
  let focusedMessageDom = null;
  let messageFocusReturnFocus = null;
  let messageFocusWasOpen = false;
  let activeMessagePress = null;
  let settingsCloseTimer = null;
  let storyAdvanceTimer = null;
  const MESSAGE_LONG_PRESS_MS = 500;
  const MESSAGE_PRESS_CANCEL_DISTANCE = 10;

  function clearActiveMessagePress(options = {}) {
    const press = activeMessagePress;
    if (!press) return null;
    if (options.pointerId !== undefined && options.pointerId !== press.pointerId) return null;
    clearTimeout(press.timer);
    press.element?.classList.remove('message-press-pending', 'message-press-held');
    if (options.suppressClick && press.recognized) state.suppressClickUntil = Math.max(state.suppressClickUntil, Date.now() + 90);
    activeMessagePress = null;
    return press;
  }

  function beginMessagePress(event, element, messageId) {
    clearActiveMessagePress();
    element.classList.remove('message-press-held');
    element.classList.add('message-press-pending');
    const press = {
      pointerId: event.pointerId,
      messageId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      recognized: false,
      timer: null
    };
    press.timer = setTimeout(() => {
      if (activeMessagePress !== press || !element.isConnected) return;
      press.recognized = true;
      state.drag = null;
      element.classList.remove('message-press-pending');
      element.classList.add('message-press-held');
      navigator.vibrate?.(20);
      openMessageFocus(messageId);
    }, MESSAGE_LONG_PRESS_MS);
    activeMessagePress = press;
  }

  function cancelMessagePressFromMove(event) {
    const press = activeMessagePress;
    if (!press || press.pointerId !== event.pointerId) return false;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <= MESSAGE_PRESS_CANCEL_DISTANCE) return false;
    clearActiveMessagePress({ pointerId: event.pointerId });
    return true;
  }

  function finishMessagePress(pointerId) {
    return clearActiveMessagePress({ pointerId, suppressClick: true });
  }

  function clearStoryAdvance() {
    clearTimeout(storyAdvanceTimer);
    storyAdvanceTimer = null;
  }

  function scheduleStoryAdvance(story) {
    clearStoryAdvance();
    if (!story || !state.storyViewer) return;
    const edits = story.edits || {};
    const trimStart = Math.max(0, Number(edits.trimStart || 0));
    const trimEnd = Math.max(trimStart, Number(edits.trimEnd || 0));
    const speed = [0.5, 1, 1.5, 2].includes(Number(edits.videoSpeed)) ? Number(edits.videoSpeed) : 1;
    const clipSeconds = trimEnd > trimStart ? (trimEnd - trimStart) / speed : 12;
    const delay = story.file?.mime?.startsWith('video/') ? clamp(clipSeconds * 1000, 1000, 60000) : 7000;
    storyAdvanceTimer = setTimeout(() => {
      navigateStory(1).catch((error) => alert(error.message));
    }, delay);
  }

  function syncActionSheetAccessibility() {
    const slot = document.getElementById('action-sheet-slot');
    const open = Boolean(state.actionSheet && slot?.querySelector('.action-sheet'));
    Array.from(app.children).forEach((child) => {
      if (child !== slot) child.inert = open;
    });
    if (!open && actionSheetWasOpen) {
      const returnTarget = actionSheetReturnFocus;
      actionSheetReturnFocus = null;
      if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus?.({ preventScroll: true }));
    }
    actionSheetWasOpen = open;
  }

  function syncMessageFocusAccessibility() {
    const slot = document.getElementById('message-focus-slot');
    const open = Boolean(state.messageFocus && slot?.querySelector('.message-focus-overlay'));
    Array.from(app.children).forEach((child) => {
      if (child !== slot) child.inert = open;
    });
    if (!open && messageFocusWasOpen) {
      const returnTarget = messageFocusReturnFocus;
      messageFocusReturnFocus = null;
      if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus?.({ preventScroll: true }));
    }
    messageFocusWasOpen = open;
  }

  function openActionSheet(sheet) {
    clearTimeout(overlayCloseTimer);
    if (!state.actionSheet) actionSheetReturnFocus = document.activeElement;
    state.overlayClosing = false;
    state.actionSheet = sheet;
    updateActionSheetSlot();
    requestAnimationFrame(() => {
      if (state.actionSheet !== sheet) return;
      const dialog = document.querySelector('#action-sheet-slot .action-sheet');
      const focusTarget = dialog?.querySelector('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || dialog;
      focusTarget?.focus?.({ preventScroll: true });
    });
  }

  function openMessageFocus(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message || message.deletedAt) return;
    const escapedId = window.CSS?.escape ? CSS.escape(messageId) : String(messageId).replace(/"/g, '\\"');
    const element = document.querySelector(`.messages .message[data-message-id="${escapedId}"]`);
    if (!element) return;
    const sourceRect = element.getBoundingClientRect();
    clearTimeout(messageFocusCloseTimer);
    messageFocusReturnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : element;
    document.activeElement?.blur?.();
    state.messageFocusClosing = false;
    state.messageFocusNeedsRefresh = false;
    state.messageFocus = { messageId, mode: 'actions' };
    updateMessageFocusSlot();
    const host = document.querySelector('.message-focus-host');
    if (!host) return;
    const placeholder = document.createElement('div');
    placeholder.className = `message-focus-placeholder ${element.classList.contains('mine') ? 'mine' : 'theirs'}`;
    placeholder.style.width = `${sourceRect.width}px`;
    placeholder.style.height = `${sourceRect.height}px`;
    element.before(placeholder);
    host.append(element);
    element.classList.add('message-focus-original');
    element.setAttribute('data-stop-close', '');
    element.style.transition = 'none';
    element.style.transform = '';
    focusedMessageDom = { element, placeholder };
    const targetRect = element.getBoundingClientRect();
    element.style.transform = `translate3d(${sourceRect.left - targetRect.left}px, ${sourceRect.top - targetRect.top}px, 0)`;
    element.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (focusedMessageDom?.element !== element) return;
      const forwardDuration = navigationMotionDuration(280);
      element.style.transition = `transform ${forwardDuration}ms cubic-bezier(.2,.82,.2,1)`;
      element.style.transform = 'translate3d(0,0,0)';
      afterVisualMotion(element, 'transitionend', forwardDuration + 50, () => {
        if (focusedMessageDom?.element === element) {
          const overlay = document.querySelector('.message-focus-overlay');
          overlay?.classList.add('ready');
          overlay?.focus?.({ preventScroll: true });
        }
      }, 'transform');
    });
  }

  function closeMessageFocus(options = {}) {
    if (!state.messageFocus) return;
    clearActiveMessagePress();
    clearTimeout(messageFocusCloseTimer);
    const finish = () => {
      const dom = focusedMessageDom;
      if (dom?.element) {
        dom.element.classList.remove('message-focus-original');
        dom.element.removeAttribute('data-stop-close');
        dom.element.style.transition = '';
        dom.element.style.transform = '';
        if (dom.placeholder?.isConnected) dom.placeholder.replaceWith(dom.element);
      }
      focusedMessageDom = null;
      const refresh = state.messageFocusNeedsRefresh && !options.skipRefresh;
      state.messageFocus = null;
      state.messageFocusClosing = false;
      state.messageFocusNeedsRefresh = false;
      const slot = document.getElementById('message-focus-slot');
      if (slot) slot.innerHTML = '';
      syncMessageFocusAccessibility();
      if (refresh) updateMessagesList({ scroll: 'preserve' });
      options.afterClose?.();
    };
    if (options.immediate) return finish();
    state.messageFocusClosing = true;
    document.querySelector('.message-focus-overlay')?.classList.add('closing');
    const dom = focusedMessageDom;
    const closeDuration = navigationMotionDuration(220);
    if (dom?.element && dom.placeholder?.isConnected) {
      const currentRect = dom.element.getBoundingClientRect();
      const targetRect = dom.placeholder.getBoundingClientRect();
      dom.element.style.transition = `transform ${closeDuration}ms cubic-bezier(.4,0,.2,1)`;
      dom.element.style.transform = `translate3d(${targetRect.left - currentRect.left}px, ${targetRect.top - currentRect.top}px, 0)`;
    }
    messageFocusCloseTimer = setTimeout(finish, closeDuration);
  }

  function setMessageFocusMode(mode) {
    if (!state.messageFocus) return;
    const nextMode = ['forward', 'sticker'].includes(mode) ? mode : 'actions';
    state.messageFocus.mode = nextMode;
    const message = state.messages.find((item) => item.id === state.messageFocus.messageId);
    const stage = document.querySelector('.message-focus-stage');
    const actions = document.querySelector('.message-focus-actions');
    const slot = document.querySelector('.message-focus-picker-slot');
    stage?.classList.toggle('picker-open', nextMode !== 'actions');
    actions?.classList.toggle('hidden', nextMode !== 'actions');
    if (slot) slot.innerHTML = message ? renderMessageFocusPicker(nextMode, message) : '';
  }

  function syncFocusedMessageUi(message) {
    if (!message || state.messageFocus?.messageId !== message.id) return;
    document.querySelectorAll('.message-reaction-bar [data-emoji]').forEach((button) => {
      const reaction = (message.reactions || []).find((item) => item.emoji === button.dataset.emoji);
      button.classList.toggle('active', Boolean(reaction?.userIds?.includes(state.me.id)));
    });
    const element = focusedMessageDom?.element;
    if (!element) return;
    const template = document.createElement('template');
    template.innerHTML = renderMessageReactions(message).trim();
    const next = template.content.firstElementChild;
    const current = Array.from(element.children).find((child) => child.classList?.contains('message-reactions'));
    if (current && next) current.replaceWith(next);
    else if (current) current.remove();
    else if (next) element.append(next);
  }

  function closeOverlays() {
    if (!state.actionSheet) return;
    state.commentSheetDrag = null;
    clearTimeout(overlayCloseTimer);
    state.overlayClosing = true;
    updateActionSheetSlot();
    overlayCloseTimer = setTimeout(() => {
      state.actionSheet = null;
      state.overlayClosing = false;
      updateActionSheetSlot();
      if (state.storyViewer) scheduleStoryAdvance(storyById(state.storyViewer.storyId));
      if (state.clipViewer || state.tab === 'clips') requestAnimationFrame(attachClipPlayback);
    }, 190);
  }

  function openSettingsDrawer() {
    clearTimeout(settingsCloseTimer);
    state.settingsSection = 'main';
    state.settingsOpen = true;
    state.settingsOpening = true;
    state.settingsClosing = false;
    updateProfileModalSlots();
    requestAnimationFrame(() => {
      document.querySelector('.settings-drawer-overlay')?.classList.remove('opening');
      document.querySelector('.settings-drawer')?.classList.remove('opening');
      state.settingsOpening = false;
    });
  }

  function closeSettingsDrawer() {
    if (!state.settingsOpen || state.settingsClosing) return;
    clearTimeout(settingsCloseTimer);
    state.settingsOpening = false;
    state.settingsClosing = true;
    updateProfileModalSlots();
    settingsCloseTimer = setTimeout(() => {
      state.settingsOpen = false;
      state.settingsClosing = false;
      state.settingsSection = 'main';
      updateProfileModalSlots();
    }, 240);
  }

  function scrollMessagesToBottom() {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.scrollLeft = 0;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  async function openSettingsSection(section) {
    const allowed = ['account', 'blocked', 'comments', 'reposts'];
    if (!allowed.includes(section)) return;
    if (section === 'account') {
      const data = await api('/api/account');
      Object.assign(state.me, data.account || {});
    }
    if (section === 'blocked') {
      const data = await api('/api/account/blocked');
      state.blockedUsers = data.users || [];
    }
    if (section === 'comments' || section === 'reposts') {
      const data = await api(`/api/me/activity?type=${section}`);
      state.accountActivity[section] = data.items || [];
    }
    state.settingsSection = section;
    updateProfileModalSlots();
  }

  async function toggleStoryCommentGifPicker() {
    if (state.actionSheet?.type !== 'story-comments' || storyCommentPosting(state.actionSheet)) return;
    const sheet = state.actionSheet;
    sheet.commentDraft = document.getElementById('story-comment-input')?.value || sheet.commentDraft || '';
    const opening = !sheet.gifPickerOpen;
    sheet.gifPickerOpen = opening;
    sheet.gifQuery = '';
    if (opening) document.activeElement?.blur?.();
    const loading = opening ? loadGifPool() : null;
    updateStoryCommentsSheet({ focus: !opening });
    if (!loading) return;
    let loaded = false;
    try {
      await loading;
      loaded = true;
    } finally {
      if (state.actionSheet === sheet && sheet.gifPickerOpen) {
        document.querySelector('.story-comment-gif-loading')?.remove();
        if (storyCommentPosting(sheet)) sheet.pendingGifPool = [...state.gifPool];
        else updateStoryCommentGifChoices(sheet);
        if (loaded && String(sheet.gifQuery || '').trim()) {
          clearTimeout(storyCommentGifTimer);
          const requestId = ++storyCommentGifRequestId;
          await searchStoryCommentGifs(sheet.gifQuery, requestId);
        }
      }
    }
  }

  function resizeComposerInput() {
    const input = document.getElementById('composer-text');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function updateMessagesList(options = {}) {
    const messages = document.getElementById('messages');
    if (!messages || !hasActiveConversation() || state.chatProfileOpen) return false;
    if (state.messageFocus) {
      state.messageFocusNeedsRefresh = true;
      return true;
    }
    const snapshot = options.scrollSnapshot || captureMessagesScroll();
    const wasNearBottom = snapshot && snapshot.bottom < 80;
    if (options.settle) messages.classList.add('chat-settling');
    messages.innerHTML = renderMessagesList();
    const pinToBottom = options.scroll === 'bottom' || (options.scroll === 'auto' && wasNearBottom);
    if (pinToBottom) scrollMessagesToBottom();
    else if (options.scroll === 'restore') restoreMessagesScroll(snapshot);
    else restoreMessagesScroll(snapshot, options.anchor === 'bottom' ? { anchor: 'bottom' } : {});
    if (options.scroll === 'bottom') stabilizeBottomScroll({ reveal: Boolean(options.settle) });
    return true;
  }

  function updateChatPane(options = {}) {
    const current = document.querySelector('.chat-pane');
    if (!current || !state.me) return false;
    const template = document.createElement('template');
    template.innerHTML = renderChatPane().trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    currentAppShell()?.classList.toggle('chat-open', hasVisibleConversation());
    resizeComposerInput();
    applyRenderScroll(options.scroll || 'preserve', options.scrollSnapshot || null);
    setTimeout(() => {
      next.classList.remove('chat-opening');
      state.chatOpening = false;
    }, 300);
    return true;
  }

  function updateSidebar() {
    capturePersistentScroll();
    const current = document.querySelector('.sidebar');
    if (!current || !state.me) return false;
    const template = document.createElement('template');
    template.innerHTML = renderSidebar().trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    restorePersistentScroll();
    initializePostCarousels(next);
    if (state.tab === 'clips' || state.clipViewer) requestAnimationFrame(attachClipPlayback);
    return true;
  }

  function renderSidebarState() {
    if (!isMobileLayout() && hasVisibleConversation() && !state.searchProfileOpen && updateSidebar()) return;
    renderApp();
  }

  function updateChatFooter(options = {}) {
    const pane = document.querySelector('.chat-pane');
    const current = pane?.querySelector('footer');
    if (!current || !hasActiveConversation() || state.chatProfileOpen) return false;
    const input = current.querySelector('#composer-text');
    const hadFocus = document.activeElement === input;
    const selectionStart = input?.selectionStart || 0;
    const gifInput = current.querySelector('#chat-gif-search');
    const hadGifFocus = document.activeElement === gifInput;
    const gifSelectionStart = gifInput?.selectionStart || 0;
    const template = document.createElement('template');
    template.innerHTML = renderChatPane().trim();
    const next = template.content.firstElementChild?.querySelector('footer');
    if (!next) return false;
    preserveMessagesScroll(() => {
      current.replaceWith(next);
      resizeComposerInput();
      if ((hadFocus && !options.suppressFocus) || options.focus) {
        const nextInput = document.getElementById('composer-text');
        nextInput?.focus({ preventScroll: true });
        const cursor = Math.min(selectionStart, nextInput?.value.length || 0);
        nextInput?.setSelectionRange?.(cursor, cursor);
      }
      if (hadGifFocus) {
        const nextGifInput = document.getElementById('chat-gif-search');
        nextGifInput?.focus({ preventScroll: true });
        const cursor = Math.min(gifSelectionStart, nextGifInput?.value.length || 0);
        nextGifInput?.setSelectionRange?.(cursor, cursor);
      }
    }, { anchor: 'bottom' });
    return true;
  }

  function scrollHighlightedMessage() {
    const escapedId = window.CSS?.escape ? CSS.escape(state.highlightMessageId) : String(state.highlightMessageId).replace(/"/g, '\\"');
    const item = document.querySelector(`[data-message-id="${escapedId}"]`);
    if (!item) {
      scrollMessagesToBottom();
      return;
    }
    item.scrollIntoView({ block: 'center' });
    setTimeout(() => {
      if (state.highlightMessageId === item.dataset.messageId) state.highlightMessageId = null;
      item.classList.remove('highlighted');
    }, 1600);
  }

  let searchTimer = null;
  let conversationTimer = null;

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form');
    if (!form) return;
    event.preventDefault();
    try {
      if (form.dataset.form === 'auth') {
        const body = state.authMode === 'login'
          ? {
              identifier: formValue(form, 'identifier'),
              password: formValue(form, 'password'),
              twoFactorCode: formValue(form, 'twoFactorCode')
            }
          : {
              username: formValue(form, 'username'),
              email: formValue(form, 'email'),
              phone: formValue(form, 'phone'),
              password: formValue(form, 'password')
            };
        const data = await api(`/api/auth/${state.authMode}`, { method: 'POST', body });
        state.me = data.user;
        state.needsTwoFactor = false;
        state.tab = 'home';
        state.lastTab = 'home';
        state.activePeer = null;
        state.activeGroup = null;
        state.chatLoading = false;
        state.conversationCache.clear();
        state.navigationStack = [];
        state.forwardNavigationEntries.clear();
        state.routeForward = null;
        state.navigationBusy = false;
        state.chatProfileOpen = false;
        state.profileSocialView = null;
        state.chatProfileSocialView = null;
        await loadContactsAndChats();
        await loadSocialSurfaces();
        await loadGifPool();
        renderApp();
        connectWs();
      }
      if (form.dataset.form === 'profile') {
        const body = {
          displayName: formValue(form, 'displayName'),
          bio: formValue(form, 'bio'),
          socialPublic: form.elements.socialPublic?.checked
        };
        const data = await api('/api/me/profile', { method: 'PATCH', body });
        state.me = data.user;
        updateSidebar();
      }
      if (form.dataset.form === 'post-comment') {
        const input = form.elements.comment;
        await commentOnPost(form.dataset.postId, input?.value || '');
        if (input) input.value = '';
      }
      if (form.dataset.form === 'account-contact') {
        const data = await api('/api/account', {
          method: 'PATCH',
          body: { email: formValue(form, 'email'), phone: formValue(form, 'phone') }
        });
        if (data.user) state.me = data.user;
        else Object.assign(state.me, data.account || {});
        updateProfileModalSlots();
        pushToast({ key: `account-contact-${Date.now()}`, kind: 'social', title: 'Contact details saved', body: data.verificationEmailSent ? 'We sent a verification email.' : 'Your account details are up to date.' });
      }
      if (form.dataset.form === 'change-password') {
        const currentPassword = formValue(form, 'currentPassword');
        const newPassword = formValue(form, 'newPassword');
        if (newPassword !== formValue(form, 'confirmPassword')) throw new Error('The new passwords do not match.');
        await api('/api/account/password', { method: 'PATCH', body: { currentPassword, newPassword } });
        form.reset();
        pushToast({ key: `password-${Date.now()}`, kind: 'social', title: 'Password changed', body: 'Other signed-in devices have been logged out.' });
      }
      if (form.dataset.form === 'profile-edit') {
        await updateProfilePatch({
          displayName: form.elements.displayName?.disabled ? state.me.displayName : formValue(form, 'displayName'),
          bio: formValue(form, 'bio'),
          website: formValue(form, 'website'),
          age: formValue(form, 'age') || null,
          gender: formValue(form, 'gender'),
          bioVisible: Boolean(form.elements.bioVisible?.checked),
          websiteVisible: Boolean(form.elements.websiteVisible?.checked),
          ageVisible: Boolean(form.elements.ageVisible?.checked),
          genderVisible: Boolean(form.elements.genderVisible?.checked)
        });
        state.profileEditOpen = false;
        updateProfileModalSlots();
        updateSidebar();
      }
    } catch (error) {
      if (error.data?.requiresTwoFactor) {
        state.needsTwoFactor = true;
        renderAuth(error.message);
      } else if (!state.me) {
        renderAuth(error.message);
      } else {
        alert(error.message);
      }
    }
  });

  document.addEventListener('click', async (event) => {
    if (Date.now() < state.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const clipViewport = event.target.closest('.clip-viewport');
    if (clipViewport && !event.target.closest('button,a,[data-action]')) {
      clearTimeout(clipTapTimer);
      clipTapTimer = setTimeout(() => toggleClipPlayback(clipViewport), 180);
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.matches('a[data-action]') && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    if (target.matches('button, a[data-action]')) event.preventDefault();
    const action = target.dataset.action;
    if (state.postPublishing && target.closest('#post-composer-slot') && action !== 'close-post-composer') return;
    if (action === 'close-overlays' && target.classList.contains('overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-modal' && target.classList.contains('center-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-note-composer' && target.classList.contains('note-composer-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-music-picker' && target.classList.contains('music-picker-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-settings' && target.classList.contains('settings-drawer-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-story-editor' && (target.classList.contains('story-editor-overlay') || target.classList.contains('story-editor-page')) && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-highlight-composer' && target.classList.contains('highlight-composer-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-media' && target.classList.contains('media-viewer') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-chat-customization' && target.classList.contains('chat-customization-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-sticker-creator' && target.classList.contains('sticker-creator-page') && event.target.closest('[data-stop-close]')) return;
    if (['close-sticker-manager', 'close-sticker-save'].includes(action) && target.classList.contains('sticker-manager-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-message-focus' && target.classList.contains('message-focus-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-group-composer' && target.classList.contains('group-composer-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'record-voice') return;
    try {
      if (action === 'auth-mode') {
        state.authMode = target.dataset.mode;
        state.needsTwoFactor = false;
        renderAuth();
      }
      if (action === 'show-login') {
        history.pushState({}, '', '/');
        state.authMode = 'login';
        renderAuth();
      }
      if (action === 'logout') {
        await api('/api/auth/logout', { method: 'POST' });
        if (state.postComposer) closePostComposer();
        closeCameraCapture({ immediate: true });
        if (state.ws) state.ws.close();
        toastTimers.forEach((timer) => clearTimeout(timer));
        toastTimers.clear();
        state.toasts = [];
        state.me = null;
        state.activePeer = null;
        state.activeGroup = null;
        state.chatLoading = false;
        state.chatOpenToken += 1;
        state.conversationCache.clear();
        state.conversationScroll.clear();
        state.navigationStack = [];
        state.forwardNavigationEntries.clear();
        state.routeForward = null;
        state.navigationBusy = false;
        state.tab = 'home';
        state.lastTab = 'home';
        state.profileSocialView = null;
        state.chatProfileSocialView = null;
        state.settingsOpen = false;
        state.settingsOpening = false;
        state.settingsClosing = false;
        renderAuth();
      }
      if (action === 'tab') {
        switchMainTab(target.dataset.tab);
      }
      if (action === 'toggle-feed-menu') {
        state.feedMenuOpen = !state.feedMenuOpen;
        updateSidebar();
      }
      if (action === 'set-feed-mode') {
        state.feedMenuOpen = false;
        await loadFeed(target.dataset.mode, { render: true });
      }
      if (action === 'set-clip-mode') {
        state.clipMode = target.dataset.mode === 'friends' ? 'friends' : 'for_you';
        updateSidebar();
        requestAnimationFrame(attachClipPlayback);
      }
      if (action === 'open-post-create') {
        state.feedMenuOpen = false;
        openPostMediaPicker();
      }
      if (action === 'add-post-media') openPostMediaPicker({ append: true });
      if (action === 'close-post-composer') closePostComposer();
      if (action === 'post-composer-back' && state.postComposer) {
        state.postComposer.stage = Math.max(1, state.postComposer.stage - 1);
        updatePostComposerSlot();
      }
      if (action === 'post-composer-next' && state.postComposer) {
        state.postComposer.stage = Math.min(3, state.postComposer.stage + 1);
        updatePostComposerSlot();
      }
      if (action === 'select-post-media' && state.postComposer) {
        state.postComposer.activeIndex = clamp(Number(target.dataset.mediaIndex || 0), 0, state.postComposer.items.length - 1);
        state.postComposer.pendingTagPoint = null;
        syncPostComposerAliases(state.postComposer);
        updatePostComposerSlot();
      }
      if (action === 'remove-post-media' && state.postComposer?.items?.length > 1) {
        const index = clamp(Number(target.dataset.mediaIndex || 0), 0, state.postComposer.items.length - 1);
        const [removed] = state.postComposer.items.splice(index, 1);
        [removed?.previewUrl, removed?.posterUrl].filter((url) => String(url || '').startsWith('blob:')).forEach((url) => URL.revokeObjectURL(url));
        state.postComposer.personTags = state.postComposer.personTags
          .filter((tag) => Number(tag.mediaIndex || 0) !== index)
          .map((tag) => Number(tag.mediaIndex || 0) > index ? { ...tag, mediaIndex: Number(tag.mediaIndex || 0) - 1 } : tag);
        state.postComposer.pendingTagPoint = null;
        state.postComposer.activeIndex = clamp(state.postComposer.activeIndex - (index <= state.postComposer.activeIndex ? 1 : 0), 0, state.postComposer.items.length - 1);
        syncPostComposerAspectFromOrder(state.postComposer);
        updatePostComposerSlot();
      }
      if ((action === 'move-post-media-previous' || action === 'move-post-media-next') && state.postComposer?.items?.length > 1) {
        const from = clamp(Number(target.dataset.mediaIndex || 0), 0, state.postComposer.items.length - 1);
        const to = clamp(from + (action.endsWith('previous') ? -1 : 1), 0, state.postComposer.items.length - 1);
        if (from !== to) {
          const [item] = state.postComposer.items.splice(from, 1);
          state.postComposer.items.splice(to, 0, item);
          state.postComposer.personTags = state.postComposer.personTags.map((tag) => {
            const mediaIndex = Number(tag.mediaIndex || 0);
            if (mediaIndex === from) return { ...tag, mediaIndex: to };
            if (from < to && mediaIndex > from && mediaIndex <= to) return { ...tag, mediaIndex: mediaIndex - 1 };
            if (from > to && mediaIndex >= to && mediaIndex < from) return { ...tag, mediaIndex: mediaIndex + 1 };
            return tag;
          });
          state.postComposer.pendingTagPoint = null;
          state.postComposer.activeIndex = to;
          syncPostComposerAspectFromOrder(state.postComposer);
          updatePostComposerSlot();
        }
      }
      if (action === 'set-post-aspect' && state.postComposer) {
        const aspect = target.dataset.aspect || 'portrait';
        state.postComposer.aspect = aspect;
        state.postComposer.items.forEach((item) => {
          const ratio = aspect === 'original'
            ? `original:${clamp(Number(state.postComposer.items[0]?.naturalAspect || 1), 0.75, 1.91).toFixed(4)}`
            : aspect === 'mixed'
              ? `mixed:${clamp(Number(item.naturalAspect || 1), 0.75, 1.91).toFixed(4)}`
              : aspect;
          Object.assign(item.crop, { aspect, aspectRatio: ratio });
        });
        syncPostComposerAliases(state.postComposer);
        target.parentElement?.querySelectorAll('[data-action="set-post-aspect"]').forEach((button) => button.classList.toggle('active', button === target));
        const frame = document.querySelector('#post-composer-slot .post-composer-media');
        if (frame) {
          Array.from(frame.classList).filter((name) => name.startsWith('aspect-')).forEach((name) => frame.classList.remove(name));
          frame.classList.add(`aspect-${state.postComposer.crop.aspect}`);
          frame.style.setProperty('--post-aspect', String(postComposerAspectRatio(state.postComposer)));
        }
      }
      if (action === 'rotate-post-media' && state.postComposer) {
        state.postComposer.crop.rotation = (Number(state.postComposer.crop.rotation || 0) + 90) % 360;
        updatePostComposerMediaStyle();
      }
      if (action === 'reset-post-crop' && state.postComposer) {
        Object.assign(state.postComposer.crop, { zoom: 1, x: 0, y: 0, rotation: 0 });
        updatePostComposerMediaStyle();
        syncPostCropControls();
      }
      if (action === 'set-post-filter' && state.postComposer) {
        state.postComposer.filter = target.dataset.filter || 'normal';
        const item = activePostComposerItem(state.postComposer);
        if (item) item.filter = state.postComposer.filter;
        target.parentElement?.querySelectorAll('[data-action="set-post-filter"]').forEach((button) => button.classList.toggle('active', button === target));
        updatePostComposerMediaStyle();
      }
      if (action === 'select-post-adjustment' && state.postComposer) {
        const adjustment = target.dataset.adjustment || 'saturation';
        state.postComposer.activeAdjustment = adjustment;
        const item = activePostComposerItem(state.postComposer);
        if (item) item.activeAdjustment = adjustment;
        target.parentElement?.querySelectorAll('[data-action="select-post-adjustment"]').forEach((button) => button.classList.toggle('active', button === target));
        const slider = document.querySelector('#post-composer-slot .post-adjust-slider');
        const input = slider?.querySelector('input');
        if (slider && input) {
          const minimum = adjustment === 'warmth' ? -50 : adjustment === 'saturation' ? 0 : 60;
          const maximum = adjustment === 'warmth' ? 50 : adjustment === 'saturation' ? 200 : 140;
          slider.querySelector('span').textContent = adjustment;
          input.dataset.postAdjust = adjustment;
          input.min = String(minimum);
          input.max = String(maximum);
          input.value = String(state.postComposer.adjustments[adjustment]);
          slider.querySelector('output').textContent = input.value;
        }
      }
      if (action === 'pick-post-tag-position' && state.postComposer?.stage === 3) {
        if (event.target.closest('.post-tag-draft')) return;
        const rect = target.getBoundingClientRect();
        if (state.postComposer.isVideo && event.clientY >= rect.bottom - 54) return;
        state.postComposer.pendingTagPoint = {
          mediaIndex: Number(state.postComposer.activeIndex || 0),
          x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98) * 10) / 10,
          y: Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98) * 10) / 10
        };
        updatePostComposerSlot();
        setTimeout(() => document.getElementById('post-tag-username')?.focus(), 0);
      }
      if (action === 'remove-post-tag' && state.postComposer) {
        state.postComposer.personTags.splice(Number(target.dataset.tagIndex), 1);
        updatePostComposerSlot();
      }
      if (action === 'add-post-person-tag' && state.postComposer?.pendingTagPoint) {
        const username = String(document.getElementById('post-tag-username')?.value || '').replace(/^@/, '').trim();
        if (!username) throw new Error('Choose a username to tag.');
        let tagged = postComposerCandidates().find((user) => user.username.toLowerCase() === username.toLowerCase());
        if (!tagged) {
          const data = await api(`/api/users/search?q=${encodeURIComponent(username)}`);
          tagged = (data.users || []).find((user) => user.username.toLowerCase() === username.toLowerCase());
        }
        if (!tagged) throw new Error('That username was not found.');
        state.postComposer.personTags = [
          ...state.postComposer.personTags.filter((tag) => tag.userId !== tagged.id || Number(tag.mediaIndex || 0) !== Number(state.postComposer.pendingTagPoint.mediaIndex || 0)),
          { userId: tagged.id, username: tagged.username, ...state.postComposer.pendingTagPoint }
        ];
        state.postComposer.pendingTagPoint = null;
        updatePostComposerSlot();
      }
      if (action === 'publish-post') await publishPost();
      if (action === 'toggle-post-preview-play') {
        const video = target.closest('.post-composer-media')?.querySelector('video');
        if (video) {
          if (video.paused) await video.play().catch(() => {});
          else video.pause();
          syncPostPreviewUi(video);
        }
      }
      if (action === 'toggle-post-preview-sound' && state.postComposer) {
        state.postComposer.previewMuted = !state.postComposer.previewMuted;
        const video = target.closest('.post-composer-media')?.querySelector('video');
        const music = video?.closest('.post-composer-media')?.querySelector('.post-preview-music');
        if (video) video.muted = Boolean(music) || state.postComposer.previewMuted;
        if (music) {
          music.muted = state.postComposer.previewMuted;
          syncPostPreviewMusic(video);
        }
        target.innerHTML = icon(state.postComposer.previewMuted ? 'mute' : 'volume');
        target.setAttribute('aria-label', state.postComposer.previewMuted ? 'Turn preview sound on' : 'Mute preview');
        target.setAttribute('aria-pressed', state.postComposer.previewMuted ? 'false' : 'true');
      }
      if (action === 'open-post-music') openMusicPicker('post');
      if (action === 'remove-post-music' && state.postComposer) {
        state.postComposer.music = null;
        updatePostComposerSlot();
      }
      if (action === 'open-home-video') openPostClip(target.dataset.postId, Number(target.dataset.mediaIndex || 0), target);
      if (action === 'toggle-home-video-sound') toggleHomeVideoSound(target);
      if (action === 'close-clip-viewer') closeClipViewer();
      if (action === 'toggle-clip-sound') toggleClipSound();
      if (action === 'post-carousel-previous') movePostCarousel(target.dataset.postId, -1);
      if (action === 'post-carousel-next') movePostCarousel(target.dataset.postId, 1);
      if (action === 'toggle-post-like') await togglePostAction(target.dataset.postId, 'like');
      if (action === 'toggle-post-save') await togglePostAction(target.dataset.postId, 'save');
      if (action === 'toggle-post-repost') await togglePostAction(target.dataset.postId, 'repost');
      if (action === 'share-post') await sharePost(target.dataset.postId);
      if (action === 'copy-post-link') await copyPostLink(target.dataset.postId);
      if (action === 'share-post-external') await sharePostExternally(target.dataset.postId);
      if (action === 'toggle-post-share-target' && state.actionSheet?.type === 'post-share') {
        const selected = new Set(state.actionSheet.selectedTargets || []);
        if (selected.has(target.dataset.targetKey)) selected.delete(target.dataset.targetKey);
        else selected.add(target.dataset.targetKey);
        state.actionSheet.selectedTargets = [...selected];
        updateActionSheetSlot();
      }
      if (action === 'send-shared-post') await sendSharedPost(target.dataset.postId);
      if (action === 'open-shared-post') await openSharedPost(target.dataset.postId);
      if (action === 'expand-post') {
        state.expandedPosts.add(target.dataset.postId);
        updateSidebar();
      }
      if (action === 'open-post-comments') {
        openActionSheet({
          type: 'post-comments',
          postId: target.dataset.postId,
          commentDraft: '',
          commentPosting: false,
          replyToCommentId: null,
          expandedCommentIds: []
        });
      }
      if (action === 'add-post-comment-emoji') {
        addPostCommentEmoji(target.dataset.emoji || '', target);
      }
      if (action === 'toggle-post-comment-like') {
        await togglePostCommentLike(target.dataset.postId, target.dataset.commentId);
      }
      if (action === 'toggle-post-comment-pin') {
        await togglePostCommentPin(target.dataset.postId, target.dataset.commentId);
      }
      if (action === 'delete-post-comment') {
        if (confirm('Delete this comment?')) await deletePostComment(target.dataset.postId, target.dataset.commentId);
      }
      if (action === 'reply-post-comment') {
        beginPostCommentReply(target.dataset.postId, target.dataset.commentId);
      }
      if (action === 'clear-post-comment-reply') {
        clearPostCommentReply();
      }
      if (action === 'toggle-post-comment-replies') {
        togglePostCommentReplies(target.dataset.commentId);
      }
      if (action === 'open-explore-post' || action === 'open-profile-post') {
        const post = postById(target.dataset.postId);
        if (post) {
          state.homeFeed = [post, ...state.homeFeed.filter((item) => item.id !== post.id)];
          switchMainTab('home');
          setTimeout(() => document.querySelector(`.feed-post[data-post-id="${window.CSS?.escape ? CSS.escape(post.id) : post.id}"]`)?.scrollIntoView({ block: 'start' }), 0);
        }
      }
      if (action === 'post-owner-menu') openActionSheet({ type: 'post-owner', postId: target.dataset.postId });
      if (action === 'post-options') openActionSheet({ type: 'post-options', postId: target.dataset.postId });
      if (action === 'delete-post') {
        if (confirm('Delete this post forever?')) await deletePost(target.dataset.postId);
      }
      if (action === 'set-profile-media-tab') {
        const own = target.dataset.own === 'true';
        const tab = ['posts', 'saved', 'reposts', 'tagged'].includes(target.dataset.tab) ? target.dataset.tab : 'posts';
        if (own) state.profileMediaTab = tab;
        else state.searchProfileMediaTab = tab;
        const user = own ? state.me : state.publicProfile;
        const section = target.closest('.profile-media-section');
        section?.classList.add('is-loading');
        section?.querySelectorAll('[data-action="set-profile-media-tab"]').forEach((button) => {
          const active = button.dataset.tab === tab;
          button.classList.toggle('active', active);
          button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        let loadError = null;
        try {
          await loadProfilePosts(user, tab, { render: false });
        } catch (error) {
          loadError = error;
        }
        const currentTab = own ? state.profileMediaTab : state.searchProfileMediaTab;
        if (currentTab === tab && !updateProfileMediaSection(user, own)) {
          if (own) updateSidebar();
          else if (!updateChatPane()) updateSidebar();
        }
        section?.classList.remove('is-loading');
        if (loadError && tab !== 'saved') throw loadError;
      }
      if (action === 'open-profile-menu') openActionSheet({ type: 'profile-user', userId: target.dataset.userId });
      if (action === 'toggle-favorite-user') await toggleFavoriteUser(target.dataset.userId);
      if (action === 'open-note-composer') openNoteComposer();
      if (action === 'close-note-composer') {
        if (state.noteRecording) stopNoteRecording();
        state.noteComposer = null;
        updateNoteComposerSlot();
      }
      if (action === 'choose-note-audio') document.getElementById('note-audio-input')?.click();
      if (action === 'open-note-music') openMusicPicker('note');
      if (action === 'remove-note-music' && state.noteComposer) {
        state.noteComposer.music = null;
        updateNoteComposerSlot();
      }
      if (action === 'toggle-note-local-preview') {
        const audio = document.getElementById('note-composer-audio');
        if (!audio) return;
        if (audio.paused) await audio.play().catch(() => {});
        else audio.pause();
        target.innerHTML = icon(audio.paused ? 'play' : 'pause');
        target.setAttribute('aria-label', audio.paused ? 'Play original audio' : 'Pause original audio');
        target.setAttribute('aria-pressed', audio.paused ? 'false' : 'true');
        audio.onended = () => {
          target.innerHTML = icon('play');
          target.setAttribute('aria-label', 'Play original audio');
          target.setAttribute('aria-pressed', 'false');
        };
      }
      if (action === 'remove-note-audio' && state.noteComposer) {
        state.noteComposer.audio = null;
        state.noteComposer.audioTitle = '';
        state.noteComposer.audioArtist = '';
        updateNoteComposerSlot();
      }
      if (action === 'start-note-recording') await startNoteRecording();
      if (action === 'stop-note-recording') stopNoteRecording();
      if (action === 'share-note') await shareNote();
      if (action === 'delete-note') await deleteNote();
      if (action === 'play-note') playNote(target.dataset.noteId);
      if (action === 'close-music-picker') closeMusicPicker();
      if (action === 'music-picker-back' && state.musicPicker) {
        document.getElementById('music-picker-audio')?.pause?.();
        state.musicPicker.selected = null;
        updateMusicPickerSlot();
        if (!state.musicPicker.tracks?.length) await searchMusicCatalog(state.musicPicker.query);
      }
      if (action === 'select-music-track') selectMusicTrack(target.dataset.trackId);
      if (action === 'preview-music-track') previewMusicTrack(target.dataset.trackId, target);
      if (action === 'toggle-music-segment-preview') toggleMusicSegmentPreview();
      if (action === 'set-music-duration' && state.musicPicker?.selected) {
        state.musicPicker.clipDuration = Math.min(Number(target.dataset.duration || 30), Number(state.musicPicker.selected.trackDuration || 30));
        state.musicPicker.start = Math.min(Number(state.musicPicker.start || 0), Math.max(0, Number(state.musicPicker.selected.trackDuration || 0) - state.musicPicker.clipDuration));
        updateMusicPickerSlot();
      }
      if (action === 'apply-music-selection') applyMusicSelection();
      if (action === 'music-category' && state.musicPicker) {
        state.musicPicker.query = target.dataset.query || '';
        await searchMusicCatalog(state.musicPicker.query);
      }
      if (action === 'retry-music-search' && state.musicPicker) await searchMusicCatalog(state.musicPicker.query);
      if (action === 'clear-music-search' && state.musicPicker) {
        state.musicPicker.query = '';
        await searchMusicCatalog('');
      }
      if (action === 'retry-chat-gif-search') await loadChatGifResults(state.chatGifQuery);
      if (action === 'open-chat') {
        if (state.longPressTriggered) {
          state.longPressTriggered = false;
          return;
        }
        await openChat(target.dataset.userId, target.dataset.messageId || null);
      }
      if (action === 'open-group') {
        await openGroup(target.dataset.groupId, target.dataset.messageId || null);
      }
      if (action === 'new-group') {
        state.groupComposer = { mode: 'create', selected: [], name: '', query: '' };
        updateGroupComposerSlot();
      }
      if (action === 'close-group-composer') {
        state.groupComposer = null;
        updateGroupComposerSlot();
      }
      if (action === 'toggle-group-person' && state.groupComposer) {
        const selected = new Set(state.groupComposer.selected || []);
        if (selected.has(target.dataset.userId)) selected.delete(target.dataset.userId);
        else selected.add(target.dataset.userId);
        state.groupComposer.selected = [...selected];
        syncGroupComposerSelection();
      }
      if (action === 'create-group') await createGroup();
      if (action === 'add-group-people') {
        state.groupComposer = { mode: 'add', selected: [], query: '' };
        updateGroupComposerSlot();
      }
      if (action === 'confirm-add-group-people') await addGroupPeople();
      if (action === 'edit-group') {
        state.groupComposer = { mode: 'edit', name: state.activeGroup?.name || '', avatarPreview: null, avatarFile: null };
        updateGroupComposerSlot();
      }
      if (action === 'choose-group-avatar') document.getElementById('group-avatar-input')?.click();
      if (action === 'save-group-edit') await saveGroupEdit();
      if (action === 'toggle-group-member-adds') await updateGroupSettings({ membersCanAdd: target.checked });
      if (action === 'group-member-menu') openActionSheet({ type: 'group-member', userId: target.dataset.userId });
      if (action === 'manage-group-member') {
        const label = target.dataset.memberAction === 'remove' ? 'Remove this person from the group?' : 'Change this member’s admin role?';
        if (confirm(label)) await manageGroupMember(target.dataset.userId, target.dataset.memberAction);
      }
      if (action === 'leave-group') {
        if (confirm('Leave this group? You will no longer receive its messages.')) await leaveGroup();
      }
      if (action === 'back') {
        navigationBackOr(() => {
          rememberActiveConversation();
          state.activePeer = null;
          state.activeGroup = null;
          state.chatLoading = false;
          state.chatOpenToken += 1;
          state.tab = 'chats';
          state.lastTab = 'chats';
          state.chatProfileOpen = false;
          state.chatProfileSocialView = null;
          state.chatReturnAnimation = true;
          renderApp();
        });
      }
      if (action === 'open-chat-profile') {
        if (state.activePeer) rememberViewedProfile(state.activePeer);
        beginDetailNavigation('chat-profile');
        state.chatProfileOpen = true;
        state.chatProfileSocialView = null;
        renderApp();
      }
      if (action === 'open-chat-customization') {
        state.chatCustomizationOpen = true;
        updateChatCustomizationSlot();
      }
      if (action === 'close-chat-customization') {
        state.chatCustomizationOpen = false;
        updateChatCustomizationSlot();
      }
      if (action === 'reset-chat-appearance') {
        await updateChatAppearance(defaultChatAppearance());
      }
      if (action === 'set-chat-theme') {
        const preset = chatThemePresets().find(([theme]) => theme === target.dataset.theme);
        if (preset) {
          const [theme, , mineColor, theirsColor, background, backgroundColor] = preset;
          await updateChatAppearance({ theme, mineColor, theirsColor, background, backgroundColor });
        }
      }
      if (action === 'set-chat-background') {
        const background = target.dataset.background;
        const option = chatBackgroundOptions().find(([value]) => value === background);
        if (option) await updateChatAppearance({ theme: 'custom', background, backgroundColor: option[2] });
      }
      if (action === 'close-chat-profile') {
        navigationBackOr(() => {
          state.chatProfileOpen = false;
          state.chatProfileSocialView = null;
          state.chatReturnAnimation = true;
          renderApp();
        });
      }
      if (action === 'send-text') {
        await sendCurrentText();
      }
      if (action === 'attach-open') {
        openCameraCapture('chat', {}, target);
      }
      if (action === 'close-camera-capture') {
        closeCameraCapture();
      }
      if (action === 'camera-flip') {
        await flipCameraCapture();
      }
      if (action === 'open-camera-gallery') {
        chooseCameraLibrary();
      }
      if (action === 'camera-shutter') {
        await captureCameraPhoto();
      }
      if (action === 'camera-use-text') {
        const publishAsHighlight = Boolean(state.cameraCapture?.publishAsHighlight);
        closeCameraCapture({ immediate: true });
        beginBlankStoryEditor({ publishAsHighlight });
      }
      if (action === 'sticker-toggle') {
        const opening = !state.stickerPanel;
        state.stickerPanel = opening;
        if (opening) {
          document.activeElement?.blur?.();
          document.documentElement.classList.remove('keyboard-open');
          sendTypingSignal(false);
        }
        updateChatFooter({ suppressFocus: opening });
      }
      if (action === 'set-chat-tray') {
        state.chatTrayTab = target.dataset.tray === 'gifs' ? 'gifs' : 'stickers';
        if (state.chatTrayTab === 'gifs') await Promise.all([loadGifPool(), loadChatGifResults(state.chatGifQuery)]);
        document.activeElement?.blur?.();
        updateChatFooter({ suppressFocus: true });
      }
      if (action === 'sticker-file-open') {
        document.getElementById('sticker-file-input')?.click();
      }
      if (action === 'open-sticker-creator' || action === 'create-text-sticker') {
        createTextSticker();
      }
      if (action === 'close-sticker-creator') {
        state.stickerCreator = null;
        updateStickerCreatorSlot();
      }
      if (action === 'save-text-sticker') {
        await saveTextSticker();
      }
      if (action === 'sticker-creator-panel' && state.stickerCreator) {
        state.stickerCreator.panel = target.dataset.panel || 'font';
        updateStickerCreatorSlot();
      }
      if (action === 'sticker-creator-font' && state.stickerCreator) {
        state.stickerCreator.textFont = target.dataset.font || 'system';
        updateStickerCreatorSlot();
      }
      if (action === 'sticker-creator-color' && state.stickerCreator) {
        state.stickerCreator.textColor = target.dataset.color || '#ffffff';
        updateStickerCreatorSlot();
      }
      if (action === 'sticker-creator-effect' && state.stickerCreator) {
        state.stickerCreator.textEffect = target.dataset.effect || 'shadow';
        updateStickerCreatorSlot();
      }
      if (action === 'sticker-creator-animation' && state.stickerCreator) {
        state.stickerCreator.textAnimation = target.dataset.animation || 'none';
        updateStickerCreatorSlot();
      }
      if (action === 'cycle-sticker-align' && state.stickerCreator) {
        const alignments = ['left', 'center', 'right'];
        state.stickerCreator.textAlign = alignments[(alignments.indexOf(state.stickerCreator.textAlign) + 1) % alignments.length];
        updateStickerCreatorSlot();
      }
      if (action === 'toggle-sticker-bg' && state.stickerCreator) {
        state.stickerCreator.textBgEnabled = !state.stickerCreator.textBgEnabled;
        updateStickerCreatorSlot();
      }
      if (action === 'toggle-sticker-frame' && state.stickerCreator) {
        state.stickerCreator.textFrame = !state.stickerCreator.textFrame;
        updateStickerCreatorSlot();
      }
      if (action === 'chat-gif-upload') {
        document.getElementById('chat-gif-input')?.click();
      }
      if (action === 'send-sticker') {
        await sendSticker(target.dataset.stickerId);
      }
      if (action === 'send-gif') {
        await sendGif(target.dataset.gifId);
      }
      if (action === 'download-sticker') {
        await downloadSticker(target.dataset.messageId);
      }
      if (action === 'open-sticker-save') {
        const message = state.messages.find((item) => item.id === target.dataset.messageId);
        if (message?.stickerId && state.stickerMap.has(message.stickerId)) {
          state.stickerSavePrompt = { messageId: message.id, stickerId: message.stickerId };
          updateStickerManagerSlot();
        }
      }
      if (action === 'close-sticker-save') {
        state.stickerSavePrompt = null;
        updateStickerManagerSlot();
      }
      if (action === 'select-sticker-set') {
        state.activeStickerSet = target.dataset.setId || 'all';
        updateChatFooter({ suppressFocus: true });
      }
      if (action === 'new-sticker-set') {
        const initialStickerId = target.dataset.stickerId || null;
        state.stickerSavePrompt = null;
        state.stickerSetEditor = { id: null, name: '', stickerIds: initialStickerId ? [initialStickerId] : [] };
        updateStickerManagerSlot();
      }
      if (action === 'edit-sticker-set') {
        const set = state.stickerSets.find((item) => item.id === target.dataset.setId);
        if (set) {
          state.stickerSetEditor = { id: set.id, name: set.name, stickerIds: [...set.stickerIds] };
          updateStickerManagerSlot();
        }
      }
      if (action === 'close-sticker-manager') {
        state.stickerSetEditor = null;
        updateStickerManagerSlot();
      }
      if (action === 'toggle-sticker-set-item' && state.stickerSetEditor) {
        const stickerId = target.dataset.stickerId;
        const selected = new Set(state.stickerSetEditor.stickerIds || []);
        if (selected.has(stickerId)) selected.delete(stickerId);
        else selected.add(stickerId);
        state.stickerSetEditor.stickerIds = Array.from(selected);
        updateStickerManagerSlot();
      }
      if (action === 'save-sticker-set' && state.stickerSetEditor) {
        const name = (document.getElementById('sticker-set-name')?.value || state.stickerSetEditor.name || '').trim().slice(0, 30);
        if (!name) throw new Error('Give the sticker set a name.');
        const editor = state.stickerSetEditor;
        const set = { id: editor.id || `set_${cryptoRandom()}`, name, stickerIds: Array.from(new Set(editor.stickerIds || [])) };
        state.stickerSets = [set, ...state.stickerSets.filter((item) => item.id !== set.id)].slice(0, 24);
        state.activeStickerSet = set.id;
        saveStickerSets();
        state.stickerSetEditor = null;
        updateStickerManagerSlot();
        updateChatFooter({ suppressFocus: true });
      }
      if (action === 'delete-sticker-set') {
        if (confirm('Delete this sticker set? The stickers stay saved on your device.')) {
          state.stickerSets = state.stickerSets.filter((item) => item.id !== target.dataset.setId);
          state.activeStickerSet = 'all';
          saveStickerSets();
          state.stickerSetEditor = null;
          updateStickerManagerSlot();
          updateChatFooter({ suppressFocus: true });
        }
      }
      if (action === 'toggle-sticker-in-set') {
        const set = state.stickerSets.find((item) => item.id === target.dataset.setId);
        if (set) {
          if (set.stickerIds.includes(target.dataset.stickerId)) set.stickerIds = set.stickerIds.filter((id) => id !== target.dataset.stickerId);
          else set.stickerIds.push(target.dataset.stickerId);
          saveStickerSets();
          updateStickerManagerSlot();
          updateChatFooter({ suppressFocus: true });
        }
      }
      if (action === 'open-media') {
        state.mediaViewer = { src: target.dataset.src, name: target.dataset.name || '', type: target.dataset.type || '' };
        updateMediaViewerSlot();
      }
      if (action === 'view-profile-picture') {
        state.mediaViewer = {
          src: target.dataset.src,
          name: target.dataset.name || 'Profile picture',
          type: 'image/*'
        };
        updateMediaViewerSlot();
      }
      if (action === 'close-media') {
        if (state.mediaViewer?.deepLinkPostId) {
          const url = new URL(location.href);
          url.searchParams.delete('post');
          history.replaceState(history.state, '', url.toString());
        }
        state.mediaViewer = null;
        updateMediaViewerSlot();
      }
      if (action === 'close-story-editor') {
        state.storyEditor = null;
        state.highlightComposer = null;
        state.storyVideoTrimDrag = null;
        storyTextPointers.clear();
        storyMediaPointers.clear();
        storyStickerPointers.clear();
        updateStoryEditorView();
        updateHighlightComposerSlot();
      }
      if (action === 'story-filter-panel') {
        if (state.storyEditor) state.storyEditor.filterPanel = target.dataset.panel || 'filters';
        updateStoryEditorView();
      }
      if (action === 'story-adjustment-select') {
        if (state.storyEditor) state.storyEditor.activeAdjustment = target.dataset.adjustment || 'brightness';
        updateStoryEditorView();
      }
      if (action === 'story-filter') {
        if (state.storyEditor) state.storyEditor.filter = target.dataset.filter || 'normal';
        target.closest('.story-filter-carousel')?.querySelectorAll('[data-action="story-filter"]').forEach((button) => {
          button.classList.toggle('active', button === target);
        });
        updateStoryMediaUi(false);
      }
      if (action === 'story-overlay-effect') {
        if (state.storyEditor) state.storyEditor.overlayEffect = target.dataset.effect || 'none';
        target.closest('.story-overlay-effects')?.querySelectorAll('[data-action="story-overlay-effect"]').forEach((button) => {
          button.classList.toggle('active', button === target);
        });
        updateStoryMediaUi();
      }
      if (action === 'story-background') {
        applyStoryBackground(target.dataset.background);
      }
      if (action === 'story-tool') {
        if (state.storyEditor) {
          const tool = target.dataset.tool || 'text';
          if (tool === 'text') {
            const closingText = state.storyEditor.activeTool === 'text' || state.storyEditor.textEditing;
            state.storyEditor.activeTool = closingText ? null : 'text';
            state.storyEditor.textEditing = !closingText;
          } else {
            state.storyEditor.textEditing = false;
            state.storyEditor.activeTool = state.storyEditor.activeTool === tool ? null : tool;
          }
          if (tool !== 'stickers') state.storyEditor.stickerComposer = null;
        }
        updateStoryEditorView();
      }
      if (action === 'story-pick-media') {
        document.getElementById('story-input')?.click();
      }
      if (action === 'story-video-play') {
        await toggleStoryVideoPlayback();
      }
      if (action === 'story-video-mute' && state.storyEditor?.isVideo) {
        state.storyEditor.videoMuted = !state.storyEditor.videoMuted;
        const video = document.getElementById('story-editor-video');
        if (video) video.muted = state.storyEditor.videoMuted;
        updateStoryVideoToolUi(true);
      }
      if (action === 'story-video-speed' && state.storyEditor?.isVideo) {
        const speeds = [0.5, 1, 1.5, 2];
        const current = speeds.indexOf(Number(state.storyEditor.videoSpeed || 1));
        state.storyEditor.videoSpeed = speeds[(current + 1) % speeds.length];
        const video = document.getElementById('story-editor-video');
        if (video) video.playbackRate = state.storyEditor.videoSpeed;
        updateStoryVideoToolUi(true);
      }
      if (action === 'story-video-fit' && state.storyEditor?.isVideo) {
        state.storyEditor.mediaFit = storyMediaFit(state.storyEditor) === 'cover' ? 'contain' : 'cover';
        updateStoryMediaTransformUi();
        updateStoryVideoToolUi(true);
      }
      if (action === 'story-video-rotate' && state.storyEditor?.isVideo) {
        state.storyEditor.mediaRotation = (Number(state.storyEditor.mediaRotation || 0) + 90) % 360;
        updateStoryMediaTransformUi();
      }
      if (action === 'story-video-reset-trim' && state.storyEditor?.isVideo) {
        state.storyEditor.trimStart = 0;
        state.storyEditor.trimEnd = Math.min(Number(state.storyEditor.videoDuration || 60), 60);
        state.storyEditor.videoCurrentTime = 0;
        const video = document.getElementById('story-editor-video');
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
        updateStoryVideoToolUi(true);
      }
      if (action === 'finish-story-tool') {
        if (state.storyEditor) {
          state.storyEditor.textEditing = false;
          state.storyEditor.activeTool = null;
          state.storyEditor.stickerComposer = null;
        }
        updateStoryEditorView();
      }
      if (action === 'cycle-story-text-align') {
        if (state.storyEditor) {
          const alignments = ['left', 'center', 'right'];
          const index = alignments.indexOf(state.storyEditor.textAlign || 'center');
          state.storyEditor.textAlign = alignments[(index + 1) % alignments.length];
        }
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'cycle-story-text-animation') {
        if (state.storyEditor) {
          const animations = ['none', 'fade', 'rise', 'pop', 'type', 'bounce', 'flicker', 'pulse'];
          const index = animations.indexOf(state.storyEditor.textAnimation || 'none');
          state.storyEditor.textAnimation = animations[(index + 1) % animations.length];
        }
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-panel') {
        if (state.storyEditor) {
          const panel = target.dataset.panel || 'font';
          state.storyEditor.textPanel = state.storyEditor.textPanel === panel && panel !== 'font' ? 'font' : panel;
        }
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-eyedropper') {
        await sampleStoryColor('text');
      }
      if (action === 'story-draw-eyedropper') {
        await sampleStoryColor('draw');
      }
      if (action === 'story-color') {
        if (state.storyEditor) state.storyEditor.textColor = target.dataset.color || '#ffffff';
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-bg-color') {
        if (state.storyEditor) {
          state.storyEditor.textBgColor = target.dataset.color || '#000000';
          state.storyEditor.textBgEnabled = true;
        }
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-font') {
        if (state.storyEditor) state.storyEditor.textFont = target.dataset.font || 'system';
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-align') {
        if (state.storyEditor) state.storyEditor.textAlign = target.dataset.align || 'center';
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-bg') {
        if (state.storyEditor) state.storyEditor.textBgEnabled = !state.storyEditor.textBgEnabled;
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-frame') {
        if (state.storyEditor) state.storyEditor.textFrame = !state.storyEditor.textFrame;
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-effect') {
        if (state.storyEditor) state.storyEditor.textEffect = target.dataset.effect || 'shadow';
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-text-animation') {
        if (state.storyEditor) state.storyEditor.textAnimation = target.dataset.animation || 'none';
        updateStoryTextUi();
        updateStoryTextComposerUi();
      }
      if (action === 'story-draw-color') {
        if (state.storyEditor) state.storyEditor.drawColor = target.dataset.color || '#ffffff';
        updateStoryEditorView();
      }
      if (action === 'story-draw-brush') {
        if (state.storyEditor) state.storyEditor.drawBrush = target.dataset.brush || 'pen';
        updateStoryEditorView();
      }
      if (action === 'undo-story-draw') {
        if (state.storyEditor) {
          state.storyEditor.drawings = (state.storyEditor.drawings || []).slice(0, -1);
          updateStoryDrawPreview();
        }
      }
      if (action === 'add-story-sticker') {
        addStorySticker(target.dataset.stickerType, target.dataset.stickerLabel || '');
      }
      if (action === 'choose-story-sticker') {
        if (state.storyEditor) {
          state.storyEditor.stickerComposer = target.dataset.stickerType || null;
          state.storyEditor.stickerDraft = '';
          if (state.storyEditor.stickerComposer === 'gif' && !state.gifPool.length) {
            loadGifPool().then(updateStoryEditorView).catch((error) => alert(error.message));
          }
        }
        updateStoryEditorView();
      }
      if (action === 'story-sticker-back') {
        if (state.storyEditor) state.storyEditor.stickerComposer = null;
        updateStoryEditorView();
      }
      if (action === 'commit-story-sticker') {
        addStorySticker(target.dataset.stickerType);
      }
      if (action === 'toggle-gif-submit' && state.storyEditor) {
        state.storyEditor.gifSubmitOpen = !state.storyEditor.gifSubmitOpen;
        updateStoryEditorView();
      }
      if (action === 'story-gif-file-open') {
        document.getElementById('story-gif-input')?.click();
      }
      if (action === 'add-gif-sticker') {
        addStorySticker('gif', target.dataset.gifTitle || 'GIF', {
          gifId: target.dataset.gifId || '',
          gifUrl: target.dataset.gifUrl || ''
        });
      }
      if (action === 'review-gif') {
        await reviewGif(target.dataset.gifId, target.dataset.decision);
      }
      if (action === 'select-story-location') {
        await selectStoryLocation({
          name: target.dataset.name || 'Location',
          region: target.dataset.region || '',
          latitude: Number(target.dataset.latitude),
          longitude: Number(target.dataset.longitude)
        }, target.dataset.locationType || 'location');
      }
      if (action === 'story-current-location') {
        await useCurrentStoryLocation(target.dataset.locationType || 'location');
      }
      if (action === 'use-typed-story-location' && state.storyEditor) {
        const label = state.storyEditor.locationQuery.trim();
        if (label) addStorySticker('location', label, { placeName: label });
      }
      if (action === 'add-selected-story-location' && state.storyEditor?.selectedLocation) {
        const location = state.storyEditor.selectedLocation;
        const locationData = {
          placeName: location.name || 'Location',
          region: location.region || '',
          latitude: Number(location.latitude || 0),
          longitude: Number(location.longitude || 0)
        };
        if (target.dataset.locationType === 'weather' && state.storyEditor.weatherDraft) {
          const weather = state.storyEditor.weatherDraft;
          addStorySticker('weather', `${Math.round(Number(weather.temperature || 0))} degrees`, { ...locationData, ...weather });
        } else {
          addStorySticker('location', location.name || 'Location', locationData);
        }
      }
      if (action === 'story-quiz-correct' && state.storyEditor) {
        state.storyEditor.quizCorrect = Number(target.dataset.index || 0);
        target.closest('.story-option-editor')?.querySelectorAll('[data-action="story-quiz-correct"]').forEach((button) => {
          button.classList.toggle('active', button === target);
        });
      }
      if (action === 'finish-story-quiz' && state.storyEditor) {
        const question = state.storyEditor.quizQuestion.trim();
        const options = [state.storyEditor.quizOptionA.trim(), state.storyEditor.quizOptionB.trim()].filter(Boolean);
        if (!question || options.length < 2) throw new Error('Add a question and two answers.');
        addStorySticker('quiz', question, { options, correctIndex: state.storyEditor.quizCorrect || 0 });
      }
      if (action === 'finish-story-slider' && state.storyEditor) {
        const question = state.storyEditor.sliderQuestion.trim();
        if (!question) throw new Error('Add a question for the slider.');
        addStorySticker('emoji_slider', question, { emoji: state.storyEditor.sliderEmoji || '\ud83d\ude0d' });
      }
      if (action === 'finish-story-countdown' && state.storyEditor) {
        const title = state.storyEditor.countdownTitle.trim();
        if (!title) throw new Error('Name the countdown.');
        const targetTime = new Date(state.storyEditor.countdownAt || '').getTime();
        if (!Number.isFinite(targetTime)) throw new Error('Choose a date and time.');
        const targetAt = new Date(targetTime).toISOString();
        addStorySticker('countdown', title, { targetAt });
      }
      if (action === 'finish-story-poll') {
        if (state.storyEditor) {
          state.storyEditor.stickerComposer = null;
          state.storyEditor.activeTool = null;
        }
        updateStoryEditorView();
      }
      if (action === 'story-audio-open') {
        document.getElementById('story-audio-input')?.click();
      }
      if (action === 'toggle-story-audio') {
        await toggleStoryAudio(target);
      }
      if (action === 'download-story-edit') {
        await downloadStoryEdit();
      }
      if (action === 'publish-story') {
        await publishStory();
      }
      if (action === 'publish-story-only') {
        await publishStory();
      }
      if (action === 'choose-highlight-for-new-story') {
        openHighlightComposer({ mode: 'target', source: 'editor' });
      }
      if (action === 'view-story') {
        await viewStory(target.dataset.storyId, target.dataset.highlightId || null);
      }
      if (action === 'close-story-viewer') {
        clearStoryAdvance();
        state.storyViewer = null;
        state.actionSheet = null;
        updateActionSheetSlot();
        updateStoryViewerView();
        updateSidebar();
      }
      if (action === 'open-story-owner-menu') {
        clearStoryAdvance();
        openActionSheet({ type: 'story-owner', storyId: target.dataset.storyId });
      }
      if (action === 'story-viewer-prev') {
        await navigateStory(-1);
      }
      if (action === 'story-viewer-next') {
        await navigateStory(1);
      }
      if (action === 'like-story') {
        await toggleStoryLike(target.dataset.storyId, target);
      }
      if (action === 'open-story-comments') {
        clearStoryAdvance();
        openActionSheet({
          type: 'story-comments',
          storyId: target.dataset.storyId,
          replyToCommentId: null,
          commentDraft: '',
          gifPickerOpen: false,
          gifQuery: '',
          commentPosting: false,
          postingGifId: null,
          pendingGifPool: null,
          expandedCommentIds: []
        });
      }
      if (action === 'submit-story-comment') {
        await submitStoryComment(target.dataset.storyId);
      }
      if (action === 'toggle-story-comment-gifs') {
        await toggleStoryCommentGifPicker();
      }
      if (action === 'send-story-comment-gif') {
        await submitStoryComment(target.dataset.storyId, { gifId: target.dataset.gifId, sourceButton: target });
      }
      if (action === 'add-story-comment-emoji') {
        addStoryCommentEmoji(target.dataset.emoji || '', target);
      }
      if (action === 'toggle-story-comment-replies') {
        toggleStoryCommentReplies(target.dataset.commentId);
      }
      if (action === 'reply-story-comment' && state.actionSheet?.type === 'story-comments' && !storyCommentPosting(state.actionSheet)) {
        const story = storyById(target.dataset.storyId);
        const comment = story?.comments?.find((item) => item.id === target.dataset.commentId);
        if (comment) {
          state.actionSheet.replyToCommentId = comment.id;
          state.actionSheet.commentDraft = `@${comment.user?.username || ''} `;
          updateStoryCommentsSheet({ focus: true });
        }
      }
      if (action === 'clear-comment-reply' && state.actionSheet?.type === 'story-comments' && !storyCommentPosting(state.actionSheet)) {
        const story = storyById(state.actionSheet.storyId);
        const replyingTo = story?.comments?.find((comment) => comment.id === state.actionSheet.replyToCommentId);
        const currentDraft = document.getElementById('story-comment-input')?.value || state.actionSheet.commentDraft || '';
        const replyPrefix = replyingTo ? `@${replyingTo.user?.username || ''} ` : '';
        state.actionSheet.replyToCommentId = null;
        state.actionSheet.commentDraft = replyPrefix && currentDraft.startsWith(replyPrefix)
          ? currentDraft.slice(replyPrefix.length)
          : currentDraft;
        updateStoryCommentsSheet({ focus: true });
      }
      if (action === 'like-story-comment') {
        await toggleStoryCommentLike(target.dataset.storyId, target.dataset.commentId);
      }
      if (action === 'respond-story-poll') {
        await respondToStorySticker(target.dataset.storyId, 'poll', target.dataset.value);
      }
      if (action === 'respond-story-sticker') {
        await respondToStorySticker(target.dataset.storyId, target.dataset.stickerId, target.dataset.value);
      }
      if (action === 'respond-story-text') {
        const story = storyById(target.dataset.storyId);
        const current = storyStickerResponse(story, target.dataset.stickerId).myValue || '';
        const response = prompt('Write your reply', current);
        if (response?.trim()) await respondToStorySticker(target.dataset.storyId, target.dataset.stickerId, response.trim());
      }
      if (action === 'toggle-voice') {
        const button = target.closest('.voice-note');
        const audio = button?.querySelector('audio');
        if (audio) {
          if (audio.paused) {
            document.querySelectorAll('.voice-note audio').forEach((item) => {
              if (item !== audio) {
                item.pause();
                item.closest('.voice-note')?.classList.remove('playing');
              }
            });
            await audio.play();
            button.classList.add('playing');
            audio.onended = () => button.classList.remove('playing');
          } else {
            audio.pause();
            button.classList.remove('playing');
          }
        }
      }
      if (action === 'close-message-focus') {
        closeMessageFocus();
      }
      if (action === 'message-focus-mode' && state.messageFocus) {
        setMessageFocusMode(target.dataset.mode);
      }
      if (action === 'react-message') {
        await reactToMessage(target.dataset.messageId, target.dataset.emoji || '\u2764\ufe0f');
      }
      if (action === 'focus-reply') {
        state.replyTo = state.messages.find((message) => message.id === target.dataset.messageId) || null;
        closeMessageFocus({ afterClose: () => updateChatFooter({ focus: true }) });
      }
      if (action === 'message-more') {
        const messageId = target.dataset.messageId;
        closeMessageFocus({ afterClose: () => openActionSheet({ type: 'message', messageId }) });
      }
      if (action === 'toggle-message-pin') {
        await toggleMessagePin(target.dataset.messageId);
      }
      if (action === 'hide-message') {
        await hideMessageForMe(target.dataset.messageId);
      }
      if (action === 'forward-message') {
        await forwardMessage(target.dataset.messageId, target.dataset.userId || null, target.dataset.groupId || null);
      }
      if (action === 'attach-message-sticker') {
        await attachStickerToMessage(target.dataset.messageId, target.dataset.stickerId);
      }
      if (action === 'reply-message') {
        state.replyTo = state.messages.find((message) => message.id === target.dataset.messageId) || null;
        updateChatFooter({ focus: true });
      }
      if (action === 'clear-reply') {
        state.replyTo = null;
        updateChatFooter({ focus: true });
      }
      if (action === 'delete-message') {
        state.actionSheet = null;
        if (confirm('Unsend this message for everyone?')) await deleteMessage(target.dataset.messageId);
      }
      if (action === 'download-message-file') {
        const message = state.messages.find((item) => item.id === target.dataset.messageId);
        if (message?.attachment) location.href = message.attachment.downloadUrl;
        state.actionSheet = null;
        renderApp();
      }
      if (action === 'download-meta') {
        await downloadMeta(target.dataset.messageId);
        state.actionSheet = null;
        renderApp();
      }
      if (action === 'download-file-meta') {
        await downloadFileAndMeta(target.dataset.messageId);
        state.actionSheet = null;
        renderApp();
      }
      if (action === 'open-report') {
        openActionSheet({
          type: 'report',
          targetType: target.dataset.reportType === 'message' ? 'message' : 'user',
          userId: target.dataset.userId || null,
          messageId: target.dataset.messageId || null
        });
      }
      if (action === 'submit-report') {
        await submitReport({
          targetType: target.dataset.reportType === 'message' ? 'message' : 'user',
          userId: target.dataset.userId || null,
          messageId: target.dataset.messageId || null,
          reason: target.dataset.reason
        });
      }
      if (action === 'export-chat') {
        exportChat(target.dataset.format);
      }
      if (action === 'add-contact') {
        await addContact(target.dataset.username);
      }
      if (action === 'view-own-profile') {
        openOwnProfileFromStoryComments();
      }
      if (action === 'view-user-profile') {
        if (target.closest('.story-comment-row')) {
          clearStoryAdvance();
          state.actionSheet = null;
          state.storyViewer = null;
          updateActionSheetSlot();
          updateStoryViewerView();
        }
        if (state.actionSheet?.type === 'post-options') {
          state.actionSheet = null;
          state.overlayClosing = false;
          updateActionSheetSlot();
        }
        await openSearchProfile(target.dataset.username);
      }
      if (action === 'close-search-profile') {
        closeSearchProfileNavigation();
      }
      if (action === 'open-search-social') {
        openSocialView('search', target.dataset.social === 'following' ? 'following' : 'followers');
      }
      if (action === 'close-search-social') {
        navigationBackOr(() => {
          state.searchProfileSocialView = null;
          renderApp();
        });
      }
      if (action === 'clear-user-search') {
        clearTimeout(searchTimer);
        userSearchId += 1;
        state.userQuery = '';
        state.userSearching = false;
        state.searchResults = [];
        renderSidebarState();
        setTimeout(focusUserSearch, 0);
      }
      if (action === 'accept-request') {
        await acceptRequest(target.dataset.requestId);
      }
      if (action === 'decline-request') {
        await declineRequest(target.dataset.requestId);
      }
      if (action === 'open-notifications') {
        beginDetailNavigation('notifications');
        state.lastTab = state.tab;
        state.tabTransition = true;
        state.tabDirection = 'right';
        state.tab = 'notifications';
        await refreshChatsOnly();
        renderApp();
      }
      if (action === 'back-from-notifications') {
        navigationBackOr(() => {
          state.tabTransition = true;
          state.tabDirection = 'left';
          state.tab = state.lastTab === 'notifications' ? 'home' : (state.lastTab || 'home');
          renderApp();
        });
      }
      if (action === 'close-overlays') {
        closeOverlays();
      }
      if (action === 'copy-profile-link') {
        await copyTextToClipboard(target.dataset.link);
        target.textContent = 'Copied';
      }
      if (action === 'show-profile-link') {
        openActionSheet({ type: 'profile-link', link: target.dataset.link });
      }
      if (action === 'open-profile-edit') {
        state.profileEditOpen = true;
        updateProfileModalSlots();
      }
      if (action === 'open-settings') {
        openSettingsDrawer();
      }
      if (action === 'open-settings-section') await openSettingsSection(target.dataset.section);
      if (action === 'settings-back') {
        state.settingsSection = 'main';
        updateProfileModalSlots();
      }
      if (action === 'resend-email-verification') {
        const data = await api('/api/account/email/verification', { method: 'POST' });
        Object.assign(state.me, data.account || {});
        updateProfileModalSlots();
        pushToast({ key: `verify-email-${Date.now()}`, kind: 'social', title: data.sent ? 'Verification sent' : 'Verification queued', body: data.sent ? 'Check your inbox for the confirmation link.' : 'Email delivery needs server mail configuration.' });
      }
      if (action === 'settings-unblock-user') {
        await unblockUser(target.dataset.userId);
        const data = await api('/api/account/blocked');
        state.blockedUsers = data.users || [];
        state.settingsOpen = true;
        state.settingsSection = 'blocked';
        updateProfileModalSlots();
      }
      if (action === 'toggle-global-reposts') {
        await updateProfilePatch({ allowReposts: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'open-activity-post') {
        const post = postById(target.dataset.postId) || [...state.accountActivity.comments, ...state.accountActivity.reposts].find((item) => item.post?.id === target.dataset.postId)?.post;
        if (post) {
          closeSettingsDrawer();
          state.homeFeed = [post, ...state.homeFeed.filter((item) => item.id !== post.id)];
          switchMainTab('home');
        }
      }
      if (action === 'close-modal') {
        state.profileEditOpen = false;
        updateProfileModalSlots();
      }
      if (action === 'close-settings') {
        closeSettingsDrawer();
      }
      if (action === 'toggle-recommendations') {
        state.recommendationsOpen = !state.recommendationsOpen;
        updateRecommendationsSection();
      }
      if (action === 'recommendation-see-all') {
        state.userQuery = '';
        state.searchResults = [];
        state.userSearching = false;
        switchMainTab('search');
      }
      if (action === 'dismiss-recommendation') {
        if (confirm('Never show this recommendation again?')) {
          state.hiddenRecommendations = Array.from(new Set([...(state.hiddenRecommendations || []), target.dataset.userId]));
          localStorage.setItem('hiddenRecommendations', JSON.stringify(state.hiddenRecommendations));
          const recommendation = target.closest('.recommend-card, .account-row');
          recommendation?.classList.add('recommendation-removing');
          setTimeout(() => recommendation?.remove(), 180);
        }
      }
      if (action === 'toggle-account-private') {
        await updateProfilePatch({ socialPublic: !target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-avatar-viewable') {
        await updateProfilePatch({ avatarViewable: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-profile-searchable') {
        await updateProfilePatch({ searchable: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-profile-recommendable') {
        await updateProfilePatch({ recommendable: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-group-invites') {
        await updateProfilePatch({ allowGroupAdds: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-message-notifications') {
        await setMessageNotifications(target.checked);
      }
      if (action === 'enable-notifications') {
        await setMessageNotifications(true);
      }
      if (action === 'dismiss-notification-prompt') {
        state.notificationPromptDismissed = true;
        sessionStorage.setItem('notificationPromptDismissed', '1');
        updateSidebar();
      }
      if (action === 'dismiss-toast') {
        dismissToast(target.dataset.toastId);
      }
      if (action === 'open-toast') {
        const toast = state.toasts.find((item) => item.id === target.dataset.toastId);
        if (toast) {
          dismissToast(toast.id);
          if (toast.kind === 'message' && toast.groupId) await openGroup(toast.groupId);
          else if (toast.kind === 'message' && toast.userId) await openChat(toast.userId);
          else {
            beginDetailNavigation('notifications');
            state.lastTab = state.tab;
            state.tab = 'notifications';
            await refreshChatsOnly();
            renderApp();
          }
        }
      }
      if (action === 'open-social') {
        openSocialView('profile', target.dataset.social === 'following' ? 'following' : 'followers');
      }
      if (action === 'close-social') {
        navigationBackOr(() => {
          state.profileSocialView = null;
          renderApp();
        });
      }
      if (action === 'open-peer-social') {
        openSocialView('peer', target.dataset.social === 'following' ? 'following' : 'followers');
      }
      if (action === 'close-peer-social') {
        navigationBackOr(() => {
          state.chatProfileSocialView = null;
          renderApp();
        });
      }
      if (action === 'open-story-create') {
        state.actionSheet = null;
        state.overlayClosing = false;
        updateActionSheetSlot();
        openCameraCapture('story', { publishAsHighlight: target.dataset.highlight === 'true' }, target);
      }
      if (action === 'open-highlight-composer') {
        openHighlightComposer();
      }
      if (action === 'open-highlight-archive') {
        state.highlightComposer = { mode: 'archive' };
        updateHighlightComposerSlot();
      }
      if (action === 'close-highlight-composer') {
        state.highlightComposer = null;
        updateHighlightComposerSlot();
      }
      if (action === 'highlight-composer-back') {
        state.highlightComposer = { mode: 'source' };
        updateHighlightComposerSlot();
      }
      if (action === 'highlight-create-story') {
        state.highlightComposer = null;
        updateHighlightComposerSlot();
        openCameraCapture('story', { publishAsHighlight: true }, target);
      }
      if (action === 'select-highlight-story') {
        state.highlightComposer = { mode: 'target', source: 'existing', storyId: target.dataset.storyId };
        updateHighlightComposerSlot();
      }
      if (action === 'choose-highlight-target') {
        const composer = state.highlightComposer;
        if (composer?.source === 'editor') await publishStory({ highlightId: target.dataset.highlightId });
        else if (composer?.storyId) await addStoryToHighlightCollection(composer.storyId, target.dataset.highlightId);
      }
      if (action === 'create-highlight-target') {
        await createHighlightTarget(document.getElementById('highlight-new-name')?.value);
      }
      if (action === 'rename-highlight') {
        const highlight = highlightById(state.me, target.dataset.highlightId);
        if (highlight) openHighlightComposer({
          mode: 'rename',
          highlightId: highlight.id,
          title: highlight.title || 'Highlight'
        });
      }
      if (action === 'save-highlight-name') {
        await renameHighlight(target.dataset.highlightId, document.getElementById('highlight-rename-input')?.value);
      }
      if (action === 'delete-highlight') {
        if (confirm('Delete this highlight? Stories that are not saved elsewhere will leave your archive.')) {
          const data = await api(`/api/highlights/${encodeURIComponent(target.dataset.highlightId)}`, { method: 'DELETE' });
          state.me = data.user;
          state.highlightComposer = { mode: 'archive' };
          updateHighlightComposerSlot();
          updateSidebar();
        }
      }
      if (action === 'change-profile-picture') {
        document.getElementById('avatar-input')?.click();
      }
      if (action === 'cancel-avatar-crop') {
        state.avatarCrop = null;
        updateProfileModalSlots();
      }
      if (action === 'confirm-avatar-crop') {
        await confirmAvatarCrop();
      }
      if (action === 'save-story') {
        await saveStory(target.dataset.storyId);
      }
      if (action === 'delete-story') {
        if (confirm('Delete this story forever?')) await deleteStory(target.dataset.storyId);
      }
      if (action === 'mute-menu') {
        openActionSheet({ type: 'mute', peerId: target.dataset.userId });
      }
      if (action === 'set-mute') {
        await setMuteFor(target.dataset.userId, target.dataset.minutes);
      }
      if (action === 'remove-friend') {
        if (confirm('Remove this friend? The chat stays archived on the server and returns if you add each other again. Following and followers stay unchanged.')) await removeFriend(target.dataset.userId);
      }
      if (action === 'follow-user') {
        await setFollowing(target.dataset.userId, true);
      }
      if (action === 'unfollow-user') {
        if (confirm('Unfollow this user? They stay in your friends and followers unless you remove those separately.')) await setFollowing(target.dataset.userId, false);
      }
      if (action === 'remove-follower') {
        if (confirm('Remove this follower? You will still follow them unless you unfollow separately.')) await removeFollower(target.dataset.userId);
      }
      if (action === 'block-user') {
        if (confirm('Block this user? Messaging will be blocked until you unblock them.')) await blockUser(target.dataset.userId);
      }
      if (action === 'unblock-user') {
        await unblockUser(target.dataset.userId);
      }
      if (action === 'setup-2fa') {
        await setupTwoFactor();
      }
      if (action === 'enable-2fa') {
        await enableTwoFactor();
      }
      if (action === 'disable-2fa') {
        await disableTwoFactor();
      }
      if (action === 'audio-call') {
        await startCall(false);
      }
      if (action === 'video-call') {
        await startCall(true);
      }
      if (action === 'accept-call') {
        await acceptCall();
      }
      if (action === 'reject-call') {
        await rejectCall();
      }
      if (action === 'hangup-call') {
        await endCall(true);
      }
    } catch (error) {
      alert(error.message || 'Something went wrong.');
    }
  });

  document.addEventListener('change', async (event) => {
    try {
      if (event.target.id === 'file-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file && state.cameraCapture?.mode === 'chat') closeCameraCapture({ immediate: true });
        await sendFile(file);
      }
      if (event.target.id === 'sticker-file-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await createImageSticker(file);
      }
      if (event.target.id === 'chat-gif-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await submitChatGif(file);
      }
      if (event.target.id === 'group-avatar-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file && state.groupComposer?.mode === 'edit') {
          const dataUrl = await fileToDataUrl(file);
          state.groupComposer.avatarPreview = dataUrl;
          state.groupComposer.avatarFile = {
            name: file.name || 'group-picture.jpg',
            type: file.type || 'image/jpeg',
            dataUrl,
            lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
          };
          updateGroupComposerSlot();
        }
      }
      if (event.target.id === 'chat-background-color') {
        await updateChatAppearance({ theme: 'custom', background: 'custom', backgroundColor: event.target.value });
      }
      if (event.target.id === 'chat-mine-color') {
        await updateChatAppearance({ theme: 'custom', mineColor: event.target.value });
      }
      if (event.target.id === 'chat-theirs-color') {
        await updateChatAppearance({ theme: 'custom', theirsColor: event.target.value });
      }
      if (event.target.id === 'avatar-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await beginAvatarCrop(file);
      }
      if (event.target.id === 'post-input') {
        const files = Array.from(event.target.files || []);
        const file = files[0];
        event.target.value = '';
        if (files.length) {
          try {
            if (postMediaPickerMode === 'append' && state.postComposer) await appendPostComposerMedia(files);
            else if (files.length === 1) await beginPostComposer(file);
            else await beginPostComposer(files);
          } catch (error) {
            showPostSelectionError(error);
          } finally {
            postMediaPickerMode = 'replace';
          }
        }
        return;
      }
      if (event.target.id === 'note-audio-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await chooseNoteAudio(file);
      }
      if (event.target.id === 'story-input') {
        const file = event.target.files[0];
        event.target.value = '';
        const publishAsHighlight = state.cameraCapture?.mode === 'story'
          ? state.cameraCapture.publishAsHighlight
          : undefined;
        if (file && state.cameraCapture?.mode === 'story') closeCameraCapture({ immediate: true });
        if (file) await beginStoryEditor(file, publishAsHighlight === undefined ? {} : { publishAsHighlight });
      }
      if (event.target.id === 'story-audio-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await beginStoryAudio(file);
      }
      if (event.target.id === 'story-gif-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await submitGif(file);
      }
      if (event.target.matches('[data-profile-setting]')) {
        const setting = event.target.dataset.profileSetting;
        if (['mentionPermission', 'storyReplies', 'friendRequests'].includes(setting)) {
          await updateProfilePatch({ [setting]: event.target.value });
          updateProfileModalSlots();
        }
      }
      if (event.target.matches('[data-story-slider]')) {
        await respondToStorySticker(event.target.dataset.storyId, event.target.dataset.stickerId, Number(event.target.value));
      }
    } catch (error) {
      alert(error.message);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-post-preview-progress]')) {
      const video = event.target.closest('.post-composer-media')?.querySelector('video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = clamp(Number(event.target.value || 0) / 1000, 0, 1) * video.duration;
        syncPostPreviewUi(video);
        syncPostPreviewMusic(video);
      }
      return;
    }
    if (event.target.id === 'music-search' && state.musicPicker) {
      state.musicPicker.query = event.target.value.slice(0, 80);
      const clear = event.target.closest('.music-search-field')?.querySelector('[data-action="clear-music-search"]');
      if (clear) clear.hidden = !state.musicPicker.query;
      clearTimeout(musicSearchTimer);
      musicSearchTimer = setTimeout(() => {
        searchMusicCatalog(state.musicPicker?.query || '').catch(() => {});
      }, 300);
      return;
    }
    if (event.target.matches('[data-music-segment-start]') && state.musicPicker?.selected) {
      updateMusicSegmentStart(event.target.value);
      return;
    }
    if (event.target.id === 'post-share-search' && state.actionSheet?.type === 'post-share') {
      state.actionSheet.query = event.target.value.slice(0, 80);
      const term = state.actionSheet.query.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.post-share-person').forEach((button) => {
        button.hidden = Boolean(term && !String(button.dataset.shareSearch || '').includes(term));
        if (!button.hidden) visible += 1;
      });
      const empty = document.querySelector('.post-share-empty');
      if (empty) empty.hidden = visible > 0;
      return;
    }
    if (event.target.matches('[data-post-crop]') && state.postComposer) {
      const key = event.target.dataset.postCrop;
      state.postComposer.crop[key] = Number(event.target.value);
      updatePostComposerMediaStyle();
      return;
    }
    if (event.target.matches('[data-post-adjust]') && state.postComposer) {
      const key = event.target.dataset.postAdjust;
      state.postComposer.adjustments[key] = Number(event.target.value);
      const output = event.target.closest('label')?.querySelector('output');
      if (output) output.textContent = event.target.value;
      updatePostComposerMediaStyle();
      return;
    }
    if (event.target.id === 'post-title' && state.postComposer) {
      state.postComposer.title = event.target.value.slice(0, 100);
      return;
    }
    if (event.target.id === 'post-description' && state.postComposer) {
      state.postComposer.description = event.target.value.slice(0, 2200);
      return;
    }
    if (event.target.id === 'post-hashtags' && state.postComposer) {
      state.postComposer.hashtags = event.target.value.slice(0, 300);
      return;
    }
    if (event.target.id === 'post-location' && state.postComposer) {
      state.postComposer.location = event.target.value.slice(0, 100);
      return;
    }
    if (event.target.id === 'post-alt-text' && state.postComposer) {
      const item = activePostComposerItem(state.postComposer);
      if (item) item.altText = event.target.value.slice(0, 500);
      return;
    }
    if (event.target.id === 'post-allow-reposts' && state.postComposer) {
      state.postComposer.allowReposts = event.target.checked;
      return;
    }
    if (event.target.id === 'post-allow-comments' && state.postComposer) {
      state.postComposer.allowComments = event.target.checked;
      return;
    }
    if (event.target.id === 'post-hide-like-counts' && state.postComposer) {
      state.postComposer.hideLikeCounts = event.target.checked;
      return;
    }
    if (event.target.id === 'note-text' && state.noteComposer) {
      state.noteComposer.text = event.target.value.slice(0, 60);
      const output = event.target.closest('label')?.querySelector('output');
      if (output) output.textContent = `${state.noteComposer.text.length}/60`;
      const preview = document.querySelector('.note-composer-preview > span');
      if (preview) preview.textContent = state.noteComposer.text || 'Share a thought…';
      const share = document.querySelector('.note-share');
      if (share) share.disabled = !state.noteComposer.text.trim() && !state.noteComposer.audio && !state.noteComposer.music;
      return;
    }
    if (event.target.id === 'group-name-input' && state.groupComposer) {
      state.groupComposer.name = event.target.value.slice(0, 60);
      return;
    }
    if (event.target.id === 'group-people-search' && state.groupComposer) {
      state.groupComposer.query = event.target.value.slice(0, 80);
      filterGroupComposerPeople(state.groupComposer.query);
      return;
    }
    if (event.target.id === 'sticker-set-name' && state.stickerSetEditor) {
      state.stickerSetEditor.name = event.target.value.slice(0, 30);
      return;
    }
    if (event.target.id === 'story-comment-input' && state.actionSheet?.type === 'story-comments') {
      state.actionSheet.commentDraft = event.target.value.slice(0, 280);
      syncStoryCommentPostButton();
      return;
    }
    if (event.target.id === 'post-comment-input' && state.actionSheet?.type === 'post-comments') {
      state.actionSheet.commentDraft = event.target.value.slice(0, 500);
      const submit = document.querySelector('.post-comment-submit');
      if (submit) submit.disabled = !state.actionSheet.commentDraft.trim();
      return;
    }
    if (event.target.id === 'story-comment-gif-search' && state.actionSheet?.type === 'story-comments') {
      state.actionSheet.gifQuery = event.target.value.slice(0, 80);
      const term = state.actionSheet.gifQuery.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.story-comment-gif-grid [data-search]').forEach((button) => {
        button.hidden = Boolean(term && !String(button.dataset.search || '').includes(term));
        if (!button.hidden) visible += 1;
      });
      const empty = document.querySelector('.story-comment-gif-empty');
      if (empty) empty.hidden = visible > 0;
      clearTimeout(storyCommentGifTimer);
      const requestId = ++storyCommentGifRequestId;
      storyCommentGifTimer = setTimeout(() => {
        searchStoryCommentGifs(state.actionSheet?.gifQuery || '', requestId).catch((error) => alert(error.message));
      }, 260);
      return;
    }
    if (event.target.id === 'sticker-creator-text' && state.stickerCreator) {
      state.stickerCreator.text = event.target.value.slice(0, 80);
      const preview = document.querySelector('.sticker-live-text');
      if (preview) preview.textContent = state.stickerCreator.text || 'Type your sticker';
      const save = document.querySelector('.sticker-save-btn');
      if (save) save.disabled = !state.stickerCreator.text.trim();
      return;
    }
    if (event.target.id === 'sticker-creator-size' && state.stickerCreator) {
      state.stickerCreator.textSize = Number(event.target.value || 64);
      const preview = document.querySelector('.sticker-live-text');
      if (preview) preview.style.fontSize = `${state.stickerCreator.textSize}px`;
      return;
    }
    if (event.target.id === 'sticker-creator-color' && state.stickerCreator) {
      state.stickerCreator.textColor = event.target.value || '#ffffff';
      const preview = document.querySelector('.sticker-live-text');
      if (preview) preview.style.color = state.stickerCreator.textColor;
      return;
    }
    if (event.target.id === 'sticker-creator-bg-color' && state.stickerCreator) {
      state.stickerCreator.textBgColor = event.target.value || '#111111';
      state.stickerCreator.textBgEnabled = true;
      updateStickerCreatorSlot();
      return;
    }
    if (event.target.id === 'chat-gif-search') {
      state.chatGifQuery = event.target.value.slice(0, 80);
      const term = state.chatGifQuery.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.chat-gif-grid [data-search]').forEach((button) => {
        button.hidden = Boolean(term && !String(button.dataset.search || '').includes(term));
        if (!button.hidden) visible += 1;
      });
      const empty = document.querySelector('.chat-gif-empty');
      if (empty) empty.hidden = visible > 0;
      clearTimeout(chatGifSearchTimer);
      chatGifSearchTimer = setTimeout(() => {
        loadChatGifResults(state.chatGifQuery).catch(() => {});
      }, 280);
      return;
    }
    if (event.target.dataset.storyAdjust && state.storyEditor) {
      const name = event.target.dataset.storyAdjust;
      if (['brightness', 'contrast', 'saturation', 'warmth', 'fade', 'vignette', 'blur'].includes(name)) {
        state.storyEditor[name] = Number(event.target.value || 0);
        const output = event.target.closest('label')?.querySelector('output');
        if (output) output.textContent = event.target.value;
        updateStoryMediaUi(name === 'vignette');
      }
      return;
    }
    if (event.target.id === 'conversation-search') {
      state.conversationQuery = event.target.value;
      clearTimeout(conversationTimer);
      if (!state.conversationQuery.trim()) {
        conversationSearchId += 1;
        state.conversationResults = [];
        state.conversationSearching = false;
        renderSidebarState();
        const input = document.getElementById('conversation-search');
        if (input) {
          input.focus();
          input.setSelectionRange(state.conversationQuery.length, state.conversationQuery.length);
        }
        return;
      }
      state.conversationSearching = true;
      renderSidebarState();
      const input = document.getElementById('conversation-search');
      if (input) {
        input.focus();
        input.setSelectionRange(state.conversationQuery.length, state.conversationQuery.length);
      }
      conversationTimer = setTimeout(() => {
        searchConversations(state.conversationQuery).catch((error) => {
          state.conversationSearching = false;
          renderSidebarState();
          alert(error.message);
        });
      }, 220);
      return;
    }
    if (event.target.id === 'avatar-zoom' && state.avatarCrop) {
      state.avatarCrop.zoom = Number(event.target.value || 1);
      updateCropUi();
      return;
    }
    if (event.target.id === 'story-editor-text' && state.storyEditor) {
      state.storyEditor.text = event.target.value.slice(0, 120);
      event.target.cols = storyTextColumns(state.storyEditor.text);
      resizeStoryTextInput(event.target);
      return;
    }
    if (event.target.id === 'story-text-custom-color' && state.storyEditor) {
      state.storyEditor.textColor = event.target.value || '#ffffff';
      updateStoryTextUi();
      return;
    }
    if (event.target.id === 'story-draw-custom-color' && state.storyEditor) {
      state.storyEditor.drawColor = event.target.value || '#ffffff';
      return;
    }
    if (event.target.id === 'story-sticker-search' && state.storyEditor) {
      state.storyEditor.stickerSearch = event.target.value.slice(0, 80);
      const term = state.storyEditor.stickerSearch.trim().toLowerCase();
      document.querySelectorAll('.story-sticker-grid > button').forEach((button) => {
        button.hidden = Boolean(term && !String(button.dataset.search || '').includes(term));
      });
      return;
    }
    if (event.target.id === 'story-location-query' && state.storyEditor) {
      const editor = state.storyEditor;
      editor.locationQuery = event.target.value.slice(0, 100);
      editor.selectedLocation = null;
      editor.weatherDraft = null;
      clearTimeout(storyLocationTimer);
      const requestId = ++storyLocationRequestId;
      if (editor.locationQuery.trim().length < 2) {
        editor.locationResults = [];
        editor.locationSearching = false;
        const results = document.querySelector('.story-location-results');
        if (results) results.innerHTML = '';
        return;
      }
      storyLocationTimer = setTimeout(() => {
        searchStoryLocations(editor.locationQuery, requestId).catch((error) => alert(error.message));
      }, 280);
      return;
    }
    if (event.target.id === 'story-gif-search' && state.storyEditor) {
      const editor = state.storyEditor;
      editor.gifQuery = event.target.value.slice(0, 80);
      clearTimeout(storyGifTimer);
      const requestId = ++storyGifRequestId;
      storyGifTimer = setTimeout(() => {
        searchStoryGifs(editor.gifQuery, requestId).catch((error) => alert(error.message));
      }, 260);
      return;
    }
    if (event.target.id === 'story-gif-title' && state.storyEditor) {
      state.storyEditor.gifSubmissionTitle = event.target.value.slice(0, 60);
      return;
    }
    if (event.target.id === 'story-gif-tags' && state.storyEditor) {
      state.storyEditor.gifSubmissionTags = event.target.value.slice(0, 160);
      return;
    }
    if (event.target.id === 'story-quiz-question' && state.storyEditor) {
      state.storyEditor.quizQuestion = event.target.value.slice(0, 80);
      return;
    }
    if (event.target.id === 'story-quiz-a' && state.storyEditor) {
      state.storyEditor.quizOptionA = event.target.value.slice(0, 40);
      return;
    }
    if (event.target.id === 'story-quiz-b' && state.storyEditor) {
      state.storyEditor.quizOptionB = event.target.value.slice(0, 40);
      return;
    }
    if (event.target.id === 'story-slider-question' && state.storyEditor) {
      state.storyEditor.sliderQuestion = event.target.value.slice(0, 80);
      return;
    }
    if (event.target.id === 'story-slider-emoji' && state.storyEditor) {
      state.storyEditor.sliderEmoji = event.target.value.slice(0, 8) || '\ud83d\ude0d';
      const preview = document.querySelector('.story-slider-preview > span');
      if (preview) preview.textContent = state.storyEditor.sliderEmoji;
      return;
    }
    if (event.target.id === 'story-countdown-title' && state.storyEditor) {
      state.storyEditor.countdownTitle = event.target.value.slice(0, 60);
      return;
    }
    if (event.target.id === 'story-countdown-at' && state.storyEditor) {
      state.storyEditor.countdownAt = event.target.value;
      return;
    }
    if (event.target.id === 'story-editor-zoom' && state.storyEditor) {
      state.storyEditor.zoom = Number(event.target.value || 1);
      updateStoryMediaTransformUi();
      return;
    }
    if (event.target.id === 'story-text-rotation' && state.storyEditor) {
      state.storyEditor.textRotation = Number(event.target.value || 0);
      updateStoryTextTransformUi();
      return;
    }
    if (event.target.id === 'story-text-size' && state.storyEditor) {
      state.storyEditor.textSize = Number(event.target.value || 44);
      updateStoryRangeProgress(event.target, state.storyEditor.textSize);
      updateStoryTextTransformUi();
      return;
    }
    if (event.target.id === 'story-draw-size' && state.storyEditor) {
      state.storyEditor.drawSize = Number(event.target.value || 6);
      updateStoryRangeProgress(event.target, state.storyEditor.drawSize);
      return;
    }
    if (event.target.id === 'story-trim-start' && state.storyEditor) {
      state.storyEditor.trimStart = Number(event.target.value || 0);
      return;
    }
    if (event.target.id === 'story-trim-end' && state.storyEditor) {
      state.storyEditor.trimEnd = Number(event.target.value || 0);
      return;
    }
    if (event.target.id === 'story-poll-question' && state.storyEditor) {
      state.storyEditor.pollQuestion = event.target.value.slice(0, 80);
      updateStoryPollPreview();
      return;
    }
    if (event.target.id === 'story-poll-a' && state.storyEditor) {
      state.storyEditor.pollOptionA = event.target.value.slice(0, 40);
      updateStoryPollPreview();
      return;
    }
    if (event.target.id === 'story-poll-b' && state.storyEditor) {
      state.storyEditor.pollOptionB = event.target.value.slice(0, 40);
      updateStoryPollPreview();
      return;
    }
    if (event.target.id === 'story-sticker-text' && state.storyEditor) {
      state.storyEditor.stickerDraft = event.target.value.slice(0, 160);
      return;
    }
    if (event.target.id === 'story-audio-start' && state.storyEditor) {
      state.storyEditor.audioStart = Math.max(0, Number(event.target.value || 0));
      state.storyEditor.audioEnd = Math.min(Math.max(state.storyEditor.audioEnd || 30, state.storyEditor.audioStart), state.storyEditor.audioStart + 30);
      const output = event.target.closest('label')?.querySelector('output');
      if (output) output.textContent = formatClipTime(state.storyEditor.audioStart);
      return;
    }
    if (event.target.id === 'story-audio-end' && state.storyEditor) {
      const start = Math.max(0, Number(state.storyEditor.audioStart || 0));
      state.storyEditor.audioEnd = Math.min(Math.max(start, Number(event.target.value || start + 30)), start + 30);
      event.target.value = String(state.storyEditor.audioEnd);
      const output = event.target.closest('label')?.querySelector('output');
      if (output) output.textContent = formatClipTime(state.storyEditor.audioEnd);
      return;
    }
    if (event.target.id === 'user-search') {
      state.userQuery = event.target.value;
      clearTimeout(searchTimer);
      userSearchId += 1;
      state.searchResults = [];
      state.userSearching = state.userQuery.trim().length >= 2;
      renderSidebarState();
      setTimeout(focusUserSearch, 0);
      searchTimer = setTimeout(() => {
        searchUsers(state.userQuery).catch((error) => {
          state.userSearching = false;
          renderSidebarState();
          alert(error.message);
        });
      }, 340);
    }
    if (event.target.id === 'composer-text') {
      const key = activeConversationKey();
      if (key) state.composerDrafts[key] = event.target.value;
      resizeComposerInput();
      sendTypingSignal(true);
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => sendTypingSignal(false), 900);
    }
  });

  document.addEventListener('scroll', (event) => {
    if (event.target?.matches?.('.post-carousel-track')) {
      if (event.target._carouselFrame) cancelAnimationFrame(event.target._carouselFrame);
      event.target._carouselFrame = requestAnimationFrame(() => {
        event.target._carouselFrame = 0;
        syncPostCarousel(event.target);
      });
      return;
    }
    if (event.target?.id === 'messages') {
      if (state.chatLoading || chatScrollSettleCleanup || event.target.classList.contains('chat-settling')) return;
      if (event.target.scrollTop < 80) loadOlderMessages().catch((error) => alert(error.message));
    }
  }, true);

  document.addEventListener('dblclick', (event) => {
    const clipViewport = event.target.closest('.clip-viewport');
    const clipCard = clipViewport?.closest('.clip-card');
    if (clipViewport && clipCard && !event.target.closest('button,a,[data-action]')) {
      event.preventDefault();
      clearTimeout(clipTapTimer);
      const burst = clipCard.querySelector('.clip-like-burst');
      burst?.classList.remove('show');
      void burst?.offsetWidth;
      burst?.classList.add('show');
      setTimeout(() => burst?.classList.remove('show'), 720);
      const post = postById(clipCard.dataset.postId);
      if (post && !post.likedByMe) togglePostAction(post.id, 'like').catch((error) => alert(error.message));
      return;
    }
    const media = event.target.closest('.feed-post .post-carousel-slide img, .feed-post > .post-media-frame img');
    const card = media?.closest('.feed-post');
    if (!media || !card) return;
    event.preventDefault();
    const post = postById(card.dataset.postId);
    const frame = media.closest('.post-media-frame');
    const burst = document.createElement('span');
    burst.className = 'post-like-burst';
    burst.innerHTML = icon('heart');
    frame?.append(burst);
    setTimeout(() => burst.remove(), 760);
    if (!post?.likedByMe) togglePostAction(card.dataset.postId, 'like').catch((error) => alert(error.message));
  });

  document.addEventListener('keydown', async (event) => {
    if (state.musicPicker && event.key === 'Tab') {
      const dialog = document.querySelector('#music-picker-slot .music-picker-sheet');
      const focusable = Array.from(dialog?.querySelectorAll('input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
        return;
      }
    }
    if (state.messageFocus && event.key === 'Tab') {
      const dialog = document.querySelector('#message-focus-slot .message-focus-overlay');
      const focusable = Array.from(dialog?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter((element) => !element.hidden && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
        return;
      }
    }
    if (state.actionSheet && event.key === 'Tab') {
      const dialog = document.querySelector('#action-sheet-slot .action-sheet');
      const focusable = Array.from(dialog?.querySelectorAll('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
        return;
      }
    }
    if (event.target.matches('.post-video-preview[data-action="open-home-video"]') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openPostClip(event.target.dataset.postId, Number(event.target.dataset.mediaIndex || 0), event.target);
      return;
    }
    if (event.target.matches('.clip-video') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      toggleClipPlayback(event.target);
      return;
    }
    if (event.key === 'Escape' && state.musicPicker) {
      event.preventDefault();
      closeMusicPicker();
      return;
    }
    if (event.key === 'Escape' && state.postComposer) {
      event.preventDefault();
      closePostComposer();
      return;
    }
    if (event.key === 'Escape' && state.noteComposer) {
      event.preventDefault();
      if (state.noteRecording) stopNoteRecording();
      state.noteComposer = null;
      updateNoteComposerSlot();
      return;
    }
    if (event.key === 'Escape' && state.cameraCapture) {
      event.preventDefault();
      closeCameraCapture();
      return;
    }
    if (event.key === 'Escape' && state.messageFocus) {
      event.preventDefault();
      closeMessageFocus();
      return;
    }
    if (event.key === 'Escape' && state.settingsOpen) {
      event.preventDefault();
      closeSettingsDrawer();
      return;
    }
    if (event.key === 'Escape' && state.actionSheet) {
      event.preventDefault();
      closeOverlays();
      return;
    }
    if (event.target.id === 'story-comment-input' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      try {
        await submitStoryComment(state.actionSheet?.storyId);
      } catch (error) {
        alert(error.message);
      }
      return;
    }
    if (event.target.id === 'composer-text' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      try {
        await sendCurrentText();
      } catch (error) {
        alert(error.message);
      }
    }
  });

  document.addEventListener('focusin', (event) => {
    if (event.target.closest('.story-viewer-actions')) clearStoryAdvance();
    if (event.target.matches('input, textarea, [contenteditable="true"]')) {
      scheduleViewportHeight();
      setTimeout(scheduleViewportHeight, 260);
    }
  });

  document.addEventListener('focusout', (event) => {
    if (event.target.matches('input, textarea, [contenteditable="true"]')) {
      setTimeout(scheduleViewportHeight, 120);
      setTimeout(scheduleViewportHeight, 420);
    }
    if (event.target.closest('.story-viewer-actions')) {
      setTimeout(() => {
        if (!state.storyViewer || document.activeElement?.closest('.story-viewer-actions')) return;
        scheduleStoryAdvance(storyById(state.storyViewer.storyId));
      }, 0);
    }
  });

  document.addEventListener('pointerdown', async (event) => {
    if (event.target.matches('[data-story-slider]')) {
      clearStoryAdvance();
      state.edgeSwipe = null;
      return;
    }
    const commentSheetHeader = event.target.closest('.story-comments-head');
    if (['story-comments', 'post-comments'].includes(state.actionSheet?.type) && commentSheetHeader && !event.target.closest('button')) {
      const sheet = commentSheetHeader.closest('.story-comments-sheet');
      const overlay = sheet?.closest('.overlay');
      if (sheet && overlay) {
        event.preventDefault();
        state.commentSheetDrag = {
          pointerId: event.pointerId,
          startY: event.clientY,
          lastY: event.clientY,
          lastAt: performance.now(),
          velocity: 0,
          sheet,
          overlay
        };
        sheet.style.animation = 'none';
        commentSheetHeader.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    const videoTrimHandle = event.target.closest('[data-story-video-trim]');
    const videoTimeline = event.target.closest('.story-video-timeline');
    if (state.storyEditor?.isVideo && videoTimeline) {
      event.preventDefault();
      state.edgeSwipe = null;
      state.storyVideoTrimDrag = {
        pointerId: event.pointerId,
        edge: videoTrimHandle?.dataset.storyVideoTrim || 'playhead',
        rect: videoTimeline.getBoundingClientRect()
      };
      videoTimeline.setPointerCapture?.(event.pointerId);
      updateStoryVideoFromPointer(state.storyVideoTrimDrag, event.clientX);
      return;
    }
    if (event.target.closest('.story-size-slider')) {
      state.edgeSwipe = null;
      return;
    }
    const gestureBlocked = state.storyEditor || state.storyViewer || state.messageFocus || state.actionSheet || state.cameraCapture || state.musicPicker ||
      state.settingsOpen || state.profileEditOpen || state.avatarCrop || state.chatCustomizationOpen || state.stickerCreator || state.groupComposer ||
      state.postComposer || state.noteComposer || state.noteRecording;
    const backEntry = state.navigationStack[state.navigationStack.length - 1];
    const gestureControl = event.target.closest('button, a, input, textarea, select, [contenteditable="true"], [data-action], [role="button"]');
    // The physical edge belongs to iOS/Safari. Starting the app gesture just
    // inside it prevents the native history swipe from cancelling our preview.
    const appSwipeStartsAt = 16;
    const isAppBackSwipe = event.clientX >= appSwipeStartsAt && event.clientX < appSwipeStartsAt + 32;
    const isClipViewerBackSwipe = Boolean(state.clipViewer && event.target.closest('.clip-viewport, .clip-card'));
    if (state.me && isMobileLayout() && backEntry && !state.navigationBusy && !gestureBlocked &&
      (!hasActiveConversation() || state.clipViewer) && (isAppBackSwipe || isClipViewerBackSwipe) && !gestureControl) {
      const surface = currentAppShell();
      cancelForwardNavigationAnimation(surface);
      state.edgeSwipe = {
        startX: event.clientX,
        startY: event.clientY,
        startAt: performance.now(),
        lastX: event.clientX,
        lastAt: performance.now(),
        velocity: 0,
        surface,
        preview: null,
        entry: backEntry,
        width: surface?.getBoundingClientRect().width || window.innerWidth,
        liveScroll: captureLiveScroll(surface)
      };
    }
    if (state.me && isMobileLayout() && !gestureBlocked && !state.edgeSwipe && !state.clipViewer && !hasActiveConversation() &&
      !state.searchProfileOpen && !state.profileSocialView && state.tab !== 'notifications' &&
      event.target.closest('.side-content') && !event.target.closest('input,textarea,[contenteditable="true"]')) {
      state.tabSwipe = {
        startX: event.clientX,
        startY: event.clientY,
        surface: event.target.closest('.side-content')
      };
    }
    if (state.edgeSwipe) return;

    const postCropSurface = event.target.closest('[data-post-crop-surface]');
    if (state.postComposer?.stage === 1 && postCropSurface && !event.target.closest('button,input,a')) {
      const rect = postCropSurface.getBoundingClientRect();
      if (state.postComposer.isVideo && event.clientY >= rect.bottom - 54) return;
      event.preventDefault();
      state.edgeSwipe = null;
      state.tabSwipe = null;
      const crop = state.postComposer.crop;
      postCropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      capturePointer(postCropSurface, event.pointerId);
      if (postCropPointers.size >= 2) {
        const entries = Array.from(postCropPointers.entries()).slice(0, 2);
        const points = entries.map(([, point]) => point);
        state.postCropDrag = null;
        state.postCropGesture = {
          pointerIds: entries.map(([pointerId]) => pointerId),
          distance: Math.max(1, pointerDistance(points[0], points[1])),
          zoom: Number(crop.zoom || 1),
          rect
        };
        state.postCropGesture.pointerIds.forEach((pointerId) => capturePointer(postCropSurface, pointerId));
      } else {
        state.postCropGesture = null;
        state.postCropDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: Number(crop.x || 0),
          y: Number(crop.y || 0),
          rect
        };
      }
      return;
    }

    const storySticker = event.target.closest('[data-action="story-sticker-drag"]');
    if (state.storyEditor && storySticker) {
      event.preventDefault();
      const preview = storySticker.closest('.story-editor-preview');
      const rect = preview?.getBoundingClientRect();
      const sticker = (state.storyEditor.stickers || []).find((item) => item.id === storySticker.dataset.stickerId);
      if (rect && sticker) {
        storyStickerPointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          stickerId: sticker.id
        });
        const matching = Array.from(storyStickerPointers.entries())
          .filter(([, point]) => point.stickerId === sticker.id);
        if (matching.length >= 2) {
          const points = matching.slice(0, 2).map(([, point]) => point);
          state.storyStickerDrag = null;
          state.storyStickerGesture = {
            pointerIds: matching.slice(0, 2).map(([pointerId]) => pointerId),
            stickerId: sticker.id,
            angle: pointerAngle(points[0], points[1]),
            distance: Math.max(1, pointerDistance(points[0], points[1])),
            rotation: Number(sticker.rotation || 0),
            size: Number(sticker.size || 1)
          };
        } else {
          state.storyStickerDrag = {
            pointerId: event.pointerId,
            stickerId: sticker.id,
            rect,
            startX: event.clientX,
            startY: event.clientY,
            x: Number(sticker.x || 50),
            y: Number(sticker.y || 42)
          };
        }
        storySticker.setPointerCapture?.(event.pointerId);
        document.getElementById('story-object-trash')?.classList.add('visible');
      }
      return;
    }

    const storyPreview = event.target.closest('.story-editor-preview');
    const directStoryText = event.target.closest('[data-action="story-text-drag"]');
    if (state.storyEditor && directStoryText && !storyTextPointers.size && storyMediaPointers.size === 1) {
      storyMediaPointers.forEach((point, pointerId) => storyTextPointers.set(pointerId, point));
      storyMediaPointers.clear();
      state.storyMediaDrag = null;
      state.storyMediaGesture = null;
    }
    const continuingTextGesture = storyTextPointers.size > 0 && storyPreview &&
      !event.target.closest('button,input,textarea,a,audio');
    const storyText = directStoryText || (continuingTextGesture
      ? document.querySelector('.story-draggable-text, .story-live-text')
      : null);
    if (state.storyEditor && storyText) {
      const canvas = storyText.closest('.story-editor-preview');
      const rect = canvas?.getBoundingClientRect();
      if (rect) {
        const liveText = storyText.classList.contains('story-live-text');
        storyTextPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (storyTextPointers.size >= 2) {
          event.preventDefault();
          const points = Array.from(storyTextPointers.values()).slice(0, 2);
          const pointerIds = Array.from(storyTextPointers.keys()).slice(0, 2);
          const center = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
          };
          state.storyTextDrag = null;
          state.storyTextGesture = {
            pointerIds,
            angle: pointerAngle(points[0], points[1]),
            distance: Math.max(1, pointerDistance(points[0], points[1])),
            rotation: Number(state.storyEditor.textRotation || 0),
            size: Number(state.storyEditor.textSize || 44),
            center,
            x: Number(state.storyEditor.textX || 50),
            y: Number(state.storyEditor.textY || 50),
            rect
          };
          pointerIds.forEach((pointerId) => capturePointer(storyText, pointerId));
          document.getElementById('story-object-trash')?.classList.remove('visible', 'active');
        } else {
          state.storyTextDrag = {
            pointerId: event.pointerId,
            rect,
            startX: event.clientX,
            startY: event.clientY,
            x: Number(state.storyEditor.textX || 50),
            y: Number(state.storyEditor.textY || 50),
            pending: liveText,
            element: storyText
          };
          if (!liveText) {
            event.preventDefault();
            capturePointer(storyText, event.pointerId);
            document.getElementById('story-object-trash')?.classList.add('visible');
          }
        }
      }
      return;
    }

    if (state.storyEditor?.activeTool === 'draw' && storyPreview && !event.target.closest('button,input,textarea,a,audio')) {
      event.preventDefault();
      const rect = storyPreview.getBoundingClientRect();
      const point = {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      };
      if (state.storyEditor.drawBrush === 'eraser') {
        eraseStoryStrokeAt(point);
        state.storyDraw = { pointerId: event.pointerId, rect, eraser: true };
        storyPreview.setPointerCapture?.(event.pointerId);
        return;
      }
      const stroke = {
        color: state.storyEditor.drawColor || '#ffffff',
        size: Number(state.storyEditor.drawSize || 6),
        brush: state.storyEditor.drawBrush || 'pen',
        points: [point]
      };
      state.storyEditor.drawings = [...(state.storyEditor.drawings || []), stroke].slice(-80);
      state.storyDraw = { pointerId: event.pointerId, rect, stroke };
      storyPreview.setPointerCapture?.(event.pointerId);
      updateStoryDrawPreview();
      return;
    }

    if (state.storyEditor && storyPreview && state.storyEditor.activeTool !== 'draw' && !event.target.closest('button,input,textarea,a,audio')) {
      event.preventDefault();
      const rect = storyPreview.getBoundingClientRect();
      storyMediaPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (storyMediaPointers.size >= 2) {
        const points = Array.from(storyMediaPointers.values()).slice(0, 2);
        const pointerIds = Array.from(storyMediaPointers.keys()).slice(0, 2);
        state.storyMediaDrag = null;
        state.storyMediaGesture = {
          pointerIds,
          distance: Math.max(1, pointerDistance(points[0], points[1])),
          center: {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
          },
          zoom: Number(state.storyEditor.zoom || 1),
          offsetX: Number(state.storyEditor.mediaOffsetX || 0),
          offsetY: Number(state.storyEditor.mediaOffsetY || 0),
          rect
        };
        pointerIds.forEach((pointerId) => capturePointer(storyPreview, pointerId));
      } else {
        state.storyMediaDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: Number(state.storyEditor.mediaOffsetX || 0),
          offsetY: Number(state.storyEditor.mediaOffsetY || 0),
          rect
        };
      }
      capturePointer(storyPreview, event.pointerId);
      return;
    }

    const cropStage = event.target.closest('#crop-stage');
    if (state.avatarCrop && cropStage) {
      event.preventDefault();
      state.edgeSwipe = null;
      const rect = cropStage.getBoundingClientRect();
      const crop = state.avatarCrop;
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cropPointers.size >= 2) {
        const entries = Array.from(cropPointers.entries()).slice(0, 2);
        const points = entries.map(([, point]) => point);
        const centerX = (points[0].x + points[1].x) / 2 - rect.left - rect.width / 2;
        const centerY = (points[0].y + points[1].y) / 2 - rect.top - rect.height / 2;
        crop.drag = null;
        crop.pinch = {
          pointerIds: entries.map(([pointerId]) => pointerId),
          distance: Math.max(1, pointerDistance(points[0], points[1])),
          zoom: Number(crop.zoom || 1),
          offsetX: Number(crop.offsetX || 0),
          offsetY: Number(crop.offsetY || 0),
          centerX,
          centerY
        };
        crop.pinch.pointerIds.forEach((pointerId) => capturePointer(cropStage, pointerId));
        return;
      }
      crop.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: Number(crop.offsetX || 0),
        offsetY: Number(crop.offsetY || 0)
      };
      capturePointer(cropStage, event.pointerId);
      updateCropUi();
      return;
    }

    const recordButton = event.target.closest('[data-action="record-voice"]');
    if (recordButton) {
      event.preventDefault();
      recordButton.setPointerCapture?.(event.pointerId);
      try {
        await startRecording(recordButton);
      } catch (error) {
        alert(error.message);
      }
      return;
    }

    const chatItem = event.target.closest('.chat-item');
    if (chatItem) {
      state.longPressTriggered = false;
      clearTimeout(state.longPressTimer);
      state.longPressTimer = setTimeout(() => {
        state.longPressTriggered = true;
        openActionSheet({ type: 'chat-user', peerId: chatItem.dataset.peerId });
      }, 560);
      return;
    }

    const message = event.target.closest('.message');
    if (state.messageFocus) return;
    if (!message || event.target.closest('button,a,input,textarea')) return;
    const messageId = message.dataset.messageId;
    beginMessagePress(event, message, messageId);
    state.drag = {
      id: messageId,
      el: message,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
  });

  document.addEventListener('pointermove', (event) => {
    if (state.commentSheetDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      const drag = state.commentSheetDrag;
      const dy = Math.max(0, event.clientY - drag.startY);
      const now = performance.now();
      const instantaneous = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastAt);
      drag.velocity = drag.velocity * .55 + instantaneous * .45;
      drag.lastY = event.clientY;
      drag.lastAt = now;
      const progress = clamp(dy / Math.max(1, drag.sheet.offsetHeight), 0, 1);
      drag.sheet.style.transition = 'none';
      drag.sheet.style.transform = `translate3d(0, ${dy}px, 0)`;
      drag.overlay.style.animation = 'none';
      drag.overlay.style.background = `rgba(0, 0, 0, ${(0.52 * (1 - progress)).toFixed(3)})`;
      return;
    }
    if (state.storyVideoTrimDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      updateStoryVideoFromPointer(state.storyVideoTrimDrag, event.clientX);
      return;
    }
    if (state.postComposer && postCropPointers.has(event.pointerId)) {
      event.preventDefault();
      postCropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const crop = state.postComposer.crop;
      if (state.postCropGesture && postCropPointers.size >= 2) {
        const points = state.postCropGesture.pointerIds.map((pointerId) => postCropPointers.get(pointerId)).filter(Boolean);
        if (points.length >= 2) {
          const zoom = clamp(state.postCropGesture.zoom * (pointerDistance(points[0], points[1]) / state.postCropGesture.distance), 1, 3);
          Object.assign(crop, { zoom });
        }
      } else if (state.postCropDrag?.pointerId === event.pointerId) {
        const drag = state.postCropDrag;
        const x = clamp(drag.x - ((event.clientX - drag.startX) / Math.max(1, drag.rect.width)) * 200, -100, 100);
        const y = clamp(drag.y - ((event.clientY - drag.startY) / Math.max(1, drag.rect.height)) * 200, -100, 100);
        Object.assign(crop, { x, y });
      }
      updatePostComposerMediaStyle();
      syncPostCropControls();
      return;
    }
    if (state.storyEditor && storyStickerPointers.has(event.pointerId)) {
      const pointer = storyStickerPointers.get(event.pointerId);
      storyStickerPointers.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
      if (state.storyStickerGesture) {
        const points = state.storyStickerGesture.pointerIds
          .map((pointerId) => storyStickerPointers.get(pointerId))
          .filter(Boolean);
        const sticker = (state.storyEditor.stickers || []).find((item) => item.id === state.storyStickerGesture.stickerId);
        if (points.length >= 2 && sticker) {
          const angleDelta = pointerAngle(points[0], points[1]) - state.storyStickerGesture.angle;
          const distance = Math.max(1, pointerDistance(points[0], points[1]));
          sticker.rotation = state.storyStickerGesture.rotation + (angleDelta * 180) / Math.PI;
          sticker.size = clamp(state.storyStickerGesture.size * (distance / state.storyStickerGesture.distance), 0.7, 1.8);
          updateStoryEditorStickerUi(sticker.id);
        }
        return;
      }
      if (state.storyStickerDrag?.pointerId === event.pointerId) {
        const drag = state.storyStickerDrag;
        const sticker = (state.storyEditor.stickers || []).find((item) => item.id === drag.stickerId);
        if (sticker) {
          sticker.x = clamp(drag.x + ((event.clientX - drag.startX) / drag.rect.width) * 100, 5, 95);
          sticker.y = clamp(drag.y + ((event.clientY - drag.startY) / drag.rect.height) * 100, 5, 95);
          updateStoryEditorStickerUi(sticker.id);
        }
        document.getElementById('story-object-trash')?.classList.toggle('active', event.clientY > drag.rect.bottom - 96);
      }
      return;
    }
    if (state.storyEditor && storyTextPointers.has(event.pointerId)) {
      storyTextPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.storyTextGesture && storyTextPointers.size >= 2) {
        const ids = state.storyTextGesture.pointerIds;
        const points = ids.map((id) => storyTextPointers.get(id)).filter(Boolean);
        if (points.length >= 2) {
          event.preventDefault();
          const angleDelta = pointerAngle(points[0], points[1]) - state.storyTextGesture.angle;
          const distance = Math.max(1, pointerDistance(points[0], points[1]));
          const center = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
          };
          state.storyEditor.textRotation = clamp(state.storyTextGesture.rotation + (angleDelta * 180) / Math.PI, -180, 180);
          state.storyEditor.textSize = clamp(state.storyTextGesture.size * (distance / state.storyTextGesture.distance), 22, 96);
          state.storyEditor.textX = clamp(state.storyTextGesture.x + ((center.x - state.storyTextGesture.center.x) / state.storyTextGesture.rect.width) * 100, 5, 95);
          state.storyEditor.textY = clamp(state.storyTextGesture.y + ((center.y - state.storyTextGesture.center.y) / state.storyTextGesture.rect.height) * 100, 5, 95);
          updateStoryTextTransformUi();
        }
        return;
      }
      if (state.storyTextDrag?.pointerId === event.pointerId) {
        const drag = state.storyTextDrag;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (drag.pending && Math.hypot(dx, dy) < 7) return;
        if (drag.pending) {
          drag.pending = false;
          capturePointer(drag.element, event.pointerId);
          document.getElementById('story-object-trash')?.classList.add('visible');
        }
        event.preventDefault();
        state.storyEditor.textX = clamp(drag.x + (dx / drag.rect.width) * 100, 5, 95);
        state.storyEditor.textY = clamp(drag.y + (dy / drag.rect.height) * 100, 5, 95);
        updateStoryTextTransformUi();
        document.getElementById('story-object-trash')?.classList.toggle('active', event.clientY > drag.rect.bottom - 96);
      }
      return;
    }
    if (state.storyEditor && storyMediaPointers.has(event.pointerId)) {
      storyMediaPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.storyMediaGesture && storyMediaPointers.size >= 2) {
        const points = state.storyMediaGesture.pointerIds.map((pointerId) => storyMediaPointers.get(pointerId)).filter(Boolean);
        if (points.length >= 2) {
          event.preventDefault();
          const center = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
          };
          state.storyEditor.zoom = clamp(state.storyMediaGesture.zoom * (pointerDistance(points[0], points[1]) / state.storyMediaGesture.distance), 1, 3);
          state.storyEditor.mediaOffsetX = clamp(state.storyMediaGesture.offsetX + ((center.x - state.storyMediaGesture.center.x) / state.storyMediaGesture.rect.width) * 100, -40, 40);
          state.storyEditor.mediaOffsetY = clamp(state.storyMediaGesture.offsetY + ((center.y - state.storyMediaGesture.center.y) / state.storyMediaGesture.rect.height) * 100, -40, 40);
          updateStoryMediaTransformUi();
        }
        return;
      }
      if (state.storyMediaDrag?.pointerId === event.pointerId) {
        event.preventDefault();
        const drag = state.storyMediaDrag;
        state.storyEditor.mediaOffsetX = clamp(drag.offsetX + ((event.clientX - drag.startX) / drag.rect.width) * 100, -40, 40);
        state.storyEditor.mediaOffsetY = clamp(drag.offsetY + ((event.clientY - drag.startY) / drag.rect.height) * 100, -40, 40);
        updateStoryMediaTransformUi();
      }
      return;
    }
    if (state.storyDraw?.pointerId === event.pointerId) {
      const rect = state.storyDraw.rect;
      if (state.storyDraw.eraser) {
        eraseStoryStrokeAt({
          x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
          y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
        });
        return;
      }
      state.storyDraw.stroke.points.push({
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      });
      updateActiveStoryStrokeUi(state.storyDraw.stroke);
      return;
    }
    if (state.avatarCrop && cropPointers.has(event.pointerId)) {
      event.preventDefault();
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const crop = state.avatarCrop;
      if (crop.pinch && cropPointers.size >= 2) {
        const points = crop.pinch.pointerIds.map((pointerId) => cropPointers.get(pointerId)).filter(Boolean);
        const rect = document.getElementById('crop-stage')?.getBoundingClientRect();
        if (points.length >= 2 && rect) {
          const distance = Math.max(1, pointerDistance(points[0], points[1]));
          const zoom = clamp(crop.pinch.zoom * (distance / crop.pinch.distance), 1, 3);
          const ratio = zoom / crop.pinch.zoom;
          const centerX = (points[0].x + points[1].x) / 2 - rect.left - rect.width / 2;
          const centerY = (points[0].y + points[1].y) / 2 - rect.top - rect.height / 2;
          crop.zoom = zoom;
          crop.offsetX = centerX - (crop.pinch.centerX - crop.pinch.offsetX) * ratio;
          crop.offsetY = centerY - (crop.pinch.centerY - crop.pinch.offsetY) * ratio;
        }
        updateCropUi();
        return;
      }
      if (crop.drag?.pointerId === event.pointerId) {
        crop.offsetX = crop.drag.offsetX + event.clientX - crop.drag.startX;
        crop.offsetY = crop.drag.offsetY + event.clientY - crop.drag.startY;
      }
      updateCropUi();
      return;
    }
    if (state.edgeSwipe) {
      const dx = event.clientX - state.edgeSwipe.startX;
      const dy = event.clientY - state.edgeSwipe.startY;
      if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
        if (Math.abs(dx) > 12) {
          state.edgeSwipe.moved = true;
          if (!state.edgeSwipe.preview) {
            state.edgeSwipe.preview = installNavigationPreview(state.edgeSwipe.entry, 'swipe');
            state.edgeSwipe.surface?.setPointerCapture?.(event.pointerId);
          }
        }
        const moveAt = performance.now();
        state.edgeSwipe.velocity = Math.max(0, (event.clientX - state.edgeSwipe.lastX) / Math.max(1, moveAt - state.edgeSwipe.lastAt));
        state.edgeSwipe.lastX = event.clientX;
        state.edgeSwipe.lastAt = moveAt;
        const amount = Math.min(dx, window.innerWidth * 0.82);
        if (state.edgeSwipe.surface) {
          state.edgeSwipe.surface.style.transition = 'none';
          state.edgeSwipe.surface.style.transform = `translateX(${amount}px)`;
          state.edgeSwipe.surface.style.boxShadow = '-18px 0 38px rgba(0,0,0,.38)';
          state.edgeSwipe.surface.classList.add('route-swipe-current');
        }
        if (state.edgeSwipe.preview) {
          const progress = clamp(amount / state.edgeSwipe.width, 0, 1);
          const target = navigationPreviewTarget(state.edgeSwipe.preview);
          if (target) {
            target.style.transition = 'none';
            target.style.transform = `translateX(${(-18 + progress * 18).toFixed(2)}%)`;
          }
          state.edgeSwipe.preview.style.setProperty('--route-backdrop-opacity', `${(0.22 * (1 - progress)).toFixed(3)}`);
        }
      }
    }
    if (state.tabSwipe) {
      const dx = event.clientX - state.tabSwipe.startX;
      const dy = event.clientY - state.tabSwipe.startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
        if (Math.abs(dx) > 12) state.tabSwipe.moved = true;
        const preview = ensureTabSwipePreview(state.tabSwipe, dx);
        const width = state.tabSwipe.surface.getBoundingClientRect().width || window.innerWidth;
        const amount = preview ? clamp(dx, -width, width) : dx * 0.12;
        state.tabSwipe.surface.style.transition = 'none';
        state.tabSwipe.surface.style.transform = `translateX(${amount}px)`;
        if (preview) {
          preview.style.transition = 'none';
          preview.style.transform = `translateX(${amount + (dx < 0 ? width : -width)}px)`;
        }
      }
    }
    cancelMessagePressFromMove(event);
    if (state.longPressTimer) {
      const pointer = state.drag || state.edgeSwipe || state.tabSwipe;
      if (pointer && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 10) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
    }
    if (!state.drag) return;
    const dx = event.clientX - state.drag.startX;
    const dy = event.clientY - state.drag.startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      const draggedMessage = state.messages.find((message) => message.id === state.drag.id);
      const mine = draggedMessage?.senderId === state.me.id;
      const allowedDx = mine ? Math.min(dx, 0) : Math.max(dx, 0);
      const amount = allowedDx < 0 ? Math.max(allowedDx, -92) : Math.min(allowedDx, 92);
      state.drag.el.classList.toggle('reveal-time', Math.abs(amount) > 4);
      state.drag.el.style.transform = `translateX(${amount}px)`;
      state.drag.el.style.transition = 'none';
    }
  });

  document.addEventListener('pointerup', (event) => {
    if (state.commentSheetDrag?.pointerId === event.pointerId) {
      const drag = state.commentSheetDrag;
      const dy = Math.max(0, event.clientY - drag.startY);
      const dismiss = dy > Math.min(130, drag.sheet.offsetHeight * .22) || (dy > 28 && drag.velocity > .55);
      state.commentSheetDrag = null;
      state.suppressClickUntil = Date.now() + 260;
      if (dismiss) {
        drag.sheet.style.transition = 'transform 220ms cubic-bezier(.4, 0, 1, 1)';
        drag.sheet.style.transform = `translate3d(0, ${Math.max(dy, drag.sheet.offsetHeight)}px, 0)`;
        drag.overlay.style.transition = 'background 220ms ease';
        drag.overlay.style.background = 'rgba(0, 0, 0, 0)';
        clearTimeout(overlayCloseTimer);
        overlayCloseTimer = setTimeout(() => {
          state.actionSheet = null;
          state.overlayClosing = false;
          updateActionSheetSlot();
          if (state.storyViewer) scheduleStoryAdvance(storyById(state.storyViewer.storyId));
        }, 220);
      } else {
        drag.sheet.style.transition = 'transform 300ms cubic-bezier(.2, .9, .25, 1)';
        drag.sheet.style.transform = 'translate3d(0, 0, 0)';
        drag.overlay.style.transition = 'background 220ms ease';
        drag.overlay.style.background = 'rgba(0, 0, 0, .52)';
        afterVisualMotion(drag.sheet, 'transitionend', 320, () => {
          drag.sheet.style.removeProperty('animation');
          drag.sheet.style.removeProperty('transition');
          drag.sheet.style.removeProperty('transform');
          drag.overlay.style.removeProperty('animation');
          drag.overlay.style.removeProperty('transition');
          drag.overlay.style.removeProperty('background');
        });
      }
      return;
    }
    if (state.storyVideoTrimDrag?.pointerId === event.pointerId) {
      updateStoryVideoFromPointer(state.storyVideoTrimDrag, event.clientX);
      state.storyVideoTrimDrag = null;
      state.edgeSwipe = null;
      return;
    }
    if (postCropPointers.has(event.pointerId)) {
      postCropPointers.delete(event.pointerId);
      state.postCropDrag = null;
      state.postCropGesture = null;
      if (postCropPointers.size) {
        const [pointerId, point] = postCropPointers.entries().next().value;
        const surface = document.querySelector('#post-composer-slot [data-post-crop-surface]');
        const rect = surface?.getBoundingClientRect();
        if (rect && state.postComposer) {
          state.postCropDrag = {
            pointerId,
            startX: point.x,
            startY: point.y,
            x: Number(state.postComposer.crop.x || 0),
            y: Number(state.postComposer.crop.y || 0),
            rect
          };
        }
      }
      state.edgeSwipe = null;
      state.tabSwipe = null;
      return;
    }
    if (storyStickerPointers.has(event.pointerId)) {
      const trash = document.getElementById('story-object-trash');
      const removeSticker = Boolean(trash?.classList.contains('active'));
      const stickerId = state.storyStickerDrag?.stickerId || state.storyStickerGesture?.stickerId;
      storyStickerPointers.delete(event.pointerId);
      if (state.storyStickerDrag?.pointerId === event.pointerId) state.storyStickerDrag = null;
      if (storyStickerPointers.size < 2) state.storyStickerGesture = null;
      trash?.classList.remove('visible', 'active');
      if (removeSticker && stickerId && state.storyEditor) {
        state.storyEditor.stickers = (state.storyEditor.stickers || []).filter((sticker) => sticker.id !== stickerId);
        updateStoryEditorView();
      }
      state.edgeSwipe = null;
      return;
    }
    if (storyTextPointers.has(event.pointerId)) {
      const trash = document.getElementById('story-object-trash');
      const removeText = Boolean(trash?.classList.contains('active'));
      const wasGesture = Boolean(state.storyTextGesture);
      storyTextPointers.delete(event.pointerId);
      if (state.storyTextDrag?.pointerId === event.pointerId) state.storyTextDrag = null;
      if (storyTextPointers.size < 2) state.storyTextGesture = null;
      trash?.classList.remove('visible', 'active');
      if (removeText && state.storyEditor) {
        state.storyEditor.text = '';
        storyTextPointers.clear();
        updateStoryEditorView();
      } else if (wasGesture) continueStoryTextDrag();
      state.edgeSwipe = null;
      return;
    }
    if (storyMediaPointers.has(event.pointerId)) {
      const wasGesture = Boolean(state.storyMediaGesture);
      storyMediaPointers.delete(event.pointerId);
      if (state.storyMediaDrag?.pointerId === event.pointerId) state.storyMediaDrag = null;
      if (storyMediaPointers.size < 2) state.storyMediaGesture = null;
      if (wasGesture) continueStoryMediaDrag();
      state.edgeSwipe = null;
      return;
    }
    if (state.storyDraw?.pointerId === event.pointerId) {
      state.storyDraw = null;
      state.edgeSwipe = null;
      return;
    }
    if (state.avatarCrop && cropPointers.has(event.pointerId)) {
      const wasPinch = Boolean(state.avatarCrop.pinch);
      cropPointers.delete(event.pointerId);
      if (state.avatarCrop.drag?.pointerId === event.pointerId) state.avatarCrop.drag = null;
      if (cropPointers.size < 2) state.avatarCrop.pinch = null;
      if (wasPinch && cropPointers.size === 1) continueAvatarCropDrag();
      state.edgeSwipe = null;
      return;
    }
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    finishMessagePress(event.pointerId);
    const recordButton = event.target.closest('[data-action="record-voice"]') || document.querySelector('.recording');
    if (recordButton) stopRecording(recordButton);
    if (state.edgeSwipe) {
      const swipe = state.edgeSwipe;
      // A tap in the gesture rail must not leave a zero-distance transform
      // transition running underneath the click it was meant to pass through.
      if (!swipe.moved) {
        state.edgeSwipe = null;
        return;
      }
      const dx = event.clientX - state.edgeSwipe.startX;
      const dy = event.clientY - state.edgeSwipe.startY;
      const surface = swipe.surface;
      if (state.edgeSwipe.moved) state.suppressClickUntil = Date.now() + 320;
      const velocity = swipe.velocity || 0;
      const commitDistance = Math.min(56, swipe.width * 0.16);
      const commit = Math.abs(dx) > Math.abs(dy) && (dx > commitDistance || (dx > 24 && velocity > 0.42));
      if (surface) surface.style.transition = 'transform 240ms cubic-bezier(.24,.78,.22,1), box-shadow 240ms ease';
      const underlay = navigationPreviewTarget(swipe.preview);
      if (underlay) underlay.style.transition = 'transform 240ms cubic-bezier(.24,.78,.22,1)';
      if (swipe.preview) {
        swipe.preview.classList.add('route-swipe-settling');
      }
      if (commit) {
        const pending = beginSwipeNavigationBack(swipe.entry, swipe.preview);
        if (surface) {
          surface.style.transform = `translateX(${swipe.width}px)`;
          surface.style.boxShadow = '-18px 0 38px rgba(0,0,0,.2)';
        }
        if (swipe.preview) {
          underlay?.style.setProperty('transform', 'translateX(0)');
          swipe.preview.style.setProperty('--route-backdrop-opacity', '0');
        }
        afterVisualMotion(surface, 'transitionend', 260, () => {
          pending.visualFinished = true;
          settleSwipeNavigationBack(pending);
        }, 'transform');
      } else {
        restoreLiveScroll(swipe.liveScroll);
        if (surface) {
          surface.style.transform = 'translateX(0)';
          surface.style.boxShadow = '';
        }
        if (swipe.preview) {
          underlay?.style.setProperty('transform', `translateX(${navigationUnderlayOffset()})`);
          swipe.preview.style.setProperty('--route-backdrop-opacity', '.22');
        }
        setTimeout(() => {
          restoreLiveScroll(swipe.liveScroll);
          surface?.classList.remove('route-swipe-current');
          stashNavigationPreview(swipe.preview);
        }, 245);
      }
      state.edgeSwipe = null;
    }
    if (state.tabSwipe) {
      const swipe = state.tabSwipe;
      const dx = event.clientX - state.tabSwipe.startX;
      const dy = event.clientY - state.tabSwipe.startY;
      const surface = swipe.surface;
      if (state.tabSwipe.moved) state.suppressClickUntil = Date.now() + 320;
      state.tabSwipe = null;
      const width = surface.getBoundingClientRect().width || window.innerWidth;
      const commit = Boolean(swipe.targetTab && Math.abs(dx) > Math.min(84, width * 0.22) && Math.abs(dx) > Math.abs(dy));
      surface.style.transition = 'transform 220ms cubic-bezier(.3,.75,.25,1)';
      if (swipe.preview) swipe.preview.style.transition = 'transform 220ms cubic-bezier(.3,.75,.25,1)';
      if (commit) {
        surface.style.transform = `translateX(${dx < 0 ? -width : width}px)`;
        if (swipe.preview) swipe.preview.style.transform = 'translateX(0)';
        setTimeout(() => {
          clearTabSwipePreview(swipe);
          switchMainTab(swipe.targetTab, { animate: false });
        }, 220);
      } else {
        surface.style.transform = 'translateX(0)';
        if (swipe.preview) swipe.preview.style.transform = `translateX(${dx < 0 ? width : -width}px)`;
        setTimeout(() => clearTabSwipePreview(swipe), 220);
      }
    }
    if (state.drag) {
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      const draggedMessage = state.messages.find((message) => message.id === state.drag.id);
      const mine = draggedMessage?.senderId === state.me.id;
      const replySwipe = mine ? dx < -70 : dx > 70;
      state.drag.el.style.transform = '';
      state.drag.el.style.transition = '';
      state.drag.el.classList.remove('reveal-time');
      if (replySwipe) {
        state.replyTo = draggedMessage || null;
        updateChatFooter({ focus: true });
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && draggedMessage) {
        const now = Date.now();
        if (state.lastMessageTap?.id === draggedMessage.id && now - state.lastMessageTap.at < 320) {
          state.lastMessageTap = null;
          reactToMessage(draggedMessage.id, '\u2764\ufe0f').catch((error) => alert(error.message));
        } else {
          state.lastMessageTap = { id: draggedMessage.id, at: now };
        }
      }
      state.drag = null;
    }
    if (state.edgeSwipe?.surface) {
      restoreLiveScroll(state.edgeSwipe.liveScroll);
      state.edgeSwipe.surface.style.transform = '';
      state.edgeSwipe.surface.style.boxShadow = '';
      state.edgeSwipe.surface.style.transition = '';
      state.edgeSwipe.surface.classList.remove('route-swipe-current');
    }
    stashNavigationPreview(state.edgeSwipe?.preview);
    if (state.tabSwipe?.surface) {
      state.tabSwipe.surface.style.transform = '';
      state.tabSwipe.surface.style.opacity = '';
      state.tabSwipe.surface.style.transition = '';
      state.tabSwipe.preview?.remove();
    }
    state.edgeSwipe = null;
    state.tabSwipe = null;
  });

  document.addEventListener('pointercancel', (event) => {
    clearActiveMessagePress({ pointerId: event.pointerId });
    if (state.commentSheetDrag) {
      const { sheet, overlay } = state.commentSheetDrag;
      sheet.style.transition = 'transform 220ms cubic-bezier(.2, .9, .25, 1)';
      sheet.style.transform = 'translate3d(0, 0, 0)';
      overlay.style.transition = 'background 180ms ease';
      overlay.style.background = 'rgba(0, 0, 0, .52)';
      state.commentSheetDrag = null;
    }
    const recordButton = document.querySelector('.recording');
    if (recordButton) stopRecording(recordButton);
    if (state.drag) {
      state.drag.el.style.transform = '';
      state.drag.el.classList.remove('reveal-time');
      state.drag = null;
    }
    if (state.edgeSwipe?.surface) {
      restoreLiveScroll(state.edgeSwipe.liveScroll);
      state.edgeSwipe.surface.style.transform = '';
      state.edgeSwipe.surface.style.boxShadow = '';
      state.edgeSwipe.surface.style.transition = '';
      state.edgeSwipe.surface.classList.remove('route-swipe-current');
    }
    stashNavigationPreview(state.edgeSwipe?.preview);
    if (state.tabSwipe?.surface) {
      state.tabSwipe.surface.style.transform = '';
      state.tabSwipe.surface.style.opacity = '';
      state.tabSwipe.surface.style.transition = '';
      state.tabSwipe.preview?.remove();
    }
    if (state.avatarCrop?.drag) state.avatarCrop.drag = null;
    if (state.avatarCrop?.pinch) state.avatarCrop.pinch = null;
    state.storyTextDrag = null;
    state.storyTextGesture = null;
    state.storyMediaDrag = null;
    state.storyMediaGesture = null;
    state.storyStickerDrag = null;
    state.storyStickerGesture = null;
    state.storyDraw = null;
    state.storyVideoTrimDrag = null;
    state.postCropDrag = null;
    state.postCropGesture = null;
    storyTextPointers.clear();
    storyMediaPointers.clear();
    storyStickerPointers.clear();
    cropPointers.clear();
    postCropPointers.clear();
    document.getElementById('story-object-trash')?.classList.remove('visible', 'active');
    state.edgeSwipe = null;
    state.tabSwipe = null;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if ((state.storyEditor && event.target.closest?.('.story-editor-preview')) || (state.postComposer && event.target.closest?.('[data-post-crop-surface]'))) event.preventDefault();
    }, { passive: false });
  });

  document.addEventListener('wheel', (event) => {
    if (state.postComposer?.stage === 1 && !state.postComposer.isVideo && event.target.closest('[data-post-crop-surface]')) {
      event.preventDefault();
      const zoom = clamp(Number(state.postComposer.crop.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 1, 3);
      Object.assign(state.postComposer.crop, { zoom });
      updatePostComposerMediaStyle();
      syncPostCropControls();
      return;
    }
    if (state.avatarCrop && event.target.closest('#crop-stage')) {
      event.preventDefault();
      state.avatarCrop.zoom = clamp((state.avatarCrop.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 1, 3);
      updateCropUi();
      return;
    }
    if (state.storyEditor && state.storyEditor.activeTool !== 'draw' && event.target.closest('.story-editor-preview') && !event.target.closest('textarea,input,button,a,audio')) {
      event.preventDefault();
      state.storyEditor.zoom = clamp((state.storyEditor.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 1, 3);
      updateStoryMediaTransformUi();
    }
  }, { passive: false });

  window.addEventListener('popstate', (event) => {
    (async () => {
      if (!state.me) {
        await init();
        return;
      }
      const targetGeneration = Number.isInteger(event.state?.navGeneration) ? event.state.navGeneration : 0;
      if (targetGeneration !== state.navigationGeneration) {
        state.navigationStack = [];
        state.forwardNavigationEntries.clear();
        state.storyCommentPosting.clear();
        state.routeForward = null;
        state.pendingHistoryBack = null;
        state.navigationBusy = false;
        history.replaceState({
          ...(event.state || {}),
          appManaged: true,
          route: 'app',
          navDepth: 0,
          navGeneration: state.navigationGeneration,
          view: captureNavigationView()
        }, '', location.href);
        refreshNavigationEdgeZone();
        return;
      }
      const currentDepth = state.navigationStack.length;
      const targetDepth = Number.isInteger(event.state?.navDepth) ? event.state.navDepth : 0;
      const isOneStepBack = currentDepth > 0 && targetDepth === currentDepth - 1;
      if (isOneStepBack) {
        const entry = state.navigationStack[currentDepth - 1];
        const pending = state.pendingHistoryBack;
        if (pending?.entry === entry && pending.source === 'swipe') {
          pending.historyArrived = true;
          settleSwipeNavigationBack(pending);
          return;
        }
        const requestedByApp = pending?.entry === entry;
        if (requestedByApp) state.pendingHistoryBack = null;
        if (state.navigationBusy === 'awaiting-history') state.navigationBusy = false;
        // The browser already animates an OS edge swipe. Replaying the app
        // slide after its popstate creates the visible end-of-gesture hitch.
        animateNavigationBack({ skipHistory: true, instant: !requestedByApp });
        return;
      }
      const isOneStepForward = targetDepth === currentDepth + 1;
      if (isOneStepForward && event.state?.view) {
        restoreForwardNavigationEntry(targetDepth);
        await restoreNavigationView(event.state.view);
        return;
      }
      if (state.pendingHistoryBack) {
        state.pendingHistoryBack = null;
        if (state.navigationBusy === 'awaiting-history') state.navigationBusy = false;
      }
      if (event.state?.view) {
        await restoreNavigationView(event.state.view);
        return;
      }
      const username = publicUsernameFromPath();
      if (username) {
        await openSearchProfile(username, { pushHistory: false });
        const sharedPostId = sharedPostIdFromLocation();
        if (sharedPostId) {
          await loadSharedLinkPost(sharedPostId);
          renderApp();
        }
        return;
      }
      state.searchProfileOpen = false;
      state.searchProfileSocialView = null;
      state.publicProfile = null;
      state.tabTransition = false;
      renderApp();
    })().catch((error) => {
      console.error(error);
      if (state.me) alert(error.message);
      else renderAuth(error.message);
    });
  });

  window.addEventListener('pagehide', () => {
    if (state.postComposer) closePostComposer();
    stopCameraStream();
  });

  init().catch((error) => {
    console.error(error);
    app.innerHTML = `<main class="auth-screen"><div class="auth-card"><h1>Messages</h1><p class="error">${esc(error.message)}</p></div></main>`;
  });
})();
