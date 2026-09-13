# Turning on affiliate income in FitChecker

Every shop link in FitChecker — the For You list, the "What to buy" guide, the
wardrobe gap card — now goes through one function, `Affiliate.link()`. You do
**not** edit links. You join networks, paste your IDs into one file, and switch
shops on as they accept you.

Nothing earns yet. Affiliate IDs come from networks you sign up to yourself —
under your name, with your bank and tax details — so they cannot be made up.
An invented ID earns nothing, or credits someone else.

---

## 1. Sign up, in this order

| # | Network | Why this one | Shops it covers for FitChecker |
|---|---------|--------------|--------------------------------|
| 1 | **Awin** — awin.com | Biggest network in Europe, and most of the big shops FitChecker links to are on it | Uniqlo SE, Nike SE, adidas SE, ASOS, Zalando |
| 2 | **Adtraction** — adtraction.com | Largest Nordic network; Swedish shops pay well | Junkyard (Scandinavia's biggest streetwear shop, ~8%) |
| 3 | **Tradedoubler** — tradedoubler.com | Runs Boozt's Nordic programme | Boozt (carries Levi's, GANT, Tommy, Filippa K and hundreds more) |
| 4 | **Sovrn Commerce** — sovrn.com | One key covers thousands of shops without applying to each | H&M Group (COS, Arket, Weekday), Mango, GANT, Arc'teryx, Reformation and the rest |
| 5 | **Impact** — impact.com | Only if you want Levi's directly | Levi's EU, Carhartt |

**About Sovrn and apps:** Sovrn only reviews an app after its affiliate links are
live and have received a few clicks. So add the key, publish, send some real
traffic, then apply.

**Every network asks for a website.** Use the live FitChecker URL, and describe
it truthfully: *"A size and style app. Users measure themselves and get
recommendations for where to buy clothes in their size and style."*

---

## 2. Paste your IDs

Open `js/app-config.js` and find the `affiliate` block. Fill in only the networks
you have joined:

```js
sovrnId: 'abc123…',          // Sovrn → Settings → API key
awinAffId: '1234567',        // Awin → your publisher ID, top right of the dashboard
adtractionChannelId: '1110…',// Adtraction → the "as=" number in any tracking link
tradedoublerSiteId: '35219', // Tradedoubler → the "a=" number in any tracking link
```

---

## 3. Switch shops on, one at a time

Joining a network is not enough — **each shop has to accept you** separately.
When a shop approves you, find it under `merchants` and set `on: true`:

```js
'uniqlo.com': { network: 'awin', mid: '21364', on: true },
```

Some shops need one extra value from your dashboard:

- **Adtraction (Junkyard):** create any tracking link for the shop. Copy the
  `a=` number into `a: ''`.
- **Impact (Levi's):** copy your full tracking link for the brand, **without** the
  `?u=` part, into `link: ''`.

The `mid` and `p` numbers already filled in come from the networks' public
directories (checked 14 Sep 2026). Check them against your dashboard when you
join. If a number differs, use the one in your dashboard.

**A shop that is not switched on is never sent through its network.** Its links go
through Sovrn if you have set that up, or stay plain links. Nothing breaks.

---

## 4. Check it worked

```
node tests/test_affiliate.js
```

Then, in the app, open **For You**, tap any product row, and look at the address
the browser opens. It should start with the network's domain (`awin1.com`,
`track.adtraction.com`, `clk.tradedoubler.com`, or `redirect.viglink.com`) before
landing on the shop. Within a few hours the click shows in that network's
dashboard.

Every click carries where it came from in the app: `foryou`, `guide` or
`wardrobe`. Your dashboard shows it as the sub-ID (`clickref` on Awin, `epi` on
Adtraction and Tradedoubler). That tells you which screen earns.

---

## 5. What does not pay

- **Zara** has no affiliate programme.
- **Bershka, Pull&Bear, Massimo Dutti** (same owner as Zara): no confirmed
  programme. They stay in FitChecker because they are useful shops.
- **Vinted, Beyond Retro:** second-hand. They are there because buying second-hand
  helps people, not for income.

---

## 6. The disclosure line

When at least one link can earn, For You, Favourites and the guide show:

> Some links here earn us a small commission, at no extra cost to you. It never
> changes what gets recommended.

While nothing is set up, the line is hidden, because claiming commission you don't
earn is also misleading. **Do not remove it.** Swedish marketing law and every
network's terms require a clear disclosure. The app stores also check for one.

---

## Sources

- Adtraction link format: https://help.adtraction.com/en/articles/1563109-get-started-with-epi
- Tradedoubler deep links: https://hst.tradedoubler.com/file/80604/Deep_Link_Instruction.pdf
- Awin link format: https://www.awin.com/us/news-and-events/publisher-training/building-links-finding-creative
- Impact deep links: https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/tracking/tracking-links/create-and-manage-links/create-a-deep-link-for-an-ad
- Sovrn app approval: https://knowledge.sovrn.com/kb/mobile-and-software-application-onboarding-guide-f
- Uniqlo SE on Awin: https://ui.awin.com/merchant-profile/21364
- Nike SE on Awin: https://ui.awin.com/merchant-profile/16339
- adidas SE on Awin: https://ui.awin.com/merchant-profile/77020
- Boozt on Tradedoubler: https://directory.tradedoubler.com/en/programs/227648-Boozt-com
- Junkyard on Adtraction: https://affi.io/m/junkyard
- Levi's EU on Impact: https://www.flexoffers.com/affiliate-programs/levis-eu-affiliate-program/
- Zara (no programme): https://nichefacts.com/zara-affiliate-program/
