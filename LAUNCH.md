# FitCheck — Launch Guide (Apple App Store + Google Play)

This is your end-to-end checklist to get FitCheck onto both stores. The code is
ready; what remains is mostly **accounts, hosting, and store paperwork** — the
parts only you can do. Work top to bottom.

> Honest timeline: a first-time dual-store launch is realistically **2–4 weeks**,
> not one week — driven by account approvals and Google's new-account test rule
> (see Part F). The web-install path (Part G) can be live in a **day**.

---

## Part A — Start these TODAY (they're the long pole)

| Task | Cost | Time to clear | Notes |
|------|------|---------------|-------|
| **Apple Developer Program** | $99/yr | 1–2 days (individual); 1–2+ weeks (company, needs D-U-N-S) | developer.apple.com/programs |
| **Google Play Console** | $25 once | Instant sign-up, **but see Part F** | play.google.com/console/signup |
| **A hosting account** | Free–$5/mo | Minutes | Railway, Render, or Fly.io (Part B) |
| **A domain name** | ~$10/yr | Minutes | Optional at first — hosts give you a free `*.up.railway.app` style URL |
| **A Mac _or_ cloud builder** | — / ~$ | — | Needed only for the **iOS** build. No Mac? Use Codemagic (Part E). |

---

## Part B — Deploy the server (this puts the app on the internet)

The app and its API are one Python server with **zero dependencies**. A `Dockerfile`
and `Procfile` are already in this folder.

### Easiest: Railway or Render
1. Put this folder in a **GitHub repo** (the included `.gitignore` keeps your
   moderation key out of it).
2. On Railway/Render → **New Project → Deploy from GitHub repo**. It detects the
   `Dockerfile` automatically.
3. Set env vars:
   - **`FITCHECK_ADMIN_KEY`** = a long random string you choose. This is your
     moderation password and it stays stable across restarts (no disk needed).
   - **`FITCHECK_DATA_DIR`** = a mounted volume path (e.g. `/data`) if your host
     offers one, so community posts survive redeploys. Optional for a soft launch —
     without it, posts reset on redeploy but the app still runs fine.
4. Deploy. The host assigns a public HTTPS URL. `$PORT` is handled for you.

### Fly.io alternative
```
fly launch          # detects the Dockerfile
fly volumes create fitcheck_data --size 1
# mount it at /data in fly.toml, then:
fly deploy
```

### After it's live
- Open `https://YOUR-URL/` — the full app loads (UI **and** API, same origin).
- Your **moderation key** is whatever you set `FITCHECK_ADMIN_KEY` to (or, if you
  didn't set it, an auto-generated one in the logs / `admin_key.txt`). Open
  `https://YOUR-URL/#/moderate` and paste it to review posts.
- Test the community loop: post an outfit → approve it in `/#/moderate` → it
  appears in **Outfits**. Try **Report** and **Block** on a card.

---

## Part C — Fill in the two placeholders

Search the project for `[replace with your support email]` and set a real,
monitored address in:
- `privacy.html`
- `terms.html`

(A free forwarding address that lands in your inbox is fine.) Then note your two
legal URLs — you'll paste them into both stores:
- Privacy Policy: `https://YOUR-URL/privacy.html`
- Terms / Guidelines: `https://YOUR-URL/terms.html`

---

## Part D — Turn the live site into app packages (PWABuilder)

Go to **https://www.pwabuilder.com**, enter `https://YOUR-URL`, and it scores the
app (icons + manifest are already set up for a green score) then generates native
packages.

### Android (Google Play) — a "Trusted Web Activity"
1. PWABuilder → **Android → Generate**. Download the package.
2. It includes an **`assetlinks.json`**. You must serve it at
   `https://YOUR-URL/.well-known/assetlinks.json` — create a `.well-known` folder
   next to `index.html`, drop the file in, redeploy. (Without it, the app shows a
   browser URL bar.)
3. Upload the `.aab` to Play Console.

### iOS (Apple App Store)
1. PWABuilder → **iOS → Generate**. You get an Xcode project.
2. Build + submit it. This step needs macOS/Xcode. **No Mac?** Push the project to
   GitHub and use **Codemagic** (codemagic.io) — it builds, signs, and uploads to
   App Store Connect from the cloud, no Mac required.
3. **(Optional) Share Sheet:** to make FitCheck appear in the iOS share sheet, add
   the kit in `ios/share-extension/` to the Xcode project (see its README). Android
   already has this via the manifest; iOS needs this small native piece.

---

## Part E — Store listing assets (have these ready)

- **App icon 1024×1024**: already generated → `icons/icon-appstore-1024.png`.
- **Screenshots**: capture from your live app on a phone (and tablet for iPad).
  Apple needs 6.7" iPhone shots; Play needs a few phone shots. Show: the fit
  verdict, the size chart reader, and the Outfits feed.
- **Text**: app name (FitCheck), subtitle ("Know your fit before you buy"),
  description, keywords/category (Shopping or Lifestyle).
- **Privacy Policy URL** + **Support URL** (Part C).
- **App Privacy / Data Safety questionnaire** — declare truthfully:
  - *Photos* and *User Content* (caption, display name) — **collected** when a user
    posts to the community; used for **App Functionality**; **not** used for tracking.
  - Account name/email/measurements are stored **only on device** → "not collected."
  - No third-party ads, no analytics SDKs.
- **Age rating**: because there's user-generated content, expect **12+ (Apple) /
  Teen (Google)**. Answer "yes" to user-generated content and describe your
  moderation (review-before-publish + report + block).

---

## Part F — What usually causes rejections (already handled ✓, plus one to watch)

- ✓ **Apple 1.2 (user content):** report button, block, a content-policy agreement
  before posting, human moderation, and a published zero-tolerance policy — all in.
- ✓ **Apple 4.2 (minimum functionality):** FitCheck does real work beyond a web page
  (fit engine, camera measurement, size-guide reader, community) — not a thin wrapper.
- ✓ **Account deletion:** Settings → "Delete my account & data."
- ✓ **Privacy policy** reachable at a real URL.
- ⚠ **Google Play new-account test rule:** a **personal** developer account created
  after Nov 2023 must run a **closed test with ≥20 testers for 14 days** before it
  can publish to production. A **business/organization** account is exempt. If you
  want Play live fast, register as an organization, or start the 20-tester test now.
- ⓘ **Translation note:** the UI translator uses Google's free public endpoint. It's
  fine for launch but can rate-limit under heavy use; consider a paid translation
  API later if the community grows.

---

## Part G — Fastest real launch (optional, can be live in a day)

Once Part B is done, FitCheck is a fully installable app **right now** via the web:
- iPhone: Safari → Share → **Add to Home Screen**
- Android: Chrome → menu → **Install app**

No store, no review, no fee. Great for getting the first users and testers (and it
doubles as your 20 Play testers) while the store submissions work through review.

---

### Quick reference
- Live app: `https://YOUR-URL/`
- Moderation: `https://YOUR-URL/#/moderate` (key in `FITCHECK_DATA_DIR/admin_key.txt`)
- Privacy: `https://YOUR-URL/privacy.html` · Terms: `https://YOUR-URL/terms.html`
- Package: pwabuilder.com · iOS cloud build: codemagic.io
