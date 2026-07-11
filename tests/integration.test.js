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
  assert.ok(client.cookie.startsWith('chat_sid='));
  return response.data.user;
}

async function sendMessage(client, peerId, body) {
  return client.request(`/api/chats/${encodeURIComponent(peerId)}/messages`, {
    method: 'POST',
    body
  });
}

test('story size controls stay inside the editor gesture boundary', () => {
  const clientSource = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  assert.match(clientSource, /id="story-text-size"[^>]*data-stop-close/);
  assert.match(clientSource, /id="story-draw-size"[^>]*data-stop-close/);
  assert.match(clientSource, /state\.me && !state\.storyEditor && event\.clientX < 24/);
  assert.match(clientSource, /initialTool = 'filter'/);
  assert.match(clientSource, /activeTool: textEditing \? 'text' : initialTool/);
  assert.match(clientSource, /class="story-effects-panel"/);
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

  const shortUserSearch = await alice.request('/api/users/search?q=d');
  assert.equal(shortUserSearch.status, 200);
  assert.deepEqual(shortUserSearch.data.users, []);
  const exactUserSearch = await alice.request('/api/users/search?q=dora_test');
  assert.equal(exactUserSearch.status, 200);
  assert.equal(exactUserSearch.data.users[0].id, doraUser.id);

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
    { kind: 'sticker', file: { name: 'sticker.png', type: 'image/png', dataUrl: PNG_DATA }, stickerId: 'local-sticker' }
  ];
  for (const mediaCase of mediaCases) {
    const response = await sendMessage(alice, bobUser.id, mediaCase);
    assert.equal(response.status, 201);
    assert.equal(response.data.message.kind, mediaCase.kind);
  }

  assert.equal((await bob.request(imageMessage.data.message.attachment.metaUrl)).status, 200);
  assert.equal((await bob.request(imageMessage.data.message.attachment.downloadUrl)).status, 200);

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
        text: 'Hello @bob_test',
        textX: 52,
        textY: 44,
        textColor: '#ffffff',
        textFont: 'strong',
        textSize: 48,
        textAlign: 'center',
        textEffect: 'outline',
        textAnimation: 'bounce',
        drawings: [{ brush: 'neon', color: '#ff4fa3', size: 8, points: [{ x: 10, y: 10 }, { x: 30, y: 40 }] }],
        stickers: [
          { type: 'mention', label: '@bob_test', x: 50, y: 62, rotation: 0, size: 1 },
          { type: 'link', label: 'example.com', href: 'https://example.com/path', x: 48, y: 72, rotation: 0, size: 1 },
          { type: 'link', label: 'Unsafe', href: 'javascript:alert(1)', x: 50, y: 78, rotation: 0, size: 1 },
          { type: 'add_yours', label: 'Show your setup', x: 52, y: 32, rotation: 0, size: 1 }
        ],
        audioStart: 0,
        audioEnd: 30
      }
    }
  });
  assert.equal(storyResponse.status, 201);
  assert.equal(storyResponse.data.story.edits.compositionVersion, 3);
  assert.equal(storyResponse.data.story.edits.filter, 'oslo');
  assert.equal(storyResponse.data.story.edits.overlayEffect, 'grain');
  assert.equal(storyResponse.data.story.edits.brightness, 112);
  assert.equal(storyResponse.data.story.edits.textFont, 'strong');
  assert.equal(storyResponse.data.story.edits.textEffect, 'outline');
  assert.equal(storyResponse.data.story.edits.textAnimation, 'bounce');
  assert.equal(storyResponse.data.story.edits.drawings[0].brush, 'neon');
  assert.equal(storyResponse.data.story.edits.stickers.find((sticker) => sticker.type === 'link').href, 'https://example.com/path');
  assert.equal(storyResponse.data.story.edits.stickers.find((sticker) => sticker.label === 'Unsafe').href, '');
  const story = storyResponse.data.story;

  const privatePublicView = await anonymous.request('/api/users/alice_test');
  assert.equal(privatePublicView.status, 200);
  assert.equal(privatePublicView.data.user.stories.length, 0);
  const privateNonFollowerView = await charlie.request('/api/users/alice_test');
  assert.equal(privateNonFollowerView.data.user.stories.length, 0);
  assert.equal((await charlie.request(`/api/stories/${story.id}/view`, { method: 'POST' })).status, 404);
  assert.equal((await charlie.request(story.file.url)).status, 404);

  const followerView = await bob.request('/api/users/alice_test');
  const followerStory = followerView.data.user.stories.find((item) => item.id === story.id);
  assert.ok(followerStory);
  assert.equal(followerStory.edits.overlayEffect, 'grain');
  assert.equal(followerStory.edits.drawings[0].brush, 'neon');
  assert.equal((await bob.request(`/api/stories/${story.id}/view`, { method: 'POST' })).status, 200);
  assert.equal((await bob.request(`/api/stories/${story.id}/like`, { method: 'POST' })).data.story.likedByMe, true);
  const comment = await bob.request(`/api/stories/${story.id}/comments`, {
    method: 'POST',
    body: { text: 'Looks good @alice_test' }
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.story.commentCount, 1);
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
