#!/usr/bin/env python3
"""
FitCheck server — static file host + brand size-guide extractor.

Run:  python server.py [port]     (default port 8000)

Endpoint:
  GET /api/size-chart?url=<product or size-guide page URL>

Fetches the page server-side (no CORS limits), scans every HTML table
for something that looks like a size chart (sizes x body measurements),
follows "size guide" links one level deep if the page itself has none,
normalises everything to centimetres and returns JSON:

  { ok: true, brand, source, units: "cm",
    zones: ["chest", ...], sizeOrder: ["S","M",...],
    sizes: { "S": {"chest": 96.0, ...}, ... } }
"""

import functools
import hashlib
import json
import os
import re
import secrets
import ssl
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_BYTES = 2_500_000
TIMEOUT = 12
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# ---------------------------------------------------------------
# fetching
# ---------------------------------------------------------------

def fetch_html(url):
    """Return (html_text, final_url). Raises on network errors."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
    })
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            return _read(r)
    except ssl.SSLError:
        # some Python installs ship without usable CA certs — degrade
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            return _read(r)


def _read(resp):
    data = resp.read(MAX_BYTES)
    charset = resp.headers.get_content_charset() or "utf-8"
    return data.decode(charset, "replace"), resp.geturl()


# ---------------------------------------------------------------
# HTML parsing: tables + links
# ---------------------------------------------------------------

class PageParser(HTMLParser):
    """Collects every table (as rows of cell strings) and every link."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.links = []       # (href, text)
        self._tstack = []
        self._row = None
        self._cell = None
        self._a = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._tstack.append([])
        elif tag == "tr" and self._tstack:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")
        elif tag == "a":
            href = dict(attrs).get("href")
            self._a = [href, []] if href else None

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._tstack:
            if self._row:
                self._tstack[-1].append(self._row)
            self._row = None
        elif tag == "table" and self._tstack:
            table = self._tstack.pop()
            if table:
                self.tables.append(table)
        elif tag == "a" and self._a is not None:
            text = " ".join("".join(self._a[1]).split())
            self.links.append((self._a[0], text))
            self._a = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)
        if self._a is not None:
            self._a[1].append(data)


# ---------------------------------------------------------------
# size-chart extraction
# ---------------------------------------------------------------

# order matters: "sleeve length" must match sleeve, not length
ZONE_PATTERNS = [
    ("sleeveLength", r"sleeve|arm\s*length"),
    ("inseam",       r"inseam|inside\s*leg|inner\s*leg"),
    ("chest",        r"chest|bust"),
    ("waist",        r"waist"),
    ("hips",         r"\bhips?\b|seat"),
    ("shoulders",    r"shoulder"),
    ("thigh",        r"thigh"),
    ("torsoLength",  r"\blength\b|back\s*length|body\s*length|front\s*length|total\s*length"),
]

GIRTH_ZONES = {"chest", "waist", "hips", "thigh"}

ALPHA_SIZES = {
    "xxs": "XXS", "xs": "XS", "s": "S", "m": "M", "l": "L",
    "xl": "XL", "xxl": "XXL", "2xl": "XXL", "xxxl": "3XL", "3xl": "3XL",
    "small": "S", "medium": "M", "large": "L", "x-small": "XS",
    "x-large": "XL", "xx-large": "XXL",
}


def zone_for(text):
    t = text.lower()
    for zone, pattern in ZONE_PATTERNS:
        if re.search(pattern, t):
            return zone
    return None


def size_label(text):
    t = re.sub(r"\s+", "", text.strip().lower()).replace(".", "")
    if not t or len(t) > 10:
        return None
    if t in ALPHA_SIZES:
        return ALPHA_SIZES[t]
    if re.fullmatch(r"(us|uk|eu)?\d{1,3}", t):          # numeric sizes: 38, US8...
        return text.strip().upper().replace(" ", "")
    if re.fullmatch(r"(xxs|xs|s|m|l|xl|xxl)[/-](xxs|xs|s|m|l|xl|xxl)", t):
        return text.strip().upper()
    return None


def cell_value(text):
    """'96', '96-102', '96–102 cm', '37,5' -> float (range -> midpoint)."""
    t = text.replace(",", ".").replace("–", "-").replace("—", "-")
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", t)]
    if not nums:
        return None
    if len(nums) >= 2 and nums[1] > nums[0] and (nums[1] - nums[0]) <= 25:
        return round((nums[0] + nums[1]) / 2, 1)        # a range like 96-102
    return nums[0]


def extract_chart(table):
    """Try to read one table as a size chart. Returns dict or None."""
    if len(table) < 2:
        return None
    header = table[0]

    # --- orientation A: sizes down the first column, zones across the top
    col_zones = {}
    for i, cell in enumerate(header):
        z = zone_for(cell)
        if z and z not in col_zones.values():
            col_zones[i] = z
    if col_zones:
        sizes, order = {}, []
        for row in table[1:]:
            if not row:
                continue
            label = size_label(row[0])
            if not label or label in sizes:
                continue
            vals = {}
            for i, z in col_zones.items():
                if i < len(row):
                    v = cell_value(row[i])
                    if v is not None:
                        vals[z] = v
            if vals:
                sizes[label] = vals
                order.append(label)
        if len(order) >= 2:
            return {"sizes": sizes, "order": order,
                    "zones": sorted({z for v in sizes.values() for z in v})}

    # --- orientation B: sizes across the top, zones down the first column
    size_cols = {}
    for i, cell in enumerate(header):
        lab = size_label(cell)
        if lab and lab not in size_cols.values():
            size_cols[i] = lab
    if len(size_cols) >= 2:
        sizes = {lab: {} for lab in size_cols.values()}
        order = [size_cols[i] for i in sorted(size_cols)]
        for row in table[1:]:
            if not row:
                continue
            z = zone_for(row[0])
            if not z:
                continue
            for i, lab in size_cols.items():
                if i < len(row) and z not in sizes[lab]:
                    v = cell_value(row[i])
                    if v is not None:
                        sizes[lab][z] = v
        sizes = {k: v for k, v in sizes.items() if v}
        order = [s for s in order if s in sizes]
        if len(order) >= 2:
            return {"sizes": sizes, "order": order,
                    "zones": sorted({z for v in sizes.values() for z in v})}
    return None


