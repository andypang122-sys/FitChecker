# FitChecker 👕✓

**Know your fit before you buy.** Save your body measurements once, add any garment, and FitChecker tells you how it will fit — *too tight, too loose, too short, too long* — zone by zone, and which size you should actually buy.

FitChecker is a **Progressive Web App (PWA)**: one codebase that runs in any browser and installs like a native app on **iOS, Android and desktop**, and works offline once installed.

---

## ▶️ How to run it

The app is plain HTML/CSS/JS — no build step, no dependencies to install.

**Recommended:**

```
cd FitChecker
python server.py
```

then open **http://localhost:8000** in your browser. `server.py` (Python 3, no dependencies) serves the app **and** powers the brand size-guide reader.

**Fallback (double-click):** open `index.html` in any browser. Everything works except offline caching and the brand size-guide reader.

> The live camera requires a *secure context*: `http://localhost` works, plain `file://` or LAN IPs do not — but **photo upload always works everywhere**, so nothing is blocked.

### Install it as an app
- **iPhone / iPad:** open in Safari → Share → **Add to Home Screen**
- **Android:** open in Chrome → menu ⋮ → **Add to Home screen / Install app**
- **Desktop:** Chrome/Edge → install icon in the address bar

*(To use it on your phone, host the folder anywhere with HTTPS — GitHub Pages, Netlify, Vercel — all free, no server code needed.)*

---

## ✨ What it does

| Feature | Details |
|---|---|
| **Guest-first** | No login wall — anyone can run a full fit check by typing their measurements. An animated splash greets you on launch. |
| **Login when it matters** | An account (free, on-device) is only asked for when you want to *save* things: body profiles ("diameter"), camera/photos, and history. Passwords are salted + SHA-256 hashed; sessions persist ("keep me logged in" = 30 days). Measurements typed as a guest are auto-saved to your profile when you sign up. |
| **Help & tutorial** | A dedicated Help tab teaches how to measure like a tailor, how to read the verdict, and answers FAQs. |
| **Body profiles** | Save height, weight, chest, waist, hips, shoulders, arm length, inseam, thigh — plus a face photo and full-body photo. Multiple profiles per account (you, family members…). |
| **Camera or upload** | Take a photo with the live camera (front/back switchable) or upload from your gallery. Images are compressed on-device. |
| **Fit analysis** | Pick a garment type (t-shirt, shirt, hoodie, jacket, dress, jeans, shorts, skirt), your fit preference (slim / regular / relaxed) and optionally the size you're eyeing. |
| **Brand size guides** | Paste a link to a product or size-guide page. The server fetches it, finds the brand's size chart in the HTML (following "size guide" links one level deep), converts inches/ranges/flat-widths to body cm, and judges every size by the brand's own numbers. Works on server-rendered charts; JS-only charts can't be read — paste the size-guide page itself for best results. |
| **The verdict** | A 0–100 fit score, a plain-English verdict, per-zone results (chest, waist, hips, shoulders, sleeves, length…) each marked **good / too tight / too loose / too short / too long** with the reason and how many cm off it is. |
| **Best size** | Every size (XS–XXL) is scored; the best one is recommended with a confidence rating based on how complete your measurements are. |
| **The size on the tag** | Almost nothing is sold as "L". Every recommendation also shows US / UK / EU numbers, collar size for men's shirts, and a real **W×L** for jeans derived from your waist and inseam — the conversion is exactly where people buy the wrong thing. |
| **Did it actually fit?** | After you've worn it, say whether it ran tight, loose or true. Reports accumulate into a personal calibration: if you consistently need more room than the chart assumes, later checks account for it (clamped to ±4 cm so it nudges a borderline call and never overrides your own measurements). |
| **Brand reputation** | Fit reports are also shared anonymously — brand, garment, size and outcome, nothing else — so "this brand runs small" becomes a fact instead of a rumour. |
| **Second-hand check** | Paste any Vinted / Depop / eBay / Grailed listing. It reads the seller's own measurements out of the free text — "pit to pit 56cm, length 68cm" — doubles the flat ones into real garment girths, and answers the only question that matters when there are no returns: will *this* garment fit *you*. |
| **Proven by your closet** | Every wardrobe item records its brand and the size on the label, so the Size Passport can show the sizes you have actually proved fit — grouped per brand and per top/bottom/outerwear, with worn garments counting for more than unworn ones. It also flags brands that sold you two different sizes. |
| **Measurements that expire** | Bodies move, and a verdict computed from two-year-old numbers used to claim exactly the same confidence as one computed from today's. Measurements now carry the date they were taken, their age comes off the confidence score (nothing under six months, capped at 25 points so old numbers are never treated as worthless), the result says plainly how old they are, and a re-measure reminder is scheduled twice a year. |
| **Fit map** | A body silhouette colored by zone so you see problem areas at a glance. |
| **History** | Every fit check is saved to your account — reopen any past verdict. |
| **Units** | Switch between cm and inches anywhere in Settings. |

