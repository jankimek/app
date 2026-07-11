const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 35 * 1024 * 1024);
const COOKIE_NAME = 'chat_sid';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const REPORT_EMAIL = process.env.REPORT_EMAIL || 'newcomearound@gmail.com';
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
const REPORT_REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Hate or abuse',
  'Sexual content',
  'Violence or threat',
  'Impersonation',
  'Illegal or dangerous activity',
  'Other'
];
const reportReasonsSet = new Set(REPORT_REASONS);

for (const dir of [PUBLIC_DIR, DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = {
  users: readJson('users.json', {}),
  sessions: readJson('sessions.json', {}),
  contacts: readJson('contacts.json', {}),
  messages: readJson('messages.json', {}),
  files: readJson('files.json', {}),
  friendRequests: readJson('friendRequests.json', {}),
  notifications: readJson('notifications.json', {}),
  blocks: readJson('blocks.json', {}),
  mutes: readJson('mutes.json', {}),
  stories: readJson('stories.json', {}),
  reports: readJson('reports.json', []),
  userMeta: readJson('userMeta.json', {})
};

const socketsByUser = new Map();

function readJson(fileName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveJson(fileName, data) {
  const finalPath = path.join(DATA_DIR, fileName);
  const tempPath = `${finalPath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(data, null, 2));
  await fsp.rename(tempPath, finalPath);
}

function saveUsers() {
  return saveJson('users.json', db.users);
}

function saveSessions() {
  return saveJson('sessions.json', db.sessions);
}

function saveContacts() {
  return saveJson('contacts.json', db.contacts);
}

function saveMessages() {
  return saveJson('messages.json', db.messages);
}

function saveFiles() {
  return saveJson('files.json', db.files);
}

function saveFriendRequests() {
  return saveJson('friendRequests.json', db.friendRequests);
}

function saveNotifications() {
  return saveJson('notifications.json', db.notifications);
}

function saveBlocks() {
  return saveJson('blocks.json', db.blocks);
}

function saveMutes() {
  return saveJson('mutes.json', db.mutes);
}

function saveStories() {
  return saveJson('stories.json', db.stories);
}

function saveReports() {
  return saveJson('reports.json', db.reports);
}

function saveUserMeta() {
  return saveJson('userMeta.json', db.userMeta);
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, user) {
  const actual = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function createPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
  }
  return cookies;
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function requestNetworkInfo(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const realIp = String(req.headers['x-real-ip'] || '');
  const remoteAddress = req.socket?.remoteAddress || '';
  const ip = (forwarded.split(',')[0] || realIp || remoteAddress || '').trim();
  return {
    ip,
    remoteAddress,
    xForwardedFor: forwarded,
    xRealIp: realIp,
    userAgent: String(req.headers['user-agent'] || ''),
    host: String(req.headers.host || ''),
    referer: String(req.headers.referer || req.headers.referrer || '')
  };
}

function rememberUserRequest(userId, req) {
  if (!userId || !req) return;
  db.userMeta[userId] = {
    ...(db.userMeta[userId] || {}),
    lastSeenAt: nowIso(),
    network: requestNetworkInfo(req)
  };
  saveUserMeta().catch(console.error);
}

function sessionFromRequest(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const session = db.sessions[sha256(token)];
  if (!session) return null;
  const user = db.users[session.userId];
  if (!user) return null;
  session.lastSeenAt = nowIso();
  saveSessions().catch(console.error);
  rememberUserRequest(user.id, req);
  return { token, session, user };
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha256(token)] = {
    userId,
    createdAt: nowIso(),
    lastSeenAt: nowIso()
  };
  await saveSessions();
  setSessionCookie(res, token);
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function userByUsername(username) {
  const wanted = normalizeUsername(username);
  return Object.values(db.users).find((user) => user.usernameLower === wanted) || null;
}

function userByIdentifier(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  return Object.values(db.users).find((user) => (
    user.usernameLower === value ||
    (user.email && user.email.toLowerCase() === value) ||
    (user.phone && user.phone === String(identifier || '').trim())
  )) || null;
}

function publicFile(file) {
  if (!file) return null;
  return {
    id: file.id,
    name: file.originalName,
    mime: file.mime,
    size: file.size,
    uploadedAt: file.uploadedAt,
    originalLastModified: file.originalLastModified || null,
    url: `/api/files/${file.id}/download?inline=1`,
    downloadUrl: `/api/files/${file.id}/download`,
    metaUrl: `/api/files/${file.id}/meta`
  };
}

function basicPublicUser(user, viewerId = null) {
  if (!user) return null;
  const avatar = user.profile.avatarFileId ? db.files[user.profile.avatarFileId] : null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile.displayName || user.username,
    bio: user.profile.bio || '',
    avatar: publicFile(avatar),
    stories: canViewStories(user.id, viewerId)
      ? activeStoriesFor(user.id).map((story) => publicStory(story, viewerId))
      : [],
    url: `/u/${encodeURIComponent(user.username)}`,
    createdAt: user.createdAt,
    searchable: user.profile?.searchable !== false
  };
}

function publicUser(user, viewerId = null) {
  if (!user) return null;
  const relation = viewerId ? relationFor(viewerId, user.id) : {};
  const follow = followStatsFor(user, viewerId);
  return {
    ...basicPublicUser(user, viewerId),
    ...follow,
    isContact: Boolean(viewerId && (db.contacts[viewerId] || []).includes(user.id)),
    ...relation
  };
}

function followStatsFor(user, viewerId = null) {
  const accepted = Object.values(db.friendRequests).filter((request) => (
    request.status === 'accepted' &&
    (db.contacts[request.fromId] || []).includes(request.toId) &&
    (db.contacts[request.toId] || []).includes(request.fromId)
  ));
  const contacts = db.contacts[user.id] || [];
  let followers = [
    ...accepted.filter((request) => request.toId === user.id).map((request) => request.fromId),
    ...contacts
  ];
  let following = [
    ...accepted.filter((request) => request.fromId === user.id).map((request) => request.toId),
    ...contacts
  ];
  followers = Array.from(new Set(followers)).filter((id) => db.users[id]);
  following = Array.from(new Set(following)).filter((id) => db.users[id]);
  const visible = user.profile?.socialPublic !== false || viewerId === user.id;
  return {
    socialPublic: user.profile?.socialPublic !== false,
    followersVisible: visible,
    followerCount: visible ? followers.length : null,
    followingCount: visible ? following.length : null,
    followers: visible ? followers.map((id) => basicPublicUser(db.users[id], viewerId)) : [],
    following: visible ? following.map((id) => basicPublicUser(db.users[id], viewerId)) : []
  };
}

function chatIdFor(a, b) {
  return [a, b].sort().join('__');
}

function ensureContactList(userId) {
  if (!db.contacts[userId]) db.contacts[userId] = [];
  return db.contacts[userId];
}

function addContact(a, b) {
  if (a === b) return;
  const aList = ensureContactList(a);
  const bList = ensureContactList(b);
  if (!aList.includes(b)) aList.push(b);
  if (!bList.includes(a)) bList.push(a);
}

function removeContact(a, b) {
  db.contacts[a] = (db.contacts[a] || []).filter((id) => id !== b);
  db.contacts[b] = (db.contacts[b] || []).filter((id) => id !== a);
}

function ensureObjectList(store, userId) {
  if (!store[userId]) store[userId] = [];
  return store[userId];
}

function requestBetween(a, b, status = null) {
  return Object.values(db.friendRequests).find((request) => (
    ((request.fromId === a && request.toId === b) || (request.fromId === b && request.toId === a)) &&
    (!status || request.status === status)
  )) || null;
}

function pendingIncomingRequests(userId) {
  return Object.values(db.friendRequests)
    .filter((request) => request.toId === userId && request.status === 'pending')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function pendingRequestFromTo(fromId, toId) {
  return Object.values(db.friendRequests).find((request) => (
    request.fromId === fromId && request.toId === toId && request.status === 'pending'
  )) || null;
}

function publicRequest(request, viewerId) {
  if (!request) return null;
  return {
    id: request.id,
    from: basicPublicUser(db.users[request.fromId], viewerId),
    to: basicPublicUser(db.users[request.toId], viewerId),
    status: request.status,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt || null
  };
}

function relationFor(viewerId, otherId) {
  if (!viewerId || viewerId === otherId) return {};
  const outgoing = pendingRequestFromTo(viewerId, otherId);
  const incoming = pendingRequestFromTo(otherId, viewerId);
  return {
    outgoingRequest: outgoing ? publicRequest(outgoing, viewerId) : null,
    incomingRequest: incoming ? publicRequest(incoming, viewerId) : null,
    hasBlocked: hasBlocked(viewerId, otherId),
    blockedBy: hasBlocked(otherId, viewerId),
    muteUntil: muteRecord(viewerId, otherId)?.until || null
  };
}

function addNotification(userId, type, actorId, requestId = null, text = '') {
  const list = ensureObjectList(db.notifications, userId);
  if (requestId && list.some((item) => item.requestId === requestId && item.type === type)) return null;
  const notification = {
    id: id('note'),
    type,
    actorId,
    requestId,
    text,
    createdAt: nowIso()
  };
  list.unshift(notification);
  db.notifications[userId] = list.slice(0, 80);
  return notification;
}

function publicNotification(notification, viewerId) {
  return {
    id: notification.id,
    type: notification.type,
    actor: basicPublicUser(db.users[notification.actorId], viewerId),
    request: notification.requestId ? publicRequest(db.friendRequests[notification.requestId], viewerId) : null,
    text: notification.text,
    createdAt: notification.createdAt
  };
}

function hasBlocked(userId, targetId) {
  return (db.blocks[userId] || []).includes(targetId);
}

function isBlockedBetween(a, b) {
  return hasBlocked(a, b) || hasBlocked(b, a);
}

function muteRecord(userId, targetId) {
  return (db.mutes[userId] || {})[targetId] || null;
}

function setMute(userId, targetId, until) {
  if (!db.mutes[userId]) db.mutes[userId] = {};
  db.mutes[userId][targetId] = { until, updatedAt: nowIso() };
}

function clearMute(userId, targetId) {
  if (db.mutes[userId]) delete db.mutes[userId][targetId];
}

function canChat(a, b) {
  return Boolean(
    db.users[a] &&
    db.users[b] &&
    (db.contacts[a] || []).includes(b) &&
    (db.contacts[b] || []).includes(a) &&
    !isBlockedBetween(a, b)
  );
}

function canViewChat(a, b) {
  return Boolean(
    db.users[a] &&
    db.users[b] &&
    (db.contacts[a] || []).includes(b) &&
    (db.contacts[b] || []).includes(a)
  );
}

function canViewStories(ownerId, viewerId = null) {
  const owner = db.users[ownerId];
  if (!owner) return false;
  if (viewerId && viewerId !== ownerId && isBlockedBetween(ownerId, viewerId)) return false;
  if (owner.profile?.socialPublic !== false) return true;
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  return (db.contacts[ownerId] || []).includes(viewerId) &&
    (db.contacts[viewerId] || []).includes(ownerId);
}

function canViewStory(story, viewerId = null) {
  if (!story || story.deletedAt) return false;
  const active = story.saved || new Date(story.expiresAt).getTime() > Date.now();
  return Boolean(active && canViewStories(story.ownerId, viewerId));
}

function activeStoriesFor(userId) {
  const now = Date.now();
  return Object.values(db.stories)
    .filter((story) => story.ownerId === userId && !story.deletedAt)
    .filter((story) => story.saved || new Date(story.expiresAt).getTime() > now)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function storyActor(user) {
  if (!user) return null;
  const avatar = user.profile.avatarFileId ? db.files[user.profile.avatarFileId] : null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile.displayName || user.username,
    avatar: publicFile(avatar)
  };
}

function publicStory(story, viewerId = null) {
  if (!story) return null;
  const views = Array.isArray(story.views) ? story.views : [];
  const likes = Array.isArray(story.likes) ? story.likes : [];
  const comments = Array.isArray(story.comments) ? story.comments : [];
  return {
    id: story.id,
    ownerId: story.ownerId,
    file: publicFile(db.files[story.fileId]),
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    saved: Boolean(story.saved),
    edits: story.edits || {},
    audio: publicFile(db.files[story.audioFileId]),
    viewed: Boolean(viewerId && (viewerId === story.ownerId || views.includes(viewerId))),
    likeCount: likes.length,
    likedByMe: Boolean(viewerId && likes.includes(viewerId)),
    commentCount: comments.length,
    comments: comments.slice(-30).map((comment) => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      user: storyActor(db.users[comment.userId])
    }))
  };
}

function cleanStoryDrawings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 80).map((stroke) => ({
    color: /^#[0-9a-f]{6}$/i.test(String(stroke?.color || '')) ? stroke.color : '#ffffff',
    size: Math.max(2, Math.min(20, Number(stroke?.size || 6))),
    points: Array.isArray(stroke?.points)
      ? stroke.points.slice(0, 350).map((point) => ({
        x: Math.max(0, Math.min(100, Number(point?.x || 0))),
        y: Math.max(0, Math.min(100, Number(point?.y || 0)))
      }))
      : []
  })).filter((stroke) => stroke.points.length);
}

function cleanStoryStickers(raw) {
  const validTypes = new Set(['emoji', 'gif', 'mention', 'question', 'hashtag', 'countdown', 'location']);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((sticker) => ({
    id: cleanText(sticker?.id || id('sticker'), 80),
    type: validTypes.has(sticker?.type) ? sticker.type : 'emoji',
    label: cleanText(sticker?.label || '', 80),
    x: Math.max(5, Math.min(95, Number(sticker?.x || 50))),
    y: Math.max(5, Math.min(95, Number(sticker?.y || 42))),
    rotation: Math.max(-180, Math.min(180, Number(sticker?.rotation || 0))),
    size: Math.max(0.7, Math.min(1.8, Number(sticker?.size || 1)))
  })).filter((sticker) => sticker.label);
}

function mentionedUsers(text, excludeUserId = null) {
  const names = Array.from(new Set(String(text || '').match(/@([a-zA-Z0-9_.]{3,24})/g)?.map((item) => item.slice(1).toLowerCase()) || []));
  return names
    .map((name) => userByUsername(name))
    .filter((user) => user && user.id !== excludeUserId);
}

function notifyMentions(actor, text, source) {
  const notifications = [];
  for (const target of mentionedUsers(text, actor.id)) {
    const note = addNotification(target.id, 'mention', actor.id, null, `${actor.username} mentioned you ${source}.`);
    if (note) {
      notifications.push({ target, note });
      pushToUser(target.id, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(target.id).length,
        notification: publicNotification(note, target.id)
      });
    }
  }
  return notifications;
}

function ensureChatMessages(chatId) {
  if (!db.messages[chatId]) db.messages[chatId] = [];
  return db.messages[chatId];
}

function findMessage(messageId) {
  for (const [chatId, list] of Object.entries(db.messages)) {
    const message = list.find((item) => item.id === messageId);
    if (message) return { chatId, message };
  }
  return null;
}

function participantsForChatId(chatId) {
  return chatId.split('__');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function messagePreview(message) {
  if (!message) return null;
  if (message.deletedAt) return { id: message.id, kind: message.kind, deletedAt: message.deletedAt };
  return {
    id: message.id,
    kind: message.kind,
    text: message.text || '',
    senderId: message.senderId,
    createdAt: message.createdAt,
    attachment: message.attachment ? {
      name: message.attachment.name,
      mime: message.attachment.mime,
      size: message.attachment.size
    } : null
  };
}

function messageSearchText(message) {
  if (!message || message.deletedAt) return '';
  const sender = db.users[message.senderId];
  return [
    message.text || '',
    message.kind || '',
    message.attachment?.name || '',
    message.attachment?.mime || '',
    sender?.username || '',
    sender?.profile?.displayName || ''
  ].join(' ');
}

function messageSnippet(message) {
  if (!message || message.deletedAt) return 'Deleted message';
  if (message.text) return message.text;
  if (message.attachment?.name) return `${message.kind}: ${message.attachment.name}`;
  return message.kind || 'message';
}

function decorateMessage(message) {
  const reply = message.replyTo ? findMessage(message.replyTo)?.message : null;
  const attachment = message.attachment?.id ? publicFile(db.files[message.attachment.id]) : null;
  return {
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    recipientId: message.recipientId,
    kind: message.kind,
    text: message.deletedAt ? '' : (message.text || ''),
    replyTo: message.replyTo || null,
    replyPreview: messagePreview(reply),
    attachment: message.deletedAt ? null : attachment,
    stickerId: message.deletedAt ? null : (message.stickerId || null),
    createdAt: message.createdAt,
    deletedAt: message.deletedAt || null,
    deletedBy: message.deletedBy || null
  };
}

function latestVisibleMessage(messages, viewerId) {
  const visible = messages.filter((message) => !(message.hiddenFor || []).includes(viewerId));
  return visible[visible.length - 1] || null;
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { error: message, ...extra });
}

function mailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function reportUserSnapshot(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile?.displayName || user.username,
    email: user.email || '',
    phone: user.phone || '',
    createdAt: user.createdAt,
    lastNetwork: db.userMeta[user.id]?.network || null,
    lastSeenAt: db.userMeta[user.id]?.lastSeenAt || null
  };
}

function reportMessageSnapshot(message, chatId) {
  if (!message) return null;
  return {
    id: message.id,
    chatId,
    kind: message.kind,
    text: message.text || '',
    createdAt: message.createdAt,
    sender: reportUserSnapshot(db.users[message.senderId]),
    recipient: reportUserSnapshot(db.users[message.recipientId]),
    attachment: message.attachment ? {
      id: message.attachment.id,
      name: message.attachment.name,
      mime: message.attachment.mime,
      size: message.attachment.size
    } : null
  };
}

function reportEmailBody(report) {
  return [
    `Report ID: ${report.id}`,
    `Created: ${report.createdAt}`,
    `Reason: ${report.reason}`,
    `Target type: ${report.targetType}`,
    '',
    'Reporter:',
    JSON.stringify(report.reporter, null, 2),
    '',
    'Reported user:',
    JSON.stringify(report.reportedUser, null, 2),
    '',
    'Message:',
    JSON.stringify(report.message, null, 2),
    '',
    'Request network:',
    JSON.stringify(report.requestNetwork, null, 2)
  ].join('\n');
}

function sendMailViaSendmail(to, subject, text) {
  return new Promise((resolve) => {
    if (!to || !fs.existsSync(SENDMAIL_PATH)) {
      resolve({ sent: false, reason: 'sendmail not configured' });
      return;
    }
    const child = spawn(SENDMAIL_PATH, ['-t', '-oi']);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => resolve({ sent: false, reason: error.message }));
    child.on('close', (code) => {
      resolve(code === 0
        ? { sent: true }
        : { sent: false, reason: stderr.trim() || `sendmail exited with ${code}` });
    });
    child.stdin.end([
      `To: ${mailHeader(to)}`,
      `Subject: ${mailHeader(subject)}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text
    ].join('\n'));
  });
}