def chart_score(chart):
    score = len(chart["order"]) * len(chart["zones"])
    if "chest" in chart["zones"] or "waist" in chart["zones"]:
        score += 10
    return score


def normalise_units(chart, page_text):
    """Convert to cm; unfold flat garment widths into girths."""
    girths = [v[z] for v in chart["sizes"].values() for z in v if z in GIRTH_ZONES]
    biggest = max(girths) if girths else 0

    text = page_text.lower()
    if re.search(r"\bcm\b|centimet", text):
        units = "cm"
    elif re.search(r"\binch(es)?\b|\bin\.\s|&quot;", text):
        units = "in"
    else:                                    # guess from magnitude
        units = "cm" if biggest > 55 else "in"

    if units == "in":
        for v in chart["sizes"].values():
            for z in list(v):
                v[z] = round(v[z] * 2.54, 1)
        girths = [v[z] for v in chart["sizes"].values() for z in v if z in GIRTH_ZONES]
        biggest = max(girths) if girths else 0

    # chest of ~50cm is a flat-lay garment width, not a girth — double it.
    # A flat-width table is a PRODUCT-measurement chart (the garment's own
    # dimensions, ease included), not a body chart — flag it so the fit
    # engine expects the garment to be roomier than the body.
    chart["measurements"] = "body"
    if girths and biggest < 68:
        for v in chart["sizes"].values():
            for z in list(v):
                if z in GIRTH_ZONES:
                    v[z] = round(v[z] * 2, 1)
        chart["measurements"] = "garment"
    # pages that label the table "product/garment measurements" are garment
    # charts even when the girths are already full circumference
    elif re.search(r"product\s+measure|garment\s+measure|item\s+measure", text):
        chart["measurements"] = "garment"
    return chart


SIZE_LINK_RE = re.compile(r"size[\s_-]*(guide|chart|charts|table)|sizing|size[\s_-]*fit|fit[\s_-]*guide", re.I)


def find_size_links(links, base_url):
    """Links that look like they lead to a size guide."""
    seen, out = set(), []
    base_host = urllib.parse.urlparse(base_url).netloc
    candidates = []
    for href, text in links:
        if not href:
            continue
        if SIZE_LINK_RE.search(text or "") or SIZE_LINK_RE.search(href):
            full = urllib.parse.urljoin(base_url, href.split("#")[0])
            if not full.startswith(("http://", "https://")) or full in seen:
                continue
            seen.add(full)
            same_host = urllib.parse.urlparse(full).netloc == base_host
            candidates.append((0 if same_host else 1, full))
    candidates.sort()
    return [u for _, u in candidates[:3]]


def best_chart_on_page(html):
    parser = PageParser()
    try:
        parser.feed(html)
    except Exception:
        pass
    best = None
    for table in parser.tables:
        chart = extract_chart(table)
        if chart and (best is None or chart_score(chart) > chart_score(best)):
            best = chart
    return best, parser


def get_size_chart(url):
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "Please paste a full link starting with http:// or https://"}
    try:
        html, final_url = fetch_html(url)
    except Exception as e:
        return {"ok": False, "error": "Could not open that page (%s)." % e.__class__.__name__}

    chart, parser = best_chart_on_page(html)
    source = final_url

    if chart is None:
        # follow up to 3 "size guide" links one level deep
        for link in find_size_links(parser.links, final_url):
            try:
                sub_html, sub_url = fetch_html(link)
            except Exception:
                continue
            chart, _ = best_chart_on_page(sub_html)
            if chart:
                html, source = sub_html, sub_url
                break

    if chart is None:
        return {"ok": False, "error":
                "No size chart found in that page's HTML. Many shops load their "
                "size guide with JavaScript — try opening the brand's size-guide "
                "page in your browser and pasting that page's link instead."}

    chart = normalise_units(chart, html)
    host = urllib.parse.urlparse(source).netloc
    brand = host[4:] if host.startswith("www.") else host

    return {
        "ok": True,
        "brand": brand,
        "source": source,
        "units": "cm",
        "measurements": chart.get("measurements", "body"),
        "zones": chart["zones"],
        "sizeOrder": chart["order"],
        "sizes": chart["sizes"],
    }


# ---------------------------------------------------------------
# translation (free Google endpoint, no API key or dependency)
# ---------------------------------------------------------------

_TR_CACHE = {}
_TR_LOCK = threading.Lock()


def gtx_translate(text, to):
    """Translate one English string into `to` via Google's public endpoint."""
    key = (to, text)
    with _TR_LOCK:
        if key in _TR_CACHE:
            return _TR_CACHE[key]
    url = ("https://translate.googleapis.com/translate_a/single"
           "?client=gtx&sl=en&tl=%s&dt=t&q=%s"
           % (urllib.parse.quote(to), urllib.parse.quote(text)))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            raw = r.read().decode("utf-8", "replace")
    except ssl.SSLError:
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            raw = r.read().decode("utf-8", "replace")
    data = json.loads(raw)
    out = "".join(seg[0] for seg in data[0] if seg and seg[0])
    with _TR_LOCK:
        _TR_CACHE[key] = out
    return out


