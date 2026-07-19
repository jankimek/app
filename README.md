# Chat Website Starter

This is a small full-stack social and chat website you can run with Node.js. It includes a photo/video feed, profiles, stories, highlights, Notes, account discovery, private accounts, real-time chat, media messages, optional 2FA, and basic WebRTC call signaling.

This is a learning-friendly starter app, not a finished Instagram-scale production system. It uses JSON files and disk uploads so you can understand and deploy it before adding a real database later.

GitHub should be used first to store your code. Oracle Cloud Free Tier should run the live website and store the real app data, because GitHub Pages cannot run a Node.js login/chat server or save user uploads.

## What Is Included

- Permanent tag username plus password signup, with optional email and phone; login accepts any of those identifiers.
- Customized verification emails through the host's `sendmail` service, account contact management, and password changes.
- Optional authenticator-app 2FA.
- Public user pages at `/u/username`.
- Responsive Instagram-inspired Home feed with For you, Following, and Favorites views; story rail, desktop suggestions, likes, comments, reposts, sharing, saves, and swipeable media.
- Three-step photo/video post composer with up to 20 mixed items, ordered thumbnails, add/remove/reorder controls, per-item drag/pinch/wheel crop, shared and mixed aspect modes, filters/adjustments, streamed uploads, captions, hashtags, and positioned person tags.
- Custom inline video playback with byte-range streaming plus a vertically snapping **Clips** tab, one-line captions, audio pages, Use Audio, and credited remixes.
- In-place post detail viewing from Explore, profiles, DMs, maps, and account activity, with browser-back and source-page scroll/state preservation.
- Profile tab with display name, permanent tag username, post/follower/following counts, profile details, 24-hour stories, editable highlights, and profile-link sharing.
- Profile media tabs for posts, private saves, reposts, and tagged photos/videos.
- Search Explore grid, account suggestions, favorites, post activity, and block-aware discovery.
- 24-hour Notes above chats and on your profile, including searchable music, automatic title/artist credit, selectable sections, and original-audio snippets up to 30 seconds.
- Inbox Map for location-tagged posts with explicit, device-only current-location controls, plus camera-only Instants that disappear from recipients after opening and remain in a private one-year sender archive.
- Account, privacy, interaction, Close Friends, blocked-user, comment-history, and repost settings, including Close Friends story/Instant audiences.
- Full-screen story editor with direct text editing, movable/rotatable text and stickers, drawing, filters, interactive polls/quizzes/sliders, mentions, maps, live weather, audio clips, and downloads.
- Searchable GIPHY GIFs in chat when `GIPHY_API_KEY` is configured, with a separate shared upload pool under moderator control; the usernames in `MODERATOR_USERNAMES` can approve or remove submissions. The chat picker does not fall back to another catalog.
- Searchable iTunes music previews for single-video clips and Notes, with canonical title/artist metadata and a 15- or 30-second section picker; Openverse/Jamendo remains available through `MUSIC_PROVIDER=openverse`.
- Full-screen story/highlight viewer with progress, navigation, likes, comments, and private-account access control.
- Phone-first bottom navigation for Home, Search, Create, Clips, and Profile, with Messages in the Home header; desktop uses an expanded navigation rail.
- Username search, friend requests, and a notification center for accepting or declining requests.
- Conversation search, message requests, and suggested chats on the Messages tab.
- Public/private followers and following lists.
- Friends-of-friends recommendations on the Profile tab.
- Real-time direct messages through WebSockets.
- Message sent date and time.
- Swipe your own message left, or the other user's message right, to reply; reverse the gesture before releasing to cancel.
- Only the sender can delete a message.
- Remove, mute, and block controls from a user's chat profile.
- Send images, videos, documents, and voice notes.
- Hold the microphone button to record a voice message, slide left to cancel, or slide up to lock before sending.
- Create stickers on your device. When another user receives one, they must download it before viewing it.
- Export a chat as JSON or HTML.
- Download image/file metadata as JSON before deleting the message.
- Full-screen direct and group voice/video calls using call-scoped WebRTC signaling, with collision/busy handling, add-people, minimize, independent speaker/microphone, camera, and camera-flip controls.