async function sendReportEmail(report) {
  const subject = `[Chat report] ${report.reason} - ${report.reportedUser?.username || report.targetType}`;
  return sendMailViaSendmail(REPORT_EMAIL, subject, reportEmailBody(report));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

async function requireAuth(req, res) {
  const auth = sessionFromRequest(req);
  if (!auth) {
    sendError(res, 401, 'Please sign in first.');
    return null;
  }
  return auth.user;
}

function cleanText(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!match) throw Object.assign(new Error('Invalid file data'), { status: 400 });
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { buffer, mime };
}

function mimeFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?[;,]/.exec(String(dataUrl || ''));
  return match?.[1] || 'application/octet-stream';
}

function safeFileName(name) {
  const cleaned = String(name || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 80);
  return cleaned || 'file';
}

function extensionForMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'application/pdf': '.pdf',
    'text/plain': '.txt'
  };
  return map[mime] || '.bin';
}

async function saveUpload({ dataUrl, name, lastModified }, ownerId, scope) {
  const { buffer, mime } = dataUrlToBuffer(dataUrl);
  if (!buffer.length) throw Object.assign(new Error('Empty files are not supported'), { status: 400 });
  const originalName = safeFileName(name || `upload${extensionForMime(mime)}`);
  const ext = path.extname(originalName) || extensionForMime(mime);
  const day = new Date().toISOString().slice(0, 10);
  const folder = path.join(UPLOAD_DIR, day);
  await fsp.mkdir(folder, { recursive: true });
  const fileId = id('file');
  const diskName = `${fileId}${ext}`;
  const diskPath = path.join(folder, diskName);
  await fsp.writeFile(diskPath, buffer);
  const record = {
    id: fileId,
    ownerId,
    scope,
    originalName,
    mime,
    size: buffer.length,
    uploadedAt: nowIso(),
    originalLastModified: lastModified || null,
    diskPath,
    messageId: null
  };
  db.files[fileId] = record;
  await saveFiles();
  return record;
}

