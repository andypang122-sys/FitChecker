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
import json
import os
import re
import ssl
import sys
import threading
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
ADMIN_KEY_FILE = os.path.join(DATA_DIR, "admin_key.txt")
_OUTFITS_LOCK = threading.Lock()
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
    return {"ok": True, "posts": posts}


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
        super().do_GET()

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
        if parsed.path in ("/api/outfits", "/api/outfits/moderate", "/api/outfits/report"):
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
                else:
                    result = outfits_report(body)
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