## Project Files

```text
server.js           Node.js server, API, auth, uploads, realtime sockets
public/index.html   Browser entry point
public/app.js       Chat interface and browser-side features
public/styles.css   Mobile-friendly dark Instagram-like design
deploy/oracle/      Templates for Oracle systemd, Caddy, env, and backups
.github/workflows/  GitHub Actions syntax and integration checks
.env.example        Local environment variable example
data/               Created when the app runs; stores users/messages/sessions
uploads/            Created when files are uploaded
```

`data/` and `uploads/` are ignored by Git because they contain private user data.

## Run It On Your Computer

1. Install Node.js 18 or newer from https://nodejs.org.

2. Open PowerShell in this folder:

   ```powershell
   cd "C:\Users\2.Emran\OneDrive\Dokumente\New project"
   ```

3. Check Node:

   ```powershell
   node --version
   ```

4. Check the code:

   ```powershell
   npm run check
   ```

5. Run the isolated integration tests:

   ```powershell
   npm test
   ```

6. Start the app:

   ```powershell
   npm start
   ```

7. Open:

   ```text
   http://localhost:3000
   ```

8. Create two test accounts. To test chatting with yourself, open one account in your normal browser and the other in a private/incognito window.

## Put The Code On GitHub First

1. Create a new empty GitHub repository. You can name it anything you like, for example `chat-app`. Do not add a README, license, or `.gitignore` on GitHub because this folder already has them.

2. In PowerShell, run:

   ```powershell
   cd "C:\Users\2.Emran\OneDrive\Dokumente\New project"
   git init
   git add .
   git commit -m "Initial chat app"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-NAME/YOUR-REPO-NAME.git
   git push -u origin main
   ```

3. Replace `YOUR-GITHUB-NAME` and `YOUR-REPO-NAME` with your real GitHub username and repository name.

4. After pushing, GitHub will run the syntax check in `.github/workflows/check.yml`.

If GitHub asks for a password in the terminal, use a GitHub personal access token instead of your account password.

Important: GitHub stores your source code. The real website with login, messages, profile pictures, uploads, and saved chats needs Oracle or another server.

## Deploy On Oracle Cloud Free Tier

The beginner path is:

1. Create an Oracle Cloud Free Tier compute instance.
2. Open web ports in Oracle networking.
3. SSH into the VM.
4. Install Node.js and Git.
5. Clone your GitHub repo.
6. Run the chat app with `systemd`.
7. Add HTTPS with a domain name.

### 1. Create The VM

In Oracle Cloud:

1. Go to Compute, then Instances.
2. Create an instance.
3. Choose Ubuntu if available.
4. Pick an Always Free shape, for example `VM.Standard.A1.Flex` if your region has capacity.
5. Make sure the instance has a public IPv4 address.
6. Save your SSH private key safely.

Oracle says Always Free compute availability depends on your home region and shape capacity, so if A1 has no capacity, try a different availability domain or a smaller Always Free shape.

### 2. Open Oracle Network Ports

In the VCN security list or network security group for the instance, add ingress rules:

```text
TCP 22   Source: your own IP only if possible
TCP 80   Source: 0.0.0.0/0
TCP 443  Source: 0.0.0.0/0
TCP 3000 Source: your own IP only, temporary testing only
```

Port `3000` is only for direct testing. Public users should use HTTPS through port `443`.

### 3. SSH Into The VM

From your computer:

```powershell
ssh ubuntu@YOUR_ORACLE_PUBLIC_IP
```

### 4. Install Tools

On the Oracle VM:

```bash
sudo apt update
sudo apt install -y git nodejs npm
node --version
```

If `node --version` is lower than `18`, install a newer Node.js release before continuing.

### 5. Download Your App