function canAccessFile(userId, file) {
  if (!file) return false;
  if (file.scope === 'avatar') return true;
  if (file.scope === 'story' || file.scope === 'story-audio') {
    const story = Object.values(db.stories).find((item) => (
      item.fileId === file.id || item.audioFileId === file.id
    ));
    return canViewStory(story, userId);
  }
  if (!userId) return false;
  if (file.ownerId === userId) return true;
  if (!file.messageId) return false;
  const found = findMessage(file.messageId);
  if (!found) return false;
  const { message } = found;
  if (message.deletedAt) return false;
  return message.senderId === userId || message.recipientId === userId;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

function base32Decode(value) {
  const clean = String(value || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code) {
  const value = String(code || '').replace(/\s+/g, '');
  const counter = Math.floor(Date.now() / 30000);
  for (let offset = -1; offset <= 1; offset += 1) {
    if (hotp(secret, counter + offset) === value) return true;
  }
  return false;
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJsonBody(req);
    const username = String(body.username || '').trim();
    const usernameLower = normalizeUsername(username);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');

    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) {
      return sendError(res, 400, 'Username must be 3-24 characters and use letters, numbers, underscores, or dots.');
    }
    if (password.length < 8) return sendError(res, 400, 'Password must be at least 8 characters.');
    if (Object.values(db.users).some((user) => user.usernameLower === usernameLower)) {
      return sendError(res, 409, 'That username is already taken.');
    }
    if (email && Object.values(db.users).some((user) => user.email === email)) {
      return sendError(res, 409, 'That email is already registered.');
    }
    if (phone && Object.values(db.users).some((user) => user.phone === phone)) {
      return sendError(res, 409, 'That phone number is already registered.');
    }

    const passwordRecord = createPassword(password);
    const user = {
      id: id('user'),
      username,
      usernameLower,
      email,
      phone,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      createdAt: nowIso(),
      profile: {
        displayName: username,
        bio: '',
        avatarFileId: null,
        socialPublic: true,
        searchable: true
      },
      twoFactor: {
        enabled: false,
        secret: null,
        pendingSecret: null
      }
    };
    db.users[user.id] = user;
    db.contacts[user.id] = [];
    db.notifications[user.id] = [];
    db.blocks[user.id] = [];
    db.mutes[user.id] = {};
    await Promise.all([saveUsers(), saveContacts(), saveNotifications(), saveBlocks(), saveMutes()]);
    await createSession(res, user.id);
    rememberUserRequest(user.id, req);
    return sendJson(res, 201, { user: publicUser(user, user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const user = userByIdentifier(body.identifier);
    if (!user || !verifyPassword(String(body.password || ''), user)) {
      return sendError(res, 401, 'Wrong login or password.');
    }
    if (user.twoFactor?.enabled && !verifyTotp(user.twoFactor.secret, body.twoFactorCode)) {
      return sendError(res, 401, 'Two-factor code required.', { requiresTwoFactor: true });
    }
    await createSession(res, user.id);
    rememberUserRequest(user.id, req);
    return sendJson(res, 200, { user: publicUser(user, user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) {
      delete db.sessions[sha256(token)];
      await saveSessions();
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    const user = await requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, {
      user: publicUser(user, user.id),
      twoFactorEnabled: Boolean(user.twoFactor?.enabled),
      pendingRequestCount: pendingIncomingRequests(user.id).length
    });
  }

  if (req.method === 'PATCH' && pathname === '/api/me/profile') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const username = cleanText(body.username || user.username, 24);
    const usernameLower = normalizeUsername(username);
    if (username !== user.username) {
      if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) {
        return sendError(res, 400, 'Username must be 3-24 characters and use letters, numbers, underscores, or dots.');
      }
      if (Object.values(db.users).some((item) => item.id !== user.id && item.usernameLower === usernameLower)) {
        return sendError(res, 409, 'That username is already taken.');
      }
      user.username = username;
      user.usernameLower = usernameLower;
    }
    user.profile.displayName = cleanText(body.displayName || user.profile.displayName || user.username, 60) || user.username;
    user.profile.bio = cleanText(body.bio || '', 280);
    if (body.socialPublic !== undefined) user.profile.socialPublic = Boolean(body.socialPublic);
    if (body.searchable !== undefined) user.profile.searchable = Boolean(body.searchable);
    if (body.avatar?.dataUrl) {
      if (!mimeFromDataUrl(body.avatar.dataUrl).startsWith('image/')) return sendError(res, 400, 'Profile picture must be an image.');
      const file = await saveUpload(body.avatar, user.id, 'avatar');
      user.profile.avatarFileId = file.id;
    }
    await saveUsers();
    return sendJson(res, 200, { user: publicUser(user, user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/me/story') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    if (!body.file?.dataUrl || !mimeFromDataUrl(body.file.dataUrl).startsWith('image/') && !mimeFromDataUrl(body.file.dataUrl).startsWith('video/')) {
      return sendError(res, 400, 'Stories must be images or videos.');
    }
    const file = await saveUpload(body.file, user.id, 'story');
    let audioFile = null;
    if (body.audio?.dataUrl) {
      if (!mimeFromDataUrl(body.audio.dataUrl).startsWith('audio/')) return sendError(res, 400, 'Story audio must be an audio file.');
      audioFile = await saveUpload(body.audio, user.id, 'story-audio');
    }
    const audioStart = Math.max(0, Number(body.edits?.audioStart || 0));
    const audioEnd = Math.min(Math.max(audioStart, Number(body.edits?.audioEnd || audioStart + 30)), audioStart + 30);
    const story = {
      id: id('story'),
      ownerId: user.id,
      fileId: file.id,
      audioFileId: audioFile?.id || null,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      saved: false,
      edits: {
        compositionVersion: Number(body.edits?.compositionVersion) >= 2 ? 2 : 1,
        filter: ['normal', 'warm', 'cool', 'mono', 'noir'].includes(body.edits?.filter) ? body.edits.filter : 'normal',
        text: cleanText(body.edits?.text || '', 120),
        zoom: Math.max(1, Math.min(3, Number(body.edits?.zoom || 1))),
        textX: Math.max(5, Math.min(95, Number(body.edits?.textX || 50))),
        textY: Math.max(5, Math.min(95, Number(body.edits?.textY || 50))),
        textRotation: Math.max(-180, Math.min(180, Number(body.edits?.textRotation || 0))),
        textColor: /^#[0-9a-f]{6}$/i.test(String(body.edits?.textColor || '')) ? body.edits.textColor : '#ffffff',
        textFont: ['system', 'serif', 'mono', 'script'].includes(body.edits?.textFont) ? body.edits.textFont : 'system',
        textSize: Math.max(22, Math.min(96, Number(body.edits?.textSize || 44))),
        textAlign: ['left', 'center', 'right'].includes(body.edits?.textAlign) ? body.edits.textAlign : 'center',
        textEffect: ['none', 'shadow', 'glow', 'neon'].includes(body.edits?.textEffect) ? body.edits.textEffect : 'shadow',
        textAnimation: ['none', 'fade', 'rise', 'pop'].includes(body.edits?.textAnimation) ? body.edits.textAnimation : 'none',
        textBgEnabled: Boolean(body.edits?.textBgEnabled),
        textBgColor: /^#[0-9a-f]{6}$/i.test(String(body.edits?.textBgColor || '')) ? body.edits.textBgColor : '#000000',
        textFrame: Boolean(body.edits?.textFrame),
        drawings: cleanStoryDrawings(body.edits?.drawings),
        stickers: cleanStoryStickers(body.edits?.stickers),
        pollQuestion: cleanText(body.edits?.pollQuestion || '', 80),
        pollOptionA: cleanText(body.edits?.pollOptionA || 'Yes', 40),
        pollOptionB: cleanText(body.edits?.pollOptionB || 'No', 40),
        audioStart,
        audioEnd,
        trimStart: Math.max(0, Number(body.edits?.trimStart || 0)),
        trimEnd: Math.max(0, Number(body.edits?.trimEnd || 0))
      },
      views: [],
      likes: [],
      comments: [],
      deletedAt: null
    };
    db.stories[story.id] = story;
    const mentionText = [
      story.edits.text,
      story.edits.pollQuestion,
      ...story.edits.stickers.map((sticker) => sticker.label)
    ].join(' ');
    notifyMentions(user, mentionText, 'in a story');
    await Promise.all([saveStories(), saveNotifications()]);
    return sendJson(res, 201, { story: publicStory(story, user.id), user: publicUser(user, user.id) });
  }

  const storySaveMatch = /^\/api\/stories\/([^/]+)\/save$/.exec(pathname);
  if (req.method === 'POST' && storySaveMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storySaveMatch[1])];
    if (!story || story.ownerId !== user.id) return sendError(res, 404, 'Story not found.');
    story.saved = true;
    story.expiresAt = null;
    await saveStories();
    return sendJson(res, 200, { story: publicStory(story, user.id), user: publicUser(user, user.id) });
  }

  const storyViewMatch = /^\/api\/stories\/([^/]+)\/view$/.exec(pathname);
  if (req.method === 'POST' && storyViewMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyViewMatch[1])];
    if (!canViewStory(story, user.id)) return sendError(res, 404, 'Story not found.');
    if (!Array.isArray(story.views)) story.views = [];
    if (story.ownerId !== user.id && !story.views.includes(user.id)) story.views.push(user.id);
    await saveStories();
    return sendJson(res, 200, { story: publicStory(story, user.id) });
  }

  const storyLikeMatch = /^\/api\/stories\/([^/]+)\/like$/.exec(pathname);
  if (req.method === 'POST' && storyLikeMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyLikeMatch[1])];
    if (!canViewStory(story, user.id)) return sendError(res, 404, 'Story not found.');
    if (!Array.isArray(story.likes)) story.likes = [];
    if (story.likes.includes(user.id)) story.likes = story.likes.filter((id) => id !== user.id);
    else story.likes.push(user.id);
    await saveStories();
    return sendJson(res, 200, { story: publicStory(story, user.id) });
  }

  const storyCommentMatch = /^\/api\/stories\/([^/]+)\/comments$/.exec(pathname);
  if (req.method === 'POST' && storyCommentMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyCommentMatch[1])];
    if (!canViewStory(story, user.id)) return sendError(res, 404, 'Story not found.');
    const body = await readJsonBody(req);
    const text = cleanText(body.text || '', 280);
    if (!text) return sendError(res, 400, 'Write a comment first.');
    if (!Array.isArray(story.comments)) story.comments = [];
    story.comments.push({
      id: id('comment'),
      userId: user.id,
      text,
      createdAt: nowIso()
    });
    story.comments = story.comments.slice(-200);
    notifyMentions(user, text, 'in a story comment');
    await Promise.all([saveStories(), saveNotifications()]);
    return sendJson(res, 201, { story: publicStory(story, user.id) });
  }

  const storyDeleteMatch = /^\/api\/stories\/([^/]+)$/.exec(pathname);
  if (req.method === 'DELETE' && storyDeleteMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyDeleteMatch[1])];
    if (!story || story.ownerId !== user.id) return sendError(res, 404, 'Story not found.');
    story.deletedAt = nowIso();
    await saveStories();
    return sendJson(res, 200, { ok: true, user: publicUser(user, user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/2fa/setup') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const secret = base32Encode(crypto.randomBytes(20));
    user.twoFactor.pendingSecret = secret;
    await saveUsers();
    const issuer = encodeURIComponent('Messages');
    const account = encodeURIComponent(user.email || user.username);
    return sendJson(res, 200, {
      secret,
      otpauth: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30`
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/2fa/enable') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const secret = user.twoFactor?.pendingSecret;
    if (!secret || !verifyTotp(secret, body.code)) return sendError(res, 400, 'The code did not match.');
    user.twoFactor.enabled = true;
    user.twoFactor.secret = secret;
    user.twoFactor.pendingSecret = null;
    await saveUsers();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/auth/2fa/disable') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    if (user.twoFactor?.enabled && !verifyTotp(user.twoFactor.secret, body.code)) {
      return sendError(res, 400, 'The code did not match.');
    }
    user.twoFactor = { enabled: false, secret: null, pendingSecret: null };
    await saveUsers();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/users/search') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const q = cleanText(query.get('q') || '', 80).trim().toLowerCase();
    if (q.length < 2) return sendJson(res, 200, { users: [] });
    const users = Object.values(db.users)
      .filter((item) => item.id !== user.id)
      .filter((item) => item.profile?.searchable !== false)
      .filter((item) => !isBlockedBetween(user.id, item.id))
      .map((item) => {
        const username = item.usernameLower;
        const displayName = (item.profile.displayName || '').toLowerCase();
        let rank = 99;
        if (username === q) rank = 0;
        else if (displayName === q) rank = 1;
        else if (username.startsWith(q)) rank = 2;
        else if (displayName.startsWith(q)) rank = 3;
        else if (username.includes(q)) rank = 4;
        else if (displayName.includes(q)) rank = 5;
        return { item, rank };
      })
      .filter(({ rank }) => rank < 99)
      .sort((a, b) => a.rank - b.rank || a.item.usernameLower.localeCompare(b.item.usernameLower))
      .slice(0, 12)
      .map(({ item }) => publicUser(item, user.id));
    return sendJson(res, 200, { users });
  }

  if (req.method === 'GET' && pathname === '/api/users/recommendations') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const direct = new Set(db.contacts[user.id] || []);
    const candidates = new Map();
    for (const friendId of direct) {
      for (const candidateId of db.contacts[friendId] || []) {
        if (candidateId === user.id || direct.has(candidateId) || hasBlocked(user.id, candidateId) || hasBlocked(candidateId, user.id)) continue;
        if (db.users[candidateId]?.profile?.searchable === false) continue;
        candidates.set(candidateId, (candidates.get(candidateId) || 0) + 1);
      }
    }
    for (const candidate of Object.values(db.users)) {
      if (candidates.size >= 12) break;
      if (candidate.id === user.id || direct.has(candidate.id) || isBlockedBetween(user.id, candidate.id)) continue;
      if (candidate.profile?.searchable === false) continue;
      candidates.set(candidate.id, candidates.get(candidate.id) || 0);
    }
    const users = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1] || db.users[a[0]].usernameLower.localeCompare(db.users[b[0]].usernameLower))
      .slice(0, 12)
      .map(([candidateId, mutualCount]) => {
        const candidate = publicUser(db.users[candidateId], user.id);
        return candidate ? { ...candidate, mutualCount } : null;
      })
      .filter(Boolean);
    return sendJson(res, 200, { users });
  }

  const publicUserMatch = /^\/api\/users\/([^/]+)$/.exec(pathname);
  if (req.method === 'GET' && publicUserMatch) {
    const viewer = sessionFromRequest(req)?.user || null;
    const found = userByUsername(decodeURIComponent(publicUserMatch[1]));
    if (!found) return sendError(res, 404, 'User not found.');
    return sendJson(res, 200, { user: publicUser(found, viewer?.id || null) });
  }

  const contactMatch = /^\/api\/contacts\/([^/]+)$/.exec(pathname);
  if (req.method === 'POST' && contactMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const other = userByUsername(decodeURIComponent(contactMatch[1]));
    if (!other) return sendError(res, 404, 'User not found.');
    if (other.id === user.id) return sendError(res, 400, 'You cannot add yourself.');
    if (hasBlocked(user.id, other.id) || hasBlocked(other.id, user.id)) return sendError(res, 403, 'This user cannot be added right now.');
    if ((db.contacts[user.id] || []).includes(other.id)) return sendJson(res, 200, { user: publicUser(other, user.id), alreadyFriends: true });

    const reverse = pendingRequestFromTo(other.id, user.id);
    if (reverse) {
      reverse.status = 'accepted';
      reverse.respondedAt = nowIso();
      addContact(user.id, other.id);
      const notification = addNotification(other.id, 'request_accepted', user.id, reverse.id, `${user.username} accepted your request.`);
      await Promise.all([saveFriendRequests(), saveContacts(), saveNotifications()]);
      if (notification) {
        pushToUser(other.id, {
          type: 'notification:new',
          pendingRequestCount: pendingIncomingRequests(other.id).length,
          notification: publicNotification(notification, other.id)
        });
      }
      pushToUsers([user.id, other.id], { type: 'relationship:updated', pendingRequestCount: pendingIncomingRequests(other.id).length });
      return sendJson(res, 200, { user: publicUser(other, user.id), request: publicRequest(reverse, user.id), accepted: true });
    }

    const existing = requestBetween(user.id, other.id, 'pending');
    if (existing) return sendJson(res, 200, { user: publicUser(other, user.id), request: publicRequest(existing, user.id), pending: true });

    const request = {
      id: id('req'),
      fromId: user.id,
      toId: other.id,
      status: 'pending',
      createdAt: nowIso(),
      respondedAt: null
    };
    db.friendRequests[request.id] = request;
    addNotification(other.id, 'friend_request', user.id, request.id, `${user.username} sent you a friend request.`);
    await Promise.all([saveFriendRequests(), saveNotifications()]);
    pushToUser(other.id, {
      type: 'notification:new',
      pendingRequestCount: pendingIncomingRequests(other.id).length,
      request: publicRequest(request, other.id)
    });
    return sendJson(res, 201, { user: publicUser(other, user.id), request: publicRequest(request, user.id), pending: true });
  }

  if (req.method === 'DELETE' && contactMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(contactMatch[1])] || userByUsername(decodeURIComponent(contactMatch[1]));
    if (!peer || peer.id === user.id) return sendError(res, 404, 'User not found.');
    removeContact(user.id, peer.id);
    await saveContacts();
    pushToUsers([user.id, peer.id], { type: 'relationship:updated' });
    return sendJson(res, 200, { ok: true, user: publicUser(peer, user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/notifications') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const incoming = pendingIncomingRequests(user.id).map((request) => publicRequest(request, user.id));
    const notifications = (db.notifications[user.id] || [])
      .slice(0, 40)
      .map((notification) => publicNotification(notification, user.id));
    return sendJson(res, 200, {
      pendingRequestCount: incoming.length,
      requests: incoming,
      notifications
    });
  }

  const requestActionMatch = /^\/api\/requests\/([^/]+)\/(accept|decline)$/.exec(pathname);
  if (req.method === 'POST' && requestActionMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const request = db.friendRequests[decodeURIComponent(requestActionMatch[1])];
    if (!request || request.toId !== user.id || request.status !== 'pending') return sendError(res, 404, 'Request not found.');
    const action = requestActionMatch[2];
    request.status = action === 'accept' ? 'accepted' : 'declined';
    request.respondedAt = nowIso();
    let responseNotification = null;
    if (action === 'accept') {
      addContact(request.fromId, request.toId);
      responseNotification = addNotification(request.fromId, 'request_accepted', user.id, request.id, `${user.username} accepted your request.`);
      await Promise.all([saveFriendRequests(), saveContacts(), saveNotifications()]);
    } else {
      addNotification(request.fromId, 'request_declined', user.id, request.id, `${user.username} declined your request.`);
      await Promise.all([saveFriendRequests(), saveNotifications()]);
    }
    if (responseNotification) {
      pushToUser(request.fromId, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(request.fromId).length,
        notification: publicNotification(responseNotification, request.fromId)
      });
    }
    pushToUsers([request.fromId, request.toId], {
      type: 'relationship:updated',
      pendingRequestCount: pendingIncomingRequests(user.id).length,
      request: publicRequest(request, user.id)
    });
    return sendJson(res, 200, { request: publicRequest(request, user.id), pendingRequestCount: pendingIncomingRequests(user.id).length });
  }

  const blockMatch = /^\/api\/blocks\/([^/]+)$/.exec(pathname);
  if ((req.method === 'POST' || req.method === 'DELETE') && blockMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(blockMatch[1])] || userByUsername(decodeURIComponent(blockMatch[1]));
    if (!peer || peer.id === user.id) return sendError(res, 404, 'User not found.');
    const list = ensureObjectList(db.blocks, user.id);
    if (req.method === 'POST' && !list.includes(peer.id)) list.push(peer.id);
    if (req.method === 'DELETE') db.blocks[user.id] = list.filter((id) => id !== peer.id);
    await saveBlocks();
    pushToUsers([user.id, peer.id], { type: 'relationship:updated' });
    return sendJson(res, 200, { user: publicUser(peer, user.id) });
  }

  const muteMatch = /^\/api\/mutes\/([^/]+)$/.exec(pathname);
  if ((req.method === 'POST' || req.method === 'DELETE') && muteMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(muteMatch[1])] || userByUsername(decodeURIComponent(muteMatch[1]));
    if (!peer || peer.id === user.id) return sendError(res, 404, 'User not found.');
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const minutes = body.minutes === null ? null : Number(body.minutes || 0);
      const until = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
      setMute(user.id, peer.id, until);
    } else {
      clearMute(user.id, peer.id);
    }
    await saveMutes();
    return sendJson(res, 200, { user: publicUser(peer, user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/contacts') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const users = (db.contacts[user.id] || [])
      .map((contactId) => db.users[contactId])
      .filter(Boolean)
      .map((item) => publicUser(item, user.id));
    return sendJson(res, 200, { users });
  }

  if (req.method === 'GET' && pathname === '/api/chats/search') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const term = cleanText(query.get('q') || '', 160).toLowerCase();
    if (!term) return sendJson(res, 200, { results: [] });
    const results = [];
    for (const peerId of db.contacts[user.id] || []) {
      const peer = db.users[peerId];
      if (!peer || !canViewChat(user.id, peer.id)) continue;
      const chatId = chatIdFor(user.id, peer.id);
      for (const message of db.messages[chatId] || []) {
        if ((message.hiddenFor || []).includes(user.id)) continue;
        if (!messageSearchText(message).toLowerCase().includes(term)) continue;
        results.push({
          chatId,
          peer: publicUser(peer, user.id),
          sender: basicPublicUser(db.users[message.senderId]),
          message: decorateMessage(message),
          snippet: messageSnippet(message)
        });
      }
    }
    results.sort((a, b) => String(b.message.createdAt || '').localeCompare(String(a.message.createdAt || '')));
    return sendJson(res, 200, { results: results.slice(0, 80) });
  }

  if (req.method === 'GET' && pathname === '/api/chats') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const chats = (db.contacts[user.id] || [])
      .map((peerId) => {
        const peer = db.users[peerId];
        if (!peer) return null;
        const chatId = chatIdFor(user.id, peerId);
        const latest = latestVisibleMessage(db.messages[chatId] || [], user.id);
        return {
          id: chatId,
          peer: publicUser(peer, user.id),
          latest: latest ? decorateMessage(latest) : null
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.latest?.createdAt || '').localeCompare(String(a.latest?.createdAt || '')));
    return sendJson(res, 200, { chats });
  }

  const exportMatch = /^\/api\/chats\/([^/]+)\/export$/.exec(pathname);
  if (req.method === 'GET' && exportMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(exportMatch[1])];
    if (!peer || !canViewChat(user.id, peer.id)) return sendError(res, 404, 'Chat not found.');
    const chatId = chatIdFor(user.id, peer.id);
    const messages = (db.messages[chatId] || [])
      .filter((message) => !(message.hiddenFor || []).includes(user.id))
      .map(decorateMessage);
    const created = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `chat-${peer.username}-${created}`;
    const format = query.get('format') === 'html' ? 'html' : 'json';
    if (format === 'html') {
      const rows = messages.map((message) => {
        const sender = db.users[message.senderId];
        const meta = `${new Date(message.createdAt).toLocaleString()} | ${sender?.username || message.senderId} | ${message.kind}`;
        const content = message.deletedAt
          ? '<em>Message deleted</em>'
          : `${escapeHtml(message.text || '')}${message.attachment ? `<br><a href="${escapeHtml(message.attachment.downloadUrl)}">${escapeHtml(message.attachment.name)}</a>` : ''}`;
        return `<article><small>${escapeHtml(meta)}</small><p>${content}</p></article>`;
      }).join('\n');
      const html = `<!doctype html><meta charset="utf-8"><title>Chat export</title><style>body{font:16px system-ui;background:#05070b;color:#f4f7fb;padding:24px}article{border-bottom:1px solid #263241;padding:12px 0}small{color:#8996a7}a{color:#4fd2c2}</style><h1>Chat with ${escapeHtml(peer.username)}</h1>${rows}`;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.html"`
      });
      return res.end(html);
    }
    const payload = {
      exportedAt: nowIso(),
      viewer: publicUser(user, user.id),
      peer: publicUser(peer, user.id),
      messages
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${baseName}.json"`
    });
    return res.end(JSON.stringify(payload, null, 2));
  }

  const messageListMatch = /^\/api\/chats\/([^/]+)\/messages$/.exec(pathname);
  if (req.method === 'GET' && messageListMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(messageListMatch[1])];
    if (!peer || !canViewChat(user.id, peer.id)) return sendError(res, 404, 'Chat not found.');
    const chatId = chatIdFor(user.id, peer.id);
    const limit = Math.max(1, Math.min(500, Number(query.get('limit') || 200)));
    const before = String(query.get('before') || '');
    let visible = (db.messages[chatId] || [])
      .filter((message) => !(message.hiddenFor || []).includes(user.id))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (before) visible = visible.filter((message) => String(message.createdAt) < before);
    const hasMore = visible.length > limit;
    const page = visible.slice(Math.max(0, visible.length - limit)).map(decorateMessage);
    return sendJson(res, 200, { messages: page, hasMore, peer: publicUser(peer, user.id) });
  }

  if (req.method === 'POST' && messageListMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(messageListMatch[1])];
    if (!peer || !canViewChat(user.id, peer.id)) return sendError(res, 404, 'Chat not found. Add the user first.');
    if (!canChat(user.id, peer.id)) return sendError(res, 403, 'Messaging is blocked until this user is unblocked.');
    const body = await readJsonBody(req);
    const chatId = chatIdFor(user.id, peer.id);
    const list = ensureChatMessages(chatId);
    const kind = ['text', 'image', 'video', 'document', 'voice', 'sticker'].includes(body.kind) ? body.kind : 'text';
    const text = cleanText(body.text || '', kind === 'text' ? 4000 : 500);
    if (kind === 'text' && !text) return sendError(res, 400, 'Message cannot be empty.');

    let file = null;
    if (body.file?.dataUrl) {
      const incomingMime = mimeFromDataUrl(body.file.dataUrl);
      if (kind === 'image' && !incomingMime.startsWith('image/')) return sendError(res, 400, 'That file is not an image.');
      if (kind === 'video' && !incomingMime.startsWith('video/')) return sendError(res, 400, 'That file is not a video.');
      if (kind === 'voice' && !incomingMime.startsWith('audio/')) return sendError(res, 400, 'That file is not audio.');
      file = await saveUpload(body.file, user.id, kind);
    }
    if (['image', 'video', 'document', 'voice', 'sticker'].includes(kind) && !file) {
      return sendError(res, 400, 'This message type needs a file.');
    }

    const replyTo = body.replyTo && list.some((message) => message.id === body.replyTo) ? body.replyTo : null;
    const message = {
      id: id('msg'),
      chatId,
      senderId: user.id,
      recipientId: peer.id,
      kind,
      text,
      replyTo,
      attachment: file ? {
        id: file.id,
        name: file.originalName,
        mime: file.mime,
        size: file.size
      } : null,
      stickerId: kind === 'sticker' ? cleanText(body.stickerId || file?.id || '', 120) : null,
      hiddenFor: [],
      createdAt: nowIso(),
      deletedAt: null,
      deletedBy: null
    };
    if (file) {
      file.messageId = message.id;
      await saveFiles();
    }
    list.push(message);
    const decorated = decorateMessage(message);
    const notification = addNotification(peer.id, 'message', user.id, null, `${user.username}: ${messageSnippet(message)}`);
    await Promise.all([saveMessages(), saveNotifications()]);
    pushToUsers([user.id, peer.id], { type: 'message:new', chatId, message: decorated });
    if (notification) {
      pushToUser(peer.id, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(peer.id).length,
        notification: publicNotification(notification, peer.id)
      });
    }
    return sendJson(res, 201, { message: decorated });
  }

  if (req.method === 'POST' && pathname === '/api/reports') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const targetType = body.targetType === 'message' ? 'message' : 'user';
    const reason = cleanText(body.reason || '', 140);
    if (!reportReasonsSet.has(reason)) return sendError(res, 400, 'Choose a valid report reason.');

    let reportedUser = null;
    let reportedMessage = null;
    let reportedChatId = null;

    if (targetType === 'message') {
      const found = findMessage(cleanText(body.messageId || '', 120));
      if (!found) return sendError(res, 404, 'Message not found.');
      const { chatId, message } = found;
      if (message.senderId !== user.id && message.recipientId !== user.id) return sendError(res, 404, 'Message not found.');
      reportedChatId = chatId;
      reportedMessage = message;
      reportedUser = db.users[message.senderId === user.id ? message.recipientId : message.senderId];
    } else {
      reportedUser = db.users[cleanText(body.reportedUserId || '', 120)] || userByUsername(body.reportedUserId);
      if (!reportedUser) return sendError(res, 404, 'User not found.');
      if (reportedUser.id === user.id) return sendError(res, 400, 'You cannot report yourself.');
    }

    const report = {
      id: id('report'),
      targetType,
      reason,
      createdAt: nowIso(),
      reporter: reportUserSnapshot(user),
      reportedUser: reportUserSnapshot(reportedUser),
      message: reportMessageSnapshot(reportedMessage, reportedChatId),
      requestNetwork: requestNetworkInfo(req),
      email: {
        attemptedAt: null,
        to: REPORT_EMAIL,
        sent: false,
        reason: 'not attempted'
      }
    };

    if (!Array.isArray(db.reports)) db.reports = [];
    db.reports.unshift(report);
    db.reports = db.reports.slice(0, 1000);
    await saveReports();

    const emailResult = await sendReportEmail(report).catch((error) => ({ sent: false, reason: error.message }));
    report.email = {
      attemptedAt: nowIso(),
      to: REPORT_EMAIL,
      sent: Boolean(emailResult.sent),
      reason: emailResult.reason || ''
    };
    await saveReports();
    return sendJson(res, 201, { ok: true, reportId: report.id, emailSent: report.email.sent });
  }

  const deleteMessageMatch = /^\/api\/messages\/([^/]+)$/.exec(pathname);
  if (req.method === 'DELETE' && deleteMessageMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(deleteMessageMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const { chatId, message } = found;
    if (message.senderId !== user.id) return sendError(res, 403, 'Only the sender can delete this message.');
    message.deletedAt = message.deletedAt || nowIso();
    message.deletedBy = user.id;
    await saveMessages();
    pushToUsers(participantsForChatId(chatId), { type: 'message:deleted', chatId, messageId: message.id, deletedAt: message.deletedAt, deletedBy: user.id });
    return sendJson(res, 200, { ok: true });
  }

  const fileDownloadMatch = /^\/api\/files\/([^/]+)\/download$/.exec(pathname);
  if (req.method === 'GET' && fileDownloadMatch) {
    const auth = sessionFromRequest(req);
    const file = db.files[decodeURIComponent(fileDownloadMatch[1])];
    if (!canAccessFile(auth?.user?.id || null, file)) return sendError(res, 404, 'File not found.');
    const inline = query.get('inline') === '1';
    res.writeHead(200, {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Length': file.size,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`,
      'X-Chat-Uploaded-At': file.uploadedAt,
      'X-Chat-Original-Last-Modified': file.originalLastModified || ''
    });
    return fs.createReadStream(file.diskPath).pipe(res);
  }

  const fileMetaMatch = /^\/api\/files\/([^/]+)\/meta$/.exec(pathname);
  if (req.method === 'GET' && fileMetaMatch) {
    const auth = sessionFromRequest(req);
    const file = db.files[decodeURIComponent(fileMetaMatch[1])];
    if (!canAccessFile(auth?.user?.id || null, file)) return sendError(res, 404, 'File not found.');
    const found = file.messageId ? findMessage(file.messageId)?.message : null;
    return sendJson(res, 200, {
      id: file.id,
      name: file.originalName,
      mime: file.mime,
      size: file.size,
      uploadedAt: file.uploadedAt,
      originalLastModified: file.originalLastModified,
      message: found ? {
        id: found.id,
        kind: found.kind,
        sentAt: found.createdAt,
        sender: publicUser(db.users[found.senderId]),
        recipient: publicUser(db.users[found.recipientId])
      } : null
    });
  }

  return sendError(res, 404, 'API route not found.');
}

