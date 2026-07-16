const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'TestPass123!';
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TEXT_DATA = 'data:text/plain;base64,SGVsbG8gZnJvbSBhIGRvY3VtZW50Lg==';
const AUDIO_DATA = 'data:audio/wav;base64,UklGRg==';
const VIDEO_DATA = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQy';
const GIF_DATA = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const SVG_DATA = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIj48dGV4dCB4PSIyNTYiIHk9IjI1NiI+SGk8L3RleHQ+PC9zdmc+';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
  }

  async request(route, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: options.method || 'GET',
      headers,
      body,
      redirect: 'manual'
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) data = await response.json();
    else if (contentType.startsWith('text/')) data = await response.text();
    else data = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, data };
  }

  async raw(route, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: options.method || 'POST',
      headers,
      body: options.body,
      redirect: 'manual'
    });
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) data = await response.json();
    else if (contentType.startsWith('text/')) data = await response.text();
    else data = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, data };
  }
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of value.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index >= 0) bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(value % 1000000).padStart(6, '0');
}

async function waitForServer(baseUrl, child) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server stopped with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Timed out waiting for the test server.');
}

async function register(client, username) {
  const response = await client.request('/api/auth/register', {
    method: 'POST',
    body: { username, password: PASSWORD }
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.user.username, username);
  assert.equal(response.data.user.avatarViewable, true);
  assert.equal(response.data.user.recommendable, true);
  assert.equal(response.data.user.mentionPermission, 'everyone');
  assert.equal(response.data.user.storyReplies, 'everyone');
  assert.equal(response.data.user.friendRequests, 'everyone');
  assert.equal(response.data.user.allowGroupAdds, true);
  assert.ok(client.cookie.startsWith('chat_sid='));
  return response.data.user;
}

async function sendMessage(client, peerId, body) {
  return client.request(`/api/chats/${encodeURIComponent(peerId)}/messages`, {
    method: 'POST',
    body
  });
}

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('mobile viewport and story editing controls stay inside their gesture boundaries', () => {
  const clientSource = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(htmlSource, /maximum-scale=1, user-scalable=no/);
  assert.match(htmlSource, /styles\.css\?v=\d{8}-\d+/);
  assert.match(htmlSource, /app\.js\?v=\d{8}-\d+/);
  assert.match(styleSource, /html \{[\s\S]*?overscroll-behavior: none;[\s\S]*?touch-action: manipulation;/);
  assert.match(styleSource, /#app \{[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(styleSource, /\.chat-pane \{[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(styleSource, /\.messages \{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?overflow-anchor: none;[\s\S]*?touch-action: pan-y;/);
  assert.match(styleSource, /@supports \(-webkit-touch-callout: none\)[\s\S]*?\.composer-input \{[\s\S]*?font-size: 16px;/);
  assert.match(clientSource, /id="story-text-size"[^>]*data-stop-close/);
  assert.match(clientSource, /id="story-draw-size"[^>]*data-stop-close/);
  assert.match(clientSource, /class="story-size-control story-text-size-control"/);
  assert.match(clientSource, /id="story-editor-text" data-action="story-text-drag"/);
  assert.match(clientSource, /class="story-text-choice-rail story-\$\{panel\}-choices"/);
  assert.match(clientSource, /class="story-text-format-bar"/);
  assert.match(clientSource, /class="story-editor-mode-switch"/);
  assert.doesNotMatch(clientSource, /story-option-strip story-text-style-strip/);
  assert.match(clientSource, /const storyMediaPointers = new Map\(\)/);
  assert.match(clientSource, /requestAnimationFrame\(\(\) =>/);
  assert.match(clientSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(clientSource, /function resizeStoryTextInput/);
  assert.match(clientSource, /function centerStoryActiveChoice/);
  assert.match(clientSource, /const continuingTextGesture = storyTextPointers\.size > 0/);
  assert.match(clientSource, /const appSwipeStartsAt = 16/);
  assert.match(clientSource, /const gestureControl = event\.target\.closest\('button, a, input, textarea, select/);
  assert.match(clientSource, /event\.clientX >= appSwipeStartsAt && event\.clientX < appSwipeStartsAt \+ 32/);
  assert.match(clientSource, /!hasActiveConversation\(\) && isAppBackSwipe/);
  assert.match(clientSource, /if \(!swipe\.moved\) \{[\s\S]*?state\.edgeSwipe = null;[\s\S]*?return;/);
  assert.match(clientSource, /function renderMessageFocus/);
  assert.match(clientSource, /function capturePersistentScroll/);
  assert.match(clientSource, /state\.tabSwipe = \{/);
  assert.match(styleSource, /background-attachment: fixed/);
  assert.match(clientSource, /data-action="open-highlight-composer"/);
  assert.match(clientSource, /saved: publishToHighlight/);
  assert.match(clientSource, /function renderHighlightComposer/);
  assert.match(clientSource, /data-action="rename-highlight"/);
  assert.match(clientSource, /data-action="publish-story-only"/);
  assert.match(clientSource, /conversationCache: new Map\(\)/);
  assert.match(clientSource, /conversationScroll: new Map\(\)/);
  assert.equal((clientSource.match(/const scrollMode = highlightMessageId \? 'preserve' : 'bottom';/g) || []).length, 2);
  assert.match(clientSource, /if \(scrollMode === 'bottom' && cached\?\.messages\?\.length\) stabilizeBottomScroll\(\);/);
  assert.match(clientSource, /resizeObserver = new ResizeObserver\(settle\)/);
  assert.match(clientSource, /const minimumSettleMs = currentAppShell\(\)\?\.classList\.contains\('route-page-entering'\) \? 360 : 0;/);
  assert.match(clientSource, /safetyTimer = setTimeout\(finish, 15000\)/);
  assert.match(clientSource, /Promise\.all\(\[[\s\S]*?waitForChatMedia\(messages, settle\)[\s\S]*?minimumSettleMs/);
  assert.match(clientSource, /state\.chatLoading \|\| chatScrollSettleCleanup \|\| event\.target\.classList\.contains\('chat-settling'\)/);
  assert.match(clientSource, /function updateChatPane/);
  assert.match(clientSource, /function promoteNavigationPreview/);
  assert.match(clientSource, /function clearTabTransitionAnimation/);
  assert.match(clientSource, /function settleTabTransitionAnimation/);
  assert.match(clientSource, /clearTabTransitionAnimation\(liveShell\)/);
  assert.match(clientSource, /function prepareNavigationUnderlay/);
  assert.match(clientSource, /function activateNavigationShellLayer/);
  assert.match(clientSource, /const validHandoff = Boolean\([\s\S]*?preview\?\.isConnected[\s\S]*?preview\.navigationEntry === entry[\s\S]*?target\?\.isConnected[\s\S]*?target\.parentElement === app[\s\S]*?current === preview\.navigationSurface[\s\S]*?current !== target/);
  assert.match(clientSource, /state\.navigationStack\[state\.navigationStack\.length - 1\] !== entry/);
  assert.match(clientSource, /if \(!preview\) \{[\s\S]*?finishNavigationBack\(entry, \{ \.\.\.options, preview: null \}\)/);
  assert.match(clientSource, /:scope > \.app-shell:not\(\.route-page-underlay\)/);
  assert.match(clientSource, /const liveScroll = captureLiveScroll\(target\)/);
  assert.match(clientSource, /function restoreLiveScrollAfterMove/);
  assert.match(clientSource, /function restoreScrollPosition/);
  assert.match(clientSource, /function scheduleNavigationMaintenance/);
  assert.match(clientSource, /restoreLiveScrollAfterMove\(liveScroll\)/);
  assert.match(clientSource, /preview\.usesLiveShell = Boolean\(liveShell\)/);
  assert.match(clientSource, /if \(state\.navigationBusy\) return;/);
  assert.match(clientSource, /function requestNavigationBack/);
  assert.match(clientSource, /function discardNavigationForMainTab/);
  assert.match(clientSource, /state\.navigationStack = \[\];[\s\S]*?state\.forwardNavigationEntries\.clear\(\)/);
  assert.match(clientSource, /navigationGeneration: Number\.isInteger\(history\.state\?\.navGeneration\)/);
  assert.match(clientSource, /targetGeneration !== state\.navigationGeneration/);
  assert.match(clientSource, /discardNavigationForMainTab\(\);[\s\S]*?const keepDesktopChat/);
  assert.match(clientSource, /function beginSwipeNavigationBack/);
  assert.match(clientSource, /function restoreForwardNavigationEntry/);
  assert.match(clientSource, /cancelForwardNavigationAnimation\(current\)/);
  assert.match(clientSource, /function deferNavigationHandoff/);
  assert.match(clientSource, /propertyName = ''/);
  assert.match(clientSource, /const isOneStepBack = currentDepth > 0 && targetDepth === currentDepth - 1/);
  assert.match(clientSource, /instant: !requestedByApp/);
  assert.match(clientSource, /const isOneStepForward = targetDepth === currentDepth \+ 1/);
  assert.match(clientSource, /function renderCameraCapture/);
  assert.match(clientSource, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(clientSource, /openCameraCapture\('story'/);
  assert.match(clientSource, /openCameraCapture\('chat'/);
  assert.match(styleSource, /class="message-focus-overlay"|\.message-focus-overlay/);
  assert.match(clientSource, /class="message-focus-host"/);
  assert.match(clientSource, /const MESSAGE_LONG_PRESS_MS = 500;/);
  assert.match(clientSource, /const MESSAGE_PRESS_CANCEL_DISTANCE = 10;/);
  assert.match(clientSource, /function beginMessagePress/);
  assert.match(clientSource, /function finishMessagePress/);
  assert.match(clientSource, /clearActiveMessagePress\(\{ pointerId, suppressClick: true \}\)/);
  assert.match(styleSource, /\.message\.message-press-pending \.bubble/);
  assert.match(styleSource, /\.message\.message-press-held \.bubble/);
  assert.match(clientSource, /function renderStickerManager/);
  assert.match(clientSource, /data-action="like-story-comment"/);
  assert.match(clientSource, /function renderHighlightCommentPreview/);
  assert.match(clientSource, /class="highlight-comment-preview" data-action="open-story-comments"/);
  assert.match(clientSource, /data-action="send-story-comment-gif"/);
  assert.match(clientSource, /data-action="toggle-story-comment-gifs"/);
  assert.match(clientSource, /function searchStoryCommentGifs/);
  assert.match(clientSource, /data-action="view-own-profile"/);
  assert.match(clientSource, /function openOwnProfileFromStoryComments/);
  assert.match(styleSource, /\.story-comments-sheet \.comment-username,[\s\S]*?display: inline;/);
  assert.match(styleSource, /\.story-comment-gif-grid/);
  assert.match(styleSource, /@keyframes highlightCommentPreviewIn/);
  assert.match(styleSource, /\.story-comment-gif-toggle \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(serverSource, /function publicStoryCommentGif/);
  assert.match(serverSource, /const jsonSaveStates = new Map\(\)/);
  assert.match(serverSource, /const kind = body\.kind === 'gif' \? 'gif' : 'text'/);
  assert.match(serverSource, /gif\.status !== 'approved'/);
  assert.doesNotMatch(clientSource, /profile-network:\$\{esc\(user\?/);
  assert.match(clientSource, /initialTool = null/);
  assert.match(clientSource, /activeTool: textEditing \? 'text' : initialTool/);
  assert.match(clientSource, /class="story-effects-panel"/);
  assert.match(clientSource, /let stableViewportHeight = 0/);
  assert.match(clientSource, /let stableViewportWidth = 0/);
  assert.match(clientSource, /const stableSizeChanged = Boolean/);
  assert.match(clientSource, /!mobileViewport && !keyboardOpen && layoutHeight !== stableViewportHeight/);
  assert.doesNotMatch(clientSource, /if \(forceStable \|\| !stableViewportHeight \|\| !keyboardOpen\) stableViewportHeight = layoutHeight/);
  assert.match(clientSource, /function scheduleViewportHeight/);
  assert.match(clientSource, /root\.classList\.toggle\('keyboard-open', keyboardOpen\)/);
  assert.match(clientSource, /class="story-video-timeline"/);
  assert.match(clientSource, /data-story-video-trim="start"/);
  assert.match(clientSource, /data-action="story-video-speed"/);
  assert.match(clientSource, /function updateRecommendationsSection/);
  assert.match(clientSource, /data-action="open-story-owner-menu"/);
  assert.match(clientSource, /class="story-upload-progress"/);
  assert.match(clientSource, /data-story-slider/);
  assert.match(clientSource, /class="story-gif-grid"/);
  assert.match(clientSource, /function renderAccountIdentity[\s\S]*?href="\$\{esc\(accountProfileHref\(user\)\)\}"/);
  assert.match(clientSource, /class="chat-pane searched-profile-pane"/);
  assert.match(clientSource, /function restoreNavigationView/);
  assert.match(clientSource, /function renderProfileSuggestions/);
  assert.match(clientSource, /function renderRecommendationCard/);
  assert.match(clientSource, /data-action="toggle-profile-recommendable"/);
  assert.match(styleSource, /\.recommend-card \{[\s\S]*?border: 1px solid/);
  assert.match(clientSource, /recentProfiles: JSON\.parse/);
  assert.match(clientSource, /data-action="view-profile-picture"/);
  assert.match(clientSource, /data-action="change-profile-picture"/);
  assert.match(clientSource, /data-action="toggle-avatar-viewable"/);
  assert.match(clientSource, /maxlength="8000"/);
  assert.match(clientSource, /function renderChatCustomization/);
  assert.match(clientSource, /function renderStickerCreator/);
  assert.match(clientSource, /function buildTextStickerSvg/);
  assert.match(clientSource, /function chatStickerPresets/);
  assert.match(clientSource, /data-action="send-gif"/);
  assert.match(clientSource, /gifId: payload\.gifId \|\| null/);
  assert.match(clientSource, /class="nav-profile-avatar"/);
  assert.match(clientSource, /data-profile-setting="mentionPermission"/);
  assert.match(clientSource, /story-pick-media/);
  assert.match(clientSource, /function continueAvatarCropDrag/);
  assert.match(clientSource, /crop\.offsetX = crop\.drag\.offsetX/);
  assert.doesNotMatch(clientSource, /crop\.x\s*=/);
  assert.doesNotMatch(clientSource, /storyMenuOpen/);
  assert.doesNotMatch(clientSource, />Activity</);
  assert.doesNotMatch(clientSource, /class="story-card"/);
  assert.match(styleSource, /\.story-editor-page \{[\s\S]*?top: var\(--visual-top\)/);
  assert.match(styleSource, /html\.keyboard-open \.bottom-tabs/);
  assert.match(styleSource, /\.story-video-filmstrip/);
  assert.match(styleSource, /\.story-floating-tray \{[\s\S]*?position: absolute/);
  assert.match(styleSource, /\.profile-avatar-add/);
  assert.match(styleSource, /\.story-upload-progress/);
  assert.match(styleSource, /\.story-gif-media/);
  assert.match(styleSource, /\.social-user-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styleSource, /\.page-header\.search-profile-header \{[\s\S]*?grid-template-columns: 40px minmax\(0, 1fr\) 40px/);
  assert.match(styleSource, /\.crop-circle \{[\s\S]*?left: 50%;[\s\S]*?width: 76%/);
  assert.match(styleSource, /\.crop-photo-position/);
  assert.match(styleSource, /\.profile-photo-editor/);
  assert.match(styleSource, /\.privacy-choice-row/);
  assert.match(styleSource, /\.profile-suggestion-section/);
  assert.match(styleSource, /\.bottom-tab\[data-tab="chats"\]\.active svg path:first-child/);
  assert.match(styleSource, /\.chat-customization-sheet/);
  assert.match(styleSource, /\.sticker-creator-page/);
  assert.match(styleSource, /\.chat-gif-grid/);
  assert.match(clientSource, /function renderGroupComposer/);
  assert.match(clientSource, /function renderGroupProfilePane/);
  assert.match(clientSource, /class="group-message-sender"/);
  assert.match(clientSource, /data-action="toggle-group-invites"/);
  assert.match(styleSource, /\.group-composer-overlay/);
  assert.match(clientSource, /function captureNavigationEntry/);
  assert.match(clientSource, /previewHtml: liveShell \? '' : currentAppShell\(\)\?\.outerHTML \|\| ''/);
  assert.match(clientSource, /function animateNavigationBack/);
  assert.match(clientSource, /liveShell,/);
  assert.match(clientSource, /function stashNavigationPreview/);
  assert.match(clientSource, /state\.edgeSwipe\.preview = installNavigationPreview\(state\.edgeSwipe\.entry, 'swipe'\)/);
  assert.match(clientSource, /isMobileLayout\(\) && backEntry/);
  assert.match(styleSource, /\.route-page-preview/);
  assert.match(styleSource, /\.route-page-preview::after/);
  assert.doesNotMatch(styleSource, /will-change: transform, filter/);
  assert.match(styleSource, /overscroll-behavior: none/);
  assert.match(clientSource, /history\.scrollRestoration = 'manual'/);
  assert.match(styleSource, /\.camera-capture-page/);
  assert.match(styleSource, /cameraCaptureIn/);
  assert.match(styleSource, /\.messages\.chat-settling/);
  assert.match(styleSource, /socialUnderlineToRight/);
  assert.match(clientSource, /function submitChatGif/);
  assert.doesNotMatch(clientSource, /sendFile\(file, 'gif'\)/);
  assert.match(clientSource, /function syncGroupComposerSelection/);
  assert.match(clientSource, /class="navigation-edge-zone"/);
  assert.match(styleSource, /\.group-composer-create/);

  const sidebarSource = sourceSection(clientSource, 'function renderSidebar()', 'function renderTabContent');
  for (const [tab, label] of [['home', 'Home'], ['search', 'Search'], ['chats', 'Messages'], ['profile', 'Profile']]) {
    assert.match(sidebarSource, new RegExp(`navButton\\('${tab}', '${label}'`));
  }
  assert.match(sidebarSource, /class="bottom-tab bottom-tab-create"[^>]*data-action="open-post-create"[^>]*aria-label="Create post"/);
  assert.doesNotMatch(sidebarSource, /navButton\('create'/);
  assert.match(styleSource, /--social-icon-blue: #2f7895;/);
  assert.match(styleSource, /\.bottom-tab-create \{[\s\S]*?border-radius: 8px;[\s\S]*?var\(--social-icon-blue\)/);
  assert.match(styleSource, /@media \(min-width: 861px\) \{[\s\S]*?\.app-shell\.home-root \{[\s\S]*?grid-template-columns: 360px minmax\(0, 1fr\);[\s\S]*?\.app-shell\.home-root > \.sidebar > \.bottom-tabs \{[\s\S]*?width: 360px;/);
  const swipeTabSource = sourceSection(clientSource, 'function tabSwipeTarget', 'function ensureTabSwipePreview');
  for (const tab of ['home', 'search', 'chats', 'profile']) assert.match(swipeTabSource, new RegExp(`['"]${tab}['"]`));
  assert.doesNotMatch(swipeTabSource, /create|notifications/);

  const homeStorySource = sourceSection(clientSource, 'function homeStoryUsers', 'function postAuthor');
  assert.match(homeStorySource, /state\.me\?\.following/);
  assert.match(homeStorySource, /followed\.length \? followed : fallback/);
  assert.match(homeStorySource, /aria-label="Stories"/);
  assert.match(homeStorySource, /story \? 'view-story' : 'open-story-create'/);
  const homePanelSource = sourceSection(clientSource, 'function renderHomePanel', 'function composerFilterStyle');
  assert.match(homePanelSource, /data-action="toggle-feed-menu"/);
  for (const mode of ['for_you', 'following', 'favorites']) assert.match(homePanelSource, new RegExp(`['"]${mode}['"]`));
  assert.match(homePanelSource, /renderHomeStories\(\)/);
  assert.match(homePanelSource, /data-action="open-post-create"/);
  assert.match(homePanelSource, /data-action="open-notifications"/);
  assert.match(homePanelSource, /feed\.map\(renderPostCard\)/);
  const postCardSource = sourceSection(clientSource, 'function renderPostComments', 'function renderHomePanel');
  assert.match(postCardSource, /const topComment = comments\.at\(-1\)/);
  assert.match(postCardSource, /class="post-comment-preview" data-action="open-post-comments"/);
  assert.match(postCardSource, /class="post-counts"/);
  assert.doesNotMatch(postCardSource, /focus-post-comment|toggle-post-comments|class="post-comment-form"/);
  assert.match(clientSource, /function renderPostCommentsSheet/);
  assert.match(clientSource, /story-comments-sheet post-comments-sheet/);
  const postActionSource = sourceSection(clientSource, 'async function togglePostAction', 'async function deletePost');
  assert.match(postActionSource, /syncPostEngagement\(data\.post, action\)/);
  assert.match(postActionSource, /syncPostEngagement\(data\.post\)/);
  assert.doesNotMatch(postActionSource, /updateSidebar\(\)/);
  assert.match(clientSource, /renderMentionText\(comment\.text \|\| ''\)/);
  assert.match(clientSource, /renderMentionText\(description\)/);
  assert.doesNotMatch(clientSource, /renderMentions\(/);

  const profilePanelSource = sourceSection(clientSource, 'function renderProfilePanel', 'function profilePostKey');
  assert.ok(profilePanelSource.indexOf('renderHighlights(state.me, true)') < profilePanelSource.indexOf('renderRecommendations()'));
  assert.ok(profilePanelSource.indexOf('renderRecommendations()') < profilePanelSource.indexOf('renderProfileMedia(state.me, true)'));
  const searchProfileSource = sourceSection(clientSource, 'function renderSearchProfilePage', 'function renderSearchProfileSocialPage');
  assert.ok(searchProfileSource.indexOf('renderHighlights(user, false)') < searchProfileSource.indexOf('renderProfileSuggestions(user)'));
  assert.ok(searchProfileSource.indexOf('renderProfileSuggestions(user)') < searchProfileSource.indexOf('renderProfileMedia(user, false)'));
  assert.match(clientSource, /function updateProfileMediaSection/);
  assert.match(clientSource, /const scrollTop = scrollHost\?\.scrollTop \?\? 0;/);
  assert.match(clientSource, /if \(scrollHost\) scrollHost\.scrollTop = scrollTop;/);
  assert.match(clientSource, /loadProfilePosts\(user, tab, \{ render: false \}\)/);
  assert.match(styleSource, /\.profile-media-section \{[\s\S]*?min-height: calc\(var\(--visual-height\) - 64px\);/);
  assert.doesNotMatch(sidebarSource, /searchProfileMediaTab|profileMediaTab/);

  const postComposerSource = sourceSection(clientSource, 'function renderPostComposerMedia(', 'function renderNoteRail');
  assert.match(postComposerSource, /const stage = clamp\(Number\(composer\.stage \|\| 1\), 1, 3\)/);
  assert.match(postComposerSource, /Step \$\{stage\} of 3/);
  assert.match(postComposerSource, /stage === 1 \? 'Crop' : stage === 2 \? 'Look' : 'Share'/);
  for (const control of ['zoom', 'x', 'y']) assert.match(postComposerSource, new RegExp(`data-post-crop="${control}"`));
  assert.match(postComposerSource, /data-action="rotate-post-media"/);
  for (const filter of ['normal', 'vivid', 'warm', 'cool', 'mono', 'fade', 'noir']) assert.match(postComposerSource, new RegExp(`['"]${filter}['"]`));
  for (const adjustment of ['brightness', 'contrast', 'saturation', 'warmth']) assert.match(postComposerSource, new RegExp(`['"]${adjustment}['"]`));
  assert.match(postComposerSource, /renderPostComposerMedia\(composer, true\)/);
  assert.match(postComposerSource, /data-action="pick-post-tag-position"/);
  assert.match(postComposerSource, /data-action="add-post-person-tag"/);
  assert.match(postComposerSource, /id="post-title"[^>]*maxlength="100"/);
  assert.match(postComposerSource, /id="post-description"[^>]*maxlength="2200"/);
  assert.match(postComposerSource, /id="post-hashtags"[^>]*maxlength="300"/);
  assert.match(postComposerSource, /id="post-allow-reposts"/);
  assert.match(clientSource, /pendingTagPoint = \{[\s\S]{0,300}?x: Math\.round\([\s\S]{0,300}?y: Math\.round\(/);
  assert.match(postComposerSource, /<video src="\$\{esc\(composer\.previewUrl\)\}"[\s\S]{0,180}?playsinline controls preload="metadata"/);
  const filterRailSource = sourceSection(postComposerSource, 'class="post-filter-rail"', 'class="post-adjust-tabs"');
  assert.doesNotMatch(filterRailSource, /<video/);
  assert.match(filterRailSource, /data-video-poster/);

  const postUploadSource = sourceSection(clientSource, 'const POST_IMAGE_MAX_BYTES', 'async function togglePostAction');
  assert.match(postUploadSource, /URL\.createObjectURL\(file\)/);
  assert.match(postUploadSource, /file,[\s\S]{0,100}?previewUrl/);
  assert.match(postUploadSource, /fetch\('\/api\/post-media'/);
  assert.match(postUploadSource, /'X-File-Name'/);
  assert.match(postUploadSource, /'X-File-Last-Modified'/);
  assert.match(postUploadSource, /body: file/);
  assert.match(postUploadSource, /fileId: pendingFileId/);
  assert.match(postUploadSource, /URL\.revokeObjectURL\(url\)/);
  assert.match(postUploadSource, /releasePostComposerMedia\(composer\)/);
  assert.match(postUploadSource, /function postMediaType\(file\)/);
  assert.match(postUploadSource, /mov: 'video\/quicktime'/);
  assert.match(postUploadSource, /sizeError: file\.size > maximum/);
  assert.doesNotMatch(postUploadSource, /fileToDataUrl\(file\)|dataUrl: composer/);
  assert.match(clientSource, /window\.addEventListener\('pagehide',[\s\S]{0,120}?closePostComposer\(\)/);

  const renderAppSource = sourceSection(clientSource, 'function renderApp(options = {})', 'function updateSlot');
  assert.match(clientSource, /const postMediaInput = document\.createElement\('input'\)[\s\S]{0,300}?document\.body\.appendChild\(postMediaInput\)/);
  assert.match(clientSource, /function openPostMediaPicker\(\)[\s\S]{0,120}?postMediaInput\.value = ''[\s\S]{0,120}?postMediaInput\.click\(\)/);
  assert.doesNotMatch(renderAppSource, /id="post-input"/);
  assert.match(serverSource, /MAX_POST_VIDEO_BYTES[\s\S]{0,120}?128 \* 1024 \* 1024/);
  assert.match(serverSource, /'video\/quicktime': '\.mov'/);

  const ownProfileSource = sourceSection(clientSource, 'function renderProfilePanel()', 'function profilePostKey');
  assert.match(ownProfileSource, /<h1>\$\{esc\(state\.me\.displayName\)\}<\/h1>/);
  assert.match(ownProfileSource, /<small>@\$\{esc\(state\.me\.username\)\}<\/small>/);
  assert.match(ownProfileSource, /renderProfileStats\(state\.me, 'open-social'\)/);
  assert.match(ownProfileSource, /data-action="open-profile-edit"/);
  assert.match(ownProfileSource, /data-action="open-highlight-archive"/);
  const profileMediaSource = sourceSection(clientSource, 'function renderProfileMedia(', 'function renderProfileSocialPage');
  for (const [tab, label] of [['posts', 'Photos and videos'], ['saved', 'Saved posts'], ['reposts', 'Reposts'], ['tagged', 'Tagged photos']]) {
    assert.match(profileMediaSource, new RegExp(`['"]${tab}['"], ['"]${label}['"]`));
  }
  assert.match(profileMediaSource, /!own && tab === 'saved'/);
  assert.match(profileMediaSource, /Saved posts are private/);
  const profileEditSource = sourceSection(clientSource, 'function renderProfileEditModal()', 'function settingsSectionTitle');
  assert.match(profileEditSource, /name="username"[^>]*readonly[^>]*aria-readonly="true"/);
  assert.match(profileEditSource, /cannot be changed/);
  assert.match(profileEditSource, /once every 14 days/);
  assert.match(serverSource, /body\.username !== undefined[\s\S]{0,180}?permanent and cannot be changed/);
  assert.match(serverSource, /DISPLAY_NAME_COOLDOWN_MS[\s\S]{0,500}?once every 14 days/);

  const noteUiSource = sourceSection(clientSource, 'function renderNoteRail()', 'function renderChatsPanel');
  assert.match(noteUiSource, /data-action="play-note"/);
  assert.match(noteUiSource, /<audio[^>]*preload="none"/);
  assert.doesNotMatch(noteUiSource, /autoplay/);
  assert.match(noteUiSource, /id="note-text" maxlength="60"/);
  assert.match(noteUiSource, /up to 30 seconds/);
  const noteBehaviorSource = sourceSection(clientSource, 'function openNoteComposer()', 'async function loadContactsAndChats');
  assert.match(noteBehaviorSource, /duration > 30\.15/);
  assert.match(noteBehaviorSource, /setTimeout\(\(\) => stopNoteRecording\(\), 30000\)/);
  assert.match(noteBehaviorSource, /function playNote\(noteId\)/);
  assert.match(noteBehaviorSource, /if \(selected\.paused\) selected\.play\(\)/);
  assert.match(serverSource, /Array\.from\(textValue\)\.length > 60/);
  assert.match(serverSource, /audioDuration > 30/);

  const settingsSource = sourceSection(clientSource, 'function settingsSectionTitle', 'function renderAvatarCropper');
  for (const [section, label] of [['account', 'Account'], ['blocked', 'Blocked'], ['comments', 'Comments'], ['reposts', 'Reposts']]) {
    assert.match(settingsSource, new RegExp(`data-section="${section}"[\\s\\S]{0,120}?<strong>${label}<\\/strong>`));
  }
  assert.match(settingsSource, /data-form="account-contact"/);
  assert.match(settingsSource, /data-form="change-password"/);
  assert.match(settingsSource, /data-action="settings-unblock-user"/);
  assert.match(settingsSource, /state\.accountActivity\.comments/);
  assert.match(settingsSource, /state\.accountActivity\.reposts/);
  assert.match(settingsSource, /data-action="toggle-global-reposts"/);

  assert.match(clientSource, /event\.target\.id === 'post-input'[\s\S]{0,180}?event\.target\.value = ''[\s\S]{0,300}?beginPostComposer\(file\)/);
  assert.match(clientSource, /event\.target\.id === 'note-audio-input'[\s\S]{0,140}?event\.target\.value = ''[\s\S]{0,140}?chooseNoteAudio\(file\)/);
  assert.match(clientSource, /event\.key === 'Escape' && state\.postComposer[\s\S]{0,140}?closePostComposer\(\)/);
  assert.match(clientSource, /event\.key === 'Escape' && state\.noteComposer[\s\S]{0,220}?stopNoteRecording\(\)[\s\S]{0,220}?state\.noteComposer = null/);
  assert.match(clientSource, /const gestureBlocked =[\s\S]{0,400}?state\.postComposer \|\| state\.noteComposer \|\| state\.noteRecording/);

  const notificationsSource = sourceSection(clientSource, 'function renderNotificationsPage()', 'function renderNotificationPermissionPrompt');
  assert.match(notificationsSource, /Suggested for you/);
  assert.match(notificationsSource, /visibleRecommendations\(\)\.slice\(0, 12\)/);
  assert.match(notificationsSource, /renderAccountRow\(user, \{ dismissible: true \}\)/);
});

test('social posts, feeds, profile privacy, account settings, and notes remain repeatable', async (t) => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-app-social-test-'));
  const dataDir = path.join(runtime, 'data');
  const uploadDir = path.join(runtime, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  const port = 36500 + Math.floor(Math.random() * 1500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      UPLOAD_DIR: uploadDir,
      SENDMAIL_PATH: path.join(runtime, 'missing-sendmail')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverError = '';
  child.stderr.on('data', (chunk) => { serverError += chunk.toString('utf8'); });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
    fs.rmSync(runtime, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);
  assert.equal(serverError, '');

  const alice = new ApiClient(baseUrl);
  const bob = new ApiClient(baseUrl);
  const charlie = new ApiClient(baseUrl);
  const dora = new ApiClient(baseUrl);
  const aliceUser = await register(alice, 'social_alice');
  const bobUser = await register(bob, 'social_bob');
  const charlieUser = await register(charlie, 'social_charlie');
  const doraUser = await register(dora, 'social_dora');

  const immutableUsername = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { username: 'renamed_alice' }
  });
  assert.equal(immutableUsername.status, 400);
  assert.match(immutableUsername.data.error, /permanent/i);

  const profileUpdate = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: {
      username: aliceUser.username,
      displayName: 'Alice Social',
      bio: 'Photos from deterministic tests',
      website: 'example.test/profile',
      age: 29,
      gender: 'Non-binary',
      bioVisible: true,
      websiteVisible: true,
      ageVisible: true,
      genderVisible: true
    }
  });
  assert.equal(profileUpdate.status, 200);
  assert.equal(profileUpdate.data.user.username, aliceUser.username);
  assert.equal(profileUpdate.data.user.tagUsername, aliceUser.username);
  assert.equal(profileUpdate.data.user.displayName, 'Alice Social');
  assert.equal(profileUpdate.data.user.website, 'https://example.test/profile');
  assert.ok(profileUpdate.data.user.nextDisplayNameChangeAt);

  const publicIdentity = await bob.request('/api/users/social_alice');
  assert.equal(publicIdentity.status, 200);
  assert.equal(publicIdentity.data.user.displayName, 'Alice Social');
  assert.equal(publicIdentity.data.user.tagUsername, aliceUser.username);
  assert.equal(publicIdentity.data.user.age, 29);
  assert.equal(publicIdentity.data.user.gender, 'Non-binary');
  assert.equal(publicIdentity.data.user.website, 'https://example.test/profile');

  const displayNameCooldown = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { displayName: 'Alice Again' }
  });
  assert.equal(displayNameCooldown.status, 429);
  assert.match(displayNameCooldown.data.error, /14 days/i);
  assert.ok(displayNameCooldown.data.nextDisplayNameChangeAt);
  assert.equal((await alice.request('/api/me')).data.user.displayName, 'Alice Social');

  const hiddenOptionalFields = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { bioVisible: false, websiteVisible: false, ageVisible: false, genderVisible: false }
  });
  assert.equal(hiddenOptionalFields.status, 200);
  const hiddenPublicIdentity = (await bob.request('/api/users/social_alice')).data.user;
  assert.equal(hiddenPublicIdentity.bio, '');
  assert.equal(hiddenPublicIdentity.website, '');
  assert.equal(hiddenPublicIdentity.age, null);
  assert.equal(hiddenPublicIdentity.gender, '');

  const accountUpdate = await alice.request('/api/account', {
    method: 'PATCH',
    body: { email: 'social-alice@example.test', phone: '+49 30 1234567' }
  });
  assert.equal(accountUpdate.status, 200);
  assert.equal(accountUpdate.data.account.email, 'social-alice@example.test');
  assert.equal(accountUpdate.data.account.phone, '+49 30 1234567');
  assert.equal(accountUpdate.data.account.emailVerified, false);
  assert.equal(accountUpdate.data.account.phoneVerified, false);
  assert.equal(accountUpdate.data.verificationEmailSent, false);
  const accountSnapshot = await alice.request('/api/account');
  assert.equal(accountSnapshot.status, 200);
  assert.equal(accountSnapshot.data.account.email, 'social-alice@example.test');
  assert.equal(accountSnapshot.data.account.phone, '+49 30 1234567');
  assert.equal((await alice.request('/api/account/password', {
    method: 'PATCH',
    body: { currentPassword: 'incorrect-password', newPassword: 'ChangedPass456!' }
  })).status, 403);
  assert.equal((await alice.request('/api/account/password', {
    method: 'PATCH',
    body: { currentPassword: PASSWORD, newPassword: 'ChangedPass456!' }
  })).status, 200);

  const rawVideoBytes = Buffer.from('tiny deterministic mp4 payload');
  const rawVideoUpload = await dora.raw('/api/post-media', {
    headers: {
      'Content-Type': 'video/mp4',
      'X-File-Name': encodeURIComponent('raw-video.mp4'),
      'X-File-Last-Modified': '2026-07-16T00:00:00.000Z'
    },
    body: rawVideoBytes
  });
  assert.equal(rawVideoUpload.status, 201);
  assert.equal(rawVideoUpload.data.file.mime, 'video/mp4');
  assert.equal(rawVideoUpload.data.file.size, rawVideoBytes.length);
  assert.equal(rawVideoUpload.data.file.name, 'raw-video.mp4');
  assert.equal((await bob.request('/api/posts', {
    method: 'POST',
    body: { fileId: rawVideoUpload.data.fileId, title: 'Foreign pending file' }
  })).status, 404);
  const rawVideoPost = await dora.request('/api/posts', {
    method: 'POST',
    body: {
      fileId: rawVideoUpload.data.fileId,
      title: 'Streamed video',
      description: 'Published without base64 JSON.'
    }
  });
  assert.equal(rawVideoPost.status, 201);
  assert.equal(rawVideoPost.data.post.media.mime, 'video/mp4');
  const streamedVideo = await dora.request(rawVideoPost.data.post.media.url);
  assert.equal(streamedVideo.status, 200);
  assert.deepEqual(streamedVideo.data, rawVideoBytes);
  const videoRange = await dora.request(rawVideoPost.data.post.media.url, {
    headers: { Range: 'bytes=5-12' }
  });
  assert.equal(videoRange.status, 206);
  assert.deepEqual(videoRange.data, rawVideoBytes.subarray(5, 13));
  assert.equal(videoRange.headers.get('accept-ranges'), 'bytes');
  assert.equal(videoRange.headers.get('content-range'), `bytes 5-12/${rawVideoBytes.length}`);
  const invalidVideoRange = await dora.request(rawVideoPost.data.post.media.url, {
    headers: { Range: `bytes=${rawVideoBytes.length}-` }
  });
  assert.equal(invalidVideoRange.status, 416);
  assert.equal(invalidVideoRange.headers.get('content-range'), `bytes */${rawVideoBytes.length}`);
  assert.equal((await dora.request('/api/posts', {
    method: 'POST',
    body: { fileId: rawVideoUpload.data.fileId, title: 'Cannot reuse upload' }
  })).status, 404);
  const invalidRawUpload = await dora.raw('/api/post-media', {
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('not media')
  });
  assert.equal(invalidRawUpload.status, 400);
  const abandonedUpload = await dora.raw('/api/post-media', {
    headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('abandoned.png') },
    body: Buffer.from('small pending image')
  });
  assert.equal(abandonedUpload.status, 201);
  assert.equal((await dora.request(`/api/post-media/${abandonedUpload.data.fileId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await dora.request('/api/posts', {
    method: 'POST',
    body: { fileId: abandonedUpload.data.fileId, title: 'Deleted pending file' }
  })).status, 404);

  const createdPost = await alice.request('/api/posts', {
    method: 'POST',
    body: {
      file: { name: 'social-post.png', type: 'image/png', dataUrl: PNG_DATA },
      title: 'Summer launch',
      description: 'A repeatable post with @social_bob and #Launch.',
      hashtags: ['Summer', '#Launch', 'summer'],
      personTags: [{ userId: bobUser.id, x: 23.5, y: 78.25 }],
      edits: {
        crop: { x: 12, y: -9, width: 84, height: 91, zoom: 1.7, rotation: 90, aspectRatio: 'portrait', flipX: true },
        adjustments: { brightness: 114, contrast: 93, saturation: 142, warmth: 18, fade: 7, vignette: 21 },
        filter: 'vivid'
      },
      allowReposts: true
    }
  });
  assert.equal(createdPost.status, 201);
  const post = createdPost.data.post;
  assert.equal(post.title, 'Summer launch');
  assert.equal(post.description, 'A repeatable post with @social_bob and #Launch.');
  assert.deepEqual(post.hashtags, ['summer', 'launch']);
  assert.equal(post.personTags.length, 1);
  assert.equal(post.personTags[0].user.id, bobUser.id);
  assert.equal(post.personTags[0].x, 23.5);
  assert.equal(post.personTags[0].y, 78.25);
  assert.equal(post.crop.aspectRatio, 'portrait');
  assert.equal(post.crop.zoom, 1.7);
  assert.equal(post.adjustments.saturation, 142);
  assert.equal(post.filter, 'vivid');
  assert.equal(post.allowReposts, true);
  assert.equal(createdPost.data.user.postCount, 1);
  assert.equal((await alice.request('/api/me')).data.user.postCount, 1);
  assert.deepEqual((await alice.request(`/api/users/${aliceUser.id}/posts?tab=posts`)).data.posts.map((item) => item.id), [post.id]);
  assert.deepEqual((await bob.request(`/api/users/${bobUser.id}/posts?tab=tagged`)).data.posts.map((item) => item.id), [post.id]);
  assert.equal((await bob.request(post.media.url)).status, 200);

  const liked = await bob.request(`/api/posts/${post.id}/like`, { method: 'POST' });
  assert.equal(liked.status, 200);
  assert.equal(liked.data.post.likedByMe, true);
  assert.equal(liked.data.post.likeCount, 1);
  const unliked = await bob.request(`/api/posts/${post.id}/like`, { method: 'POST' });
  assert.equal(unliked.status, 200);
  assert.equal(unliked.data.post.likedByMe, false);
  assert.equal(unliked.data.post.likeCount, 0);

  const saved = await bob.request(`/api/posts/${post.id}/save`, { method: 'POST' });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.post.savedByMe, true);
  const ownSavedTab = await bob.request(`/api/users/${bobUser.id}/posts?tab=saved`);
  assert.equal(ownSavedTab.status, 200);
  assert.equal(ownSavedTab.data.private, false);
  assert.deepEqual(ownSavedTab.data.posts.map((item) => item.id), [post.id]);
  const someoneElsesSavedTab = await alice.request(`/api/users/${bobUser.id}/posts?tab=saved`);
  assert.equal(someoneElsesSavedTab.status, 200);
  assert.equal(someoneElsesSavedTab.data.private, true);
  assert.deepEqual(someoneElsesSavedTab.data.posts, []);
  const unsaved = await bob.request(`/api/posts/${post.id}/save`, { method: 'POST' });
  assert.equal(unsaved.data.post.savedByMe, false);
  assert.deepEqual((await bob.request(`/api/users/${bobUser.id}/posts?tab=saved`)).data.posts, []);

  const reposted = await bob.request(`/api/posts/${post.id}/repost`, { method: 'POST' });
  assert.equal(reposted.status, 200);
  assert.equal(reposted.data.post.repostedByMe, true);
  assert.equal(reposted.data.post.repostCount, 1);
  assert.deepEqual((await bob.request(`/api/users/${bobUser.id}/posts?tab=reposts`)).data.posts.map((item) => item.id), [post.id]);
  assert.deepEqual((await bob.request('/api/me/activity?type=reposts')).data.items.map((item) => item.post.id), [post.id]);
  const unreposted = await bob.request(`/api/posts/${post.id}/repost`, { method: 'POST' });
  assert.equal(unreposted.status, 200);
  assert.equal(unreposted.data.post.repostedByMe, false);
  assert.equal(unreposted.data.post.repostCount, 0);
  assert.deepEqual((await bob.request('/api/me/activity?type=reposts')).data.items, []);
  assert.equal((await alice.request('/api/me/profile', { method: 'PATCH', body: { allowReposts: false } })).status, 200);
  const globallyDisabledRepost = await bob.request(`/api/posts/${post.id}/repost`, { method: 'POST' });
  assert.equal(globallyDisabledRepost.status, 403);
  assert.match(globallyDisabledRepost.data.error, /turned off reposts/i);
  assert.equal((await alice.request('/api/me/profile', { method: 'PATCH', body: { allowReposts: true } })).status, 200);

  const comment = await bob.request(`/api/posts/${post.id}/comments`, {
    method: 'POST',
    body: { text: 'A stable comment for @social_alice.' }
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.post.commentCount, 1);
  assert.equal(comment.data.comment.user.id, bobUser.id);
  assert.equal(comment.data.comment.text, 'A stable comment for @social_alice.');
  const commentActivity = await bob.request('/api/me/activity?type=comments');
  assert.equal(commentActivity.status, 200);
  assert.deepEqual(commentActivity.data.items.map((item) => item.comment.id), [comment.data.comment.id]);
  assert.ok((await alice.request('/api/notifications')).data.notifications.some((note) => note.type === 'post_tag' || note.type === 'mention' || note.type === 'post_comment'));

  assert.equal((await bob.request(`/api/follows/${aliceUser.id}`, { method: 'POST' })).status, 200);
  assert.equal((await bob.request(`/api/favorites/${aliceUser.id}`, { method: 'POST' })).status, 200);
  const forYouFeed = await bob.request('/api/feed?mode=for_you');
  const followingFeed = await bob.request('/api/feed?mode=following');
  const favoritesFeed = await bob.request('/api/feed?mode=favorites');
  const explore = await bob.request('/api/explore');
  assert.equal(forYouFeed.data.mode, 'for_you');
  assert.ok(forYouFeed.data.posts.some((item) => item.id === post.id));
  assert.ok(followingFeed.data.posts.some((item) => item.id === post.id));
  assert.deepEqual(favoritesFeed.data.posts.map((item) => item.id), [post.id]);
  assert.ok(explore.data.posts.some((item) => item.id === post.id));
  assert.equal((await bob.request('/api/feed?mode=unknown')).data.mode, 'for_you');

  assert.equal((await charlie.request('/api/me/profile', {
    method: 'PATCH',
    body: { socialPublic: false }
  })).status, 200);
  const privatePostResponse = await charlie.request('/api/posts', {
    method: 'POST',
    body: {
      file: { name: 'private.png', type: 'image/png', dataUrl: PNG_DATA },
      title: 'Followers only',
      description: 'Private post'
    }
  });
  assert.equal(privatePostResponse.status, 201);
  const privatePost = privatePostResponse.data.post;
  const privateNonFollowerTab = await alice.request(`/api/users/${charlieUser.id}/posts?tab=posts`);
  assert.equal(privateNonFollowerTab.status, 200);
  assert.equal(privateNonFollowerTab.data.private, true);
  assert.deepEqual(privateNonFollowerTab.data.posts, []);
  assert.equal((await alice.request(`/api/posts/${privatePost.id}`)).status, 404);
  assert.ok(!(await alice.request('/api/explore')).data.posts.some((item) => item.id === privatePost.id));

  const privateFollowRequest = await bob.request('/api/contacts/social_charlie', { method: 'POST' });
  assert.equal(privateFollowRequest.status, 201);
  assert.equal((await charlie.request(`/api/requests/${privateFollowRequest.data.request.id}/accept`, { method: 'POST' })).status, 200);
  const approvedFollowerTab = await bob.request(`/api/users/${charlieUser.id}/posts?tab=posts`);
  assert.equal(approvedFollowerTab.status, 200);
  assert.equal(approvedFollowerTab.data.private, false);
  assert.deepEqual(approvedFollowerTab.data.posts.map((item) => item.id), [privatePost.id]);
  assert.equal((await bob.request(`/api/posts/${privatePost.id}`)).status, 200);
  assert.ok((await bob.request('/api/feed?mode=following')).data.posts.some((item) => item.id === privatePost.id));

  const tooLongNote = await alice.request('/api/me/note', {
    method: 'POST',
    body: { text: 'x'.repeat(61) }
  });
  assert.equal(tooLongNote.status, 400);
  assert.match(tooLongNote.data.error, /60 characters/i);
  const tooLongAudio = await alice.request('/api/me/note', {
    method: 'POST',
    body: {
      text: 'Audio is too long',
      audio: { name: 'long.wav', type: 'audio/wav', dataUrl: AUDIO_DATA },
      audioDuration: 30.01
    }
  });
  assert.equal(tooLongAudio.status, 400);
  assert.match(tooLongAudio.data.error, /30 seconds/i);
  const firstNote = await alice.request('/api/me/note', {
    method: 'POST',
    body: {
      text: 'n'.repeat(60),
      audio: { name: 'thirty.wav', type: 'audio/wav', dataUrl: AUDIO_DATA },
      audioTitle: 'Thirty seconds',
      audioArtist: 'Test Artist',
      audioDuration: 30,
      audioStart: 12
    }
  });
  assert.equal(firstNote.status, 201);
  assert.equal(Array.from(firstNote.data.note.text).length, 60);
  assert.equal(firstNote.data.note.audioDuration, 30);
  assert.equal(firstNote.data.note.audioStart, 12);
  assert.equal(firstNote.data.note.audioTitle, 'Thirty seconds');
  assert.equal(firstNote.data.note.audioArtist, 'Test Artist');
  assert.ok(firstNote.data.note.audio?.url);
  const followedNotes = await bob.request('/api/notes');
  assert.ok(followedNotes.data.notes.some((note) => note.id === firstNote.data.note.id));
  assert.equal((await bob.request(firstNote.data.note.audio.url)).status, 200);

  const replacementNote = await alice.request('/api/me/note', {
    method: 'POST',
    body: { text: 'Replacement note' }
  });
  assert.equal(replacementNote.status, 201);
  assert.notEqual(replacementNote.data.note.id, firstNote.data.note.id);
  const afterReplacement = await bob.request('/api/notes');
  assert.ok(afterReplacement.data.notes.some((note) => note.id === replacementNote.data.note.id));
  assert.ok(!afterReplacement.data.notes.some((note) => note.id === firstNote.data.note.id));
  assert.equal((await alice.request('/api/me/note', { method: 'DELETE' })).status, 200);
  assert.ok(!(await bob.request('/api/notes')).data.notes.some((note) => note.ownerId === aliceUser.id));

  const doraPostResponse = await dora.request('/api/posts', {
    method: 'POST',
    body: { file: { name: 'blocked.png', type: 'image/png', dataUrl: PNG_DATA }, title: 'Block me' }
  });
  assert.equal(doraPostResponse.status, 201);
  const doraPost = doraPostResponse.data.post;
  const doraNote = await dora.request('/api/me/note', { method: 'POST', body: { text: 'Blocked note' } });
  assert.equal(doraNote.status, 201);
  assert.equal((await bob.request(`/api/follows/${doraUser.id}`, { method: 'POST' })).status, 200);
  assert.equal((await bob.request(`/api/favorites/${doraUser.id}`, { method: 'POST' })).status, 200);
  assert.ok((await bob.request('/api/notes')).data.notes.some((note) => note.id === doraNote.data.note.id));
  assert.ok((await bob.request('/api/feed?mode=following')).data.posts.some((item) => item.id === doraPost.id));
  assert.equal((await bob.request(`/api/blocks/${doraUser.id}`, { method: 'POST' })).status, 200);
  const blockedAccounts = await bob.request('/api/account/blocked');
  assert.equal(blockedAccounts.status, 200);
  assert.deepEqual(blockedAccounts.data.users.map((user) => user.id), [doraUser.id]);
  assert.ok(!(await bob.request('/api/users/search?q=social_dora')).data.users.some((user) => user.id === doraUser.id));
  assert.ok(!(await bob.request('/api/users/recommendations')).data.users.some((user) => user.id === doraUser.id));
  assert.ok(!(await bob.request('/api/feed?mode=for_you')).data.posts.some((item) => item.id === doraPost.id));
  assert.ok(!(await bob.request('/api/feed?mode=following')).data.posts.some((item) => item.id === doraPost.id));
  assert.ok(!(await bob.request('/api/feed?mode=favorites')).data.posts.some((item) => item.id === doraPost.id));
  assert.ok(!(await bob.request('/api/explore')).data.posts.some((item) => item.id === doraPost.id));
  assert.ok(!(await bob.request('/api/notes')).data.notes.some((note) => note.id === doraNote.data.note.id));
  assert.equal((await bob.request(`/api/posts/${doraPost.id}`)).status, 404);
  assert.ok(!(await bob.request('/api/me')).data.user.favoriteUserIds.includes(doraUser.id));

  const oldPasswordLogin = await new ApiClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { identifier: aliceUser.username, password: PASSWORD }
  });
  assert.equal(oldPasswordLogin.status, 401);
  const changedPasswordLogin = await new ApiClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { identifier: aliceUser.username, password: 'ChangedPass456!' }
  });
  assert.equal(changedPasswordLogin.status, 200);
  assert.equal(changedPasswordLogin.data.user.username, aliceUser.username);
  assert.equal(serverError, '');
});

test('account, social, messaging, media, story, privacy, and 2FA flows', async (t) => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-app-test-'));
  const dataDir = path.join(runtime, 'data');
  const uploadDir = path.join(runtime, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  const port = 33000 + Math.floor(Math.random() * 2000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      UPLOAD_DIR: uploadDir,
      SENDMAIL_PATH: path.join(runtime, 'missing-sendmail'),
      REPORT_EMAIL: 'test@example.invalid'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverError = '';
  child.stderr.on('data', (chunk) => {
    serverError += chunk.toString('utf8');
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
    fs.rmSync(runtime, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);
  assert.equal(serverError, '');

  const alice = new ApiClient(baseUrl);
  const bob = new ApiClient(baseUrl);
  const charlie = new ApiClient(baseUrl);
  const dora = new ApiClient(baseUrl);
  const anonymous = new ApiClient(baseUrl);

  const aliceUser = await register(alice, 'alice_test');
  const bobUser = await register(bob, 'bob_test');
  await Promise.all(Array.from({ length: 12 }, () => bob.request('/api/me')));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(serverError, '');
  const charlieUser = await register(charlie, 'charlie_test');
  const doraUser = await register(dora, 'dora_test');

  const moderatorState = await alice.request('/api/me');
  assert.equal(moderatorState.status, 200);
  assert.equal(moderatorState.data.isModerator, true);

  const gifSubmission = await bob.request('/api/gifs', {
    method: 'POST',
    body: {
      title: 'Tiny wave',
      tags: 'wave, hello',
      file: { name: 'wave.gif', type: 'image/gif', dataUrl: GIF_DATA }
    }
  });
  assert.equal(gifSubmission.status, 201);
  assert.equal(gifSubmission.data.pending, true);
  assert.equal(gifSubmission.data.gif.status, 'pending');
  assert.equal((await bob.request(gifSubmission.data.gif.file.url)).status, 200);
  assert.equal((await charlie.request('/api/gifs?status=pending')).status, 403);
  const pendingGifs = await alice.request('/api/gifs?status=pending');
  assert.ok(pendingGifs.data.gifs.some((gif) => gif.id === gifSubmission.data.gif.id));
  assert.ok(!(await charlie.request('/api/gifs')).data.gifs.some((gif) => gif.id === gifSubmission.data.gif.id));
  assert.equal((await alice.request(`/api/gifs/${gifSubmission.data.gif.id}/approve`, { method: 'POST' })).status, 200);
  const approvedGifs = await charlie.request('/api/gifs?q=wave');
  assert.ok(approvedGifs.data.gifs.some((gif) => gif.id === gifSubmission.data.gif.id));
  assert.equal((await charlie.request(gifSubmission.data.gif.file.url)).status, 200);

  const duplicate = await anonymous.request('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice_test', password: PASSWORD }
  });
  assert.equal(duplicate.status, 409);

  const wrongLogin = await anonymous.request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'alice_test', password: 'wrong-password' }
  });
  assert.equal(wrongLogin.status, 401);

  const avatarUpdate = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: {
      displayName: 'Alice',
      bio: 'Testing private stories',
      avatar: { name: 'avatar.png', type: 'image/png', dataUrl: PNG_DATA }
    }
  });
  assert.equal(avatarUpdate.status, 200);
  assert.ok(avatarUpdate.data.user.avatar.url);
  assert.equal((await anonymous.request(avatarUpdate.data.user.avatar.url)).status, 200);

  const profilePrivacy = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: {
      avatarViewable: false,
      mentionPermission: 'nobody',
      storyReplies: 'off',
      friendRequests: 'followers'
    }
  });
  assert.equal(profilePrivacy.status, 200);
  assert.equal(profilePrivacy.data.user.avatarViewable, false);
  assert.equal(profilePrivacy.data.user.mentionPermission, 'nobody');
  assert.equal(profilePrivacy.data.user.storyReplies, 'off');
  assert.equal(profilePrivacy.data.user.friendRequests, 'followers');
  const anonymousPrivacyView = await anonymous.request('/api/users/alice_test');
  assert.equal(anonymousPrivacyView.data.user.avatarViewable, false);
  assert.equal(anonymousPrivacyView.data.user.mentionPermission, undefined);
  assert.equal(anonymousPrivacyView.data.user.storyReplies, undefined);
  assert.equal((await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: {
      avatarViewable: true,
      mentionPermission: 'everyone',
      storyReplies: 'everyone',
      friendRequests: 'everyone'
    }
  })).status, 200);

  const shortUserSearch = await alice.request('/api/users/search?q=d');
  assert.equal(shortUserSearch.status, 200);
  assert.deepEqual(shortUserSearch.data.users, []);
  const exactUserSearch = await alice.request('/api/users/search?q=dora_test');
  assert.equal(exactUserSearch.status, 200);
  assert.equal(exactUserSearch.data.users[0].id, doraUser.id);

  const publicFollow = await alice.request(`/api/follows/${doraUser.id}`, { method: 'POST' });
  assert.equal(publicFollow.status, 200);
  assert.equal(publicFollow.data.user.isFollowing, true);
  assert.equal(publicFollow.data.user.isContact, false);
  const doraProfileAfterFollow = await dora.request('/api/me');
  const aliceFollowerRow = doraProfileAfterFollow.data.user.followers.find((user) => user.id === aliceUser.id);
  assert.equal(aliceFollowerRow.followsViewer, true);
  assert.equal(aliceFollowerRow.isFollowing, false);
  assert.equal((await alice.request(`/api/follows/${doraUser.id}`, { method: 'DELETE' })).status, 200);

  assert.equal((await dora.request('/api/me/profile', {
    method: 'PATCH',
    body: { friendRequests: 'off' }
  })).status, 200);
  assert.equal((await charlie.request('/api/contacts/dora_test', { method: 'POST' })).status, 403);
  assert.equal((await dora.request('/api/me/profile', {
    method: 'PATCH',
    body: { friendRequests: 'followers' }
  })).status, 200);
  assert.equal((await charlie.request('/api/contacts/dora_test', { method: 'POST' })).status, 403);
  assert.equal((await charlie.request(`/api/follows/${doraUser.id}`, { method: 'POST' })).status, 200);
  const followerOnlyRequest = await charlie.request('/api/contacts/dora_test', { method: 'POST' });
  assert.equal(followerOnlyRequest.status, 201);
  assert.equal((await dora.request(`/api/requests/${followerOnlyRequest.data.request.id}/decline`, { method: 'POST' })).status, 200);
  assert.equal((await dora.request('/api/me/profile', {
    method: 'PATCH',
    body: { friendRequests: 'everyone' }
  })).status, 200);

  const request = await alice.request('/api/contacts/bob_test', { method: 'POST' });
  assert.equal(request.status, 201);
  assert.equal(request.data.pending, true);

  const blockedBeforeAccept = await sendMessage(alice, bobUser.id, { kind: 'text', text: 'too early' });
  assert.equal(blockedBeforeAccept.status, 404);

  const bobNotifications = await bob.request('/api/notifications');
  assert.equal(bobNotifications.status, 200);
  assert.equal(bobNotifications.data.pendingRequestCount, 1);
  assert.equal(bobNotifications.data.requests[0].from.username, 'alice_test');

  const accepted = await bob.request(`/api/requests/${request.data.request.id}/accept`, { method: 'POST' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.pendingRequestCount, 0);
  const aliceNotifications = await alice.request('/api/notifications');
  assert.ok(aliceNotifications.data.notifications.some((notification) => (
    notification.type === 'request_accepted' && notification.actor.id === bobUser.id
  )));

  const connectedBob = await alice.request('/api/users/bob_test');
  assert.equal(connectedBob.data.user.isContact, true);
  assert.equal(connectedBob.data.user.isFollowing, true);
  assert.equal(connectedBob.data.user.followsViewer, true);

  const defaultAppearance = await alice.request(`/api/chats/${bobUser.id}/appearance`);
  assert.equal(defaultAppearance.status, 200);
  assert.equal(defaultAppearance.data.settings.theme, 'midnight');
  const customAppearance = await alice.request(`/api/chats/${bobUser.id}/appearance`, {
    method: 'PATCH',
    body: {
      theme: 'custom',
      background: 'dusk',
      backgroundColor: '#170d1c',
      mineColor: '#c24f82',
      theirsColor: '#28323d'
    }
  });
  assert.equal(customAppearance.status, 200);
  assert.equal(customAppearance.data.settings.mineColor, '#c24f82');
  assert.equal((await alice.request(`/api/chats/${bobUser.id}/appearance`)).data.settings.background, 'dusk');
  assert.equal((await bob.request(`/api/chats/${aliceUser.id}/appearance`)).data.settings.theme, 'midnight');
  const poolGifMessage = await sendMessage(alice, bobUser.id, { kind: 'gif', gifId: gifSubmission.data.gif.id });
  assert.equal(poolGifMessage.status, 201);
  assert.equal(poolGifMessage.data.message.kind, 'gif');
  assert.equal((await bob.request(poolGifMessage.data.message.attachment.url)).status, 200);

  const unfollowBob = await alice.request(`/api/follows/${bobUser.id}`, { method: 'DELETE' });
  assert.equal(unfollowBob.status, 200);
  assert.equal(unfollowBob.data.user.isContact, true);
  assert.equal(unfollowBob.data.user.isFollowing, false);
  assert.equal(unfollowBob.data.user.followsViewer, true);
  assert.ok((await alice.request('/api/contacts')).data.users.some((user) => user.id === bobUser.id));
  assert.ok(!unfollowBob.data.me.following.some((user) => user.id === bobUser.id));
  assert.ok(unfollowBob.data.me.followers.some((user) => user.id === bobUser.id));

  assert.equal((await alice.request(`/api/follows/${bobUser.id}`, { method: 'POST' })).status, 200);
  const removeAliceFollower = await bob.request(`/api/followers/${aliceUser.id}`, { method: 'DELETE' });
  assert.equal(removeAliceFollower.status, 200);
  assert.equal(removeAliceFollower.data.user.isContact, true);
  assert.equal(removeAliceFollower.data.user.isFollowing, true);
  assert.equal(removeAliceFollower.data.user.followsViewer, false);
  assert.ok(removeAliceFollower.data.me.following.some((user) => user.id === aliceUser.id));
  assert.ok(!removeAliceFollower.data.me.followers.some((user) => user.id === aliceUser.id));
  assert.equal((await alice.request(`/api/follows/${bobUser.id}`, { method: 'POST' })).status, 200);

  const charlieRequest = await charlie.request('/api/contacts/bob_test', { method: 'POST' });
  assert.equal(charlieRequest.status, 201);
  assert.equal((await bob.request(`/api/requests/${charlieRequest.data.request.id}/accept`, { method: 'POST' })).status, 200);

  const doraRequest = await dora.request('/api/contacts/bob_test', { method: 'POST' });
  assert.equal(doraRequest.status, 201);
  assert.equal((await bob.request(`/api/requests/${doraRequest.data.request.id}/decline`, { method: 'POST' })).status, 200);

  const recommendations = await alice.request('/api/users/recommendations');
  assert.equal(recommendations.status, 200);
  assert.ok(recommendations.data.users.some((user) => user.id === charlieUser.id));
  assert.equal((await charlie.request('/api/me/profile', {
    method: 'PATCH',
    body: { recommendable: false }
  })).status, 200);
  const recommendationsAfterOptOut = await alice.request('/api/users/recommendations');
  assert.ok(!recommendationsAfterOptOut.data.users.some((user) => user.id === charlieUser.id));
  assert.equal((await charlie.request('/api/me/profile', {
    method: 'PATCH',
    body: { recommendable: true }
  })).status, 200);

  const textMessage = await sendMessage(alice, bobUser.id, { kind: 'text', text: 'Unique phrase for search' });
  assert.equal(textMessage.status, 201);
  assert.equal(textMessage.data.message.kind, 'text');
  assert.ok(!Number.isNaN(Date.parse(textMessage.data.message.createdAt)));

  const longMessage = await sendMessage(alice, bobUser.id, { kind: 'text', text: 'x'.repeat(8000) });
  assert.equal(longMessage.status, 201);
  assert.equal(longMessage.data.message.text.length, 8000);

  const reply = await sendMessage(bob, aliceUser.id, {
    kind: 'text',
    text: 'Replying now',
    replyTo: textMessage.data.message.id
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.message.replyTo, textMessage.data.message.id);

  const recipientDelete = await bob.request(`/api/messages/${textMessage.data.message.id}`, { method: 'DELETE' });
  assert.equal(recipientDelete.status, 403);

  const imageMessage = await sendMessage(alice, bobUser.id, {
    kind: 'image',
    text: 'One pixel',
    file: { name: 'pixel.png', type: 'image/png', dataUrl: PNG_DATA, lastModified: new Date().toISOString() }
  });
  assert.equal(imageMessage.status, 201);
  assert.ok(imageMessage.data.message.attachment.metaUrl);

  const mediaCases = [
    { kind: 'document', file: { name: 'notes.txt', type: 'text/plain', dataUrl: TEXT_DATA } },
    { kind: 'voice', file: { name: 'voice.wav', type: 'audio/wav', dataUrl: AUDIO_DATA } },
    { kind: 'video', file: { name: 'clip.mp4', type: 'video/mp4', dataUrl: VIDEO_DATA } },
    { kind: 'sticker', file: { name: 'sticker.svg', type: 'image/svg+xml', dataUrl: SVG_DATA }, stickerId: 'local-sticker' }
  ];
  for (const mediaCase of mediaCases) {
    const response = await sendMessage(alice, bobUser.id, mediaCase);
    assert.equal(response.status, 201);
    assert.equal(response.data.message.kind, mediaCase.kind);
  }
  const unmoderatedGif = await sendMessage(alice, bobUser.id, {
    kind: 'gif',
    file: { name: 'reaction.gif', type: 'image/gif', dataUrl: GIF_DATA }
  });
  assert.equal(unmoderatedGif.status, 403);
  assert.match(unmoderatedGif.data.error, /approved/i);
  const disguisedGif = await sendMessage(alice, bobUser.id, {
    kind: 'image',
    file: { name: 'reaction.gif', type: 'image/gif', dataUrl: GIF_DATA }
  });
  assert.equal(disguisedGif.status, 403);
  assert.match(disguisedGif.data.error, /GIF pool/i);

  assert.equal((await bob.request(imageMessage.data.message.attachment.metaUrl)).status, 200);
  assert.equal((await bob.request(imageMessage.data.message.attachment.downloadUrl)).status, 200);

  const reaction = await bob.request(`/api/messages/${textMessage.data.message.id}/reaction`, {
    method: 'POST',
    body: { emoji: '\u2764\ufe0f' }
  });
  assert.equal(reaction.status, 200);
  assert.equal(reaction.data.message.reactions[0].count, 1);
  assert.ok(reaction.data.message.reactions[0].userIds.includes(bobUser.id));

  const pin = await alice.request(`/api/messages/${textMessage.data.message.id}/pin`, {
    method: 'POST',
    body: { pinned: true }
  });
  assert.equal(pin.status, 200);
  assert.ok(pin.data.message.pinnedAt);
  assert.equal(pin.data.message.pinnedBy, aliceUser.id);

  const messageSticker = await bob.request(`/api/messages/${imageMessage.data.message.id}/stickers`, {
    method: 'POST',
    body: { file: { name: 'message-reaction.svg', type: 'image/svg+xml', dataUrl: SVG_DATA } }
  });
  assert.equal(messageSticker.status, 201);
  assert.equal(messageSticker.data.message.messageStickers.length, 1);
  assert.equal((await alice.request(messageSticker.data.message.messageStickers[0].file.url)).status, 200);

  const forwarded = await alice.request(`/api/messages/${imageMessage.data.message.id}/forward`, {
    method: 'POST',
    body: { recipientId: bobUser.id }
  });
  assert.equal(forwarded.status, 201);
  assert.equal(forwarded.data.message.kind, 'image');
  assert.equal(forwarded.data.message.forwardedFrom, imageMessage.data.message.id);
  assert.equal((await bob.request(forwarded.data.message.attachment.url)).status, 200);

  assert.equal((await bob.request(`/api/messages/${longMessage.data.message.id}/me`, { method: 'DELETE' })).status, 200);
  const bobAfterHide = await bob.request(`/api/chats/${aliceUser.id}/messages?limit=200`);
  const aliceAfterHide = await alice.request(`/api/chats/${bobUser.id}/messages?limit=200`);
  assert.ok(!bobAfterHide.data.messages.some((message) => message.id === longMessage.data.message.id));
  assert.ok(aliceAfterHide.data.messages.some((message) => message.id === longMessage.data.message.id));

  for (let index = 0; index < 6; index += 1) {
    assert.equal((await sendMessage(alice, bobUser.id, { kind: 'text', text: `Page message ${index}` })).status, 201);
  }
  const newestPage = await alice.request(`/api/chats/${bobUser.id}/messages?limit=3`);
  assert.equal(newestPage.status, 200);
  assert.equal(newestPage.data.messages.length, 3);
  assert.equal(newestPage.data.hasMore, true);
  const olderPage = await alice.request(`/api/chats/${bobUser.id}/messages?limit=3&before=${encodeURIComponent(newestPage.data.messages[0].createdAt)}`);
  assert.equal(olderPage.status, 200);
  assert.equal(olderPage.data.messages.length, 3);

  const search = await alice.request('/api/chats/search?q=unique%20phrase');
  assert.equal(search.status, 200);
  assert.ok(search.data.results.some((result) => result.message.id === textMessage.data.message.id));

  const exportResponse = await alice.request(`/api/chats/${bobUser.id}/export?format=json`);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-disposition') || '', /attachment/);
  assert.ok(exportResponse.data.messages.length >= 10);

  assert.equal((await alice.request(`/api/messages/${textMessage.data.message.id}`, { method: 'DELETE' })).status, 200);
  const deletedList = await bob.request(`/api/chats/${aliceUser.id}/messages?limit=200`);
  assert.ok(deletedList.data.messages.find((message) => message.id === textMessage.data.message.id).deletedAt);

  assert.equal((await bob.request(`/api/blocks/${aliceUser.id}`, { method: 'POST' })).status, 200);
  const blockedUserSearch = await bob.request('/api/users/search?q=alice_test');
  assert.ok(!blockedUserSearch.data.users.some((user) => user.id === aliceUser.id));
  assert.equal((await sendMessage(alice, bobUser.id, { kind: 'text', text: 'blocked message' })).status, 403);
  assert.equal((await bob.request(`/api/blocks/${aliceUser.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await sendMessage(alice, bobUser.id, { kind: 'text', text: 'unblocked message' })).status, 201);

  assert.equal((await bob.request(`/api/mutes/${aliceUser.id}`, { method: 'POST', body: { minutes: 15 } })).status, 200);
  assert.equal((await bob.request(`/api/mutes/${aliceUser.id}`, { method: 'DELETE' })).status, 200);

  const report = await alice.request('/api/reports', {
    method: 'POST',
    body: { targetType: 'user', reportedUserId: bobUser.id, reason: 'Spam or scam' }
  });
  assert.equal(report.status, 201);
  assert.equal(report.data.emailSent, false);

  assert.equal((await alice.request(`/api/contacts/${bobUser.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await alice.request(`/api/chats/${bobUser.id}/messages?limit=200`)).status, 404);
  const removedFriendProfile = await alice.request('/api/users/bob_test');
  assert.equal(removedFriendProfile.data.user.isContact, false);
  assert.equal(removedFriendProfile.data.user.isFollowing, true);
  assert.equal(removedFriendProfile.data.user.followsViewer, true);
  const reconnect = await alice.request('/api/contacts/bob_test', { method: 'POST' });
  assert.equal(reconnect.status, 201);
  assert.equal((await bob.request(`/api/requests/${reconnect.data.request.id}/accept`, { method: 'POST' })).status, 200);
  const restoredChat = await alice.request(`/api/chats/${bobUser.id}/messages?limit=200`);
  assert.equal(restoredChat.status, 200);
  assert.ok(restoredChat.data.messages.some((message) => message.id === imageMessage.data.message.id));

  const privateProfile = await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { socialPublic: false }
  });
  assert.equal(privateProfile.status, 200);
  assert.equal((await charlie.request(`/api/follows/${aliceUser.id}`, { method: 'POST' })).status, 409);

  const storyResponse = await alice.request('/api/me/story', {
    method: 'POST',
    body: {
      file: { name: 'story.png', type: 'image/png', dataUrl: PNG_DATA },
      audio: { name: 'sound.wav', type: 'audio/wav', dataUrl: AUDIO_DATA },
      edits: {
        compositionVersion: 3,
        filter: 'oslo',
        overlayEffect: 'grain',
        brightness: 112,
        contrast: 106,
        saturation: 124,
        warmth: 18,
        fade: 12,
        vignette: 28,
        blur: 2,
        backgroundPreset: 'dusk',
        mediaOffsetX: 12,
        mediaOffsetY: -8,
        mediaFit: 'contain',
        mediaRotation: 90,
        text: 'Hello @bob_test',
        textX: 52,
        textY: 44,
        textColor: '#ffffff',
        textFont: 'poster',
        textSize: 48,
        textAlign: 'center',
        textEffect: 'shimmer',
        textAnimation: 'bounce',
        drawings: [{ brush: 'neon', color: '#ff4fa3', size: 8, points: [{ x: 10, y: 10 }, { x: 30, y: 40 }] }],
        stickers: [
          { type: 'mention', label: '@bob_test', x: 50, y: 62, rotation: 0, size: 1 },
          { type: 'link', label: 'example.com', href: 'https://example.com/path', x: 48, y: 72, rotation: 0, size: 1 },
          { type: 'link', label: 'Unsafe', href: 'javascript:alert(1)', x: 50, y: 78, rotation: 0, size: 1 },
          { id: 'add_yours_test', type: 'add_yours', label: 'Show your setup', x: 52, y: 32, rotation: 0, size: 1 },
          { id: 'quiz_test', type: 'quiz', label: 'Pick one', data: { options: ['Blue', 'Pink'], correctIndex: 1 }, x: 46, y: 38, rotation: 0, size: 1 },
          { id: 'slider_test', type: 'emoji_slider', label: 'How much?', data: { emoji: '\ud83d\ude0d' }, x: 54, y: 48, rotation: 0, size: 1 },
          { id: 'weather_test', type: 'weather', label: '18 degrees', data: { placeName: 'Berlin', region: 'Berlin, Germany', latitude: 52.52, longitude: 13.405, temperature: 18, apparentTemperature: 17, condition: 'Clear', symbol: '\u2600\ufe0f', provider: 'Open-Meteo' }, x: 55, y: 55, rotation: 0, size: 1 }
        ],
        pollQuestion: 'Coffee or tea?',
        pollOptionA: 'Coffee',
        pollOptionB: 'Tea',
        audioStart: 0,
        audioEnd: 30,
        trimStart: 4,
        trimEnd: 90,
        videoMuted: true,
        videoVolume: 0.4,
        videoSpeed: 1.5
      }
    }
  });
  assert.equal(storyResponse.status, 201);
  assert.equal(storyResponse.data.story.edits.compositionVersion, 3);
  assert.equal(storyResponse.data.story.edits.filter, 'oslo');
  assert.equal(storyResponse.data.story.edits.overlayEffect, 'grain');
  assert.equal(storyResponse.data.story.edits.brightness, 112);
  assert.equal(storyResponse.data.story.edits.mediaOffsetX, 12);
  assert.equal(storyResponse.data.story.edits.mediaOffsetY, -8);
  assert.equal(storyResponse.data.story.edits.mediaFit, 'contain');
  assert.equal(storyResponse.data.story.edits.mediaRotation, 90);
  assert.equal(storyResponse.data.story.edits.textFont, 'poster');
  assert.equal(storyResponse.data.story.edits.textEffect, 'shimmer');
  assert.equal(storyResponse.data.story.edits.textAnimation, 'bounce');
  assert.equal(storyResponse.data.story.edits.trimStart, 4);
  assert.equal(storyResponse.data.story.edits.trimEnd, 64);
  assert.equal(storyResponse.data.story.edits.videoMuted, true);
  assert.equal(storyResponse.data.story.edits.videoVolume, 0.4);
  assert.equal(storyResponse.data.story.edits.videoSpeed, 1.5);
  assert.equal(storyResponse.data.story.edits.drawings[0].brush, 'neon');
  assert.equal(storyResponse.data.story.edits.stickers.find((sticker) => sticker.type === 'link').href, 'https://example.com/path');
  assert.equal(storyResponse.data.story.edits.stickers.find((sticker) => sticker.label === 'Unsafe').href, '');
  assert.deepEqual(storyResponse.data.story.edits.stickers.find((sticker) => sticker.id === 'quiz_test').data.options, ['Blue', 'Pink']);
  assert.equal(storyResponse.data.story.edits.stickers.find((sticker) => sticker.id === 'weather_test').data.region, 'Berlin, Germany');
  const story = storyResponse.data.story;

  const directHighlight = await alice.request('/api/me/story', {
    method: 'POST',
    body: {
      file: { name: 'highlight.png', type: 'image/png', dataUrl: PNG_DATA },
      edits: { text: 'Permanent highlight' },
      saved: true
    }
  });
  assert.equal(directHighlight.status, 201);
  assert.equal(directHighlight.data.story.saved, true);
  assert.equal(directHighlight.data.story.expiresAt, null);
  assert.ok(directHighlight.data.user.stories.some((item) => item.id === directHighlight.data.story.id && item.saved));
  assert.equal(directHighlight.data.highlight.storyCount, 1);
  assert.equal(directHighlight.data.user.highlights.length, 1);
  const highlightId = directHighlight.data.highlight.id;
  const renamedHighlight = await alice.request(`/api/highlights/${highlightId}`, {
    method: 'PATCH',
    body: { title: 'Summer memories' }
  });
  assert.equal(renamedHighlight.status, 200);
  assert.equal(renamedHighlight.data.highlight.title, 'Summer memories');
  const expandedHighlight = await alice.request(`/api/highlights/${highlightId}/stories`, {
    method: 'POST',
    body: { storyId: story.id }
  });
  assert.equal(expandedHighlight.status, 200);
  assert.equal(expandedHighlight.data.highlight.storyCount, 2);
  assert.deepEqual(expandedHighlight.data.highlight.stories.map((item) => item.id), [directHighlight.data.story.id, story.id]);
  assert.equal(expandedHighlight.data.user.highlights.find((item) => item.id === highlightId).title, 'Summer memories');

  const privatePublicView = await anonymous.request('/api/users/alice_test');
  assert.equal(privatePublicView.status, 200);
  assert.equal(privatePublicView.data.user.stories.length, 0);
  assert.equal(privatePublicView.data.user.highlights.length, 0);
  const privateNonFollowerView = await charlie.request('/api/users/alice_test');
  assert.equal(privateNonFollowerView.data.user.stories.length, 0);
  assert.equal((await charlie.request(`/api/stories/${story.id}/view`, { method: 'POST' })).status, 404);
  assert.equal((await charlie.request(story.file.url)).status, 404);

  assert.equal((await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { storyReplies: 'off', mentionPermission: 'nobody' }
  })).status, 200);
  const blockedReplyView = await bob.request('/api/users/alice_test');
  assert.equal(blockedReplyView.data.user.stories.find((item) => item.id === story.id).canReply, false);
  assert.equal((await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { text: 'This should be blocked' }
  })).status, 403);
  assert.equal((await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { storyReplies: 'following', mentionPermission: 'nobody' }
  })).status, 200);

  const followerView = await bob.request('/api/users/alice_test');
  const followerStory = followerView.data.user.stories.find((item) => item.id === story.id);
  assert.ok(followerStory);
  assert.equal(followerStory.canReply, true);
  assert.equal(followerStory.edits.overlayEffect, 'grain');
  assert.equal(followerStory.edits.drawings[0].brush, 'neon');
  assert.equal((await bob.request(`/api/stories/${story.id}/view`, { method: 'POST' })).status, 200);
  assert.equal((await bob.request(`/api/stories/${story.id}/like`, { method: 'POST' })).data.story.likedByMe, true);
  const aliceMentionCount = (await alice.request('/api/notifications')).data.notifications
    .filter((notification) => notification.type === 'mention').length;
  const comment = await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { text: 'Looks good @alice_test' }
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.story.commentCount, 1);
  const originalComment = comment.data.story.comments[0];
  assert.equal(originalComment.likeCount, 0);
  const commentLike = await alice.request(`/api/stories/${story.id}/comments/${originalComment.id}/like`, { method: 'POST' });
  assert.equal(commentLike.status, 200);
  assert.equal(commentLike.data.story.comments[0].likedByMe, true);
  assert.equal(commentLike.data.story.comments[0].likeCount, 1);
  const commentReply = await alice.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { text: 'Thanks @bob_test', replyTo: originalComment.id }
  });
  assert.equal(commentReply.status, 201);
  assert.equal(commentReply.data.story.commentCount, 2);
  assert.equal(commentReply.data.story.comments[1].replyTo, originalComment.id);
  assert.equal(commentReply.data.story.comments[1].replyPreview.user.id, bobUser.id);
  assert.equal((await alice.request('/api/notifications')).data.notifications
    .filter((notification) => notification.type === 'mention').length, aliceMentionCount);

  assert.equal((await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { text: '' }
  })).status, 400);
  assert.equal((await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { kind: 'gif', gifId: 'missing_gif' }
  })).status, 404);
  const pendingCommentGif = await bob.request('/api/gifs', {
    method: 'POST',
    body: {
      title: 'Pending comment GIF',
      tags: 'comment pending',
      file: { name: 'pending-comment.gif', type: 'image/gif', dataUrl: GIF_DATA }
    }
  });
  assert.equal(pendingCommentGif.status, 201);
  assert.equal(pendingCommentGif.data.gif.status, 'pending');
  assert.equal((await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { kind: 'gif', gifId: pendingCommentGif.data.gif.id }
  })).status, 404);
  const gifComment = await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { kind: 'gif', gifId: gifSubmission.data.gif.id }
  });
  assert.equal(gifComment.status, 201);
  assert.equal(gifComment.data.story.commentCount, 3);
  const serializedGifComment = gifComment.data.story.comments.find((item) => item.kind === 'gif');
  assert.equal(serializedGifComment.gif.id, gifSubmission.data.gif.id);
  assert.equal(serializedGifComment.text, '');
  assert.equal((await bob.request(serializedGifComment.gif.file.url)).status, 200);
  const highlightCommentView = await bob.request('/api/users/alice_test');
  const highlightedStoryWithGif = highlightCommentView.data.user.highlights
    .find((item) => item.id === highlightId).stories.find((item) => item.id === story.id);
  assert.equal(highlightedStoryWithGif.comments.find((item) => item.id === serializedGifComment.id).gif.id, gifSubmission.data.gif.id);

  assert.equal((await alice.request('/api/me/profile', {
    method: 'PATCH',
    body: { mentionPermission: 'following' }
  })).status, 200);
  assert.equal((await charlie.request('/api/me/story', {
    method: 'POST',
    body: {
      file: { name: 'charlie-story.png', type: 'image/png', dataUrl: PNG_DATA },
      edits: { text: 'Hello @alice_test' }
    }
  })).status, 201);
  assert.equal((await alice.request('/api/notifications')).data.notifications
    .filter((notification) => notification.type === 'mention').length, aliceMentionCount);
  assert.equal((await bob.request('/api/me/story', {
    method: 'POST',
    body: {
      file: { name: 'bob-story.png', type: 'image/png', dataUrl: PNG_DATA },
      edits: { text: 'Hello @alice_test' }
    }
  })).status, 201);
  assert.equal((await alice.request('/api/notifications')).data.notifications
    .filter((notification) => notification.type === 'mention').length, aliceMentionCount + 1);
  const quizResponse = await bob.request(`/api/stories/${story.id}/stickers/quiz_test/respond`, {
    method: 'POST',
    body: { value: 'Pink' }
  });
  assert.equal(quizResponse.status, 200);
  assert.equal(quizResponse.data.story.stickerResponses.quiz_test.myValue, 'Pink');
  assert.equal(quizResponse.data.story.stickerResponses.quiz_test.optionCounts.Pink, 1);
  assert.deepEqual(quizResponse.data.story.stickerResponses.quiz_test.responses, []);
  const sliderResponse = await bob.request(`/api/stories/${story.id}/stickers/slider_test/respond`, {
    method: 'POST',
    body: { value: 74 }
  });
  assert.equal(sliderResponse.status, 200);
  assert.equal(sliderResponse.data.story.stickerResponses.slider_test.average, 74);
  assert.equal((await bob.request(`/api/stories/${story.id}/stickers/add_yours_test/respond`, {
    method: 'POST',
    body: { value: 'My desk' }
  })).status, 200);
  assert.equal((await bob.request(`/api/stories/${story.id}/stickers/poll/respond`, {
    method: 'POST',
    body: { value: 'Coffee' }
  })).status, 200);
  const ownerStory = (await alice.request('/api/me')).data.user.stories.find((item) => item.id === story.id);
  assert.equal(ownerStory.stickerResponses.quiz_test.responses[0].user.id, bobUser.id);
  assert.equal(ownerStory.stickerResponses.poll.optionCounts.Coffee, 1);
  assert.equal((await bob.request(story.file.url)).status, 200);
  assert.equal((await bob.request(story.audio.url)).status, 200);

  const mentionNotifications = await bob.request('/api/notifications');
  assert.ok(mentionNotifications.data.notifications.some((notification) => notification.type === 'mention'));

  const savedStory = await alice.request(`/api/stories/${story.id}/save`, { method: 'POST' });
  assert.equal(savedStory.status, 200);
  assert.equal(savedStory.data.story.saved, true);
  assert.equal(savedStory.data.story.expiresAt, null);
  assert.equal(savedStory.data.story.edits.textAnimation, 'bounce');
  assert.equal((await alice.request(`/api/stories/${directHighlight.data.story.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await alice.request(`/api/stories/${story.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob.request(`/api/stories/${story.id}/view`, { method: 'POST' })).status, 404);

  const hiddenSearch = await charlie.request('/api/me/profile', {
    method: 'PATCH',
    body: { searchable: false }
  });
  assert.equal(hiddenSearch.status, 200);
  const userSearch = await alice.request('/api/users/search?q=charlie');
  assert.ok(!userSearch.data.users.some((user) => user.id === charlieUser.id));

  const setup = await alice.request('/api/auth/2fa/setup', { method: 'POST' });
  assert.equal(setup.status, 200);
  assert.ok(setup.data.secret);
  assert.equal((await alice.request('/api/auth/2fa/enable', {
    method: 'POST',
    body: { code: totp(setup.data.secret) }
  })).status, 200);
  assert.equal((await alice.request('/api/auth/logout', { method: 'POST' })).status, 200);

  const missingCode = await alice.request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'alice_test', password: PASSWORD }
  });
  assert.equal(missingCode.status, 401);
  assert.equal(missingCode.data.requiresTwoFactor, true);
  const validLogin = await alice.request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'alice_test', password: PASSWORD, twoFactorCode: totp(setup.data.secret) }
  });
  assert.equal(validLogin.status, 200);
});

test('group invitations, history, admin controls, rich messages, and leaving', async (t) => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-app-group-test-'));
  const dataDir = path.join(runtime, 'data');
  const uploadDir = path.join(runtime, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  const port = 35000 + Math.floor(Math.random() * 1500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, UPLOAD_DIR: uploadDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverError = '';
  child.stderr.on('data', (chunk) => { serverError += chunk.toString('utf8'); });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
    fs.rmSync(runtime, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);
  assert.equal(serverError, '');
  const owner = new ApiClient(baseUrl);
  const bob = new ApiClient(baseUrl);
  const charlie = new ApiClient(baseUrl);
  const dora = new ApiClient(baseUrl);
  const ownerUser = await register(owner, 'group_owner');
  const bobUser = await register(bob, 'group_bob');
  const charlieUser = await register(charlie, 'group_charlie');
  const doraUser = await register(dora, 'group_dora');

  async function connect(requester, accepter, accepterUsername) {
    const request = await requester.request(`/api/contacts/${accepterUsername}`, { method: 'POST' });
    assert.equal(request.status, 201);
    assert.equal((await accepter.request(`/api/requests/${request.data.request.id}/accept`, { method: 'POST' })).status, 200);
  }

  await connect(owner, bob, bobUser.username);
  await connect(owner, charlie, charlieUser.username);
  await connect(bob, dora, doraUser.username);

  assert.equal((await charlie.request('/api/me/profile', {
    method: 'PATCH',
    body: { allowGroupAdds: false }
  })).data.user.allowGroupAdds, false);
  const blockedInvite = await owner.request('/api/groups', {
    method: 'POST',
    body: { name: 'Night plans', memberIds: [bobUser.id, charlieUser.id] }
  });
  assert.equal(blockedInvite.status, 403);
  assert.match(blockedInvite.data.error, /does not allow/i);

  await charlie.request('/api/me/profile', { method: 'PATCH', body: { allowGroupAdds: true } });
  const created = await owner.request('/api/groups', {
    method: 'POST',
    body: { name: 'Night plans', memberIds: [bobUser.id, charlieUser.id] }
  });
  assert.equal(created.status, 201);
  const group = created.data.group;
  assert.equal(group.memberCount, 3);
  assert.equal(group.isAdmin, true);
  assert.ok((await charlie.request('/api/notifications')).data.notifications.some((note) => note.type === 'group_added' && note.group.id === group.id));

  const unmoderatedGroupGif = await owner.request(`/api/groups/${group.id}/messages`, {
    method: 'POST',
    body: { kind: 'gif', file: { name: 'unreviewed.gif', type: 'image/gif', dataUrl: GIF_DATA } }
  });
  assert.equal(unmoderatedGroupGif.status, 403);
  assert.match(unmoderatedGroupGif.data.error, /approved/i);
  const disguisedGroupGif = await owner.request(`/api/groups/${group.id}/messages`, {
    method: 'POST',
    body: { kind: 'image', file: { name: 'unreviewed.gif', type: 'image/gif', dataUrl: GIF_DATA } }
  });
  assert.equal(disguisedGroupGif.status, 403);
  assert.match(disguisedGroupGif.data.error, /GIF pool/i);

  const groupMessage = await owner.request(`/api/groups/${group.id}/messages`, {
    method: 'POST',
    body: { kind: 'image', text: 'Previous group history', file: { name: 'plans.png', type: 'image/png', dataUrl: PNG_DATA } }
  });
  assert.equal(groupMessage.status, 201);
  assert.equal(groupMessage.data.message.sender.username, ownerUser.username);
  assert.equal((await bob.request(groupMessage.data.message.attachment.url)).status, 200);
  assert.equal((await dora.request(groupMessage.data.message.attachment.url)).status, 404);
  assert.equal((await bob.request(`/api/messages/${groupMessage.data.message.id}/reaction`, {
    method: 'POST', body: { emoji: '❤️' }
  })).status, 200);
  assert.equal((await bob.request(`/api/messages/${groupMessage.data.message.id}`, { method: 'DELETE' })).status, 403);

  const added = await bob.request(`/api/groups/${group.id}/members`, {
    method: 'POST',
    body: { memberIds: [doraUser.id] }
  });
  assert.equal(added.status, 200);
  assert.equal(added.data.group.memberCount, 4);
  const doraHistory = await dora.request(`/api/groups/${group.id}/messages?limit=200`);
  assert.equal(doraHistory.status, 200);
  assert.ok(doraHistory.data.messages.some((message) => message.id === groupMessage.data.message.id));
  assert.equal((await dora.request(groupMessage.data.message.attachment.url)).status, 200);

  const promoted = await owner.request(`/api/groups/${group.id}/admins/${bobUser.id}`, { method: 'POST' });
  assert.equal(promoted.status, 200);
  assert.ok(promoted.data.group.adminIds.includes(bobUser.id));
  assert.equal((await bob.request(`/api/groups/${group.id}/members/${charlieUser.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await charlie.request(`/api/groups/${group.id}/messages?limit=200`)).status, 404);
  assert.equal((await charlie.request(groupMessage.data.message.attachment.url)).status, 404);

  const edited = await owner.request(`/api/groups/${group.id}`, {
    method: 'PATCH',
    body: { name: 'Weekend plans', membersCanAdd: false, avatar: { name: 'group.png', type: 'image/png', dataUrl: PNG_DATA } }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.group.name, 'Weekend plans');
  assert.equal(edited.data.group.membersCanAdd, false);
  assert.equal((await dora.request(edited.data.group.avatar.url)).status, 200);

  const appearance = await dora.request(`/api/groups/${group.id}/appearance`, {
    method: 'PATCH', body: { theme: 'rose', background: 'rose', mineColor: '#aa3377' }
  });
  assert.equal(appearance.status, 200);
  assert.equal(appearance.data.settings.theme, 'rose');
  const groupSearch = await dora.request('/api/chats/search?q=previous%20group');
  assert.ok(groupSearch.data.results.some((result) => result.group?.id === group.id));
  assert.equal((await dora.request(`/api/groups/${group.id}/export?format=json`)).status, 200);
  assert.equal((await dora.request(`/api/groups/${group.id}/leave`, { method: 'POST' })).status, 200);
  assert.ok(!(await dora.request('/api/groups')).data.groups.some((item) => item.id === group.id));
});
