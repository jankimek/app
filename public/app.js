(function () {
  const app = document.getElementById('app');

  function setViewportHeight() {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight);
    const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-top', `${top}px`);
  }

  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 120));
  window.visualViewport?.addEventListener('resize', setViewportHeight);
  window.visualViewport?.addEventListener('scroll', setViewportHeight);

  const state = {
    authMode: 'login',
    needsTwoFactor: false,
    me: null,
    twoFactorEnabled: false,
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
    messageNotifications: localStorage.getItem('messageNotifications') === '1',
    actionSheet: null,
    storyMenuOpen: false,
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
    storyStickerDrag: null,
    storyStickerGesture: null,
    storyDraw: null,
    edgeSwipe: null,
    longPressTimer: null,
    longPressTriggered: false,
    call: freshCallState()
  };

  const cropPointers = new Map();
  const storyTextPointers = new Map();
  const storyStickerPointers = new Map();

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

  function avatarHtml(user) {
    const avatarUrl = user?.avatar?.url;
    const story = user?.stories?.[0];
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
      poll: '<svg viewBox="0 0 24 24"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
      rotate: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
      smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
      pen: '<svg viewBox="0 0 24 24"><path d="M16 4l4 4L8 20H4v-4L16 4Z"/><path d="m14 6 4 4"/></svg>',
      music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
      stickers: '<svg viewBox="0 0 24 24"><path d="M20 13.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6.5"/><path d="M14 20c0-3.3 2.7-6 6-6"/><path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0"/></svg>',
      alignLeft: '<svg viewBox="0 0 24 24"><path d="M4 6h14M4 10h10M4 14h14M4 18h8"/></svg>',
      alignCenter: '<svg viewBox="0 0 24 24"><path d="M5 6h14M8 10h8M5 14h14M9 18h6"/></svg>',
      alignRight: '<svg viewBox="0 0 24 24"><path d="M6 6h14M10 10h10M6 14h14M12 18h8"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
      location: '<svg viewBox="0 0 24 24"><path d="M12 22s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
      more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
      undo: '<svg viewBox="0 0 24 24"><path d="m9 8-5 4 5 4"/><path d="M20 18a7 7 0 0 0-7-7H4"/></svg>'
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
    if (publicName) {
      state.tab = 'search';
      await loadPublicProfile(publicName);
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

  function renderApp(options = {}) {
    const scrollSnapshot = captureMessagesScroll();
    const scrollMode = options.scroll || 'preserve';
    app.innerHTML = `
      <div class="app-shell ${state.activePeer ? 'chat-open' : ''}">
        ${renderSidebar()}
        ${renderChatPane()}
      </div>
      <div id="call-dock-slot">${renderCallDock()}</div>
      ${renderActionSheet()}
      ${renderStoryMenu()}
      ${renderProfileEditModal()}
      ${renderSettingsModal()}
      ${renderAvatarCropper()}
      ${renderStoryEditor()}
      ${renderStoryViewer()}
      ${renderMediaViewer()}
    `;
    state.tabTransition = false;
    setTimeout(() => {
      resizeComposerInput();
      if (state.storyEditor?.textEditing) {
        const storyText = document.getElementById('story-editor-text');
        storyText?.focus();
        storyText?.setSelectionRange?.(storyText.value.length, storyText.value.length);
      }
      if (state.highlightMessageId) scrollHighlightedMessage();
      else if (scrollMode === 'bottom') scrollMessagesToBottom();
      else restoreMessagesScroll(scrollSnapshot);
      attachCallStreams();
      state.chatReturnAnimation = false;
    }, 0);
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
      <section class="panel-heading">
        <h2>Messages</h2>
      </section>
      <section class="chat-list">
        ${query ? searchRows : chatRows}
      </section>
    `;
  }

  function renderSearchPanel() {
    const recommendations = visibleRecommendations();
    return `
      <section class="search-page-head">
        <input class="search-input" id="user-search" placeholder="Search users" autocomplete="off">
      </section>
      <section class="panel-card">
        <div class="result-list" id="search-results">
          ${renderSearchResults()}
        </div>
      </section>
      <section class="search-discover">
        <h2>Discover</h2>
        <div class="discover-grid">
          <article>
            ${icon('search')}
            <strong>Search usernames</strong>
            <small>Find people by username or display name.</small>
          </article>
          <article>
            ${icon('messages')}
            <strong>Start a chat</strong>
            <small>Add someone first, then message from the Messages tab.</small>
          </article>
        </div>
        ${recommendations.length ? `
          <h2>People you may know</h2>
          <div class="recommendation-row expanded">
            ${recommendations.slice(0, 8).map((user) => `
              <article class="recommend-card">
                <button class="recommend-dismiss" title="Hide" aria-label="Hide recommendation" data-action="dismiss-recommendation" data-user-id="${esc(user.id)}">${icon('x')}</button>
                ${avatarHtml(user)}
                <strong>${esc(user.displayName)}</strong>
                <small>@${esc(user.username)}${user.mutualCount ? ` - ${esc(user.mutualCount)} mutual` : ''}</small>
                <button class="mini-btn follow-btn" data-action="add-contact" data-username="${esc(user.username)}">Follow</button>
              </article>
            `).join('')}
          </div>
        ` : ''}
      </section>
      ${state.publicProfile ? renderPublicProfileCard(state.publicProfile) : ''}
    `;
  }

  function renderProfilePanel() {
    if (state.profileSocialView) return renderProfileSocialPage();
    const profileUrl = `${location.origin}/u/${state.me.username}`;
    const story = state.me.stories?.[0];
    return `
      <section class="profile-top-actions">
        <button class="icon-btn" data-action="open-settings" aria-label="Settings">${icon('menu')}</button>
      </section>
      <section class="profile-hero">
        <button class="avatar profile-avatar-btn" data-action="avatar-menu" title="Profile picture and story">
          ${state.me.avatar?.url ? `<img src="${esc(state.me.avatar.url)}" alt="">` : esc(initials(state.me))}
          ${story ? `<span class="story-ring ${story.viewed ? 'viewed' : ''}"></span>` : ''}
        </button>
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
      ${story ? `
        <section class="panel-card story-card">
          <h2>Story</h2>
          ${renderStoryMedia(story)}
          ${renderStoryEngagement(story)}
          <div class="toolbar">
            ${story.saved ? '<span class="hint">Saved</span>' : `<button class="secondary" data-action="save-story" data-story-id="${esc(story.id)}">Save</button>`}
            <button class="danger" data-action="delete-story" data-story-id="${esc(story.id)}">Delete forever</button>
          </div>
        </section>
      ` : ''}
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

  function storyFilterCss(filter) {
    return {
      warm: 'sepia(0.22) saturate(1.22) hue-rotate(-8deg)',
      cool: 'saturate(1.15) hue-rotate(12deg)',
      mono: 'grayscale(1)',
      noir: 'grayscale(1) contrast(1.28) brightness(0.82)'
    }[filter] || 'none';
  }

  function storyTextFontCss(font) {
    return {
      serif: 'Georgia, serif',
      mono: '"SFMono-Regular", Consolas, monospace',
      script: '"Brush Script MT", "Segoe Script", cursive',
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
    const effect = ['none', 'shadow', 'glow', 'neon'].includes(edits.textEffect) ? edits.textEffect : 'shadow';
    const animation = ['none', 'fade', 'rise', 'pop'].includes(edits.textAnimation) ? edits.textAnimation : 'none';
    return `text-effect-${effect} text-anim-${animation}`;
  }

  function hexToRgba(hex, alpha) {
    const value = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!value) return `rgba(0,0,0,${alpha})`;
    const int = parseInt(value[1], 16);
    return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
  }

  function storyTextToolPanel(editor) {
    const colors = ['#ffffff', '#ff4fa3', '#9f7cff', '#4fd2c2', '#ffd166', '#111827'];
    const fonts = [
      ['system', 'Modern'],
      ['serif', 'Classic'],
      ['mono', 'Typewriter'],
      ['script', 'Signature']
    ];
    const effects = [
      ['none', 'Plain'],
      ['shadow', 'Shadow'],
      ['glow', 'Glow'],
      ['neon', 'Neon']
    ];
    return `
      <div class="story-swatch-row story-text-colors" aria-label="Text color">
        ${colors.map((color) => `<button class="${editor.textColor === color ? 'active' : ''}" style="--swatch:${color}" data-action="story-color" data-color="${color}" aria-label="Text color"></button>`).join('')}
      </div>
      <div class="story-option-strip story-font-strip">
        ${fonts.map(([font, label]) => `<button class="${editor.textFont === font ? 'active' : ''}" data-action="story-font" data-font="${font}">${esc(label)}</button>`).join('')}
      </div>
      <div class="story-option-strip story-effect-strip">
        ${effects.map(([effect, label]) => `<button class="${(editor.textEffect || 'shadow') === effect ? 'active' : ''}" data-action="story-text-effect" data-effect="${effect}">${esc(label)}</button>`).join('')}
      </div>
    `;
  }

  function storyFilterToolPanel(editor) {
    return `
      <div class="story-filter-carousel" aria-label="Story filters">
        ${['normal', 'warm', 'cool', 'mono', 'noir'].map((filter) => `
          <button class="${editor.filter === filter ? 'active' : ''}" data-action="story-filter" data-filter="${filter}">
            <span style="background-image:url('${esc(editor.dataUrl)}');filter:${esc(storyFilterCss(filter))}"></span>
            <small>${esc(filter)}</small>
          </button>
        `).join('')}
      </div>
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

  function storyStickerToolPanel(editor) {
    const composer = editor.stickerComposer || '';
    if (composer === 'poll') {
      return `
        <section class="story-sticker-sheet" data-stop-close>
          <div class="story-sheet-grabber"></div>
          <header><button data-action="story-sticker-back" aria-label="Back">${icon('back')}</button><strong>Poll</strong><span></span></header>
          <input class="story-sheet-input" id="story-poll-question" value="${esc(editor.pollQuestion || '')}" maxlength="80" placeholder="Ask a question">
          <div class="story-poll-options">
            <input id="story-poll-a" value="${esc(editor.pollOptionA || 'Yes')}" maxlength="40" aria-label="First poll option">
            <input id="story-poll-b" value="${esc(editor.pollOptionB || 'No')}" maxlength="40" aria-label="Second poll option">
          </div>
          <button class="story-sheet-confirm" data-action="finish-story-poll">Add poll</button>
        </section>
      `;
    }
    if (composer) {
      const labels = {
        mention: 'Mention',
        question: 'Question',
        hashtag: 'Hashtag',
        countdown: 'Countdown',
        location: 'Location'
      };
      return `
        <section class="story-sticker-sheet" data-stop-close>
          <div class="story-sheet-grabber"></div>
          <header><button data-action="story-sticker-back" aria-label="Back">${icon('back')}</button><strong>${esc(labels[composer] || 'Sticker')}</strong><span></span></header>
          <input class="story-sheet-input" id="story-sticker-text" value="${esc(editor.stickerDraft || '')}" maxlength="80" placeholder="${composer === 'mention' ? '@username' : 'Type here'}" autofocus>
          <button class="story-sheet-confirm" data-action="commit-story-sticker" data-sticker-type="${esc(composer)}">Add sticker</button>
        </section>
      `;
    }
    return `
      <section class="story-sticker-sheet" data-stop-close>
        <div class="story-sheet-grabber"></div>
        <header><span></span><strong>Stickers</strong><button data-action="finish-story-tool" aria-label="Close stickers">${icon('x')}</button></header>
        <label class="story-sticker-search">${icon('search')}<input id="story-sticker-search" value="${esc(editor.stickerSearch || '')}" placeholder="Search"></label>
        <div class="story-sticker-grid">
          <button data-search="mention tag user" data-action="choose-story-sticker" data-sticker-type="mention"><span class="mention-sticker">@MENTION</span></button>
          <button data-search="location place map" data-action="choose-story-sticker" data-sticker-type="location"><span class="location-sticker">${icon('location')} LOCATION</span></button>
          <button data-search="gif animated" data-action="add-story-sticker" data-sticker-type="gif" data-sticker-label="GIF"><span class="gif-sticker">GIF</span></button>
          <button data-search="music audio song" data-action="story-tool" data-tool="audio"><span class="music-sticker">${icon('music')} MUSIC</span></button>
          <button data-search="poll vote" data-action="choose-story-sticker" data-sticker-type="poll"><span class="poll-choice">POLL</span></button>
          <button data-search="question ask" data-action="choose-story-sticker" data-sticker-type="question"><span class="question-sticker">QUESTIONS</span></button>
          <button data-search="hashtag tag" data-action="choose-story-sticker" data-sticker-type="hashtag"><span class="hashtag-sticker">#HASHTAG</span></button>
          <button data-search="countdown timer" data-action="choose-story-sticker" data-sticker-type="countdown"><span class="countdown-sticker">COUNTDOWN</span></button>
          <button data-search="heart love emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x2764;&#xFE0F;"><span class="raw-emoji">&#x2764;&#xFE0F;</span></button>
          <button data-search="laugh emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x1F602;"><span class="raw-emoji">&#x1F602;</span></button>
          <button data-search="fire emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x1F525;"><span class="raw-emoji">&#x1F525;</span></button>
          <button data-search="sparkle emoji" data-action="add-story-sticker" data-sticker-type="emoji" data-sticker-label="&#x2728;"><span class="raw-emoji">&#x2728;</span></button>
        </div>
      </section>
    `;
  }

  function storyDrawToolPanel(editor) {
    const colors = ['#ffffff', '#ff4fa3', '#9f7cff', '#4fd2c2', '#ffd166', '#111827'];
    return `
      <div class="story-swatch-row">
        ${colors.map((color) => `<button class="${editor.drawColor === color ? 'active' : ''}" style="--swatch:${color}" data-action="story-draw-color" data-color="${color}" aria-label="Draw color"></button>`).join('')}
      </div>
      <button class="story-undo-btn" data-action="undo-story-draw" aria-label="Undo last stroke">${icon('undo')}</button>
    `;
  }

  function storyAudioToolPanel(editor) {
    return `
      <section class="story-sticker-sheet story-audio-sheet" data-stop-close>
        <div class="story-sheet-grabber"></div>
        <header><span></span><strong>Music</strong><button data-action="finish-story-tool" aria-label="Close music">${icon('x')}</button></header>
        <button class="story-audio-pick" data-action="story-audio-open">${icon('music')} Choose audio from device</button>
        <input id="story-audio-input" type="file" accept="audio/*" hidden>
        ${editor.audio ? `
          <div class="story-audio-edit">
            <strong>${esc(editor.audio.name || 'Audio')}</strong>
            <audio src="${esc(editor.audio.dataUrl)}#t=${esc(editor.audioStart || 0)},${esc(editor.audioEnd || 30)}" controls></audio>
            <div class="story-mini-grid">
              <label>Start <input id="story-audio-start" type="number" min="0" step="0.1" value="${esc(editor.audioStart || 0)}"></label>
              <label>End <input id="story-audio-end" type="number" min="0" step="0.1" value="${esc(editor.audioEnd || 30)}"></label>
            </div>
            <small>Choose a clip up to 30 seconds.</small>
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
        ${editor.isVideo ? `
          <div class="story-mini-grid">
            <label>Start <input id="story-trim-start" type="number" min="0" step="0.1" value="${esc(editor.trimStart || 0)}"></label>
            <label>End <input id="story-trim-end" type="number" min="0" step="0.1" value="${esc(editor.trimEnd || 0)}"></label>
          </div>
        ` : ''}
      </section>
    `;
  }

  function storyToolPanel(editor) {
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
      const alignIcon = editor.textAlign === 'left' ? 'alignLeft' : editor.textAlign === 'right' ? 'alignRight' : 'alignCenter';
      return `
        <div class="story-top-bar story-text-topbar" data-stop-close>
          <button class="story-top-btn story-close-btn" data-action="close-story-editor" aria-label="Close">${icon('x')}</button>
          <div class="story-top-tools">
            <button class="story-top-btn" data-action="cycle-story-text-align" aria-label="Change alignment">${icon(alignIcon)}</button>
            <button class="story-top-btn ${editor.textBgEnabled ? 'active' : ''}" data-action="story-text-bg" aria-label="Text background"><span class="story-aa">A</span></button>
            <button class="story-top-btn ${editor.textFrame ? 'active' : ''}" data-action="story-text-frame" aria-label="Text frame"><span class="story-aa story-aa-frame">A</span></button>
            <button class="story-top-btn ${editor.textAnimation !== 'none' ? 'active' : ''}" data-action="cycle-story-text-animation" aria-label="Text animation">${icon('sparkle')}</button>
            <button class="story-done-btn" data-action="finish-story-tool">Done</button>
          </div>
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
    const style = `filter:${storyFilterCss(edits.filter)}; transform:scale(${Number(edits.zoom || 1)});`;
    const mediaUrl = isVideo && (edits.trimStart || edits.trimEnd)
      ? `${story.file.url}#t=${Number(edits.trimStart || 0)},${Number(edits.trimEnd || '') || ''}`
      : story.file.url;
    return `
      <div class="story-preview ${compact ? 'compact' : ''}">
        ${isVideo
          ? `<video src="${esc(mediaUrl)}" ${compact ? 'muted' : viewer ? 'autoplay' : 'controls'} playsinline style="${esc(style)}"></video>`
          : `<img src="${esc(mediaUrl)}" alt="" style="${esc(style)}">`}
        ${renderOverlays ? renderStoryDrawings(edits) : ''}
        ${renderOverlays ? renderStoryStickers(edits) : ''}
        ${renderOverlays && edits.text ? `<span class="story-text-overlay ${esc(storyTextClass(edits))}" style="${esc(storyTextStyle(edits))}">${esc(edits.text)}</span>` : ''}
        ${renderOverlays && edits.pollQuestion ? renderPollSticker(edits, compact) : ''}
        ${story.audio && !compact ? renderStoryAudio(story) : ''}
      </div>
    `;
  }

  function storyStickerStyle(sticker = {}) {
    const x = clamp(Number(sticker.x || 50), 5, 95);
    const y = clamp(Number(sticker.y || 42), 5, 95);
    const rotation = clamp(Number(sticker.rotation || 0), -180, 180);
    const size = clamp(Number(sticker.size || 1), 0.7, 1.8);
    return `left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${rotation}deg) scale(${size});`;
  }

  function renderStoryStickers(edits = {}) {
    const stickers = Array.isArray(edits.stickers) ? edits.stickers : [];
    return stickers.map((sticker) => `
      <span class="story-sticker story-sticker-${esc(sticker.type || 'emoji')}" style="${esc(storyStickerStyle(sticker))}">
        ${esc(sticker.label || '')}
      </span>
    `).join('');
  }

  function renderStoryEditorStickers(editor = {}) {
    const stickers = Array.isArray(editor.stickers) ? editor.stickers : [];
    return stickers.map((sticker) => `
      <button class="story-sticker story-editor-sticker story-sticker-${esc(sticker.type || 'emoji')}" data-action="story-sticker-drag" data-sticker-id="${esc(sticker.id)}" style="${esc(storyStickerStyle(sticker))}" aria-label="Move ${esc(sticker.label || 'sticker')}">
        ${esc(sticker.label || '')}
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
        ${drawings.map((stroke) => `<path d="${esc(drawingPath(stroke.points || []))}" stroke="${esc(stroke.color || '#ffffff')}" stroke-width="${Number(stroke.size || 5) / 10}" />`).join('')}
      </svg>
    `;
  }

  function renderStoryAudio(story) {
    const edits = story.edits || {};
    const start = Number(edits.audioStart || 0);
    const end = Number(edits.audioEnd || 30);
    const source = story.audio?.url ? `${story.audio.url}#t=${start},${end}` : '';
    if (!source) return '';
    return `
      <div class="story-audio-sticker">
        ${icon('music')}
        <span>${esc(story.audio.name || 'Audio')}</span>
        <audio src="${esc(source)}" controls></audio>
      </div>
    `;
  }

  function renderPollSticker(edits = {}, compact = false) {
    if (compact) return '';
    return `
      <div class="story-poll-sticker">
        <strong>${esc(edits.pollQuestion || '')}</strong>
        <span>${esc(edits.pollOptionA || 'Yes')}</span>
        <span>${esc(edits.pollOptionB || 'No')}</span>
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

  function updateStoryTextUi() {
    const editor = state.storyEditor;
    const overlay = document.querySelector('.story-draggable-text, .story-live-text');
    if (!editor || !overlay) return;
    overlay.style.cssText = storyTextStyle(editor);
    const live = overlay.classList.contains('story-live-text');
    overlay.className = `${live ? 'story-live-text' : 'story-draggable-text'} ${storyTextClass(editor)}`;
    if (!live) overlay.textContent = editor.text || '';
    const size = document.getElementById('story-text-size');
    if (size) size.value = String(editor.textSize || 44);
  }

  function updateStoryDrawPreview() {
    const preview = document.querySelector('.story-editor-preview');
    if (!state.storyEditor || !preview) return;
    preview.querySelector('.story-drawing-layer')?.remove();
    const html = renderStoryDrawings(state.storyEditor);
    if (html) preview.insertAdjacentHTML('afterbegin', html);
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
    if (!state.searchResults.length) return '<p class="hint">Type a username to search.</p>';
    return state.searchResults.map(renderPublicProfileCard).join('');
  }

  function renderPublicProfileCard(user) {
    const isMe = user.id === state.me?.id;
    let controls = '<button class="mini-btn" disabled>You</button>';
    const reportControl = !isMe ? `<button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>` : '';
    if (!isMe) {
      if (user.isContact) controls = `<button class="mini-btn" disabled>Following</button><button class="mini-btn" data-action="open-chat" data-user-id="${esc(user.id)}">Message</button><button class="mini-btn danger" data-action="remove-friend" data-user-id="${esc(user.id)}">Unfollow</button>`;
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
    const story = peer.stories?.[0];
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
              <button class="danger" data-action="remove-friend" data-user-id="${esc(peer.id)}">${icon('trash')} Unfollow</button>
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
    if (user.isContact) return `<button class="mini-btn" disabled>Following</button><button class="mini-btn danger" data-action="remove-friend" data-user-id="${esc(user.id)}">Unfollow</button><button class="mini-btn" data-action="open-report" data-report-type="user" data-user-id="${esc(user.id)}">Report</button>`;
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
    const visibleNotes = state.notifications.filter((note) => ['request_accepted', 'mention'].includes(note.type));
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

  function renderActionSheet() {
    const sheet = state.actionSheet;
    if (!sheet) return '';
    const peer = sheet.peerId ? userById(sheet.peerId) : null;
    const message = sheet.messageId ? state.messages.find((item) => item.id === sheet.messageId) : null;
    let body = '';
    if (sheet.type === 'chat-user' && peer) {
      body = `
        <button data-action="mute-menu" data-user-id="${esc(peer.id)}">${icon('mute')} Mute</button>
        <button class="danger-text" data-action="remove-friend" data-user-id="${esc(peer.id)}">${icon('trash')} Unfollow</button>
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
        <div class="sheet-note">
          <strong>Comments</strong>
          <small>${esc(shortTime(story.createdAt))}</small>
        </div>
        <div class="story-comment-list">
          ${(story.comments || []).length ? story.comments.map((comment) => `
            <article>
              ${avatarHtml(comment.user)}
              <span>
                <strong>${esc(comment.user?.displayName || 'User')}</strong>
                <small>${esc(comment.text)}</small>
              </span>
            </article>
          `).join('') : '<p class="hint">No comments yet.</p>'}
        </div>
        <div class="story-comment-box">
          <input class="search-input" id="story-comment-input" maxlength="280" placeholder="Add a comment">
          <button data-action="submit-story-comment" data-story-id="${esc(story.id)}">${icon('send')}</button>
        </div>
      ` : '<p class="hint">Story not found.</p>';
    }
    return `
      <div class="overlay ${state.storyViewer ? 'over-story' : ''} ${state.overlayClosing ? 'closing' : ''}" data-action="close-overlays">
        <section class="action-sheet ${state.overlayClosing ? 'closing' : ''}" data-stop-close>
          ${body || '<p class="hint">No actions available.</p>'}
          <button data-action="close-overlays">Cancel</button>
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
    const style = `filter:${storyFilterCss(editor.filter)}; transform:scale(${Number(editor.zoom || 1)});`;
    const tools = [
      ['text', 'Text', 'text'],
      ['stickers', 'Stickers', 'stickers'],
      ['audio', 'Music', 'music'],
      ['draw', 'Draw', 'pen'],
      ['filter', 'Effects', 'sparkle'],
      ['more', 'More', 'more']
    ];
    return `
      <div class="story-editor-page" data-action="close-story-editor">
        <div class="story-editor-canvas" data-stop-close>
          <div class="story-editor-preview">
            ${editor.isVideo
              ? `<video src="${esc(editor.dataUrl)}" controls playsinline style="${esc(style)}"></video>`
              : `<img src="${esc(editor.dataUrl)}" alt="" style="${esc(style)}">`}
            ${renderStoryDrawings(editor)}
            ${renderStoryEditorStickers(editor)}
            ${editor.textEditing ? `
              <textarea class="story-live-text ${esc(storyTextClass(editor))}" id="story-editor-text" maxlength="120" rows="1" placeholder="Type something" style="${esc(storyTextStyle(editor))}" autofocus>${esc(editor.text || '')}</textarea>
            ` : editor.text ? `
              <button class="story-draggable-text ${esc(storyTextClass(editor))}" data-action="story-text-drag" style="${esc(storyTextStyle(editor))}">${esc(editor.text)}</button>
            ` : ''}
            ${editor.pollQuestion ? renderPollSticker(editor) : ''}
            ${editor.audio ? `
              <div class="story-audio-sticker">
                ${icon('music')}
                <span>${esc(editor.audio.name || 'Audio')}</span>
                <audio src="${esc(editor.audio.dataUrl)}" controls></audio>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="story-object-trash" id="story-object-trash" aria-hidden="true">${icon('trash')}</div>
        ${renderStoryTopToolbar(editor, tools)}
        ${editor.textEditing ? `
          <input class="story-size-slider" id="story-text-size" type="range" min="22" max="96" step="1" value="${esc(editor.textSize || 44)}" aria-label="Text size">
        ` : ''}
        ${editor.activeTool === 'draw' ? `
          <input class="story-size-slider story-brush-slider" id="story-draw-size" type="range" min="2" max="20" step="1" value="${esc(editor.drawSize || 6)}" aria-label="Brush size">
        ` : ''}
        ${renderStoryFloatingTray(editor)}
        ${editor.textEditing || ['stickers', 'audio'].includes(editor.activeTool) ? '' : `
          <div class="story-share-bar" data-stop-close>
            <button class="story-share-pill" data-action="publish-story">
              ${avatarHtml(state.me)}
              <strong>Your story</strong>
            </button>
            <button class="story-share-send" data-action="publish-story" aria-label="Share story">${icon('send')}</button>
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
    const stories = (owner.stories || []).filter((item) => item.file);
    const index = Math.max(0, stories.findIndex((item) => item.id === story.id));
    const isVideo = story.file?.mime?.startsWith('video/');
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
            <button data-action="close-story-viewer" aria-label="Close story">${icon('x')}</button>
          </div>
        </div>
        <button class="story-tap-zone story-tap-prev" data-action="story-viewer-prev" aria-label="Previous story"></button>
        <button class="story-tap-zone story-tap-next" data-action="story-viewer-next" aria-label="Next story"></button>
        <div class="story-viewer-actions">
          <input id="story-viewer-comment" maxlength="280" placeholder="Add a comment...">
          <button class="${story.likedByMe ? 'active' : ''}" data-action="like-story" data-story-id="${esc(story.id)}" aria-label="Like story">${icon('heart')}</button>
          <button data-action="open-story-comments" data-story-id="${esc(story.id)}" aria-label="View comments">${icon('comment')}</button>
          <button data-action="submit-story-comment" data-story-id="${esc(story.id)}" aria-label="Post comment">${icon('send')}</button>
        </div>
      </section>
    `;
  }

  function renderStoryMenu() {
    if (!state.storyMenuOpen) return '';
    const currentStory = state.me?.stories?.[0];
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
                <strong>Message notifications</strong>
                <small>Show a browser notification when someone texts you while this site is open. HTTPS is required outside localhost.</small>
              </span>
              <input type="checkbox" data-action="toggle-message-notifications" ${state.messageNotifications ? 'checked' : ''}>
            </label>
          </section>
          ${renderTwoFactorPanel()}
          <section class="settings-block danger-zone">
            <button class="danger logout-btn" data-action="logout">Log out</button>
          </section>
        </section>
      </div>
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
    const [contacts, chats, notifications, recommendations] = await Promise.all([
      api('/api/contacts'),
      api('/api/chats'),
      api('/api/notifications').catch(() => ({ pendingRequestCount: 0, requests: [], notifications: [] })),
      api('/api/users/recommendations').catch(() => ({ users: [] }))
    ]);
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
    renderApp();
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
    renderApp();
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

  function createStoryEditorState({ dataUrl, name, type, lastModified, textEditing = false }) {
    return {
      dataUrl,
      name: name || 'story',
      type: type || 'image/png',
      lastModified: lastModified || Date.now(),
      isVideo: String(type || '').startsWith('video/'),
      activeTool: textEditing ? 'text' : null,
      textEditing,
      filter: 'normal',
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
      stickers: [],
      stickerDraft: '',
      stickerSearch: '',
      stickerComposer: null,
      pollQuestion: '',
      pollOptionA: 'Yes',
      pollOptionB: 'No',
      audio: null,
      audioStart: 0,
      audioEnd: 30,
      zoom: 1,
      trimStart: 0,
      trimEnd: 0
    };
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
    renderApp();
  }

  function beginBlankStoryEditor() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101722';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    state.storyEditor = createStoryEditorState({
      dataUrl: canvas.toDataURL('image/png'),
      name: 'story.png',
      type: 'image/png',
      lastModified: Date.now(),
      textEditing: true
    });
    state.storyMenuOpen = false;
    renderApp();
  }

  async function beginStoryAudio(file) {
    if (!file || !state.storyEditor) return;
    if (!file.type.startsWith('audio/')) {
      alert('Choose an audio file.');
      return;
    }
    state.storyEditor.audio = {
      dataUrl: await fileToDataUrl(file),
      name: file.name || 'story-audio',
      type: file.type || 'audio/mpeg',
      lastModified: file.lastModified || Date.now()
    };
    state.storyEditor.audioStart = 0;
    state.storyEditor.audioEnd = 30;
    renderApp();
  }

  function addStorySticker(type = 'emoji', suppliedLabel = '') {
    const editor = state.storyEditor;
    if (!editor) return;
    const draft = String(suppliedLabel || editor.stickerDraft || '').trim();
    const defaults = {
      emoji: '\u2728',
      gif: 'GIF',
      mention: draft ? (draft.startsWith('@') ? draft : `@${draft}`) : '@username',
      question: draft || 'Ask me',
      hashtag: draft ? (draft.startsWith('#') ? draft : `#${draft.replace(/^@/, '')}`) : '#New',
      countdown: draft || 'Countdown',
      location: draft || 'Location'
    };
    const sticker = {
      id: `story_sticker_${cryptoRandom()}`,
      type,
      label: draft || defaults[type] || 'Sticker',
      x: 50,
      y: 42,
      rotation: 0,
      size: type === 'emoji' ? 1.25 : 1
    };
    editor.stickers = [...(editor.stickers || []), sticker].slice(-20);
    editor.stickerDraft = '';
    editor.stickerComposer = null;
    editor.activeTool = null;
    renderApp();
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
      compositionVersion: 2,
      filter: editor.filter,
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
      trimEnd: editor.trimEnd
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
    ctx.filter = storyFilterCss(editor.filter);
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * Number(editor.zoom || 1);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.filter = 'none';
    drawStoryDrawingsOnCanvas(ctx, editor, canvas.width, canvas.height);
    drawStoryStickersOnCanvas(ctx, editor, canvas.width, canvas.height);
    if (editor.text) {
      const textSize = clamp(Number(editor.textSize || 44), 22, 96) * 1.55;
      ctx.font = `800 ${textSize}px ${storyTextFontCss(editor.textFont)}`;
      ctx.fillStyle = editor.textColor || '#ffffff';
      ctx.textAlign = ['left', 'center', 'right'].includes(editor.textAlign) ? editor.textAlign : 'center';
      ctx.textBaseline = 'middle';
      applyCanvasTextEffect(ctx, editor);
      ctx.save();
      ctx.translate(canvas.width * (clamp(Number(editor.textX || 50), 5, 95) / 100), canvas.height * (clamp(Number(editor.textY || 50), 5, 95) / 100));
      ctx.rotate((clamp(Number(editor.textRotation || 0), -180, 180) * Math.PI) / 180);
      if (editor.textBgEnabled || editor.textFrame) drawCanvasTextBox(ctx, editor.text, textSize, editor);
      wrapCanvasText(ctx, editor.text, 0, 0, canvas.width - 150, textSize * 1.15);
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
      ctx.strokeStyle = stroke.color || '#ffffff';
      ctx.lineWidth = Math.max(2, Number(stroke.size || 6) * 2.4);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
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
    if (!editor) return;
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
    renderApp();
  }

  async function saveStory(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/save`, { method: 'POST' });
    state.me = data.user;
    renderApp();
  }

  async function deleteStory(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE' });
    state.me = data.user;
    renderApp();
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
    renderApp();
    scheduleStoryAdvance(data.story);
  }

  async function navigateStory(direction) {
    const storyId = state.storyViewer?.storyId;
    const owner = storyOwnerById(storyId);
    const stories = (owner?.stories || []).filter((story) => story.file);
    const index = stories.findIndex((story) => story.id === storyId);
    const next = stories[index + direction];
    if (!next) {
      clearStoryAdvance();
      state.storyViewer = null;
      renderApp();
      return;
    }
    await viewStory(next.id);
  }

  async function toggleStoryLike(storyId) {
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/like`, { method: 'POST' });
    replaceStory(data.story);
    renderApp();
    if (state.storyViewer?.storyId === storyId) scheduleStoryAdvance(data.story);
  }

  async function submitStoryComment(storyId) {
    const input = document.getElementById('story-viewer-comment') || document.getElementById('story-comment-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    const data = await api(`/api/stories/${encodeURIComponent(storyId)}/comments`, {
      method: 'POST',
      body: { text }
    });
    replaceStory(data.story);
    state.actionSheet = { type: 'story-comments', storyId };
    renderApp();
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
    await refreshChatsOnly();
    renderApp({ scroll: 'bottom' });
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
    renderApp();
  }

  async function searchUsers(query) {
    if (!query.trim()) {
      state.searchResults = [];
      renderApp();
      return;
    }
    const data = await api(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
    state.searchResults = data.users;
    renderApp();
    const input = document.getElementById('user-search');
    if (input) {
      input.value = query;
      input.focus();
      input.setSelectionRange(query.length, query.length);
    }
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
      localStorage.removeItem('messageNotifications');
      renderApp();
      return;
    }
    if (!('Notification' in window)) {
      state.messageNotifications = false;
      alert('This browser does not support message notifications.');
      renderApp();
      return;
    }
    if (!window.isSecureContext) {
      state.messageNotifications = false;
      alert('Message notifications need HTTPS on iPhone and normal websites. We can enable this after the HTTPS step.');
      renderApp();
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    state.messageNotifications = permission === 'granted';
    if (state.messageNotifications) localStorage.setItem('messageNotifications', '1');
    else localStorage.removeItem('messageNotifications');
    renderApp();
  }

  function showIncomingMessageNotification(message) {
    if (!state.messageNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const sender = userById(message.senderId);
    const title = sender?.displayName || sender?.username || 'New message';
    try {
      const notification = new Notification(title, {
        body: describeMessage(message),
        icon: sender?.avatar?.url || undefined,
        tag: `chat-${message.senderId}`
      });
      notification.onclick = () => {
        window.focus();
        openChat(message.senderId).catch((error) => alert(error.message));
        notification.close();
      };
    } catch {
      // Some mobile browsers expose Notification but still block constructor use.
    }
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
      if (state.tab === 'chats') renderApp();
    }
    if (event.type === 'message:deleted') {
      const message = state.messages.find((item) => item.id === event.messageId);
      if (message) {
        message.deletedAt = event.deletedAt;
        message.deletedBy = event.deletedBy;
        message.text = '';
        message.attachment = null;
        renderApp();
      }
      await refreshChatsOnly();
    }
    if (event.type === 'message:hidden') {
      state.messages = state.messages.filter((item) => item.id !== event.messageId);
      renderApp();
    }
    if (event.type === 'notification:new') {
      state.pendingRequestCount = event.pendingRequestCount || state.pendingRequestCount;
      await refreshChatsOnly();
      renderApp();
    }
    if (event.type === 'relationship:updated') {
      await loadContactsAndChats();
      if (state.activePeer) state.activePeer = userById(state.activePeer.id) || state.activePeer;
      renderApp();
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

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
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
    lines.slice(0, 5).forEach((item, index) => ctx.fillText(item, x, startY + index * lineHeight));
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
    const delay = story.file?.mime?.startsWith('video/') ? 12000 : 7000;
    storyAdvanceTimer = setTimeout(() => {
      navigateStory(1).catch((error) => alert(error.message));
    }, delay);
  }

  function openActionSheet(sheet) {
    clearTimeout(overlayCloseTimer);
    state.overlayClosing = false;
    state.storyMenuOpen = false;
    state.actionSheet = sheet;
    renderApp();
  }

  function closeOverlays() {
    if (!state.actionSheet && !state.storyMenuOpen) return;
    clearTimeout(overlayCloseTimer);
    state.overlayClosing = true;
    renderApp();
    overlayCloseTimer = setTimeout(() => {
      state.actionSheet = null;
      state.storyMenuOpen = false;
      state.overlayClosing = false;
      renderApp();
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
        renderApp();
      }
      if (form.dataset.form === 'profile-edit') {
        await updateProfilePatch({
          username: formValue(form, 'username'),
          displayName: state.me.displayName,
          bio: formValue(form, 'bio')
        });
        state.profileEditOpen = false;
        renderApp();
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
        renderApp();
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
        renderApp();
      }
      if (action === 'close-media') {
        state.mediaViewer = null;
        renderApp();
      }
      if (action === 'close-story-editor') {
        state.storyEditor = null;
        storyTextPointers.clear();
        storyStickerPointers.clear();
        renderApp();
      }
      if (action === 'story-filter') {
        if (state.storyEditor) state.storyEditor.filter = target.dataset.filter || 'normal';
        renderApp();
      }
      if (action === 'story-tool') {
        if (state.storyEditor) {
          const tool = target.dataset.tool || 'text';
          if (tool === 'text') {
            state.storyEditor.activeTool = 'text';
            state.storyEditor.textEditing = true;
          } else {
            state.storyEditor.textEditing = false;
            state.storyEditor.activeTool = state.storyEditor.activeTool === tool ? null : tool;
          }
          if (tool !== 'stickers') state.storyEditor.stickerComposer = null;
        }
        renderApp();
      }
      if (action === 'finish-story-tool') {
        if (state.storyEditor) {
          state.storyEditor.textEditing = false;
          state.storyEditor.activeTool = null;
          state.storyEditor.stickerComposer = null;
        }
        renderApp();
      }
      if (action === 'cycle-story-text-align') {
        if (state.storyEditor) {
          const alignments = ['left', 'center', 'right'];
          const index = alignments.indexOf(state.storyEditor.textAlign || 'center');
          state.storyEditor.textAlign = alignments[(index + 1) % alignments.length];
        }
        renderApp();
      }
      if (action === 'cycle-story-text-animation') {
        if (state.storyEditor) {
          const animations = ['none', 'fade', 'rise', 'pop'];
          const index = animations.indexOf(state.storyEditor.textAnimation || 'none');
          state.storyEditor.textAnimation = animations[(index + 1) % animations.length];
        }
        renderApp();
      }
      if (action === 'story-color') {
        if (state.storyEditor) state.storyEditor.textColor = target.dataset.color || '#ffffff';
        renderApp();
      }
      if (action === 'story-bg-color') {
        if (state.storyEditor) {
          state.storyEditor.textBgColor = target.dataset.color || '#000000';
          state.storyEditor.textBgEnabled = true;
        }
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-font') {
        if (state.storyEditor) state.storyEditor.textFont = target.dataset.font || 'system';
        renderApp();
      }
      if (action === 'story-text-align') {
        if (state.storyEditor) state.storyEditor.textAlign = target.dataset.align || 'center';
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-text-bg') {
        if (state.storyEditor) state.storyEditor.textBgEnabled = !state.storyEditor.textBgEnabled;
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-text-frame') {
        if (state.storyEditor) state.storyEditor.textFrame = !state.storyEditor.textFrame;
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-text-effect') {
        if (state.storyEditor) state.storyEditor.textEffect = target.dataset.effect || 'shadow';
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-text-animation') {
        if (state.storyEditor) state.storyEditor.textAnimation = target.dataset.animation || 'none';
        updateStoryTextUi();
        renderApp();
      }
      if (action === 'story-draw-color') {
        if (state.storyEditor) state.storyEditor.drawColor = target.dataset.color || '#ffffff';
        renderApp();
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
        }
        renderApp();
      }
      if (action === 'story-sticker-back') {
        if (state.storyEditor) state.storyEditor.stickerComposer = null;
        renderApp();
      }
      if (action === 'commit-story-sticker') {
        addStorySticker(target.dataset.stickerType);
      }
      if (action === 'finish-story-poll') {
        if (state.storyEditor) {
          state.storyEditor.stickerComposer = null;
          state.storyEditor.activeTool = null;
        }
        renderApp();
      }
      if (action === 'story-audio-open') {
        document.getElementById('story-audio-input')?.click();
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
        renderApp();
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
        renderApp();
      }
      if (action === 'clear-reply') {
        state.replyTo = null;
        renderApp();
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
        renderApp();
      }
      if (action === 'open-settings') {
        state.settingsOpen = true;
        renderApp();
      }
      if (action === 'close-modal') {
        state.profileEditOpen = false;
        state.settingsOpen = false;
        renderApp();
      }
      if (action === 'toggle-recommendations') {
        state.recommendationsOpen = !state.recommendationsOpen;
        renderApp();
      }
      if (action === 'dismiss-recommendation') {
        if (confirm('Never show this recommendation again?')) {
          state.hiddenRecommendations = Array.from(new Set([...(state.hiddenRecommendations || []), target.dataset.userId]));
          localStorage.setItem('hiddenRecommendations', JSON.stringify(state.hiddenRecommendations));
          renderApp();
        }
      }
      if (action === 'toggle-profile-privacy') {
        await updateProfilePatch({ socialPublic: target.checked });
        renderApp();
      }
      if (action === 'toggle-profile-searchable') {
        await updateProfilePatch({ searchable: target.checked });
        renderApp();
      }
      if (action === 'toggle-message-notifications') {
        await setMessageNotifications(target.checked);
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
        renderApp();
      }
      if (action === 'open-story-create') {
        clearTimeout(overlayCloseTimer);
        state.actionSheet = null;
        state.storyMenuOpen = true;
        state.overlayClosing = false;
        renderApp();
      }
      if (action === 'create-story') {
        beginBlankStoryEditor();
      }
      if (action === 'post-story') {
        state.storyMenuOpen = false;
        renderApp();
        document.getElementById('story-input')?.click();
      }
      if (action === 'change-profile-picture') {
        state.storyMenuOpen = false;
        renderApp();
        document.getElementById('avatar-input')?.click();
      }
      if (action === 'cancel-avatar-crop') {
        state.avatarCrop = null;
        renderApp();
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
        if (confirm('Unfollow this user? The chat stays archived on the server and will return if you add each other again.')) await removeFriend(target.dataset.userId);
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
    } catch (error) {
      alert(error.message);
    }
  });

  document.addEventListener('input', (event) => {
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
      event.target.style.height = 'auto';
      event.target.style.height = `${Math.min(event.target.scrollHeight, window.innerHeight * 0.46)}px`;
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
    if (event.target.id === 'story-editor-zoom' && state.storyEditor) {
      state.storyEditor.zoom = Number(event.target.value || 1);
      const media = document.querySelector('.story-editor-preview img, .story-editor-preview video');
      if (media) media.style.transform = `scale(${state.storyEditor.zoom})`;
      return;
    }
    if (event.target.id === 'story-text-rotation' && state.storyEditor) {
      state.storyEditor.textRotation = Number(event.target.value || 0);
      updateStoryTextUi();
      return;
    }
    if (event.target.id === 'story-text-size' && state.storyEditor) {
      state.storyEditor.textSize = Number(event.target.value || 44);
      updateStoryTextUi();
      return;
    }
    if (event.target.id === 'story-draw-size' && state.storyEditor) {
      state.storyEditor.drawSize = Number(event.target.value || 6);
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
      state.storyEditor.stickerDraft = event.target.value.slice(0, 80);
      return;
    }
    if (event.target.id === 'story-audio-start' && state.storyEditor) {
      state.storyEditor.audioStart = Math.max(0, Number(event.target.value || 0));
      state.storyEditor.audioEnd = Math.min(Math.max(state.storyEditor.audioEnd || 30, state.storyEditor.audioStart), state.storyEditor.audioStart + 30);
      return;
    }
    if (event.target.id === 'story-audio-end' && state.storyEditor) {
      const start = Math.max(0, Number(state.storyEditor.audioStart || 0));
      state.storyEditor.audioEnd = Math.min(Math.max(start, Number(event.target.value || start + 30)), start + 30);
      event.target.value = String(state.storyEditor.audioEnd);
      return;
    }
    if (event.target.id === 'user-search') {
      const query = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchUsers(query).catch((error) => alert(error.message));
      }, 220);
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
  });

  document.addEventListener('focusout', (event) => {
    if (!event.target.closest('.story-viewer-actions')) return;
    setTimeout(() => {
      if (!state.storyViewer || document.activeElement?.closest('.story-viewer-actions')) return;
      scheduleStoryAdvance(storyById(state.storyViewer.storyId));
    }, 0);
  });

  document.addEventListener('pointerdown', async (event) => {
    if (state.me && event.clientX < 24 && !event.target.closest('input,textarea,button,a')) {
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

    const storyText = event.target.closest('[data-action="story-text-drag"]');
    if (state.storyEditor && storyText) {
      event.preventDefault();
      const canvas = storyText.closest('.story-editor-preview');
      const rect = canvas?.getBoundingClientRect();
      if (rect) {
        storyTextPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (storyTextPointers.size >= 2) {
          const points = Array.from(storyTextPointers.values()).slice(0, 2);
          state.storyTextDrag = null;
          state.storyTextGesture = {
            pointerIds: Array.from(storyTextPointers.keys()).slice(0, 2),
            angle: pointerAngle(points[0], points[1]),
            distance: Math.max(1, pointerDistance(points[0], points[1])),
            rotation: Number(state.storyEditor.textRotation || 0),
            size: Number(state.storyEditor.textSize || 44)
          };
        } else {
          state.storyTextDrag = { pointerId: event.pointerId, rect };
        }
        storyText.setPointerCapture?.(event.pointerId);
        document.getElementById('story-object-trash')?.classList.add('visible');
      }
      return;
    }

    const storyPreview = event.target.closest('.story-editor-preview');
    if (state.storyEditor?.activeTool === 'draw' && storyPreview && !event.target.closest('button,input,textarea,a,audio,video')) {
      event.preventDefault();
      const rect = storyPreview.getBoundingClientRect();
      const point = {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      };
      const stroke = {
        color: state.storyEditor.drawColor || '#ffffff',
        size: Number(state.storyEditor.drawSize || 6),
        points: [point]
      };
      state.storyEditor.drawings = [...(state.storyEditor.drawings || []), stroke].slice(-80);
      state.storyDraw = { pointerId: event.pointerId, rect, stroke };
      storyPreview.setPointerCapture?.(event.pointerId);
      updateStoryDrawPreview();
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
          const angleDelta = pointerAngle(points[0], points[1]) - state.storyTextGesture.angle;
          const distance = Math.max(1, pointerDistance(points[0], points[1]));
          state.storyEditor.textRotation = state.storyTextGesture.rotation + (angleDelta * 180) / Math.PI;
          state.storyEditor.textSize = clamp(state.storyTextGesture.size * (distance / state.storyTextGesture.distance), 22, 96);
          updateStoryTextUi();
        }
        return;
      }
      if (state.storyTextDrag?.pointerId === event.pointerId) {
        const rect = state.storyTextDrag.rect;
        state.storyEditor.textX = clamp(((event.clientX - rect.left) / rect.width) * 100, 5, 95);
        state.storyEditor.textY = clamp(((event.clientY - rect.top) / rect.height) * 100, 5, 95);
        updateStoryTextUi();
        document.getElementById('story-object-trash')?.classList.toggle('active', event.clientY > rect.bottom - 96);
      }
      return;
    }
    if (state.storyDraw?.pointerId === event.pointerId) {
      const rect = state.storyDraw.rect;
      state.storyDraw.stroke.points.push({
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      });
      updateStoryDrawPreview();
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
        renderApp();
      }
      state.edgeSwipe = null;
      return;
    }
    if (storyTextPointers.has(event.pointerId)) {
      const trash = document.getElementById('story-object-trash');
      const removeText = Boolean(trash?.classList.contains('active'));
      storyTextPointers.delete(event.pointerId);
      if (state.storyTextDrag?.pointerId === event.pointerId) state.storyTextDrag = null;
      if (storyTextPointers.size < 2) state.storyTextGesture = null;
      trash?.classList.remove('visible', 'active');
      if (removeText && state.storyEditor) {
        state.storyEditor.text = '';
        renderApp();
      }
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
        renderApp();
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
    state.storyStickerDrag = null;
    state.storyStickerGesture = null;
    state.storyDraw = null;
    storyTextPointers.clear();
    storyStickerPointers.clear();
    cropPointers.clear();
    document.getElementById('story-object-trash')?.classList.remove('visible', 'active');
    state.edgeSwipe = null;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  });

  document.addEventListener('wheel', (event) => {
    if (!state.avatarCrop || !event.target.closest('#crop-stage')) return;
    event.preventDefault();
    state.avatarCrop.zoom = clamp((state.avatarCrop.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 1, 3);
    updateCropUi();
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