function serveStatic(req, res, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch {
    requested = '/';
  }
  if (requested === '/') requested = '/index.html';
  const safePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(PUBLIC_DIR, 'index.html'))
        .on('error', () => {
          res.writeHead(404);
          res.end('Not found');
        })
        .pipe(res);
    }
    const ext = path.extname(safePath).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && parsed.pathname === '/health') {
      return sendJson(res, 200, { ok: true, time: nowIso() });
    }
    if (parsed.pathname.startsWith('/api/')) {
      await handleApi(req, res, parsed.pathname, parsed.searchParams);
      return;
    }
    serveStatic(req, res, parsed.pathname);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    sendError(res, error.status || 500, error.status ? error.message : 'Server error.');
    if (!error.status) console.error(error);
  }
});

server.on('upgrade', (req, socket) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsed.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const auth = sessionFromRequest(req);
  if (!auth) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const client = { socket, userId: auth.user.id, buffer: Buffer.alloc(0) };
  if (!socketsByUser.has(auth.user.id)) socketsByUser.set(auth.user.id, new Set());
  socketsByUser.get(auth.user.id).add(client);
  pushToUser(auth.user.id, { type: 'socket:ready', userId: auth.user.id });
  broadcastPresence(auth.user.id, true);

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    let frame;
    while ((frame = extractFrame(client.buffer))) {
      client.buffer = client.buffer.slice(frame.consumed);
      handleWsFrame(client, frame);
    }
  });
  socket.on('close', () => cleanupSocket(client));
  socket.on('error', () => cleanupSocket(client));
});