## 🔒 Privacy

**Guest mode is genuinely on-device.** Run a fit check without an account and your measurements never leave the browser.

Once you create an account or use a feature that needs the server, data does leave the device. Being precise about this matters: an inaccurate privacy declaration is grounds for removal from both app stores *after* you are live. What actually goes where:

| Data | Where it goes |
|---|---|
| Email, display name, password hash | **Server** — `accounts.json` (password is scrypt-hashed, never stored in the clear) |
| Body measurements, wardrobe, favourites | **Server** — `wardrobe/<hash>.json`, when you link a cloud account |
| Community outfit photos | **Server** — `data/outfits.json` + `data/thumbs/` |
| Size-chart screenshots | **Google (Gemini API)** — sent for text extraction |
| UI strings, when translated | **Google (translate endpoint)** |
| Anonymous fit reports | **Server** — brand + garment + size + outcome only; no account, no measurements |
| Quiz analytics | Device only, never transmitted |

Delete everything at any time: Settings → "Delete my account & data", which erases the account record, every session token, and the wardrobe file. See `LAUNCH.md` Part E.2 for the full store-questionnaire answer sheet.

## 🧠 How the fit engine works

`js/fit-engine.js` holds size charts (the body measurements each size is designed for, based on common international sizing) and per-zone *ease* targets — how much extra room a slim/regular/relaxed fit should have at the chest, waist, hips, etc.

For each size it computes `garment − body − ideal ease` per zone. Within tolerance → **good**; below → **tight**; above → **loose**. Length zones (sleeves, garment length, inseam) compare against your arm length/inseam, or a height-derived ideal. Zone scores are weighted (girth matters more than length; *tight* is penalized more than *loose*) into the overall score, and the best-scoring size wins.

## 📁 Project structure

```
FitChecker/
├── index.html          app shell
├── css/styles.css      design system (mobile-first, sidebar on desktop)
├── js/
│   ├── storage.js      localStorage persistence (accounts, session)
│   ├── auth.js         local register / login / logout / password change
│   ├── cloud.js        optional server account + wardrobe sync
│   ├── fit-engine.js   size charts, fit math, real-world size labels
│   ├── fit-feedback.js "did it fit?" reports + personal calibration
│   ├── resale.js       reads seller measurements out of a listing
│   ├── staleness.js    how old the measurements are, and what that costs
│   ├── wardrobe.js     the closet (IndexedDB) + the per-brand size ledger
│   ├── camera.js       live camera + upload + image compression
│   └── app.js          views, routing, analyze wizard, results
├── server.py           static host + size-guide reader + accounts API
├── tests/              fit-engine and server tests (./tests/run.sh)
├── manifest.json       PWA manifest
├── sw.js               service worker (offline cache)
└── icon.svg            app icon
```

## ⚠️ Honest limitations

- Fit verdicts come from **measurement math against standard size charts**, not from AI image analysis — the photos personalize your profile and results view, but the numbers do the judging. Real brands vary; when a brand publishes its own size chart, trust that too.
- The **generic size ladder is a national-average approximation**, so its confidence is capped at 90%. A chart scraped from the brand's own page is the only ground truth and scores higher.
- The **size-guide reader only sees server-rendered HTML tables.** Charts drawn by JavaScript can't be read — paste the size-guide page itself for the best result.
- **Local accounts (`js/auth.js`) are per-device.** Logging in elsewhere needs a linked cloud account (`js/cloud.js`).
- A "virtual try-on" render (your photo wearing the garment) requires a generative-AI backend and is out of scope.

## 🧪 Tests

```
./tests/run.sh
```

No dependencies — Node for the browser modules, Python 3 for the server. It parses every script the page loads (a duplicate declaration takes the whole app down at load time and no unit test importing one module in isolation would notice), then covers the size math, the calibration clamp, the real-world size labels, the second-hand listing parser, the closet size ledger, and the server's SSRF, password-hashing, rate-limiting and account-deletion behaviour.
