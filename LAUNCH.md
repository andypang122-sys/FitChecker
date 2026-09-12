# FitChecker — Launch Guide (Apple App Store + Google Play)

This is your end-to-end checklist to get FitChecker onto both stores. The code is
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
   - **`FITCHECK_DATA_DIR`** = the mount path of a **persistent disk** (e.g. `/data`).
   - **`FITCHECK_TRUST_PROXY`** = leave unset (defaults on) behind Railway,
     Render or Fly, so rate limiting sees the real client IP from
     `X-Forwarded-For` instead of lumping every user together as the proxy.
     Set it to `0` **only** if you expose the server directly to the internet —
     there the header is client-controlled and forging it would hand anyone an
     unlimited login budget.
4. Deploy. The host assigns a public HTTPS URL. `$PORT` is handled for you.

> **A persistent disk is no longer optional.** This used to say the disk was a
> nice-to-have, because the only thing on it was community outfit posts — losing
> those on redeploy was a fair trade for free hosting.
>
> That changed when accounts landed. `FITCHECK_DATA_DIR` now holds
> `accounts.json` (every user's login) and `wardrobe/<hash>.json` (every user's
> wardrobe, measurements and favourites). **Without a real disk, every redeploy
> deletes all of it and your users cannot log in again.**
>
> On Render that means a **paid instance** (free tier has no disks) plus the
> `disk:` block in `render.yaml`. Note the Dockerfile's `VOLUME ["/data"]` does
> *not* create the disk — Render only provisions one from `render.yaml` or the
> dashboard. Free hosting is fine for a throwaway demo, not for real signups.

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
3. **(Optional) Share Sheet:** to make FitChecker appear in the iOS share sheet, add
   the kit in `ios/share-extension/` to the Xcode project (see its README). Android
   already has this via the manifest; iOS needs this small native piece.

---

## Part E — Store listing assets (have these ready)

- **App icon 1024×1024**: already generated → `icons/icon-appstore-1024.png`.
- **Screenshots**: capture from your live app on a phone (and tablet for iPad).
  Apple needs 6.7" iPhone shots; Play needs a few phone shots. Show: the fit
  verdict, the size chart reader, and the Outfits feed.
- **Text**: app name (FitChecker), subtitle ("Know your fit before you buy"),
  description, keywords/category (Shopping or Lifestyle).
- **Privacy Policy URL** + **Support URL** (Part C).
- **App Privacy / Data Safety questionnaire** — see the full answer sheet in
  **Part E.2** below. Do not answer from memory: accounts, ads and the Gemini
  vision call all moved data off-device after this guide was first written.
- **Age rating**: because there's user-generated content, expect **12+ (Apple) /
  Teen (Google)**. Answer "yes" to user-generated content and describe your
  moderation (review-before-publish + report + block).

---

## Part E.2 — The privacy answer sheet (verified against the code)

> ⚠ **An earlier version of this guide said email, name and measurements were
> "device only" and that there were no third-party ads. Both are now false.**
> Filing that would be an inaccurate privacy declaration — grounds for removal
> after you're live, not just a rejection. What the code actually does:

| Data | Where it goes | Evidence |
|------|---------------|----------|
| Email, display name, password hash | **Server** — `accounts.json` (scrypt) | `account_register`, server.py |
| Body measurements, wardrobe, favourites | **Server** — `wardrobe/<hash>.json` | `_wardrobe_path`, server.py |
| Photos (community posts) | **Server** — `data/outfits.json` + `data/thumbs/` | `outfits_submit`, server.py |
| Size-chart screenshots | **Sent to Google (Gemini API)** | `_gemini_vision`, server.py |
| UI strings | **Sent to Google (translate endpoint)** | `gtx_translate`, server.py |
| Ad identifiers | **Third-party ad network** | `adsbygoogle` in monetize.js |
| Fit reports (brand/garment/size/outcome) | **Server, anonymous** — no account, no measurements | `fit_feedback_submit`, server.py |
| Quiz analytics | Device-only, never transmitted | js/analytics.js |

> The fit-report row is **not** a "collected data type" for either store: it
> carries no identifier and cannot be linked to a person or device. Declare it
> only if you later add an id to it — at which point it becomes App Activity /
> linked-to-user and both questionnaires change.

### Apple — App Privacy
Declare **collected, linked to identity, NOT used for tracking**:
- **Contact Info** → Email Address, Name
- **User Content** → Photos, Other User Content (captions)
- **Health & Fitness** → body measurements *(Apple treats body metrics here)*
- **Identifiers** → account/user ID
- If ads stay in the build: **Identifiers → Device ID**, purpose **Third-Party
  Advertising**, and you must then answer **YES** to App Tracking Transparency
  and show the ATT prompt.

### Google Play — Data Safety
- Collected **and** shared: Personal info (name, email), Photos, Health & fitness
  (measurements). "Shared" is **yes** because images go to Google's Gemini API.
- Encrypted in transit: **yes** (HTTPS).
- Users can request deletion: **yes** — Settings → "Delete my account & data",
  backed by `account_delete` in server.py. Play also needs a **web-accessible**
  deletion URL, not just an in-app path.
- Data collection is **required, not optional**, for account features.

### Both stores
- **Ads:** AdSense is not licensed for app inventory — use **AdMob** in the
  wrapped builds, or strip ads from v1. Serving AdSense inside a TWA risks the
  AdSense account itself.
- **Paid tier:** `CFG.checkout` is empty, so nothing is sold today. **Ship v1
  with the paid tier off.** External checkout for in-app unlocks collides with
  Apple's IAP rules, and those rules differ by storefront and have been moving
  since 2025 — add IAP deliberately after launch, not during review.

---

## Part F — What usually causes rejections (already handled ✓, plus one to watch)

- ✓ **Apple 1.2 (user content):** report button, block, a content-policy agreement
  before posting, human moderation, and a published zero-tolerance policy — all in.
- ✓ **Apple 4.2 (minimum functionality):** FitChecker does real work beyond a web page
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

Once Part B is done, FitChecker is a fully installable app **right now** via the web:
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