function cleanupSocket(client) {
  const set = socketsByUser.get(client.userId);
  if (set) {
    set.delete(client);
    if (!set.size) {
      socketsByUser.delete(client.userId);
      broadcastPresence(client.userId, false);
    }
  }
}

function extractFrame(buffer) {
  if (buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    length = Number(bigLength);
    offset += 8;
  }
  const maskLength = masked ? 4 : 0;
  if (buffer.length < offset + maskLength + length) return null;
  const mask = masked ? buffer.slice(offset, offset + 4) : null;
  offset += maskLength;
  const payload = Buffer.from(buffer.slice(offset, offset + length));
  if (mask) {
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
  }
  return { opcode, payload, consumed: offset + length };
}

function handleWsFrame(client, frame) {
  if (frame.opcode === 0x8) {
    client.socket.end();
    cleanupSocket(client);
    return;
  }
  if (frame.opcode === 0x9) {
    wsWrite(client.socket, frame.payload, 0xA);
    return;
  }
  if (frame.opcode !== 0x1) return;
  let message;
  try {
    message = JSON.parse(frame.payload.toString('utf8'));
  } catch {
    return;
  }
  if (message.type === 'typing' && canChat(client.userId, message.to)) {
    pushToUser(message.to, { type: 'typing', from: client.userId, isTyping: Boolean(message.isTyping) });
  }
  if (message.type === 'signal' && canChat(client.userId, message.to)) {
    pushToUser(message.to, { type: 'signal', from: client.userId, payload: message.payload });
  }
}

function wsWrite(socket, payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  socket.write(Buffer.concat([header, body]));
}

function pushToUser(userId, event) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const client of set) {
    try {
      wsWrite(client.socket, payload);
    } catch {
      cleanupSocket(client);
    }
  }
}

function pushToUsers(userIds, event) {
  for (const userId of new Set(userIds.filter(Boolean))) pushToUser(userId, event);
}

function broadcastPresence(userId, online) {
  for (const contactId of db.contacts[userId] || []) {
    pushToUser(contactId, { type: 'presence', userId, online });
  }
}

server.listen(PORT, () => {
  console.log(`Chat app is running at http://localhost:${PORT}`);
});
