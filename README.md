# FitCheck 👕✓

**Know your fit before you buy.** Save your body measurements once, add any garment, and FitCheck tells you how it will fit — *too tight, too loose, too short, too long* — zone by zone, and which size you should actually buy.

FitCheck is a **Progressive Web App (PWA)**: one codebase that runs in any browser and installs like a native app on **iOS, Android and desktop**, and works offline once installed.

---

## ▶️ How to run it

The app is plain HTML/CSS/JS — no build step, no dependencies to install.

**Recommended:**

```
cd FitCheck
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
| **Fit map** | A body silhouette colored by zone so you see problem areas at a glance. |
| **History** | Every fit check is saved to your account — reopen any past verdict. |
| **Units** | Switch between cm and inches anywhere in Settings. |

## 🔒 Privacy

Everything — account, measurements, photos, history — is stored **only in your browser's local storage on your device**. Nothing is uploaded anywhere. Clearing browser data erases it.

## 🧠 How the fit engine works

`js/fit-engine.js` holds size charts (the body measurements each size is designed for, based on common international sizing) and per-zone *ease* targets — how much extra room a slim/regular/relaxed fit should have at the chest, waist, hips, etc.

For each size it computes `garment − body − ideal ease` per zone. Within tolerance → **good**; below → **tight**; above → **loose**. Length zones (sleeves, garment length, inseam) compare against your arm length/inseam, or a height-derived ideal. Zone scores are weighted (girth matters more than length; *tight* is penalized more than *loose*) into the overall score, and the best-scoring size wins.

## 📁 Project structure

```
FitCheck/
├── index.html        app shell
├── css/styles.css    design system (mobile-first, sidebar on desktop)
├── js/
│   ├── storage.js    localStorage persistence (accounts, session)
│   ├── auth.js       register / login / logout / password change
│   ├── fit-engine.js size charts + fit math
│   ├── camera.js     live camera + upload + image compression
│   └── app.js        views, routing, analyze wizard, results
├── manifest.json     PWA manifest
├── sw.js             service worker (offline cache)
└── icon.svg          app icon
```

## ⚠️ Honest limitations

- This is a **client-side demo**: there is no server, so accounts live per-device (you can't log in from a different device).
- Fit verdicts come from **measurement math against standard size charts**, not from AI image analysis — the photos personalize your profile and results view, but the numbers do the judging. Real brands vary; when a brand publishes its own size chart, trust that too.
- A "virtual try-on" render (your photo wearing the garment) requires a generative-AI backend and is out of scope for this offline demo.