def translate_many(texts, to):
    """Translate a batch concurrently. Failures are simply omitted."""
    res = {}

    def work(t):
        try:
            return t, gtx_translate(t, to)
        except Exception:
            return t, None

    with ThreadPoolExecutor(max_workers=8) as ex:
        for t, tr in ex.map(work, texts):
            if tr:
                res[t] = tr
    return res


# ---------------------------------------------------------------
# community outfits — posts held for manual moderation
# ---------------------------------------------------------------

# DATA_DIR holds the moderation key + community outfits. In production it can
# point at a mounted persistent disk (many hosts wipe the app dir on redeploy)
# by setting FITCHECK_DATA_DIR; locally it defaults to ./data next to this file.
DATA_DIR = os.environ.get("FITCHECK_DATA_DIR") or os.path.join(BASE_DIR, "data")
OUTFITS_FILE = os.path.join(DATA_DIR, "outfits.json")
BATTLES_FILE = os.path.join(DATA_DIR, "battles.json")
ADMIN_KEY_FILE = os.path.join(DATA_DIR, "admin_key.txt")
_OUTFITS_LOCK = threading.Lock()
_BATTLES_LOCK = threading.Lock()
MAX_IMAGE_CHARS = 2_000_000   # ~1.5MB image as data URL
MAX_PENDING = 100


def admin_key():
    """A private moderation key. Prefer an explicit env var (stable across
    restarts, needs no disk) — set FITCHECK_ADMIN_KEY in production. Otherwise
    generate one once and keep it in data/admin_key.txt."""
    env_key = (os.environ.get("FITCHECK_ADMIN_KEY") or "").strip()
    if env_key:
        return env_key
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(ADMIN_KEY_FILE, "r", encoding="utf-8") as f:
            k = f.read().strip()
            if k:
                return k
    except Exception:
        pass
    k = os.urandom(16).hex()
    with open(ADMIN_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(k)
    return k


def _load_outfits():
    try:
        with open(OUTFITS_FILE, "r", encoding="utf-8") as f:
            posts = json.load(f)
            return posts if isinstance(posts, list) else []
    except Exception:
        return []


def _save_outfits(posts):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = OUTFITS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(posts, f)
    os.replace(tmp, OUTFITS_FILE)


def outfits_public():
    posts = [p for p in _load_outfits() if p.get("status") == "approved"]
    posts.sort(key=lambda p: p.get("ts", 0), reverse=True)
    # Never expose the per-voter map; send only the aggregate counts.
    clean = []
    for p in posts:
        q = {k: v for k, v in p.items() if k != "voters"}
        q["likes"] = int(p.get("likes") or 0)
        q["dislikes"] = int(p.get("dislikes") or 0)
        clean.append(q)
    return {"ok": True, "posts": clean}


def outfits_vote(body):
    """Like / dislike a live post. One vote per stable poster id (uid);
    sending the same vote again clears it (toggle), 'none' clears it too."""
    pid = body.get("id")
    uid = str(body.get("uid") or "")[:64].strip()
    vote = body.get("vote")
    if vote not in ("like", "dislike", "none"):
        return {"ok": False, "error": "Unknown vote."}
    if not uid:
        return {"ok": False, "error": "Sign in to vote."}
    with _OUTFITS_LOCK:
        posts = _load_outfits()
        target = next((p for p in posts if p.get("id") == pid), None)
        if not target or target.get("status") != "approved":
            return {"ok": False, "error": "Post not found."}
        voters = target.get("voters")
        if not isinstance(voters, dict):
            voters = {}
        if vote == "none":
            voters.pop(uid, None)
            you = None
        else:
            voters[uid] = vote
            you = vote
        target["voters"] = voters
        likes = sum(1 for v in voters.values() if v == "like")
        dislikes = sum(1 for v in voters.values() if v == "dislike")
        target["likes"] = likes
        target["dislikes"] = dislikes
        _save_outfits(posts)
    return {"ok": True, "likes": likes, "dislikes": dislikes, "you": you}


def outfits_pending(key):
    if key != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    # Show posts awaiting review AND already-live posts that were reported —
    # reported ones float to the top so the moderator sees them first.
    posts = [p for p in _load_outfits() if p.get("status") in ("pending", "reported")]
    posts.sort(key=lambda p: (p.get("status") != "reported", p.get("ts", 0)))
    return {"ok": True, "posts": posts}


def outfits_submit(body):
    name = str(body.get("name") or "Anonymous")[:40].strip() or "Anonymous"
    caption = str(body.get("caption") or "")[:200].strip()
    uid = str(body.get("uid") or "")[:64].strip()  # stable per-poster id, for blocking
    image = body.get("image") or ""
    if not isinstance(image, str) or not image.startswith("data:image/"):
        return {"ok": False, "error": "A photo of the outfit is required."}
    if len(image) > MAX_IMAGE_CHARS:
        return {"ok": False, "error": "That photo is too large — try again, it will be compressed."}
    if not caption:
        return {"ok": False, "error": "Add a short caption describing the outfit."}
    # optional on-device style rating computed by the client
    ai = None
    raw_ai = body.get("ai")
    if isinstance(raw_ai, dict):
        try:
            score = int(raw_ai.get("score"))
            notes = [str(x).strip()[:160] for x in (raw_ai.get("notes") or [])[:5] if str(x).strip()]
            if 0 <= score <= 100:
                ai = {"score": score, "notes": notes}
        except Exception:
            ai = None

    with _OUTFITS_LOCK:
        posts = _load_outfits()
        if sum(1 for p in posts if p.get("status") == "pending") >= MAX_PENDING:
            return {"ok": False, "error": "The review queue is full right now — please try again later."}
        post = {
            "id": os.urandom(8).hex(),
            "name": name,
            "uid": uid,
            "caption": caption,
            "image": image,
            "ai": ai,
            "status": "pending",
            "reports": 0,
            "ts": int(__import__("time").time() * 1000),
        }
        posts.append(post)
        _save_outfits(posts)
    return {"ok": True, "id": post["id"], "message": "Sent for review."}


def outfits_moderate(body):
    if body.get("key") != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    pid = body.get("id")
    action = body.get("action")
    if action not in ("approve", "reject"):
        return {"ok": False, "error": "Unknown action."}
    with _OUTFITS_LOCK:
        posts = _load_outfits()
        target = next((p for p in posts if p.get("id") == pid), None)
        if not target:
            return {"ok": False, "error": "Post not found (already handled?)."}
        if action == "approve":
            target["status"] = "approved"
            target["reports"] = 0  # cleared once a human re-approves
        else:
            posts = [p for p in posts if p.get("id") != pid]
        _save_outfits(posts)
    return {"ok": True}


def outfits_report(body):
    """Any viewer can flag a live post. It is hidden from the public feed at
    once and pushed into the moderation queue for a human to re-review."""
    pid = body.get("id")
    reason = str(body.get("reason") or "Reported")[:80].strip() or "Reported"
    with _OUTFITS_LOCK:
        posts = _load_outfits()
        target = next((p for p in posts if p.get("id") == pid), None)
        if not target:
            return {"ok": False, "error": "Post not found."}
        target["reports"] = int(target.get("reports") or 0) + 1
        target["report_reason"] = reason
        if target.get("status") == "approved":
            target["status"] = "reported"  # pull from public until re-reviewed
        _save_outfits(posts)
    return {"ok": True}


# ---------------------------------------------------------------
# brand product thumbnails — the image each brand page advertises
# (its og:image), fetched server-side once and cached on disk.
# The client shows it over the garment tile; if a brand blocks us
# or we're offline, the tile stays. Allowlisted hosts only (SSRF).
# ---------------------------------------------------------------

THUMBS_DIR = os.path.join(DATA_DIR, "thumbs")
THUMB_HOSTS = (
    "uniqlo.com", "hm.com", "weekday.com", "asos.com", "zalando.se",
    "zalando.com", "levi.com", "lacoste.com", "massimodutti.com",
    "stories.com", "monki.com",
)
THUMB_RETRY_SECONDS = 6 * 3600  # re-try a failed brand after 6h
_THUMB_LOCK = threading.Lock()

_OG_IMG_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::url)?|twitter:image)["\'][^>]*?content=["\']([^"\']+)', re.I)
_OG_IMG_RE2 = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*?(?:property|name)=["\'](?:og:image(?::url)?|twitter:image)["\']', re.I)


