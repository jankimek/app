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

test('mobile viewport and story editing controls stay inside their gesture boundaries', () => {
  const clientSource = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
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
  assert.match(clientSource, /state\.me && backEntry && !state\.navigationBusy && !gestureBlocked && event\.clientX < 38/);
  assert.match(clientSource, /function renderMessageFocus/);
  assert.match(clientSource, /function capturePersistentScroll/);
  assert.match(clientSource, /state\.tabSwipe = \{/);
  assert.match(clientSource, /function updateBubbleViewportColors/);
  assert.match(styleSource, /--message-bubble-color/);
  assert.match(styleSource, /class="message-focus-overlay"|\.message-focus-overlay/);
  assert.match(clientSource, /class="message-focus-host"/);
  assert.match(clientSource, /function renderStickerManager/);
  assert.match(clientSource, /data-action="like-story-comment"/);
  assert.doesNotMatch(clientSource, /profile-network:\$\{esc\(user\?/);
  assert.match(clientSource, /initialTool = null/);
  assert.match(clientSource, /activeTool: textEditing \? 'text' : initialTool/);
  assert.match(clientSource, /class="story-effects-panel"/);
  assert.match(clientSource, /let stableViewportHeight = 0/);
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
  assert.match(clientSource, /function animateNavigationBack/);
  assert.match(clientSource, /installNavigationPreview\(backEntry, 'swipe'\)/);
  assert.match(styleSource, /\.route-page-preview/);
  assert.match(styleSource, /socialUnderlineToRight/);
  assert.match(clientSource, /function submitChatGif/);
  assert.doesNotMatch(clientSource, /sendFile\(file, 'gif'\)/);
  assert.match(clientSource, /function syncGroupComposerSelection/);
  assert.match(clientSource, /class="navigation-edge-zone"/);
  assert.match(styleSource, /\.group-composer-create/);
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

  const privatePublicView = await anonymous.request('/api/users/alice_test');
  assert.equal(privatePublicView.status, 200);
  assert.equal(privatePublicView.data.user.stories.length, 0);
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