```bash
git clone https://github.com/YOUR-GITHUB-NAME/YOUR-REPO-NAME.git
cd YOUR-REPO-NAME
npm start
```

Open this in your browser for a quick test:

```text
http://YOUR_ORACLE_PUBLIC_IP:3000
```

You can also check the lightweight health URL:

```text
http://YOUR_ORACLE_PUBLIC_IP:3000/health
```

Stop it with `Ctrl+C` after the test.

### 6. Keep It Running With systemd

Create folders for private app data:

```bash
sudo mkdir -p /var/lib/chat-app/data /var/lib/chat-app/uploads /etc/chat-app
sudo chown -R ubuntu:ubuntu /var/lib/chat-app
```

Copy the environment template:

```bash
sudo cp deploy/oracle/chat-app.env.example /etc/chat-app/chat-app.env
sudo nano /etc/chat-app/chat-app.env
```

Set `MODERATOR_USERNAMES` to your website username. Weather uses Open-Meteo automatically; adding a `GOOGLE_WEATHER_API_KEY` makes the server try Google Weather first and fall back when it is unavailable. Add a GIPHY web API key as `GIPHY_API_KEY` to enable direct GIPHY search; GIPHY requires browser-side search requests, so restrict that key to your production origin in the GIPHY dashboard. Music uses the public iTunes Search API by default and needs no key; set `ITUNES_COUNTRY` for the storefront or `MUSIC_PROVIDER=openverse` to use Openverse/Jamendo instead. A production `OPENVERSE_BEARER_TOKEN` raises fallback catalog limits. `OPENVERSE_MEDIA_HOSTS` is only for explicitly trusted additional media hosts and should normally stay empty. Set `MAIL_FROM` to your verified sender identity and `SENDMAIL_PATH` to the server's sendmail-compatible binary so verification emails can be delivered. Keep secret credentials only in this server environment file, never in GitHub.

Copy the service template:

```bash
sudo cp deploy/oracle/chat-app.service.example /etc/systemd/system/chat-app.service
sudo nano /etc/systemd/system/chat-app.service
```

Replace `YOUR-REPO-NAME` with your real cloned folder name. If your VM username is not `ubuntu`, replace `User=ubuntu` too.

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat-app
sudo systemctl status chat-app
```

View logs:

```bash
journalctl -u chat-app -f
```

### 7. Add HTTPS

Microphone, camera, and secure cookies need HTTPS outside `localhost`.

1. Buy or use a domain name.
2. Add a DNS `A` record pointing your domain to the Oracle public IP.
3. Install Caddy or another reverse proxy.
4. Proxy your domain to `localhost:3000`.

This repo has a template at `deploy/oracle/Caddyfile.example`.

Copy it:

```bash
sudo cp deploy/oracle/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Replace `yourdomain.com` with your real domain.

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

## Backups

Your private app data is in:

```text
/var/lib/chat-app/data
/var/lib/chat-app/uploads
```

Back it up on the VM:

```bash
cd /home/ubuntu/YOUR-REPO-NAME
bash deploy/oracle/backup.sh
```

Download the backup to your computer:

```powershell
scp ubuntu@YOUR_ORACLE_PUBLIC_IP:/home/ubuntu/chat-app-backups/chat-app-YYYY-MM-DD-HHMMSS.tar.gz .
```

## Important Limits

- This starter uses JSON files, so keep it for learning, family, friends, or a small private group.
- For a real public app, move data to PostgreSQL, add rate limiting, stronger moderation, file scanning, password reset email/SMS, and admin tools.
- WebRTC calls use STUN only. Some networks need a TURN server before calls work reliably.
- Do not commit `data/` or `uploads/` to GitHub.

## Official Docs Used

- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Oracle creating compute instances: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm
- Oracle security lists: https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm
- GitHub repository quickstart: https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories
- GitHub remote repositories: https://docs.github.com/en/get-started/git-basics/managing-remote-repositories