def _thumb_host_ok(url):
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in THUMB_HOSTS)


def fetch_image_bytes(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "image/*,*/*;q=0.8",
    })
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            return r.read(MAX_BYTES), (r.headers.get("Content-Type") or "image/jpeg")
    except ssl.SSLError:
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
            return r.read(MAX_BYTES), (r.headers.get("Content-Type") or "image/jpeg")


def get_thumb(url):
    """(bytes, content_type) of the brand page's promo image, or (None, None)."""
    if not isinstance(url, str) or not url.startswith("https://") or not _thumb_host_ok(url):
        return None, None
    key = hashlib.sha1(url.encode("utf-8")).hexdigest()[:24]
    data_path = os.path.join(THUMBS_DIR, key + ".img")
    ct_path = os.path.join(THUMBS_DIR, key + ".ct")
    neg_path = os.path.join(THUMBS_DIR, key + ".none")

    def cached():
        try:
            with open(data_path, "rb") as f:
                data = f.read()
            try:
                with open(ct_path, "r", encoding="utf-8") as f:
                    ct = f.read().strip() or "image/jpeg"
            except Exception:
                ct = "image/jpeg"
            return data, ct
        except Exception:
            return None

    hit = cached()
    if hit:
        return hit
    try:
        if os.path.exists(neg_path):
            if __import__("time").time() - os.path.getmtime(neg_path) < THUMB_RETRY_SECONDS:
                return None, None
            os.remove(neg_path)
    except Exception:
        pass

    with _THUMB_LOCK:
        hit = cached()  # another thread may have fetched while we waited
        if hit:
            return hit
        os.makedirs(THUMBS_DIR, exist_ok=True)
        try:
            html, final_url = fetch_html(url)
            m = _OG_IMG_RE.search(html) or _OG_IMG_RE2.search(html)
            if not m:
                raise ValueError("no promo image on page")
            img_url = m.group(1).strip().replace("&amp;", "&")
            if img_url.startswith("//"):
                img_url = "https:" + img_url
            img_url = urllib.parse.urljoin(final_url, img_url)
            data, ct = fetch_image_bytes(img_url)
            ct = (ct.split(";")[0] or "image/jpeg").strip()
            if not data or len(data) < 500 or not ct.lower().startswith("image/"):
                raise ValueError("not a usable image")
            with open(data_path, "wb") as f:
                f.write(data)
            with open(ct_path, "w", encoding="utf-8") as f:
                f.write(ct)
            return data, ct
        except Exception:
            try:
                with open(neg_path, "w") as f:
                    f.write("1")
            except Exception:
                pass
            return None, None


