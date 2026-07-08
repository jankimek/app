(function () {
  const app = document.getElementById('app');

  const state = {
    authMode: 'login',
    needsTwoFactor: false,
    me: null,
    twoFactorEnabled: false,
    twoFactorSetup: null,
    tab: 'chats',
    lastTab: 'chats',
    contacts: [],
    chats: [],
    activePeer: null,
    chatProfileOpen: false,
    messages: [],
    highlightMessageId: null,
    searchResults: [],
    conversationQuery: '',
    conversationResults: [],
    conversationSearching: false,
    recommendations: [],
    publicProfile: null,
    pendingRequestCount: 0,
    notifications: [],
    requests: [],
    actionSheet: null,
    storyMenuOpen: false,
    stickerPanel: false,
    stickers: [],
    stickerMap: new Map(),
    replyTo: null,
    ws: null,
    typingTimer: null,
    recorder: null,
    recordStream: null,
    recordChunks: [],
    drag: null,
    edgeSwipe: null,
    longPressTimer: null,
    longPressTriggered: false,
    call: freshCallState()
  };

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
    return `<span class="avatar">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc(initials(user))}</span>`;
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
      send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>',
      bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>',
      trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 16h10l1-16"/></svg>',
      mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
      block: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg>',
      story: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 8v8M8 12h8"/></svg>'
    };
    return `<span class="ui-icon" aria-hidden="true">${icons[name] || ''}</span>`;
  }

  function navButton(tab, label, iconName) {
    const active = state.tab === tab || (state.tab === 'notifications' && tab === 'chats');
    return `
      <button class="bottom-tab ${active ? 'active' : ''}" data-action="tab" data-tab="${tab}" title="${esc(label)}" aria-label="${esc(label)}">
        ${icon(iconName)}
      </button>
    `;
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
        <section class="auth-box">
          <div class="intro">
            <div>
              <h1>Private messages</h1>
              <p>A dark, mobile-first chat space with username search, media, stickers, voice notes, exports, and profile pages.</p>
            </div>
            <div class="feature-strip">
              <span>Username search and profile pages</span>
              <span>Images, videos, documents, voice notes</span>
              <span>Swipe replies, deletes, exports</span>
            </div>
          </div>
          <div class="auth-card">
            <div class="auth-tabs">
              <button type="button" class="${state.authMode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">Log in</button>
              <button type="button" class="${state.authMode === 'register' ? 'active' : ''}" data-action="auth-mode" data-mode="register">Create</button>
            </div>
            <form class="form" data-form="auth">
              ${state.authMode === 'register' ? `
                <label class="field">Username
                  <input name="username" autocomplete="username" placeholder="emran_01" required>
                </label>
                <label class="field">Email
                  <input name="email" type="email" autocomplete="email" placeholder="you@example.com">
                </label>
                <label class="field">Phone
                  <input name="phone" autocomplete="tel" placeholder="+49123456789">
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
              <p class="hint">This starter app stores data on your server disk. Use HTTPS before real users join.</p>
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

  function renderApp() {
    app.innerHTML = `
      <div class="app-shell ${state.activePeer ? 'chat-open' : ''}">
        ${renderSidebar()}
        ${renderChatPane()}
      </div>
      <div id="call-dock-slot">${renderCallDock()}</div>
      ${renderActionSheet()}
      ${renderStoryMenu()}
    `;
    setTimeout(() => {
      if (state.highlightMessageId) scrollHighlightedMessage();
      else scrollMessagesToBottom();
      attachCallStreams();
    }, 0);
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="side-content tab-content" data-tab="${esc(state.tab)}">
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
    const chatRows = state.chats.length ? state.chats.map((chat) => `
      <button class="chat-item ${state.activePeer?.id === chat.peer.id ? 'active' : ''}" data-action="open-chat" data-user-id="${esc(chat.peer.id)}" data-peer-id="${esc(chat.peer.id)}">
        ${avatarHtml(chat.peer)}
        <span class="person">
          <strong>${esc(chat.peer.displayName)}</strong>
          <small>${chat.peer.hasBlocked ? 'Blocked' : chat.peer.muteUntil !== undefined && chat.peer.muteUntil !== null ? 'Muted - ' : ''}${esc(chat.latest ? describeMessage(chat.latest) : 'No messages yet')}</small>
        </span>
        <small>${chat.latest ? esc(shortTime(chat.latest.createdAt)) : ''}</small>
      </button>
    `).join('') : '<div class="empty-state">Search for a username and add someone to start chatting.</div>';
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
    return `
      <section class="search-page-head">
        <input class="search-input" id="user-search" placeholder="Search users" autocomplete="off">
      </section>
      <section class="panel-card">
        <div class="result-list" id="search-results">
          ${renderSearchResults()}
        </div>
      </section>
      ${state.publicProfile ? renderPublicProfileCard(state.publicProfile) : ''}
    `;
  }

  function renderProfilePanel() {
    const profileUrl = `${location.origin}/u/${state.me.username}`;
    const story = state.me.stories?.[0];
    return `
      <section class="profile-hero">
        <button class="avatar profile-avatar-btn" data-action="avatar-menu" title="Profile picture and story">
          ${state.me.avatar?.url ? `<img src="${esc(state.me.avatar.url)}" alt="">` : esc(initials(state.me))}
          ${story ? '<span class="story-ring"></span>' : ''}
        </button>
        <div>
          <strong>${esc(state.me.displayName)}</strong>
          <span>@${esc(state.me.username)}</span>
          <div class="social-stats">
            <span><strong>${state.me.followerCount ?? 0}</strong> followers</span>
            <span><strong>${state.me.followingCount ?? 0}</strong> following</span>
          </div>
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
          ${story.file.mime.startsWith('video/') ? `<video src="${esc(story.file.url)}" controls playsinline></video>` : `<img src="${esc(story.file.url)}" alt="">`}
          <div class="toolbar">
            ${story.saved ? '<span class="hint">Saved</span>' : `<button class="secondary" data-action="save-story" data-story-id="${esc(story.id)}">Save</button>`}
            <button class="danger" data-action="delete-story" data-story-id="${esc(story.id)}">Delete forever</button>
          </div>
        </section>
      ` : ''}
      <section class="panel-card">
        <h2>Profile</h2>
        <form class="form" data-form="profile">
          <label class="field">Display name
            <input name="displayName" value="${esc(state.me.displayName)}" maxlength="60">
          </label>
          <label class="field">Bio
            <textarea name="bio" maxlength="280">${esc(state.me.bio || '')}</textarea>
          </label>
          <label class="checkbox-field">
            <input name="socialPublic" type="checkbox" ${state.me.socialPublic ? 'checked' : ''}>
            <span>Show followers and following publicly</span>
          </label>
          <button class="primary" type="submit">Save profile</button>
        </form>
      </section>
      ${renderSocialLists(state.me)}
      ${renderRecommendations()}
      ${renderTwoFactorPanel()}
      <section class="panel-card danger-zone">
        <button class="danger logout-btn" data-action="logout">Log out</button>
      </section>
    `;
  }

  function renderSocialLists(user) {
    if (!user.followersVisible) {
      return `
        <section class="panel-card">
          <h2>Followers</h2>
          <p class="hint">This profile keeps followers and following private.</p>
        </section>
      `;
    }
    return `
      <section class="panel-card social-lists">
        <h2>Followers</h2>
        <div class="mini-user-list">
          ${(user.followers || []).slice(0, 8).map((item) => `<span>${avatarHtml(item)}<small>@${esc(item.username)}</small></span>`).join('') || '<p class="hint">No followers yet.</p>'}
        </div>
        <h2>Following</h2>
        <div class="mini-user-list">
          ${(user.following || []).slice(0, 8).map((item) => `<span>${avatarHtml(item)}<small>@${esc(item.username)}</small></span>`).join('') || '<p class="hint">Not following anyone yet.</p>'}
        </div>
      </section>
    `;
  }

  function renderRecommendations() {
    if (!state.recommendations.length) {
      return `
        <section class="panel-card">
          <h2>Suggestions</h2>
          <p class="hint">Friends of friends will appear here after you add more people.</p>
        </section>
      `;
    }
    return `
      <section class="panel-card">
        <h2>Suggestions</h2>
        <div class="result-list">
          ${state.recommendations.map((user) => `
            <article class="person-card">
              ${avatarHtml(user)}
              <span class="person">
                <strong>${esc(user.displayName)}</strong>
                <small>@${esc(user.username)} - ${esc(user.mutualCount)} mutual</small>
              </span>
              <button class="mini-btn" data-action="add-contact" data-username="${esc(user.username)}">Add</button>
            </article>
          `).join('')}
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
    if (!isMe) {
      if (user.isContact) controls = `<button class="mini-btn" data-action="open-chat" data-user-id="${esc(user.id)}">Chat</button>`;
      else if (user.incomingRequest) controls = `<button class="mini-btn" data-action="accept-request" data-request-id="${esc(user.incomingRequest.id)}">Accept</button><button class="mini-btn" data-action="decline-request" data-request-id="${esc(user.incomingRequest.id)}">Decline</button>`;
      else if (user.outgoingRequest) controls = '<button class="mini-btn" disabled>Requested</button>';
      else if (user.hasBlocked || user.blockedBy) controls = '<button class="mini-btn" disabled>Blocked</button>';
      else controls = `<button class="mini-btn" data-action="add-contact" data-username="${esc(user.username)}">Add</button>`;
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
      <main class="chat-pane">
        <header class="chat-header">
          <button class="icon-btn back-btn" title="Back" aria-label="Back" data-action="back">${icon('back')}</button>
          <button class="chat-profile-button" data-action="open-chat-profile">
            ${avatarHtml(state.activePeer)}
          </button>
          <button class="chat-title" data-action="open-chat-profile">
            <strong>${esc(state.activePeer.displayName)}</strong>
            <small>@${esc(state.activePeer.username)} <span id="typing-label"></span></small>
          </button>
          <div class="toolbar" style="margin-left:auto">
            <button class="icon-btn" title="Voice call" aria-label="Voice call" data-action="audio-call">${icon('phone')}</button>
            <button class="icon-btn" title="Video call" aria-label="Video call" data-action="video-call">${icon('video')}</button>
          </div>
        </header>
        <section class="messages" id="messages">
          ${state.messages.length ? state.messages.map(renderMessage).join('') : '<div class="empty-state">No messages yet. Send the first one.</div>'}
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
              <textarea id="composer-text" class="composer-input" rows="1" placeholder="Message ${esc(state.activePeer.displayName)}"></textarea>
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
    return `
      <main class="chat-pane profile-pane">
        <header class="chat-header">
          <button class="icon-btn back-btn" title="Back" aria-label="Back" data-action="close-chat-profile">${icon('back')}</button>
          <div class="chat-title">
            <strong>Profile</strong>
            <small>@${esc(peer.username)}</small>
          </div>
        </header>
        <section class="chat-profile-content">
          <div class="peer-profile-hero">
            <span class="avatar big-avatar">
              ${peer.avatar?.url ? `<img src="${esc(peer.avatar.url)}" alt="">` : esc(initials(peer))}
              ${story ? '<span class="story-ring"></span>' : ''}
            </span>
            <strong>${esc(peer.displayName)}</strong>
            <span>@${esc(peer.username)}</span>
            <div class="social-stats centered">
              ${peer.followersVisible
                ? `<span><strong>${peer.followerCount ?? 0}</strong> followers</span><span><strong>${peer.followingCount ?? 0}</strong> following</span>`
                : '<span>Followers private</span>'}
            </div>
            <p>${esc(peer.bio || 'No bio yet.')}</p>
          </div>
          ${peer.followersVisible ? renderSocialLists(peer) : ''}
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

  function renderMessage(message) {
    const mine = message.senderId === state.me.id;
    const highlighted = state.highlightMessageId === message.id;
    return `
      <article class="message ${mine ? 'mine' : 'theirs'} ${message.deletedAt ? 'deleted' : ''} ${highlighted ? 'highlighted' : ''}" data-message-id="${esc(message.id)}">
        <div class="swipe-time">${esc(formatTime(message.createdAt))}</div>
        <div class="bubble">
          ${message.replyPreview ? `<div class="reply-preview">${esc(describeMessage(message.replyPreview)).slice(0, 160)}</div>` : ''}
          ${renderMessageBody(message)}
        </div>
      </article>
    `;
  }

  function renderMessageBody(message) {
    if (message.deletedAt) return '<div class="message-text">Message deleted</div>';
    const attachment = message.attachment;
    if (message.kind === 'image' && attachment) {
      return `<img class="media-image" src="${esc(attachment.url)}" alt="${esc(attachment.name)}">${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
    }
    if (message.kind === 'video' && attachment) {
      return `<video class="media-video" src="${esc(attachment.url)}" controls playsinline></video>${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
    }
    if (message.kind === 'voice' && attachment) {
      return `<audio src="${esc(attachment.url)}" controls></audio>${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}`;
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
      if (local) return `<img class="sticker-img" src="${esc(local.dataUrl)}" alt="${esc(local.name)}">`;
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
          <button class="secondary" data-action="create-text-sticker">Create</button>
          <button class="secondary" data-action="sticker-file-open">Image</button>
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
    const recent = state.notifications.length ? state.notifications.map((note) => `
      <article class="notification-row">
        ${avatarHtml(note.actor)}
        <span class="person">
          <strong>${esc(note.actor?.displayName || 'Update')}</strong>
          <small>${esc(note.text || note.type)} - ${esc(shortTime(note.createdAt))}</small>
        </span>
      </article>
    `).join('') : '<p class="hint">Recent changes will appear here.</p>';
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
        <button class="danger-text" data-action="remove-friend" data-user-id="${esc(peer.id)}">${icon('trash')} Remove friend</button>
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
        ${message.senderId === state.me.id && !message.deletedAt ? `<button class="danger-text" data-action="delete-message" data-message-id="${esc(message.id)}">${icon('trash')} Delete message</button>` : ''}
      `;
    }
    if (sheet.type === 'profile-link') {
      body = `
        <input class="search-input" value="${esc(sheet.link)}" readonly>
        <button data-action="copy-profile-link" data-link="${esc(sheet.link)}">${icon('link')} Copy to clipboard</button>
      `;
    }
    return `
      <div class="overlay" data-action="close-overlays">
        <section class="action-sheet" data-stop-close>
          ${body || '<p class="hint">No actions available.</p>'}
          <button data-action="close-overlays">Cancel</button>
        </section>
      </div>
    `;
  }

  function renderStoryMenu() {
    if (!state.storyMenuOpen) return '';
    return `
      <div class="overlay" data-action="close-overlays">
        <section class="action-sheet" data-stop-close>
          <button data-action="post-story">${icon('story')} Post story</button>
          <button data-action="change-profile-picture">${icon('profile')} Change profile picture</button>
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
    state.replyTo = null;
    state.stickerPanel = false;
    state.highlightMessageId = highlightMessageId;
    const data = await api(`/api/chats/${encodeURIComponent(userId)}/messages`);
    state.messages = data.messages;
    renderApp();
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
    await api(`/api/contacts/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (state.activePeer?.id === userId) {
      state.activePeer = null;
      state.chatProfileOpen = false;
    }
    await loadContactsAndChats();
    state.actionSheet = null;
    renderApp();
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

  async function uploadAvatar(file) {
    if (!file) return;
    const body = {
      displayName: state.me.displayName,
      bio: state.me.bio || '',
      avatar: {
        name: file.name,
        type: file.type,
        dataUrl: await fileToDataUrl(file),
        lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
      }
    };
    const data = await api('/api/me/profile', { method: 'PATCH', body });
    state.me = data.user;
    state.storyMenuOpen = false;
    renderApp();
  }

  async function uploadStory(file) {
    if (!file) return;
    const data = await api('/api/me/story', {
      method: 'POST',
      body: {
        file: {
          name: file.name,
          type: file.type,
          dataUrl: await fileToDataUrl(file),
          lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null
        }
      }
    });
    state.me = data.user;
    state.storyMenuOpen = false;
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

  async function sendCurrentText() {
    const input = document.getElementById('composer-text');
    const text = input?.value.trim();
    if (!text || !state.activePeer) return;
    input.value = '';
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
    renderApp();
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
    const caption = input?.value.trim() || '';
    if (input) input.value = '';
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
      if (event.chatId === activeIds) {
        upsertMessage(event.message);
        renderApp();
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
    if (event.type === 'typing' && event.from === state.activePeer?.id) {
      const label = document.getElementById('typing-label');
      if (label) label.textContent = event.isTyping ? 'typing...' : '';
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
    if (!text) return;
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

  function scrollMessagesToBottom() {
    const messages = document.getElementById('messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
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
        state.tab = 'chats';
        state.lastTab = 'chats';
        state.activePeer = null;
        state.chatProfileOpen = false;
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
    if (action === 'close-overlays' && event.target.closest('[data-stop-close]')) return;
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
        renderAuth();
      }
      if (action === 'tab') {
        state.lastTab = state.tab;
        state.tab = target.dataset.tab;
        state.activePeer = null;
        state.chatProfileOpen = false;
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
        renderApp();
      }
      if (action === 'open-chat-profile') {
        state.chatProfileOpen = true;
        renderApp();
      }
      if (action === 'close-chat-profile') {
        state.chatProfileOpen = false;
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
        state.tab = 'notifications';
        await refreshChatsOnly();
        renderApp();
      }
      if (action === 'back-from-notifications') {
        state.tab = state.lastTab === 'notifications' ? 'chats' : (state.lastTab || 'chats');
        renderApp();
      }
      if (action === 'close-overlays') {
        state.actionSheet = null;
        state.storyMenuOpen = false;
        renderApp();
      }
      if (action === 'copy-profile-link') {
        await navigator.clipboard.writeText(target.dataset.link);
        target.textContent = 'Copied';
      }
      if (action === 'show-profile-link') {
        state.actionSheet = { type: 'profile-link', link: target.dataset.link };
        renderApp();
      }
      if (action === 'avatar-menu') {
        state.storyMenuOpen = true;
        renderApp();
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
      if (action === 'save-story') {
        await saveStory(target.dataset.storyId);
      }
      if (action === 'delete-story') {
        if (confirm('Delete this story forever?')) await deleteStory(target.dataset.storyId);
      }
      if (action === 'mute-menu') {
        state.actionSheet = { type: 'mute', peerId: target.dataset.userId };
        renderApp();
      }
      if (action === 'set-mute') {
        await setMuteFor(target.dataset.userId, target.dataset.minutes);
      }
      if (action === 'remove-friend') {
        if (confirm('Remove this friend? The chat stays archived on the server and will return if you add each other again.')) await removeFriend(target.dataset.userId);
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
        if (file) await uploadAvatar(file);
      }
      if (event.target.id === 'story-input') {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) await uploadStory(file);
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
    if (event.target.id === 'user-search') {
      const query = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchUsers(query).catch((error) => alert(error.message));
      }, 220);
    }
    if (event.target.id === 'composer-text') {
      event.target.style.height = 'auto';
      event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
      sendTypingSignal(true);
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => sendTypingSignal(false), 900);
    }
  });

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

  document.addEventListener('pointerdown', async (event) => {
    if (state.me && event.clientX < 24 && !event.target.closest('input,textarea,button,a')) {
      state.edgeSwipe = { startX: event.clientX, startY: event.clientY };
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
        state.actionSheet = { type: 'chat-user', peerId: chatItem.dataset.peerId };
        renderApp();
      }, 560);
      return;
    }

    const message = event.target.closest('.message');
    if (!message || event.target.closest('button,a,input,textarea,video,audio')) return;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => {
      state.longPressTriggered = true;
      state.actionSheet = { type: 'message', messageId: message.dataset.messageId };
      renderApp();
    }, 560);
    state.drag = {
      id: message.dataset.messageId,
      el: message,
      startX: event.clientX,
      startY: event.clientY
    };
  });

  document.addEventListener('pointermove', (event) => {
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
      state.drag.el.classList.add('reveal-time');
      const amount = dx < 0 ? Math.max(dx, -92) : Math.min(dx, 92);
      state.drag.el.style.transform = `translateX(${amount}px)`;
      state.drag.el.style.transition = 'none';
    }
  });

  document.addEventListener('pointerup', (event) => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    const recordButton = event.target.closest('[data-action="record-voice"]') || document.querySelector('.recording');
    if (recordButton) stopRecording(recordButton);
    if (state.edgeSwipe) {
      const dx = event.clientX - state.edgeSwipe.startX;
      const dy = event.clientY - state.edgeSwipe.startY;
      if (dx > 90 && Math.abs(dx) > Math.abs(dy)) {
        if (state.chatProfileOpen) state.chatProfileOpen = false;
        else if (state.activePeer) state.activePeer = null;
        else if (state.lastTab && state.lastTab !== state.tab) {
          const current = state.tab;
          state.tab = state.lastTab;
          state.lastTab = current;
        }
        renderApp();
      }
      state.edgeSwipe = null;
    }
    if (state.drag) {
      const dx = event.clientX - state.drag.startX;
      state.drag.el.style.transform = '';
      state.drag.el.style.transition = '';
      state.drag.el.classList.remove('reveal-time');
      if (dx < -70) {
        state.replyTo = state.messages.find((message) => message.id === state.drag.id) || null;
        renderApp();
      }
      if (dx > 70 && state.replyTo?.id === state.drag.id) {
        state.replyTo = null;
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
    state.edgeSwipe = null;
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  });

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
