(function () {
  const app = document.getElementById('app');

  let stableViewportHeight = 0;

  function focusedEditable() {
    return document.activeElement?.matches?.('input, textarea, [contenteditable="true"]');
  }

  function setViewportHeight(forceStable = false) {
    const viewport = window.visualViewport;
    const visualHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const layoutHeight = Math.max(visualHeight, Math.round(window.innerHeight || visualHeight));
    const visualTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const root = document.documentElement;
    const keyboardSized = Boolean(stableViewportHeight && stableViewportHeight - visualHeight > 90);
    const keyboardOpen = Boolean(
      keyboardSized &&
      (focusedEditable() || root.classList.contains('keyboard-open'))
    );

    if (forceStable || !stableViewportHeight || !keyboardOpen) stableViewportHeight = layoutHeight;

    root.style.setProperty('--app-height', `${stableViewportHeight}px`);
    root.style.setProperty('--visual-height', `${visualHeight}px`);
    root.style.setProperty('--visual-top', `${visualTop}px`);
    root.classList.toggle('keyboard-open', keyboardOpen);
  }

  setViewportHeight(true);
  window.addEventListener('resize', () => setViewportHeight());
  window.addEventListener('orientationchange', () => setTimeout(() => setViewportHeight(true), 180));
  window.visualViewport?.addEventListener('resize', () => setViewportHeight());
  window.visualViewport?.addEventListener('scroll', () => setViewportHeight());

  const state = {
    authMode: 'login',
    needsTwoFactor: false,
    me: null,
    twoFactorEnabled: false,
    isModerator: false,
    twoFactorSetup: null,
    tab: 'chats',
    lastTab: 'chats',
    tabTransition: false,
    tabDirection: 'right',
    contacts: [],
    chats: [],
    activePeer: null,
    chatProfileOpen: false,
    chatReturnAnimation: false,
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
    conversationQuery: '',
    conversationResults: [],
    conversationSearching: false,
    profileSocialView: null,
    chatProfileSocialView: null,
    recommendations: [],
    publicProfile: null,
    pendingRequestCount: 0,
    notifications: [],
    requests: [],
    hiddenRecommendations: JSON.parse(localStorage.getItem('hiddenRecommendations') || '[]'),
    unreadByPeer: {},
    messageNotifications: localStorage.getItem('messageNotifications') !== '0' &&
      'Notification' in window && Notification.permission !== 'denied',
    notificationPromptDismissed: sessionStorage.getItem('notificationPromptDismissed') === '1',
    toasts: [],
    actionSheet: null,
    storyMenuOpen: false,
    storyPublishing: false,
    gifPool: [],
    pendingGifs: [],
    gifLoading: false,
    overlayClosing: false,
    profileEditOpen: false,
    settingsOpen: false,
    recommendationsOpen: false,
    avatarCrop: null,
    storyEditor: null,
    storyViewer: null,
    mediaViewer: null,
    stickerPanel: false,
    stickers: [],
    stickerMap: new Map(),
    replyTo: null,
    typingPeerId: null,
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
    edgeSwipe: null,
    longPressTimer: null,
    longPressTriggered: false,
    call: freshCallState()
  };

  const cropPointers = new Map();
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
  let storyLocationRequestId = 0;
  let storyGifRequestId = 0;
  let storyCountdownTimer = null;

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

  function publicUsernameFromPath() {
    const match = /^\/u\/([^/]+)\/?$/.exec(location.pathname);
    return match ? decodeURIComponent(match[1]) : null;
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

  function icon(name) {
    const icons = {
      messages: '<svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v7A3.5 3.5 0 0 1 16.5 16H9l-5 4v-4.5A3.5 3.5 0 0 1 4 12.5v-7Z"/><path d="M8 8h8M8 12h5"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
      profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
      logout: '<svg viewBox="0 0 24 24"><path d="M10 17v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1"/><path d="M15 7l5 5-5 5M20 12H8"/></svg>',
      back: '<svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"/></svg>',
      video: '<svg viewBox="0 0 24 24"><path d="M4 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="m17 10 5-3v10l-5-3"/></svg>',
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
      check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'
    };
    return `<span class="ui-icon" aria-hidden="true">${icons[name] || ''}</span>`;
  }

  function navButton(tab, label, iconName) {
    const active = state.tab === tab || (state.tab === 'notifications' && tab === 'chats');
    const unreadDot = tab === 'chats' && hasUnreadMessages();
    return `
      <button class="bottom-tab ${active ? 'active' : ''}" data-action="tab" data-tab="${tab}" title="${esc(label)}" aria-label="${esc(label)}">
        ${icon(iconName)}
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
    return { chats: 0, search: 1, notifications: 0, profile: 2 }[tab] ?? 0;
  }

  function describeMessage(message) {
    if (!message) return '';
    if (message.deletedAt) return 'Deleted message';
    if (message.text) return message.text;
    if (message.attachment?.name) return `${message.kind}: ${message.attachment.name}`;
    return message.kind || 'message';
  }

  async function init() {
    await loadStickers();
    const publicName = publicUsernameFromPath();
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
      renderPublicScreen();
      return;
    }

    if (!state.me) {
      renderAuth();
      return;
    }

    await loadContactsAndChats();
    await loadGifPool();
    if (publicName) {
      state.tab = 'search';
      await loadPublicProfile(publicName);
      state.searchProfileOpen = Boolean(state.publicProfile);
    }
    renderApp();
    connectWs();
  }

  async function loadPublicProfile(username) {
    try {
      const data = await api(`/api/users/${encodeURIComponent(username)}`);
      state.publicProfile = data.user;
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
    app.innerHTML = `
      <main class="public-screen">
        <section class="public-box">
          <div class="intro">
            <div>
              <h1>${user ? esc(user.displayName) : 'User not found'}</h1>
              <p>${user ? esc(user.bio || `@${user.username}`) : 'This profile link does not match an account.'}</p>
            </div>
            ${user ? `<div class="feature-strip"><span>@${esc(user.username)}</span><span>Joined ${esc(formatTime(user.createdAt))}</span><span>${esc(location.origin + user.url)}</span></div>` : ''}
          </div>
          <div class="public-card">
            ${user ? avatarHtml(user) : ''}
            <h2>${user ? '@' + esc(user.username) : 'Open chat'}</h2>
            <p class="hint">${user ? 'Log in to add this user and start chatting.' : 'Create an account or log in to search users.'}</p>
            <button class="primary" data-action="show-login">Log in or create account</button>
          </div>
        </section>
      </main>
    `;
  }

  function captureMessagesScroll() {
    const messages = document.getElementById('messages');
    if (!messages) return null;
    return {
      top: messages.scrollTop,
      bottom: messages.scrollHeight - messages.scrollTop - messages.clientHeight
    };
  }

  function restoreMessagesScroll(snapshot) {
    const messages = document.getElementById('messages');
    if (!messages || !snapshot) return;
    messages.scrollTop = snapshot.top;
  }

  function centerStoryActiveChoice(root = document) {
    const rail = root.querySelector?.('.story-text-choice-rail');
    const active = rail?.querySelector('.active');
    if (!rail || !active) return;
    const left = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }

  function renderApp(options = {}) {
    const scrollSnapshot = captureMessagesScroll();
    const scrollMode = options.scroll || 'preserve';
    app.innerHTML = `
      <div class="app-shell ${state.activePeer ? 'chat-open' : ''}">
        ${renderSidebar()}
        ${renderChatPane()}
      </div>
      <div id="call-dock-slot">${renderCallDock()}</div>
      <div id="toast-slot">${renderToastStack()}</div>
      <div id="action-sheet-slot">${renderActionSheet()}</div>
      <div id="story-menu-slot">${renderStoryMenu()}</div>
      <div id="profile-edit-slot">${renderProfileEditModal()}</div>
      <div id="settings-slot">${renderSettingsModal()}</div>
      <div id="avatar-crop-slot">${renderAvatarCropper()}</div>
      <div id="story-editor-slot">${renderStoryEditor()}</div>
      <div id="story-viewer-slot">${renderStoryViewer()}</div>
      <div id="media-viewer-slot">${renderMediaViewer()}</div>
    `;
    state.tabTransition = false;
    setTimeout(() => {
      resizeComposerInput();
      if (state.storyEditor?.textEditing) {
        const storyText = document.getElementById('story-editor-text');
        storyText?.focus({ preventScroll: true });
        storyText?.setSelectionRange?.(storyText.value.length, storyText.value.length);
        resizeStoryTextInput(storyText);
        centerStoryActiveChoice();
      }
      if (state.highlightMessageId) scrollHighlightedMessage();
      else if (scrollMode === 'bottom') scrollMessagesToBottom();
      else restoreMessagesScroll(scrollSnapshot);
      attachCallStreams();
      attachStoryEditorVideo();
      attachStoryViewerVideo();
      state.chatReturnAnimation = false;
    }, 0);
  }

  function updateSlot(id, html) {
    const slot = document.getElementById(id);
    if (!slot) return false;
    slot.innerHTML = html;
    return true;
  }

  function updateActionSheetSlot() {
    return updateSlot('action-sheet-slot', renderActionSheet());
  }

  function updateStoryMenuSlot() {
    return updateSlot('story-menu-slot', renderStoryMenu());
  }

  function updateProfileModalSlots() {
    updateSlot('profile-edit-slot', renderProfileEditModal());
    updateSlot('settings-slot', renderSettingsModal());
    updateSlot('avatar-crop-slot', renderAvatarCropper());
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

  function updateMediaViewerSlot() {
    return updateSlot('media-viewer-slot', renderMediaViewer());
  }

  function updateRecommendationsSection() {
    const current = document.querySelector('.suggestion-section');
    if (!current) return false;
    const template = document.createElement('template');
    template.innerHTML = renderRecommendations().trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    return true;
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="side-content tab-content ${state.tabTransition ? `animate-tab ${state.tabDirection === 'right' ? 'from-right' : 'from-left'}` : ''}" data-tab="${esc(state.tab)}">
          ${state.tab === 'chats' ? renderChatsPanel() : state.tab === 'search' ? renderSearchPanel() : state.tab === 'notifications' ? renderNotificationsPage() : renderProfilePanel()}
        </div>
        <nav class="bottom-tabs" aria-label="Main navigation">
          ${navButton('chats', 'Messages', 'messages')}
          ${navButton('search', 'Search', 'search')}
          ${navButton('profile', 'Profile', 'profile')}
        </nav>
      </aside>
    `;
  }

  function renderChatsPanel() {
    const query = state.conversationQuery.trim();
    const chatRows = state.chats.length ? state.chats.map((chat) => {
      const unread = state.unreadByPeer[chat.peer.id] || 0;
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
        const label = mine ? 'You' : (result.sender?.displayName || result.peer.displayName);
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
      <section class="messages-head">
        <div class="messages-search-row">
          <input class="search-input conversation-search" id="conversation-search" placeholder="Search conversations" autocomplete="off" value="${esc(state.conversationQuery)}">
          <button class="icon-btn notification-btn" title="Notifications" aria-label="Notifications" data-action="open-notifications">
            ${icon('bell')}
            ${state.pendingRequestCount ? '<span class="red-dot"></span>' : ''}
          </button>
        </div>
      </section>
      ${renderNotificationPermissionPrompt()}
      <section class="panel-heading">
        <h2>Messages</h2>
      </section>
      <section class="chat-list">
        ${query ? searchRows : chatRows}
      </section>
    `;
  }

  function renderSearchPanel() {
    if (state.searchProfileOpen && state.publicProfile) {
      return state.searchProfileSocialView
        ? renderSearchProfileSocialPage(state.publicProfile)
        : renderSearchProfilePage(state.publicProfile);
    }
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
          <section class="search-discover">
            <div class="section-heading">
              <h2>Suggested for you</h2>
              <small>People you may know</small>
            </div>
            <div class="suggested-user-list">
              ${recommendations.length
                ? recommendations.slice(0, 10).map((user) => renderAccountRow(user, { dismissible: true })).join('')
                : `<div class="search-empty">${icon('profile')}<strong>No suggestions yet</strong><small>Try searching for a username.</small></div>`}
            </div>
          </section>
        `}
      </section>
    `;
  }

  function renderSearchProfilePage(user) {
    const story = activeProfileStory(user);
    return `
      <section class="search-profile-page">
        <header class="page-header search-profile-header">
          <button class="icon-btn" data-action="close-search-profile" aria-label="Back">${icon('back')}</button>
          <h2>@${esc(user.username)}</h2>
          <button class="icon-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}" aria-label="Report user">${icon('more')}</button>
        </header>
        <section class="search-profile-hero">
          ${story ? `
            <button class="avatar big-avatar story-avatar-btn" data-action="view-story" data-story-id="${esc(story.id)}" aria-label="View story">
              ${user.avatar?.url ? `<img src="${esc(user.avatar.url)}" alt="">` : esc(initials(user))}
              <span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>
            </button>
          ` : `<span class="avatar big-avatar">${user.avatar?.url ? `<img src="${esc(user.avatar.url)}" alt="">` : esc(initials(user))}</span>`}
          <div class="search-profile-copy">
            <strong>${esc(user.displayName)}</strong>
            <span>@${esc(user.username)}</span>
            <div class="social-stats">
              ${user.followersVisible
                ? `<button type="button" class="social-stat-btn" data-action="open-search-social" data-social="followers"><strong>${user.followerCount ?? 0}</strong> followers</button><button type="button" class="social-stat-btn" data-action="open-search-social" data-social="following"><strong>${user.followingCount ?? 0}</strong> following</button>`
                : '<span>Followers private</span>'}
            </div>
            ${user.bio ? `<p>${esc(user.bio)}</p>` : ''}
          </div>
        </section>
        <div class="search-profile-actions">${renderSearchProfileActions(user)}</div>
        ${renderHighlights(user, false)}
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
          <h2>${view === 'followers' ? 'Followers' : 'Following'}</h2>
        </header>
        <div class="segmented social-switch is-${view}">
          <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-search-social" data-social="followers">Followers</button>
          <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-search-social" data-social="following">Following</button>
        </div>
        <div class="social-user-list">
          ${users.length ? users.map((item) => renderAccountRow(item)).join('') : `<div class="empty-state">No ${view} yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderProfilePanel() {
    if (state.profileSocialView) return renderProfileSocialPage();
    const profileUrl = `${location.origin}/u/${state.me.username}`;
    const story = activeProfileStory(state.me);
    return `
      <section class="profile-top-actions">
        <button class="icon-btn" data-action="open-settings" aria-label="Settings">${icon('menu')}</button>
      </section>
      <section class="profile-hero">
        <div class="profile-avatar-wrap">
          <button class="avatar profile-avatar-btn" data-action="${story ? 'view-story' : 'avatar-menu'}" ${story ? `data-story-id="${esc(story.id)}"` : ''} title="${story ? 'View your story' : 'Profile picture and story'}">
            ${state.me.avatar?.url ? `<img src="${esc(state.me.avatar.url)}" alt="">` : esc(initials(state.me))}
            ${story ? `<span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>` : ''}
          </button>
          <button class="profile-avatar-add" data-action="avatar-menu" aria-label="Add story or change profile picture">+</button>
        </div>
        <div>
          <strong>${esc(state.me.displayName)}</strong>
          <span class="profile-username">@${esc(state.me.username)} <button class="icon-inline-btn" data-action="open-profile-edit" aria-label="Edit profile">${icon('edit')}</button></span>
          <div class="social-stats">
            <button type="button" class="social-stat-btn" data-action="open-social" data-social="followers"><strong>${state.me.followerCount ?? 0}</strong> followers</button>
            <button type="button" class="social-stat-btn" data-action="open-social" data-social="following"><strong>${state.me.followingCount ?? 0}</strong> following</button>
          </div>
          ${state.me.bio ? `<p class="profile-bio">${esc(state.me.bio)}</p>` : ''}
          <div class="toolbar profile-hero-actions">
            <button class="mini-btn" data-action="show-profile-link" data-link="${esc(profileUrl)}">${icon('link')} Link</button>
          </div>
        </div>
        <input id="avatar-input" type="file" accept="image/*" hidden>
        <input id="story-input" type="file" accept="image/*,video/*" hidden>
      </section>
      ${renderHighlights(state.me, true)}
      <section class="profile-fill">
        <h2>Activity</h2>
        <div class="profile-activity-grid">
          <span><strong>${state.contacts.length}</strong><small>friends</small></span>
          <span><strong>${state.me.stories?.length || 0}</strong><small>stories</small></span>
          <span><strong>${state.chats.length}</strong><small>chats</small></span>
        </div>
      </section>
      ${renderRecommendations()}
    `;
  }

  function renderProfileSocialPage() {
    const view = state.profileSocialView === 'following' ? 'following' : 'followers';
    const users = view === 'followers' ? (state.me.followers || []) : (state.me.following || []);
    const empty = view === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
    return `
      <section class="social-page">
        <header class="page-header">
          <button class="icon-btn" data-action="close-social" aria-label="Back">${icon('back')}</button>
          <h2>${view === 'followers' ? 'Followers' : 'Following'}</h2>
        </header>
        <div class="segmented social-switch is-${view}">
          <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-social" data-social="followers">Followers</button>
          <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-social" data-social="following">Following</button>
        </div>
        <div class="social-user-list">
          ${users.length ? users.map((item) => `
            <article class="person-card social-user-row">
              ${avatarHtml(item)}
              <span class="person">
                <strong>${esc(item.displayName)}</strong>
                <small>@${esc(item.username)}${item.bio ? ' - ' + esc(item.bio) : ''}</small>
              </span>
              <button class="mini-btn" data-action="${view === 'followers' ? 'remove-follower' : 'unfollow-user'}" data-user-id="${esc(item.id)}">${view === 'followers' ? 'Remove' : 'Unfollow'}</button>
            </article>
          `).join('') : `<div class="empty-state">${empty}</div>`}
        </div>
      </section>
    `;
  }

  function renderRecommendations() {
    const recommendations = visibleRecommendations();
    return `
      <section class="suggestion-section">
        <button class="suggestion-toggle" data-action="toggle-recommendations">
          <span>Suggested for you</span>
          <span class="chevron ${state.recommendationsOpen ? 'open' : ''}">${icon('chevron')}</span>
        </button>
        ${state.recommendationsOpen ? `
          <div class="recommendation-row">
            ${recommendations.length ? recommendations.map((user) => `
              <article class="recommend-card">
                <button class="recommend-dismiss" title="Hide" aria-label="Hide recommendation" data-action="dismiss-recommendation" data-user-id="${esc(user.id)}">${icon('x')}</button>
                ${avatarHtml(user)}
                <strong>${esc(user.displayName)}</strong>
                <small>@${esc(user.username)}${user.mutualCount ? ` - ${esc(user.mutualCount)} mutual` : ''}</small>
                <button class="mini-btn follow-btn" data-action="add-contact" data-username="${esc(user.username)}">Follow</button>
              </article>
            `).join('') : '<p class="hint">Friends of friends will appear here after you add more people.</p>'}
          </div>
        ` : ''}
      </section>
    `;
  }

  function visibleRecommendations() {
    const hidden = new Set(state.hiddenRecommendations || []);
    return state.recommendations.filter((user) => !hidden.has(user.id));
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

  function storyTextToolPanel(editor) {
    const colors = ['#ffffff', '#111111', '#ff304f', '#ff4fa3', '#ff8a00', '#ffd166', '#4fd2c2', '#00a8ff', '#6c63ff', '#9f7cff'];
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
      ['aurora', 'Aurora', '#064e3b', '#38bdf8'],
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
    const colors = ['#ffffff', '#111111', '#ff304f', '#ff4fa3', '#ff8a00', '#ffd166', '#4fd2c2', '#00a8ff', '#6c63ff'];
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
            <button class="story-top-btn ${editor.activeTool === tool ? 'active' : ''}" data-action="story-tool" data-tool="${tool}" title="${esc(label)}" aria-label="${esc(label)}">
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
        <button class="${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="Like story">
          ${icon('heart')}<span>${story.likeCount || 0}</span>
        </button>
        <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="Comments">
          ${icon('comment')}<span>${story.commentCount || 0}</span>
        </button>
      </div>
    `;
  }

  function renderHighlights(user, own) {
    const highlights = (user.stories || []).filter((story) => story.saved);
    if (!own && !highlights.length) return '';
    return `
      <section class="highlight-strip">
        <div class="highlight-head">
          <strong>Highlights</strong>
        </div>
        <div class="highlight-row">
          ${own ? `
            <button class="highlight-add" data-action="open-story-create" aria-label="Add highlight">
              <span>+</span>
              <small>New</small>
            </button>
          ` : ''}
          ${highlights.map((story) => `
            <article class="highlight-item">
              <button class="highlight-media" data-action="view-story" data-story-id="${esc(story.id)}">
                ${renderStoryMedia(story, true)}
              </button>
              ${renderStoryEngagement(story, true)}
              <small>${esc(shortTime(story.createdAt))}</small>
            </article>
          `).join('') || (own ? '' : '<p class="hint">Save a story to keep it here.</p>')}
        </div>
      </section>
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

  function renderAccountAction(user) {
    const knownUser = userById(user?.id) || user;
    if (!knownUser || knownUser.id === state.me?.id) return '<button class="mini-btn account-action" disabled>You</button>';
    if (knownUser.isContact && !knownUser.isFollowing) return `<button class="mini-btn account-action primary-action" data-action="follow-user" data-user-id="${esc(knownUser.id)}">Follow</button>`;
    if (knownUser.isContact) return `<button class="mini-btn account-action" data-action="open-chat" data-user-id="${esc(knownUser.id)}">Message</button>`;
    if (knownUser.isFollowing) return `<button class="mini-btn account-action" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}">Unfollow</button>`;
    if (knownUser.incomingRequest) return `<button class="mini-btn account-action primary-action" data-action="accept-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Accept</button>`;
    if (knownUser.outgoingRequest) return '<button class="mini-btn account-action" disabled>Requested</button>';
    if (knownUser.hasBlocked || knownUser.blockedBy) return '<button class="mini-btn account-action" disabled>Blocked</button>';
    return `<button class="mini-btn account-action primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Follow</button>`;
  }

  function renderAccountRow(user, options = {}) {
    return `
      <article class="account-row">
        <button class="account-identity" data-action="view-user-profile" data-username="${esc(user.username)}">
          ${avatarHtml(user)}
          <span class="person">
            <strong>${esc(user.displayName)}</strong>
            <small>@${esc(user.username)}${user.mutualCount ? ` - ${esc(user.mutualCount)} mutual` : ''}</small>
          </span>
        </button>
        <span class="account-row-actions">
          ${renderAccountAction(user)}
          ${options.dismissible ? `<button class="account-dismiss" title="Hide" aria-label="Hide recommendation" data-action="dismiss-recommendation" data-user-id="${esc(user.id)}">${icon('x')}</button>` : ''}
        </span>
      </article>
    `;
  }

  function renderSearchProfileActions(user) {
    const knownUser = userById(user?.id) || user;
    if (!knownUser || knownUser.id === state.me?.id) return '<button class="mini-btn" disabled>This is you</button>';
    if (knownUser.isContact) {
      return `
        <button class="mini-btn profile-primary-action" data-action="open-chat" data-user-id="${esc(knownUser.id)}">Message</button>
        ${knownUser.isFollowing
          ? `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}">Unfollow</button>`
          : `<button class="mini-btn" data-action="follow-user" data-user-id="${esc(knownUser.id)}">Follow</button>`}
      `;
    }
    if (knownUser.isFollowing) {
      return `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(knownUser.id)}">Unfollow</button><button class="mini-btn profile-primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Add friend</button>`;
    }
    if (knownUser.incomingRequest) {
      return `
        <button class="mini-btn profile-primary-action" data-action="accept-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Accept</button>
        <button class="mini-btn" data-action="decline-request" data-request-id="${esc(knownUser.incomingRequest.id)}">Decline</button>
      `;
    }
    if (knownUser.outgoingRequest) return '<button class="mini-btn" disabled>Requested</button>';
    if (knownUser.hasBlocked || knownUser.blockedBy) return '<button class="mini-btn" disabled>Blocked</button>';
    return `<button class="mini-btn profile-primary-action" data-action="add-contact" data-username="${esc(knownUser.username)}">Follow</button>`;
  }

  function renderPublicProfileCard(user) {
    const isMe = user.id === state.me?.id;
    let controls = '<button class="mini-btn" disabled>You</button>';
    const reportControl = !isMe ? `<button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>` : '';
    if (!isMe) {
      if (user.isContact) controls = `<button class="mini-btn" data-action="open-chat" data-user-id="${esc(user.id)}">Message</button>${user.isFollowing ? `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(user.id)}">Unfollow</button>` : `<button class="mini-btn follow-btn" data-action="follow-user" data-user-id="${esc(user.id)}">Follow</button>`}`;
      else if (user.isFollowing) controls = `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(user.id)}">Unfollow</button><button class="mini-btn" data-action="add-contact" data-username="${esc(user.username)}">Add friend</button>`;
      else if (user.incomingRequest) controls = `<button class="mini-btn" data-action="accept-request" data-request-id="${esc(user.incomingRequest.id)}">Accept</button><button class="mini-btn" data-action="decline-request" data-request-id="${esc(user.incomingRequest.id)}">Decline</button>`;
      else if (user.outgoingRequest) controls = '<button class="mini-btn" disabled>Requested</button>';
      else if (user.hasBlocked || user.blockedBy) controls = '<button class="mini-btn" disabled>Blocked</button>';
      else controls = `<button class="mini-btn follow-btn" data-action="add-contact" data-username="${esc(user.username)}">Follow</button>`;
    }
    return `
      <article class="person-card">
        ${avatarHtml(user)}
        <span class="person">
          <strong>${esc(user.displayName)}</strong>
          <small>@${esc(user.username)}${user.bio ? ' - ' + esc(user.bio) : ''}</small>
        </span>
        <span class="toolbar">
          ${controls}
          ${reportControl}
        </span>
      </article>
    `;
  }

  function renderChatPane() {
    if (!state.activePeer) {
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

    return `
      <main class="chat-pane ${state.chatReturnAnimation ? 'chat-returning' : ''}">
        <header class="chat-header">
          <button class="icon-btn back-btn" title="Back" aria-label="Back" data-action="back">${icon('back')}</button>
          <button class="chat-profile-button" data-action="open-chat-profile">
            ${avatarHtml(state.activePeer)}
          </button>
          <button class="chat-title" data-action="open-chat-profile">
            <strong>${esc(state.activePeer.displayName)}</strong>
            <small>@${esc(state.activePeer.username)}</small>
          </button>
          <div class="toolbar" style="margin-left:auto">
            <button class="icon-btn" title="Voice call" aria-label="Voice call" data-action="audio-call">${icon('phone')}</button>
            <button class="icon-btn" title="Video call" aria-label="Video call" data-action="video-call">${icon('video')}</button>
          </div>
        </header>
        <section class="messages" id="messages">
          ${renderMessagesList()}
        </section>
        <footer>
          ${state.stickerPanel ? renderStickerPanel() : ''}
          <div class="composer">
            ${state.replyTo ? `
              <div class="replying-to">
                <span>Replying to: ${esc(describeMessage(state.replyTo)).slice(0, 120)}</span>
                <button class="icon-btn" title="Cancel reply" aria-label="Cancel reply" data-action="clear-reply">${icon('x')}</button>
              </div>
            ` : ''}
            <div class="composer-row">
              <button class="icon-btn" title="Attach file" aria-label="Attach file" data-action="attach-open">${icon('file')}</button>
              <button class="icon-btn" title="Stickers" aria-label="Stickers" data-action="sticker-toggle">${icon('sticker')}</button>
              <textarea id="composer-text" class="composer-input" rows="1" placeholder="Message ${esc(state.activePeer.displayName)}">${esc(state.composerDrafts[state.activePeer.id] || '')}</textarea>
              <button class="icon-btn" title="Hold to record voice" aria-label="Hold to record voice" data-action="record-voice">${icon('mic')}</button>
              <button class="primary send-btn" title="Send" aria-label="Send" data-action="send-text">${icon('send')}</button>
              <input id="file-input" type="file" hidden>
            </div>
          </div>
        </footer>
      </main>
    `;
  }

  function renderChatProfilePane() {
    const peer = state.activePeer;
    const story = activeProfileStory(peer);
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
        <section class="chat-profile-content">
          <div class="peer-profile-hero">
            ${story ? `
              <button class="avatar big-avatar story-avatar-btn" data-action="view-story" data-story-id="${esc(story.id)}" aria-label="View story">
                ${peer.avatar?.url ? `<img src="${esc(peer.avatar.url)}" alt="">` : esc(initials(peer))}
                <span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>
              </button>
            ` : `
              <span class="avatar big-avatar">
                ${peer.avatar?.url ? `<img src="${esc(peer.avatar.url)}" alt="">` : esc(initials(peer))}
              </span>
            `}
            <strong>${esc(peer.displayName)}</strong>
            <span>@${esc(peer.username)}</span>
            <div class="social-stats centered">
              ${peer.followersVisible
                ? `<button type="button" class="social-stat-btn" data-action="open-peer-social" data-social="followers"><strong>${peer.followerCount ?? 0}</strong> followers</button><button type="button" class="social-stat-btn" data-action="open-peer-social" data-social="following"><strong>${peer.followingCount ?? 0}</strong> following</button>`
                : '<span>Followers private</span>'}
            </div>
            <p>${esc(peer.bio || 'No bio yet.')}</p>
            <div class="toolbar">
              ${renderRelationshipButton(peer)}
            </div>
          </div>
          ${renderHighlights(peer, false)}
          <section class="panel-card">
            <h2>Chat</h2>
            <div class="toolbar">
              <button class="secondary" data-action="export-chat" data-format="json">Save chatlog JSON</button>
              <button class="secondary" data-action="export-chat" data-format="html">Save chatlog HTML</button>
            </div>
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

  function renderChatProfileSocialPage(peer) {
    const view = state.chatProfileSocialView === 'following' ? 'following' : 'followers';
    const users = view === 'followers' ? (peer.followers || []) : (peer.following || []);
    const empty = view === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
    return `
      <main class="chat-pane profile-pane">
        <header class="chat-header">
          <button class="icon-btn" title="Back" aria-label="Back" data-action="close-peer-social">${icon('back')}</button>
          <div class="chat-title">
            <strong>${esc(view === 'followers' ? 'Followers' : 'Following')}</strong>
            <small>@${esc(peer.username)}</small>
          </div>
        </header>
        <section class="chat-profile-content">
          <div class="segmented social-switch is-${view}">
            <button type="button" class="${view === 'followers' ? 'active' : ''}" data-action="open-peer-social" data-social="followers">Followers</button>
            <button type="button" class="${view === 'following' ? 'active' : ''}" data-action="open-peer-social" data-social="following">Following</button>
          </div>
          <div class="social-user-list">
            ${users.length ? users.map((item) => `
              <article class="person-card social-user-row">
                ${avatarHtml(item)}
                <span class="person">
                  <strong>${esc(item.displayName)}</strong>
                  <small>@${esc(item.username)}${item.bio ? ' - ' + esc(item.bio) : ''}</small>
                </span>
              </article>
            `).join('') : `<div class="empty-state">${empty}</div>`}
          </div>
        </section>
      </main>
    `;
  }

  function renderMessage(message) {
    const mine = message.senderId === state.me.id;
    const highlighted = state.highlightMessageId === message.id;
    const stickerMessage = message.kind === 'sticker' && !message.deletedAt;
    const mediaMessage = ['image', 'video'].includes(message.kind) && message.attachment && !message.deletedAt;
    return `
      <article class="message ${mine ? 'mine' : 'theirs'} ${message.deletedAt ? 'deleted' : ''} ${highlighted ? 'highlighted' : ''} ${stickerMessage ? 'sticker-message' : ''} ${mediaMessage ? 'media-message' : ''}" data-message-id="${esc(message.id)}">
        <div class="bubble">
          ${message.replyPreview ? `<div class="reply-preview">${esc(describeMessage(message.replyPreview)).slice(0, 160)}</div>` : ''}
          ${renderMessageBody(message)}
          <div class="swipe-time">${esc(formatTime(message.createdAt))}</div>
        </div>
      </article>
    `;
  }

  function renderTypingIndicator() {
    if (!state.activePeer || state.typingPeerId !== state.activePeer.id) return '';
    return `
      <article class="typing-message">
        <div class="typing-bubble">typing...</div>
      </article>
    `;
  }

  function renderMessagesList() {
    const olderLoader = state.loadingOlderMessages ? '<div class="older-loader"><span class="spinner"></span></div>' : '';
    if (state.messages.length) return `${olderLoader}${state.messages.map(renderMessage).join('')}${renderTypingIndicator()}`;
    if (state.activePeer && state.typingPeerId === state.activePeer.id) return renderTypingIndicator();
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
    if (user.isContact) return `${user.isFollowing ? `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(user.id)}">Unfollow</button>` : `<button class="mini-btn follow-btn" data-action="follow-user" data-user-id="${esc(user.id)}">Follow</button>`}<button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>`;
    if (user.isFollowing) return `<button class="mini-btn" data-action="unfollow-user" data-user-id="${esc(user.id)}">Unfollow</button><button class="mini-btn" data-action="add-contact" data-username="${esc(user.username)}">Add friend</button><button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>`;
    if (user.incomingRequest) {
      return `
        <button class="mini-btn" data-action="accept-request" data-request-id="${esc(user.incomingRequest.id)}">Accept</button>
        <button class="mini-btn" data-action="decline-request" data-request-id="${esc(user.incomingRequest.id)}">Decline</button>
      `;
    }
    if (user.outgoingRequest) return '<button class="mini-btn" disabled>Requested</button>';
    if (user.hasBlocked || user.blockedBy) return '<button class="mini-btn" disabled>Blocked</button>';
    return `<button class="mini-btn follow-btn" data-action="add-contact" data-username="${esc(user.username)}">Follow</button><button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>`;
  }

  function renderMessageBody(message) {
    if (message.deletedAt) return '<div class="message-text">Message deleted</div>';
    const attachment = message.attachment;
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
        <div class="sticker-placeholder">
          <span class="person">
            <strong>Sticker waiting</strong>
            <small>Download it to save and view on this device.</small>
          </span>
          <button class="mini-btn" data-action="download-sticker" data-message-id="${esc(message.id)}">Download</button>
        </div>
      `;
    }
    return `<div class="message-text">${esc(message.text || '')}</div>`;
  }

  function renderStickerPanel() {
    return `
      <section class="sticker-panel">
        <div class="toolbar">
          <input class="search-input" id="sticker-text" placeholder="Create text sticker">
          <button class="secondary" type="button" data-action="create-text-sticker">Create</button>
          <button class="secondary" type="button" data-action="sticker-file-open">Image</button>
          <input id="sticker-file-input" type="file" accept="image/*" hidden>
        </div>
        <div class="sticker-grid">
          ${state.stickers.length ? state.stickers.map((sticker) => `
            <button class="sticker-tile" title="${esc(sticker.name)}" data-action="send-sticker" data-sticker-id="${esc(sticker.id)}">
              <img src="${esc(sticker.dataUrl)}" alt="${esc(sticker.name)}">
            </button>
          `).join('') : '<p class="hint">Create or download stickers to keep them on this device.</p>'}
        </div>
      </section>
    `;
  }

  function renderNotificationsPage() {
    const requests = state.requests.length ? state.requests.map((request) => `
      <article class="notification-row">
        ${avatarHtml(request.from)}
        <span class="person">
          <strong>${esc(request.from.displayName)}</strong>
          <small>@${esc(request.from.username)} requested to follow you</small>
        </span>
        <span class="toolbar">
          <button class="mini-btn" data-action="accept-request" data-request-id="${esc(request.id)}">Accept</button>
          <button class="mini-btn danger" data-action="decline-request" data-request-id="${esc(request.id)}">Decline</button>
        </span>
      </article>
    `).join('') : '<p class="hint">No unanswered requests.</p>';
    const visibleNotes = state.notifications.filter((note) => ['request_accepted', 'new_follower', 'mention'].includes(note.type));
    const recent = visibleNotes.length ? visibleNotes.map((note) => `
      <article class="notification-row">
        ${avatarHtml(note.actor)}
        <span class="person">
          <strong>${esc(note.actor?.displayName || 'Update')}</strong>
          <small>${esc(note.text || note.type)} - ${esc(shortTime(note.createdAt))}</small>
        </span>
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

  function renderActionSheet() {
    const sheet = state.actionSheet;
    if (!sheet) return '';
    const peer = sheet.peerId ? userById(sheet.peerId) : null;
    const message = sheet.messageId ? state.messages.find((item) => item.id === sheet.messageId) : null;
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
        ${message.senderId === state.me.id && !message.deletedAt ? `<button class="danger-text" data-action="delete-message" data-message-id="${esc(message.id)}">${icon('trash')} Delete message</button>` : ''}
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
    if (sheet.type === 'sticker-save') {
      const message = state.messages.find((item) => item.id === sheet.messageId);
      body = `
        <div class="sheet-note">
          <strong>Sticker</strong>
          <small>Save it to your sticker collection on this device.</small>
        </div>
        ${message?.attachment ? `<button data-action="save-message-sticker" data-message-id="${esc(message.id)}">Save sticker</button>` : ''}
      `;
    }
    if (sheet.type === 'profile-link') {
      body = `
        <input class="search-input" value="${esc(sheet.link)}" readonly>
        <button data-action="copy-profile-link" data-link="${esc(sheet.link)}">${icon('link')} Copy to clipboard</button>
      `;
    }
    if (sheet.type === 'story-comments') {
      const story = storyById(sheet.storyId);
      body = story ? `
        <header class="story-comments-head">
          <strong>Comments</strong>
          <button class="story-sheet-icon" data-action="close-overlays" aria-label="Close comments">${icon('x')}</button>
        </header>
        <div class="story-comment-list">
          ${(story.comments || []).length ? story.comments.map((comment) => `
            <article>
              ${avatarHtml(comment.user)}
              <span>
                <strong>@${esc(comment.user?.username || 'user')} <time>${esc(shortTime(comment.createdAt))}</time></strong>
                <small>${esc(comment.text)}</small>
              </span>
            </article>
          `).join('') : '<p class="story-comments-empty">No comments yet.</p>'}
        </div>
        <div class="story-comment-box">
          <input id="story-comment-input" maxlength="280" placeholder="Add a comment..." autocomplete="off">
          <button data-action="submit-story-comment" data-story-id="${esc(story.id)}" aria-label="Post comment">${icon('send')}</button>
        </div>
      ` : '<p class="hint">Story not found.</p>';
    }
    if (sheet.type === 'story-owner') {
      const story = storyById(sheet.storyId);
      body = story ? `
        <header class="story-owner-menu-head">
          <strong>Story</strong>
          <button class="story-sheet-icon" data-action="close-overlays" aria-label="Close story menu">${icon('x')}</button>
        </header>
        ${story.saved
          ? '<span class="story-owner-saved">Saved to highlights</span>'
          : `<button class="story-owner-action" data-action="save-story" data-story-id="${esc(story.id)}">${icon('download')}<span>Save to highlights</span></button>`}
        <button class="story-owner-action danger-text" data-action="delete-story" data-story-id="${esc(story.id)}">${icon('trash')}<span>Delete story</span></button>
      ` : '';
    }
    const compact = ['story-comments', 'story-owner'].includes(sheet.type);
    return `
      <div class="overlay ${state.storyViewer ? 'over-story' : ''} ${state.overlayClosing ? 'closing' : ''}" data-action="close-overlays">
        <section class="action-sheet ${compact ? `compact-sheet ${sheet.type}-sheet` : ''} ${state.overlayClosing ? 'closing' : ''}" data-stop-close>
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

  function renderStoryEditor() {
    const editor = state.storyEditor;
    if (!editor) return '';
    const style = `filter:${storyFilterCss(editor.filter, editor)}; transform:${storyMediaTransformCss(editor)}; object-fit:${storyMediaFit(editor)};`;
    const tools = [
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
            <button class="story-share-pill" data-action="publish-story" ${state.storyPublishing ? 'disabled' : ''}>
              ${avatarHtml(state.me)}
              <strong>${state.storyPublishing ? 'Posting...' : 'Your story'}</strong>
            </button>
            <button class="story-share-send" data-action="publish-story" aria-label="Share story" ${state.storyPublishing ? 'disabled' : ''}>${state.storyPublishing ? '<span class="spinner"></span>' : icon('send')}</button>
          </div>
        `}
      </div>
    `;
  }

  function storyOwnerById(storyId) {
    return storyUsers().find((user) => (user.stories || []).some((story) => story.id === storyId)) || null;
  }

  function renderStoryViewer() {
    const storyId = state.storyViewer?.storyId;
    if (!storyId) return '';
    const story = storyById(storyId);
    const owner = storyOwnerById(storyId);
    if (!story || !owner) return '';
    const stories = (owner.stories || []).filter((item) => (
      item.file && (story.saved
        ? item.saved
        : !item.saved && new Date(item.expiresAt || 0).getTime() > Date.now())
    ));
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
        <div class="story-viewer-actions ${ownStory ? 'own-story-actions' : ''}">
          ${ownStory ? `
            <span class="story-owner-metric">${icon('heart')} ${story.likeCount || 0}</span>
            <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="View comments">${icon('comment')}<small>${story.commentCount || 0}</small></button>
          ` : `
            <div class="story-reply-pill">
              <input id="story-viewer-comment" maxlength="280" placeholder="Reply..." autocomplete="off">
              <button data-action="submit-story-comment" data-story-id="${esc(story.id)}" aria-label="Post comment">${icon('send')}</button>
            </div>
            <button class="${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="Like story">${icon('heart')}</button>
            <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="View comments">${icon('comment')}</button>
          `}
        </div>
      </section>
    `;
  }

  function renderStoryMenu() {
    if (!state.storyMenuOpen) return '';
    const currentStory = activeProfileStory(state.me);
    return `
      <div class="overlay ${state.overlayClosing ? 'closing' : ''}" data-action="close-overlays">
        <section class="action-sheet story-sheet ${state.overlayClosing ? 'closing' : ''}" data-stop-close>
          ${currentStory ? `<button data-action="view-story" data-story-id="${esc(currentStory.id)}">${icon('play')} View story</button>` : ''}
          <button data-action="create-story"><span class="story-aa">Aa</span> Create story</button>
          <button data-action="post-story">${icon('story')} Photo or video</button>
          <button data-action="change-profile-picture">${icon('profile')} Change profile picture</button>
        </section>
      </div>
    `;
  }

  function renderProfileEditModal() {
    if (!state.profileEditOpen) return '';
    return `
      <div class="center-overlay" data-action="close-modal">
        <section class="center-modal" data-stop-close>
          <header class="modal-head">
            <h2>Edit profile</h2>
            <button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button>
          </header>
          <form class="form" data-form="profile-edit">
            <label class="field">Username
              <input name="username" value="${esc(state.me.username)}" maxlength="24" autocomplete="username">
            </label>
            <label class="field">Bio
              <textarea name="bio" maxlength="280">${esc(state.me.bio || '')}</textarea>
            </label>
            <button class="primary" type="submit">Save</button>
          </form>
        </section>
      </div>
    `;
  }

  function renderSettingsModal() {
    if (!state.settingsOpen) return '';
    return `
      <div class="center-overlay" data-action="close-modal">
        <section class="center-modal settings-modal" data-stop-close>
          <header class="modal-head">
            <h2>Settings</h2>
            <button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button>
          </header>
          <section class="settings-block">
            <h3>${icon('lock')} Privacy</h3>
            <label class="switch-row">
              <span>
                <strong>Show followers and following</strong>
                <small>People can see your follower and following counts and lists.</small>
              </span>
              <input type="checkbox" data-action="toggle-profile-privacy" ${state.me.socialPublic ? 'checked' : ''}>
            </label>
            <label class="switch-row">
              <span>
                <strong>Show when searched</strong>
                <small>If a user searches up another user, you appear in the search results.</small>
              </span>
              <input type="checkbox" data-action="toggle-profile-searchable" ${state.me.searchable !== false ? 'checked' : ''}>
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
        </section>
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
    return `
      <div class="center-overlay crop-overlay">
        <section class="crop-modal">
          <header class="modal-head">
            <h2>Crop profile picture</h2>
            <button class="icon-btn" data-action="cancel-avatar-crop" aria-label="Close">${icon('x')}</button>
          </header>
          <div class="crop-stage" id="crop-stage">
            <img src="${esc(state.avatarCrop.dataUrl)}" alt="" style="transform:scale(${esc(state.avatarCrop.zoom || 1)})">
            <div class="crop-mask"></div>
            <div class="crop-circle" style="left:${state.avatarCrop.x}px; top:${state.avatarCrop.y}px; width:${state.avatarCrop.size}px; height:${state.avatarCrop.size}px"></div>
          </div>
          <label class="zoom-control">Zoom
            <input id="avatar-zoom" type="range" min="1" max="3" step="0.01" value="${esc(state.avatarCrop.zoom || 1)}">
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

  async function loadContactsAndChats() {
    const [me, contacts, chats, notifications, recommendations] = await Promise.all([
      api('/api/me'),
      api('/api/contacts'),
      api('/api/chats'),
      api('/api/notifications').catch(() => ({ pendingRequestCount: 0, requests: [], notifications: [] })),
      api('/api/users/recommendations').catch(() => ({ users: [] }))
    ]);
    state.me = me.user;
    state.twoFactorEnabled = me.twoFactorEnabled;
    state.isModerator = Boolean(me.isModerator);
    state.contacts = contacts.users;
    state.chats = chats.chats;
    state.pendingRequestCount = notifications.pendingRequestCount || 0;
    state.requests = notifications.requests || [];
    state.notifications = notifications.notifications || [];
    state.recommendations = recommendations.users || [];
    if (state.activePeer) {
      state.activePeer = userById(state.activePeer.id) || state.activePeer;
    }
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

  async function submitGif(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const data = await api('/api/gifs', {
      method: 'POST',
      body: {
        title: state.storyEditor?.gifSubmissionTitle || file.name.replace(/\.[^.]+$/, ''),
        tags: state.storyEditor?.gifSubmissionTags || '',
        file: {
          name: file.name || 'animation.gif',
          type: file.type || mimeFromDataUrl(dataUrl),
          dataUrl,
          lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
        }
      }
    });
    await loadGifPool(state.storyEditor?.gifQuery || '');
    if (data.pending) alert('GIF submitted for moderator review.');
    if (state.storyEditor) updateStoryEditorView();
  }

  async function reviewGif(gifId, decision) {
    await api(`/api/gifs/${encodeURIComponent(gifId)}/${decision === 'approve' ? 'approve' : 'reject'}`, { method: 'POST' });
    await loadGifPool();
    updateProfileModalSlots();
  }

  async function openChat(userId, highlightMessageId = null) {
    const peer = userById(userId);
    if (!peer) return;
    state.activePeer = peer;
    state.chatProfileOpen = false;
    state.chatProfileSocialView = null;
    state.replyTo = null;
    state.stickerPanel = false;
    state.typingPeerId = null;
    state.highlightMessageId = highlightMessageId;
    state.hasOlderMessages = false;
    state.loadingOlderMessages = false;
    delete state.unreadByPeer[userId];
    const data = await api(`/api/chats/${encodeURIComponent(userId)}/messages?limit=200`);
    state.messages = data.messages;
    state.hasOlderMessages = Boolean(data.hasMore);
    renderApp({ scroll: highlightMessageId ? 'preserve' : 'bottom' });
  }

  function userById(userId) {
    if (!userId) return null;
    if (state.me?.id === userId) return state.me;
    const pools = [
      state.contacts,
      state.chats.map((chat) => chat.peer),
      state.searchResults,
      state.conversationResults.flatMap((result) => [result.peer, result.sender]),
      state.recommendations,
      state.requests.flatMap((request) => [request.from, request.to]),
      state.notifications.map((note) => note.actor),
      state.publicProfile ? [state.publicProfile] : []
    ];
    return pools.flat().find((user) => user?.id === userId) || null;
  }

  function upsertMessage(message) {
    const index = state.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) state.messages[index] = message;
    else state.messages.push(message);
    state.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async function loadOlderMessages() {
    if (!state.activePeer || state.loadingOlderMessages || !state.hasOlderMessages || !state.messages.length) return;
    const messagesEl = document.getElementById('messages');
    const previousHeight = messagesEl?.scrollHeight || 0;
    const previousTop = messagesEl?.scrollTop || 0;
    state.loadingOlderMessages = true;
    updateMessagesList({ scroll: 'preserve' });
    try {
      const before = encodeURIComponent(state.messages[0].createdAt);
      const data = await api(`/api/chats/${encodeURIComponent(state.activePeer.id)}/messages?limit=200&before=${before}`);
      const existing = new Set(state.messages.map((message) => message.id));
      const older = (data.messages || []).filter((message) => !existing.has(message.id));
      state.messages = [...older, ...state.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      state.hasOlderMessages = Boolean(data.hasMore);
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
      const [chats, notifications, recommendations] = await Promise.all([
        api('/api/chats'),
        api('/api/notifications').catch(() => ({ pendingRequestCount: state.pendingRequestCount, requests: state.requests, notifications: state.notifications })),
        api('/api/users/recommendations').catch(() => ({ users: state.recommendations }))
      ]);
      state.chats = chats.chats;
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
    renderApp();
  }

  async function acceptRequest(requestId) {
    await api(`/api/requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' });
    await loadContactsAndChats();
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
    if (state.publicProfile?.id === updatedUser.id) state.publicProfile = merge(state.publicProfile);
    if (state.activePeer?.id === updatedUser.id) state.activePeer = merge(state.activePeer);
  }

  async function setFollowing(userId, following) {
    const data = await api(`/api/follows/${encodeURIComponent(userId)}`, { method: following ? 'POST' : 'DELETE' });
    mergeKnownUser(data.user);
    if (data.me) state.me = data.me;
    await loadContactsAndChats();
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
    if (state.activePeer?.id === userId) state.activePeer = userById(userId) || state.activePeer;
    state.actionSheet = null;
    renderApp();
  }

  async function unblockUser(userId) {
    await api(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    await loadContactsAndChats();
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
      username: state.me.username,
      displayName: state.me.displayName,
      bio: state.me.bio || '',
      socialPublic: state.me.socialPublic,
      searchable: state.me.searchable !== false,
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
      username: state.me.username,
      socialPublic: state.me.socialPublic,
      searchable: state.me.searchable !== false,
      avatar: {
        name,
        type: mimeFromDataUrl(dataUrl),
        dataUrl,
        lastModified: lastModified ? new Date(lastModified).toISOString() : null
      }
    };
    const data = await api('/api/me/profile', { method: 'PATCH', body });
    state.me = data.user;
    state.storyMenuOpen = false;
    state.avatarCrop = null;
    updateStoryMenuSlot();
    updateProfileModalSlots();
    updateSidebar();
  }

  async function beginAvatarCrop(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    state.avatarCrop = {
      dataUrl,
      name: file.name || 'avatar.png',
      lastModified: file.lastModified || Date.now(),
      x: 42,
      y: 42,
      size: 220,
      zoom: 1,
      drag: null
    };
    updateProfileModalSlots();
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

  function updateCropUi() {
    const crop = state.avatarCrop;
    if (!crop) return;
    const circle = document.querySelector('.crop-circle');
    if (circle) {
      circle.style.left = `${crop.x}px`;
      circle.style.top = `${crop.y}px`;
      circle.style.width = `${crop.size}px`;
      circle.style.height = `${crop.size}px`;
    }
    const img = document.querySelector('#crop-stage img');
    if (img) img.style.transform = `scale(${crop.zoom || 1})`;
    const zoom = document.getElementById('avatar-zoom');
    if (zoom) zoom.value = String(crop.zoom || 1);
  }

  async function confirmAvatarCrop() {
    const crop = state.avatarCrop;
    const stage = document.getElementById('crop-stage');
    if (!crop || !stage) return;
    const rect = stage.getBoundingClientRect();
    const img = await loadImage(crop.dataUrl);
    const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight) * (crop.zoom || 1);
    const displayW = img.naturalWidth * scale;
    const displayH = img.naturalHeight * scale;
    const offsetX = (rect.width - displayW) / 2;
    const offsetY = (rect.height - displayH) / 2;
    const sx = Math.max(0, (crop.x - offsetX) / scale);
    const sy = Math.max(0, (crop.y - offsetY) / scale);
    const sourceSize = Math.min(img.naturalWidth - sx, img.naturalHeight - sy, crop.size / scale);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, 512, 512);
    await uploadAvatarData(canvas.toDataURL('image/png'), `cropped-${crop.name.replace(/\.[^.]+$/, '')}.png`, crop.lastModified);
  }

  function createStoryEditorState({ dataUrl, name, type, lastModified, textEditing = false, isBlankStory = false, initialTool = null }) {
    return {
      dataUrl,
      name: name || 'story',
      type: type || 'image/png',
      lastModified: lastModified || Date.now(),
      isVideo: String(type || '').startsWith('video/'),
      isBlankStory,
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

  async function beginStoryEditor(file) {
    if (!file) return;
    state.storyEditor = createStoryEditorState({
      dataUrl: await fileToDataUrl(file),
      name: file.name || 'story',
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified || Date.now()
    });
    state.storyMenuOpen = false;
    updateStoryMenuSlot();
    updateStoryEditorView();
  }

  function beginBlankStoryEditor() {
    state.storyEditor = createStoryEditorState({
      dataUrl: createStoryBackgroundDataUrl('midnight'),
      name: 'story.png',
      type: 'image/png',
      lastModified: Date.now(),
      textEditing: false,
      isBlankStory: true
    });
    state.storyMenuOpen = false;
    updateStoryMenuSlot();
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
        ['#ff304f', '#ff8a00', '#ffd166', '#4fd2c2', '#00a8ff', '#9f7cff'].forEach((color, index, colors) => rainbow.addColorStop(index / (colors.length - 1), color));
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

  async function publishStory() {
    const editor = state.storyEditor;
    if (!editor || state.storyPublishing) return;
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
          } : null
        }
      });
      state.me = data.user;
      state.storyMenuOpen = false;
      state.storyEditor = null;
      updateStoryEditorView();
      updateStoryMenuSlot();
      updateSidebar();
    } finally {
      state.storyPublishing = false;
      if (state.storyEditor === editor) updateStoryEditorView();
    }
  }

  async function saveStory(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/save`, { method: 'POST' });
    state.me = data.user;
    state.actionSheet = null;
    updateActionSheetSlot();
    updateStoryViewerView();
    updateSidebar();
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
    }
  }

  async function viewStory(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/view`, { method: 'POST' });
    replaceStory(data.story);
    state.storyViewer = data.story?.file ? { storyId: data.story.id } : null;
    state.storyMenuOpen = false;
    state.mediaViewer = null;
    updateStoryMenuSlot();
    updateMediaViewerSlot();
    updateStoryViewerView();
    scheduleStoryAdvance(data.story);
  }

  async function navigateStory(direction) {
    const storyId = state.storyViewer?.storyId;
    const owner = storyOwnerById(storyId);
    const currentStory = storyById(storyId);
    const stories = (owner?.stories || []).filter((story) => (
      story.file && (currentStory?.saved
        ? story.saved
        : !story.saved && new Date(story.expiresAt || 0).getTime() > Date.now())
    ));
    const index = stories.findIndex((story) => story.id === storyId);
    const next = stories[index + direction];
    if (!next) {
      clearStoryAdvance();
      state.storyViewer = null;
      updateStoryViewerView();
      return;
    }
    await viewStory(next.id);
  }

  async function toggleStoryLike(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/like`, { method: 'POST' });
    replaceStory(data.story);
    document.querySelectorAll(`[data-action="like-story"][data-story-id="${window.CSS?.escape ? CSS.escape(storyId) : storyId}"]`).forEach((button) => {
      button.classList.toggle('active', data.story.likedByMe);
      const count = button.querySelector('span');
      if (count) count.textContent = String(data.story.likeCount || 0);
    });
    if (state.storyViewer?.storyId === storyId) scheduleStoryAdvance(data.story);
  }

  async function submitStoryComment(storyId) {
    const input = document.getElementById('story-viewer-comment') || document.getElementById('story-comment-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    const commentsOpen = state.actionSheet?.type === 'story-comments' && state.actionSheet.storyId === storyId;
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/comments`, {
      method: 'POST',
      body: { text }
    });
    replaceStory(data.story);
    if (commentsOpen) {
      state.actionSheet = { type: 'story-comments', storyId };
      updateActionSheetSlot();
    } else {
      updateStoryViewerView();
      scheduleStoryAdvance(data.story);
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
    const draft = state.activePeer ? state.composerDrafts[state.activePeer.id] : '';
    const text = (input?.value ?? draft ?? '').trim();
    if (!text || !state.activePeer) return;
    input.value = '';
    delete state.composerDrafts[state.activePeer.id];
    await sendMessage({ kind: 'text', text });
  }

  async function sendMessage(payload) {
    if (!state.activePeer) return;
    const body = {
      kind: payload.kind,
      text: payload.text || '',
      replyTo: state.replyTo?.id || null,
      file: payload.file || null,
      stickerId: payload.stickerId || null
    };
    state.replyTo = null;
    const data = await api(`/api/chats/${encodeURIComponent(state.activePeer.id)}/messages`, {
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
    if (!file || !state.activePeer) return;
    const dataUrl = await fileToDataUrl(file);
    const input = document.getElementById('composer-text');
    const caption = (input?.value ?? state.composerDrafts[state.activePeer.id] ?? '').trim();
    if (input) input.value = '';
    delete state.composerDrafts[state.activePeer.id];
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
    if (!state.activePeer) return;
    location.href = `/api/chats/${encodeURIComponent(state.activePeer.id)}/export?format=${format}`;
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
      renderApp();
      setTimeout(focusUserSearch, 0);
      return;
    }
    const data = await api(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
    if (searchId !== userSearchId || trimmed !== state.userQuery.trim()) return;
    state.searchResults = data.users || [];
    state.userSearching = false;
    renderApp();
    setTimeout(focusUserSearch, 0);
  }

  async function openSearchProfile(username) {
    await loadPublicProfile(username);
    if (!state.publicProfile) throw new Error('User not found.');
    state.searchProfileOpen = true;
    state.searchProfileSocialView = null;
    renderApp();
  }

  let conversationSearchId = 0;

  async function searchConversations(query) {
    const trimmed = query.trim();
    const searchId = ++conversationSearchId;
    if (!trimmed) {
      state.conversationResults = [];
      state.conversationSearching = false;
      renderApp();
      return;
    }
    const data = await api(`/api/chats/search?q=${encodeURIComponent(trimmed)}`);
    if (searchId !== conversationSearchId || trimmed !== state.conversationQuery.trim()) return;
    state.conversationResults = data.results || [];
    state.conversationSearching = false;
    renderApp();
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

  function showSystemNotification({ title, body, actor, tag, userId = null }) {
    if (!state.messageNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, {
        body,
        icon: actor?.avatar?.url || undefined,
        tag
      });
      notification.onclick = () => {
        window.focus();
        if (userId) openChat(userId).catch((error) => alert(error.message));
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

  function showIncomingMessageNotification(message) {
    const sender = userById(message.senderId);
    const title = sender?.displayName || sender?.username || 'New message';
    const body = describeMessage(message);
    pushToast({
      key: `message-${message.senderId}`,
      kind: 'message',
      title,
      body,
      actor: sender,
      userId: message.senderId
    });
    showSystemNotification({ title, body, actor: sender, tag: `chat-${message.senderId}`, userId: message.senderId });
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
    const title = note.type === 'mention' ? 'You were mentioned' : 'New follower update';
    const body = note.text || `${actor?.displayName || actor?.username || 'Someone'} sent an update.`;
    pushToast({ key: `social-${note.id}`, kind: 'social', title, body, actor });
    showSystemNotification({ title, body, actor, tag: `social-${note.id}` });
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
      const activeIds = [state.me.id, state.activePeer?.id].sort().join('__');
      const incoming = event.message.recipientId === state.me.id;
      const activelyViewing = event.chatId === activeIds && !document.hidden;
      if (event.chatId === activeIds) {
        if (event.message.senderId === state.typingPeerId) state.typingPeerId = null;
        upsertMessage(event.message);
        if (!updateMessagesList()) renderApp();
      }
      if (incoming && !activelyViewing) {
        state.unreadByPeer[event.message.senderId] = (state.unreadByPeer[event.message.senderId] || 0) + 1;
        showIncomingMessageNotification(event.message);
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
    if (event.type === 'message:hidden') {
      state.messages = state.messages.filter((item) => item.id !== event.messageId);
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
    if (event.type === 'typing') {
      if (event.from === state.activePeer?.id) {
        state.typingPeerId = event.isTyping ? event.from : null;
        if (!updateMessagesList()) renderApp();
      }
    }
    if (event.type === 'signal') {
      await handleSignal(event.from, event.payload);
    }
  }

  function sendTypingSignal(isTyping) {
    if (!state.activePeer || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type: 'typing', to: state.activePeer.id, isTyping }));
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

  async function createTextSticker() {
    const input = document.getElementById('sticker-text');
    const text = input?.value.trim();
    if (!text) {
      alert('Type sticker text first.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#f4f7fb');
    gradient.addColorStop(1, '#4fd2c2');
    ctx.fillStyle = gradient;
    roundedRect(ctx, 22, 22, 468, 468, 44);
    ctx.fill();
    ctx.fillStyle = '#061119';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 54px system-ui, sans-serif';
    wrapCanvasText(ctx, text, 256, 256, 410, 64);
    const sticker = {
      id: `sticker_${cryptoRandom()}`,
      name: text.slice(0, 40),
      dataUrl: canvas.toDataURL('image/png'),
      createdAt: new Date().toISOString()
    };
    await saveSticker(sticker);
    if (input) input.value = '';
    state.stickerPanel = true;
    renderApp();
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
    state.stickerPanel = true;
    renderApp();
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
    const sticker = state.stickerMap.get(stickerId);
    if (!sticker) return;
    const blob = await (await fetch(sticker.dataUrl)).blob();
    const file = new File([blob], `${sticker.name || 'sticker'}.png`, { type: blob.type || 'image/png' });
    await sendFile(file, 'sticker', sticker.id);
  }

  async function downloadSticker(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message?.attachment) return;
    const blob = await (await fetch(message.attachment.url, { credentials: 'same-origin' })).blob();
    const dataUrl = await blobToDataUrl(blob);
    await saveSticker({
      id: message.stickerId,
      name: message.attachment.name.replace(/\.[^.]+$/, '') || 'Downloaded sticker',
      dataUrl,
      createdAt: new Date().toISOString()
    });
    renderApp();
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
  let storyAdvanceTimer = null;

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

  function openActionSheet(sheet) {
    clearTimeout(overlayCloseTimer);
    state.overlayClosing = false;
    state.storyMenuOpen = false;
    state.actionSheet = sheet;
    updateStoryMenuSlot();
    updateActionSheetSlot();
  }

  function closeOverlays() {
    if (!state.actionSheet && !state.storyMenuOpen) return;
    clearTimeout(overlayCloseTimer);
    state.overlayClosing = true;
    updateActionSheetSlot();
    updateStoryMenuSlot();
    overlayCloseTimer = setTimeout(() => {
      state.actionSheet = null;
      state.storyMenuOpen = false;
      state.overlayClosing = false;
      updateActionSheetSlot();
      updateStoryMenuSlot();
      if (state.storyViewer) scheduleStoryAdvance(storyById(state.storyViewer.storyId));
    }, 190);
  }

  function scrollMessagesToBottom() {
    const messages = document.getElementById('messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function resizeComposerInput() {
    const input = document.getElementById('composer-text');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function updateMessagesList(options = {}) {
    const messages = document.getElementById('messages');
    if (!messages || !state.activePeer || state.chatProfileOpen) return false;
    const wasNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
    const previousTop = messages.scrollTop;
    messages.innerHTML = renderMessagesList();
    if (options.scroll === 'bottom' || (!options.scroll && wasNearBottom)) scrollMessagesToBottom();
    if (options.scroll === 'preserve') messages.scrollTop = previousTop;
    return true;
  }

  function updateSidebar() {
    const current = document.querySelector('.sidebar');
    if (!current || !state.me) return false;
    const template = document.createElement('template');
    template.innerHTML = renderSidebar().trim();
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    return true;
  }

  function updateChatFooter(options = {}) {
    const pane = document.querySelector('.chat-pane');
    const current = pane?.querySelector('footer');
    if (!current || !state.activePeer || state.chatProfileOpen) return false;
    const input = current.querySelector('#composer-text');
    const hadFocus = document.activeElement === input;
    const selectionStart = input?.selectionStart || 0;
    const template = document.createElement('template');
    template.innerHTML = renderChatPane().trim();
    const next = template.content.firstElementChild?.querySelector('footer');
    if (!next) return false;
    current.replaceWith(next);
    resizeComposerInput();
    if (hadFocus || options.focus) {
      const nextInput = document.getElementById('composer-text');
      nextInput?.focus({ preventScroll: true });
      const cursor = Math.min(selectionStart, nextInput?.value.length || 0);
      nextInput?.setSelectionRange?.(cursor, cursor);
    }
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
              password: formValue(form, 'password')
            };
        const data = await api(`/api/auth/${state.authMode}`, { method: 'POST', body });
        state.me = data.user;
        state.needsTwoFactor = false;
        state.tab = 'chats';
        state.lastTab = 'chats';
        state.activePeer = null;
        state.chatProfileOpen = false;
        state.profileSocialView = null;
        state.chatProfileSocialView = null;
        await loadContactsAndChats();
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
      if (form.dataset.form === 'profile-edit') {
        await updateProfilePatch({
          username: formValue(form, 'username'),
          displayName: state.me.displayName,
          bio: formValue(form, 'bio')
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
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.matches('button, a[href="#"]')) event.preventDefault();
    const action = target.dataset.action;
    if (action === 'close-overlays' && target.classList.contains('overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-modal' && target.classList.contains('center-overlay') && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-story-editor' && (target.classList.contains('story-editor-overlay') || target.classList.contains('story-editor-page')) && event.target.closest('[data-stop-close]')) return;
    if (action === 'close-media' && target.classList.contains('media-viewer') && event.target.closest('[data-stop-close]')) return;
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
        if (state.ws) state.ws.close();
        toastTimers.forEach((timer) => clearTimeout(timer));
        toastTimers.clear();
        state.toasts = [];
        state.me = null;
        state.activePeer = null;
        state.tab = 'chats';
        state.lastTab = 'chats';
        state.profileSocialView = null;
        state.chatProfileSocialView = null;
        renderAuth();
      }
      if (action === 'tab') {
        const nextTab = target.dataset.tab;
        state.lastTab = state.tab;
        state.tabTransition = nextTab !== state.tab;
        state.tabDirection = tabIndex(nextTab) < tabIndex(state.tab) ? 'left' : 'right';
        state.tab = nextTab;
        if (isMobileLayout()) {
          state.activePeer = null;
          state.chatProfileOpen = false;
          state.chatProfileSocialView = null;
        } else if (state.activePeer) {
          state.chatProfileOpen = false;
          state.chatProfileSocialView = null;
        }
        if (state.tab !== 'profile') state.profileSocialView = null;
        renderApp();
      }
      if (action === 'open-chat') {
        if (state.longPressTriggered) {
          state.longPressTriggered = false;
          return;
        }
        await openChat(target.dataset.userId, target.dataset.messageId || null);
      }
      if (action === 'back') {
        state.activePeer = null;
        state.chatProfileOpen = false;
        state.chatProfileSocialView = null;
        renderApp();
      }
      if (action === 'open-chat-profile') {
        state.chatProfileOpen = true;
        state.chatProfileSocialView = null;
        renderApp();
      }
      if (action === 'close-chat-profile') {
        state.chatProfileOpen = false;
        state.chatProfileSocialView = null;
        state.chatReturnAnimation = true;
        renderApp();
      }
      if (action === 'send-text') {
        await sendCurrentText();
      }
      if (action === 'attach-open') {
        document.getElementById('file-input')?.click();
      }
      if (action === 'sticker-toggle') {
        state.stickerPanel = !state.stickerPanel;
        updateChatFooter();
      }
      if (action === 'sticker-file-open') {
        document.getElementById('sticker-file-input')?.click();
      }
      if (action === 'create-text-sticker') {
        await createTextSticker();
      }
      if (action === 'send-sticker') {
        await sendSticker(target.dataset.stickerId);
      }
      if (action === 'download-sticker') {
        await downloadSticker(target.dataset.messageId);
      }
      if (action === 'open-sticker-save') {
        openActionSheet({ type: 'sticker-save', messageId: target.dataset.messageId });
      }
      if (action === 'save-message-sticker') {
        await downloadSticker(target.dataset.messageId);
        state.actionSheet = null;
        renderApp();
      }
      if (action === 'open-media') {
        state.mediaViewer = { src: target.dataset.src, name: target.dataset.name || '', type: target.dataset.type || '' };
        updateMediaViewerSlot();
      }
      if (action === 'close-media') {
        state.mediaViewer = null;
        updateMediaViewerSlot();
      }
      if (action === 'close-story-editor') {
        state.storyEditor = null;
        state.storyVideoTrimDrag = null;
        storyTextPointers.clear();
        storyMediaPointers.clear();
        storyStickerPointers.clear();
        updateStoryEditorView();
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
      if (action === 'view-story') {
        await viewStory(target.dataset.storyId);
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
        await toggleStoryLike(target.dataset.storyId);
      }
      if (action === 'open-story-comments') {
        clearStoryAdvance();
        openActionSheet({ type: 'story-comments', storyId: target.dataset.storyId });
      }
      if (action === 'submit-story-comment') {
        await submitStoryComment(target.dataset.storyId);
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
        if (confirm('Delete this message?')) await deleteMessage(target.dataset.messageId);
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
      if (action === 'view-user-profile') {
        await openSearchProfile(target.dataset.username);
      }
      if (action === 'close-search-profile') {
        state.searchProfileOpen = false;
        state.searchProfileSocialView = null;
        state.publicProfile = null;
        renderApp();
      }
      if (action === 'open-search-social') {
        state.searchProfileSocialView = target.dataset.social === 'following' ? 'following' : 'followers';
        renderApp();
      }
      if (action === 'close-search-social') {
        state.searchProfileSocialView = null;
        renderApp();
      }
      if (action === 'clear-user-search') {
        clearTimeout(searchTimer);
        userSearchId += 1;
        state.userQuery = '';
        state.userSearching = false;
        state.searchResults = [];
        renderApp();
        setTimeout(focusUserSearch, 0);
      }
      if (action === 'accept-request') {
        await acceptRequest(target.dataset.requestId);
      }
      if (action === 'decline-request') {
        await declineRequest(target.dataset.requestId);
      }
      if (action === 'open-notifications') {
        state.lastTab = state.tab;
        state.tabTransition = true;
        state.tabDirection = 'right';
        state.tab = 'notifications';
        await refreshChatsOnly();
        renderApp();
      }
      if (action === 'back-from-notifications') {
        state.tabTransition = true;
        state.tabDirection = 'left';
        state.tab = state.lastTab === 'notifications' ? 'chats' : (state.lastTab || 'chats');
        renderApp();
      }
      if (action === 'close-overlays') {
        closeOverlays();
      }
      if (action === 'copy-profile-link') {
        await navigator.clipboard.writeText(target.dataset.link);
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
        state.settingsOpen = true;
        updateProfileModalSlots();
      }
      if (action === 'close-modal') {
        state.profileEditOpen = false;
        state.settingsOpen = false;
        updateProfileModalSlots();
      }
      if (action === 'toggle-recommendations') {
        state.recommendationsOpen = !state.recommendationsOpen;
        updateRecommendationsSection();
      }
      if (action === 'dismiss-recommendation') {
        if (confirm('Never show this recommendation again?')) {
          state.hiddenRecommendations = Array.from(new Set([...(state.hiddenRecommendations || []), target.dataset.userId]));
          localStorage.setItem('hiddenRecommendations', JSON.stringify(state.hiddenRecommendations));
          updateRecommendationsSection();
        }
      }
      if (action === 'toggle-profile-privacy') {
        await updateProfilePatch({ socialPublic: target.checked });
        updateProfileModalSlots();
      }
      if (action === 'toggle-profile-searchable') {
        await updateProfilePatch({ searchable: target.checked });
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
          if (toast.kind === 'message' && toast.userId) await openChat(toast.userId);
          else {
            state.lastTab = state.tab;
            state.tab = 'notifications';
            await refreshChatsOnly();
            renderApp();
          }
        }
      }
      if (action === 'open-social') {
        const nextSocial = target.dataset.social === 'following' ? 'following' : 'followers';
        state.profileSocialView = nextSocial;
        renderApp();
      }
      if (action === 'close-social') {
        state.profileSocialView = null;
        renderApp();
      }
      if (action === 'open-peer-social') {
        state.chatProfileSocialView = target.dataset.social === 'following' ? 'following' : 'followers';
        renderApp();
      }
      if (action === 'close-peer-social') {
        state.chatProfileSocialView = null;
        renderApp();
      }
      if (action === 'avatar-menu') {
        clearTimeout(overlayCloseTimer);
        state.actionSheet = null;
        state.storyMenuOpen = true;
        state.overlayClosing = false;
        updateActionSheetSlot();
        updateStoryMenuSlot();
      }
      if (action === 'open-story-create') {
        clearTimeout(overlayCloseTimer);
        state.actionSheet = null;
        state.storyMenuOpen = true;
        state.overlayClosing = false;
        updateActionSheetSlot();
        updateStoryMenuSlot();
      }
      if (action === 'create-story') {
        beginBlankStoryEditor();
      }
      if (action === 'post-story') {
        state.storyMenuOpen = false;
        updateStoryMenuSlot();
        document.getElementById('story-input')?.click();
      }
      if (action === 'change-profile-picture') {
        state.storyMenuOpen = false;
        updateStoryMenuSlot();
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
        await sendFile(file);
      }
      if (event.target.id === 'sticker-file-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await createImageSticker(file);
      }
      if (event.target.id === 'avatar-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await beginAvatarCrop(file);
      }
      if (event.target.id === 'story-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await beginStoryEditor(file);
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
      if (event.target.matches('[data-story-slider]')) {
        await respondToStorySticker(event.target.dataset.storyId, event.target.dataset.stickerId, Number(event.target.value));
      }
    } catch (error) {
      alert(error.message);
    }
  });

  document.addEventListener('input', (event) => {
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
        renderApp();
        const input = document.getElementById('conversation-search');
        if (input) {
          input.focus();
          input.setSelectionRange(state.conversationQuery.length, state.conversationQuery.length);
        }
        return;
      }
      state.conversationSearching = true;
      renderApp();
      const input = document.getElementById('conversation-search');
      if (input) {
        input.focus();
        input.setSelectionRange(state.conversationQuery.length, state.conversationQuery.length);
      }
      conversationTimer = setTimeout(() => {
        searchConversations(state.conversationQuery).catch((error) => {
          state.conversationSearching = false;
          renderApp();
          alert(error.message);
        });
      }, 220);
      return;
    }
    if (event.target.id === 'avatar-zoom' && state.avatarCrop) {
      state.avatarCrop.zoom = Number(event.target.value || 1);
      const img = document.querySelector('#crop-stage img');
      if (img) img.style.transform = `scale(${state.avatarCrop.zoom})`;
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
      renderApp();
      setTimeout(focusUserSearch, 0);
      searchTimer = setTimeout(() => {
        searchUsers(state.userQuery).catch((error) => {
          state.userSearching = false;
          renderApp();
          alert(error.message);
        });
      }, 340);
    }
    if (event.target.id === 'composer-text') {
      if (state.activePeer) state.composerDrafts[state.activePeer.id] = event.target.value;
      resizeComposerInput();
      sendTypingSignal(true);
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => sendTypingSignal(false), 900);
    }
  });

  document.addEventListener('scroll', (event) => {
    if (event.target?.id === 'messages' && event.target.scrollTop < 80) {
      loadOlderMessages().catch((error) => alert(error.message));
    }
  }, true);

  document.addEventListener('keydown', async (event) => {
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
      requestAnimationFrame(() => setViewportHeight());
      setTimeout(() => setViewportHeight(), 260);
    }
  });

  document.addEventListener('focusout', (event) => {
    if (event.target.matches('input, textarea, [contenteditable="true"]')) {
      setTimeout(() => setViewportHeight(), 120);
      setTimeout(() => setViewportHeight(), 420);
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
    if (state.me && !state.storyEditor && event.clientX < 24 && !event.target.closest('input,textarea,button,a')) {
      state.edgeSwipe = { startX: event.clientX, startY: event.clientY };
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
      const rect = cropStage.getBoundingClientRect();
      const crop = state.avatarCrop;
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cropPointers.size >= 2) {
        const points = Array.from(cropPointers.values()).slice(0, 2);
        crop.drag = null;
        crop.pinch = {
          distance: Math.max(1, pointerDistance(points[0], points[1])),
          zoom: crop.zoom || 1
        };
        return;
      }
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (!event.target.closest('.crop-circle')) {
        crop.x = clamp(localX - crop.size / 2, 0, rect.width - crop.size);
        crop.y = clamp(localY - crop.size / 2, 0, rect.height - crop.size);
      }
      crop.drag = {
        offsetX: localX - crop.x,
        offsetY: localY - crop.y,
        width: rect.width,
        height: rect.height
      };
      cropStage.setPointerCapture?.(event.pointerId);
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
    if (!message || event.target.closest('button,a,input,textarea')) return;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => {
      state.longPressTriggered = true;
      openActionSheet({ type: 'message', messageId: message.dataset.messageId });
    }, 560);
    state.drag = {
      id: message.dataset.messageId,
      el: message,
      startX: event.clientX,
      startY: event.clientY
    };
  });

  document.addEventListener('pointermove', (event) => {
    if (state.storyVideoTrimDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      updateStoryVideoFromPointer(state.storyVideoTrimDrag, event.clientX);
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
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const crop = state.avatarCrop;
      if (crop.pinch && cropPointers.size >= 2) {
        const points = Array.from(cropPointers.values()).slice(0, 2);
        const distance = Math.max(1, pointerDistance(points[0], points[1]));
        crop.zoom = clamp(crop.pinch.zoom * (distance / crop.pinch.distance), 1, 3);
        updateCropUi();
        return;
      }
    }
    if (state.avatarCrop?.drag) {
      const crop = state.avatarCrop;
      const rect = document.getElementById('crop-stage')?.getBoundingClientRect();
      const width = rect?.width || crop.drag.width;
      const height = rect?.height || crop.drag.height;
      const left = rect ? event.clientX - rect.left : event.clientX;
      const top = rect ? event.clientY - rect.top : event.clientY;
      crop.x = clamp(left - crop.drag.offsetX, 0, width - crop.size);
      crop.y = clamp(top - crop.drag.offsetY, 0, height - crop.size);
      updateCropUi();
      return;
    }
    if (state.longPressTimer) {
      const pointer = state.drag || state.edgeSwipe;
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
    if (state.storyVideoTrimDrag?.pointerId === event.pointerId) {
      updateStoryVideoFromPointer(state.storyVideoTrimDrag, event.clientX);
      state.storyVideoTrimDrag = null;
      state.edgeSwipe = null;
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
      cropPointers.delete(event.pointerId);
      state.avatarCrop.drag = null;
      if (cropPointers.size < 2) state.avatarCrop.pinch = null;
      state.edgeSwipe = null;
      return;
    }
    if (state.avatarCrop?.drag) {
      state.avatarCrop.drag = null;
      state.edgeSwipe = null;
      return;
    }
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    const recordButton = event.target.closest('[data-action="record-voice"]') || document.querySelector('.recording');
    if (recordButton) stopRecording(recordButton);
    if (state.edgeSwipe) {
      const dx = event.clientX - state.edgeSwipe.startX;
      const dy = event.clientY - state.edgeSwipe.startY;
      if (dx > 90 && Math.abs(dx) > Math.abs(dy)) {
        if (state.storyViewer) {
          clearStoryAdvance();
          state.storyViewer = null;
        } else if (state.storyEditor) state.storyEditor = null;
        else if (state.chatProfileOpen) state.chatProfileOpen = false;
        else if (state.activePeer) state.activePeer = null;
        else if (state.lastTab && state.lastTab !== state.tab) {
          const current = state.tab;
          state.tabTransition = true;
          state.tabDirection = tabIndex(state.lastTab) < tabIndex(state.tab) ? 'left' : 'right';
          state.tab = state.lastTab;
          state.lastTab = current;
        }
        renderApp();
      }
      state.edgeSwipe = null;
    }
    if (state.drag) {
      const dx = event.clientX - state.drag.startX;
      const draggedMessage = state.messages.find((message) => message.id === state.drag.id);
      const mine = draggedMessage?.senderId === state.me.id;
      const replySwipe = mine ? dx < -70 : dx > 70;
      state.drag.el.style.transform = '';
      state.drag.el.style.transition = '';
      state.drag.el.classList.remove('reveal-time');
      if (replySwipe) {
        state.replyTo = draggedMessage || null;
        updateChatFooter({ focus: true });
      }
      state.drag = null;
    }
  });

  document.addEventListener('pointercancel', () => {
    const recordButton = document.querySelector('.recording');
    if (recordButton) stopRecording(recordButton);
    if (state.drag) {
      state.drag.el.style.transform = '';
      state.drag.el.classList.remove('reveal-time');
      state.drag = null;
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
    storyTextPointers.clear();
    storyMediaPointers.clear();
    storyStickerPointers.clear();
    cropPointers.clear();
    document.getElementById('story-object-trash')?.classList.remove('visible', 'active');
    state.edgeSwipe = null;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (state.storyEditor && event.target.closest?.('.story-editor-preview')) event.preventDefault();
    }, { passive: false });
  });

  document.addEventListener('wheel', (event) => {
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

  window.addEventListener('popstate', () => {
    init().catch((error) => {
      console.error(error);
      renderAuth(error.message);
    });
  });

  init().catch((error) => {
    console.error(error);
    app.innerHTML = `<main class="auth-screen"><div class="auth-card"><h1>Messages</h1><p class="error">${esc(error.message)}</p></div></main>`;
  });
})();