# ---------------------------------------------------------------
# daily outfit battle — two head-to-toe outfits, the community votes
# ---------------------------------------------------------------
# battles.json holds { "submissions": [...], "current": {battle} | null }.
# Users submit a full-body photo (held for review); the admin approves
# entries and picks two to become "today's battle"; everyone else votes.

def _load_battles():
    try:
        with open(BATTLES_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
            if isinstance(d, dict):
                d.setdefault("submissions", [])
                d.setdefault("current", None)
                return d
    except Exception:
        pass
    return {"submissions": [], "current": None}


def _save_battles(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = BATTLES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f)
    os.replace(tmp, BATTLES_FILE)


def _today_str():
    return __import__("datetime").date.today().isoformat()


def battle_public():
    """The live battle for everyone: two outfits + vote tallies, no voter map."""
    cur = _load_battles().get("current")
    if not cur:
        return {"ok": True, "battle": None}
    voters = cur.get("voters") or {}
    return {"ok": True, "battle": {
        "id": cur["id"], "day": cur.get("day"),
        "a": {"name": cur["a"]["name"], "image": cur["a"]["image"]},
        "b": {"name": cur["b"]["name"], "image": cur["b"]["image"]},
        "aVotes": sum(1 for v in voters.values() if v == "a"),
        "bVotes": sum(1 for v in voters.values() if v == "b"),
    }}


def battle_submit(body):
    name = str(body.get("name") or "Anonymous")[:40].strip() or "Anonymous"
    uid = str(body.get("uid") or "")[:64].strip()
    image = body.get("image") or ""
    if not isinstance(image, str) or not image.startswith("data:image/"):
        return {"ok": False, "error": "A full-body photo of your outfit is required."}
    if len(image) > MAX_IMAGE_CHARS:
        return {"ok": False, "error": "That photo is too large — try again, it will be compressed."}
    with _BATTLES_LOCK:
        d = _load_battles()
        subs = d["submissions"]
        if sum(1 for s in subs if s.get("status") == "pending") >= MAX_PENDING:
            return {"ok": False, "error": "The entry queue is full right now — please try again later."}
        subs.append({
            "id": os.urandom(8).hex(), "name": name, "uid": uid, "image": image,
            "status": "pending", "ts": int(__import__("time").time() * 1000),
        })
        _save_battles(d)
    return {"ok": True, "message": "Your entry was sent for review."}


def battle_vote(body):
    """One vote per stable poster id; re-voting just moves your vote."""
    bid = body.get("id")
    uid = str(body.get("uid") or "")[:64].strip()
    choice = body.get("choice")
    if choice not in ("a", "b"):
        return {"ok": False, "error": "Pick A or B."}
    if not uid:
        return {"ok": False, "error": "Sign in to vote."}
    with _BATTLES_LOCK:
        d = _load_battles()
        cur = d.get("current")
        if not cur or cur.get("id") != bid:
            return {"ok": False, "error": "This battle has ended."}
        voters = cur.get("voters")
        if not isinstance(voters, dict):
            voters = {}
        voters[uid] = choice
        cur["voters"] = voters
        a_votes = sum(1 for v in voters.values() if v == "a")
        b_votes = sum(1 for v in voters.values() if v == "b")
        _save_battles(d)
    return {"ok": True, "aVotes": a_votes, "bVotes": b_votes, "you": choice}


def battle_pending(key):
    """Admin view: every entry (pending first) + the current battle's score."""
    if key != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    d = _load_battles()
    subs = sorted(d["submissions"], key=lambda s: (s.get("status") != "pending", -(s.get("ts") or 0)))
    cur = d.get("current")
    current = None
    if cur:
        voters = cur.get("voters") or {}
        current = {"id": cur["id"], "aName": cur["a"]["name"], "bName": cur["b"]["name"],
                   "aVotes": sum(1 for v in voters.values() if v == "a"),
                   "bVotes": sum(1 for v in voters.values() if v == "b")}
    return {"ok": True, "submissions": subs, "current": current}


def battle_moderate(body):
    if body.get("key") != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    sid = body.get("id")
    action = body.get("action")
    if action not in ("approve", "reject"):
        return {"ok": False, "error": "Unknown action."}
    with _BATTLES_LOCK:
        d = _load_battles()
        target = next((s for s in d["submissions"] if s.get("id") == sid), None)
        if not target:
            return {"ok": False, "error": "Entry not found (already handled?)."}
        if action == "approve":
            target["status"] = "approved"
        else:
            d["submissions"] = [s for s in d["submissions"] if s.get("id") != sid]
        _save_battles(d)
    return {"ok": True}


def battle_create(body):
    """Admin picks two approved entries → they become today's battle (votes reset)."""
    if body.get("key") != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    a_id, b_id = body.get("aId"), body.get("bId")
    if not a_id or not b_id or a_id == b_id:
        return {"ok": False, "error": "Pick two different entries."}
    with _BATTLES_LOCK:
        d = _load_battles()
        subs = {s["id"]: s for s in d["submissions"]}
        a, b = subs.get(a_id), subs.get(b_id)
        if not a or not b:
            return {"ok": False, "error": "Entry not found."}
        if a.get("status") != "approved" or b.get("status") != "approved":
            return {"ok": False, "error": "Approve both entries first."}
        d["current"] = {
            "id": os.urandom(8).hex(), "day": _today_str(),
            "a": {"subId": a["id"], "name": a["name"], "image": a["image"]},
            "b": {"subId": b["id"], "name": b["name"], "image": b["image"]},
            "voters": {}, "ts": int(__import__("time").time() * 1000),
        }
        _save_battles(d)
    return {"ok": True, "message": "Today's battle is live."}


def battle_close(body):
    if body.get("key") != admin_key():
        return {"ok": False, "error": "Wrong moderation key."}
    with _BATTLES_LOCK:
        d = _load_battles()
        d["current"] = None
        _save_battles(d)
    return {"ok": True}


# ---------------------------------------------------------------
# Accounts + wardrobe sync
#
# A lightweight, dependency-free account system so a user's wardrobe
# (and saved outfits) follow them between phone and PC. Passwords are
# stored only as a salted SHA-256 hash — never in the clear. Each
# wardrobe lives in its own file keyed by a hash of the email, so one
# account can never read another's data.
# ---------------------------------------------------------------

ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")
WARDROBE_DIR = os.path.join(DATA_DIR, "wardrobe")
_ACCOUNTS_LOCK = threading.Lock()
_WARDROBE_LOCK = threading.Lock()

TOKEN_TTL = 90 * 24 * 3600          # 90 days
MAX_WARDROBE_ITEMS = 600            # generous fair-use ceiling per account
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _load_accounts():
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save_accounts(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = ACCOUNTS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f)
    os.replace(tmp, ACCOUNTS_FILE)


def _norm_email(e):
    return str(e or "").strip().lower()


def _hash_pw(salt, password):
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def _issue_token(acct):
    """Add a fresh token to an account record, pruning expired ones."""
    now = int(time.time())
    tokens = {t: exp for t, exp in (acct.get("tokens") or {}).items() if exp > now}
    tok = secrets.token_hex(32)
    tokens[tok] = now + TOKEN_TTL
    acct["tokens"] = tokens
    return tok


def account_register(body):
    email = _norm_email(body.get("email"))
    password = str(body.get("password") or "")
    name = str(body.get("name") or "").strip()[:80]
    if not EMAIL_RE.match(email):
        return {"ok": False, "error": "Enter a valid email."}
    if len(password) < 6:
        return {"ok": False, "error": "Password must be at least 6 characters."}
    with _ACCOUNTS_LOCK:
        accts = _load_accounts()
        if email in accts:
            return {"ok": False, "error": "An account with this email already exists."}
        salt = secrets.token_hex(8)
        acct = {"salt": salt, "passHash": _hash_pw(salt, password),
                "name": name, "createdAt": int(time.time()), "tokens": {}}
        tok = _issue_token(acct)
        accts[email] = acct
        _save_accounts(accts)
    return {"ok": True, "token": tok, "email": email, "name": name}


def account_login(body):
    email = _norm_email(body.get("email"))
    password = str(body.get("password") or "")
    with _ACCOUNTS_LOCK:
        accts = _load_accounts()
        acct = accts.get(email)
        if not acct or acct.get("passHash") != _hash_pw(acct.get("salt", ""), password):
            return {"ok": False, "error": "Wrong email or password."}
        tok = _issue_token(acct)
        _save_accounts(accts)
    return {"ok": True, "token": tok, "email": email, "name": acct.get("name", "")}


def account_logout(body):
    tok = str(body.get("token") or "")
    with _ACCOUNTS_LOCK:
        accts = _load_accounts()
        for acct in accts.values():
            if tok in (acct.get("tokens") or {}):
                del acct["tokens"][tok]
                _save_accounts(accts)
                break
    return {"ok": True}


def _resolve_token(tok):
    """Return the email a live token belongs to, or None."""
    tok = str(tok or "")
    if not tok:
        return None
    now = int(time.time())
    accts = _load_accounts()
    for email, acct in accts.items():
        exp = (acct.get("tokens") or {}).get(tok)
        if exp and exp > now:
            return email
    return None


def _wardrobe_path(email):
    key = hashlib.sha256(email.encode("utf-8")).hexdigest()
    return os.path.join(WARDROBE_DIR, key + ".json")


def _load_wardrobe(email):
    try:
        with open(_wardrobe_path(email), "r", encoding="utf-8") as f:
            d = json.load(f)
            if isinstance(d, dict):
                d.setdefault("items", [])
                d.setdefault("outfits", [])
                d.setdefault("profiles", [])
                d.setdefault("activeProfileId", None)
                d.setdefault("favourites", [])
                return d
    except Exception:
        pass
    return {"items": [], "outfits": [], "profiles": [], "activeProfileId": None, "favourites": []}


def _save_wardrobe(email, data):
    os.makedirs(WARDROBE_DIR, exist_ok=True)
    path = _wardrobe_path(email)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def wardrobe_get(token):
    email = _resolve_token(token)
    if not email:
        return {"ok": False, "error": "auth"}
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
    return {"ok": True, "items": d["items"], "outfits": d["outfits"]}


def _clean_item(it):
    """Keep only known fields, bound the sizes."""
    if not isinstance(it, dict) or not it.get("id"):
        return None
    img = it.get("img") or ""
    if not isinstance(img, str) or len(img) > MAX_IMAGE_CHARS:
        return None
    return {
        "id": str(it["id"])[:64],
        "type": str(it.get("type") or "tshirt")[:24],
        "slot": str(it.get("slot") or "top")[:16],
        "name": str(it.get("name") or "")[:80],
        "brand": str(it.get("brand") or "")[:60],
        "colorHex": str(it.get("colorHex") or "#888888")[:9],
        "colorName": str(it.get("colorName") or "")[:24],
        "img": img,
        "price": (float(it["price"]) if isinstance(it.get("price"), (int, float)) else None),
        "createdAt": int(it.get("createdAt") or int(time.time() * 1000)),
        "worn": int(it.get("worn") or 0),
        "forSale": bool(it.get("forSale")),
    }


def wardrobe_put_item(body):
    email = _resolve_token(body.get("token"))
    if not email:
        return {"ok": False, "error": "auth"}
    item = _clean_item(body.get("item"))
    if not item:
        return {"ok": False, "error": "Bad item."}
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
        items = [x for x in d["items"] if x.get("id") != item["id"]]
        if len(items) >= MAX_WARDROBE_ITEMS:
            return {"ok": False, "error": "Wardrobe is full (%d items)." % MAX_WARDROBE_ITEMS}
        items.append(item)
        d["items"] = items
        _save_wardrobe(email, d)
    return {"ok": True}


def wardrobe_delete_item(body):
    email = _resolve_token(body.get("token"))
    if not email:
        return {"ok": False, "error": "auth"}
    iid = str(body.get("id") or "")
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
        d["items"] = [x for x in d["items"] if x.get("id") != iid]
        _save_wardrobe(email, d)
    return {"ok": True}


def wardrobe_put_outfits(body):
    email = _resolve_token(body.get("token"))
    if not email:
        return {"ok": False, "error": "auth"}
    outfits = body.get("outfits")
    if not isinstance(outfits, list):
        return {"ok": False, "error": "Bad outfits."}
    clean = []
    for o in outfits[:300]:
        if isinstance(o, dict) and o.get("id"):
            clean.append({
                "id": str(o["id"])[:64],
                "name": str(o.get("name") or "")[:80],
                "createdAt": int(o.get("createdAt") or int(time.time() * 1000)),
                "slots": {str(k)[:12]: str(v)[:64] for k, v in (o.get("slots") or {}).items()},
            })
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
        d["outfits"] = clean
        _save_wardrobe(email, d)
    return {"ok": True}


def account_data_get(token):
    """The non-wardrobe account data: body profiles (measurements) and
    favourited products. Kept small — profile PHOTOS are not synced."""
    email = _resolve_token(token)
    if not email:
        return {"ok": False, "error": "auth"}
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
    return {"ok": True, "profiles": d["profiles"],
            "activeProfileId": d.get("activeProfileId"),
            "favourites": d["favourites"]}


def _clean_profile(p):
    """Keep measurements + identity only; drop photos (device-local, heavy)."""
    if not isinstance(p, dict) or not p.get("id"):
        return None
    body = p.get("body")
    body = body if isinstance(body, dict) else {}
    clean_body = {}
    for k, v in list(body.items())[:20]:
        if isinstance(v, (int, float)) or v is None:
            clean_body[str(k)[:16]] = v
    return {
        "id": str(p["id"])[:64],
        "name": str(p.get("name") or "")[:60],
        "sex": p.get("sex") if p.get("sex") in ("female", "male") else None,
        "body": clean_body,
        "createdAt": int(p.get("createdAt") or int(time.time() * 1000)),
    }


def profiles_put(body):
    email = _resolve_token(body.get("token"))
    if not email:
        return {"ok": False, "error": "auth"}
    profiles = body.get("profiles")
    if not isinstance(profiles, list):
        return {"ok": False, "error": "Bad profiles."}
    clean = [x for x in (_clean_profile(p) for p in profiles[:20]) if x]
    active = body.get("activeProfileId")
    active = str(active)[:64] if active else None
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
        d["profiles"] = clean
        d["activeProfileId"] = active
        _save_wardrobe(email, d)
    return {"ok": True}


def _clean_fav(f):
    if not isinstance(f, dict) or not f.get("id"):
        return None
    img = f.get("img") or ""
    if not isinstance(img, str) or len(img) > 2048:  # favourites store an image URL, not bytes
        img = ""
    types = f.get("types")
    types = [str(t)[:24] for t in types[:6]] if isinstance(types, list) else []
    return {
        "id": str(f["id"])[:200],
        "brand": str(f.get("brand") or "")[:60],
        "name": str(f.get("name") or "")[:120],
        "note": str(f.get("note") or "")[:200],
        "url": str(f.get("url") or "")[:400],
        "img": img,
        "types": types,
        "ts": int(f.get("ts") or int(time.time() * 1000)),
    }


def favourites_put(body):
    email = _resolve_token(body.get("token"))
    if not email:
        return {"ok": False, "error": "auth"}
    favs = body.get("favourites")
    if not isinstance(favs, list):
        return {"ok": False, "error": "Bad favourites."}
    clean = [x for x in (_clean_fav(f) for f in favs[:400]) if x]
    with _WARDROBE_LOCK:
        d = _load_wardrobe(email)
        d["favourites"] = clean
        _save_wardrobe(email, d)
    return {"ok": True}


# ---------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/size-chart":
            qs = urllib.parse.parse_qs(parsed.query)
            url = (qs.get("url") or [""])[0].strip()
            try:
                result = get_size_chart(url)
            except Exception as e:
                result = {"ok": False, "error": "Unexpected error: %s" % e.__class__.__name__}
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/api/outfits":
            self._json(outfits_public())
            return
        if parsed.path == "/api/outfits/pending":
            qs = urllib.parse.parse_qs(parsed.query)
            self._json(outfits_pending((qs.get("key") or [""])[0]))
            return
        if parsed.path == "/api/thumb":
            qs = urllib.parse.parse_qs(parsed.query)
            u = (qs.get("u") or [""])[0]
            try:
                data, ct = get_thumb(u)
            except Exception:
                data, ct = None, None
            if data:
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.send_header("Cache-Control", "public, max-age=3600")
                self.send_header("Content-Length", "0")
                self.end_headers()
            return
        if parsed.path == "/api/battle":
            self._json(battle_public())
            return
        if parsed.path == "/api/battle/pending":
            qs = urllib.parse.parse_qs(parsed.query)
            self._json(battle_pending((qs.get("key") or [""])[0]))
            return
        if parsed.path == "/api/wardrobe":
            self._json(wardrobe_get(self._bearer()))
            return
        if parsed.path == "/api/account/data":
            self._json(account_data_get(self._bearer()))
            return
        super().do_GET()

    def _bearer(self):
        """Extract a token from the Authorization header (or ?token=)."""
        h = self.headers.get("Authorization", "") or ""
        if h.lower().startswith("bearer "):
            return h[7:].strip()
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        return (qs.get("token") or [""])[0]

    def _json(self, result):
        body = json.dumps(result).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/translate":
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads((self.rfile.read(length) or b"{}").decode("utf-8", "replace"))
                to = (body.get("to") or "").strip()
                qs = body.get("q") or []
                if not to or not isinstance(qs, list):
                    result = {"ok": False, "error": "bad request"}
                else:
                    uniq, seen = [], set()
                    for s in qs:
                        if isinstance(s, str) and s and s not in seen and len(s) <= 1000:
                            seen.add(s)
                            uniq.append(s)
                        if len(uniq) >= 400:
                            break
                    result = {"ok": True, "translations": translate_many(uniq, to)}
            except Exception as e:
                result = {"ok": False, "error": e.__class__.__name__}
            self._json(result)
            return
        if parsed.path in ("/api/outfits", "/api/outfits/moderate", "/api/outfits/report", "/api/outfits/vote"):
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
                if length > MAX_IMAGE_CHARS + 4096:
                    self._json({"ok": False, "error": "Upload too large."})
                    return
                body = json.loads((self.rfile.read(length) or b"{}").decode("utf-8", "replace"))
                if parsed.path == "/api/outfits":
                    result = outfits_submit(body)
                elif parsed.path == "/api/outfits/moderate":
                    result = outfits_moderate(body)
                elif parsed.path == "/api/outfits/vote":
                    result = outfits_vote(body)
                else:
                    result = outfits_report(body)
            except Exception as e:
                result = {"ok": False, "error": e.__class__.__name__}
            self._json(result)
            return
        if parsed.path in ("/api/account/register", "/api/account/login", "/api/account/logout"):
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
                if length > 8192:
                    self._json({"ok": False, "error": "Bad request."})
                    return
                body = json.loads((self.rfile.read(length) or b"{}").decode("utf-8", "replace"))
                if parsed.path == "/api/account/register":
                    result = account_register(body)
                elif parsed.path == "/api/account/login":
                    result = account_login(body)
                else:
                    result = account_logout(body)
            except Exception as e:
                result = {"ok": False, "error": e.__class__.__name__}
            self._json(result)
            return
        if parsed.path in ("/api/wardrobe/item", "/api/wardrobe/delete", "/api/wardrobe/outfits",
                           "/api/profiles", "/api/favourites"):
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
                if length > MAX_IMAGE_CHARS + 8192:
                    self._json({"ok": False, "error": "Upload too large."})
                    return
                body = json.loads((self.rfile.read(length) or b"{}").decode("utf-8", "replace"))
                # allow the token to arrive via header too
                if not body.get("token"):
                    body["token"] = self._bearer()
                if parsed.path == "/api/wardrobe/item":
                    result = wardrobe_put_item(body)
                elif parsed.path == "/api/wardrobe/delete":
                    result = wardrobe_delete_item(body)
                elif parsed.path == "/api/wardrobe/outfits":
                    result = wardrobe_put_outfits(body)
                elif parsed.path == "/api/profiles":
                    result = profiles_put(body)
                else:
                    result = favourites_put(body)
            except Exception as e:
                result = {"ok": False, "error": e.__class__.__name__}
            self._json(result)
            return
        if parsed.path in ("/api/battle/submit", "/api/battle/vote", "/api/battle/moderate",
                           "/api/battle/create", "/api/battle/close"):
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
                if length > MAX_IMAGE_CHARS + 4096:
                    self._json({"ok": False, "error": "Upload too large."})
                    return
                body = json.loads((self.rfile.read(length) or b"{}").decode("utf-8", "replace"))
                if parsed.path == "/api/battle/submit":
                    result = battle_submit(body)
                elif parsed.path == "/api/battle/vote":
                    result = battle_vote(body)
                elif parsed.path == "/api/battle/moderate":
                    result = battle_moderate(body)
                elif parsed.path == "/api/battle/create":
                    result = battle_create(body)
                else:
                    result = battle_close(body)
            except Exception as e:
                result = {"ok": False, "error": e.__class__.__name__}
            self._json(result)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    # Cloud hosts (Railway, Render, Fly, Heroku…) inject the port via $PORT.
    # Locally you can still pass it as an argument: `python server.py 8001`.
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8000))
    handler = functools.partial(Handler, directory=BASE_DIR)
    server = ThreadingHTTPServer(("", port), handler)
    print("FitCheck server running at http://localhost:%d" % port)
    print("Outfit moderation: http://localhost:%d/#/moderate  (key: %s)" % (port, admin_key()))
    server.serve_forever()


if __name__ == "__main__":
    main()
