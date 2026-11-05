"""TV Music Store - Whitelist Scanner. Press Run in VS Code.

Pages (left menu):
  Scanner        - works for the site: takes new videos of whitelisted
                   channels from Admin -> Whitelisting, finds our tracks in
                   them and sends the results back. Leave it running.
  Check a video  - paste a channel or video link, check one video by hand,
                   see and hear where the track is (waveforms, click to play).
  Settings       - site address, admin token, voice removal, YouTube sign-in,
                   track base.

The track base is built from the site itself (full version of every
published track), so it always matches the catalogue.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CACHE = os.path.join(DATA, "cache")
CATALOG_DIR = os.path.join(DATA, "catalog")
DB_PATH = os.path.join(DATA, "site_db.pklz")
DB_INDEX = os.path.join(DATA, "site_db.json")
SETTINGS = os.path.join(DATA, "settings.json")
PRINTS = os.path.join(DATA, "prints")  # fingerprints of checked videos (for re-checks)
MODEL_PATH = os.path.join(DATA, "UVR-MDX-NET-Inst_HQ_3.onnx")
MODEL_URL = "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_3.onnx"
OWN_FFMPEG = "H:\\BACKUP\\py\\SOFT\\Youtube downloader\\ffmpeg.exe"

PACKAGES = ["numpy", "scipy", "psutil", "onnxruntime", "soundfile", "yt-dlp[default]", "deno",
            "imageio-ffmpeg", "sounddevice", "PyQt6"]
PACKAGES_VERSION = "5"  # bump = packages (yt-dlp first of all) are updated on the next start
VENV = os.path.join(DATA, "venv")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")
VENV_OK = os.path.join(VENV, "packages_ok.txt")


def use_private_python():
    """Run inside our own Python environment (data/venv)."""
    if os.path.normcase(os.path.abspath(sys.executable)) == os.path.normcase(os.path.abspath(VENV_PY)):
        return
    if os.environ.get("TVMS_NO_VENV"):  # developer testing only
        return
    os.makedirs(DATA, exist_ok=True)
    if not os.path.isfile(VENV_PY):
        print("Creating a private Python environment (one time)...")
        subprocess.check_call([sys.executable, "-m", "venv", VENV])
    have = open(VENV_OK).read().strip() if os.path.isfile(VENV_OK) else ""
    if have != PACKAGES_VERSION:
        print("Installing packages (one time, a few minutes)...")
        subprocess.check_call([VENV_PY, "-m", "pip", "install", "--upgrade", "pip"])
        subprocess.check_call([VENV_PY, "-m", "pip", "install", "--upgrade"] + PACKAGES)
        open(VENV_OK, "w").write(PACKAGES_VERSION)
    sys.exit(subprocess.call([VENV_PY, os.path.abspath(__file__)]))


use_private_python()
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")

import numpy as np  # noqa: E402
from PyQt6 import QtCore, QtGui, QtWidgets  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "engine"))
import fp  # noqa: E402
import sep  # noqa: E402
import yt_dlp  # noqa: E402

GOLD = "#F4C430"
PALETTE = ["#F4C430", "#ff8fb1", "#7cc7ff", "#9be38a", "#c9a0ff", "#ffb366", "#6ee7d8"]
NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def pick_ffmpeg():
    if os.path.isfile(OWN_FFMPEG):
        return OWN_FFMPEG
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


fp.FFMPEG = pick_ffmpeg()


def fmt(sec):
    sec = int(round(sec))
    return "%d:%02d" % (sec // 60, sec % 60)


def strength_word(score):
    return "sure" if score >= 150 else ("good" if score >= 80 else "weak")


# ---------------------------------------------------------------- settings --
DEFAULTS = {"site": "https://tvmusicstore.com", "token": "", "novoice": False, "interval_min": 5,
            "batch": 3}


def load_settings():
    s = dict(DEFAULTS)
    try:
        s.update(json.load(open(SETTINGS, encoding="utf-8")))
    except Exception:
        pass
    return s


def save_settings(s):
    os.makedirs(DATA, exist_ok=True)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), indent=2)


# ----------------------------------------------------------------- site API --
def api(settings, method, query="", body=None, timeout=60):
    url = settings["site"].rstrip("/") + "/api/admin/wl-scan" + query
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "x-admin-token": settings["token"], "content-type": "application/json",
        "user-agent": "TVMS-Scanner/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        if body.get("error"):
            return body
        raise


# ---------------------------------------------------------------- YouTube --
COOKIES_TXT = os.path.join(DATA, "cookies.txt")
LOGIN_PROFILE = os.path.join(DATA, "youtube_login")
EDGE_PATHS = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
LOGIN_URL = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/"


def open_login_window():
    edge = next((p for p in EDGE_PATHS if os.path.isfile(p)), None)
    if not edge:
        raise RuntimeError("Microsoft Edge not found")
    subprocess.Popen([edge, "--user-data-dir=" + LOGIN_PROFILE, "--no-first-run", LOGIN_URL])


def close_login_window():
    import psutil
    hit = False
    for pr in psutil.process_iter(["name", "cmdline"]):
        try:
            cmd = " ".join(pr.info.get("cmdline") or [])
            if "msedge" in (pr.info.get("name") or "").lower() and LOGIN_PROFILE.lower() in cmd.lower():
                pr.kill()
                hit = True
        except Exception:
            pass
    if hit:
        time.sleep(1.5)


def ydl_run(opts, fn):
    """Run without sign-in; if YouTube asks, retry with the saved login."""
    try:
        with yt_dlp.YoutubeDL(opts) as y:
            return fn(y)
    except Exception as e:
        forbidden = "403" in str(e) or "Forbidden" in str(e)
        if "Sign in" not in str(e) and "cookies" not in str(e) and not forbidden:
            raise
    # YouTube refuses one way of downloading now and then (HTTP 403): the other
    # "player clients" usually work, without and then with the saved sign-in.
    close_login_window()
    variants = [{}] if forbidden else []
    if os.path.isfile(COOKIES_TXT):
        variants.append({"cookiefile": COOKIES_TXT})
    if os.path.isdir(os.path.join(LOGIN_PROFILE, "Default")):
        variants.append({"cookiesfrombrowser": ("edge", os.path.join(LOGIN_PROFILE, "Default")),
                         "cookiefile": COOKIES_TXT})
    last = None
    for extra in variants:
        for client in (None, "tv", "mweb", "web_safari", "web", "web_creator", "ios"):
            o = dict(opts, **extra)
            if client:
                o["extractor_args"] = {"youtube": {"player_client": [client]}}
            try:
                with yt_dlp.YoutubeDL(o) as y:
                    return fn(y)
            except Exception as e2:
                last = e2
                if "age" not in str(e2).lower() and "403" not in str(e2) and "Forbidden" not in str(e2):
                    break
    if last is not None and ("403" in str(last) or "Forbidden" in str(last)):
        raise RuntimeError("YouTube refused the download (HTTP 403) with every method. It is usually "
                           "temporary: the video is checked again later.")
    raise RuntimeError("YouTube needs sign-in (Settings -> Sign in to YouTube). %s"
                       % (str(last).splitlines()[0] if last else ""))


def download_audio(video_id, progress=None):
    os.makedirs(CACHE, exist_ok=True)
    have = [f for f in os.listdir(CACHE) if f.startswith(video_id + ".") and ".novoice" not in f
            and not f.endswith(".part")]
    if have:
        return os.path.join(CACHE, have[0])

    def hook(d):
        if progress and d.get("status") == "downloading":
            tot = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            progress("Downloading audio  %.1f / %.1f MB" % (done / 1e6, tot / 1e6), done / tot if tot else None)
    opts = {"quiet": True, "no_warnings": True, "format": "worstaudio[abr>=40]/worstaudio/bestaudio/best",
            "outtmpl": os.path.join(CACHE, video_id + ".%(ext)s"), "progress_hooks": [hook],
            "ffmpeg_location": os.path.dirname(fp.FFMPEG)}
    ydl_run(opts, lambda y: y.download(["https://www.youtube.com/watch?v=" + video_id]))
    have = [f for f in os.listdir(CACHE) if f.startswith(video_id + ".") and ".novoice" not in f
            and not f.endswith(".part")]
    return os.path.join(CACHE, have[0])


# ------------------------------------------------------------ track base --
UNRELEASED = os.path.join(HERE, "unreleased")  # your tracks not on the site yet: unreleased/<Composer>/<Track>.wav
AUDIO_EXT = (".wav", ".mp3", ".flac", ".aif", ".aiff", ".ogg", ".m4a")
DEFAULT_COMPOSERS = ["Lumine Wave", "Vicate", "DredStudio"]


def norm_title(t):
    return "".join(ch for ch in (t or "").lower() if ch.isalnum())


class Base:
    """Fingerprint base: the site's published tracks (full versions) plus the
    tracks in the "unreleased" folder (not on the site yet).
    Keys: site tracks = site track id, folder tracks = "local:<path>"."""

    def __init__(self):
        self.ht = None
        self.meta = {}  # key -> {id, title, composer, path, addedAt, source, slug, mtime}
        self.fresh = []  # (key, hashes) added since the last re-check

    def load(self):
        if os.path.isfile(DB_PATH) and os.path.isfile(DB_INDEX):
            try:
                self.ht = fp.load_db(DB_PATH)
                self.meta = json.load(open(DB_INDEX, encoding="utf-8"))
            except Exception:
                # a damaged base (e.g. the PC switched off while saving): start a new one,
                # the tracks are still on disk so rebuilding is quick
                self.ht, self.meta = None, {}
                return False
            for k, m in self.meta.items():  # site tracks always live in the current catalog folder
                if m.get("source", "site") == "site":
                    m["path"] = os.path.join(CATALOG_DIR, k + ".mp3")
        return self.ht is not None

    def _new_table(self):
        if self.ht is None:
            import hash_table
            self.ht = hash_table.HashTable(hashbits=20, depth=100, maxtime=65536)

    def _remove(self, key, log):
        m = self.meta.pop(key, None)
        try:
            self.ht.remove(key)
        except Exception:
            pass
        if m and m.get("source", "site") == "site":
            try:
                os.remove(m["path"])
            except OSError:
                pass
        if m:
            log("Removed from the base: %s (%s)" % (m["title"], "deleted on the site" if m.get("source", "site") == "site"
                                                     else "file gone from the unreleased folder"))

    def _add(self, key, path, info):
        hashes = fp.hashes_of(fp.load_mono(path), fp.DB_DENSITY, 1)
        self.ht.store(key, hashes)
        self.meta[key] = dict(info, path=path)
        self.fresh.append((key, hashes))

    def update(self, settings, log, progress):
        """Bring the base in line with the site and the unreleased folder:
        new tracks are added, deleted ones removed. Returns the number added."""
        os.makedirs(CATALOG_DIR, exist_ok=True)
        self._new_table()
        added = 0
        site_error = None
        try:
            tracks = api(settings, "GET", "?action=catalog", timeout=120)["tracks"]
        except Exception as e:  # site not reachable: keep the site tracks, still read the folder
            tracks, site_error = None, e
        if tracks is not None:
            added += self._update_site(settings, tracks, log, progress)
        added += self._update_local(log, progress)
        self.save()
        if site_error is not None:
            raise site_error
        return added

    def _update_site(self, settings, tracks, log, progress):
        added = 0
        site_ids = {t["id"] for t in tracks}
        for key in [k for k, m in self.meta.items() if m.get("source", "site") == "site" and k not in site_ids]:
            self._remove(key, log)
        new = [t for t in tracks if t["id"] not in self.meta]
        if new:
            log("Site catalogue: %d tracks, %d new for the base." % (len(tracks), len(new)))
        for i, t in enumerate(new):
            progress("Adding tracks to the base  %d / %d  %s" % (i + 1, len(new), t["title"]),
                     (i + 1) / max(1, len(new)))
            path = os.path.join(CATALOG_DIR, t["id"] + ".mp3")
            if not os.path.isfile(path):
                src = t["src"] if t["src"].startswith("http") else settings["site"].rstrip("/") + t["src"]
                req = urllib.request.Request(src, headers={"user-agent": "TVMS-Scanner/1"})
                with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
                    f.write(r.read())
                os.replace(path + ".part", path)
            self._add(t["id"], path, {"id": t["id"], "title": t["title"], "composer": t["composer"],
                                      "addedAt": t.get("addedAt", ""), "slug": t.get("slug", ""), "source": "site"})
            added += 1
            if (i + 1) % 20 == 0:
                self.save()
        for t in tracks:  # slugs / titles may change on the site
            m = self.meta.get(t["id"])
            if m is not None:
                m["slug"], m["title"], m["composer"] = t.get("slug", ""), t["title"], t["composer"]
        return added

    def _update_local(self, log, progress):
        added = 0
        for c in DEFAULT_COMPOSERS:
            os.makedirs(os.path.join(UNRELEASED, c), exist_ok=True)
        files = {}
        for root, _dirs, names in os.walk(UNRELEASED):
            for n in names:
                if n.lower().endswith(AUDIO_EXT):
                    full = os.path.join(root, n)
                    rel = os.path.relpath(full, UNRELEASED).replace("\\", "/")
                    files["local:" + rel.lower()] = (full, rel)
        for key, m in list(self.meta.items()):
            if m.get("source") == "local":
                f = files.get(key)
                if not f or abs(os.path.getmtime(f[0]) - m.get("mtime", 0)) > 1:
                    self._remove(key, log)  # gone or replaced (a changed file is added again below)
        todo = [k for k in files if k not in self.meta]
        for i, key in enumerate(todo):
            full, rel = files[key]
            parts = rel.split("/")
            composer = parts[0] if len(parts) > 1 else "TV Music Store"
            title = os.path.splitext(parts[-1])[0]
            progress("Adding unreleased tracks  %d / %d  %s" % (i + 1, len(todo), title), (i + 1) / max(1, len(todo)))
            try:
                self._add(key, full, {"id": key, "title": title, "composer": composer, "source": "local",
                                      "addedAt": time.strftime("%Y-%m-%d"), "mtime": os.path.getmtime(full)})
                added += 1
            except Exception as e:
                log("Could not read %s: %s" % (rel, e))
        if todo:
            log("Unreleased folder: %d new track(s) added to the base." % len(todo))
        return added

    def save(self):
        # write next to the real files, then swap: a crash never leaves half a base
        import gzip
        with gzip.open(DB_PATH + ".tmp", "wb") as f:  # closed for sure before the swap
            self.ht.save(DB_PATH + ".tmp", file_object=f)
        os.replace(DB_PATH + ".tmp", DB_PATH)
        with open(DB_INDEX + ".tmp", "w", encoding="utf-8") as f:
            json.dump(self.meta, f)
        os.replace(DB_INDEX + ".tmp", DB_INDEX)

    def title(self, name):
        m = self.meta.get(name)
        return m["title"] if m else name

    def composer(self, name):
        m = self.meta.get(name)
        return m["composer"] if m else ""

    def site_state(self, key):
        """("site" | "dup" | "local" | "gone", url or "") of a found track:
        site = on the site, local = only in the unreleased folder,
        dup = in both, gone = deleted from the site (and the base)."""
        m = self.meta.get(key)
        if m is None:
            return ("local" if str(key).startswith("local:") else "gone"), ""
        t = norm_title(m["title"])
        if m.get("source") == "local":
            twin = next((x for x in self.meta.values() if x.get("source", "site") == "site"
                         and norm_title(x["title"]) == t), None)
            return ("dup", self.url(twin)) if twin else ("local", "")
        twin = any(x.get("source") == "local" and norm_title(x["title"]) == t for x in self.meta.values())
        return ("dup" if twin else "site"), self.url(m)

    def url(self, m):
        site = (load_settings().get("site") or DEFAULTS["site"]).rstrip("/")
        return "%s/track/%s" % (site, m.get("slug") or m.get("id"))


# Matching rules (Check a video -> Matching settings; saved in settings.json
# and used by the automatic scanner too).
MATCH_DEFAULTS = {"min_len": 6.0, "min_score": 60, "min_windows": 3, "strong": 150, "align": 1.0,
                  "noise_ratio": 2.5, "pitch": 1}
MATCH = dict(MATCH_DEFAULTS)


def match_kw():
    return {"min_len": float(MATCH["min_len"]), "min_score": int(MATCH["min_score"]),
            "min_windows": int(MATCH["min_windows"]), "strong": int(MATCH["strong"]),
            "align": float(MATCH["align"]), "noise_ratio": float(MATCH.get("noise_ratio", 2.5))}


def near_list(base, debug_runs):
    """The strongest candidates of a check (found or rejected), for the
    "why" panel: kept with the check result."""
    out = []
    for name, d in debug_runs:
        pitch = 0
        if name.startswith("pitch moved"):
            pitch = -int(name.split()[2])
        for c in d.get("chains", [])[:12]:
            out.append(dict(c, title=base.title(c["track"]), run=name, pitch=pitch))
    return out


def ru_verdict(v):
    if v == "found":
        return "\u043d\u0430\u0439\u0434\u0435\u043d"
    if "matching part only" in v:
        return "\u0437\u0432\u0443\u0447\u0438\u0442 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043a\u043e\u0440\u043e\u0442\u043a\u043e"
    if "score" in v and "noise" not in v:
        return "\u0441\u043b\u0430\u0431\u0430\u044f \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c"
    if "window" in v:
        return "\u043c\u0430\u043b\u043e \u043a\u0443\u0441\u043a\u043e\u0432 \u043f\u043e\u0434\u0440\u044f\u0434"
    if "overlaps" in v:
        return "\u043f\u0435\u0440\u0435\u043a\u0440\u044b\u0442 \u0431\u043e\u043b\u0435\u0435 \u0441\u0438\u043b\u044c\u043d\u044b\u043c \u0442\u0440\u0435\u043a\u043e\u043c"
    if "noise" in v:
        return "\u043f\u043e\u0447\u0442\u0438 \u043a\u0430\u043a \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u044b\u0439 \u0448\u0443\u043c"
    return v


def cand_rows(base, c):
    """Rejected candidates of a check as table rows (to listen and judge)."""
    found = {(r["track"], int(a)) for r in c.get("rows") or [] for a, _b in r["regions"]}
    out, seen = [], set()
    for n in c.get("near") or []:
        if n.get("verdict") == "found":
            continue
        key = (n["track"], int(n["start"]) // 5)
        if key in seen or any(t == n["track"] and abs(a - n["start"]) < 8 for t, a in found):
            continue
        seen.add(key)
        part = {"start": n["start"], "end": n["end"], "track_pos": n["track_pos"], "score": n["score"],
                "windows": n["windows"], "pct": n.get("pct", 0), "pitch": n.get("pitch", 0)}
        out.append({"track": n["track"], "title": n["title"], "composer": base.composer(n["track"]),
                    "regions": [[n["start"], n["end"]]], "parts": [part], "total": max(0.0, n["end"] - n["start"]),
                    "score": n["score"], "rejected": n["verdict"], "pitch": n.get("pitch", 0)})
        if len(out) >= 6:
            break
    return out


def noise_of(near, track):
    """Random noise level of a check: the strongest WEAK candidate of another
    track (real music rejected only for being short does not count)."""
    return max([n["score"] for n in near if n["track"] != track and n["verdict"] != "found"
                and (n["score"] < int(MATCH["min_score"]) or n["windows"] < int(MATCH["min_windows"]))] or [0])


def reliability(c, row):
    """Short verdict for the table: (word, colour). Same rule as the "why" text."""
    if row.get("rejected"):
        return "\u043e\u0442\u0431\u0440\u043e\u0448\u0435\u043d", "#9a9a9a"
    near = c.get("near") or []
    noise = noise_of(near, row["track"])
    parts = row.get("parts") or []
    length = max([p["end"] - p["start"] for p in parts] or [0])
    ratio = row["score"] / max(noise, 15)
    if ratio >= 5 and length >= 10:
        return "\u043d\u0430\u0434\u0451\u0436\u043d\u043e", GREEN
    if ratio >= 2.5:
        return "\u043f\u0440\u043e\u0432\u0435\u0440\u044c", GOLD
    return "\u0441\u043e\u043c\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u043e", RED


def why_text(c, row):
    """Plain explanation under the waveforms: why this track was found (or why
    nothing was), with the numbers to compare videos."""
    near = c.get("near") or []
    if row is None:
        if not near:
            return ("<b>\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.</b> \u041d\u0438 \u043e\u0434\u0438\u043d \u043a\u0443\u0441\u043e\u043a \u0432\u0438\u0434\u0435\u043e \u043d\u0435 \u043f\u043e\u0445\u043e\u0436 \u043d\u0438 \u043d\u0430 \u043e\u0434\u0438\u043d \u0442\u0440\u0435\u043a \u0431\u0430\u0437\u044b. "
                    "\u041d\u0430\u0436\u043c\u0438 \u00ab\u041f\u0435\u0440\u0435\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u044d\u0442\u043e \u0432\u0438\u0434\u0435\u043e\u00bb, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u043e\u0441\u0442\u0438.")
        lines = ["<b>\u041f\u043e\u0447\u0435\u043c\u0443 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.</b> \u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u043a\u0430\u043d\u0434\u0438\u0434\u0430\u0442\u044b (\u0432\u0441\u0435 \u043e\u0442\u0431\u0440\u043e\u0448\u0435\u043d\u044b):"]
        for n in near[:4]:
            lines.append("&nbsp;&nbsp;- %s: \u0432 \u0432\u0438\u0434\u0435\u043e %s-%s, \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c %d, \u0441\u043e\u0432\u043f\u0430\u043b\u043e %.1f%% \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0430, \u043a\u0443\u0441\u043a\u043e\u0432 %d "
                         "&rarr; <span style='color:#ff9f43'>%s</span>"
                         % (n["title"], fmt(n["start"]), fmt(n["end"]), n["score"], n.get("pct", 0), n["windows"],
                            ru_verdict(n["verdict"])))
        return "<br>".join(lines)
    parts = row.get("parts") or []
    best = max(parts, key=lambda p: p["end"] - p["start"]) if parts else None
    noise = noise_of(near, row["track"])
    if best is None:
        return "<b>%s</b>" % row["title"]
    length = best["end"] - best["start"]
    if row.get("rejected"):
        return "<br>".join([
            "<b>\u041f\u043e\u0447\u0435\u043c\u0443 \u041d\u0415 \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u043d \u00ab%s\u00bb</b> &nbsp;<span style='color:%s'><b>%s</b></span>"
            % (row["title"], ORANGE, ru_verdict(row["rejected"])),
            "\u041f\u043e\u0445\u043e\u0436\u0438\u0439 \u043a\u0443\u0441\u043e\u043a: \u0432 \u0432\u0438\u0434\u0435\u043e %s-%s = \u0432 \u0442\u0440\u0435\u043a\u0435 %s-%s (%s)."
            % (fmt(best["start"]), fmt(best["end"]), fmt(best["track_pos"]), fmt(best["track_pos"] + length),
               fmt(length)),
            "\u0423\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c <b>%d</b> (\u043f\u043e\u0440\u043e\u0433 %d), \u0441\u043e\u0432\u043f\u0430\u043b\u043e <b>%.1f%%</b> \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0430, \u043a\u0443\u0441\u043a\u043e\u0432 \u043f\u043e\u0434\u0440\u044f\u0434 <b>%d</b> (\u043d\u0443\u0436\u043d\u043e %d), "
            "\u0434\u043b\u0438\u043d\u0430 %s (\u043d\u0443\u0436\u043d\u043e %s)." % (row["score"], int(MATCH["min_score"]), best.get("pct", 0),
                                      best.get("windows", 0), int(MATCH["min_windows"]), fmt(length),
                                      fmt(float(MATCH["min_len"]))),
            "\u041f\u043e\u0441\u043b\u0443\u0448\u0430\u0439 \u043e\u0431\u0430 \u043a\u0443\u0441\u043a\u0430: \u0435\u0441\u043b\u0438 \u044d\u0442\u043e \u0438 \u043f\u0440\u0430\u0432\u0434\u0430 \u043d\u0430\u0448 \u0442\u0440\u0435\u043a, \u043e\u0441\u043b\u0430\u0431\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043d\u0438\u0436\u0435 \u0438 \u043d\u0430\u0436\u043c\u0438 \u00ab\u041f\u0435\u0440\u0435\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c\u00bb.",
        ])
    ratio = row["score"] / max(noise, 15)
    if reliability(c, row)[0] == "\u043d\u0430\u0434\u0451\u0436\u043d\u043e":
        verdict = "<span style='color:%s'><b>\u041d\u0430\u0434\u0451\u0436\u043d\u043e\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u0435.</b></span>" % GREEN
    elif reliability(c, row)[0] == "\u043f\u0440\u043e\u0432\u0435\u0440\u044c":
        verdict = "<span style='color:%s'><b>\u041f\u043e\u0445\u043e\u0436\u0435 \u043d\u0430 \u043f\u0440\u0430\u0432\u0434\u0443, \u043d\u043e \u043b\u0443\u0447\u0448\u0435 \u043f\u043e\u0441\u043b\u0443\u0448\u0430\u0439.</b></span>" % GOLD
    else:
        verdict = ("<span style='color:%s'><b>\u0421\u043e\u043c\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u043e:</b> \u043f\u043e\u0447\u0442\u0438 \u043d\u0435 \u043e\u0442\u043b\u0438\u0447\u0430\u0435\u0442\u0441\u044f \u043e\u0442 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u043e\u0433\u043e \u0448\u0443\u043c\u0430, "
                   "\u0441\u043a\u043e\u0440\u0435\u0435 \u0432\u0441\u0435\u0433\u043e \u043b\u043e\u0436\u043d\u043e\u0435.</span>" % RED)
    lines = [
        "<b>\u041f\u043e\u0447\u0435\u043c\u0443 \u043d\u0430\u0439\u0434\u0435\u043d \u00ab%s\u00bb</b> &nbsp;%s" % (row["title"], verdict),
        "\u0421\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 <b>%s \u043f\u043e\u0434\u0440\u044f\u0434</b>: \u0432 \u0432\u0438\u0434\u0435\u043e %s-%s = \u0432 \u0442\u0440\u0435\u043a\u0435 %s-%s."
        % (fmt(length), fmt(best["start"]), fmt(best["end"]), fmt(best["track_pos"]),
           fmt(best["track_pos"] + length)),
        "\u0423\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c <b>%d</b> (\u043f\u043e\u0440\u043e\u0433 %d). \u0421\u0430\u043c\u044b\u0439 \u0441\u0438\u043b\u044c\u043d\u044b\u0439 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u044b\u0439 \u0448\u0443\u043c \u0432 \u044d\u0442\u043e\u043c \u0432\u0438\u0434\u0435\u043e: %d, "
        "\u0442\u043e \u0435\u0441\u0442\u044c \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u0435 \u0441\u0438\u043b\u044c\u043d\u0435\u0435 \u0448\u0443\u043c\u0430 \u0432 <b>%.1f \u0440\u0430\u0437\u0430</b>." % (row["score"], int(MATCH["min_score"]), noise, ratio),
        "\u0421\u043e\u0432\u043f\u0430\u043b\u043e <b>%.1f%%</b> \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0430 \u0437\u0432\u0443\u043a\u0430 \u0432 \u043b\u0443\u0447\u0448\u0435\u043c \u043a\u0443\u0441\u043a\u0435 (\u0443 \u0447\u0438\u0441\u0442\u043e\u0439 \u043c\u0443\u0437\u044b\u043a\u0438 \u043e\u0431\u044b\u0447\u043d\u043e 4-7%%, \u043f\u043e\u0434 \u0433\u043e\u043b\u043e\u0441\u043e\u043c \u0434\u0438\u043a\u0442\u043e\u0440\u0430 1-2%%, "
        "\u0443 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u043e\u0433\u043e \u0448\u0443\u043c\u0430 \u043c\u0435\u043d\u044c\u0448\u0435 1%%)." % best.get("pct", 0),
        "\u041a\u0443\u0441\u043a\u043e\u0432 \u043f\u043e 8 \u0441\u0435\u043a \u043f\u043e\u0434\u0440\u044f\u0434, \u0441\u043e\u0432\u043f\u0430\u0432\u0448\u0438\u0445 \u0441 \u043e\u0434\u043d\u0438\u043c \u043c\u0435\u0441\u0442\u043e\u043c \u0442\u0440\u0435\u043a\u0430: <b>%d</b> (\u043d\u0443\u0436\u043d\u043e %d)."
        % (best.get("windows", 0), int(MATCH["min_windows"])),
    ]
    if row.get("pitch"):
        lines.append("<span style='color:%s'>\u0422\u043e\u043d \u0442\u0440\u0435\u043a\u0430 \u0432 \u0432\u0438\u0434\u0435\u043e %s \u043d\u0430 %d \u043f\u043e\u043b\u0443\u0442\u043e\u043d%s</span> (\u0442\u0430\u043a \u0447\u0430\u0441\u0442\u043e \u0434\u0435\u043b\u0430\u044e\u0442, \u0447\u0442\u043e\u0431\u044b "
                     "\u043e\u0431\u043e\u0439\u0442\u0438 Content ID): \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430 \u043d\u0430\u0448\u043b\u0430 \u0435\u0433\u043e, \u0441\u0434\u0432\u0438\u043d\u0443\u0432 \u0437\u0432\u0443\u043a \u0432\u0438\u0434\u0435\u043e \u043e\u0431\u0440\u0430\u0442\u043d\u043e."
                     % (GOLD, "\u043f\u043e\u043d\u0438\u0436\u0435\u043d" if row["pitch"] < 0 else "\u043f\u043e\u0432\u044b\u0448\u0435\u043d", abs(row["pitch"]),
                        "" if abs(row["pitch"]) == 1 else "\u0430"))
    if len(parts) > 1:
        lines.append("\u0422\u0440\u0435\u043a \u0437\u0432\u0443\u0447\u0438\u0442 \u0432 \u0432\u0438\u0434\u0435\u043e %d \u0440\u0430\u0437(\u0430), \u0432\u0441\u0435\u0433\u043e %s." % (len(row["regions"]), fmt(row["total"])))
    return "<br>".join(lines)


def match_payload(base, r):
    """One found track as the site expects it (onSite = published on the site)."""
    return {"trackId": r["track"], "track": r["title"], "composer": r.get("composer", ""),
            "onSite": base.site_state(r["track"])[0] in ("site", "dup"),
            "regions": r["regions"], "total": r["total"], "score": r["score"]}


def site_look(state):
    """(text, colour) of the Site column."""
    return {"site": ("\u043d\u0430 \u0441\u0430\u0439\u0442\u0435 \u2197", GREEN), "dup": ("\u0434\u0443\u0431\u043b\u044c", GOLD), "local": ("\u043d\u0435 \u0437\u0430\u043b\u0438\u0442", RED),
            "gone": ("\u0443\u0434\u0430\u043b\u0451\u043d \u0441 \u0441\u0430\u0439\u0442\u0430", RED)}[state]


def group_rows(base, found):
    """Found segments -> one row per track (parts close together merged)."""
    by = {}
    for g in sorted(found, key=lambda x: x["start"]):
        by.setdefault(g["track"], []).append(g)
    rows = []
    for name, parts in by.items():
        regions = []
        for g in parts:
            if regions and g["start"] - regions[-1][1] <= 10:
                regions[-1][1] = max(regions[-1][1], g["end"])
            else:
                regions.append([g["start"], g["end"]])
        best = max(parts, key=lambda p: p["score"])
        rows.append({"track": name, "title": base.title(name), "composer": base.composer(name),
                     "regions": regions, "parts": parts, "total": sum(b - a for a, b in regions),
                     "score": best["score"], "pitch": best.get("pitch", 0)})
    # The same track found twice (site copy + unreleased-folder copy): keep the site one.
    site_titles = {norm_title(r["title"]) for r in rows if not str(r["track"]).startswith("local:")}
    rows = [r for r in rows if not (str(r["track"]).startswith("local:") and norm_title(r["title"]) in site_titles)]
    rows.sort(key=lambda r: -r["total"])
    return rows


PITCH_SHIFTS = [-2, -1, 1, 2]  # semitones: uploaders often move the pitch to dodge Content ID


def match_shifts(base, hs, dur, debug=None, progress=None):
    """Search every fingerprint (original + pitch moved) and merge the finds.
    hs = {semitones the video was moved by: hashes}. A find in the copy moved
    by +2 means the video itself has the track 2 semitones LOWER (pitch -2)."""
    found = []
    for st in sorted(hs, key=lambda x: (x != 0, abs(x), x)):
        if progress and st:
            progress("Searching with the pitch moved %+d" % st, None)
        segs = fp.find_tracks(None, base.ht, hashes=hs[st], dur=dur, **match_kw())
        if debug is not None:
            debug.append(("original audio" if st == 0 else "pitch moved %+d semitones" % st, dict(fp.LAST_DEBUG)))
        for g in segs:
            g["pitch"] = -st
            if not any(o["track"] == g["track"] and o["start"] < g["end"] and g["start"] < o["end"] for o in found):
                found.append(g)
    return found


def find_in_audio(base, audio, novoice, progress, debug=None, keep=None):
    """All tracks found in one audio file: list of rows (one per track).
    `debug` (a list) receives the matcher's details for the check log,
    `keep` (a dict) receives the audio fingerprints for instant re-matching.
    With "pitch" on, the audio is also searched moved by -2..+2 semitones."""
    samples = fp.load_mono(audio)
    dur = len(samples) / fp.SR
    progress("Analysing audio...", None)
    semis = PITCH_SHIFTS if MATCH.get("pitch") else []
    hs = fp.query_hashes_pitched(samples, semis,
                                 lambda k, n: progress("Analysing audio  part %d of %d" % (k, n), k / max(1, n)))
    if keep is not None:
        keep["hs"], keep["dur"] = hs, dur
    progress("Searching the track base...", None)
    found = match_shifts(base, hs, dur, debug, progress)
    if novoice:
        if not os.path.isfile(MODEL_PATH):
            progress("Downloading voice removal model (65 MB)...", None)
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH + ".part")
            os.replace(MODEL_PATH + ".part", MODEL_PATH)
        clean = os.path.splitext(audio)[0] + ".novoice.wav"
        if not os.path.isfile(clean):
            sep.separate(audio, clean, MODEL_PATH,
                         lambda k, n: progress("Removing voice  %d%%" % (100 * k // max(1, n)), k / max(1, n)))
        found_clean = fp.find_tracks(fp.load_mono(clean), base.ht, **match_kw())
        if debug is not None:
            debug.append(("voice removed", dict(fp.LAST_DEBUG)))
        for g in found_clean:
            g["pitch"] = 0
            if not any(o["track"] == g["track"] and abs(o["start"] - g["start"]) < 8 for o in found):
                found.append(g)
    return samples, group_rows(base, found)


def rows_from_segments(base, found):
    by = {}
    for g in sorted(found, key=lambda x: x["start"]):
        by.setdefault(g["track"], []).append(g)
    out = []
    for name, parts in by.items():
        regions = []
        for g in parts:
            if regions and g["start"] - regions[-1][1] <= 10:
                regions[-1][1] = max(regions[-1][1], g["end"])
            else:
                regions.append([g["start"], g["end"]])
        out.append({"track": name, "title": base.title(name), "composer": base.composer(name),
                    "regions": regions, "total": sum(b - a for a, b in regions),
                    "score": max(p["score"] for p in parts)})
    return out


def save_print(video_id, samples, published):
    """Keep a small fingerprint of a checked video (about 0.5 MB per 10 min)."""
    os.makedirs(PRINTS, exist_ok=True)
    np.savez_compressed(os.path.join(PRINTS, video_id + ".npz"), h=fp.print_hashes(samples),
                        dur=np.array([len(samples) / fp.SR]), pub=np.array([published or ""]))


HINT_FOUND = ("\u0426\u0432\u0435\u0442\u043e\u043c = \u0433\u0434\u0435 \u0437\u0432\u0443\u0447\u0438\u0442 \u0442\u0440\u0435\u043a. \u041a\u043b\u0438\u043a = \u0441\u043b\u0443\u0448\u0430\u0442\u044c \u0441 \u044d\u0442\u043e\u0433\u043e \u043c\u0435\u0441\u0442\u0430, \u043a\u043e\u043b\u0451\u0441\u0438\u043a\u043e = \u043f\u0440\u0438\u0431\u043b\u0438\u0437\u0438\u0442\u044c, "
              "\u0442\u044f\u043d\u0443\u0442\u044c = \u0434\u0432\u0438\u0433\u0430\u0442\u044c, \u0434\u0432\u043e\u0439\u043d\u043e\u0439 \u043a\u043b\u0438\u043a = \u0432\u0441\u0451 \u0430\u0443\u0434\u0438\u043e.")
HINT_CLEAN = "\u041a\u043b\u0438\u043a = \u0441\u043b\u0443\u0448\u0430\u0442\u044c \u0441 \u044d\u0442\u043e\u0433\u043e \u043c\u0435\u0441\u0442\u0430, \u043a\u043e\u043b\u0451\u0441\u0438\u043a\u043e = \u043f\u0440\u0438\u0431\u043b\u0438\u0437\u0438\u0442\u044c, \u0442\u044f\u043d\u0443\u0442\u044c = \u0434\u0432\u0438\u0433\u0430\u0442\u044c, \u0434\u0432\u043e\u0439\u043d\u043e\u0439 \u043a\u043b\u0438\u043a = \u0432\u0441\u0451 \u0430\u0443\u0434\u0438\u043e."
CHECKS = os.path.join(DATA, "checks.json")
CHECK_LOG = os.path.join(DATA, "check_log.txt")  # details of every check (for tuning the matching)

# ---- storage folder ---------------------------------------------------------
# The big things (track base, downloaded tracks and video audio, results,
# the unreleased folder, the voice model) can live on another disk:
# Settings -> Storage folder. settings.json, the Python environment and the
# YouTube sign-in always stay in data/ next to this file.
STORE_ITEMS = ["catalog", "cache", "prints", "unreleased", "site_db.pklz", "site_db.json", "checks.json",
               "check_log.txt", "UVR-MDX-NET-Inst_HQ_3.onnx"]
STORE_SUB = "TVMS scanner data"


def set_store(root):
    """Point every storage path at `root` (None = the old places)."""
    global CACHE, CATALOG_DIR, DB_PATH, DB_INDEX, PRINTS, MODEL_PATH, CHECKS, CHECK_LOG, UNRELEASED, STORE
    STORE = root or DATA
    CACHE = os.path.join(STORE, "cache")
    CATALOG_DIR = os.path.join(STORE, "catalog")
    DB_PATH = os.path.join(STORE, "site_db.pklz")
    DB_INDEX = os.path.join(STORE, "site_db.json")
    PRINTS = os.path.join(STORE, "prints")
    MODEL_PATH = os.path.join(STORE, "UVR-MDX-NET-Inst_HQ_3.onnx")
    CHECKS = os.path.join(STORE, "checks.json")
    CHECK_LOG = os.path.join(STORE, "check_log.txt")
    UNRELEASED = os.path.join(root, "unreleased") if root else os.path.join(HERE, "unreleased")


STORE = DATA


def store_sources():
    """(name, current path) of every storage item that exists now."""
    cur = {"catalog": CATALOG_DIR, "cache": CACHE, "prints": PRINTS, "unreleased": UNRELEASED,
           "site_db.pklz": DB_PATH, "site_db.json": DB_INDEX, "checks.json": CHECKS, "check_log.txt": CHECK_LOG,
           "UVR-MDX-NET-Inst_HQ_3.onnx": MODEL_PATH}
    return [(n, cur[n]) for n in STORE_ITEMS if os.path.exists(cur[n])]


def move_store(dest_root, progress, log):
    """Copy everything to dest_root, check it, then delete the old copies.
    Same disk = a quick rename. Returns the new root."""
    import shutil
    os.makedirs(dest_root, exist_ok=True)
    items = store_sources()
    files = []
    for name, src in items:
        if os.path.isdir(src):
            for r, _d, fs in os.walk(src):
                for f in fs:
                    full = os.path.join(r, f)
                    files.append((full, os.path.join(dest_root, name, os.path.relpath(full, src))))
        else:
            files.append((src, os.path.join(dest_root, name)))
    same_disk = os.path.splitdrive(os.path.abspath(dest_root))[0].lower() == \
        os.path.splitdrive(os.path.abspath(STORE))[0].lower()
    total = sum(os.path.getsize(a) for a, _b in files) or 1
    done = 0
    for i, (a, b) in enumerate(files):
        os.makedirs(os.path.dirname(b), exist_ok=True)
        if same_disk:
            os.replace(a, b)
        else:
            shutil.copy2(a, b)
            if os.path.getsize(a) != os.path.getsize(b):
                raise RuntimeError("Copy check failed for %s" % a)
        done += os.path.getsize(b)
        progress("Moving storage  %d / %d files  (%.0f / %.0f MB)" % (i + 1, len(files), done / 1e6, total / 1e6),
                 done / total)
    # everything is safely in the new place: remove the old copies
    for name, src in items:
        try:
            if os.path.isdir(src):
                shutil.rmtree(src)
            elif os.path.exists(src):
                os.remove(src)
        except OSError as e:
            log("Could not remove the old %s (%s). You can delete it by hand." % (src, e))
    log("Storage moved: %d files, %.0f MB -> %s" % (len(files), total / 1e6, dest_root))
    return dest_root


def fix_paths_after_move(old_root, old_unreleased, new_root):
    """Stored absolute paths (track base, check results) point to the new place."""
    def fix(p):
        if not p:
            return p
        for old, new in ((old_unreleased, os.path.join(new_root, "unreleased")), (old_root, new_root)):
            if os.path.normcase(p).startswith(os.path.normcase(old) + os.sep):
                return new + p[len(old):]
        return p
    try:
        meta = json.load(open(DB_INDEX, encoding="utf-8"))
        for m in meta.values():
            m["path"] = fix(m.get("path"))
        json.dump(meta, open(DB_INDEX, "w", encoding="utf-8"))
    except Exception:
        pass
    try:
        ch = json.load(open(CHECKS, encoding="utf-8"))
        for c in ch.values():
            if c.get("audio"):
                c["audio"] = fix(c["audio"])
        save_checks(ch)
    except Exception:
        pass


def write_check_log(base, video_id, title, novoice, rows, debug_runs, seconds):
    """One block per checked video: what was found and every near miss."""
    try:
        os.makedirs(os.path.dirname(CHECK_LOG), exist_ok=True)
        with open(CHECK_LOG, "a", encoding="utf-8") as f:
            f.write("=" * 78 + "\n")
            f.write("%s  %s  https://youtu.be/%s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), title, video_id))
            f.write("voice removal: %s   check took %.0f s\n" % ("on" if novoice else "off", seconds))
            f.write("FOUND: %s\n" % (", ".join("%s (%s) at %s, score %d" % (
                r["title"], r["composer"], ", ".join("%s-%s" % (fmt(a), fmt(b)) for a, b in r["regions"]),
                r["score"]) for r in rows) or "nothing"))
            for name, d in debug_runs:
                f.write("-- %s: %s s of audio, %s windows matched something\n"
                        % (name, d.get("duration"), d.get("windows_with_hits")))
                for c in d.get("chains", [])[:25]:
                    f.write("   %-34s %6s-%-6s track@%-6s win %-3d score %-4d %s\n" % (
                        base.title(c["track"])[:34], fmt(c["start"]), fmt(c["end"]), fmt(c["track_pos"]), c["windows"],
                        c["score"], c["verdict"]))
    except Exception:
        pass  # results of "Check a video" (survive restarts)


def load_checks():
    try:
        return json.load(open(CHECKS, encoding="utf-8"))
    except Exception:
        return {}


def save_checks(d):
    os.makedirs(os.path.dirname(CHECKS), exist_ok=True)
    tmp = CHECKS + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), default=float)
    os.replace(tmp, CHECKS)


def envelope(samples, n=1200):
    if len(samples) < n:
        return np.abs(samples) if len(samples) else np.zeros(n, np.float32)
    k = len(samples) // n
    return np.abs(samples[:k * n]).reshape(n, k).max(axis=1)


# ------------------------------------------------------------------- style --
RED = "#ff5c5c"
ORANGE = "#ff9f43"
GREEN = "#5ee69a"
STATUS_COLORS = {"none": "#4a4a4a", "queue": "#8f8f8f", "run": GOLD, "found": RED, "clean": GREEN,
                 "err": "#ff9f43"}

QSS = """
* { font-family: 'Inter', 'Segoe UI', sans-serif; color: #f2f2f2; }
QMainWindow, QWidget#root { background: #111111; }
QDialog, QMessageBox { background: #161616; }
QToolTip { background: #1d1d1d; color: #f2f2f2; border: 1px solid #3a3a3a; border-radius: 6px; padding: 6px 8px;
           font-size: 12px; }
*:focus { outline: none; }
QScrollArea, QScrollArea > QWidget > QWidget { background: transparent; border: none; }
QLabel#why { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 10px 14px;
             font-size: 13px; color: #dcdcdc; }
QLabel#help { color: #8a8a8a; font-size: 11px; }
QMessageBox QLabel { color: #f2f2f2; font-size: 13px; }
QMessageBox QPushButton { min-width: 84px; }
QWidget#side { background: #0c0c0c; border-right: 1px solid #1f1f1f; }
QPushButton#nav { text-align: left; padding: 9px 14px; border-radius: 8px; border: none;
                  background: transparent; color: #bdbdbd; font-size: 14px; }
QPushButton#nav:hover { background: #171717; color: #ffffff; }
QPushButton#nav:checked { background: #1d1a10; color: #F4C430; font-weight: 700; }
QLabel#brand { background: #F4C430; color: #111; font-weight: 900; font-size: 12px; border-radius: 7px; }
QLabel#h1 { font-size: 24px; font-weight: 800; }
QLabel#h2 { font-size: 16px; font-weight: 800; }
QLabel#sub { color: #8f8f8f; font-size: 13px; }
QLabel#empty { color: #777; font-size: 14px; }
QPushButton#ghost { background: transparent; border: 1px solid #2a2a2a; color: #bdbdbd; padding: 5px 10px;
                    font-size: 12px; }
QPushButton#ghost:hover { border-color: #F4C430; color: #F4C430; }
QPushButton#ghost:checked { border-color: #F4C430; color: #F4C430; }
QSplitter::handle { background: transparent; }
QWidget#pane { background: #151515; border: 1px solid #242424; border-radius: 14px; }
QLabel#muted { color: #8f8f8f; font-size: 12px; }
QLabel#lbl { color: #8f8f8f; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
QFrame#card { background: #161616; border: 1px solid #262626; border-radius: 14px; }
QLineEdit { background: #111111; border: 1px solid #2c2c2c; border-radius: 10px; padding: 9px 12px;
            font-size: 13px; selection-background-color: #F4C430; selection-color: #111; }
QLineEdit:focus { border-color: #F4C430; }
QPushButton { background: #1c1c1c; border: 1px solid #2f2f2f; border-radius: 10px; padding: 8px 14px;
              font-weight: 600; font-size: 13px; }
QPushButton:hover { border-color: #F4C430; color: #F4C430; }
QPushButton:disabled { color: #666; border-color: #222; }
QPushButton#gold { background: #F4C430; color: #111; border: none; font-weight: 800; }
QPushButton#gold:hover { background: #ffd65a; color: #111; }
QPushButton#gold:disabled { background: #6b5a20; color: #222; }
QCheckBox { font-size: 13px; spacing: 8px; }
QCheckBox::indicator { width: 16px; height: 16px; border-radius: 4px; border: 1px solid #444; background: #111; }
QCheckBox::indicator:checked { background: #F4C430; border-color: #F4C430; }
QProgressBar { background: #222; border: none; border-radius: 4px; height: 8px; text-align: center; }
QProgressBar::chunk { background: #F4C430; border-radius: 4px; }
QTreeWidget, QListWidget { background: #161616; border: 1px solid #262626; border-radius: 12px; font-size: 13px;
                           alternate-background-color: #191919; }
QTreeWidget::item, QListWidget::item { padding: 7px 4px; border: none; }
QTreeWidget::item:hover { background: #1c1c1c; }
QTreeWidget::item:selected, QListWidget::item:selected { background: #2b2610; }
QTreeWidget:focus { outline: none; }
QHeaderView::section { background: #161616; color: #8f8f8f; border: none; border-bottom: 1px solid #262626;
                       padding: 6px; font-size: 11px; font-weight: 700; }
QPlainTextEdit { background: #0e0e0e; border: 1px solid #222; border-radius: 10px; font-family: Consolas;
                 font-size: 12px; color: #bdbdbd; }
QSpinBox, QDoubleSpinBox { background: #111; border: 1px solid #2c2c2c; border-radius: 8px; padding: 5px 6px; }
QSpinBox:focus, QDoubleSpinBox:focus { border-color: #F4C430; }
QComboBox { background: #111; border: 1px solid #2c2c2c; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
QComboBox:hover { border-color: #F4C430; }
QComboBox::drop-down { border: none; width: 18px; }
QComboBox QAbstractItemView { background: #161616; border: 1px solid #2c2c2c; selection-background-color: #2a2410;
                              selection-color: #F4C430; outline: none; }
QScrollBar:vertical { background: transparent; width: 10px; }
QScrollBar::handle:vertical { background: #2c2c2c; border-radius: 5px; }
QScrollBar:horizontal { background: transparent; height: 10px; }
QScrollBar::handle:horizontal { background: #2c2c2c; border-radius: 5px; }
QScrollBar::add-line, QScrollBar::sub-line { width: 0; height: 0; }
"""


def card():
    f = QtWidgets.QFrame()
    f.setObjectName("card")
    return f


def label(text, name=None):
    l = QtWidgets.QLabel(text)
    if name:
        l.setObjectName(name)
    l.setWordWrap(True)
    return l


class Wave(QtWidgets.QWidget):
    """Waveform with gold regions.
    Click = play from there. Mouse wheel = zoom in/out at the cursor,
    drag = move along, double-click = whole audio again."""
    clicked = QtCore.pyqtSignal(float)

    def __init__(self, height=84):
        super().__init__()
        self.env = None
        self.gold = []
        self.head = None
        self.hover = None
        self.dur = 0.0
        self.key = None
        self.v0, self.v1 = 0.0, 1.0  # visible part of the audio (0..1)
        self.press = None  # (x, v0, v1) while the mouse button is down
        self.dragged = False
        self.setMinimumHeight(height)
        self.setMaximumHeight(height + 30)
        self.setMouseTracking(True)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)

    def set(self, env, gold, dur=0.0, key=None, color=None):
        if key is None or key != self.key:
            self.v0, self.v1 = 0.0, 1.0  # another audio: show all of it
        self.env, self.gold, self.dur, self.key = env, gold, dur, key
        self.color = color or GOLD
        self.update()

    # -- view helpers --
    def frac_at(self, x):
        return self.v0 + max(0.0, min(1.0, x / max(1, self.width()))) * (self.v1 - self.v0)

    def x_of(self, f):
        return (f - self.v0) / max(1e-9, self.v1 - self.v0) * self.width()

    def set_view(self, a, span):
        span = max(self.min_span(), min(1.0, span))
        a = max(0.0, min(1.0 - span, a))
        self.v0, self.v1 = a, a + span
        self.update()

    def min_span(self):
        # never closer than about 3 seconds across the whole width
        return min(1.0, 3.0 / self.dur) if self.dur else 0.002

    # -- mouse --
    def wheelEvent(self, e):
        if self.env is None:
            return
        dy = e.angleDelta().y()
        dx = e.angleDelta().x()
        span = self.v1 - self.v0
        if dx and not dy or e.modifiers() & QtCore.Qt.KeyboardModifier.ShiftModifier:
            step = -(dx or dy) / 120.0 * span * 0.15
            self.set_view(self.v0 + step, span)
            return
        if not dy:
            return
        x = e.position().x()
        anchor = self.frac_at(x)
        new = span * (0.8 ** (dy / 120.0))
        new = max(self.min_span(), min(1.0, new))
        self.set_view(anchor - x / max(1, self.width()) * new, new)

    def mousePressEvent(self, e):
        if self.env is not None and e.button() == QtCore.Qt.MouseButton.LeftButton:
            self.press = (e.position().x(), self.v0, self.v1)
            self.dragged = False

    def mouseMoveEvent(self, e):
        x = e.position().x()
        if self.press is not None:
            x0, a, b = self.press
            if abs(x - x0) > 4 and (b - a) < 1.0:
                self.dragged = True
                self.setCursor(QtCore.Qt.CursorShape.ClosedHandCursor)
                self.set_view(a - (x - x0) / max(1, self.width()) * (b - a), b - a)
        self.hover = max(0.0, min(1.0, x / max(1, self.width())))
        self.update()

    def mouseReleaseEvent(self, e):
        if self.press is not None and not self.dragged and self.env is not None:
            self.clicked.emit(self.frac_at(e.position().x()))
        self.press = None
        self.dragged = False
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)

    def mouseDoubleClickEvent(self, e):
        self.set_view(0.0, 1.0)

    def leaveEvent(self, _):
        self.hover = None
        self.update()

    # -- drawing --
    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        path = QtGui.QPainterPath()
        path.addRoundedRect(QtCore.QRectF(self.rect()), 10, 10)
        p.setClipPath(path)
        p.fillRect(self.rect(), QtGui.QColor("#141414"))
        w, h = self.width(), self.height()
        if self.env is None:
            p.setPen(QtGui.QColor("#555"))
            p.drawText(self.rect(), QtCore.Qt.AlignmentFlag.AlignCenter, "No audio")
            p.end()
            return
        span = self.v1 - self.v0
        for a, b in self.gold:
            if b < self.v0 or a > self.v1:
                continue
            xa, xb = self.x_of(a), self.x_of(b)
            bg = QtGui.QColor(getattr(self, "color", GOLD))
            bg.setAlpha(45)
            p.fillRect(QtCore.QRectF(xa, 0, max(2, xb - xa), h), bg)
        n = len(self.env)
        if n:
            m = float(self.env.max()) or 1.0
            mid = h / 2
            per_px = span * n / max(1, w)
            grey, gold = QtGui.QColor("#6f6f6f"), QtGui.QColor(getattr(self, "color", GOLD))
            for x in range(w):
                f = self.v0 + x / w * span
                i = int(f * n)
                v = float(self.env[i:i + max(1, int(per_px + 1))].max()) / m if i < n else 0.0
                p.setPen(gold if any(a <= f <= b for a, b in self.gold) else grey)
                p.drawLine(x, int(mid - v * mid * 0.9), x, int(mid + v * mid * 0.9))
        if self.head is not None and self.v0 <= self.head <= self.v1:
            p.setPen(QtGui.QPen(QtGui.QColor("#ffffff"), 2))
            x = int(self.x_of(self.head))
            p.drawLine(x, 0, x, h)
        f = p.font()
        f.setPointSize(8)
        p.setFont(f)
        if self.dur:
            p.setPen(QtGui.QColor("#777"))
            p.drawText(QtCore.QRectF(6, h - 16, 60, 14), QtCore.Qt.AlignmentFlag.AlignLeft, fmt(self.v0 * self.dur))
            p.drawText(QtCore.QRectF(w - 66, h - 16, 60, 14), QtCore.Qt.AlignmentFlag.AlignRight, fmt(self.v1 * self.dur))
        if span < 0.999:
            # where we are in the whole audio: thin bar on top
            p.fillRect(QtCore.QRectF(0, 0, w, 3), QtGui.QColor("#262626"))
            p.fillRect(QtCore.QRectF(self.v0 * w, 0, max(4, span * w), 3), QtGui.QColor(GOLD))
            p.setPen(QtGui.QColor("#777"))
            p.drawText(QtCore.QRectF(w / 2 - 60, h - 16, 120, 14), QtCore.Qt.AlignmentFlag.AlignCenter,
                       "zoom x%d" % round(1 / span))
        if self.hover is not None:
            x = int(self.hover * w)
            p.setPen(QtGui.QPen(QtGui.QColor(255, 255, 255, 90), 1))
            p.drawLine(x, 0, x, h)
            if self.dur:
                t = fmt(self.frac_at(x) * self.dur)
                tx = min(max(x + 6, 4), w - 50)
                p.fillRect(QtCore.QRectF(tx - 3, 6, 44, 16), QtGui.QColor(0, 0, 0, 170))
                p.setPen(QtGui.QColor("#ffffff"))
                p.drawText(QtCore.QRectF(tx - 3, 6, 44, 16), QtCore.Qt.AlignmentFlag.AlignCenter, t)
        p.end()


class Cancelled(Exception):
    pass


class KeepColors(QtWidgets.QStyledItemDelegate):
    """Selected rows keep their own text colours (red = found, green = clean);
    cells without a colour stay light (Windows would paint them black)."""

    def initStyleOption(self, opt, index):
        super().initStyleOption(opt, index)
        fg = index.data(QtCore.Qt.ItemDataRole.ForegroundRole)
        opt.palette.setBrush(QtGui.QPalette.ColorRole.HighlightedText,
                             fg if fg is not None else QtGui.QBrush(QtGui.QColor("#f2f2f2")))
        opt.state &= ~QtWidgets.QStyle.StateFlag.State_HasFocus  # no dotted frame around cells


class CleanStyle(QtWidgets.QProxyStyle):
    """Fusion look on every Windows version, without the dotted focus frames."""

    def drawPrimitive(self, el, opt, p, w=None):
        if el == QtWidgets.QStyle.PrimitiveElement.PE_FrameFocusRect:
            return
        super().drawPrimitive(el, opt, p, w)


def dark_palette():
    pal = QtGui.QPalette()
    c = QtGui.QColor
    R_ = QtGui.QPalette.ColorRole
    for role, col in [(R_.Window, "#111111"), (R_.WindowText, "#f2f2f2"), (R_.Base, "#161616"),
                      (R_.AlternateBase, "#191919"), (R_.ToolTipBase, "#1d1d1d"), (R_.ToolTipText, "#f2f2f2"),
                      (R_.Text, "#f2f2f2"), (R_.Button, "#1c1c1c"), (R_.ButtonText, "#f2f2f2"),
                      (R_.BrightText, "#ffffff"), (R_.Highlight, "#2b2610"), (R_.HighlightedText, "#f2f2f2"),
                      (R_.PlaceholderText, "#777777"), (R_.Link, GOLD)]:
        pal.setColor(role, c(col))
    pal.setColor(QtGui.QPalette.ColorGroup.Disabled, R_.Text, c("#666666"))
    pal.setColor(QtGui.QPalette.ColorGroup.Disabled, R_.ButtonText, c("#666666"))
    return pal


class Signals(QtCore.QObject):
    log = QtCore.pyqtSignal(str)
    stage = QtCore.pyqtSignal(str, float)  # frac < 0 = unknown
    done = QtCore.pyqtSignal(object)


class App(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = load_settings()
        set_store(self.settings.get("store_dir") or None)
        MATCH.update(self.settings.get("match") or {})
        self.view_rows = []
        self.retried = set()  # videos that got one more try after a YouTube 403
        self.overview = None  # Admin -> Whitelisting data (customers, channels, finds)
        self.hcache = {}  # videoId -> {"h", "dur"} fingerprint of checked videos (this session)
        self.base = Base()
        self.sig = Signals()
        self.sig.log.connect(self._log)
        self.sig.stage.connect(self._stage)
        self.sig.done.connect(lambda f: f())
        self.running = False
        self.busy = False
        self.recent = []
        self.track_env = {}
        self.play = None
        self.checks = load_checks()  # videoId -> result of a manual check
        self.queue = []  # (videoId, novoice) waiting to be checked
        self.checking = None  # videoId being checked now
        self.qlock = threading.Lock()
        self.loop_on = False
        self.cancel = False
        self.check_pct = 0
        self.cur_vid = None  # video shown on the right
        self.vmeta = {}  # videoId -> {id, title, dur, short}
        self.vitems = {}  # videoId -> list item
        self.dots = {}
        self.setWindowTitle("TV Music Store - Whitelist Scanner")
        self.resize(1320, 860)
        self.setMinimumSize(1000, 640)

        root = QtWidgets.QWidget()
        root.setObjectName("root")
        self.setCentralWidget(root)
        lay = QtWidgets.QHBoxLayout(root)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        side = QtWidgets.QWidget()
        side.setObjectName("side")
        side.setFixedWidth(210)
        sl = QtWidgets.QVBoxLayout(side)
        sl.setContentsMargins(14, 22, 14, 14)
        brand = QtWidgets.QHBoxLayout()
        mark = QtWidgets.QLabel("TV")
        mark.setObjectName("brand")
        mark.setFixedSize(28, 28)
        mark.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        brand.addWidget(mark)
        bt = QtWidgets.QLabel("Whitelist\nScanner")
        bt.setStyleSheet("font-size:12px;font-weight:800;line-height:1")
        brand.addWidget(bt, 1)
        sl.addLayout(brand)
        sl.addSpacing(18)
        self.pages = QtWidgets.QStackedWidget()
        self.navs = []
        for i, name in enumerate(["Scanner", "Check a video", "Settings"]):
            b = QtWidgets.QPushButton(name)
            b.setObjectName("nav")
            b.setCheckable(True)
            b.clicked.connect(lambda _, k=i: self.goto(k))
            sl.addWidget(b)
            self.navs.append(b)
        sl.addStretch(1)
        self.side_status = label("", "muted")
        sl.addWidget(self.side_status)
        lay.addWidget(side)

        right = QtWidgets.QWidget()
        rl = QtWidgets.QVBoxLayout(right)
        rl.setContentsMargins(24, 20, 24, 14)
        rl.setSpacing(10)
        rl.addWidget(self.pages, 1)
        bar = QtWidgets.QHBoxLayout()
        self.stage_lbl = label("", "muted")
        self.stage_lbl.setWordWrap(False)
        self.pbar = QtWidgets.QProgressBar()
        self.pbar.setFixedWidth(260)
        self.pbar.setFixedHeight(6)
        self.pbar.setTextVisible(False)
        self.pbar.setRange(0, 1000)
        self.btn_log = QtWidgets.QPushButton("Log")
        self.btn_log.setObjectName("ghost")
        self.btn_log.setCheckable(True)
        self.btn_log.toggled.connect(lambda on: self.logbox.setVisible(on))
        bar.addWidget(self.stage_lbl, 1)
        bar.addWidget(self.pbar)
        bar.addSpacing(10)
        bar.addWidget(self.btn_log)
        rl.addLayout(bar)
        self.logbox = QtWidgets.QPlainTextEdit()
        self.logbox.setReadOnly(True)
        self.logbox.setFixedHeight(130)
        self.logbox.setVisible(False)
        rl.addWidget(self.logbox)
        lay.addWidget(right, 1)

        self.pages.addWidget(self.page_scanner())
        self.pages.addWidget(self.page_check())
        self.pages.addWidget(self.page_settings())
        self.goto(0 if self.settings["token"] else 2)

        self.timer = QtCore.QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.play_timer = QtCore.QTimer(self)
        self.play_timer.timeout.connect(self._play_tick)
        self.bg(self.prepare)

    # ---- plumbing ----------------------------------------------------------
    def goto(self, k):
        self.pages.setCurrentIndex(k)
        for i, b in enumerate(self.navs):
            b.setChecked(i == k)

    def log(self, msg):
        self.sig.log.emit(msg)

    def _log(self, msg):
        self.logbox.appendPlainText(time.strftime("%H:%M  ") + msg)
        if msg.startswith("ERROR") or "FAILED" in msg or msg.startswith("Could not"):
            self.btn_log.setChecked(True)  # problems open the log by themselves

    def stage(self, text, frac=None):
        self.sig.stage.emit(text, -1.0 if frac is None else float(frac))

    def _stage(self, text, frac):
        self.stage_lbl.setText(text)
        # The bar is shown only while something is being done; when a step is
        # finished (or the scanner just waits) it disappears.
        idle = frac >= 1 or text.startswith(("Error", "Site not", "Enter the", "Waiting"))
        self.pbar.setVisible(not idle)
        if frac < 0:
            self.pbar.setRange(0, 0)
        else:
            self.pbar.setRange(0, 1000)
            self.pbar.setValue(int(1000 * max(0.0, min(1.0, frac))))

    def ui(self, fn):
        self.sig.done.emit(fn)

    def bg(self, fn, *a):
        def run():
            try:
                fn(*a)
            except Exception as e:
                self.log("ERROR: %s" % e)
                self.log(traceback.format_exc().splitlines()[-1])
                self.stage("Error: %s" % e, 0)
        threading.Thread(target=run, daemon=True).start()

    # ---- start ---------------------------------------------------------------
    def prepare(self):
        os.makedirs(CACHE, exist_ok=True)
        if self.base.load():
            self.log("Track base loaded: %d tracks." % len(self.base.meta))
        else:
            self.log("No track base yet.")
        if self.settings["token"]:
            try:
                n = self.base.update(self.settings, self.log, self.stage)
                self.base.fresh = []  # first fill: nothing to re-check
                self.log("Track base ready: %d tracks (%d new)." % (len(self.base.meta), n))
                self.stage("Ready", 1)
            except Exception as e:
                self.log("Could not reach the site: %s" % e)
                self.stage("Site not reachable", 0)
        else:
            self.stage("Enter the admin token in Settings", 0)
        self.load_overview()
        self.ui(self.refresh_status)

    # ---- Scanner page --------------------------------------------------------
    def page_scanner(self):
        w = QtWidgets.QWidget()
        l = QtWidgets.QVBoxLayout(w)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(10)
        l.addWidget(label("Whitelist Scanner", "h1"))
        c = card()
        cl = QtWidgets.QHBoxLayout(c)
        cl.setContentsMargins(18, 14, 18, 14)
        self.dot = QtWidgets.QLabel()
        self.dot.setFixedSize(10, 10)
        cl.addWidget(self.dot)
        col = QtWidgets.QVBoxLayout()
        self.st_title = label("Stopped")
        self.st_title.setStyleSheet("font-size:15px;font-weight:700")
        self.st_sub = label("", "muted")
        col.addWidget(self.st_title)
        col.addWidget(self.st_sub)
        cl.addLayout(col, 1)
        self.k_customers = self.kpi(cl, "-", "customers")
        self.k_channels = self.kpi(cl, "-", "channels")
        self.k_checked = self.kpi(cl, "-", "videos checked")
        self.k_found = self.kpi(cl, "-", "with our music")
        self.k_queue = self.kpi(cl, "-", "in the queue")
        self.btn_run = QtWidgets.QPushButton("Start scanning")
        self.btn_run.setObjectName("gold")
        self.btn_run.clicked.connect(self.toggle)
        cl.addWidget(self.btn_run)
        l.addWidget(c)

        split = QtWidgets.QSplitter(QtCore.Qt.Orientation.Vertical)
        split.setHandleWidth(10)
        top = QtWidgets.QWidget()
        tl = QtWidgets.QVBoxLayout(top)
        tl.setContentsMargins(0, 0, 0, 0)
        tl.setSpacing(6)
        row = QtWidgets.QHBoxLayout()
        cap = label("CUSTOMERS AND CHANNELS", "lbl")
        cap.setWordWrap(False)
        row.addWidget(cap)
        row.addStretch(1)
        self.cust_filter = QtWidgets.QLineEdit()
        self.cust_filter.setPlaceholderText("Find a customer, channel or video")
        self.cust_filter.setFixedWidth(280)
        self.cust_filter.textChanged.connect(lambda *_: self.fill_customers())
        row.addWidget(self.cust_filter)
        b = QtWidgets.QPushButton("Refresh")
        b.setObjectName("ghost")
        b.clicked.connect(lambda: self.bg(self.load_overview))
        row.addWidget(b)
        tl.addLayout(row)
        self.cust = QtWidgets.QTreeWidget()
        self.cust.setHeaderLabels(["Customer / channel / video", "Plan / state", "Checked", "Our music",
                                   "Waiting", "Released"])
        self.cust.setItemDelegate(KeepColors(self.cust))
        self.cust.setUniformRowHeights(True)
        hd = self.cust.header()
        hd.setStretchLastSection(False)
        hd.setSectionResizeMode(0, QtWidgets.QHeaderView.ResizeMode.Stretch)
        for i, wdt in enumerate([0, 170, 80, 85, 75, 80]):
            if i:
                self.cust.setColumnWidth(i, wdt)
        self.cust.itemDoubleClicked.connect(self.open_cust_item)
        tl.addWidget(self.cust, 1)
        split.addWidget(top)

        bottom = QtWidgets.QWidget()
        bl = QtWidgets.QVBoxLayout(bottom)
        bl.setContentsMargins(0, 0, 0, 0)
        bl.setSpacing(6)
        bl.addWidget(label("LAST VIDEOS CHECKED ON THIS COMPUTER", "lbl"))
        self.recent_list = QtWidgets.QTreeWidget()
        self.recent_list.setHeaderLabels(["Time", "Video", "Channel", "Found"])
        self.recent_list.setRootIsDecorated(False)
        self.recent_list.setAlternatingRowColors(True)
        self.recent_list.setColumnWidth(0, 60)
        self.recent_list.setColumnWidth(1, 380)
        self.recent_list.setColumnWidth(2, 200)
        bl.addWidget(self.recent_list, 1)
        split.addWidget(bottom)
        split.setSizes([460, 200])
        l.addWidget(split, 1)
        return w

    # ---- customers overview (from the site) ------------------------------------
    def load_overview(self):
        if not self.settings.get("token"):
            return
        try:
            d = api(self.settings, "GET", "?action=overview", timeout=60)
        except Exception as e:
            self.log("Could not load the customer list: %s" % e)
            return
        if d.get("error"):
            self.log("Could not load the customer list: %s" % d["error"])
            return
        self.overview = d
        self.ui(self.fill_customers)

    def fill_customers(self):
        d = self.overview
        if not d:
            return
        chans = d.get("channels") or []
        matches = d.get("matches") or []
        by_chan = {}
        for m in matches:
            by_chan.setdefault(m.get("channelId"), []).append(m)
        customers = {c["userId"] for c in chans if not c.get("group")}
        found_videos = {m["videoId"] for m in matches}
        self.k_customers.setText(str(len(customers)))
        self.k_channels.setText(str(len(chans)))
        self.k_checked.setText(str(sum(int(c.get("checked") or 0) for c in chans)))
        self.k_found.setText(str(len(found_videos)))
        self.k_queue.setText(str((d.get("scanner") or {}).get("queue", 0)))

        q = self.cust_filter.text().strip().lower()
        groups = {}
        for c in chans:
            key = ("custom", c["group"]) if c.get("group") else ("user", c["userId"])
            groups.setdefault(key, []).append(c)
        rank = {"active": 0, "paused": 1, "noplan": 2}

        def group_sort(item):
            (kind, _k), lst = item
            best = min(rank.get(c["state"], 3) for c in lst)
            return (kind == "custom", best, (lst[0].get("email") or lst[0].get("group") or "").lower())

        plan_look = {"max": ("MAX", GOLD), "pro": ("PRO", GOLD), "custom": ("CUSTOM LIST", "#7cc7ff")}
        state_look = {"active": ("Protected", GREEN), "paused": ("Paused: over plan limit", "#9a9a9a"),
                      "noplan": ("No plan: claims not released", ORANGE)}
        expanded = {self.cust.topLevelItem(i).data(0, 256) for i in range(self.cust.topLevelItemCount())
                    if self.cust.topLevelItem(i).isExpanded()}
        self.cust.clear()
        bold = QtGui.QFont()
        bold.setBold(True)
        for (kind, key), lst in sorted(groups.items(), key=group_sort):
            name = ("[Custom] " + key) if kind == "custom" else (lst[0].get("email") or key)
            vids_all = [m for c in lst for m in by_chan.get(c["id"], [])]
            text_all = " ".join([name] + [c.get("title") or c.get("url") or "" for c in lst] +
                                [m.get("videoTitle") or "" for m in vids_all]).lower()
            if q and q not in text_all:
                continue
            plan = "custom" if kind == "custom" else lst[0].get("plan") or "free"
            pl_text, pl_col = plan_look.get(plan, ("NO PLAN", ORANGE))
            waiting = sum(int(c.get("waiting") or 0) for c in lst)
            top = QtWidgets.QTreeWidgetItem([
                "%s   (%d channel%s)" % (name, len(lst), "" if len(lst) == 1 else "s"), pl_text,
                str(sum(int(c.get("checked") or 0) for c in lst)), str(len({m["videoId"] for m in vids_all})),
                str(waiting), str(sum(int(c.get("released") or 0) for c in lst))])
            top.setData(0, 256, "%s:%s" % (kind, key))
            top.setFont(0, bold)
            top.setForeground(1, QtGui.QBrush(QtGui.QColor(pl_col)))
            top.setFont(1, bold)
            if waiting:
                top.setForeground(4, QtGui.QBrush(QtGui.QColor(RED)))
            self.cust.addTopLevelItem(top)
            for c in sorted(lst, key=lambda c: rank.get(c["state"], 3)):
                st_text, st_col = state_look.get(c["state"], (c["state"], "#9a9a9a"))
                vids = by_chan.get(c["id"], [])
                ch = QtWidgets.QTreeWidgetItem([
                    c.get("title") or c.get("url") or "", st_text, str(c.get("checked") or 0),
                    str(len({m["videoId"] for m in vids})), str(c.get("waiting") or 0), str(c.get("released") or 0)])
                ch.setData(0, 256, c.get("url") or "")
                ch.setToolTip(0, "%s\nVideos checked from %s" % (c.get("url") or "", c.get("checkFrom") or "?"))
                ch.setForeground(1, QtGui.QBrush(QtGui.QColor(st_col)))
                top.addChild(ch)
                per_video = {}
                for m in vids:
                    per_video.setdefault(m["videoId"], []).append(m)
                for vid, ms in sorted(per_video.items(), key=lambda x: x[1][0].get("publishedAt") or "", reverse=True):
                    states = {m["state"] for m in ms}
                    if "in_sheet" in states or "new" in states:
                        vs, vc = "waiting for release", RED
                    elif states == {"released"}:
                        vs, vc = "released", GREEN
                    elif "not_eligible" in states:
                        vs, vc = "no plan when published", ORANGE
                    else:
                        vs, vc = ", ".join(sorted(states)), "#9a9a9a"
                    vi = QtWidgets.QTreeWidgetItem([
                        "%s   -   %s" % (ms[0].get("videoTitle") or vid, ", ".join(sorted({m["track"] for m in ms}))),
                        vs, "", "", "", ""])
                    vi.setData(0, 256, "https://www.youtube.com/watch?v=" + vid)
                    vi.setForeground(1, QtGui.QBrush(QtGui.QColor(vc)))
                    vi.setToolTip(0, "Double-click to open the video")
                    ch.addChild(vi)
            top.setExpanded(bool(q) or top.data(0, 256) in expanded or len(groups) <= 6)

    def open_cust_item(self, it, _col):
        url = it.data(0, 256) or ""
        if url.startswith("http"):
            QtGui.QDesktopServices.openUrl(QtCore.QUrl(url))

    def kpi(self, lay, val, text):
        box = QtWidgets.QVBoxLayout()
        v = QtWidgets.QLabel(val)
        v.setStyleSheet("font-size:22px;font-weight:800")
        v.setAlignment(QtCore.Qt.AlignmentFlag.AlignRight)
        t = label(text, "muted")
        t.setAlignment(QtCore.Qt.AlignmentFlag.AlignRight)
        box.addWidget(v)
        box.addWidget(t)
        lay.addLayout(box)
        lay.addSpacing(18)
        return v

    def refresh_status(self):
        on = self.running
        self.dot.setStyleSheet("border-radius:5px;background:%s" % ("#5ee69a" if on else "#ff6b6b"))
        self.st_title.setText("Scanning" if on else "Stopped")
        self.st_sub.setText(("%s  -  base: %d tracks  -  checks every %d min"
                             % (self.settings["site"].replace("https://", ""), len(self.base.meta),
                                self.settings["interval_min"])))
        self.btn_run.setText("Stop" if on else "Start scanning")
        self.side_status.setText(("Scanner: running" if on else "Scanner: stopped"))
        n_local = sum(1 for m in self.base.meta.values() if m.get("source") == "local")
        self.base_lbl.setText("Track base: %d tracks from the site + %d from the unreleased folder "
                              "(unreleased/<Composer>/<Track title>.wav). Tracks deleted on the site or from the "
                              "folder leave the base by themselves." % (len(self.base.meta) - n_local, n_local))

    def toggle(self):
        if not self.settings["token"]:
            self.goto(2)
            return
        self.running = not self.running
        if self.running:
            self.timer.start(int(self.settings["interval_min"]) * 60000)
            self.tick()
        else:
            self.timer.stop()
        self.refresh_status()

    def tick(self):
        if self.busy or not self.running:
            return
        self.busy = True
        self.bg(self._cycle)

    def _cycle(self):
        try:
            # New tracks from the site every cycle (the site answers from its
            # cache, so this is nearly free when nothing changed).
            n_new = self.base.update(self.settings, self.log, self.stage)
            if n_new:
                self.log("%d new track(s) added to the base." % n_new)
                self.recheck_fresh()
            while self.running:
                self.stage("Asking the site for new videos...")
                q = api(self.settings, "GET", "?action=queue&limit=%d&host=%s"
                        % (int(self.settings["batch"]), urllib.request.quote(socket.gethostname())), timeout=120)
                vids = q.get("videos", [])
                if not vids:
                    self.stage("Waiting. No new videos (next check in %d min)" % self.settings["interval_min"], 1)
                    break
                self.log("%d video(s) to check, %d more in the queue." % (len(vids), q.get("queueLeft", 0)))
                for v in vids:
                    if not self.running:
                        break
                    self.scan_one(v)
        finally:
            self.busy = False
            self.load_overview()
            self.ui(self.refresh_status)

    def recheck_fresh(self):
        """New tracks on the site: look for them in videos already checked that
        were published after the track appeared (stored fingerprints, no download)."""
        import hash_table
        fresh, self.base.fresh = self.base.fresh, []
        if not fresh or not os.path.isdir(PRINTS):
            return
        since = min((self.base.meta[t].get("addedAt") or "0000") for t, _ in fresh)
        small = hash_table.HashTable(hashbits=20, depth=100, maxtime=65536)
        for tid, hashes in fresh:
            small.store(tid, hashes)
        files = [f for f in os.listdir(PRINTS) if f.endswith(".npz")]
        hits = 0
        for i, f in enumerate(files):
            z = np.load(os.path.join(PRINTS, f))
            pub = str(z["pub"][0])[:10]
            if pub and pub < since:
                continue
            self.stage("Re-checking videos for the new track(s)  %d / %d" % (i + 1, len(files)),
                       (i + 1) / max(1, len(files)))
            segs = fp.find_tracks(None, small, hashes=z["h"], dur=float(z["dur"][0]), **match_kw())
            if not segs:
                continue
            rows = rows_from_segments(self.base, segs)
            vid = f[:-4]
            api(self.settings, "POST", "", {"action": "result", "videoId": vid, "append": True,
                                            "matches": [match_payload(self.base, r) for r in rows]})
            hits += 1
            self.log("Re-check: %s found in %s" % (", ".join(r["title"] for r in rows), vid))
        self.log("Re-check for new track(s) done: %d video(s) with them." % hits)

    def scan_one(self, v):
        t0 = time.time()
        title = v.get("title") or v["videoId"]
        try:
            audio = download_audio(v["videoId"], lambda t, f: self.stage("%s  -  %s" % (title[:40], t), f))
            dbg = []
            samples, rows = find_in_audio(self.base, audio, self.settings["novoice"],
                                          lambda t, f: self.stage("%s  -  %s" % (title[:40], t), f), dbg)
            write_check_log(self.base, v["videoId"], "[auto] " + title, self.settings["novoice"], rows, dbg,
                            time.time() - t0)
            save_print(v["videoId"], samples, v.get("publishedAt", ""))
            matches = [match_payload(self.base, r) for r in rows]
            api(self.settings, "POST", "", {"action": "result", "videoId": v["videoId"], "matches": matches})
            found = ", ".join("%s (%s)" % (r["title"], r["composer"]) for r in rows)
            self.log("%s: %s  [%.0f s]" % (title, found or "nothing", time.time() - t0))
            self.add_recent(v, found)
            # The audio is not needed any more once the result is on the site.
            for f in os.listdir(CACHE):
                if f.startswith(v["videoId"] + "."):
                    try:
                        os.remove(os.path.join(CACHE, f))
                    except OSError:
                        pass
        except Exception as e:
            msg = str(e).splitlines()[0] if str(e) else repr(e)
            if "403" in msg and v["videoId"] not in self.retried:
                # YouTube said no this time: back into the queue, tried again next round
                self.retried.add(v["videoId"])
                self.log("%s: YouTube refused the download (403), will try again later" % title)
                try:
                    api(self.settings, "POST", "", {"action": "requeue", "videoId": v["videoId"]})
                except Exception:
                    pass
                self.add_recent(v, "retry later (YouTube 403)")
                return
            self.log("%s: FAILED %s" % (title, msg))
            try:
                api(self.settings, "POST", "", {"action": "result", "videoId": v["videoId"], "error": msg})
            except Exception:
                pass
            self.add_recent(v, "error: " + msg[:60])

    def add_recent(self, v, found):
        problem = bool(found) and (found.startswith("error") or found.startswith("retry"))
        rec = {"time": time.strftime("%H:%M"), "title": v.get("title", ""), "channel": v.get("channelTitle", ""),
               "found": found if found and not problem else ""}
        self.recent.insert(0, rec)

        def put():
            it = QtWidgets.QTreeWidgetItem([rec["time"], rec["title"], rec["channel"], found or "-"])
            if rec["found"]:
                it.setForeground(3, QtGui.QBrush(QtGui.QColor(RED)))
            elif problem:
                it.setForeground(3, QtGui.QBrush(QtGui.QColor(ORANGE)))
            self.recent_list.insertTopLevelItem(0, it)
            self.refresh_status()
        self.ui(put)

    # ---- Check a video page --------------------------------------------------
    # Left: the channel's videos (as many as you like, Ctrl/Shift to pick
    # several). Each row shows its state: grey = not checked, gold = checking,
    # green = clean, red = our music found. Right: the HIGHLIGHTED video -
    # tracks found, both waveforms, click to listen. Results are kept in
    # data/checks.json, so a channel loaded again shows what was checked.
    def page_check(self):
        w = QtWidgets.QWidget()
        l = QtWidgets.QVBoxLayout(w)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(12)
        l.addWidget(label("Check a video", "h1"))

        split = QtWidgets.QSplitter(QtCore.Qt.Orientation.Horizontal)
        split.setHandleWidth(12)
        split.setChildrenCollapsible(False)

        # -- left: link + list --
        left = QtWidgets.QFrame()
        left.setObjectName("pane")
        ll = QtWidgets.QVBoxLayout(left)
        ll.setContentsMargins(14, 14, 14, 14)
        ll.setSpacing(10)
        row = QtWidgets.QHBoxLayout()
        self.url = QtWidgets.QLineEdit()
        self.url.setPlaceholderText("Paste a YouTube channel or video link")
        self.url.returnPressed.connect(self.load_videos)
        b = QtWidgets.QPushButton("Load")
        b.clicked.connect(self.load_videos)
        row.addWidget(self.url, 1)
        row.addWidget(b)
        ll.addLayout(row)
        row = QtWidgets.QHBoxLayout()
        self.vfilter = QtWidgets.QLineEdit()
        self.vfilter.setPlaceholderText("Filter by title")
        self.vfilter.textChanged.connect(self.apply_filter)
        row.addWidget(self.vfilter, 1)
        self.only = QtWidgets.QComboBox()
        self.only.addItems(["All", "Not checked", "Our music found", "Clean"])
        self.only.currentIndexChanged.connect(self.apply_filter)
        row.addWidget(self.only)
        ll.addLayout(row)
        self.vlist = QtWidgets.QTreeWidget()
        self.vlist.setHeaderLabels(["Video", "Length", "Result"])
        self.vlist.setRootIsDecorated(False)
        self.vlist.setUniformRowHeights(True)
        self.vlist.setSelectionMode(QtWidgets.QAbstractItemView.SelectionMode.ExtendedSelection)
        self.vlist.setIconSize(QtCore.QSize(10, 10))
        self.vlist.setItemDelegate(KeepColors(self.vlist))
        hd = self.vlist.header()
        hd.setStretchLastSection(False)
        hd.setSectionResizeMode(0, QtWidgets.QHeaderView.ResizeMode.Stretch)
        hd.setSectionResizeMode(1, QtWidgets.QHeaderView.ResizeMode.Fixed)
        hd.setSectionResizeMode(2, QtWidgets.QHeaderView.ResizeMode.Fixed)
        self.vlist.setColumnWidth(1, 64)
        self.vlist.setColumnWidth(2, 118)
        self.vlist.currentItemChanged.connect(lambda cur, _p: self.show_video(cur.data(0, 256) if cur else None))
        self.vlist.itemSelectionChanged.connect(self.update_check_btn)
        self.vlist.itemDoubleClicked.connect(lambda *_: self.check_selected())
        ll.addWidget(self.vlist, 1)
        self.vcount = label("Paste a link above. Pick several videos with Ctrl or Shift.", "muted")
        ll.addWidget(self.vcount)
        row = QtWidgets.QHBoxLayout()
        self.cb_voice = QtWidgets.QCheckBox("Remove voice (slower)")
        self.cb_voice.setToolTip("Finds quiet music under talking. Takes several times longer.")
        row.addWidget(self.cb_voice)
        row.addStretch(1)
        self.btn_stop = QtWidgets.QPushButton("Stop")
        self.btn_stop.setToolTip("Stop checking: the video being checked now and the queue")
        self.btn_stop.clicked.connect(self.stop_checking)
        self.btn_stop.setVisible(False)
        row.addWidget(self.btn_stop)
        self.btn_check = QtWidgets.QPushButton("Check selected")
        self.btn_check.setObjectName("gold")
        self.btn_check.clicked.connect(self.check_selected)
        row.addWidget(self.btn_check)
        ll.addLayout(row)
        split.addWidget(left)

        # -- right: the highlighted video --
        right = QtWidgets.QFrame()
        right.setObjectName("pane")
        rl = QtWidgets.QVBoxLayout(right)
        rl.setContentsMargins(18, 16, 18, 16)
        rl.setSpacing(10)
        head = QtWidgets.QHBoxLayout()
        col = QtWidgets.QVBoxLayout()
        col.setSpacing(4)
        self.d_title = label("No video selected", "h2")
        self.d_sub = label("", "muted")
        col.addWidget(self.d_title)
        col.addWidget(self.d_sub)
        head.addLayout(col, 1)
        self.btn_open = QtWidgets.QPushButton("\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u0430 YouTube")
        self.btn_open.setObjectName("ghost")
        self.btn_open.clicked.connect(self.open_youtube)
        head.addWidget(self.btn_open, 0, QtCore.Qt.AlignmentFlag.AlignTop)
        self.btn_send = QtWidgets.QPushButton("Manual check")
        self.btn_send.setToolTip("For an old video of a customer you brought in: sends the result to the site, "
                                 "and the claims are released whatever the video date.")
        self.btn_send.clicked.connect(self.send_manual)
        head.addWidget(self.btn_send, 0, QtCore.Qt.AlignmentFlag.AlignTop)
        rl.addLayout(head)

        self.d_stack = QtWidgets.QStackedWidget()
        self.d_empty = label("", "empty")
        self.d_empty.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        self.d_stack.addWidget(self.d_empty)
        res_page = QtWidgets.QWidget()
        pl = QtWidgets.QVBoxLayout(res_page)
        pl.setContentsMargins(0, 0, 0, 0)
        pl.setSpacing(8)
        self.res = QtWidgets.QTreeWidget()
        self.res.setHeaderLabels(["\u0422\u0440\u0435\u043a", "\u041a\u043e\u043c\u043f\u043e\u0437\u0438\u0442\u043e\u0440", "\u0413\u0434\u0435 \u0432 \u0432\u0438\u0434\u0435\u043e", "\u0417\u0432\u0443\u0447\u0438\u0442", "\u0418\u0442\u043e\u0433", "\u0421\u0430\u0439\u0442"])
        self.res.setRootIsDecorated(False)
        rh = self.res.header()
        rh.setStretchLastSection(False)
        rh.setSectionResizeMode(2, QtWidgets.QHeaderView.ResizeMode.Stretch)
        self.res.setColumnWidth(0, 135)
        self.res.setColumnWidth(1, 92)
        self.res.setColumnWidth(3, 52)
        self.res.setColumnWidth(4, 86)
        self.res.setColumnWidth(5, 96)
        self.res.itemClicked.connect(self.open_site_cell)
        self.res.setMouseTracking(True)
        self.res.setMaximumHeight(150)
        self.res.setItemDelegate(KeepColors(self.res))
        self.res.itemSelectionChanged.connect(self.draw)
        pl.addWidget(self.res)
        self.clean_lbl = label("None of our tracks found in this video.", "sub")
        self.clean_lbl.setStyleSheet("color:%s;font-size:13px;font-weight:600" % GREEN)
        pl.addWidget(self.clean_lbl)
        pl.addSpacing(4)
        self.video_lbl = label("\u0410\u0423\u0414\u0418\u041e \u0412\u0418\u0414\u0415\u041e", "lbl")
        pl.addWidget(self.video_lbl)
        self.w_video = Wave()
        self.w_video.clicked.connect(lambda f: self.click_play("video", f))
        pl.addWidget(self.w_video)
        pl.addSpacing(4)
        self.track_lbl = label("\u0422\u0420\u0415\u041a", "lbl")
        pl.addWidget(self.track_lbl)
        self.w_track = Wave()
        self.w_track.clicked.connect(lambda f: self.click_play("track", f))
        pl.addWidget(self.w_track)
        row = QtWidgets.QHBoxLayout()
        self.hint_lbl = label(HINT_FOUND, "muted")
        row.addWidget(self.hint_lbl, 1)
        stop = QtWidgets.QPushButton("\u0421\u0442\u043e\u043f \u0437\u0432\u0443\u043a")
        stop.setObjectName("ghost")
        stop.clicked.connect(self.stop_play)
        row.addWidget(stop)
        pl.addLayout(row)
        pl.addSpacing(6)
        self.why_lbl = label("", "why")
        self.why_lbl.setTextFormat(QtCore.Qt.TextFormat.RichText)
        pl.addWidget(self.why_lbl)
        pl.addSpacing(6)
        pl.addWidget(self.match_box())
        pl.addStretch(1)
        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(res_page)
        self.d_stack.addWidget(scroll)
        rl.addWidget(self.d_stack, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 5)
        split.setStretchFactor(1, 6)
        split.setSizes([470, 700])
        l.addWidget(split, 1)
        self.show_video(None)
        self.update_check_btn()
        return w

    # -- matching settings (play with them on one video, then save) --
    def match_box(self):
        box = QtWidgets.QFrame()
        box.setObjectName("card")
        g = QtWidgets.QGridLayout(box)
        g.setContentsMargins(14, 10, 14, 12)
        g.setHorizontalSpacing(14)
        g.setVerticalSpacing(4)
        g.addWidget(label("\u041d\u0410\u0421\u0422\u0420\u041e\u0419\u041a\u0418 \u041f\u041e\u0418\u0421\u041a\u0410", "lbl"), 0, 0, 1, 3)
        spec = [
            ("min_len", "\u041c\u0438\u043d. \u0434\u043b\u0438\u043d\u0430, \u0441\u0435\u043a", 0.0, 120.0, 0.5, 1,
             "\u0421\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0435\u043a\u0443\u043d\u0434 \u043f\u043e\u0434\u0440\u044f\u0434 \u0442\u0440\u0435\u043a \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0442\u044c. \u0411\u043e\u043b\u044c\u0448\u0435 = \u043c\u0435\u043d\u044c\u0448\u0435 \u043b\u043e\u0436\u043d\u044b\u0445 \u043d\u0430\u0445\u043e\u0434\u043e\u043a."),
            ("min_score", "\u041c\u0438\u043d. \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c", 1, 2000, 5, 0,
             "\u0421\u043a\u043e\u043b\u044c\u043a\u043e \u0442\u043e\u0447\u0435\u043a \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0430 \u0437\u0432\u0443\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u043e \u0441\u043e\u0432\u043f\u0430\u0441\u0442\u044c \u0432 \u043b\u0443\u0447\u0448\u0435\u043c \u043a\u0443\u0441\u043a\u0435. \u0411\u043e\u043b\u044c\u0448\u0435 = \u0441\u0442\u0440\u043e\u0436\u0435."),
            ("min_windows", "\u041a\u0443\u0441\u043a\u043e\u0432 \u043f\u043e\u0434\u0440\u044f\u0434", 1, 50, 1, 0,
             "\u041a\u0443\u0441\u043a\u043e\u0432 \u043f\u043e 8 \u0441\u0435\u043a (\u043a\u0430\u0436\u0434\u044b\u0435 2 \u0441\u0435\u043a), \u0441\u043e\u0432\u043f\u0430\u0432\u0448\u0438\u0445 \u0441 \u043e\u0434\u043d\u0438\u043c \u043c\u0435\u0441\u0442\u043e\u043c \u0442\u0440\u0435\u043a\u0430. \u0411\u043e\u043b\u044c\u0448\u0435 = \u0441\u0442\u0440\u043e\u0436\u0435."),
            ("strong", "\u0421\u0438\u043b\u044c\u043d\u0430\u044f \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c", 1, 5000, 10, 0,
             "\u0421 \u0442\u0430\u043a\u043e\u0439 \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c\u044e \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u043e\u0434\u043d\u043e\u0433\u043e \u043a\u0443\u0441\u043a\u0430 (\u043c\u0438\u043d. \u0434\u043b\u0438\u043d\u0430 \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e \u043d\u0443\u0436\u043d\u0430)."),
            ("align", "\u0422\u043e\u0447\u043d\u043e\u0441\u0442\u044c, \u0441\u0435\u043a", 0.1, 5.0, 0.1, 1,
             "\u041d\u0430\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0440\u043e\u0432\u043d\u043e \u043a\u0443\u0441\u043a\u0438 \u0434\u043e\u043b\u0436\u043d\u044b \u0438\u0434\u0442\u0438 \u043f\u043e \u0442\u0440\u0435\u043a\u0443. \u041c\u0435\u043d\u044c\u0448\u0435 = \u0441\u0442\u0440\u043e\u0436\u0435."),
            ("noise_ratio", "\u0421\u0438\u043b\u044c\u043d\u0435\u0435 \u0448\u0443\u043c\u0430, \u0440\u0430\u0437", 1.0, 20.0, 0.5, 1,
             "\u0412\u043e \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0440\u0430\u0437 \u043d\u0430\u0445\u043e\u0434\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0441\u0438\u043b\u044c\u043d\u0435\u0435 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u043e\u0433\u043e \u0448\u0443\u043c\u0430 \u044d\u0442\u043e\u0433\u043e \u0432\u0438\u0434\u0435\u043e. \u0411\u043e\u043b\u044c\u0448\u0435 = \u0441\u0442\u0440\u043e\u0436\u0435."),
        ]
        self.mspins = {}
        for i, (k, text, lo, hi, step, dec, tip) in enumerate(spec):
            sb = QtWidgets.QDoubleSpinBox() if dec else QtWidgets.QSpinBox()
            if dec:
                sb.setDecimals(dec)
            sb.setRange(lo, hi)
            sb.setSingleStep(step)
            sb.setValue(MATCH[k])
            lb = label(text, "muted")
            lb.setStyleSheet("color:#cfcfcf;font-size:12px;font-weight:600")
            r0, col = 1 + (i // 3) * 3, i % 3  # two rows of three
            g.addWidget(lb, r0, col)
            g.addWidget(sb, r0 + 1, col)
            hl = label(tip, "help")
            hl.setMinimumHeight(48)  # three lines; wrapped labels get squeezed in a grid otherwise
            g.addWidget(hl, r0 + 2, col, QtCore.Qt.AlignmentFlag.AlignTop)
            self.mspins[k] = sb
        self.cb_pitch = QtWidgets.QCheckBox("\u0418\u0441\u043a\u0430\u0442\u044c \u0438 \u0432 \u0438\u0437\u043c\u0435\u043d\u0451\u043d\u043d\u043e\u043c \u0442\u043e\u043d\u0435 (\u00b11 \u0438 \u00b12 \u043f\u043e\u043b\u0443\u0442\u043e\u043d\u0430)")
        self.cb_pitch.setChecked(bool(MATCH.get("pitch")))
        self.cb_pitch.toggled.connect(lambda *_: self.match_note_update())
        g.addItem(QtWidgets.QSpacerItem(0, 8), 7, 0)
        g.addWidget(self.cb_pitch, 8, 0, 1, 3)
        g.addWidget(label("\u041d\u0430\u0445\u043e\u0434\u0438\u0442 \u0442\u0440\u0435\u043a\u0438, \u0443 \u043a\u043e\u0442\u043e\u0440\u044b\u0445 \u0432 \u0432\u0438\u0434\u0435\u043e \u0441\u0434\u0432\u0438\u043d\u0443\u0442 \u0442\u043e\u043d (\u0442\u0430\u043a \u043e\u0431\u0445\u043e\u0434\u044f\u0442 Content ID). "
                          "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u0438\u0434\u0451\u0442 \u043d\u0435\u043c\u043d\u043e\u0433\u043e \u0434\u043e\u043b\u044c\u0448\u0435.", "help"), 9, 0, 1, 3)
        row = QtWidgets.QHBoxLayout()
        self.match_note = label("", "muted")
        row.addWidget(self.match_note, 1)
        b_reset = QtWidgets.QPushButton("\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c")
        b_reset.setObjectName("ghost")
        b_reset.clicked.connect(self.match_reset)
        b_save = QtWidgets.QPushButton("\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c")
        b_save.setObjectName("ghost")
        b_save.clicked.connect(self.match_save)
        b_apply = QtWidgets.QPushButton("\u041f\u0435\u0440\u0435\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u044d\u0442\u043e \u0432\u0438\u0434\u0435\u043e")
        b_apply.setObjectName("gold")
        b_apply.clicked.connect(self.rematch)
        row.addWidget(b_reset)
        row.addWidget(b_save)
        row.addWidget(b_apply)
        g.addItem(QtWidgets.QSpacerItem(0, 8), 10, 0)
        g.addLayout(row, 11, 0, 1, 3)
        for sb in self.mspins.values():
            sb.valueChanged.connect(lambda *_: self.match_note_update())
        self.match_note_update()
        return box

    def match_values(self):
        v = {k: sb.value() for k, sb in self.mspins.items()}
        v["pitch"] = 1 if self.cb_pitch.isChecked() else 0
        return v

    def match_note_update(self):
        saved = dict(MATCH_DEFAULTS, **(self.settings.get("match") or {}))
        cur = self.match_values()
        same = all(abs(float(cur[k]) - float(saved[k])) < 1e-6 for k in cur)
        self.match_note.setText("\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b" if same else "\u041d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e: \u043d\u0430\u0436\u043c\u0438 \u00ab\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c\u00bb, \u0447\u0442\u043e\u0431\u044b \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c")

    def match_reset(self):
        for k, sb in self.mspins.items():
            sb.setValue(MATCH_DEFAULTS[k])
        self.cb_pitch.setChecked(bool(MATCH_DEFAULTS["pitch"]))
        self.match_note_update()

    def match_save(self):
        MATCH.update(self.match_values())
        self.settings["match"] = dict(MATCH)
        save_settings(self.settings)
        self.log("Matching settings saved (the automatic scanner uses them too): %s" % self.settings["match"])
        self.match_note_update()

    def rematch(self):
        vid = self.cur_vid
        c = self.checks.get(vid) if vid else None
        if not c or c.get("error") or vid == self.checking:
            return
        MATCH.update(self.match_values())  # in use now; Save keeps them after a restart
        self.match_note_update()
        self.bg(self._rematch, vid)

    def _rematch(self, vid):
        c = self.checks[vid]
        t0 = time.time()
        k = self.hcache.get(vid) or {}
        need = [0] + (PITCH_SHIFTS if MATCH.get("pitch") else [])
        hs = dict(k.get("hs") or {})
        if any(st not in hs for st in need):
            audio = c.get("audio") or ""
            if not os.path.isfile(audio):
                self.log("The audio of this video is not on disk any more. Check it again.")
                return
            self.stage("Analysing audio...", None)
            hs.update(fp.query_hashes_pitched(fp.load_mono(audio), [st for st in need if st]))
            k = self.hcache[vid] = {"hs": hs, "dur": k.get("dur") or c["dur"]}
        dbg = []
        found = match_shifts(self.base, {st: hs[st] for st in need}, k["dur"], dbg)
        rows = group_rows(self.base, found)
        c["rows"] = rows
        c["at"] = time.strftime("%Y-%m-%d %H:%M")
        c["near"] = near_list(self.base, dbg)
        try:
            save_checks(self.checks)
        except Exception:
            pass
        write_check_log(self.base, vid, "[re-check %s, pitch %s] %s" % (match_kw(), "on" if MATCH.get("pitch") else "off",
                                                                         c.get("title", vid)), False, rows, dbg,
                        time.time() - t0)
        self.stage("Re-checked: %s" % (", ".join(r["title"] for r in rows) or "nothing found"), 1)
        self.ui(lambda: (self.refresh_item(vid), self.show_if_current(vid), self.update_counts()))

    # -- video states --
    def vstatus(self, vid):
        """(key, text) of a video: none / queue / run / found / clean / err."""
        if vid == self.checking:
            return "run", "Checking %d%%" % self.check_pct
        if any(q[0] == vid for q in self.queue):
            return "queue", "Queued"
        c = self.checks.get(vid)
        if not c:
            return "none", "Not checked"
        if c.get("error"):
            return "err", "Error"
        n = len(c.get("rows") or [])
        if n:
            return "found", "%d track%s found" % (n, "" if n == 1 else "s")
        return "clean", "Clean"

    def dot_icon(self, key):
        if key not in self.dots:
            pm = QtGui.QPixmap(20, 20)
            pm.fill(QtCore.Qt.GlobalColor.transparent)
            p = QtGui.QPainter(pm)
            p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
            p.setBrush(QtGui.QColor(STATUS_COLORS[key]))
            p.setPen(QtCore.Qt.PenStyle.NoPen)
            p.drawEllipse(3, 3, 14, 14)
            p.end()
            ic = QtGui.QIcon()
            ic.addPixmap(pm, QtGui.QIcon.Mode.Normal)
            ic.addPixmap(pm, QtGui.QIcon.Mode.Selected)
            self.dots[key] = ic
        return self.dots[key]

    def refresh_item(self, vid):
        it = self.vitems.get(vid)
        if it is None:
            return
        key, text = self.vstatus(vid)
        it.setIcon(0, self.dot_icon(key))
        it.setText(2, text)
        it.setForeground(2, QtGui.QBrush(QtGui.QColor(STATUS_COLORS[key] if key != "none" else "#777")))
        f = it.font(2)
        f.setBold(key in ("found", "run"))
        it.setFont(2, f)

    def update_counts(self):
        if not self.vmeta:
            return
        ids = list(self.vmeta)
        st = [self.vstatus(v)[0] for v in ids]
        self.vcount.setText("%d videos   |   %d checked   |   %d with our music"
                            % (len(ids), sum(s in ("found", "clean") for s in st), st.count("found")))

    def apply_filter(self, *_):
        q = self.vfilter.text().strip().lower()
        mode = self.only.currentIndex()
        want = {0: None, 1: ("none", "err"), 2: ("found",), 3: ("clean",)}[mode]
        for vid, it in self.vitems.items():
            ok = (not q or q in self.vmeta[vid]["title"].lower()) and (want is None or self.vstatus(vid)[0] in want)
            it.setHidden(not ok)

    def update_check_btn(self):
        n = len([i for i in self.vlist.selectedItems() if not i.isHidden()])
        self.btn_check.setText("Check selected (%d)" % n if n > 1 else "Check selected")
        self.btn_check.setEnabled(n > 0)

    # -- loading a channel --
    def load_videos(self):
        url = self.url.text().strip()
        if url:
            self.bg(self._load, url)

    def _load(self, url):
        self.stage("Loading video list...")
        single = ("watch?v=" in url) or ("youtu.be/" in url) or ("/shorts/" in url)
        targets = [url] if single else [url.rstrip("/") + "/videos", url.rstrip("/") + "/shorts"]
        vids = []
        for t in targets:
            try:
                info = ydl_run({"quiet": True, "extract_flat": True, "playlistend": 1000, "skip_download": True},
                               lambda y: y.extract_info(t, download=False, process=not single))
            except Exception as e:
                self.log("Could not read %s: %s" % (t, str(e).splitlines()[0] if str(e) else e))
                continue
            for e in info.get("entries") or [info]:
                if e and e.get("id"):
                    vids.append({"id": e["id"], "title": e.get("title") or e["id"], "dur": e.get("duration") or 0,
                                 "short": t.endswith("/shorts")})
        self.ui(lambda: self.fill_videos(vids))
        self.stage("%d videos loaded" % len(vids), 1)

    def fill_videos(self, vids):
        self.vlist.clear()
        self.vitems, self.vmeta = {}, {}
        for v in vids:
            if v["id"] in self.vmeta:
                continue
            self.vmeta[v["id"]] = v
            it = QtWidgets.QTreeWidgetItem([("[Short]  " if v["short"] else "") + v["title"],
                                            fmt(v["dur"]) if v["dur"] else ""])
            it.setData(0, 256, v["id"])
            it.setToolTip(0, v["title"])
            it.setTextAlignment(1, QtCore.Qt.AlignmentFlag.AlignRight | QtCore.Qt.AlignmentFlag.AlignVCenter)
            self.vlist.addTopLevelItem(it)
            self.vitems[v["id"]] = it
            self.refresh_item(v["id"])
        self.apply_filter()
        self.update_counts()
        if vids:
            self.vlist.setCurrentItem(self.vlist.topLevelItem(0))

    # -- checking (one after another, in the background) --
    def check_selected(self):
        if self.base.ht is None:
            QtWidgets.QMessageBox.information(
                self, "Track base not ready",
                "The track base is empty, so there is nothing to search for yet.\n\n"
                "Enter the admin token in Settings: the program then downloads the site's tracks (one time).")
            return
        items = [i for i in self.vlist.selectedItems() if not i.isHidden()]
        novoice = self.cb_voice.isChecked()
        added = 0
        for it in sorted(items, key=self.vlist.indexOfTopLevelItem):
            vid = it.data(0, 256)
            if vid == self.checking or any(q[0] == vid for q in self.queue):
                continue
            with self.qlock:
                self.queue.append((vid, novoice))
            self.refresh_item(vid)
            added += 1
        with self.qlock:
            start = added and not self.loop_on
            if start:
                self.loop_on = True
        if start:
            self.cancel = False
            self.btn_stop.setVisible(True)
            self.bg(self._check_loop)
        self.update_counts()
        if self.cur_vid:
            self.show_video(self.cur_vid)

    def _check_loop(self):
        try:
            while True:
                with self.qlock:
                    if not self.queue:
                        self.loop_on = False
                        break
                    vid, novoice = self.queue.pop(0)
                self.checking, self.check_pct = vid, 0
                self.ui(lambda v=vid: (self.refresh_item(v), self.show_if_current(v)))
                v = self.vmeta.get(vid) or {"id": vid, "title": vid, "dur": 0}
                t0 = time.time()

                def prog(text, frac, title=v["title"], v_id=vid):
                    if self.cancel:
                        raise Cancelled()
                    self.stage("%s  -  %s" % (title[:50], text), frac)
                    if frac is not None:
                        pct = int(100 * frac)
                        if pct != self.check_pct:
                            self.check_pct = pct
                            self.ui(lambda: self.refresh_item(v_id))
                try:
                    audio = download_audio(vid, prog)
                    dbg = []
                    keep = {}
                    samples, rows = find_in_audio(self.base, audio, novoice, prog, dbg, keep)
                    self.hcache[vid] = keep
                    write_check_log(self.base, vid, v["title"], novoice, rows, dbg, time.time() - t0)
                    env = envelope(samples, 6000)
                    self.checks[vid] = {"title": v["title"], "dur": len(samples) / fp.SR, "rows": rows,
                                        "env": [round(float(x), 4) for x in env], "audio": audio,
                                        "novoice": novoice, "at": time.strftime("%Y-%m-%d %H:%M"),
                                        "near": near_list(self.base, dbg)}
                    self.log("%s: %s  [%.0f s]" % (v["title"], ", ".join(r["title"] for r in rows) or "clean",
                                                   time.time() - t0))
                except Cancelled:
                    self.log("%s: stopped" % v["title"])
                except Exception as e:
                    if self.cancel:
                        self.log("%s: stopped" % v["title"])
                        self.checking = None
                        self.ui(lambda v=vid: (self.refresh_item(v), self.show_if_current(v)))
                        continue
                    msg = str(e).splitlines()[0] if str(e) else repr(e)
                    msg = msg.replace("ERROR: ", "").split("; please report")[0][:220]
                    self.checks[vid] = {"title": v["title"], "error": msg, "at": time.strftime("%Y-%m-%d %H:%M")}
                    self.log("%s: FAILED %s" % (v["title"], msg))
                try:
                    save_checks(self.checks)
                except Exception as e:
                    self.log("Could not save results: %s" % e)
                self.checking = None
                self.ui(lambda v=vid: (self.refresh_item(v), self.show_if_current(v), self.update_counts(),
                                       self.apply_filter()))
            self.stage("Stopped" if self.cancel else "All selected videos checked", 1)
        finally:
            self.checking = None
            self.loop_on = False
            self.cancel = False
            self.ui(lambda: self.btn_stop.setVisible(False))

    def stop_checking(self):
        with self.qlock:
            dropped = [q[0] for q in self.queue]
            self.queue.clear()
            self.cancel = True
        self.btn_stop.setVisible(False)
        self.stage("Stopping...", None)
        for v in dropped:
            self.refresh_item(v)
        self.update_counts()
        if self.cur_vid:
            self.show_video(self.cur_vid)

    def show_if_current(self, vid):
        if vid == self.cur_vid:
            self.show_video(vid)

    # -- right side --
    def show_video(self, vid):
        # The video shown on the right gets a bold gold title in the list.
        for v_id in {self.cur_vid, vid}:
            it = self.vitems.get(v_id)
            if it is not None:
                f = it.font(0)
                f.setBold(v_id == vid)
                it.setFont(0, f)
                it.setForeground(0, QtGui.QBrush(QtGui.QColor(GOLD if v_id == vid else "#f2f2f2")))
        self.cur_vid = vid
        self.stop_play()
        v = self.vmeta.get(vid) or {}
        c = self.checks.get(vid) if vid else None
        if not vid:
            self.d_title.setText("No video selected")
            self.d_sub.setText("")
            self.d_empty.setText("Load a channel on the left and click a video.")
            self.d_stack.setCurrentIndex(0)
            self.btn_open.setEnabled(False)
            self.btn_send.setEnabled(False)
            return
        self.d_title.setText(v.get("title") or (c or {}).get("title") or vid)
        key, text = self.vstatus(vid)
        bits = [fmt(v["dur"])] if v.get("dur") else []
        bits.append('<span style="color:%s;font-weight:700">%s</span>' % (STATUS_COLORS[key] if key != "none"
                                                                          else "#8f8f8f", text))
        if c and c.get("rows") and not c.get("error"):
            st = [self.base.site_state(r["track"])[0] for r in c["rows"]]
            cnt = [(st.count("site"), "\u043d\u0430 \u0441\u0430\u0439\u0442\u0435", GREEN), (st.count("local") + st.count("gone"), "\u043d\u0435 \u0437\u0430\u043b\u0438\u0442", RED),
                   (st.count("dup"), "\u0434\u0443\u0431\u043b\u044c", GOLD)]
            bits.append(" &middot; ".join("<span style='color:%s'>%d %s</span>" % (col, n, word)
                                          for n, word, col in cnt if n))
        if c and c.get("at"):
            bits.append("checked " + c["at"] + (" (voice removed)" if c.get("novoice") else ""))
        self.d_sub.setText("   |   ".join(bits))
        self.btn_open.setEnabled(True)
        has_rows = bool(c and c.get("rows"))
        self.btn_send.setEnabled(has_rows and bool(self.settings["token"]) and key not in ("run", "queue"))
        if key in ("run", "queue"):
            self.d_empty.setText("Checking now, see the progress at the bottom." if key == "run"
                                 else "Waiting in the queue.")
            self.d_stack.setCurrentIndex(0)
            return
        if not c:
            self.d_empty.setText("Not checked yet.\n\nPress \"Check selected\" or double-click the video.")
            self.d_stack.setCurrentIndex(0)
            return
        if c.get("error"):
            self.d_empty.setText("The check failed:\n%s\n\nSelect it and press \"Check selected\" to try again."
                                 % c["error"])
            self.d_stack.setCurrentIndex(0)
            return
        self.d_stack.setCurrentIndex(1)
        rows = c["rows"]
        cands = cand_rows(self.base, c)
        self.view_rows = rows + cands
        self.res.blockSignals(True)
        self.res.clear()
        for r in self.view_rows:
            rej = bool(r.get("rejected"))
            title = r["title"] + ("  (\u0442\u043e\u043d %+d)" % r["pitch"] if r.get("pitch") else "")
            it = QtWidgets.QTreeWidgetItem([title, r["composer"],
                                            ", ".join("%s-%s" % (fmt(a), fmt(b)) for a, b in r["regions"]),
                                            fmt(r["total"]), reliability(c, r)[0]])
            it.setForeground(4, QtGui.QBrush(QtGui.QColor(reliability(c, r)[1])))
            st, url = self.base.site_state(r["track"])
            it.setText(5, site_look(st)[0])
            it.setData(5, 256, url)
            if url:
                it.setToolTip(5, "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0442\u0440\u0435\u043a \u043d\u0430 \u0441\u0430\u0439\u0442\u0435: " + url)
            f5 = it.font(5)
            f5.setBold(True)
            it.setFont(5, f5)
            it.setForeground(0, QtGui.QBrush(QtGui.QColor(ORANGE if rej else RED)))
            it.setForeground(5, QtGui.QBrush(QtGui.QColor(site_look(self.base.site_state(r["track"])[0])[1])))
            if rej:
                for col in range(1, 5):
                    it.setForeground(col, QtGui.QBrush(QtGui.QColor("#9a9a9a")))
                it.setToolTip(0, "\u041d\u0435 \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u043d: " + ru_verdict(r["rejected"]))
            self.res.addTopLevelItem(it)
        view = self.view_rows
        self.res.setVisible(bool(view))
        self.res.setFixedHeight(min(220, 34 + 32 * max(1, len(view))))
        self.clean_lbl.setVisible(not rows)
        self.clean_lbl.setText("\u041d\u0430\u0448\u0438\u0445 \u0442\u0440\u0435\u043a\u043e\u0432 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e." + (
            " \u0412 \u0442\u0430\u0431\u043b\u0438\u0446\u0435 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u043f\u043e\u0445\u043e\u0436\u0438\u0435 \u043a\u0443\u0441\u043a\u0438 (\u043e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435), \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430 \u043e\u0442\u0431\u0440\u043e\u0441\u0438\u043b\u0430: \u043f\u043e\u0441\u043b\u0443\u0448\u0430\u0439 \u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u044c."
            if cands else ""))
        self.hint_lbl.setText(HINT_FOUND if view else HINT_CLEAN)
        self.track_lbl.setVisible(bool(view))
        self.w_track.setVisible(bool(view))
        if view:
            self.res.setCurrentItem(self.res.topLevelItem(0))
        self.res.blockSignals(False)
        self.draw()

    def open_site_cell(self, it, col):
        url = it.data(5, 256) if it is not None else ""
        if col == 5 and url:
            QtGui.QDesktopServices.openUrl(QtCore.QUrl(url))

    def open_youtube(self):
        if self.cur_vid:
            QtGui.QDesktopServices.openUrl(QtCore.QUrl("https://www.youtube.com/watch?v=" + self.cur_vid))

    def cur_check(self):
        c = self.checks.get(self.cur_vid) if self.cur_vid else None
        return c if c and not c.get("error") and "env" in c else None

    def send_manual(self):
        c = self.cur_check()
        if not c or not c["rows"]:
            return
        ok = QtWidgets.QMessageBox.question(
            self, "Manual check",
            "Send %d track(s) found in \"%s\" to Admin -> Whitelisting?\n\nThe video must be on a customer's "
            "whitelisted channel. Its claims will be released whatever the video date." % (len(c["rows"]), c["title"]))
        if ok != QtWidgets.QMessageBox.StandardButton.Yes:
            return
        self.btn_send.setEnabled(False)
        self.bg(self._send_manual, self.cur_vid, c)

    def _send_manual(self, vid, c):
        res = api(self.settings, "POST", "", {"action": "manual", "videoId": vid})
        if res.get("error"):
            self.log("Not sent: %s" % res["error"])
            return
        api(self.settings, "POST", "", {"action": "result", "videoId": vid, "matches": [
            match_payload(self.base, x) for x in c["rows"]]})
        if os.path.isfile(c.get("audio") or ""):
            save_print(vid, fp.load_mono(c["audio"]), "")
        self.log("Sent to the site: %s (%s). It is in Admin -> Whitelisting now." % (c["title"], res.get("channelTitle", "")))
        self.stage("Sent to the site", 1)

    def sel_row(self):
        c = self.cur_check()
        it = self.res.currentItem()
        if not c or not it:
            return None
        i = self.res.indexOfTopLevelItem(it)
        view = getattr(self, "view_rows", None) or c["rows"]
        return view[i] if 0 <= i < len(view) else None

    def draw(self):
        c = self.cur_check()
        if not c:
            return
        row = self.sel_row()
        self.why_lbl.setText(why_text(c, row))
        dur = max(c["dur"], 0.1)
        self.w_video.set(np.array(c["env"], np.float32), [(a / dur, b / dur) for a, b in row["regions"]] if row else [],
                         dur, key=self.cur_vid, color=ORANGE if row and row.get("rejected") else GOLD)
        self.video_lbl.setText("\u0410\u0423\u0414\u0418\u041e \u0412\u0418\u0414\u0415\u041e")
        if not row:
            self.w_track.set(None, [], key=None)
            return
        name = row["track"]
        path = (self.base.meta.get(name) or {}).get("path")
        if name not in self.track_env and path and os.path.isfile(path):
            t = fp.load_mono(path)
            self.track_env[name] = (envelope(t, 6000), len(t) / fp.SR)
        if name not in self.track_env:
            self.w_track.set(None, [], key=None)
            return
        env, tdur = self.track_env[name]
        used = [(p["track_pos"] / tdur, (p["track_pos"] + p["end"] - p["start"]) / tdur) for p in row.get("parts", [])]
        self.w_track.set(env, used, tdur, key=name, color=ORANGE if row.get("rejected") else GOLD)
        self.track_lbl.setText("\u0422\u0420\u0415\u041a  -  %s" % row["title"].upper())

    # ---- listening -------------------------------------------------------------
    def click_play(self, which, frac):
        c = self.cur_check()
        if not c:
            return
        if which == "video":
            path, dur, wave = c.get("audio"), c["dur"], self.w_video
            if not path or not os.path.isfile(path):
                self.log("The audio of this video is not on disk any more. Check it again to listen.")
                return
        else:
            row = self.sel_row()
            if not row or row["track"] not in self.track_env:
                return
            path, dur, wave = self.base.meta[row["track"]]["path"], self.track_env[row["track"]][1], self.w_track
        threading.Thread(target=self._play, args=(wave, path, frac * dur, dur), daemon=True).start()

    def _play(self, wave, path, pos, dur):
        import sounddevice as sd
        sd.stop()
        raw = subprocess.run([fp.FFMPEG, "-v", "error", "-ss", "%.2f" % pos, "-i", path, "-t", "60",
                              "-f", "f32le", "-ac", "2", "-ar", "44100", "-"],
                             capture_output=True, creationflags=NO_WINDOW).stdout
        data = np.frombuffer(raw, np.float32).reshape(-1, 2)
        if not len(data):
            return
        sd.play(data, 44100)
        self.play = (wave, pos, time.time(), len(data) / 44100.0, dur)
        self.ui(lambda: self.play_timer.start(50))

    def _play_tick(self):
        for wv in (self.w_video, self.w_track):
            if wv.head is not None:
                wv.head = None
                wv.update()
        if not self.play:
            self.play_timer.stop()
            return
        wave, pos, t0, length, dur = self.play
        el = time.time() - t0
        if el > length:
            self.play = None
            return
        wave.head = (pos + el) / max(dur, 0.1)
        span = wave.v1 - wave.v0
        if span < 1.0 and wave.press is None and not (wave.v0 <= wave.head <= wave.v1):
            wave.set_view(wave.head - span * 0.1, span)  # zoomed in: the view follows the sound
        wave.update()

    def stop_play(self):
        if self.play is None:
            return
        try:
            import sounddevice as sd
            sd.stop()
        except Exception:
            pass
        self.play = None

    # ---- Settings page -----------------------------------------------------------
    def page_settings(self):
        w = QtWidgets.QWidget()
        l = QtWidgets.QVBoxLayout(w)
        l.setContentsMargins(0, 0, 0, 0)
        l.addWidget(label("Settings", "h1"))
        l.addSpacing(8)
        c = card()
        g = QtWidgets.QGridLayout(c)
        g.setContentsMargins(18, 16, 18, 16)
        g.setVerticalSpacing(10)
        self.e_site = QtWidgets.QLineEdit(self.settings["site"])
        self.e_token = QtWidgets.QLineEdit(self.settings["token"])
        self.e_token.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)
        self.e_token.setPlaceholderText("ADMIN_API_TOKEN from Cloudflare")
        self.s_interval = QtWidgets.QSpinBox()
        self.s_interval.setRange(1, 120)
        self.s_interval.setValue(int(self.settings["interval_min"]))
        self.s_interval.setSuffix(" min")
        self.cb_novoice_auto = QtWidgets.QCheckBox("Remove voice in automatic scanning (much slower on long videos)")
        self.cb_novoice_auto.setChecked(bool(self.settings["novoice"]))
        g.addWidget(label("Site", "lbl"), 0, 0)
        g.addWidget(self.e_site, 0, 1)
        g.addWidget(label("Admin token", "lbl"), 1, 0)
        g.addWidget(self.e_token, 1, 1)
        g.addWidget(label("Check every", "lbl"), 2, 0)
        g.addWidget(self.s_interval, 2, 1, QtCore.Qt.AlignmentFlag.AlignLeft)
        g.addWidget(self.cb_novoice_auto, 3, 1)
        save = QtWidgets.QPushButton("Save")
        save.setObjectName("gold")
        save.clicked.connect(self.save_settings)
        g.addWidget(save, 4, 1, QtCore.Qt.AlignmentFlag.AlignLeft)
        l.addWidget(c)
        l.addSpacing(10)
        c2 = card()
        h = QtWidgets.QHBoxLayout(c2)
        h.setContentsMargins(18, 14, 18, 14)
        h.addWidget(label("YouTube sign-in is needed only for age-restricted videos. A separate Edge window "
                          "opens: sign in, then close it.", "muted"), 1)
        b = QtWidgets.QPushButton("Sign in to YouTube")
        b.clicked.connect(lambda: (open_login_window(), self.log("Sign in in the Edge window, then close it.")))
        h.addWidget(b)
        l.addWidget(c2)
        l.addSpacing(10)
        c3 = card()
        h3 = QtWidgets.QHBoxLayout(c3)
        h3.setContentsMargins(18, 14, 18, 14)
        self.base_lbl = label("", "muted")
        h3.addWidget(self.base_lbl, 1)
        b3 = QtWidgets.QPushButton("Open unreleased folder")
        b3.setToolTip("Tracks not on the site yet: put them in unreleased/<Composer>/<Track title>.wav")
        b3.clicked.connect(lambda: (os.makedirs(UNRELEASED, exist_ok=True),
                                    QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(UNRELEASED))))
        h3.addWidget(b3)
        b2 = QtWidgets.QPushButton("Update track base now")
        b2.clicked.connect(lambda: self.bg(self._update_base))
        h3.addWidget(b2)
        l.addWidget(c3)
        l.addSpacing(10)
        c4 = card()
        h4 = QtWidgets.QHBoxLayout(c4)
        h4.setContentsMargins(18, 14, 18, 14)
        col4 = QtWidgets.QVBoxLayout()
        col4.addWidget(label("STORAGE FOLDER", "lbl"))
        self.store_lbl = label("", "muted")
        col4.addWidget(self.store_lbl)
        h4.addLayout(col4, 1)
        b5 = QtWidgets.QPushButton("Open")
        b5.clicked.connect(lambda: QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(STORE)))
        h4.addWidget(b5)
        self.btn_store = QtWidgets.QPushButton("Move to another disk...")
        self.btn_store.clicked.connect(self.change_store)
        h4.addWidget(self.btn_store)
        l.addWidget(c4)
        self.update_store_lbl()
        l.addStretch(1)
        return w

    # ---- storage folder ----------------------------------------------------------
    def update_store_lbl(self):
        import shutil
        try:
            free = shutil.disk_usage(STORE if os.path.isdir(STORE) else os.path.dirname(STORE)).free / 1e9
        except Exception:
            free = 0
        size = 0
        for _n, path in store_sources():
            if os.path.isdir(path):
                for r, _d, fs in os.walk(path):
                    size += sum(os.path.getsize(os.path.join(r, f)) for f in fs)
            else:
                size += os.path.getsize(path)
        self.store_lbl.setText("%s\nTrack base, downloaded tracks and video audio, results, unreleased folder: "
                               "%.1f GB. Free on this disk: %.0f GB." % (STORE, size / 1e9, free))

    def change_store(self):
        start = os.path.dirname(STORE) if self.settings.get("store_dir") else os.path.expanduser("~")
        root = QtWidgets.QFileDialog.getExistingDirectory(self, "Where should the scanner keep its data?", start)
        if not root:
            return
        dest = os.path.join(root, STORE_SUB)
        if os.path.normcase(os.path.abspath(dest)) == os.path.normcase(os.path.abspath(STORE)):
            return
        if os.path.normcase(os.path.abspath(dest)).startswith(os.path.normcase(os.path.abspath(STORE)) + os.sep):
            QtWidgets.QMessageBox.information(self, "Storage folder", "Pick a folder outside the current one.")
            return
        ok = QtWidgets.QMessageBox.question(
            self, "Move storage",
            "Move the scanner data to\n%s ?\n\nScanning and listening stop while it moves (they wait for the "
            "video being checked now). The old copies are deleted only after everything is copied." % dest)
        if ok != QtWidgets.QMessageBox.StandardButton.Yes:
            return
        self.btn_store.setEnabled(False)
        was_running = self.running
        # stop everything that could hold an audio file open
        self.running = False
        self.timer.stop()
        self.stop_checking() if self.loop_on else None
        self.stop_play()
        self.refresh_status()
        self.bg(self._move_store, dest, was_running)

    def _move_store(self, dest, was_running):
        try:
            t0 = time.time()
            while self.busy or self.loop_on:
                self.stage("Waiting for the current video to finish before moving...", None)
                time.sleep(1)
                if time.time() - t0 > 1800:
                    raise RuntimeError("the scanner is still busy, try again later")
            try:
                import sounddevice as sd
                sd.stop()
            except Exception:
                pass
            old_root, old_unrel = STORE, UNRELEASED
            move_store(dest, self.stage, self.log)
            set_store(dest)
            fix_paths_after_move(old_root, old_unrel, dest)
            self.settings["store_dir"] = dest
            save_settings(self.settings)
            self.base.load()
            self.checks = load_checks()
            self.stage("Storage moved to %s" % dest, 1)
        except Exception as e:
            self.log("ERROR: moving the storage failed: %s. Nothing was deleted; the scanner keeps using %s."
                     % (e, STORE))
            self.stage("Moving failed", 0)
        finally:
            def done():
                self.btn_store.setEnabled(True)
                self.update_store_lbl()
                self.refresh_status()
                if was_running:
                    self.toggle()
            self.ui(done)

    def _update_base(self):
        n = self.base.update(self.settings, self.log, self.stage)
        self.stage("Track base: %d tracks (%d new)" % (len(self.base.meta), n), 1)
        self.ui(self.refresh_status)

    def save_settings(self):
        self.settings.update(site=self.e_site.text().strip() or DEFAULTS["site"], token=self.e_token.text().strip(),
                             interval_min=self.s_interval.value(), novoice=self.cb_novoice_auto.isChecked())
        save_settings(self.settings)
        self.log("Settings saved.")
        self.refresh_status()
        if self.running:
            self.timer.start(int(self.settings["interval_min"]) * 60000)
        if not self.base.meta and self.settings["token"]:
            self.bg(self.prepare)


def main():
    app = QtWidgets.QApplication(sys.argv)
    app.setStyle(CleanStyle("Fusion"))
    app.setPalette(dark_palette())
    app.setStyleSheet(QSS)
    w = App()
    w.show()
    w.refresh_status()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
