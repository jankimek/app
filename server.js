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
const MAIL_FROM = process.env.MAIL_FROM || 'New Around <no-reply@newaround.local>';
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
const DISPLAY_NAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const NOTE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const GOOGLE_WEATHER_API_KEY = String(process.env.GOOGLE_WEATHER_API_KEY || '').trim();
const MODERATOR_USERNAMES = String(process.env.MODERATOR_USERNAMES || '')
  .split(',')
  .map((value) => normalizeUsername(value))
  .filter(Boolean);
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
const MESSAGE_REACTIONS = new Set([
  '\u2764\ufe0f',
  '\ud83d\ude02',
  '\ud83d\ude2e',
  '\ud83d\ude22',
  '\ud83d\ude21',
  '\ud83d\udd25'
]);
const followsFileExists = fs.existsSync(path.join(DATA_DIR, 'follows.json'));

for (const dir of [PUBLIC_DIR, DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = {
  users: readJson('users.json', {}),
  sessions: readJson('sessions.json', {}),
  contacts: readJson('contacts.json', {}),
  follows: readJson('follows.json', {}),
  chatSettings: readJson('chatSettings.json', {}),
  groups: readJson('groups.json', {}),
  messages: readJson('messages.json', {}),
  files: readJson('files.json', {}),
  friendRequests: readJson('friendRequests.json', {}),
  notifications: readJson('notifications.json', {}),
  blocks: readJson('blocks.json', {}),
  mutes: readJson('mutes.json', {}),
  stories: readJson('stories.json', {}),
  posts: readJson('posts.json', {}),
  notes: readJson('notes.json', {}),
  emailVerifications: readJson('emailVerifications.json', {}),
  gifs: readJson('gifs.json', {}),
  reports: readJson('reports.json', []),
  userMeta: readJson('userMeta.json', {})
};

if (!followsFileExists) {
  for (const [userId, contacts] of Object.entries(db.contacts)) {
    db.follows[userId] = Array.from(new Set((contacts || []).filter((contactId) => db.users[contactId])));
  }
  fs.writeFileSync(path.join(DATA_DIR, 'follows.json'), JSON.stringify(db.follows, null, 2));
}

const socketsByUser = new Map();

function readJson(fileName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
  } catch {
    return fallback;
  }
}

const jsonSaveStates = new Map();

async function flushJsonSaves(fileName, state) {
  if (state.writing) return;
  state.writing = true;
  const finalPath = path.join(DATA_DIR, fileName);
  while (state.pendingSnapshot !== null) {
    const snapshot = state.pendingSnapshot;
    const resolveBatch = state.resolvePending;
    const rejectBatch = state.rejectPending;
    state.pendingSnapshot = null;
    state.pendingPromise = null;
    state.resolvePending = null;
    state.rejectPending = null;
    const tempPath = `${finalPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      await fsp.writeFile(tempPath, snapshot);
      await fsp.rename(tempPath, finalPath);
      resolveBatch();
    } catch (error) {
      rejectBatch(error);
    } finally {
      await fsp.unlink(tempPath).catch(() => {});
    }
  }
  state.writing = false;
  if (state.pendingSnapshot !== null) {
    void flushJsonSaves(fileName, state);
  } else if (jsonSaveStates.get(fileName) === state) {
    jsonSaveStates.delete(fileName);
  }
}

function saveJson(fileName, data) {
  const snapshot = JSON.stringify(data, null, 2);
  let state = jsonSaveStates.get(fileName);
  if (!state) {
    state = {
      writing: false,
      pendingSnapshot: null,
      pendingPromise: null,
      resolvePending: null,
      rejectPending: null
    };
    jsonSaveStates.set(fileName, state);
  }
  state.pendingSnapshot = snapshot;
  if (!state.pendingPromise) {
    state.pendingPromise = new Promise((resolve, reject) => {
      state.resolvePending = resolve;
      state.rejectPending = reject;
    });
  }
  const pending = state.pendingPromise;
  void flushJsonSaves(fileName, state);
  return pending;
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

function saveFollows() {
  return saveJson('follows.json', db.follows);
}

function saveChatSettings() {
  return saveJson('chatSettings.json', db.chatSettings);
}

function saveGroups() {
  return saveJson('groups.json', db.groups);
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

function savePosts() {
  return saveJson('posts.json', db.posts);
}

function saveNotes() {
  return saveJson('notes.json', db.notes);
}

function saveEmailVerifications() {
  return saveJson('emailVerifications.json', db.emailVerifications);
}

function saveGifs() {
  return saveJson('gifs.json', db.gifs);
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

function moderatorUserIds() {
  const users = Object.values(db.users);
  if (MODERATOR_USERNAMES.length) {
    return users.filter((user) => MODERATOR_USERNAMES.includes(user.usernameLower)).map((user) => user.id);
  }
  const owner = users.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  return owner ? [owner.id] : [];
}

function isModerator(userId) {
  return Boolean(userId && moderatorUserIds().includes(userId));
}

function publicGif(gif, viewerId) {
  if (!gif) return null;
  return {
    id: gif.id,
    title: gif.title,
    tags: gif.tags || [],
    status: gif.status,
    createdAt: gif.createdAt,
    reviewedAt: gif.reviewedAt || null,
    submittedByMe: gif.submitterId === viewerId,
    submitter: isModerator(viewerId) ? storyActor(db.users[gif.submitterId]) : null,
    file: publicFile(db.files[gif.fileId])
  };
}

function basicPublicUser(user, viewerId = null) {
  if (!user) return null;
  const avatar = user.profile.avatarFileId ? db.files[user.profile.avatarFileId] : null;
  const canSeeStories = canViewStories(user.id, viewerId);
  const isOwner = viewerId === user.id;
  const profile = user.profile || {};
  const displayNameChangedTime = new Date(profile.displayNameChangedAt || 0).getTime();
  const nextDisplayNameChangeAt = Number.isFinite(displayNameChangedTime) && displayNameChangedTime > 0
    ? new Date(displayNameChangedTime + DISPLAY_NAME_COOLDOWN_MS).toISOString()
    : null;
  return {
    id: user.id,
    username: user.username,
    tagUsername: user.username,
    displayName: profile.displayName || user.username,
    bio: isOwner || profile.bioVisible !== false ? (profile.bio || '') : '',
    website: profile.website && (isOwner || profile.websiteVisible !== false) ? profile.website : '',
    age: profile.age != null && (isOwner || profile.ageVisible === true) ? profile.age : null,
    gender: profile.gender && (isOwner || profile.genderVisible === true) ? profile.gender : '',
    avatar: publicFile(avatar),
    stories: canSeeStories
      ? activeStoriesFor(user.id).map((story) => publicStory(story, viewerId))
      : [],
    highlights: canSeeStories ? publicHighlightsFor(user, viewerId) : [],
    url: `/u/${encodeURIComponent(user.username)}`,
    createdAt: user.createdAt,
    socialPublic: profile.socialPublic !== false,
    searchable: profile.searchable !== false,
    recommendable: profile.recommendable !== false,
    avatarViewable: profile.avatarViewable !== false,
    postCount: activePostsFor(user.id).length,
    allowReposts: profile.allowReposts !== false,
    allowGroupAdds: isOwner ? profile.allowGroupAdds !== false : undefined,
    mentionPermission: isOwner ? (profile.mentionPermission || 'everyone') : undefined,
    storyReplies: isOwner ? (profile.storyReplies || 'everyone') : undefined,
    friendRequests: isOwner ? (profile.friendRequests || 'everyone') : undefined,
    websiteVisible: isOwner ? profile.websiteVisible !== false : undefined,
    bioVisible: isOwner ? profile.bioVisible !== false : undefined,
    ageVisible: isOwner ? profile.ageVisible === true : undefined,
    genderVisible: isOwner ? profile.genderVisible === true : undefined,
    favoriteUserIds: isOwner ? favoriteUserIdsFor(user) : undefined,
    isFavorite: Boolean(viewerId && favoriteUserIdsFor(db.users[viewerId]).includes(user.id)),
    displayNameChangedAt: isOwner ? (profile.displayNameChangedAt || null) : undefined,
    nextDisplayNameChangeAt: isOwner ? nextDisplayNameChangeAt : undefined,
    email: isOwner ? (user.email || '') : undefined,
    phone: isOwner ? (user.phone || '') : undefined,
    emailVerified: isOwner ? Boolean(user.emailVerified) : undefined,
    emailVerifiedAt: isOwner ? (user.emailVerifiedAt || null) : undefined,
    emailVerificationSentAt: isOwner ? (user.emailVerificationSentAt || null) : undefined,
    phoneVerified: isOwner ? Boolean(user.phoneVerified) : undefined,
    phoneVerifiedAt: isOwner ? (user.phoneVerifiedAt || null) : undefined
  };
}

function relationshipPublicUser(user, viewerId = null) {
  if (!user) return null;
  const relation = viewerId ? relationFor(viewerId, user.id) : {};
  return {
    ...basicPublicUser(user, viewerId),
    isContact: Boolean(viewerId && (db.contacts[viewerId] || []).includes(user.id)),
    isFollowing: Boolean(viewerId && isFollowing(viewerId, user.id)),
    followsViewer: Boolean(viewerId && isFollowing(user.id, viewerId)),
    ...relation
  };
}

function publicUser(user, viewerId = null) {
  if (!user) return null;
  const follow = followStatsFor(user, viewerId);
  return {
    ...relationshipPublicUser(user, viewerId),
    ...follow
  };
}

function followStatsFor(user, viewerId = null) {
  const followers = Object.keys(db.users).filter((id) => isFollowing(id, user.id));
  const following = Array.from(new Set(db.follows[user.id] || [])).filter((id) => db.users[id]);
  const visible = user.profile?.socialPublic !== false || viewerId === user.id || Boolean(viewerId && isFollowing(viewerId, user.id));
  return {
    socialPublic: user.profile?.socialPublic !== false,
    followersVisible: visible,
    followerCount: visible ? followers.length : null,
    followingCount: visible ? following.length : null,
    followers: visible ? followers.map((id) => relationshipPublicUser(db.users[id], viewerId)) : [],
    following: visible ? following.map((id) => relationshipPublicUser(db.users[id], viewerId)) : []
  };
}

function chatIdFor(a, b) {
  return [a, b].sort().join('__');
}

function ensureContactList(userId) {
  if (!db.contacts[userId]) db.contacts[userId] = [];
  return db.contacts[userId];
}

function ensureFollowList(userId) {
  if (!db.follows[userId]) db.follows[userId] = [];
  return db.follows[userId];
}

function isFollowing(userId, targetId) {
  return (db.follows[userId] || []).includes(targetId);
}

const CHAT_THEMES = new Set(['midnight', 'dusk', 'ocean', 'aurora', 'graphite', 'rose', 'custom']);
const CHAT_BACKGROUNDS = new Set(['midnight', 'dusk', 'ocean', 'aurora', 'graphite', 'rose', 'plain', 'custom']);
const DEFAULT_CHAT_APPEARANCE = Object.freeze({
  theme: 'midnight',
  background: 'midnight',
  backgroundColor: '#070a12',
  mineColor: '#55339a',
  theirsColor: '#182131'
});

function cleanHexColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
}

function cleanChatAppearance(value = {}) {
  return {
    theme: CHAT_THEMES.has(value.theme) ? value.theme : DEFAULT_CHAT_APPEARANCE.theme,
    background: CHAT_BACKGROUNDS.has(value.background) ? value.background : DEFAULT_CHAT_APPEARANCE.background,
    backgroundColor: cleanHexColor(value.backgroundColor, DEFAULT_CHAT_APPEARANCE.backgroundColor),
    mineColor: cleanHexColor(value.mineColor, DEFAULT_CHAT_APPEARANCE.mineColor),
    theirsColor: cleanHexColor(value.theirsColor, DEFAULT_CHAT_APPEARANCE.theirsColor)
  };
}

function chatAppearanceFor(userId, peerId) {
  return cleanChatAppearance(db.chatSettings[userId]?.[peerId] || {});
}

function addFollow(userId, targetId) {
  if (userId === targetId || !db.users[userId] || !db.users[targetId]) return false;
  const list = ensureFollowList(userId);
  if (list.includes(targetId)) return false;
  list.push(targetId);
  return true;
}

function removeFollow(userId, targetId) {
  const before = (db.follows[userId] || []).length;
  db.follows[userId] = (db.follows[userId] || []).filter((id) => id !== targetId);
  return db.follows[userId].length !== before;
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

function addNotification(userId, type, actorId, requestId = null, text = '', data = {}) {
  const list = ensureObjectList(db.notifications, userId);
  if (requestId && list.some((item) => item.requestId === requestId && item.type === type)) return null;
  const notification = {
    id: id('note'),
    type,
    actorId,
    requestId,
    text,
    ...data,
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
    group: notification.groupId ? publicGroup(db.groups[notification.groupId], viewerId) : null,
    postId: notification.postId || null,
    commentId: notification.commentId || null,
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

function groupForMember(groupId, userId) {
  const group = db.groups[groupId];
  return group && (group.memberIds || []).includes(userId) ? group : null;
}

function isGroupAdmin(group, userId) {
  return Boolean(group && (group.ownerId === userId || (group.adminIds || []).includes(userId)));
}

function canAddGroupMembers(group, userId) {
  return Boolean(groupForMember(group?.id, userId) && (isGroupAdmin(group, userId) || group.membersCanAdd !== false));
}

function canFriendAddToGroup(inviterId, targetId) {
  const target = db.users[targetId];
  return Boolean(
    target &&
    target.profile?.allowGroupAdds !== false &&
    canViewChat(inviterId, targetId) &&
    !isBlockedBetween(inviterId, targetId)
  );
}

function publicGroup(group, viewerId) {
  if (!group || !(group.memberIds || []).includes(viewerId)) return null;
  const members = (group.memberIds || []).map((userId) => db.users[userId]).filter(Boolean);
  const avatar = group.avatarFileId ? db.files[group.avatarFileId] : null;
  return {
    id: group.id,
    name: group.name,
    avatar: publicFile(avatar),
    ownerId: group.ownerId,
    adminIds: (group.adminIds || []).filter((userId) => group.memberIds.includes(userId)),
    members: members.map((member) => basicPublicUser(member, viewerId)),
    memberCount: members.length,
    membersCanAdd: group.membersCanAdd !== false,
    isAdmin: isGroupAdmin(group, viewerId),
    canAddMembers: canAddGroupMembers(group, viewerId),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function canViewStories(ownerId, viewerId = null) {
  const owner = db.users[ownerId];
  if (!owner) return false;
  if (viewerId && viewerId !== ownerId && isBlockedBetween(ownerId, viewerId)) return false;
  if (owner.profile?.socialPublic !== false) return true;
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  return isFollowing(viewerId, ownerId);
}

function canViewStory(story, viewerId = null) {
  if (!story || story.deletedAt) return false;
  const active = story.saved || new Date(story.expiresAt).getTime() > Date.now();
  return Boolean(active && canViewStories(story.ownerId, viewerId));
}

function canReplyToStory(story, viewerId) {
  if (!story || !viewerId) return false;
  if (viewerId === story.ownerId) return true;
  const owner = db.users[story.ownerId];
  const setting = owner?.profile?.storyReplies || 'everyone';
  if (setting === 'off') return false;
  if (setting === 'following') return isFollowing(story.ownerId, viewerId);
  return true;
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

function favoriteUserIdsFor(user) {
  if (!user) return [];
  const values = Array.isArray(user.profile?.favoriteUserIds) ? user.profile.favoriteUserIds : [];
  return Array.from(new Set(values)).filter((userId) => userId !== user.id && db.users[userId]);
}

function activePostsFor(ownerId = null) {
  return Object.values(db.posts || {})
    .filter((post) => post && !post.deletedAt && (!ownerId || post.ownerId === ownerId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function canViewPostsBy(ownerId, viewerId = null) {
  const owner = db.users[ownerId];
  if (!owner) return false;
  if (viewerId && viewerId !== ownerId && isBlockedBetween(ownerId, viewerId)) return false;
  if (owner.profile?.socialPublic !== false) return true;
  return Boolean(viewerId && (viewerId === ownerId || isFollowing(viewerId, ownerId)));
}

function canViewPost(post, viewerId = null) {
  return Boolean(post && !post.deletedAt && canViewPostsBy(post.ownerId, viewerId));
}

function postRepostsAllowed(post) {
  const owner = post ? db.users[post.ownerId] : null;
  return Boolean(post && owner && post.allowReposts !== false && owner.profile?.allowReposts !== false);
}

function postActor(user, viewerId = null) {
  if (!user) return null;
  const avatar = user.profile?.avatarFileId ? db.files[user.profile.avatarFileId] : null;
  return {
    id: user.id,
    username: user.username,
    tagUsername: user.username,
    displayName: user.profile?.displayName || user.username,
    avatar: publicFile(avatar),
    url: `/u/${encodeURIComponent(user.username)}`,
    socialPublic: user.profile?.socialPublic !== false,
    isFavorite: Boolean(viewerId && favoriteUserIdsFor(db.users[viewerId]).includes(user.id))
  };
}

function publicPostComment(comment, viewerId) {
  if (!comment || comment.deletedAt) return null;
  return {
    id: comment.id,
    text: comment.text || '',
    createdAt: comment.createdAt,
    user: postActor(db.users[comment.userId], viewerId),
    isMine: comment.userId === viewerId
  };
}

function publicPost(post, viewerId = null) {
  if (!post) return null;
  const likes = Array.isArray(post.likes) ? post.likes.filter((userId) => db.users[userId]) : [];
  const saves = Array.isArray(post.savedBy) ? post.savedBy.filter((userId) => db.users[userId]) : [];
  const reposts = Array.isArray(post.repostedBy) ? post.repostedBy.filter((userId) => db.users[userId]) : [];
  const comments = Array.isArray(post.comments) ? post.comments.filter((comment) => !comment.deletedAt) : [];
  const personTags = Array.isArray(post.personTags) ? post.personTags : [];
  return {
    id: post.id,
    ownerId: post.ownerId,
    author: postActor(db.users[post.ownerId], viewerId),
    user: postActor(db.users[post.ownerId], viewerId),
    media: publicFile(db.files[post.fileId]),
    file: publicFile(db.files[post.fileId]),
    mediaType: String(db.files[post.fileId]?.mime || '').startsWith('video/') ? 'video' : 'image',
    title: post.title || '',
    description: post.description || '',
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    personTags: personTags.map((tag) => ({
      userId: tag.userId,
      user: postActor(db.users[tag.userId], viewerId),
      x: tag.x,
      y: tag.y
    })).filter((tag) => tag.user),
    edits: post.edits || {},
    crop: post.edits?.crop || {},
    adjustments: post.edits?.adjustments || {},
    filter: post.edits?.filter || 'normal',
    allowReposts: postRepostsAllowed(post),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt || post.createdAt,
    likeCount: likes.length,
    likedByMe: Boolean(viewerId && likes.includes(viewerId)),
    savedByMe: Boolean(viewerId && saves.includes(viewerId)),
    repostCount: reposts.length,
    repostedByMe: Boolean(viewerId && reposts.includes(viewerId)),
    commentCount: comments.length,
    comments: comments.slice(-100).map((comment) => publicPostComment(comment, viewerId)).filter(Boolean),
    canDelete: post.ownerId === viewerId
  };
}

function postFeedScore(post) {
  const created = new Date(post.createdAt).getTime() || 0;
  const ageHours = Math.max(0, (Date.now() - created) / (60 * 60 * 1000));
  const engagement = (post.likes?.length || 0) * 3 + (post.comments?.length || 0) * 4 + (post.repostedBy?.length || 0) * 5;
  return engagement + Math.max(0, 72 - ageHours) / 12;
}

function cleanHashtags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const tags = raw
    .map((tag) => cleanText(String(tag || '').replace(/^#+/, ''), 40).toLowerCase())
    .filter((tag) => tag && /^[\p{L}\p{N}_]+$/u.test(tag));
  return Array.from(new Set(tags)).slice(0, 30);
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function cleanPostEdits(body) {
  const raw = body?.edits && typeof body.edits === 'object' ? body.edits : {};
  const cropRaw = body?.crop && typeof body.crop === 'object' ? body.crop : (raw.crop || raw);
  const adjustRaw = body?.adjustments && typeof body.adjustments === 'object' ? body.adjustments : (raw.adjustments || raw);
  const trimRaw = body?.trim && typeof body.trim === 'object' ? body.trim : (raw.trim || {});
  return {
    crop: {
      x: boundedNumber(cropRaw.x ?? cropRaw.offsetX ?? cropRaw.cropX, -100, 100, 0),
      y: boundedNumber(cropRaw.y ?? cropRaw.offsetY ?? cropRaw.cropY, -100, 100, 0),
      width: boundedNumber(cropRaw.width ?? cropRaw.cropWidth, 1, 100, 100),
      height: boundedNumber(cropRaw.height ?? cropRaw.cropHeight, 1, 100, 100),
      zoom: boundedNumber(cropRaw.zoom ?? cropRaw.scale ?? cropRaw.cropZoom, 1, 5, 1),
      rotation: boundedNumber(cropRaw.rotation ?? cropRaw.cropRotation, -360, 360, 0),
      aspectRatio: cleanText(cropRaw.aspectRatio || cropRaw.aspect || 'original', 24) || 'original',
      flipX: Boolean(cropRaw.flipX ?? cropRaw.flipHorizontal),
      flipY: Boolean(cropRaw.flipY ?? cropRaw.flipVertical)
    },
    adjustments: {
      brightness: boundedNumber(adjustRaw.brightness, 0, 200, 100),
      contrast: boundedNumber(adjustRaw.contrast, 0, 200, 100),
      saturation: boundedNumber(adjustRaw.saturation, 0, 200, 100),
      warmth: boundedNumber(adjustRaw.warmth, -100, 100, 0),
      fade: boundedNumber(adjustRaw.fade, 0, 100, 0),
      highlights: boundedNumber(adjustRaw.highlights, -100, 100, 0),
      shadows: boundedNumber(adjustRaw.shadows, -100, 100, 0),
      vignette: boundedNumber(adjustRaw.vignette, 0, 100, 0),
      sharpen: boundedNumber(adjustRaw.sharpen, 0, 100, 0),
      blur: boundedNumber(adjustRaw.blur, 0, 20, 0)
    },
    filter: cleanText(body?.filter || raw.filter || 'normal', 40).toLowerCase() || 'normal',
    trim: {
      start: boundedNumber(trimRaw.start, 0, 60 * 60, 0),
      end: boundedNumber(trimRaw.end, 0, 60 * 60, 0),
      muted: Boolean(trimRaw.muted ?? raw.videoMuted),
      volume: boundedNumber(trimRaw.volume ?? raw.videoVolume, 0, 1, 1),
      speed: boundedNumber(trimRaw.speed ?? raw.videoSpeed, 0.25, 4, 1)
    }
  };
}

function cleanPersonTags(value, ownerId) {
  const tags = Array.isArray(value) ? value : [];
  const seen = new Set();
  const cleaned = [];
  for (const raw of tags) {
    const target = db.users[cleanText(raw?.userId || raw?.id || '', 120)] || userByUsername(raw?.username);
    if (!target || seen.has(target.id) || isBlockedBetween(ownerId, target.id)) continue;
    const mentionPermission = target.profile?.mentionPermission || 'everyone';
    if (mentionPermission === 'nobody') continue;
    if (mentionPermission === 'following' && !isFollowing(target.id, ownerId)) continue;
    if (db.users[ownerId]?.profile?.socialPublic === false && target.id !== ownerId && !isFollowing(target.id, ownerId)) continue;
    seen.add(target.id);
    cleaned.push({
      userId: target.id,
      x: boundedNumber(raw?.x, 0, 100, 50),
      y: boundedNumber(raw?.y, 0, 100, 50)
    });
    if (cleaned.length >= 20) break;
  }
  return cleaned;
}

function activeNoteFor(userId) {
  const note = db.notes?.[userId];
  if (!note || note.deletedAt || new Date(note.expiresAt).getTime() <= Date.now()) return null;
  return note;
}

function canViewNote(note, viewerId) {
  if (!note || !viewerId || note.deletedAt || new Date(note.expiresAt).getTime() <= Date.now()) return false;
  if (!db.users[note.ownerId] || isBlockedBetween(note.ownerId, viewerId)) return false;
  return note.ownerId === viewerId || isFollowing(viewerId, note.ownerId);
}

function publicNote(note, viewerId) {
  if (!note) return null;
  return {
    id: note.id,
    ownerId: note.ownerId,
    user: postActor(db.users[note.ownerId], viewerId),
    text: note.text || '',
    audio: publicFile(db.files[note.audioFileId]),
    audioTitle: note.audioTitle || '',
    audioArtist: note.audioArtist || '',
    audioDuration: note.audioDuration ?? null,
    audioStart: note.audioStart || 0,
    createdAt: note.createdAt,
    expiresAt: note.expiresAt,
    isMine: note.ownerId === viewerId
  };
}

function validEmail(value) {
  return !value || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254);
}

function validPhone(value) {
  if (!value) return true;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^\+?[0-9 ()-]+$/.test(value);
}

function cleanWebsite(value) {
  const input = cleanText(value || '', 240);
  if (!input) return '';
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw Object.assign(new Error('Enter a valid website address.'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw Object.assign(new Error('Website addresses must use http or https.'), { status: 400 });
  }
  return parsed.toString().slice(0, 300);
}

function accountSnapshot(user) {
  return {
    email: user.email || '',
    phone: user.phone || '',
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
    emailVerificationSentAt: user.emailVerificationSentAt || null,
    phoneVerified: Boolean(user.phoneVerified),
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    twoFactorEnabled: Boolean(user.twoFactor?.enabled)
  };
}

function requestBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = ['http', 'https'].includes(forwardedProto) ? forwardedProto : (req.socket?.encrypted ? 'https' : 'http');
  const host = mailHeader(req.headers.host || `localhost:${PORT}`);
  return `${protocol}://${host}`;
}

async function issueEmailVerification(user, req) {
  if (!user?.email) return { sent: false, reason: 'no email address' };
  for (const [key, record] of Object.entries(db.emailVerifications)) {
    if (record?.userId === user.id && !record.usedAt) delete db.emailVerifications[key];
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const createdAt = nowIso();
  const record = {
    id: id('verify'),
    userId: user.id,
    email: user.email,
    createdAt,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_LIFETIME_MS).toISOString(),
    usedAt: null
  };
  db.emailVerifications[tokenHash] = record;
  user.emailVerificationSentAt = createdAt;
  await Promise.all([saveEmailVerifications(), saveUsers()]);
  const verifyUrl = `${requestBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const name = user.profile?.displayName || user.username;
  const body = [
    `Hi ${name},`,
    '',
    'Welcome to New Around. Please confirm that this email address belongs to you:',
    verifyUrl,
    '',
    'This private link expires in 24 hours. If you did not add this address, you can ignore this message.',
    '',
    '— The New Around team'
  ].join('\n');
  return sendMailViaSendmail(user.email, 'Verify your New Around email', body);
}

function publicStoryCommentGif(comment, viewerId = null) {
  const gif = comment?.gifId ? db.gifs[comment.gifId] : null;
  const file = gif?.fileId ? db.files[gif.fileId] : null;
  if (!gif || gif.status !== 'approved' || !file || !['image/gif', 'image/webp'].includes(file.mime)) return null;
  return publicGif(gif, viewerId);
}

function publicStory(story, viewerId = null) {
  if (!story) return null;
  const views = Array.isArray(story.views) ? story.views : [];
  const likes = Array.isArray(story.likes) ? story.likes : [];
  const comments = Array.isArray(story.comments) ? story.comments : [];
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const stickerResponses = story.stickerResponses && typeof story.stickerResponses === 'object' ? story.stickerResponses : {};
  const responseSummary = Object.fromEntries(Object.entries(stickerResponses).map(([stickerId, rawResponses]) => {
    const responses = Array.isArray(rawResponses) ? rawResponses : [];
    const numeric = responses.map((response) => Number(response.value)).filter(Number.isFinite);
    const optionCounts = {};
    responses.forEach((response) => {
      const value = String(response.value ?? '');
      optionCounts[value] = (optionCounts[value] || 0) + 1;
    });
    return [stickerId, {
      count: responses.length,
      average: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null,
      optionCounts,
      myValue: responses.find((response) => response.userId === viewerId)?.value ?? null,
      responses: viewerId === story.ownerId ? responses.slice(-50).map((response) => ({
        id: response.id,
        value: response.value,
        createdAt: response.createdAt,
        user: storyActor(db.users[response.userId])
      })) : []
    }];
  }));
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
    canReply: canReplyToStory(story, viewerId),
    commentCount: comments.length,
    stickerResponses: responseSummary,
    comments: comments.slice(-80).map((comment) => {
      const commentLikes = Array.isArray(comment.likes) ? comment.likes : [];
      const parent = comment.replyTo ? commentById.get(comment.replyTo) : null;
      const gif = publicStoryCommentGif(comment, viewerId);
      const parentGif = publicStoryCommentGif(parent, viewerId);
      return {
        id: comment.id,
        kind: comment.kind === 'gif' ? 'gif' : 'text',
        text: comment.text || '',
        gif,
        createdAt: comment.createdAt,
        user: storyActor(db.users[comment.userId]),
        replyTo: parent?.id || null,
        replyPreview: parent ? {
          id: parent.id,
          kind: parent.kind === 'gif' ? 'gif' : 'text',
          text: parent.text || '',
          gif: parentGif,
          user: storyActor(db.users[parent.userId])
        } : null,
        likeCount: commentLikes.length,
        likedByMe: Boolean(viewerId && commentLikes.includes(viewerId))
      };
    })
  };
}

function cleanHighlightTitle(value, fallback = 'Highlight') {
  return cleanText(value || '', 32).trim() || fallback;
}

function legacyHighlightTitle(story) {
  const text = cleanHighlightTitle(story?.edits?.text || '', 'Highlight');
  return text.length > 24 ? `${text.slice(0, 23).trim()}...` : text;
}

function ensureUserHighlights(user) {
  if (!user) return [];
  if (!user.profile || typeof user.profile !== 'object') user.profile = {};
  const rawHighlights = Array.isArray(user.profile.highlights) ? user.profile.highlights : [];
  const normalized = [];
  const referencedStoryIds = new Set();

  rawHighlights.slice(0, 100).forEach((raw) => {
    const storyIds = Array.from(new Set((Array.isArray(raw?.storyIds) ? raw.storyIds : [])
      .map(String)
      .filter((storyId) => {
        const story = db.stories[storyId];
        return story && story.ownerId === user.id && !story.deletedAt;
      }))).slice(0, 100);
    if (!storyIds.length) return;
    storyIds.forEach((storyId) => referencedStoryIds.add(storyId));
    const coverStoryId = storyIds.includes(raw?.coverStoryId) ? raw.coverStoryId : storyIds[0];
    normalized.push({
      id: cleanText(raw?.id || '', 120) || id('highlight'),
      title: cleanHighlightTitle(raw?.title),
      storyIds,
      coverStoryId,
      createdAt: raw?.createdAt || db.stories[storyIds[0]]?.createdAt || nowIso(),
      updatedAt: raw?.updatedAt || raw?.createdAt || nowIso()
    });
  });

  Object.values(db.stories)
    .filter((story) => story.ownerId === user.id && story.saved && !story.deletedAt && !referencedStoryIds.has(story.id))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .forEach((story) => {
      normalized.push({
        id: id('highlight'),
        title: legacyHighlightTitle(story),
        storyIds: [story.id],
        coverStoryId: story.id,
        createdAt: story.createdAt,
        updatedAt: story.createdAt
      });
      referencedStoryIds.add(story.id);
    });

  user.profile.highlights = normalized;
  return normalized;
}

function highlightFor(user, highlightId) {
  return ensureUserHighlights(user).find((highlight) => highlight.id === highlightId) || null;
}

function createHighlight(user, title, story = null) {
  const timestamp = nowIso();
  const highlight = {
    id: id('highlight'),
    title: cleanHighlightTitle(title),
    storyIds: [],
    coverStoryId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  ensureUserHighlights(user).push(highlight);
  if (story) addStoryToHighlight(user, highlight, story);
  return highlight;
}

function addStoryToHighlight(user, highlight, story) {
  if (!user || !highlight || !story || story.ownerId !== user.id || story.deletedAt) return false;
  if (!Array.isArray(highlight.storyIds)) highlight.storyIds = [];
  if (!highlight.storyIds.includes(story.id)) highlight.storyIds.push(story.id);
  highlight.storyIds = highlight.storyIds.slice(-100);
  if (!highlight.coverStoryId || !highlight.storyIds.includes(highlight.coverStoryId)) {
    highlight.coverStoryId = story.id;
  }
  highlight.updatedAt = nowIso();
  story.saved = true;
  story.expiresAt = null;
  return true;
}

function publicHighlight(highlight, viewerId = null) {
  if (!highlight) return null;
  const stories = (highlight.storyIds || [])
    .map((storyId) => db.stories[storyId])
    .filter((story) => canViewStory(story, viewerId))
    .map((story) => publicStory(story, viewerId));
  if (!stories.length) return null;
  const cover = stories.find((story) => story.id === highlight.coverStoryId) || stories[0];
  return {
    id: highlight.id,
    title: highlight.title,
    storyCount: stories.length,
    coverStoryId: cover.id,
    cover,
    stories,
    createdAt: highlight.createdAt,
    updatedAt: highlight.updatedAt
  };
}

function publicHighlightsFor(user, viewerId = null) {
  return ensureUserHighlights(user)
    .map((highlight) => publicHighlight(highlight, viewerId))
    .filter(Boolean);
}

let migratedLegacyHighlights = false;
Object.values(db.users).forEach((user) => {
  const before = JSON.stringify(user.profile?.highlights || []);
  ensureUserHighlights(user);
  if (JSON.stringify(user.profile.highlights) !== before) migratedLegacyHighlights = true;
});
if (migratedLegacyHighlights) {
  fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(db.users, null, 2));
}

function cleanStoryDrawings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 80).map((stroke) => ({
    color: /^#[0-9a-f]{6}$/i.test(String(stroke?.color || '')) ? stroke.color : '#ffffff',
    size: Math.max(2, Math.min(20, Number(stroke?.size || 6))),
    brush: ['pen', 'marker', 'neon', 'chalk'].includes(stroke?.brush) ? stroke.brush : 'pen',
    points: Array.isArray(stroke?.points)
      ? stroke.points.slice(0, 350).map((point) => ({
        x: Math.max(0, Math.min(100, Number(point?.x || 0))),
        y: Math.max(0, Math.min(100, Number(point?.y || 0)))
      }))
      : []
  })).filter((stroke) => stroke.points.length);
}

function storyNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream request failed (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function weatherDescription(code) {
  const value = Number(code);
  if (value === 0) return 'Clear';
  if ([1, 2].includes(value)) return 'Partly cloudy';
  if (value === 3) return 'Overcast';
  if ([45, 48].includes(value)) return 'Fog';
  if (value >= 51 && value <= 67) return 'Rain';
  if (value >= 71 && value <= 77) return 'Snow';
  if (value >= 80 && value <= 82) return 'Showers';
  if (value >= 85 && value <= 86) return 'Snow showers';
  if (value >= 95) return 'Thunderstorm';
  return 'Current weather';
}

function weatherSymbol(condition = '') {
  const value = String(condition).toLowerCase();
  if (value.includes('thunder')) return '\u26a1';
  if (value.includes('snow')) return '\u2744\ufe0f';
  if (value.includes('rain') || value.includes('shower')) return '\ud83c\udf27\ufe0f';
  if (value.includes('fog')) return '\ud83c\udf2b\ufe0f';
  if (value.includes('cloud') || value.includes('overcast')) return '\u2601\ufe0f';
  return '\u2600\ufe0f';
}

function cleanStoryLink(value) {
  const raw = cleanText(value || '', 500);
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

function cleanStoryStickerData(sticker) {
  const raw = sticker?.data && typeof sticker.data === 'object' ? sticker.data : {};
  const latitude = storyNumber(raw.latitude, -90, 90, 0);
  const longitude = storyNumber(raw.longitude, -180, 180, 0);
  const targetTime = new Date(raw.targetAt || '').getTime();
  const gifUrl = /^\/api\/files\/[a-zA-Z0-9_]+\/download\?inline=1$/.test(String(raw.gifUrl || '')) ? raw.gifUrl : '';
  return {
    gifId: cleanText(raw.gifId || '', 80),
    gifUrl,
    latitude,
    longitude,
    placeName: cleanText(raw.placeName || '', 100),
    region: cleanText(raw.region || '', 100),
    condition: cleanText(raw.condition || '', 60),
    symbol: cleanText(raw.symbol || '', 8),
    temperature: storyNumber(raw.temperature, -100, 70, 0),
    apparentTemperature: storyNumber(raw.apparentTemperature, -100, 80, 0),
    provider: cleanText(raw.provider || '', 40),
    targetAt: Number.isFinite(targetTime) ? new Date(targetTime).toISOString() : '',
    options: Array.isArray(raw.options) ? raw.options.slice(0, 4).map((option) => cleanText(option || '', 40)).filter(Boolean) : [],
    correctIndex: Math.max(0, Math.min(3, Number(raw.correctIndex || 0))),
    emoji: cleanText(raw.emoji || '', 8)
  };
}

function cleanStoryStickers(raw) {
  const validTypes = new Set([
    'emoji', 'gif', 'mention', 'question', 'hashtag', 'countdown', 'location',
    'link', 'add_yours', 'quiz', 'emoji_slider', 'time', 'weather', 'captions'
  ]);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((sticker) => ({
    id: cleanText(sticker?.id || id('sticker'), 80),
    type: validTypes.has(sticker?.type) ? sticker.type : 'emoji',
    label: cleanText(sticker?.label || '', 80),
    href: sticker?.type === 'link' ? cleanStoryLink(sticker?.href) : '',
    data: cleanStoryStickerData(sticker),
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
    const permission = target.profile?.mentionPermission || 'everyone';
    if (permission === 'nobody') continue;
    if (permission === 'following' && !isFollowing(target.id, actor.id)) continue;
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
  return db.groups[chatId]?.memberIds || chatId.split('__');
}

function messageGroup(message) {
  return message?.groupId ? db.groups[message.groupId] : db.groups[message?.chatId];
}

function messageParticipantIds(message) {
  const group = messageGroup(message);
  return group ? (group.memberIds || []) : [message?.senderId, message?.recipientId].filter(Boolean);
}

function canViewMessage(userId, message) {
  if (!message || (message.hiddenFor || []).includes(userId)) return false;
  const group = messageGroup(message);
  if (group) return Boolean(groupForMember(group.id, userId));
  const peerId = message.senderId === userId ? message.recipientId : message.senderId;
  return messageParticipantIds(message).includes(userId) && canViewChat(userId, peerId);
}

function canInteractWithMessage(userId, message) {
  if (!canViewMessage(userId, message)) return false;
  const group = messageGroup(message);
  if (group) return true;
  const peerId = message.senderId === userId ? message.recipientId : message.senderId;
  return canChat(userId, peerId);
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
  const reactionEntries = Object.entries(message.reactions || {});
  return {
    id: message.id,
    chatId: message.chatId,
    groupId: message.groupId || null,
    senderId: message.senderId,
    recipientId: message.recipientId,
    sender: basicPublicUser(db.users[message.senderId]),
    kind: message.kind,
    text: message.deletedAt ? '' : (message.text || ''),
    replyTo: message.replyTo || null,
    replyPreview: messagePreview(reply),
    attachment: message.deletedAt ? null : attachment,
    stickerId: message.deletedAt ? null : (message.stickerId || null),
    reactions: MESSAGE_REACTIONS.size && !message.deletedAt
      ? Array.from(MESSAGE_REACTIONS).map((emoji) => {
        const userIds = reactionEntries.filter(([, value]) => value === emoji).map(([userId]) => userId);
        return { emoji, count: userIds.length, userIds };
      }).filter((reaction) => reaction.count)
      : [],
    messageStickers: message.deletedAt ? [] : (message.messageStickers || []).map((sticker) => ({
      id: sticker.id,
      userId: sticker.userId,
      createdAt: sticker.createdAt,
      file: publicFile(db.files[sticker.fileId])
    })).filter((sticker) => sticker.file),
    pinnedAt: message.pinnedAt || null,
    pinnedBy: message.pinnedBy || null,
    forwardedFrom: message.forwardedFrom || null,
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
      `From: ${mailHeader(MAIL_FROM)}`,
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

function isAnimatedImageDataUrl(dataUrl) {
  const mime = mimeFromDataUrl(dataUrl);
  if (mime === 'image/gif') return true;
  if (mime !== 'image/webp') return false;
  try {
    const { buffer } = dataUrlToBuffer(dataUrl);
    return buffer.includes(Buffer.from('ANIM')) || buffer.includes(Buffer.from('ANMF'));
  } catch {
    return false;
  }
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
    'image/svg+xml': '.svg',
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

async function cloneStoredFile(file, ownerId, scope) {
  if (!file?.diskPath || !fs.existsSync(file.diskPath)) return null;
  const ext = path.extname(file.originalName || '') || extensionForMime(file.mime);
  const day = new Date().toISOString().slice(0, 10);
  const folder = path.join(UPLOAD_DIR, day);
  await fsp.mkdir(folder, { recursive: true });
  const fileId = id('file');
  const diskPath = path.join(folder, `${fileId}${ext}`);
  await fsp.copyFile(file.diskPath, diskPath);
  const record = {
    id: fileId,
    ownerId,
    scope,
    originalName: file.originalName,
    mime: file.mime,
    size: file.size,
    uploadedAt: nowIso(),
    originalLastModified: file.originalLastModified || null,
    diskPath,
    messageId: null
  };
  db.files[fileId] = record;
  return record;
}

function canAccessFile(userId, file) {
  if (!file) return false;
  if (file.scope === 'avatar') return true;
  if (file.scope === 'group-avatar') {
    const group = Object.values(db.groups).find((item) => item.avatarFileId === file.id);
    return Boolean(userId && groupForMember(group?.id, userId));
  }
  if (file.scope === 'gif') {
    const gif = Object.values(db.gifs).find((item) => item.fileId === file.id);
    return Boolean(gif && (gif.status === 'approved' || gif.submitterId === userId || isModerator(userId)));
  }
  if (file.scope === 'story' || file.scope === 'story-audio') {
    const story = Object.values(db.stories).find((item) => (
      item.fileId === file.id || item.audioFileId === file.id
    ));
    return canViewStory(story, userId);
  }
  if (file.scope === 'post') {
    const post = Object.values(db.posts).find((item) => item.fileId === file.id);
    return canViewPost(post, userId);
  }
  if (file.scope === 'note-audio') {
    const note = Object.values(db.notes).find((item) => item.audioFileId === file.id);
    return canViewNote(note, userId);
  }
  if (!userId) return false;
  if (file.ownerId === userId) return true;
  if (!file.messageId) return false;
  const found = findMessage(file.messageId);
  if (!found) return false;
  const { message } = found;
  if (message.deletedAt) return false;
  return canViewMessage(userId, message);
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
    if (!validEmail(email)) return sendError(res, 400, 'Enter a valid email address.');
    if (!validPhone(phone)) return sendError(res, 400, 'Enter a valid phone number.');
    if (Object.values(db.users).some((user) => user.usernameLower === usernameLower)) {
      return sendError(res, 409, 'That username is already taken.');
    }
    if (email && Object.values(db.users).some((user) => String(user.email || '').toLowerCase() === email)) {
      return sendError(res, 409, 'That email is already registered.');
    }
    if (phone && Object.values(db.users).some((user) => String(user.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
      return sendError(res, 409, 'That phone number is already registered.');
    }

    const passwordRecord = createPassword(password);
    const user = {
      id: id('user'),
      username,
      usernameLower,
      email,
      phone,
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerificationSentAt: null,
      phoneVerified: false,
      phoneVerifiedAt: null,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      createdAt: nowIso(),
      profile: {
        displayName: username,
        displayNameChangedAt: null,
        bio: '',
        bioVisible: true,
        website: '',
        websiteVisible: true,
        age: null,
        ageVisible: false,
        gender: '',
        genderVisible: false,
        avatarFileId: null,
        socialPublic: true,
        searchable: true,
        recommendable: true,
        avatarViewable: true,
        allowGroupAdds: true,
        allowReposts: true,
        favoriteUserIds: [],
        mentionPermission: 'everyone',
        storyReplies: 'everyone',
        friendRequests: 'everyone',
        highlights: []
      },
      twoFactor: {
        enabled: false,
        secret: null,
        pendingSecret: null
      }
    };
    db.users[user.id] = user;
    db.contacts[user.id] = [];
    db.follows[user.id] = [];
    db.notifications[user.id] = [];
    db.blocks[user.id] = [];
    db.mutes[user.id] = {};
    await Promise.all([saveUsers(), saveContacts(), saveFollows(), saveNotifications(), saveBlocks(), saveMutes()]);
    const verificationMail = email ? await issueEmailVerification(user, req) : { sent: false };
    await createSession(res, user.id);
    rememberUserRequest(user.id, req);
    return sendJson(res, 201, {
      user: publicUser(user, user.id),
      verificationRequired: Boolean(email),
      verificationEmailSent: Boolean(verificationMail.sent)
    });
  }

  const emailVerificationMatch = /^\/api\/(?:auth\/verify-email|account\/verify-email|verify-email|email\/verify|email-verifications)(?:\/([^/]+))?$/.exec(pathname);
  if (req.method === 'GET' && emailVerificationMatch) {
    const token = cleanText(emailVerificationMatch[1] ? decodeURIComponent(emailVerificationMatch[1]) : query.get('token'), 200);
    if (!token) return sendError(res, 400, 'A verification token is required.');
    const record = db.emailVerifications[sha256(token)];
    if (!record || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return sendError(res, 400, 'This verification link is invalid or has expired.');
    }
    const user = db.users[record.userId];
    if (!user || String(user.email || '').toLowerCase() !== String(record.email || '').toLowerCase()) {
      return sendError(res, 400, 'This verification link no longer matches the account email.');
    }
    const verifiedAt = nowIso();
    user.emailVerified = true;
    user.emailVerifiedAt = verifiedAt;
    record.usedAt = verifiedAt;
    await Promise.all([saveUsers(), saveEmailVerifications()]);
    return sendJson(res, 200, { ok: true, verified: true, email: user.email, verifiedAt });
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
      pendingRequestCount: pendingIncomingRequests(user.id).length,
      isModerator: isModerator(user.id)
    });
  }

  if (req.method === 'PATCH' && pathname === '/api/me/profile') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const visibility = body.visibility && typeof body.visibility === 'object' ? body.visibility : {};
    if (!user.profile || typeof user.profile !== 'object') user.profile = {};
    if (body.username !== undefined && cleanText(body.username, 24) !== user.username) {
      return sendError(res, 400, 'Your @username is permanent and cannot be changed.');
    }
    if (body.displayName !== undefined) {
      const displayName = cleanText(body.displayName, 60) || user.username;
      if (displayName !== (user.profile.displayName || user.username)) {
        const lastChanged = new Date(user.profile.displayNameChangedAt || 0).getTime();
        const nextChangeAt = lastChanged ? lastChanged + DISPLAY_NAME_COOLDOWN_MS : 0;
        if (nextChangeAt > Date.now()) {
          return sendError(res, 429, 'Display names can only be changed once every 14 days.', {
            nextDisplayNameChangeAt: new Date(nextChangeAt).toISOString()
          });
        }
        user.profile.displayName = displayName;
        user.profile.displayNameChangedAt = nowIso();
      }
    }
    if (body.bio !== undefined) user.profile.bio = cleanText(body.bio, 280);
    if (body.website !== undefined) user.profile.website = cleanWebsite(body.website);
    if (body.age !== undefined) {
      if (body.age === null || body.age === '') user.profile.age = null;
      else {
        const age = Number(body.age);
        if (!Number.isInteger(age) || age < 1 || age > 120) return sendError(res, 400, 'Age must be a whole number from 1 to 120.');
        user.profile.age = age;
      }
    }
    if (body.gender !== undefined) user.profile.gender = cleanText(body.gender, 40);
    if (body.socialPublic !== undefined) user.profile.socialPublic = Boolean(body.socialPublic);
    if (body.searchable !== undefined) user.profile.searchable = Boolean(body.searchable);
    if (body.recommendable !== undefined) user.profile.recommendable = Boolean(body.recommendable);
    if (body.avatarViewable !== undefined) user.profile.avatarViewable = Boolean(body.avatarViewable);
    if (body.allowGroupAdds !== undefined) user.profile.allowGroupAdds = Boolean(body.allowGroupAdds);
    if (body.allowReposts !== undefined) user.profile.allowReposts = Boolean(body.allowReposts);
    if (body.bioVisible !== undefined || body.showBio !== undefined || visibility.bio !== undefined) user.profile.bioVisible = Boolean(body.bioVisible ?? body.showBio ?? visibility.bio);
    if (body.websiteVisible !== undefined || body.showWebsite !== undefined || visibility.website !== undefined) user.profile.websiteVisible = Boolean(body.websiteVisible ?? body.showWebsite ?? visibility.website);
    if (body.ageVisible !== undefined || body.showAge !== undefined || visibility.age !== undefined) user.profile.ageVisible = Boolean(body.ageVisible ?? body.showAge ?? visibility.age);
    if (body.genderVisible !== undefined || body.showGender !== undefined || visibility.gender !== undefined) user.profile.genderVisible = Boolean(body.genderVisible ?? body.showGender ?? visibility.gender);
    if (['everyone', 'following', 'nobody'].includes(body.mentionPermission)) user.profile.mentionPermission = body.mentionPermission;
    if (['everyone', 'following', 'off'].includes(body.storyReplies)) user.profile.storyReplies = body.storyReplies;
    if (['everyone', 'followers', 'off'].includes(body.friendRequests)) user.profile.friendRequests = body.friendRequests;
    if (body.avatar?.dataUrl) {
      if (!mimeFromDataUrl(body.avatar.dataUrl).startsWith('image/')) return sendError(res, 400, 'Profile picture must be an image.');
      const file = await saveUpload(body.avatar, user.id, 'avatar');
      user.profile.avatarFileId = file.id;
    }
    await saveUsers();
    return sendJson(res, 200, { user: publicUser(user, user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/account') {
    const user = await requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { account: accountSnapshot(user) });
  }

  if (req.method === 'PATCH' && pathname === '/api/account') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    let emailChanged = false;
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!validEmail(email)) return sendError(res, 400, 'Enter a valid email address.');
      if (email && Object.values(db.users).some((item) => item.id !== user.id && String(item.email || '').toLowerCase() === email)) {
        return sendError(res, 409, 'That email is already registered.');
      }
      if (email !== String(user.email || '').toLowerCase()) {
        user.email = email;
        user.emailVerified = false;
        user.emailVerifiedAt = null;
        user.emailVerificationSentAt = null;
        emailChanged = true;
      }
    }
    if (body.phone !== undefined) {
      const phone = String(body.phone || '').trim();
      if (!validPhone(phone)) return sendError(res, 400, 'Enter a valid phone number.');
      const phoneDigits = phone.replace(/\D/g, '');
      if (phone && Object.values(db.users).some((item) => item.id !== user.id && String(item.phone || '').replace(/\D/g, '') === phoneDigits)) {
        return sendError(res, 409, 'That phone number is already registered.');
      }
      if (phone !== String(user.phone || '')) {
        user.phone = phone;
        user.phoneVerified = false;
        user.phoneVerifiedAt = null;
      }
    }
    await saveUsers();
    let verificationMail = { sent: false };
    if (emailChanged) {
      if (user.email) verificationMail = await issueEmailVerification(user, req);
      else {
        for (const [key, record] of Object.entries(db.emailVerifications)) {
          if (record?.userId === user.id && !record.usedAt) delete db.emailVerifications[key];
        }
        await saveEmailVerifications();
      }
    }
    return sendJson(res, 200, {
      account: accountSnapshot(user),
      user: publicUser(user, user.id),
      verificationEmailSent: Boolean(verificationMail.sent)
    });
  }

  if (req.method === 'POST' && pathname === '/api/account/email/verification') {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!user.email) return sendError(res, 400, 'Add an email address first.');
    if (user.emailVerified) return sendJson(res, 200, { ok: true, alreadyVerified: true, account: accountSnapshot(user) });
    const lastSent = new Date(user.emailVerificationSentAt || 0).getTime();
    if (lastSent && Date.now() - lastSent < 60 * 1000) {
      return sendError(res, 429, 'Please wait a minute before requesting another verification email.');
    }
    const result = await issueEmailVerification(user, req);
    return sendJson(res, 200, { ok: true, sent: Boolean(result.sent), account: accountSnapshot(user) });
  }

  if (req.method === 'PATCH' && pathname === '/api/account/password') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const currentPassword = String(body.currentPassword || body.current || '');
    const newPassword = String(body.newPassword || body.password || '');
    if (!verifyPassword(currentPassword, user)) return sendError(res, 403, 'Your current password is incorrect.');
    if (newPassword.length < 8) return sendError(res, 400, 'New password must be at least 8 characters.');
    if (newPassword === currentPassword) return sendError(res, 400, 'Choose a different password.');
    const passwordRecord = createPassword(newPassword);
    user.passwordSalt = passwordRecord.salt;
    user.passwordHash = passwordRecord.hash;
    const currentSessionKey = sha256(parseCookies(req)[COOKIE_NAME] || '');
    for (const [sessionKey, session] of Object.entries(db.sessions)) {
      if (session.userId === user.id && sessionKey !== currentSessionKey) delete db.sessions[sessionKey];
    }
    await Promise.all([saveUsers(), saveSessions()]);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/account/blocked') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const users = Array.from(new Set(db.blocks[user.id] || []))
      .map((userId) => db.users[userId])
      .filter(Boolean)
      .map((blocked) => relationshipPublicUser(blocked, user.id));
    return sendJson(res, 200, { users });
  }

  const favoriteMatch = /^\/api\/favorites\/([^/]+)$/.exec(pathname);
  if ((req.method === 'POST' || req.method === 'DELETE') && favoriteMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const targetKey = decodeURIComponent(favoriteMatch[1]);
    const target = db.users[targetKey] || userByUsername(targetKey);
    if (!target || target.id === user.id) return sendError(res, 404, 'User not found.');
    if (isBlockedBetween(user.id, target.id)) return sendError(res, 403, 'This user cannot be favorited right now.');
    const favorites = favoriteUserIdsFor(user);
    if (req.method === 'POST' && !favorites.includes(target.id)) favorites.push(target.id);
    user.profile.favoriteUserIds = req.method === 'DELETE' ? favorites.filter((userId) => userId !== target.id) : favorites;
    await saveUsers();
    return sendJson(res, 200, { user: publicUser(target, user.id), favoriteUserIds: favoriteUserIdsFor(user) });
  }

  if (req.method === 'GET' && pathname === '/api/feed') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const requestedMode = cleanText(query.get('mode') || 'for_you', 20).toLowerCase();
    const mode = ['for_you', 'following', 'favorites'].includes(requestedMode) ? requestedMode : 'for_you';
    const following = new Set(db.follows[user.id] || []);
    const favorites = new Set(favoriteUserIdsFor(user));
    const limit = Math.floor(boundedNumber(query.get('limit') || 40, 1, 100, 40));
    let posts = activePostsFor().filter((post) => canViewPost(post, user.id));
    if (mode === 'following') posts = posts.filter((post) => following.has(post.ownerId));
    if (mode === 'favorites') posts = posts.filter((post) => favorites.has(post.ownerId));
    if (mode === 'for_you') posts.sort((a, b) => postFeedScore(b) - postFeedScore(a) || String(b.createdAt).localeCompare(String(a.createdAt)));
    else posts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return sendJson(res, 200, { mode, posts: posts.slice(0, limit).map((post) => publicPost(post, user.id)) });
  }

  if (req.method === 'GET' && pathname === '/api/explore') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const limit = Math.floor(boundedNumber(query.get('limit') || 60, 1, 120, 60));
    const posts = activePostsFor()
      .filter((post) => canViewPost(post, user.id))
      .sort((a, b) => postFeedScore(b) - postFeedScore(a) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((post) => publicPost(post, user.id));
    return sendJson(res, 200, { posts });
  }

  const userPostsMatch = /^\/api\/users\/([^/]+)\/posts$/.exec(pathname);
  if (req.method === 'GET' && userPostsMatch) {
    const viewer = sessionFromRequest(req)?.user || null;
    const targetKey = decodeURIComponent(userPostsMatch[1]);
    const target = db.users[targetKey] || userByUsername(targetKey);
    if (!target) return sendError(res, 404, 'User not found.');
    const requestedTab = cleanText(query.get('tab') || 'posts', 20).toLowerCase();
    const tab = ['posts', 'saved', 'reposts', 'tagged'].includes(requestedTab) ? requestedTab : 'posts';
    const viewerId = viewer?.id || null;
    const privateProfile = !canViewPostsBy(target.id, viewerId);
    if (privateProfile || (tab === 'saved' && viewerId !== target.id)) {
      return sendJson(res, 200, { posts: [], private: true, tab });
    }
    let posts;
    if (tab === 'saved') posts = activePostsFor().filter((post) => (post.savedBy || []).includes(target.id));
    else if (tab === 'reposts') posts = activePostsFor().filter((post) => (post.repostedBy || []).includes(target.id));
    else if (tab === 'tagged') posts = activePostsFor().filter((post) => (post.personTags || []).some((tag) => tag.userId === target.id));
    else posts = activePostsFor(target.id);
    posts = posts.filter((post) => canViewPost(post, viewerId));
    return sendJson(res, 200, { posts: posts.map((post) => publicPost(post, viewerId)), private: false, tab });
  }

  if (req.method === 'POST' && pathname === '/api/posts') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const upload = body.file || body.media;
    if (!upload?.dataUrl) return sendError(res, 400, 'Choose one photo or video to post.');
    const mime = mimeFromDataUrl(upload.dataUrl);
    if (!mime.startsWith('image/') && !mime.startsWith('video/')) return sendError(res, 400, 'Posts must contain an image or video.');
    const decoded = dataUrlToBuffer(upload.dataUrl);
    const maximum = mime.startsWith('video/') ? 32 * 1024 * 1024 : 20 * 1024 * 1024;
    if (decoded.buffer.length > maximum) return sendError(res, 413, `This ${mime.startsWith('video/') ? 'video' : 'image'} is too large.`);
    const title = cleanText(body.title || '', 100);
    const description = cleanText(body.description || body.caption || '', 2200);
    const personTags = cleanPersonTags(body.personTags || body.taggedPeople || body.taggedUsers || body.tags, user.id);
    const inlineHashtags = description.match(/#[\p{L}\p{N}_]+/gu) || [];
    const suppliedHashtags = body.hashtags ?? ((typeof body.tags === 'string' || (Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === 'string'))) ? body.tags : '');
    const file = await saveUpload(upload, user.id, 'post');
    const post = {
      id: id('post'),
      ownerId: user.id,
      fileId: file.id,
      title,
      description,
      hashtags: cleanHashtags([...(Array.isArray(suppliedHashtags) ? suppliedHashtags : String(suppliedHashtags || '').split(/[\s,]+/)), ...inlineHashtags]),
      personTags,
      edits: cleanPostEdits(body),
      allowReposts: body.allowReposts !== false,
      likes: [],
      savedBy: [],
      repostedBy: [],
      repostDates: {},
      comments: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null
    };
    db.posts[post.id] = post;
    for (const tag of personTags) {
      if (tag.userId === user.id) continue;
      const note = addNotification(tag.userId, 'post_tag', user.id, null, `${user.username} tagged you in a post.`, { postId: post.id });
      if (note) pushToUser(tag.userId, { type: 'notification:new', notification: publicNotification(note, tag.userId) });
    }
    notifyMentions(user, `${title} ${description}`, 'in a post');
    await Promise.all([savePosts(), saveNotifications()]);
    return sendJson(res, 201, { post: publicPost(post, user.id), user: publicUser(user, user.id) });
  }

  const postMatch = /^\/api\/posts\/([^/]+)$/.exec(pathname);
  if (req.method === 'GET' && postMatch) {
    const viewer = sessionFromRequest(req)?.user || null;
    const post = db.posts[decodeURIComponent(postMatch[1])];
    if (!canViewPost(post, viewer?.id || null)) return sendError(res, 404, 'Post not found.');
    return sendJson(res, 200, { post: publicPost(post, viewer?.id || null) });
  }

  const postToggleMatch = /^\/api\/posts\/([^/]+)\/(like|save|repost)$/.exec(pathname);
  if (req.method === 'POST' && postToggleMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const post = db.posts[decodeURIComponent(postToggleMatch[1])];
    if (!canViewPost(post, user.id)) return sendError(res, 404, 'Post not found.');
    const action = postToggleMatch[2];
    let notification = null;
    if (action === 'like') {
      if (!Array.isArray(post.likes)) post.likes = [];
      const active = post.likes.includes(user.id);
      post.likes = active ? post.likes.filter((userId) => userId !== user.id) : [...post.likes, user.id];
      if (!active && post.ownerId !== user.id) notification = addNotification(post.ownerId, 'post_like', user.id, null, `${user.username} liked your post.`, { postId: post.id });
    } else if (action === 'save') {
      if (!Array.isArray(post.savedBy)) post.savedBy = [];
      post.savedBy = post.savedBy.includes(user.id) ? post.savedBy.filter((userId) => userId !== user.id) : [...post.savedBy, user.id];
    } else {
      if (!Array.isArray(post.repostedBy)) post.repostedBy = [];
      if (!post.repostDates || typeof post.repostDates !== 'object') post.repostDates = {};
      const active = post.repostedBy.includes(user.id);
      if (!active && !postRepostsAllowed(post)) return sendError(res, 403, 'The author has turned off reposts for this post.');
      post.repostedBy = active ? post.repostedBy.filter((userId) => userId !== user.id) : [...post.repostedBy, user.id];
      if (active) delete post.repostDates[user.id];
      else {
        post.repostDates[user.id] = nowIso();
        if (post.ownerId !== user.id) notification = addNotification(post.ownerId, 'post_repost', user.id, null, `${user.username} reposted your post.`, { postId: post.id });
      }
    }
    await Promise.all([savePosts(), notification ? saveNotifications() : Promise.resolve()]);
    if (notification) pushToUser(post.ownerId, { type: 'notification:new', notification: publicNotification(notification, post.ownerId) });
    return sendJson(res, 200, { post: publicPost(post, user.id) });
  }

  const postCommentMatch = /^\/api\/posts\/([^/]+)\/comments$/.exec(pathname);
  if (req.method === 'POST' && postCommentMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const post = db.posts[decodeURIComponent(postCommentMatch[1])];
    if (!canViewPost(post, user.id)) return sendError(res, 404, 'Post not found.');
    const body = await readJsonBody(req);
    const text = cleanText(body.text || '', 1000);
    if (!text) return sendError(res, 400, 'Write a comment first.');
    const comment = { id: id('comment'), userId: user.id, text, createdAt: nowIso(), deletedAt: null };
    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push(comment);
    post.comments = post.comments.slice(-500);
    const mentionNotes = notifyMentions(user, text, 'in a post comment');
    let notification = null;
    if (post.ownerId !== user.id && !mentionNotes.some(({ target }) => target.id === post.ownerId)) {
      notification = addNotification(post.ownerId, 'post_comment', user.id, null, `${user.username} commented on your post.`, { postId: post.id, commentId: comment.id });
    }
    await Promise.all([savePosts(), saveNotifications()]);
    if (notification) pushToUser(post.ownerId, { type: 'notification:new', notification: publicNotification(notification, post.ownerId) });
    return sendJson(res, 201, { post: publicPost(post, user.id), comment: publicPostComment(comment, user.id) });
  }

  if (req.method === 'DELETE' && postMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const post = db.posts[decodeURIComponent(postMatch[1])];
    if (!post || post.deletedAt) return sendError(res, 404, 'Post not found.');
    if (post.ownerId !== user.id) return sendError(res, 403, 'Only the author can delete this post.');
    post.deletedAt = nowIso();
    await savePosts();
    return sendJson(res, 200, { ok: true, user: publicUser(user, user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/notes') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const allowedOwners = new Set([user.id, ...(db.follows[user.id] || [])]);
    const notes = Object.values(db.notes)
      .filter((note) => allowedOwners.has(note.ownerId) && canViewNote(note, user.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((note) => publicNote(note, user.id));
    return sendJson(res, 200, { notes });
  }

  if (req.method === 'POST' && pathname === '/api/me/note') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const textValue = String(body.text || '').trim();
    if (Array.from(textValue).length > 60) return sendError(res, 400, 'Notes can be at most 60 characters.');
    const text = Array.from(textValue).slice(0, 60).join('');
    const audioUpload = body.audio?.dataUrl ? body.audio : null;
    const durationRaw = body.audioDuration ?? body.audio?.durationSeconds ?? body.audio?.duration;
    const audioDuration = durationRaw === undefined || durationRaw === null || durationRaw === '' ? null : Number(durationRaw);
    const audioStart = boundedNumber(body.audioStart ?? body.audio?.start, 0, 60 * 60, 0);
    if (audioDuration !== null && (!Number.isFinite(audioDuration) || audioDuration < 0 || audioDuration > 30)) {
      return sendError(res, 400, 'Note audio snippets can be at most 30 seconds.');
    }
    if (!text && !audioUpload && !body.audioTitle) return sendError(res, 400, 'Write a note or choose an audio snippet.');
    let audioFile = null;
    if (audioUpload) {
      if (!mimeFromDataUrl(audioUpload.dataUrl).startsWith('audio/')) return sendError(res, 400, 'Note audio must be an audio file.');
      if (dataUrlToBuffer(audioUpload.dataUrl).buffer.length > 12 * 1024 * 1024) return sendError(res, 413, 'Note audio is too large.');
      audioFile = await saveUpload(audioUpload, user.id, 'note-audio');
    }
    const note = {
      id: id('note'),
      ownerId: user.id,
      text,
      audioFileId: audioFile?.id || null,
      audioTitle: cleanText(body.audioTitle || body.audio?.title || '', 100),
      audioArtist: cleanText(body.audioArtist || body.audio?.artist || '', 100),
      audioDuration,
      audioStart,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + NOTE_LIFETIME_MS).toISOString(),
      deletedAt: null
    };
    db.notes[user.id] = note;
    await saveNotes();
    return sendJson(res, 201, { note: publicNote(note, user.id) });
  }

  if (req.method === 'DELETE' && pathname === '/api/me/note') {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (db.notes[user.id]) delete db.notes[user.id];
    await saveNotes();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me/activity') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const type = cleanText(query.get('type') || 'comments', 20).toLowerCase();
    if (!['comments', 'reposts'].includes(type)) return sendError(res, 400, 'Activity type must be comments or reposts.');
    let items = [];
    if (type === 'comments') {
      for (const post of activePostsFor()) {
        if (!canViewPost(post, user.id)) continue;
        for (const comment of post.comments || []) {
          if (comment.userId !== user.id || comment.deletedAt) continue;
          items.push({ id: comment.id, type: 'comment', createdAt: comment.createdAt, comment: publicPostComment(comment, user.id), post: publicPost(post, user.id) });
        }
      }
    } else {
      items = activePostsFor()
        .filter((post) => canViewPost(post, user.id) && (post.repostedBy || []).includes(user.id))
        .map((post) => ({ id: `repost_${post.id}`, type: 'repost', createdAt: post.repostDates?.[user.id] || post.createdAt, post: publicPost(post, user.id) }));
    }
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return sendJson(res, 200, { type, items });
  }

  if (req.method === 'GET' && pathname === '/api/gifs') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const requestedStatus = cleanText(query.get('status') || 'approved', 20);
    const status = ['approved', 'pending', 'rejected'].includes(requestedStatus) ? requestedStatus : 'approved';
    if (status !== 'approved' && !isModerator(user.id)) return sendError(res, 403, 'Moderator access required.');
    const term = cleanText(query.get('q') || '', 80).toLowerCase();
    const gifs = Object.values(db.gifs)
      .filter((gif) => gif.status === status)
      .filter((gif) => !term || `${gif.title} ${(gif.tags || []).join(' ')}`.toLowerCase().includes(term))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 80)
      .map((gif) => publicGif(gif, user.id));
    return sendJson(res, 200, { gifs, isModerator: isModerator(user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/gifs') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const mime = mimeFromDataUrl(body.file?.dataUrl);
    if (!['image/gif', 'image/webp'].includes(mime)) return sendError(res, 400, 'Choose an animated GIF or WebP file.');
    const decoded = dataUrlToBuffer(body.file.dataUrl);
    if (decoded.buffer.length > 8 * 1024 * 1024) return sendError(res, 413, 'GIF submissions must be 8 MB or smaller.');
    const file = await saveUpload(body.file, user.id, 'gif');
    const title = cleanText(body.title || path.parse(file.originalName).name || 'GIF', 60) || 'GIF';
    const gif = {
      id: id('gif'),
      submitterId: user.id,
      fileId: file.id,
      title,
      tags: cleanText(body.tags || '', 160).split(/[,#]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      status: isModerator(user.id) ? 'approved' : 'pending',
      createdAt: nowIso(),
      reviewedAt: isModerator(user.id) ? nowIso() : null,
      reviewedBy: isModerator(user.id) ? user.id : null
    };
    db.gifs[gif.id] = gif;
    await saveGifs();
    return sendJson(res, 201, { gif: publicGif(gif, user.id), pending: gif.status === 'pending' });
  }

  const gifReviewMatch = /^\/api\/gifs\/([^/]+)\/(approve|reject)$/.exec(pathname);
  if (req.method === 'POST' && gifReviewMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!isModerator(user.id)) return sendError(res, 403, 'Moderator access required.');
    const gif = db.gifs[decodeURIComponent(gifReviewMatch[1])];
    if (!gif) return sendError(res, 404, 'GIF submission not found.');
    gif.status = gifReviewMatch[2] === 'approve' ? 'approved' : 'rejected';
    gif.reviewedAt = nowIso();
    gif.reviewedBy = user.id;
    await saveGifs();
    return sendJson(res, 200, { gif: publicGif(gif, user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/locations') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const term = cleanText(query.get('q') || '', 100);
    if (term.length < 2) return sendJson(res, 200, { locations: [] });
    const language = cleanText(String(req.headers['accept-language'] || 'en').slice(0, 2), 2).toLowerCase() || 'en';
    const upstream = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=8&language=${encodeURIComponent(language)}&format=json`);
    const locations = (upstream.results || []).map((item) => ({
      id: String(item.id || `${item.latitude},${item.longitude}`),
      name: cleanText(item.name || term, 80),
      region: cleanText([item.admin1, item.country].filter(Boolean).join(', '), 100),
      latitude: storyNumber(item.latitude, -90, 90, 0),
      longitude: storyNumber(item.longitude, -180, 180, 0),
      timezone: cleanText(item.timezone || '', 80)
    }));
    return sendJson(res, 200, { locations });
  }

  if (req.method === 'GET' && pathname === '/api/weather') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const latitude = storyNumber(query.get('lat'), -90, 90, NaN);
    const longitude = storyNumber(query.get('lon'), -180, 180, NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return sendError(res, 400, 'Valid coordinates are required.');
    if (GOOGLE_WEATHER_API_KEY) {
      try {
        const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
        url.searchParams.set('key', GOOGLE_WEATHER_API_KEY);
        url.searchParams.set('location.latitude', String(latitude));
        url.searchParams.set('location.longitude', String(longitude));
        url.searchParams.set('unitsSystem', 'METRIC');
        const result = await fetchJson(url.toString());
        const condition = cleanText(result.weatherCondition?.description?.text || result.weatherCondition?.type || 'Current weather', 60);
        return sendJson(res, 200, {
          weather: {
            latitude,
            longitude,
            temperature: storyNumber(result.temperature?.degrees, -100, 70, 0),
            apparentTemperature: storyNumber(result.feelsLikeTemperature?.degrees, -100, 80, result.temperature?.degrees || 0),
            condition,
            symbol: weatherSymbol(condition),
            isDay: Boolean(result.isDaytime),
            provider: 'Google Weather'
          }
        });
      } catch {
        // Fall back to the no-key provider when Google is unavailable.
      }
    }
    const result = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto`);
    const condition = weatherDescription(result.current?.weather_code);
    return sendJson(res, 200, {
      weather: {
        latitude,
        longitude,
        temperature: storyNumber(result.current?.temperature_2m, -100, 70, 0),
        apparentTemperature: storyNumber(result.current?.apparent_temperature, -100, 80, result.current?.temperature_2m || 0),
        condition,
        symbol: weatherSymbol(condition),
        isDay: Boolean(result.current?.is_day),
        provider: 'Open-Meteo'
      }
    });
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
    const trimStart = storyNumber(body.edits?.trimStart, 0, 3600, 0);
    const requestedTrimEnd = storyNumber(body.edits?.trimEnd, 0, 3600, 0);
    const trimEnd = requestedTrimEnd > trimStart ? Math.min(requestedTrimEnd, trimStart + 60) : 0;
    const saved = body.saved === true;
    const story = {
      id: id('story'),
      ownerId: user.id,
      fileId: file.id,
      audioFileId: audioFile?.id || null,
      createdAt: nowIso(),
      expiresAt: saved ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      saved: false,
      edits: {
        compositionVersion: Number(body.edits?.compositionVersion) >= 3 ? 3 : Number(body.edits?.compositionVersion) >= 2 ? 2 : 1,
        filter: [
          'normal', 'oslo', 'paris', 'lagos', 'melbourne', 'jakarta', 'abu_dhabi',
          'buenos_aires', 'new_york', 'jaipur', 'cairo', 'tokyo', 'rio',
          'warm', 'cool', 'mono', 'noir'
        ].includes(body.edits?.filter) ? body.edits.filter : 'normal',
        overlayEffect: ['none', 'grain', 'dream', 'vhs', 'spotlight', 'sparkle', 'chroma'].includes(body.edits?.overlayEffect) ? body.edits.overlayEffect : 'none',
        brightness: storyNumber(body.edits?.brightness, 60, 140, 100),
        contrast: storyNumber(body.edits?.contrast, 60, 140, 100),
        saturation: storyNumber(body.edits?.saturation, 0, 180, 100),
        warmth: storyNumber(body.edits?.warmth, -50, 50, 0),
        fade: storyNumber(body.edits?.fade, 0, 60, 0),
        vignette: storyNumber(body.edits?.vignette, 0, 80, 0),
        blur: storyNumber(body.edits?.blur, 0, 8, 0),
        backgroundPreset: [
          'midnight', 'dusk', 'ocean', 'aurora', 'sunset', 'violet', 'graphite', 'paper', 'rose', 'electric'
        ].includes(body.edits?.backgroundPreset) ? body.edits.backgroundPreset : '',
        mediaOffsetX: storyNumber(body.edits?.mediaOffsetX, -40, 40, 0),
        mediaOffsetY: storyNumber(body.edits?.mediaOffsetY, -40, 40, 0),
        mediaFit: body.edits?.mediaFit === 'contain' ? 'contain' : 'cover',
        mediaRotation: [0, 90, 180, 270].includes(Number(body.edits?.mediaRotation)) ? Number(body.edits.mediaRotation) : 0,
        text: cleanText(body.edits?.text || '', 120),
        zoom: Math.max(1, Math.min(3, Number(body.edits?.zoom || 1))),
        textX: Math.max(5, Math.min(95, Number(body.edits?.textX || 50))),
        textY: Math.max(5, Math.min(95, Number(body.edits?.textY || 50))),
        textRotation: Math.max(-180, Math.min(180, Number(body.edits?.textRotation || 0))),
        textColor: /^#[0-9a-f]{6}$/i.test(String(body.edits?.textColor || '')) ? body.edits.textColor : '#ffffff',
        textFont: [
          'system', 'serif', 'mono', 'script', 'strong', 'rounded', 'condensed',
          'editor', 'deco', 'elegant', 'poster', 'literature', 'directional', 'meme', 'journal'
        ].includes(body.edits?.textFont) ? body.edits.textFont : 'system',
        textSize: Math.max(22, Math.min(96, Number(body.edits?.textSize || 44))),
        textAlign: ['left', 'center', 'right'].includes(body.edits?.textAlign) ? body.edits.textAlign : 'center',
        textEffect: ['none', 'shadow', 'glow', 'neon', 'sparkle', 'shimmer', 'pixel', 'outline', 'lift', 'rainbow'].includes(body.edits?.textEffect) ? body.edits.textEffect : 'shadow',
        textAnimation: ['none', 'fade', 'rise', 'pop', 'type', 'bounce', 'flicker', 'pulse'].includes(body.edits?.textAnimation) ? body.edits.textAnimation : 'none',
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
        trimStart,
        trimEnd,
        videoMuted: Boolean(body.edits?.videoMuted),
        videoVolume: storyNumber(body.edits?.videoVolume, 0, 1, 1),
        videoSpeed: [0.5, 1, 1.5, 2].includes(Number(body.edits?.videoSpeed)) ? Number(body.edits.videoSpeed) : 1
      },
      views: [],
      likes: [],
      comments: [],
      stickerResponses: {},
      deletedAt: null
    };
    db.stories[story.id] = story;
    let highlight = null;
    if (saved) {
      highlight = body.highlightId ? highlightFor(user, cleanText(body.highlightId, 120)) : null;
      if (!highlight) highlight = createHighlight(user, body.highlightTitle || legacyHighlightTitle(story));
      addStoryToHighlight(user, highlight, story);
    }
    const mentionText = [
      story.edits.text,
      story.edits.pollQuestion,
      ...story.edits.stickers.map((sticker) => sticker.label)
    ].join(' ');
    notifyMentions(user, mentionText, 'in a story');
    await Promise.all([saveStories(), saveNotifications(), ...(highlight ? [saveUsers()] : [])]);
    return sendJson(res, 201, {
      story: publicStory(story, user.id),
      highlight: publicHighlight(highlight, user.id),
      user: publicUser(user, user.id)
    });
  }

  if (req.method === 'POST' && pathname === '/api/highlights') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const title = cleanHighlightTitle(body.title, 'New highlight');
    if (!body.storyId) return sendError(res, 400, 'Choose a story for this highlight.');
    const story = body.storyId ? db.stories[cleanText(body.storyId, 120)] : null;
    if (body.storyId && (!story || story.ownerId !== user.id || story.deletedAt)) {
      return sendError(res, 404, 'Story not found.');
    }
    const highlight = createHighlight(user, title, story);
    await Promise.all([saveUsers(), ...(story ? [saveStories()] : [])]);
    return sendJson(res, 201, {
      highlight: publicHighlight(highlight, user.id),
      user: publicUser(user, user.id)
    });
  }

  const highlightMatch = /^\/api\/highlights\/([^/]+)$/.exec(pathname);
  if (req.method === 'PATCH' && highlightMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const highlight = highlightFor(user, decodeURIComponent(highlightMatch[1]));
    if (!highlight) return sendError(res, 404, 'Highlight not found.');
    const body = await readJsonBody(req);
    const title = cleanText(body.title || '', 32).trim();
    if (!title) return sendError(res, 400, 'Choose a name for this highlight.');
    highlight.title = title;
    highlight.updatedAt = nowIso();
    await saveUsers();
    return sendJson(res, 200, {
      highlight: publicHighlight(highlight, user.id),
      user: publicUser(user, user.id)
    });
  }

  if (req.method === 'DELETE' && highlightMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const highlightId = decodeURIComponent(highlightMatch[1]);
    const highlight = highlightFor(user, highlightId);
    if (!highlight) return sendError(res, 404, 'Highlight not found.');
    const remaining = ensureUserHighlights(user).filter((item) => item.id !== highlightId);
    const stillReferenced = new Set(remaining.flatMap((item) => item.storyIds || []));
    for (const storyId of highlight.storyIds || []) {
      const story = db.stories[storyId];
      if (!story || stillReferenced.has(storyId)) continue;
      story.saved = false;
      story.expiresAt = new Date(new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    user.profile.highlights = remaining;
    await Promise.all([saveUsers(), saveStories()]);
    return sendJson(res, 200, { ok: true, user: publicUser(user, user.id) });
  }

  const highlightStoryMatch = /^\/api\/highlights\/([^/]+)\/stories$/.exec(pathname);
  if (req.method === 'POST' && highlightStoryMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const highlight = highlightFor(user, decodeURIComponent(highlightStoryMatch[1]));
    if (!highlight) return sendError(res, 404, 'Highlight not found.');
    const body = await readJsonBody(req);
    const story = db.stories[cleanText(body.storyId || '', 120)];
    if (!story || story.ownerId !== user.id || story.deletedAt) return sendError(res, 404, 'Story not found.');
    addStoryToHighlight(user, highlight, story);
    await Promise.all([saveUsers(), saveStories()]);
    return sendJson(res, 200, {
      highlight: publicHighlight(highlight, user.id),
      user: publicUser(user, user.id)
    });
  }

  const storySaveMatch = /^\/api\/stories\/([^/]+)\/save$/.exec(pathname);
  if (req.method === 'POST' && storySaveMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storySaveMatch[1])];
    if (!story || story.ownerId !== user.id) return sendError(res, 404, 'Story not found.');
    const body = await readJsonBody(req);
    let highlight = body.highlightId ? highlightFor(user, cleanText(body.highlightId, 120)) : null;
    if (!highlight) highlight = createHighlight(user, body.highlightTitle || legacyHighlightTitle(story));
    addStoryToHighlight(user, highlight, story);
    await Promise.all([saveStories(), saveUsers()]);
    return sendJson(res, 200, {
      story: publicStory(story, user.id),
      highlight: publicHighlight(highlight, user.id),
      user: publicUser(user, user.id)
    });
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
    if (!canReplyToStory(story, user.id)) return sendError(res, 403, 'This user has turned off story replies.');
    const body = await readJsonBody(req);
    const kind = body.kind === 'gif' ? 'gif' : 'text';
    const text = kind === 'text' ? cleanText(body.text || '', 280) : '';
    const gifId = kind === 'gif' ? cleanText(body.gifId || '', 80) : '';
    let gif = null;
    if (kind === 'gif') {
      if (!gifId) return sendError(res, 400, 'Choose a GIF first.');
      gif = db.gifs[gifId];
      const gifFile = gif?.fileId ? db.files[gif.fileId] : null;
      if (!gif || gif.status !== 'approved' || !gifFile || !['image/gif', 'image/webp'].includes(gifFile.mime)) {
        return sendError(res, 404, 'Approved GIF not found.');
      }
    } else if (!text) {
      return sendError(res, 400, 'Write a comment first.');
    }
    if (!Array.isArray(story.comments)) story.comments = [];
    const parent = body.replyTo
      ? story.comments.find((comment) => comment.id === cleanText(body.replyTo, 120))
      : null;
    const comment = {
      id: id('comment'),
      userId: user.id,
      kind,
      text,
      gifId: gif?.id || null,
      replyTo: parent?.id || null,
      likes: [],
      createdAt: nowIso()
    };
    story.comments.push(comment);
    story.comments = story.comments.slice(-200);
    const mentionNotes = text ? notifyMentions(user, text, 'in a story comment') : [];
    if (parent && parent.userId !== user.id && !mentionNotes.some(({ target }) => target.id === parent.userId)) {
      const note = addNotification(parent.userId, 'comment_reply', user.id, null, `${user.username} replied to your comment.`);
      if (note) pushToUser(parent.userId, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(parent.userId).length,
        notification: publicNotification(note, parent.userId)
      });
    }
    await Promise.all([saveStories(), saveNotifications()]);
    return sendJson(res, 201, { story: publicStory(story, user.id) });
  }

  const storyCommentLikeMatch = /^\/api\/stories\/([^/]+)\/comments\/([^/]+)\/like$/.exec(pathname);
  if (req.method === 'POST' && storyCommentLikeMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyCommentLikeMatch[1])];
    if (!canViewStory(story, user.id)) return sendError(res, 404, 'Story not found.');
    const comment = (story.comments || []).find((item) => item.id === decodeURIComponent(storyCommentLikeMatch[2]));
    if (!comment) return sendError(res, 404, 'Comment not found.');
    if (!Array.isArray(comment.likes)) comment.likes = [];
    const wasLiked = comment.likes.includes(user.id);
    comment.likes = wasLiked ? comment.likes.filter((id) => id !== user.id) : [...comment.likes, user.id];
    if (!wasLiked && comment.userId !== user.id) {
      const note = addNotification(comment.userId, 'comment_like', user.id, null, `${user.username} liked your comment.`);
      if (note) pushToUser(comment.userId, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(comment.userId).length,
        notification: publicNotification(note, comment.userId)
      });
    }
    await Promise.all([saveStories(), saveNotifications()]);
    return sendJson(res, 200, { story: publicStory(story, user.id) });
  }

  const storyStickerResponseMatch = /^\/api\/stories\/([^/]+)\/stickers\/([^/]+)\/respond$/.exec(pathname);
  if (req.method === 'POST' && storyStickerResponseMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyStickerResponseMatch[1])];
    if (!canViewStory(story, user.id)) return sendError(res, 404, 'Story not found.');
    const stickerId = cleanText(decodeURIComponent(storyStickerResponseMatch[2]), 80);
    const sticker = stickerId === 'poll'
      ? { id: 'poll', type: 'poll', data: { options: [story.edits?.pollOptionA || 'Yes', story.edits?.pollOptionB || 'No'] } }
      : (story.edits?.stickers || []).find((item) => item.id === stickerId);
    if (!sticker || !['poll', 'quiz', 'emoji_slider', 'question', 'add_yours'].includes(sticker.type)) {
      return sendError(res, 404, 'Interactive sticker not found.');
    }
    const body = await readJsonBody(req);
    let value;
    if (sticker.type === 'emoji_slider') {
      value = storyNumber(body.value, 0, 100, NaN);
      if (!Number.isFinite(value)) return sendError(res, 400, 'Choose a slider position.');
    } else if (['poll', 'quiz'].includes(sticker.type)) {
      value = cleanText(body.value || '', 40);
      const options = sticker.type === 'poll'
        ? [story.edits?.pollOptionA || 'Yes', story.edits?.pollOptionB || 'No']
        : (sticker.data?.options || []);
      if (!options.includes(value)) return sendError(res, 400, 'Choose one of the available options.');
    } else {
      value = cleanText(body.value || '', 160);
      if (!value) return sendError(res, 400, 'Write a response first.');
    }
    if (!story.stickerResponses || typeof story.stickerResponses !== 'object') story.stickerResponses = {};
    const existing = Array.isArray(story.stickerResponses[stickerId]) ? story.stickerResponses[stickerId] : [];
    story.stickerResponses[stickerId] = [
      ...existing.filter((response) => response.userId !== user.id),
      { id: id('response'), userId: user.id, value, createdAt: nowIso() }
    ].slice(-500);
    await saveStories();
    return sendJson(res, 200, { story: publicStory(story, user.id) });
  }

  const storyDeleteMatch = /^\/api\/stories\/([^/]+)$/.exec(pathname);
  if (req.method === 'DELETE' && storyDeleteMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const story = db.stories[decodeURIComponent(storyDeleteMatch[1])];
    if (!story || story.ownerId !== user.id) return sendError(res, 404, 'Story not found.');
    story.deletedAt = nowIso();
    ensureUserHighlights(user).forEach((highlight) => {
      highlight.storyIds = highlight.storyIds.filter((storyId) => storyId !== story.id);
      if (highlight.coverStoryId === story.id) highlight.coverStoryId = highlight.storyIds[0] || null;
    });
    user.profile.highlights = user.profile.highlights.filter((highlight) => highlight.storyIds.length);
    await Promise.all([saveStories(), saveUsers()]);
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
    const following = new Set(db.follows[user.id] || []);
    const seeds = new Set([...(db.contacts[user.id] || []), ...following]);
    const candidates = new Map();
    for (const seedId of seeds) {
      const related = new Set([...(db.contacts[seedId] || []), ...(db.follows[seedId] || [])]);
      for (const candidateId of related) {
        if (candidateId === user.id || following.has(candidateId) || hasBlocked(user.id, candidateId) || hasBlocked(candidateId, user.id)) continue;
        if (db.users[candidateId]?.profile?.searchable === false || db.users[candidateId]?.profile?.recommendable === false) continue;
        candidates.set(candidateId, (candidates.get(candidateId) || 0) + 1);
      }
    }
    for (const candidate of Object.values(db.users)) {
      if (candidates.size >= 30) break;
      if (candidate.id === user.id || following.has(candidate.id) || isBlockedBetween(user.id, candidate.id)) continue;
      if (candidate.profile?.searchable === false || candidate.profile?.recommendable === false) continue;
      candidates.set(candidate.id, candidates.get(candidate.id) || 0);
    }
    const users = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1] || db.users[a[0]].usernameLower.localeCompare(db.users[b[0]].usernameLower))
      .slice(0, 30)
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
      addFollow(user.id, other.id);
      addFollow(other.id, user.id);
      const notification = addNotification(other.id, 'request_accepted', user.id, reverse.id, `${user.username} accepted your request.`);
      await Promise.all([saveFriendRequests(), saveContacts(), saveFollows(), saveNotifications()]);
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

    const requestSetting = other.profile?.friendRequests || 'everyone';
    if (requestSetting === 'off') return sendError(res, 403, 'This user is not accepting friend requests.');
    if (requestSetting === 'followers' && !isFollowing(user.id, other.id)) {
      return sendError(res, 403, 'Only followers can send this user a friend request.');
    }

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

  const followMatch = /^\/api\/follows\/([^/]+)$/.exec(pathname);
  if ((req.method === 'POST' || req.method === 'DELETE') && followMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(followMatch[1])] || userByUsername(decodeURIComponent(followMatch[1]));
    if (!peer || peer.id === user.id) return sendError(res, 404, 'User not found.');
    if (isBlockedBetween(user.id, peer.id)) return sendError(res, 403, 'This user cannot be followed right now.');
    if (req.method === 'POST' && peer.profile?.socialPublic === false && !(db.contacts[user.id] || []).includes(peer.id)) {
      return sendError(res, 409, 'This private account requires an approved request first.');
    }
    const changed = req.method === 'POST' ? addFollow(user.id, peer.id) : removeFollow(user.id, peer.id);
    let notification = null;
    if (req.method === 'POST' && changed) {
      notification = addNotification(peer.id, 'new_follower', user.id, null, `${user.username} followed you.`);
    }
    await Promise.all([saveFollows(), notification ? saveNotifications() : Promise.resolve()]);
    if (notification) {
      pushToUser(peer.id, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(peer.id).length,
        notification: publicNotification(notification, peer.id)
      });
    }
    pushToUsers([user.id, peer.id], { type: 'relationship:updated' });
    return sendJson(res, 200, {
      ok: true,
      user: publicUser(peer, user.id),
      me: publicUser(user, user.id)
    });
  }

  const followerMatch = /^\/api\/followers\/([^/]+)$/.exec(pathname);
  if (req.method === 'DELETE' && followerMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(followerMatch[1])] || userByUsername(decodeURIComponent(followerMatch[1]));
    if (!peer || peer.id === user.id) return sendError(res, 404, 'User not found.');
    removeFollow(peer.id, user.id);
    await saveFollows();
    pushToUsers([user.id, peer.id], { type: 'relationship:updated' });
    return sendJson(res, 200, {
      ok: true,
      user: publicUser(peer, user.id),
      me: publicUser(user, user.id)
    });
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
      addFollow(request.fromId, request.toId);
      addFollow(request.toId, request.fromId);
      responseNotification = addNotification(request.fromId, 'request_accepted', user.id, request.id, `${user.username} accepted your request.`);
      await Promise.all([saveFriendRequests(), saveContacts(), saveFollows(), saveNotifications()]);
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
    if (req.method === 'POST') {
      user.profile.favoriteUserIds = favoriteUserIdsFor(user).filter((userId) => userId !== peer.id);
      peer.profile.favoriteUserIds = favoriteUserIdsFor(peer).filter((userId) => userId !== user.id);
    }
    await Promise.all([saveBlocks(), ...(req.method === 'POST' ? [saveUsers()] : [])]);
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

  if (req.method === 'GET' && pathname === '/api/groups') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const groups = Object.values(db.groups)
      .filter((group) => (group.memberIds || []).includes(user.id))
      .map((group) => {
        const latest = latestVisibleMessage(db.messages[group.id] || [], user.id);
        return { ...publicGroup(group, user.id), latest: latest ? decorateMessage(latest) : null };
      })
      .sort((a, b) => String(b.latest?.createdAt || b.updatedAt || '').localeCompare(String(a.latest?.createdAt || a.updatedAt || '')));
    return sendJson(res, 200, { groups });
  }

  if (req.method === 'POST' && pathname === '/api/groups') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    const invitedIds = Array.from(new Set((Array.isArray(body.memberIds) ? body.memberIds : [])
      .map((value) => cleanText(value, 120))
      .filter((userId) => userId && userId !== user.id && db.users[userId])));
    if (invitedIds.length < 2) return sendError(res, 400, 'Choose at least two friends for a group chat.');
    if (invitedIds.length > 49) return sendError(res, 400, 'A group can have up to 50 members.');
    const unavailable = invitedIds.find((userId) => !canFriendAddToGroup(user.id, userId));
    if (unavailable) {
      const target = db.users[unavailable];
      return sendError(res, 403, `@${target.username} does not allow this group invitation.`);
    }
    const createdAt = nowIso();
    const group = {
      id: id('group'),
      name: cleanText(body.name || '', 60) || [user.id, ...invitedIds]
        .map((userId) => db.users[userId]?.profile?.displayName || db.users[userId]?.username)
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      ownerId: user.id,
      adminIds: [user.id],
      memberIds: [user.id, ...invitedIds],
      avatarFileId: null,
      membersCanAdd: body.membersCanAdd !== false,
      createdAt,
      updatedAt: createdAt
    };
    if (body.avatar?.dataUrl) {
      if (!mimeFromDataUrl(body.avatar.dataUrl).startsWith('image/')) return sendError(res, 400, 'Group picture must be an image.');
      const avatar = await saveUpload(body.avatar, user.id, 'group-avatar');
      group.avatarFileId = avatar.id;
      await saveFiles();
    }
    db.groups[group.id] = group;
    const notifications = invitedIds.map((userId) => ({
      userId,
      note: addNotification(userId, 'group_added', user.id, null, `${user.username} added you to ${group.name}.`, { groupId: group.id })
    }));
    await Promise.all([saveGroups(), saveNotifications()]);
    const publicValue = publicGroup(group, user.id);
    pushToUsers(group.memberIds, { type: 'group:updated', groupId: group.id, group: publicValue });
    for (const item of notifications) {
      if (!item.note) continue;
      pushToUser(item.userId, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(item.userId).length,
        notification: publicNotification(item.note, item.userId)
      });
    }
    return sendJson(res, 201, { group: publicValue });
  }

  const groupMatch = /^\/api\/groups\/([^/]+)$/.exec(pathname);
  if (groupMatch && ['GET', 'PATCH'].includes(req.method)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    if (req.method === 'GET') return sendJson(res, 200, { group: publicGroup(group, user.id) });
    if (!isGroupAdmin(group, user.id)) return sendError(res, 403, 'Only group admins can edit this group.');
    const body = await readJsonBody(req);
    if (body.name !== undefined) {
      const name = cleanText(body.name, 60);
      if (!name) return sendError(res, 400, 'Group name cannot be empty.');
      group.name = name;
    }
    if (body.membersCanAdd !== undefined) group.membersCanAdd = Boolean(body.membersCanAdd);
    if (body.avatar?.dataUrl) {
      if (!mimeFromDataUrl(body.avatar.dataUrl).startsWith('image/')) return sendError(res, 400, 'Group picture must be an image.');
      const avatar = await saveUpload(body.avatar, user.id, 'group-avatar');
      group.avatarFileId = avatar.id;
      await saveFiles();
    }
    group.updatedAt = nowIso();
    await saveGroups();
    pushToUsers(group.memberIds, { type: 'group:updated', groupId: group.id });
    return sendJson(res, 200, { group: publicGroup(group, user.id) });
  }

  const groupMembersMatch = /^\/api\/groups\/([^/]+)\/members$/.exec(pathname);
  if (req.method === 'POST' && groupMembersMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupMembersMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    if (!canAddGroupMembers(group, user.id)) return sendError(res, 403, 'Only group admins can add people here.');
    const body = await readJsonBody(req);
    const memberIds = Array.from(new Set((Array.isArray(body.memberIds) ? body.memberIds : [])
      .map((value) => cleanText(value, 120))
      .filter((userId) => userId && !group.memberIds.includes(userId) && db.users[userId])));
    if (!memberIds.length) return sendError(res, 400, 'Choose at least one new member.');
    if (group.memberIds.length + memberIds.length > 50) return sendError(res, 400, 'A group can have up to 50 members.');
    const unavailable = memberIds.find((userId) => !canFriendAddToGroup(user.id, userId));
    if (unavailable) return sendError(res, 403, `@${db.users[unavailable].username} does not allow this group invitation.`);
    group.memberIds.push(...memberIds);
    group.updatedAt = nowIso();
    const notifications = memberIds.map((userId) => ({
      userId,
      note: addNotification(userId, 'group_added', user.id, null, `${user.username} added you to ${group.name}.`, { groupId: group.id })
    }));
    await Promise.all([saveGroups(), saveNotifications()]);
    pushToUsers(group.memberIds, { type: 'group:updated', groupId: group.id });
    for (const item of notifications) {
      if (item.note) pushToUser(item.userId, { type: 'notification:new', notification: publicNotification(item.note, item.userId) });
    }
    return sendJson(res, 200, { group: publicGroup(group, user.id) });
  }

  const groupMemberMatch = /^\/api\/groups\/([^/]+)\/members\/([^/]+)$/.exec(pathname);
  if (req.method === 'DELETE' && groupMemberMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupMemberMatch[1]), user.id);
    const memberId = decodeURIComponent(groupMemberMatch[2]);
    if (!group) return sendError(res, 404, 'Group not found.');
    if (!isGroupAdmin(group, user.id)) return sendError(res, 403, 'Only group admins can remove members.');
    if (memberId === group.ownerId) return sendError(res, 400, 'The group owner cannot be removed.');
    if (!group.memberIds.includes(memberId)) return sendError(res, 404, 'Member not found.');
    group.memberIds = group.memberIds.filter((id) => id !== memberId);
    group.adminIds = (group.adminIds || []).filter((id) => id !== memberId);
    group.updatedAt = nowIso();
    await saveGroups();
    pushToUsers([...group.memberIds, memberId], { type: 'group:updated', groupId: group.id });
    return sendJson(res, 200, { group: publicGroup(group, user.id) });
  }

  const groupAdminMatch = /^\/api\/groups\/([^/]+)\/admins\/([^/]+)$/.exec(pathname);
  if (groupAdminMatch && ['POST', 'DELETE'].includes(req.method)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupAdminMatch[1]), user.id);
    const memberId = decodeURIComponent(groupAdminMatch[2]);
    if (!group) return sendError(res, 404, 'Group not found.');
    if (group.ownerId !== user.id) return sendError(res, 403, 'Only the group owner can manage admins.');
    if (!group.memberIds.includes(memberId)) return sendError(res, 404, 'Member not found.');
    if (req.method === 'POST' && !group.adminIds.includes(memberId)) group.adminIds.push(memberId);
    if (req.method === 'DELETE' && memberId !== group.ownerId) group.adminIds = group.adminIds.filter((id) => id !== memberId);
    group.updatedAt = nowIso();
    await saveGroups();
    pushToUsers(group.memberIds, { type: 'group:updated', groupId: group.id });
    return sendJson(res, 200, { group: publicGroup(group, user.id) });
  }

  const groupLeaveMatch = /^\/api\/groups\/([^/]+)\/leave$/.exec(pathname);
  if (req.method === 'POST' && groupLeaveMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupLeaveMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    const remaining = group.memberIds.filter((memberId) => memberId !== user.id);
    if (!remaining.length) {
      delete db.groups[group.id];
    } else {
      group.memberIds = remaining;
      group.adminIds = (group.adminIds || []).filter((memberId) => memberId !== user.id);
      if (group.ownerId === user.id) {
        group.ownerId = group.adminIds.find((memberId) => remaining.includes(memberId)) || remaining[0];
        if (!group.adminIds.includes(group.ownerId)) group.adminIds.unshift(group.ownerId);
      }
      group.updatedAt = nowIso();
    }
    await saveGroups();
    pushToUsers([...remaining, user.id], { type: 'group:updated', groupId: group.id });
    return sendJson(res, 200, { ok: true });
  }

  const groupAppearanceMatch = /^\/api\/groups\/([^/]+)\/appearance$/.exec(pathname);
  if (groupAppearanceMatch && ['GET', 'PATCH'].includes(req.method)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupAppearanceMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    if (req.method === 'GET') return sendJson(res, 200, { settings: chatAppearanceFor(user.id, group.id) });
    const body = await readJsonBody(req);
    if (!db.chatSettings[user.id]) db.chatSettings[user.id] = {};
    db.chatSettings[user.id][group.id] = cleanChatAppearance({ ...chatAppearanceFor(user.id, group.id), ...body });
    await saveChatSettings();
    return sendJson(res, 200, { settings: db.chatSettings[user.id][group.id] });
  }

  const groupMessageMatch = /^\/api\/groups\/([^/]+)\/messages$/.exec(pathname);
  if (groupMessageMatch && ['GET', 'POST'].includes(req.method)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupMessageMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    const list = ensureChatMessages(group.id);
    if (req.method === 'GET') {
      const limit = Math.max(1, Math.min(500, Number(query.get('limit') || 200)));
      const before = String(query.get('before') || '');
      let visible = list
        .filter((message) => !(message.hiddenFor || []).includes(user.id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (before) visible = visible.filter((message) => String(message.createdAt) < before);
      const hasMore = visible.length > limit;
      return sendJson(res, 200, {
        messages: visible.slice(Math.max(0, visible.length - limit)).map(decorateMessage),
        hasMore,
        group: publicGroup(group, user.id)
      });
    }
    const body = await readJsonBody(req);
    const kind = ['text', 'image', 'video', 'document', 'voice', 'sticker', 'gif'].includes(body.kind) ? body.kind : 'text';
    const text = cleanText(body.text || '', kind === 'text' ? 8000 : 500);
    if (kind === 'text' && !text) return sendError(res, 400, 'Message cannot be empty.');
    let file = null;
    if (kind === 'gif' && body.gifId) {
      const gif = db.gifs[cleanText(body.gifId || '', 120)];
      if (!gif || gif.status !== 'approved' || !db.files[gif.fileId]) return sendError(res, 404, 'GIF not found.');
      file = db.files[gif.fileId];
    } else if (kind === 'gif') {
      return sendError(res, 403, 'GIFs must be approved in the shared pool before they can be sent.');
    } else if (body.file?.dataUrl) {
      const incomingMime = mimeFromDataUrl(body.file.dataUrl);
      if (kind === 'image' && !incomingMime.startsWith('image/')) return sendError(res, 400, 'That file is not an image.');
      if (kind === 'image' && isAnimatedImageDataUrl(body.file.dataUrl)) return sendError(res, 403, 'Animated images must be approved in the shared GIF pool before they can be sent.');
      if (kind === 'video' && !incomingMime.startsWith('video/')) return sendError(res, 400, 'That file is not a video.');
      if (kind === 'voice' && !incomingMime.startsWith('audio/')) return sendError(res, 400, 'That file is not audio.');
      if (kind === 'sticker' && !incomingMime.startsWith('image/')) return sendError(res, 400, 'That sticker is not an image.');
      if (kind === 'gif' && !['image/gif', 'image/webp'].includes(incomingMime)) return sendError(res, 400, 'Choose an animated GIF or WebP file.');
      file = await saveUpload(body.file, user.id, kind === 'gif' ? 'message-gif' : kind);
    }
    if (['image', 'video', 'document', 'voice', 'sticker', 'gif'].includes(kind) && !file) return sendError(res, 400, 'This message type needs a file.');
    const message = {
      id: id('msg'),
      chatId: group.id,
      groupId: group.id,
      senderId: user.id,
      recipientId: null,
      kind,
      text,
      replyTo: body.replyTo && list.some((item) => item.id === body.replyTo) ? body.replyTo : null,
      attachment: file ? { id: file.id, name: file.originalName, mime: file.mime, size: file.size } : null,
      stickerId: kind === 'sticker' ? cleanText(body.stickerId || file?.id || '', 120) : null,
      hiddenFor: [],
      reactions: {},
      messageStickers: [],
      pinnedAt: null,
      pinnedBy: null,
      forwardedFrom: null,
      createdAt: nowIso(),
      deletedAt: null,
      deletedBy: null
    };
    if (file && file.scope !== 'gif') {
      file.messageId = message.id;
      await saveFiles();
    }
    list.push(message);
    group.updatedAt = message.createdAt;
    const decorated = decorateMessage(message);
    const notifications = group.memberIds
      .filter((memberId) => memberId !== user.id)
      .map((memberId) => ({
        memberId,
        note: addNotification(memberId, 'message', user.id, null, `${group.name}: ${user.username}: ${messageSnippet(message)}`, { groupId: group.id })
      }));
    await Promise.all([saveMessages(), saveGroups(), saveNotifications()]);
    pushToUsers(group.memberIds, { type: 'message:new', chatId: group.id, groupId: group.id, message: decorated });
    for (const item of notifications) {
      if (item.note) pushToUser(item.memberId, { type: 'notification:new', notification: publicNotification(item.note, item.memberId) });
    }
    return sendJson(res, 201, { message: decorated });
  }

  const groupExportMatch = /^\/api\/groups\/([^/]+)\/export$/.exec(pathname);
  if (req.method === 'GET' && groupExportMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const group = groupForMember(decodeURIComponent(groupExportMatch[1]), user.id);
    if (!group) return sendError(res, 404, 'Group not found.');
    const messages = (db.messages[group.id] || [])
      .filter((message) => !(message.hiddenFor || []).includes(user.id))
      .map(decorateMessage);
    const created = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'group';
    const format = query.get('format') === 'html' ? 'html' : 'json';
    if (format === 'html') {
      const rows = messages.map((message) => {
        const sender = db.users[message.senderId];
        const content = message.deletedAt
          ? '<em>Message deleted</em>'
          : `${escapeHtml(message.text || '')}${message.attachment ? `<br><a href="${escapeHtml(message.attachment.downloadUrl)}">${escapeHtml(message.attachment.name)}</a>` : ''}`;
        return `<article><small>${escapeHtml(`${new Date(message.createdAt).toLocaleString()} | ${sender?.username || message.senderId} | ${message.kind}`)}</small><p>${content}</p></article>`;
      }).join('\n');
      const html = `<!doctype html><meta charset="utf-8"><title>Group chat export</title><style>body{font:16px system-ui;background:#05070b;color:#f4f7fb;padding:24px}article{border-bottom:1px solid #263241;padding:12px 0}small{color:#8996a7}a{color:#4fd2c2}</style><h1>${escapeHtml(group.name)}</h1>${rows}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="group-${safeName}-${created}.html"` });
      return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="group-${safeName}-${created}.json"` });
    return res.end(JSON.stringify({ exportedAt: nowIso(), viewer: publicUser(user, user.id), group: publicGroup(group, user.id), messages }, null, 2));
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
    for (const group of Object.values(db.groups)) {
      if (!(group.memberIds || []).includes(user.id)) continue;
      for (const message of db.messages[group.id] || []) {
        if ((message.hiddenFor || []).includes(user.id)) continue;
        if (!messageSearchText(message).toLowerCase().includes(term)) continue;
        results.push({
          chatId: group.id,
          group: publicGroup(group, user.id),
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

  const chatAppearanceMatch = /^\/api\/chats\/([^/]+)\/appearance$/.exec(pathname);
  if (chatAppearanceMatch && ['GET', 'PATCH'].includes(req.method)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const peer = db.users[decodeURIComponent(chatAppearanceMatch[1])];
    if (!peer || !canViewChat(user.id, peer.id)) return sendError(res, 404, 'Chat not found.');
    if (req.method === 'GET') return sendJson(res, 200, { settings: chatAppearanceFor(user.id, peer.id) });
    const body = await readJsonBody(req);
    if (!db.chatSettings[user.id]) db.chatSettings[user.id] = {};
    db.chatSettings[user.id][peer.id] = cleanChatAppearance({
      ...chatAppearanceFor(user.id, peer.id),
      ...body
    });
    await saveChatSettings();
    return sendJson(res, 200, { settings: db.chatSettings[user.id][peer.id] });
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
    const kind = ['text', 'image', 'video', 'document', 'voice', 'sticker', 'gif'].includes(body.kind) ? body.kind : 'text';
    const text = cleanText(body.text || '', kind === 'text' ? 8000 : 500);
    if (kind === 'text' && !text) return sendError(res, 400, 'Message cannot be empty.');

    let file = null;
    if (kind === 'gif' && body.gifId) {
      const gif = db.gifs[cleanText(body.gifId || '', 120)];
      if (!gif || gif.status !== 'approved' || !db.files[gif.fileId]) return sendError(res, 404, 'GIF not found.');
      file = db.files[gif.fileId];
    } else if (kind === 'gif') {
      return sendError(res, 403, 'GIFs must be approved in the shared pool before they can be sent.');
    } else if (body.file?.dataUrl) {
      const incomingMime = mimeFromDataUrl(body.file.dataUrl);
      if (kind === 'image' && !incomingMime.startsWith('image/')) return sendError(res, 400, 'That file is not an image.');
      if (kind === 'image' && isAnimatedImageDataUrl(body.file.dataUrl)) return sendError(res, 403, 'Animated images must be approved in the shared GIF pool before they can be sent.');
      if (kind === 'video' && !incomingMime.startsWith('video/')) return sendError(res, 400, 'That file is not a video.');
      if (kind === 'voice' && !incomingMime.startsWith('audio/')) return sendError(res, 400, 'That file is not audio.');
      if (kind === 'sticker' && !incomingMime.startsWith('image/')) return sendError(res, 400, 'That sticker is not an image.');
      if (kind === 'gif' && !['image/gif', 'image/webp'].includes(incomingMime)) return sendError(res, 400, 'Choose an animated GIF or WebP file.');
      file = await saveUpload(body.file, user.id, kind === 'gif' ? 'message-gif' : kind);
    }
    if (['image', 'video', 'document', 'voice', 'sticker', 'gif'].includes(kind) && !file) {
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
      reactions: {},
      messageStickers: [],
      pinnedAt: null,
      pinnedBy: null,
      forwardedFrom: null,
      createdAt: nowIso(),
      deletedAt: null,
      deletedBy: null
    };
    if (file && file.scope !== 'gif') {
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
      if (!canViewMessage(user.id, message)) return sendError(res, 404, 'Message not found.');
      reportedChatId = chatId;
      reportedMessage = message;
      reportedUser = db.users[message.senderId];
      if (reportedUser?.id === user.id) return sendError(res, 400, 'Choose a message from another user to report.');
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

  const reactionMatch = /^\/api\/messages\/([^/]+)\/reaction$/.exec(pathname);
  if (req.method === 'POST' && reactionMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(reactionMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const { chatId, message } = found;
    if (!canViewMessage(user.id, message)) {
      return sendError(res, 404, 'Message not found.');
    }
    if (message.deletedAt) return sendError(res, 400, 'Deleted messages cannot be reacted to.');
    const body = await readJsonBody(req);
    const emoji = String(body.emoji || '');
    if (emoji && !MESSAGE_REACTIONS.has(emoji)) return sendError(res, 400, 'Choose a supported reaction.');
    if (!message.reactions || typeof message.reactions !== 'object') message.reactions = {};
    if (!emoji || message.reactions[user.id] === emoji) delete message.reactions[user.id];
    else message.reactions[user.id] = emoji;
    await saveMessages();
    const decorated = decorateMessage(message);
    pushToUsers(participantsForChatId(chatId), { type: 'message:updated', chatId, message: decorated });
    return sendJson(res, 200, { message: decorated });
  }

  const pinMessageMatch = /^\/api\/messages\/([^/]+)\/pin$/.exec(pathname);
  if (req.method === 'POST' && pinMessageMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(pinMessageMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const { chatId, message } = found;
    if (!canViewMessage(user.id, message)) {
      return sendError(res, 404, 'Message not found.');
    }
    if (message.deletedAt) return sendError(res, 400, 'Deleted messages cannot be pinned.');
    const body = await readJsonBody(req);
    const pinned = typeof body.pinned === 'boolean' ? body.pinned : !message.pinnedAt;
    message.pinnedAt = pinned ? nowIso() : null;
    message.pinnedBy = pinned ? user.id : null;
    await saveMessages();
    const decorated = decorateMessage(message);
    pushToUsers(participantsForChatId(chatId), { type: 'message:updated', chatId, message: decorated });
    return sendJson(res, 200, { message: decorated });
  }

  const messageStickerMatch = /^\/api\/messages\/([^/]+)\/stickers$/.exec(pathname);
  if (req.method === 'POST' && messageStickerMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(messageStickerMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const { chatId, message } = found;
    if (!canInteractWithMessage(user.id, message)) {
      return sendError(res, 404, 'Message not found.');
    }
    if (message.deletedAt) return sendError(res, 400, 'Deleted messages cannot have stickers.');
    const body = await readJsonBody(req);
    if (!body.file?.dataUrl || !mimeFromDataUrl(body.file.dataUrl).startsWith('image/')) {
      return sendError(res, 400, 'Choose an image sticker.');
    }
    const file = await saveUpload(body.file, user.id, 'message-sticker-overlay');
    file.messageId = message.id;
    if (!Array.isArray(message.messageStickers)) message.messageStickers = [];
    message.messageStickers.push({ id: id('msticker'), userId: user.id, fileId: file.id, createdAt: nowIso() });
    message.messageStickers = message.messageStickers.slice(-6);
    await Promise.all([saveFiles(), saveMessages()]);
    const decorated = decorateMessage(message);
    pushToUsers(participantsForChatId(chatId), { type: 'message:updated', chatId, message: decorated });
    return sendJson(res, 201, { message: decorated });
  }

  const forwardMessageMatch = /^\/api\/messages\/([^/]+)\/forward$/.exec(pathname);
  if (req.method === 'POST' && forwardMessageMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(forwardMessageMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const source = found.message;
    if (!canViewMessage(user.id, source) || source.deletedAt) {
      return sendError(res, 404, 'Message not found.');
    }
    const body = await readJsonBody(req);
    const targetGroup = body.groupId ? groupForMember(cleanText(body.groupId, 120), user.id) : null;
    const peer = targetGroup ? null : db.users[cleanText(body.recipientId || '', 120)];
    if (!targetGroup && (!peer || !canChat(user.id, peer.id))) return sendError(res, 404, 'Chat not found.');
    const chatId = targetGroup?.id || chatIdFor(user.id, peer.id);
    const list = ensureChatMessages(chatId);
    const sourceFile = source.attachment?.id ? db.files[source.attachment.id] : null;
    const file = sourceFile?.scope === 'gif'
      ? sourceFile
      : await cloneStoredFile(sourceFile, user.id, `forward-${source.kind}`);
    if (source.attachment && !file) return sendError(res, 404, 'The attached file is no longer available.');
    const message = {
      id: id('msg'),
      chatId,
      groupId: targetGroup?.id || null,
      senderId: user.id,
      recipientId: peer?.id || null,
      kind: source.kind,
      text: source.text || '',
      replyTo: null,
      attachment: file ? { id: file.id, name: file.originalName, mime: file.mime, size: file.size } : null,
      stickerId: source.stickerId || null,
      hiddenFor: [],
      reactions: {},
      messageStickers: [],
      pinnedAt: null,
      pinnedBy: null,
      forwardedFrom: source.id,
      createdAt: nowIso(),
      deletedAt: null,
      deletedBy: null
    };
    if (file && file.scope !== 'gif') file.messageId = message.id;
    list.push(message);
    const decorated = decorateMessage(message);
    const recipients = targetGroup ? targetGroup.memberIds.filter((memberId) => memberId !== user.id) : [peer.id];
    const notifications = recipients.map((memberId) => ({
      memberId,
      note: addNotification(memberId, 'message', user.id, null, `${targetGroup ? `${targetGroup.name}: ` : ''}${user.username}: Forwarded ${messageSnippet(message)}`, targetGroup ? { groupId: targetGroup.id } : {})
    }));
    await Promise.all([saveFiles(), saveMessages(), saveNotifications()]);
    pushToUsers(targetGroup?.memberIds || [user.id, peer.id], { type: 'message:new', chatId, groupId: targetGroup?.id || null, message: decorated });
    for (const item of notifications) {
      if (!item.note) continue;
      pushToUser(item.memberId, {
        type: 'notification:new',
        pendingRequestCount: pendingIncomingRequests(item.memberId).length,
        notification: publicNotification(item.note, item.memberId)
      });
    }
    return sendJson(res, 201, { message: decorated });
  }

  const hideMessageMatch = /^\/api\/messages\/([^/]+)\/me$/.exec(pathname);
  if (req.method === 'DELETE' && hideMessageMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const found = findMessage(decodeURIComponent(hideMessageMatch[1]));
    if (!found) return sendError(res, 404, 'Message not found.');
    const { chatId, message } = found;
    if (!canViewMessage(user.id, message)) return sendError(res, 404, 'Message not found.');
    if (!Array.isArray(message.hiddenFor)) message.hiddenFor = [];
    if (!message.hiddenFor.includes(user.id)) message.hiddenFor.push(user.id);
    await saveMessages();
    pushToUser(user.id, { type: 'message:hidden', chatId, messageId: message.id });
    return sendJson(res, 200, { ok: true });
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
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
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
    const headers = {
      'Content-Type': type,
      'Content-Length': stat.size
    };
    if (['.html', '.css', '.js'].includes(ext)) {
      headers['Cache-Control'] = 'no-store, max-age=0';
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
    }
    res.writeHead(200, headers);
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
  if (message.type === 'typing' && message.groupId) {
    const group = groupForMember(String(message.groupId), client.userId);
    if (group) {
      pushToUsers(group.memberIds.filter((userId) => userId !== client.userId), {
        type: 'typing',
        from: client.userId,
        groupId: group.id,
        isTyping: Boolean(message.isTyping)
      });
    }
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
