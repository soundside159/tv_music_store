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
import re
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


def verdict_text(v):
    """Short English reason why a candidate was rejected."""
    if v == "found":
        return "found"
    if "matching part only" in v:
        return "plays too short"
    if "score" in v and "noise" not in v:
        return "weak confidence"
    if "window" in v:
        return "too few chunks in a row"
    if "overlaps" in v:
        return "covered by a stronger track"
    if "noise" in v:
        return "almost like random noise"
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
        return "rejected", "#9a9a9a"
    near = c.get("near") or []
    noise = noise_of(near, row["track"])
    parts = row.get("parts") or []
    length = max([p["end"] - p["start"] for p in parts] or [0])
    ratio = row["score"] / max(noise, 15)
    if ratio >= 5 and length >= 10:
        return "reliable", GREEN
    if ratio >= 2.5:
        return "listen", GOLD
    return "doubtful", RED


def why_text(c, row):
    """Plain explanation under the waveforms: why this track was found (or why
    nothing was), with the numbers to compare videos."""
    near = c.get("near") or []
    if row is None:
        if not near:
            return ("<b>Nothing found.</b> No part of the video looks like any track in the base. "
                    "Press \"Recheck this video\" to see the details.")
        lines = ["<b>Why nothing was found.</b> Closest candidates (all rejected):"]
        for n in near[:4]:
            lines.append("&nbsp;&nbsp;- %s: in the video %s-%s, confidence %d, matched %.1f%% of the fingerprint, "
                         "chunks %d &rarr; <span style='color:#ff9f43'>%s</span>"
                         % (n["title"], fmt(n["start"]), fmt(n["end"]), n["score"], n.get("pct", 0), n["windows"],
                            verdict_text(n["verdict"])))
        return "<br>".join(lines)
    parts = row.get("parts") or []
    best = max(parts, key=lambda p: p["end"] - p["start"]) if parts else None
    noise = noise_of(near, row["track"])
    if best is None:
        return "<b>%s</b>" % row["title"]
    length = best["end"] - best["start"]
    if row.get("rejected"):
        return "<br>".join([
            "<b>Why \"%s\" was NOT counted</b> &nbsp;<span style='color:%s'><b>%s</b></span>"
            % (row["title"], ORANGE, verdict_text(row["rejected"])),
            "Similar part: in the video %s-%s = in the track %s-%s (%s)."
            % (fmt(best["start"]), fmt(best["end"]), fmt(best["track_pos"]), fmt(best["track_pos"] + length),
               fmt(length)),
            "Confidence <b>%d</b> (threshold %d), matched <b>%.1f%%</b> of the fingerprint, chunks in a row <b>%d</b> "
            "(need %d), length %s (need %s)." % (row["score"], int(MATCH["min_score"]), best.get("pct", 0),
                                                 best.get("windows", 0), int(MATCH["min_windows"]), fmt(length),
                                                 fmt(float(MATCH["min_len"]))),
            "Listen to both parts: if it really is our track, relax the matching settings and press \"Recheck\".",
        ])
    ratio = row["score"] / max(noise, 15)
    if reliability(c, row)[0] == "reliable":
        verdict = "<span style='color:%s'><b>Reliable match.</b></span>" % GREEN
    elif reliability(c, row)[0] == "listen":
        verdict = "<span style='color:%s'><b>Looks right, but better listen.</b></span>" % GOLD
    else:
        verdict = ("<span style='color:%s'><b>Doubtful:</b> almost no different from random noise, "
                   "most likely false.</span>" % RED)
    lines = [
        "<b>Why \"%s\" was found</b> &nbsp;%s" % (row["title"], verdict),
        "Matches <b>%s in a row</b>: in the video %s-%s = in the track %s-%s."
        % (fmt(length), fmt(best["start"]), fmt(best["end"]), fmt(best["track_pos"]),
           fmt(best["track_pos"] + length)),
        "Confidence <b>%d</b> (threshold %d). Strongest random noise in this video: %d, "
        "so the match is <b>%.1f times</b> stronger than noise." % (row["score"], int(MATCH["min_score"]), noise, ratio),
        "Matched <b>%.1f%%</b> of the audio fingerprint in the best chunk (clean music is usually 4-7%%, "
        "under a voice 1-2%%, random noise under 1%%)." % best.get("pct", 0),
        "Chunks of 8 s in a row that matched one place of the track: <b>%d</b> (need %d)."
        % (best.get("windows", 0), int(MATCH["min_windows"])),
    ]
    if row.get("pitch"):
        lines.append("<span style='color:%s'>The track in the video is pitched %s by %d semitone%s</span> "
                     "(a common trick to get around Content ID): the program found it by shifting the video "
                     "audio back." % (GOLD, "down" if row["pitch"] < 0 else "up", abs(row["pitch"]),
                                      "" if abs(row["pitch"]) == 1 else "s"))
    if len(parts) > 1:
        lines.append("The track plays in the video %d time(s), %s in total." % (len(row["regions"]), fmt(row["total"])))
    return "<br>".join(lines)


def match_payload(base, r):
    """One found track as the site expects it (onSite = published on the site)."""
    st = base.site_state(r["track"])[0]
    return {"trackId": r["track"], "track": r["title"], "composer": r.get("composer", ""),
            "onSite": st in ("site", "dup"),
            "inBase": {"site": "site", "local": "local", "dup": "both"}.get(st, "site"),
            "regions": r["regions"], "total": r["total"], "score": r["score"]}


def site_look(state):
    """(text, colour) of the Site column."""
    return {"site": ("on site \u2197", GREEN), "dup": ("duplicate", GOLD), "local": ("not uploaded", RED),
            "gone": ("deleted from site", RED)}[state]


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


HINT_FOUND = ("Gold = where the track plays. Click = listen from here, wheel = zoom, "
              "drag = move, double-click = whole audio.")
HINT_CLEAN = "Click = listen from here, wheel = zoom, drag = move, double-click = whole audio."
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
# ---- FruityNest palette (same constants as fn_script_manager) ----
BG_HEADER = "#252E33"
BG_CONTENT = "#485259"
BG_RAIL = "#2d373e"
BG_INPUT = "#323b42"
BORDER = "#4A5057"
BORDER_DARK = "#12181D"
TEXT_WHITE = "#ffffff"
TEXT_ROW = "#d8dde1"
TEXT_GRAY = "#8a9299"
TEXT_WARM = "#B8A082"
TEXT_TILE = "#f1e7d6"
ACCENT = "#E67E22"
ACCENT_LIME = "#CBFF6D"
SNAP_ACCENT = "#6CB6FF"
GOLD = ACCENT
PALETTE = ["#E67E22", "#6CB6FF", "#CBFF6D", "#cdb6ec", "#7ED957", "#f2c14e", "#ff8fb1", "#6ee7d8"]
RED = "#ff6b6b"
ORANGE = "#ff9f43"
GREEN = "#7ED957"
STATUS_COLORS = {"none": "#4A5057", "queue": "#8a9299", "run": ACCENT, "found": RED, "clean": GREEN,
                 "err": ORANGE}
SESSION_LOG = os.path.join(DATA, "session_log.txt")  # this run only, cleared on start

QSS = """
* { font-family: 'Segoe UI', 'Inter', sans-serif; color: #d8dde1; font-size: 12px; }
QMainWindow { background: #485259; }
QWidget#root { background: #12181D; }
QPushButton#win { background: transparent; border: none; border-radius: 3px; color: #8a9299; font-size: 13px; padding: 0; }
QPushButton#win:hover { background: #323b42; color: #ffffff; }
QPushButton#winx { background: transparent; border: none; border-radius: 3px; color: #8a9299; font-size: 12px; padding: 0; }
QPushButton#winx:hover { background: #ff3c3c; color: #ffffff; }
QDialog, QMessageBox { background: #252E33; }
QToolTip { background: #252E33; color: #d8dde1; border: 1px solid #4A5057; border-radius: 4px; padding: 5px 8px;
           font-size: 11px; }
*:focus { outline: none; }
QScrollArea, QScrollArea > QWidget > QWidget { background: transparent; border: none; }
QMessageBox QLabel { color: #d8dde1; font-size: 12px; }
QMessageBox QPushButton { min-width: 84px; }

QWidget#hdr { background: #252E33; border-bottom: 1px solid #12181D; }
QLabel#hdrtitle { color: #ffffff; font-weight: 700; font-size: 12px; }
QLabel#hdrsub { color: #B8A082; font-size: 11px; }
QPushButton#mode { background: transparent; border: none; border-bottom: 2px solid transparent; border-radius: 0;
                   color: #8a9299; font-weight: 600; font-size: 12px; padding: 7px 2px 5px 2px; }
QPushButton#mode:hover { color: #d8dde1; }
QPushButton#mode:checked { color: #ffffff; border-bottom: 2px solid #E67E22; }

QWidget#rail { background: #2d373e; border-right: 1px solid #12181D; }
QWidget#railbottom { border-top: 1px solid #12181D; }
QLabel#grp { color: #ffffff; font-weight: 700; font-size: 12px; }
QLabel#cnt { color: #8a9299; font-size: 11px; }
QPushButton#circle { min-width: 18px; max-width: 18px; min-height: 18px; max-height: 18px; border-radius: 9px;
                     border: 1px solid #4A5057; background: #323b42; padding: 0; font-size: 12px; font-weight: 700; }
QPushButton#circle:hover { border-color: #E67E22; color: #E67E22; }
QWidget#railitem { background: transparent; border-radius: 0; }
QWidget#railitem:hover { background: #323b42; }
QWidget#railitem[sel="true"] { background: #323b42; }
QLabel#rowtext { color: #d8dde1; font-size: 11px; }
QLabel#rowtextsel { color: #ffffff; font-size: 11px; }

QLabel#h1 { font-size: 13px; font-weight: 700; color: #ffffff; }
QLabel#h2 { font-size: 13px; font-weight: 700; color: #ffffff; }
QLabel#title { font-size: 12px; font-weight: 700; color: #ffffff; }
QLabel#sub { color: #8a9299; font-size: 11px; }
QLabel#muted { color: #8a9299; font-size: 11px; }
QLabel#warm { color: #B8A082; font-size: 11px; }
QLabel#help { color: #8a9299; font-size: 11px; }
QLabel#lbl { color: #8a9299; font-size: 10px; font-weight: 600; letter-spacing: 1px; }
QLabel#empty { color: #8a9299; font-size: 12px; }
QLabel#why { font-size: 11px; color: #d8dde1; padding: 4px 2px; }
QLabel#kpi { font-size: 20px; font-weight: 700; color: #ffffff; }
QLabel#tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 3px; }
QPushButton#tab { background: transparent; border: none; border-bottom: 2px solid transparent; border-radius: 0;
                  color: #8a9299; font-weight: 600; font-size: 11px; padding: 5px 2px 4px 2px; }
QPushButton#tab:checked { color: #ffffff; border-bottom: 2px solid #E67E22; }

QFrame#card, QFrame#pane, QFrame#sidecard { background: #2d373e; border: 1px solid #12181D; border-radius: 6px; }
QFrame#stat { background: #323b42; border: 1px solid #4A5057; border-radius: 4px; }
QFrame#chan { background: #252E33; border-radius: 5px; }
QFrame#vwrap { background: #2d373e; border-bottom: 1px solid #12181D; }
QSplitter::handle { background: transparent; }

QLineEdit { background: #323b42; border: 1px solid #4A5057; border-radius: 4px; padding: 5px 9px;
            font-size: 11px; selection-background-color: #E67E22; selection-color: #14191d; }
QLineEdit:focus { border-color: #E67E22; }
QPushButton { background: #323b42; border: 1px solid #4A5057; border-radius: 4px; padding: 5px 12px;
              font-weight: 600; font-size: 11px; min-height: 16px; }
QPushButton:hover { border-color: #E67E22; color: #E67E22; }
QPushButton:disabled { color: #5c6478; border-color: #3a4650; }
QPushButton#gold { background: #E67E22; color: #14191d; border: 1px solid #E67E22; font-weight: 700; }
QPushButton#gold:hover { background: #f29a4a; color: #14191d; }
QPushButton#gold:disabled { background: #6b4a24; border-color: #6b4a24; color: #2a2412; }
QPushButton#scan { background: #323b42; border: 1px solid #E67E22; color: #E67E22; font-weight: 700; padding: 3px 10px; }
QPushButton#scan:hover { background: #E67E22; color: #14191d; }
QPushButton#stop { background: #323b42; border: 1px solid #8a9299; color: #d8dde1; font-weight: 700; padding: 3px 10px; }
QPushButton#green { background: #323b42; border: 1px solid #7ED957; color: #7ED957; font-weight: 700; }
QPushButton#green:hover { background: #7ED957; color: #14191d; }
QPushButton#ghost { background: transparent; border: 1px solid #4A5057; color: #aab3c2; }
QPushButton#ghost:hover { border-color: #E67E22; color: #E67E22; }
QPushButton#ghost:checked { border-color: #E67E22; color: #E67E22; }
QPushButton#small { padding: 2px 8px; font-size: 10px; min-height: 12px; }
QPushButton#chev { background: transparent; border: none; padding: 0; min-width: 14px; max-width: 14px; }

QCheckBox { font-size: 11px; spacing: 7px; color: #d8dde1; }
QCheckBox::indicator { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #4A5057; background: #323b42; }
QCheckBox::indicator:checked { background: #E67E22; border-color: #E67E22; }
QProgressBar { background: #12181D; border: none; border-radius: 2px; }
QProgressBar::chunk { background: #E67E22; border-radius: 2px; }

QTreeWidget, QListWidget { background: transparent; border: none; font-size: 11px;
                           alternate-background-color: #46505a; }
QTreeWidget#vtable { background: #485259; }
QTreeWidget::item, QListWidget::item { padding: 5px 4px; border: none; border-bottom: 1px solid #3f4a52; }
QTreeWidget::item:hover { background: #4f5a62; }
QTreeWidget::item:selected, QListWidget::item:selected { background: #323b42; }
QTreeWidget:focus { outline: none; }
QHeaderView::section { background: transparent; color: #8a9299; border: none; border-bottom: 1px solid #3a4650;
                       padding: 5px 6px; font-size: 10px; font-weight: 600; }
QTreeWidget#pane, QFrame#pane QTreeWidget { background: #2d373e; }
QPlainTextEdit { background: #252E33; border: 1px solid #12181D; border-radius: 4px; font-family: Consolas;
                 font-size: 11px; color: #aab3c2; }
QSpinBox, QDoubleSpinBox { background: #323b42; border: 1px solid #4A5057; border-radius: 4px; padding: 3px 6px; }
QSpinBox:focus, QDoubleSpinBox:focus { border-color: #E67E22; }
QComboBox { background: #323b42; border: 1px solid #4A5057; border-radius: 4px; padding: 4px 9px; font-size: 11px; }
QComboBox:hover { border-color: #E67E22; }
QComboBox::drop-down { border: none; width: 18px; }
QComboBox QAbstractItemView { background: #252E33; border: 1px solid #4A5057; selection-background-color: #323b42;
                              selection-color: #E67E22; outline: none; }

QTabWidget::pane { border: 1px solid #12181D; border-radius: 4px; background: #2d373e; top: -1px; }
QTabBar::tab { background: transparent; color: #8a9299; padding: 6px 12px; font-size: 11px; font-weight: 600;
               border: none; border-bottom: 2px solid transparent; margin-right: 4px; }
QTabBar::tab:selected { color: #ffffff; border-bottom: 2px solid #E67E22; }
QTabBar::tab:hover { color: #d8dde1; }

QScrollBar:vertical { background: transparent; width: 10px; }
QScrollBar::handle:vertical { background: #12181D; border-radius: 4px; min-height: 24px; margin: 1px; }
QScrollBar:horizontal { background: transparent; height: 10px; }
QScrollBar::handle:horizontal { background: #12181D; border-radius: 4px; min-width: 24px; margin: 1px; }
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
        self.zones = []
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

    def set(self, env, gold, dur=0.0, key=None, color=None, zones=None):
        """gold = [(a, b)] in one colour; zones = [(a, b, colour, label)] for several tracks."""
        if key is None or key != self.key:
            self.v0, self.v1 = 0.0, 1.0  # another audio: show all of it
        self.env, self.gold, self.dur, self.key = env, gold, dur, key
        self.zones = zones or []
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
        path.addRoundedRect(QtCore.QRectF(self.rect()), 6, 6)
        p.setClipPath(path)
        p.fillRect(self.rect(), QtGui.QColor("#0b0d11"))
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
        for a, b, col, _lab in getattr(self, "zones", []):
            if b < self.v0 or a > self.v1:
                continue
            xa, xb = self.x_of(a), self.x_of(b)
            bg = QtGui.QColor(col)
            bg.setAlpha(48)
            p.fillRect(QtCore.QRectF(xa, 0, max(2, xb - xa), h), bg)
            p.setPen(QtGui.QColor(col))
            p.drawLine(int(xa), 0, int(xa), h)
            p.drawLine(int(xb), 0, int(xb), h)
        n = len(self.env)
        if n:
            m = float(self.env.max()) or 1.0
            mid = h / 2
            per_px = span * n / max(1, w)
            grey, gold = QtGui.QColor("#3a4150"), QtGui.QColor(getattr(self, "color", GOLD))
            for x in range(w):
                f = self.v0 + x / w * span
                i = int(f * n)
                v = float(self.env[i:i + max(1, int(per_px + 1))].max()) / m if i < n else 0.0
                zc = None
                for a, b, col, _lab in getattr(self, "zones", []):
                    if a <= f <= b:
                        zc = col
                        break
                p.setPen(QtGui.QColor(zc) if zc else (gold if any(a <= f <= b for a, b in self.gold) else grey))
                p.drawLine(x, int(mid - v * mid * 0.9), x, int(mid + v * mid * 0.9))
        if getattr(self, "zones", None):
            f = p.font()
            f.setPointSize(7)
            f.setBold(True)
            p.setFont(f)
            for a, b, col, lab in self.zones:
                if b < self.v0 or a > self.v1 or not lab:
                    continue
                xa = max(0, int(self.x_of(a)))
                tw = p.fontMetrics().horizontalAdvance(lab) + 10
                p.fillRect(QtCore.QRectF(xa + 4, 5, tw, 14), QtGui.QColor(col))
                p.setPen(QtGui.QColor("#14191d"))
                p.drawText(QtCore.QRectF(xa + 4, 5, tw, 14), QtCore.Qt.AlignmentFlag.AlignCenter, lab)
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


# ---- widgets ported from the Script Manager: hover-animated button, focus-
# animated line edit, frameless dialogs with fade-in, the black slider ----
def _lerp(c1, c2, t):
    return QtGui.QColor(int(c1.red() + (c2.red() - c1.red()) * t),
                        int(c1.green() + (c2.green() - c1.green()) * t),
                        int(c1.blue() + (c2.blue() - c1.blue()) * t),
                        int(c1.alpha() + (c2.alpha() - c1.alpha()) * t))


def _ease():
    return QtCore.QEasingCurve.Type.OutExpo


class AnimatedButton(QtWidgets.QPushButton):
    """Transparent, warm text, 1px border; hover fades to an orange fill with white text."""

    def __init__(self, text="", parent=None, accent=None):
        super().__init__(text, parent)
        self._p = 0.0
        self._accent = accent or ACCENT
        self._anim = QtCore.QVariantAnimation(self)
        self._anim.setDuration(180)
        self._anim.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(self._style)
        self.setFocusPolicy(QtCore.Qt.FocusPolicy.NoFocus)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(26)
        self._style(0.0)

    def _style(self, p):
        self._p = float(p)
        bg = _lerp(QtGui.QColor(45, 55, 62, 0), QtGui.QColor(self._accent), self._p)
        bd = _lerp(QtGui.QColor(BORDER), QtGui.QColor(self._accent), self._p)
        tx = _lerp(QtGui.QColor(TEXT_WARM), QtGui.QColor("#ffffff"), self._p)
        self.setStyleSheet(
            "QPushButton { background-color: rgba(%d,%d,%d,%d); color: %s; border: 1px solid %s; border-radius: 3px;"
            " font-size: 11px; font-weight: bold; padding: 2px 10px; outline: none; }"
            "QPushButton:disabled { color: #5c6478; border-color: #3a4650; }"
            % (bg.red(), bg.green(), bg.blue(), bg.alpha(), tx.name(), bd.name()))

    def _to(self, end):
        self._anim.stop()
        self._anim.setStartValue(self._p)
        self._anim.setEndValue(float(end))
        self._anim.start()

    def enterEvent(self, e):
        self._to(1.0)
        super().enterEvent(e)

    def leaveEvent(self, e):
        self._to(0.0)
        super().leaveEvent(e)


class FnLineEdit(QtWidgets.QLineEdit):
    """The focus border never snaps: 1px border fades BORDER -> orange in 200 ms."""

    def __init__(self, placeholder="", text="", parent=None):
        super().__init__(text, parent)
        self.setPlaceholderText(placeholder)
        self.setFixedHeight(26)
        self._fb = 0.0
        self._fb_anim = QtCore.QVariantAnimation(self)
        self._fb_anim.setDuration(200)
        self._fb_anim.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self._fb_anim.valueChanged.connect(self._fb_apply)
        self._fb_apply(0.0)

    def _fb_apply(self, v):
        self._fb = float(v)
        c = _lerp(QtGui.QColor(BORDER), QtGui.QColor(ACCENT), self._fb)
        self.setStyleSheet("QLineEdit { background-color: %s; color: %s; border-radius: 3px; padding: 0 8px;"
                           " font-size: 11px; selection-background-color: %s; outline: none; border: 1px solid %s; }"
                           % (BG_INPUT, TEXT_WHITE, ACCENT, c.name()))

    def _fb_to(self, end):
        self._fb_anim.stop()
        self._fb_anim.setStartValue(self._fb)
        self._fb_anim.setEndValue(float(end))
        self._fb_anim.start()

    def focusInEvent(self, e):
        super().focusInEvent(e)
        self._fb_to(1.0)

    def focusOutEvent(self, e):
        super().focusOutEvent(e)
        self._fb_to(0.0)


class FnDialog(QtWidgets.QDialog):
    """Frameless dialog in the Script Manager style: 30px header, content, fade-in with a short rise."""

    def __init__(self, title, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setWindowFlags(QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Dialog)
        self._drag = None
        self._shown = False
        root = QtWidgets.QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        hdr = QtWidgets.QFrame()
        hdr.setFixedHeight(30)
        hdr.setStyleSheet("background-color: %s;" % BG_HEADER)
        hl = QtWidgets.QHBoxLayout(hdr)
        hl.setContentsMargins(10, 0, 8, 0)
        t = QtWidgets.QLabel(title)
        t.setStyleSheet("color: %s; font-size: 12px; font-weight: bold; background: transparent;" % TEXT_WHITE)
        hl.addWidget(t)
        hl.addStretch(1)
        x = Glyph("x", hover_color="#ff3c3c", size=18)
        x.clicked.connect(self.reject)
        hl.addWidget(x)
        root.addWidget(hdr)
        self.body = QtWidgets.QVBoxLayout()
        self.body.setContentsMargins(12, 10, 12, 12)
        self.body.setSpacing(8)
        root.addLayout(self.body)
        self.first_focus = None

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.fillRect(self.rect(), QtGui.QColor(BG_CONTENT))
        p.setPen(QtGui.QPen(QtGui.QColor(BORDER_DARK), 1))
        p.drawRect(self.rect().adjusted(0, 0, -1, -1))
        p.end()

    def open_over(self, widget):
        self.adjustSize()
        c = widget.frameGeometry().center() if widget.isWindow() else widget.mapToGlobal(widget.rect().center())
        pos = c - QtCore.QPoint(self.width() // 2, self.height() // 2)
        try:
            scr = QtGui.QGuiApplication.screenAt(c) or QtGui.QGuiApplication.primaryScreen()
            av = scr.availableGeometry()
            pos = QtCore.QPoint(max(av.left(), min(pos.x(), av.right() - self.width())),
                                max(av.top(), min(pos.y(), av.bottom() - self.height())))
        except Exception:
            pass
        self.move(pos)

    def showEvent(self, e):
        super().showEvent(e)
        if not self._shown:
            self._shown = True
            final = self.pos()
            self.setWindowOpacity(0.0)
            self.move(final + QtCore.QPoint(0, 14))
            grp = QtCore.QParallelAnimationGroup(self)
            a = QtCore.QPropertyAnimation(self, b"windowOpacity", grp)
            a.setDuration(420)
            a.setStartValue(0.0)
            a.setEndValue(1.0)
            a.setEasingCurve(_ease())
            b = QtCore.QPropertyAnimation(self, b"pos", grp)
            b.setDuration(420)
            b.setStartValue(final + QtCore.QPoint(0, 14))
            b.setEndValue(final)
            b.setEasingCurve(_ease())
            grp.addAnimation(a)
            grp.addAnimation(b)
            self._grp = grp
            grp.start()
            if self.first_focus is not None:
                QtCore.QTimer.singleShot(0, lambda: (self.first_focus.setFocus(), self.first_focus.selectAll()
                                                     if isinstance(self.first_focus, QtWidgets.QLineEdit) else None))

    def mousePressEvent(self, e):
        self._drag = None
        if e.button() == QtCore.Qt.MouseButton.LeftButton and e.position().y() <= 30:
            self._drag = e.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, e):
        if self._drag is not None and e.buttons() & QtCore.Qt.MouseButton.LeftButton:
            self.move(e.globalPosition().toPoint() - self._drag)

    def mouseReleaseEvent(self, e):
        self._drag = None


class NameDialog(FnDialog):
    """One line of text with Cancel / OK (replaces QInputDialog)."""

    def __init__(self, title, placeholder, text="", ok_text="OK", note="", parent=None):
        super().__init__(title, parent)
        self.setFixedWidth(340)
        if note:
            n = QtWidgets.QLabel(note)
            n.setWordWrap(True)
            n.setStyleSheet("color: %s; font-size: 11px; background: transparent;" % TEXT_GRAY)
            self.body.addWidget(n)
        self.edit = FnLineEdit(placeholder, text)
        self.first_focus = self.edit
        self.edit.returnPressed.connect(self._ok)
        self.body.addWidget(self.edit)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(6)
        cancel = AnimatedButton("Cancel")
        cancel.clicked.connect(self.reject)
        row.addWidget(cancel, 1)
        ok = AnimatedButton(ok_text)
        ok.clicked.connect(self._ok)
        row.addWidget(ok, 1)
        self.body.addLayout(row)

    def _ok(self):
        if self.edit.text().strip():
            self.accept()

    def value(self):
        return self.edit.text().strip()


class ConfirmDialog(FnDialog):
    """A question with No / Yes (replaces QMessageBox.question)."""

    def __init__(self, title, text, yes_text="Yes", parent=None):
        super().__init__(title, parent)
        self.setFixedWidth(360)
        t = QtWidgets.QLabel(text)
        t.setWordWrap(True)
        t.setStyleSheet("color: %s; font-size: 11px; background: transparent;" % TEXT_ROW)
        self.body.addWidget(t)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(6)
        no = AnimatedButton("No")
        no.clicked.connect(self.reject)
        row.addWidget(no, 1)
        yes = AnimatedButton(yes_text)
        yes.clicked.connect(self.accept)
        row.addWidget(yes, 1)
        self.body.addLayout(row)


def ask_text(parent, title, placeholder, note=""):
    d = NameDialog(title, placeholder, note=note, parent=parent)
    d.open_over(parent.window())
    return d.value() if d.exec() == QtWidgets.QDialog.DialogCode.Accepted else None


def ask_yes(parent, title, text, yes_text="Yes"):
    d = ConfirmDialog(title, text, yes_text, parent=parent)
    d.open_over(parent.window())
    return d.exec() == QtWidgets.QDialog.DialogCode.Accepted


def say(parent, title, text):
    d = FnDialog(title, parent)
    d.setFixedWidth(360)
    t = QtWidgets.QLabel(text)
    t.setWordWrap(True)
    t.setStyleSheet("color: %s; font-size: 11px; background: transparent;" % TEXT_ROW)
    d.body.addWidget(t)
    ok = AnimatedButton("OK")
    ok.clicked.connect(d.accept)
    d.body.addWidget(ok)
    d.open_over(parent.window())
    d.exec()


class FnSlider(QtWidgets.QWidget):
    """The program's scroll slider: 18px strip, black 4px handle (light grey on hover),
    arrows top and bottom, handle height follows the content. Sits over the
    right edge of a QScrollArea / QAbstractScrollArea and hides when nothing scrolls."""
    GW, HW, HMIN, AH = 18, 4, 12, 12

    def __init__(self, area):
        super().__init__(area)
        self.area = area
        self.vbar = area.verticalScrollBar()
        area.setVerticalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setFixedWidth(self.GW)
        self.setMouseTracking(True)
        self._hover = False
        self._drag = None
        self._dir = 0
        self._timer = QtCore.QTimer(self)
        self._timer.setInterval(40)
        self._timer.timeout.connect(lambda: self.vbar.setValue(self.vbar.value() + self._dir * 24))
        self.vbar.valueChanged.connect(self.update)
        self.vbar.rangeChanged.connect(lambda *_: self._place())
        area.installEventFilter(self)
        self._place()

    def eventFilter(self, obj, e):
        if e.type() in (QtCore.QEvent.Type.Resize, QtCore.QEvent.Type.Show, QtCore.QEvent.Type.LayoutRequest):
            QtCore.QTimer.singleShot(0, self._place)
        return False

    def _place(self):
        self.setGeometry(self.area.width() - self.GW, 0, self.GW, self.area.height())
        self.setVisible(self.vbar.maximum() > 0)
        self.raise_()
        self.update()

    def _track(self):
        return self.AH + 2, self.height() - self.AH - 2

    def _handle(self):
        t0, t1 = self._track()
        span = max(1, t1 - t0)
        page = max(1, self.vbar.pageStep())
        total = page + self.vbar.maximum()
        h = max(self.HMIN, int(span * page / total))
        y = t0 + int((span - h) * self.vbar.value() / max(1, self.vbar.maximum()))
        return y, h

    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        col = QtGui.QColor("#D4DDD4" if (self._hover or self._drag is not None) else "#000000")
        p.setPen(QtGui.QPen(col, 1.4))
        p.setBrush(QtCore.Qt.BrushStyle.NoBrush)
        cx = self.GW / 2
        p.drawPolyline(QtGui.QPolygonF([QtCore.QPointF(cx - 3.5, 8), QtCore.QPointF(cx, 4), QtCore.QPointF(cx + 3.5, 8)]))
        hh = self.height()
        p.drawPolyline(QtGui.QPolygonF([QtCore.QPointF(cx - 3.5, hh - 8), QtCore.QPointF(cx, hh - 4),
                                        QtCore.QPointF(cx + 3.5, hh - 8)]))
        y, h = self._handle()
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(col)
        p.drawRoundedRect(QtCore.QRectF(cx - self.HW / 2, y, self.HW, h), 2, 2)
        p.end()

    def enterEvent(self, e):
        self._hover = True
        self.update()

    def leaveEvent(self, e):
        self._hover = False
        self.update()

    def mousePressEvent(self, e):
        if e.button() != QtCore.Qt.MouseButton.LeftButton:
            return
        y = e.position().y()
        if y < self.AH + 2:
            self._dir = -1
            self._timer.start()
            self.vbar.setValue(self.vbar.value() - 24)
            return
        if y > self.height() - self.AH - 2:
            self._dir = 1
            self._timer.start()
            self.vbar.setValue(self.vbar.value() + 24)
            return
        hy, hh = self._handle()
        if hy <= y <= hy + hh:
            self._drag = (y, self.vbar.value())
        else:
            self.vbar.setValue(self.vbar.value() + (self.vbar.pageStep() if y > hy else -self.vbar.pageStep()))

    def mouseMoveEvent(self, e):
        if self._drag is not None:
            y0, v0 = self._drag
            t0, t1 = self._track()
            _, h = self._handle()
            span = max(1, (t1 - t0) - h)
            self.vbar.setValue(int(v0 + (e.position().y() - y0) * self.vbar.maximum() / span))

    def mouseReleaseEvent(self, e):
        self._drag = None
        self._timer.stop()
        self.update()


class Glyph(QtWidgets.QWidget):
    """Vector icon button drawn with lines, hover fades the colour (Script Manager _GlyphButton).
    kinds: refresh, plus, x, minimize, maximize, restore, copy, external."""
    clicked = QtCore.pyqtSignal()

    def __init__(self, kind, hover_color=None, size=18, circle=False, idle_color="#8a9299", tip="", parent=None):
        super().__init__(parent)
        self.kind = kind
        self.hover_color = QtGui.QColor(hover_color or ACCENT)
        self.idle_color = QtGui.QColor(idle_color)
        self.circle = circle
        self.setFixedSize(size, size)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        if tip:
            self.setToolTip(tip)
        self._hp = 0.0
        self._anim = QtCore.QVariantAnimation(self)
        self._anim.setDuration(180)
        self._anim.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(lambda v: (setattr(self, "_hp", float(v)), self.update()))

    def _to(self, end):
        self._anim.stop()
        self._anim.setStartValue(self._hp)
        self._anim.setEndValue(float(end))
        self._anim.start()

    def enterEvent(self, e):
        self._to(1.0)

    def leaveEvent(self, e):
        self._to(0.0)

    def mousePressEvent(self, e):
        e.accept()

    def mouseReleaseEvent(self, e):
        if e.button() == QtCore.Qt.MouseButton.LeftButton and self.rect().contains(e.position().toPoint()):
            self.clicked.emit()

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing, True)
        w = self.width()
        c = w / 2.0
        col = _lerp(self.idle_color, self.hover_color, self._hp)
        if self.circle:
            p.setPen(QtGui.QPen(_lerp(QtGui.QColor(BORDER), self.hover_color, self._hp), 1.0))
            p.setBrush(QtGui.QColor(BG_INPUT))
            p.drawEllipse(QtCore.QRectF(0.5, 0.5, w - 1, w - 1))
        pen = QtGui.QPen(col, 1.6)
        pen.setCapStyle(QtCore.Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(QtCore.Qt.PenJoinStyle.RoundJoin)
        p.setPen(pen)
        p.setBrush(QtCore.Qt.BrushStyle.NoBrush)
        k = self.kind
        s = w / 18.0  # everything below is drawn for an 18px box
        if k == "refresh":
            r = 4.6 * s
            p.drawArc(QtCore.QRectF(c - r, c - r, 2 * r, 2 * r), 40 * 16, 290 * 16)
            # arrow head at the end of the arc (top right)
            import math
            a = math.radians(40)
            tip = QtCore.QPointF(c + r * math.cos(a), c - r * math.sin(a))
            p.drawLine(tip, QtCore.QPointF(tip.x() - 3.2 * s, tip.y() - 0.6 * s))
            p.drawLine(tip, QtCore.QPointF(tip.x() + 0.2 * s, tip.y() - 3.4 * s))
        elif k == "plus":
            r = 4.0 * s
            p.drawLine(QtCore.QPointF(c - r, c), QtCore.QPointF(c + r, c))
            p.drawLine(QtCore.QPointF(c, c - r), QtCore.QPointF(c, c + r))
        elif k == "x":
            r = 3.8 * s
            p.drawLine(QtCore.QPointF(c - r, c - r), QtCore.QPointF(c + r, c + r))
            p.drawLine(QtCore.QPointF(c + r, c - r), QtCore.QPointF(c - r, c + r))
        elif k == "minimize":
            r = 4.0 * s
            p.drawLine(QtCore.QPointF(c - r, c + 1), QtCore.QPointF(c + r, c + 1))
        elif k == "maximize":
            r = 3.8 * s
            pen.setWidthF(1.3)
            p.setPen(pen)
            p.drawRect(QtCore.QRectF(c - r, c - r, 2 * r, 2 * r))
        elif k == "restore":
            r = 3.2 * s
            pen.setWidthF(1.3)
            p.setPen(pen)
            p.drawRect(QtCore.QRectF(c - r - 1.5, c - r + 1.5, 2 * r, 2 * r))
            p.drawPolyline(QtGui.QPolygonF([QtCore.QPointF(c - r + 1.5, c - r + 1.5), QtCore.QPointF(c - r + 1.5, c - r - 1.5),
                                            QtCore.QPointF(c + r + 1.5, c - r - 1.5), QtCore.QPointF(c + r + 1.5, c + r - 1.5),
                                            QtCore.QPointF(c + r - 1.5, c + r - 1.5)]))
        elif k == "copy":
            pen.setWidthF(1.3)
            p.setPen(pen)
            r = 3.4 * s
            p.drawRoundedRect(QtCore.QRectF(c - r + 1.5, c - r + 1.5, 2 * r, 2 * r), 1.5, 1.5)
            p.drawPolyline(QtGui.QPolygonF([QtCore.QPointF(c - r - 1.5, c + r - 2.5), QtCore.QPointF(c - r - 1.5, c - r - 1.5),
                                            QtCore.QPointF(c + r - 2.5, c - r - 1.5)]))
        elif k == "external":
            r = 3.6 * s
            p.drawLine(QtCore.QPointF(c - r, c + r), QtCore.QPointF(c + r, c - r))
            p.drawPolyline(QtGui.QPolygonF([QtCore.QPointF(c - 0.5, c - r), QtCore.QPointF(c + r, c - r),
                                            QtCore.QPointF(c + r, c + 0.5)]))
        p.end()


class MenuTriangle(QtWidgets.QWidget):
    """The program's menu triangle: points right, on hover turns down and goes orange."""
    clicked = QtCore.pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(14, 14)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        self._hp = 0.0
        self._hold = False
        self._anim = QtCore.QVariantAnimation(self)
        self._anim.setDuration(120)
        self._anim.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(lambda v: (setattr(self, "_hp", float(v)), self.update()))

    def _to(self, end):
        self._anim.stop()
        self._anim.setStartValue(self._hp)
        self._anim.setEndValue(float(end))
        self._anim.start()

    def paintEvent(self, _e):
        import math
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing, True)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        idle = QtGui.QColor(TEXT_WHITE)
        idle.setAlpha(200)
        p.setBrush(_lerp(idle, QtGui.QColor("#ef7f02"), self._hp))
        cx, cy = self.width() / 2.0, self.height() / 2.0
        ang = self._hp * math.pi / 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        pts = [(2.5, 0.0), (-2.5, -5.0), (-2.5, 5.0)]
        p.drawPolygon(QtGui.QPolygonF([QtCore.QPointF(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]))
        p.end()

    def enterEvent(self, e):
        self._to(1.0)

    def leaveEvent(self, e):
        if not self._hold:
            self._to(0.0)

    def menu_closed(self):
        self._hold = False
        if not self.rect().contains(self.mapFromGlobal(QtGui.QCursor.pos())):
            self._to(0.0)

    def mousePressEvent(self, e):
        e.accept()
        if e.button() == QtCore.Qt.MouseButton.LeftButton and not self._hold:
            self._hold = True
            self._to(1.0)
            home = self.pos()
            self.move(home.x(), home.y() + 2)
            QtCore.QTimer.singleShot(80, lambda: self.move(home))
            QtCore.QTimer.singleShot(150, self.clicked.emit)

    def mouseReleaseEvent(self, e):
        e.accept()


# ---- small painted widgets in the Script Manager language ----
class Chevron(QtWidgets.QPushButton):
    """Small triangle: down = open, right = closed."""

    def __init__(self, open_=True, color=TEXT_GRAY):
        super().__init__()
        self.setObjectName("chev")
        self.open_ = open_
        self.color = color
        self.setFixedSize(14, 14)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)

    def set_open(self, open_):
        self.open_ = open_
        self.update()

    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(QtGui.QColor(self.color))
        if self.open_:
            poly = QtGui.QPolygonF([QtCore.QPointF(2, 4), QtCore.QPointF(12, 4), QtCore.QPointF(7, 10)])
        else:
            poly = QtGui.QPolygonF([QtCore.QPointF(4, 2), QtCore.QPointF(10, 7), QtCore.QPointF(4, 12)])
        p.drawPolygon(poly)
        p.end()


class Dot(QtWidgets.QWidget):
    """Status dot (scanning = glowing accent)."""

    def __init__(self, size=7):
        super().__init__()
        self.color = None
        self.setFixedSize(size + 4, size + 4)
        self.sz = size

    def set(self, color):
        self.color = color
        self.setVisible(color is not None)
        self.update()

    def paintEvent(self, _):
        if not self.color:
            return
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        c = QtGui.QColor(self.color)
        glow = QtGui.QColor(c)
        glow.setAlpha(70)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(glow)
        p.drawEllipse(0, 0, self.sz + 4, self.sz + 4)
        p.setBrush(c)
        p.drawEllipse(2, 2, self.sz, self.sz)
        p.end()


class Square(QtWidgets.QWidget):
    """Little colour square (folder / customer colour)."""

    def __init__(self, color, size=8):
        super().__init__()
        self.color = color
        self.setFixedSize(size, size)

    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(QtGui.QColor(self.color))
        p.drawRoundedRect(QtCore.QRectF(0, 0, self.width(), self.height()), 2, 2)
        p.end()


class RailItem(QtWidgets.QWidget):
    """One customer / custom list in the left rail: square, name, scanning dot, count."""
    clicked = QtCore.pyqtSignal(str)

    def __init__(self, key, color, text, count):
        super().__init__()
        self.key = key
        self.setObjectName("railitem")
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setFixedHeight(30)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        self.sel = False
        h = QtWidgets.QHBoxLayout(self)
        h.setContentsMargins(22, 0, 20, 0)
        h.setSpacing(8)
        h.addWidget(Square(color))
        self.lbl = QtWidgets.QLabel(text)
        self.lbl.setObjectName("rowtext")
        self.lbl.setToolTip(text)
        h.addWidget(self.lbl, 1)
        self.dot = Dot()
        self.dot.set(None)
        h.addWidget(self.dot)
        self.cnt = QtWidgets.QLabel(str(count))
        self.cnt.setObjectName("cnt")
        h.addWidget(self.cnt)

    def set_selected(self, on):
        self.sel = on
        self.setProperty("sel", "true" if on else "false")
        self.lbl.setObjectName("rowtextsel" if on else "rowtext")
        for w in (self, self.lbl):
            w.style().unpolish(w)
            w.style().polish(w)
        self.update()

    def paintEvent(self, e):
        super().paintEvent(e)
        if self.sel:
            p = QtGui.QPainter(self)
            p.setPen(QtCore.Qt.PenStyle.NoPen)
            p.setBrush(QtGui.QColor(ACCENT))
            p.drawRoundedRect(QtCore.QRectF(0, 7, 3, self.height() - 14), 1.5, 1.5)
            p.end()

    def mousePressEvent(self, e):
        if e.button() == QtCore.Qt.MouseButton.LeftButton:
            self.clicked.emit(self.key)


def circle_button(kind, tip):
    """Round vector button in the rail headers: kind = refresh | plus."""
    return Glyph(kind, size=18, circle=True, idle_color=TEXT_ROW, tip=tip)


def tag_label(text, fg, bg):
    l = QtWidgets.QLabel(text)
    l.setObjectName("tag")
    l.setStyleSheet("color:%s;background:%s" % (fg, bg))
    return l


class ChannelBar(QtWidgets.QFrame):
    """The channel strip: chevron, title, state, Copy link, counts, scan progress, Scan / Stop."""
    toggled = QtCore.pyqtSignal(str, bool)
    scan = QtCore.pyqtSignal(str)
    stop = QtCore.pyqtSignal(str)

    def __init__(self, ch, color, open_):
        super().__init__()
        self.ch = ch
        self.color = color
        self.setObjectName("chan")
        self.setFixedHeight(34)
        h = QtWidgets.QHBoxLayout(self)
        h.setContentsMargins(12, 0, 8, 0)
        h.setSpacing(10)
        self.dot = Dot()
        self.dot.set(None)
        h.addWidget(self.dot)
        self.chev = Chevron(open_)
        self.chev.clicked.connect(lambda: self.toggled.emit(self.ch["id"], not self.chev.open_))
        h.addWidget(self.chev)
        t = QtWidgets.QLabel(ch.get("title") or ch.get("url") or "Channel")
        if ch.get("url") == "solo":
            t.setText("Single videos")
        t.setObjectName("title")
        t.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        t.mousePressEvent = lambda e: self.toggled.emit(self.ch["id"], not self.chev.open_)
        h.addWidget(t)
        state = ch.get("state") or "noplan"
        look = {"active": ("Active", "#9fe3b0", "#2e4d35"), "paused": ("Paused: over plan limit", TEXT_GRAY, BG_INPUT),
                "noplan": ("No plan: claims not released", "#f2c14e", "#5a4420")}
        st, fg, bg = look.get(state, (state, TEXT_GRAY, BG_INPUT))
        h.addWidget(tag_label(st, fg, bg))
        if ch.get("url") and ch["url"] != "solo":
            b = AnimatedButton("Copy link")
            b.setFixedHeight(22)
            b.setToolTip(ch["url"])
            b.clicked.connect(lambda: (QtWidgets.QApplication.clipboard().setText(self.ch["url"]), b.setText("Copied"),
                                       QtCore.QTimer.singleShot(1200, lambda: b.setText("Copy link"))))
            h.addWidget(b)
        h.addStretch(1)
        self.meta = QtWidgets.QLabel("")
        self.meta.setObjectName("muted")
        self.meta.setTextFormat(QtCore.Qt.TextFormat.RichText)
        h.addWidget(self.meta)
        h.addSpacing(8)
        self.prog_lbl = QtWidgets.QLabel("")
        self.prog_lbl.setStyleSheet("color:%s;font-size:10px;font-weight:700" % ACCENT)
        h.addWidget(self.prog_lbl)
        self.pbar = QtWidgets.QProgressBar()
        self.pbar.setFixedSize(90, 3)
        self.pbar.setTextVisible(False)
        self.pbar.setRange(0, 1000)
        h.addWidget(self.pbar)
        self.btn_scan = QtWidgets.QPushButton("Scan")
        self.btn_scan.setObjectName("scan")
        self.btn_scan.clicked.connect(lambda: self.scan.emit(self.ch["id"]))
        h.addWidget(self.btn_scan)
        self.btn_stop = QtWidgets.QPushButton("Stop")
        self.btn_stop.setObjectName("stop")
        self.btn_stop.clicked.connect(lambda: self.stop.emit(self.ch["id"]))
        h.addWidget(self.btn_stop)
        self.set_progress(None)

    def set_meta(self, n_videos, n_match, n_wait):
        self.meta.setText("<span style='color:%s'>%d videos</span> &nbsp;&middot;&nbsp; "
                          "<span style='color:%s'>%d match</span> &nbsp;&middot;&nbsp; "
                          "<span style='color:%s'>%d waiting release</span>"
                          % (TEXT_GRAY, n_videos, RED if n_match else TEXT_GRAY, n_match, TEXT_GRAY, n_wait))

    def set_progress(self, done_total):
        """done_total = (done, total) while this channel is being scanned, else None."""
        on = done_total is not None
        self.dot.set(ACCENT if on else None)
        self.prog_lbl.setVisible(on)
        self.pbar.setVisible(on)
        self.btn_stop.setVisible(on)
        self.btn_scan.setVisible(not on)
        if on:
            d, t = done_total
            self.prog_lbl.setText("scanning %d / %d" % (d, t))
            self.pbar.setValue(int(1000 * d / max(1, t)))

    def paintEvent(self, e):
        super().paintEvent(e)
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(QtGui.QColor(self.color))
        p.drawRoundedRect(QtCore.QRectF(0, 8, 3, self.height() - 16), 1.5, 1.5)
        p.end()


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
        self.setWindowFlags(QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Window)
        self.setMouseTracking(True)

        root = QtWidgets.QWidget()
        root.setObjectName("root")
        self.setCentralWidget(root)
        lay = QtWidgets.QVBoxLayout(root)
        lay.setContentsMargins(4, 4, 4, 4)
        lay.setSpacing(0)
        root.setMouseTracking(True)

        # -- header strip: triangle menu, title, mode switch --
        hdr = QtWidgets.QWidget()
        hdr.setObjectName("hdr")
        hdr.setFixedHeight(32)
        hl = QtWidgets.QHBoxLayout(hdr)
        hl.setContentsMargins(10, 0, 10, 0)
        hl.setSpacing(14)
        self.menu_btn = MenuTriangle()
        self.menu_btn.setToolTip("Menu")
        self.menu_btn.clicked.connect(self.open_menu)
        hl.addWidget(self.menu_btn)
        t = QtWidgets.QLabel("Whitelist Scanner")
        t.setObjectName("hdrtitle")
        hl.addWidget(t)
        sep = QtWidgets.QFrame()
        sep.setFixedSize(1, 14)
        sep.setStyleSheet("background:%s" % BORDER)
        hl.addWidget(sep)
        self.pages = QtWidgets.QStackedWidget()
        self.navs = []
        for i, name in enumerate(["Scanner", "Manual check", "Settings"]):
            b = QtWidgets.QPushButton(name)
            b.setObjectName("mode")
            b.setCheckable(True)
            b.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
            b.clicked.connect(lambda _, k=i: self.goto(k))
            hl.addWidget(b)
            self.navs.append(b)
        hl.addStretch(1)
        self.hdr_sub = QtWidgets.QLabel("")
        self.hdr_sub.setObjectName("hdrsub")
        hl.addWidget(self.hdr_sub)
        hl.addSpacing(10)
        for kind, fn, hov in (("minimize", self.showMinimized, TEXT_WHITE), ("maximize", self.toggle_max, TEXT_WHITE),
                              ("x", self.close, "#ff3c3c")):
            b = Glyph(kind, hover_color=hov, size=18)
            b.clicked.connect(fn)
            hl.addWidget(b)
            hl.addSpacing(4)
            if kind == "maximize":
                self.btn_max = b
        self.hdr = hdr
        self._drag = None
        self._resize = None
        QtWidgets.QApplication.instance().installEventFilter(self)
        hdr.mousePressEvent = self._hdr_press
        hdr.mouseMoveEvent = self._hdr_move
        hdr.mouseReleaseEvent = self._hdr_release
        hdr.mouseDoubleClickEvent = lambda e: self.toggle_max()
        lay.addWidget(hdr)
        lay.addWidget(self.pages, 1)

        # hidden holders the other pages still use
        self.stage_lbl = QtWidgets.QLabel("")
        self.pbar = QtWidgets.QProgressBar()
        self.pbar.setRange(0, 1000)
        self.stage_text = ""

        # scanner page state
        self.ov = None  # overview from the site
        self.cust = []  # [{key, kind, name, color, userId, plan, channels:[...]}]
        self.vid_rows = {}  # videoId -> site video row
        self.matches_by_vid = {}  # videoId -> [site match rows]
        self.sel_key = None
        self.sel_tab = "channels"
        self.open_ch = set()
        self.open_vid = set()
        self.rail_items = {}
        self.chan_bars = {}
        self.vtables = {}  # channelId -> VideoTable
        self.vitems_site = {}  # videoId -> (table, item)
        self.search_text = ""
        self.job_src = {}  # videoId -> channelId while in the queue (site scans)
        self.channel_total = {}  # channelId -> number of videos queued by the last Scan press

        try:
            open(SESSION_LOG, "w").close()
        except OSError:
            pass

        self.pages.addWidget(self.page_scanner())
        self.pages.addWidget(self.page_check())
        self.pages.addWidget(self.page_settings())
        self.goto(0 if self.settings["token"] else 2)

        self.timer = QtCore.QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.play_timer = QtCore.QTimer(self)
        self.play_timer.timeout.connect(self._play_tick)
        self.bg(self.prepare)

    # ---- our own title bar: move, maximize, resize from the edges ----
    def toggle_max(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()
        self.btn_max.kind = "restore" if self.isMaximized() else "maximize"
        self.btn_max.update()

    def _hdr_press(self, e):
        if e.button() == QtCore.Qt.MouseButton.LeftButton and not self.isMaximized():
            self._drag = e.globalPosition().toPoint() - self.frameGeometry().topLeft()
        e.accept()

    def _hdr_move(self, e):
        if getattr(self, "_drag", None) is not None and (e.buttons() & QtCore.Qt.MouseButton.LeftButton):
            self.move(e.globalPosition().toPoint() - self._drag)
        e.accept()

    def _hdr_release(self, e):
        self._drag = None
        e.accept()

    def _edges_at(self, pos):
        m = 6
        l = pos.x() <= m
        r = pos.x() >= self.width() - m
        t = pos.y() <= m
        b = pos.y() >= self.height() - m
        return l, r, t, b

    def mousePressEvent(self, e):
        if e.button() == QtCore.Qt.MouseButton.LeftButton and not self.isMaximized():
            edges = self._edges_at(e.position().toPoint())
            if any(edges):
                self._resize = (edges, e.globalPosition().toPoint(), self.geometry())
                e.accept()
                return
        super().mousePressEvent(e)

    def mouseMoveEvent(self, e):
        rs = getattr(self, "_resize", None)
        if rs is not None and (e.buttons() & QtCore.Qt.MouseButton.LeftButton):
            (l, r, t, b), start, geo = rs
            d = e.globalPosition().toPoint() - start
            g = QtCore.QRect(geo)
            if l:
                g.setLeft(min(geo.left() + d.x(), geo.right() - self.minimumWidth()))
            if r:
                g.setRight(max(geo.right() + d.x(), geo.left() + self.minimumWidth()))
            if t:
                g.setTop(min(geo.top() + d.y(), geo.bottom() - self.minimumHeight()))
            if b:
                g.setBottom(max(geo.bottom() + d.y(), geo.top() + self.minimumHeight()))
            self.setGeometry(g)
            e.accept()
            return
        self._edge_cursor(e.position().toPoint())
        super().mouseMoveEvent(e)

    def _edge_cursor(self, pos):
        """Resize arrows only on the 4px frame; everywhere else the normal arrow."""
        if self.isMaximized():
            self.unsetCursor()
            return
        l, r, t, b = self._edges_at(pos)
        if (l and t) or (r and b):
            self.setCursor(QtCore.Qt.CursorShape.SizeFDiagCursor)
        elif (r and t) or (l and b):
            self.setCursor(QtCore.Qt.CursorShape.SizeBDiagCursor)
        elif l or r:
            self.setCursor(QtCore.Qt.CursorShape.SizeHorCursor)
        elif t or b:
            self.setCursor(QtCore.Qt.CursorShape.SizeVerCursor)
        else:
            self.unsetCursor()

    def eventFilter(self, obj, e):
        # Children swallow mouse moves, so the window never hears that the mouse
        # left the frame: watch every move in the app and reset the arrows.
        if e.type() == QtCore.QEvent.Type.MouseMove and self._resize is None:
            self._edge_cursor(self.mapFromGlobal(QtGui.QCursor.pos()))
        return False

    def mouseReleaseEvent(self, e):
        self._resize = None
        super().mouseReleaseEvent(e)

    def open_menu(self):
        m = QtWidgets.QMenu(self)
        a = m.addAction("Show only customers with a whitelisted channel")
        a.setCheckable(True)
        a.setChecked(bool(self.settings.get("only_with_channels")))
        a.toggled.connect(self.set_only_with_channels)
        m.addSeparator()
        m.addAction("Open session log", lambda: QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(SESSION_LOG)))
        m.addAction("Open storage folder", lambda: QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(STORE)))
        m.addSeparator()
        m.addAction("Reload everything from the site", lambda: self.bg(self.reload_site, True))
        m.addSeparator()
        m.addAction("Reset scan results on the site (scan everything again)", self.reset_site_scans)
        m.exec(self.menu_btn.mapToGlobal(QtCore.QPoint(0, self.menu_btn.height() + 4)))
        self.menu_btn.menu_closed()

    def reset_site_scans(self):
        if not ask_yes(self, "Reset scan results",
                       "Every video on the site goes back to \"not scanned\" and Smart Scan will check them all "
                       "again. Found matches that are already in the composers' sheets or released stay; "
                       "matches not sent yet are removed. Continue?", "Reset"):
            return

        def go():
            try:
                r = api(self.settings, "POST", "", {"action": "reset_scans", "clearMatches": True}, timeout=120)
                self.log("Reset on the site: %s" % (r.get("error") or "%d video(s) back in the queue, %d match(es) removed"
                                                    % (r.get("requeued", 0), r.get("cleared", 0))))
            except Exception as e:
                self.log("Reset failed: %s" % e)
            self.load_overview()
        self.bg(go)

    def set_only_with_channels(self, on):
        self.settings["only_with_channels"] = bool(on)
        save_settings(self.settings)
        self.rebuild_rail()
        if self.sel_key not in self.rail_items:
            self.sel_key = next(iter(self.rail_items), None)
            for k, it in self.rail_items.items():
                it.set_selected(k == self.sel_key)
            self.rebuild_content()

    # -- small layout helpers used by the pages --
    def section(self, title):
        """A card with a title on top; returns (card, grid) - rows start at 1."""
        c = card()
        g = QtWidgets.QGridLayout(c)
        g.setContentsMargins(16, 14, 16, 16)
        g.setHorizontalSpacing(10)
        g.setVerticalSpacing(10)
        g.addWidget(label(title, "title"), 0, 0, 1, 2)
        g.setColumnMinimumWidth(0, 130)
        g.setColumnStretch(1, 1)
        return c, g

    def form_row(self, g, row, text, widget, left=False):
        g.addWidget(label(text, "lbl"), row, 0)
        if left:
            g.addWidget(widget, row, 1, QtCore.Qt.AlignmentFlag.AlignLeft)
        else:
            g.addWidget(widget, row, 1)

    def stat(self, lay, val, text):
        """A small stat box (big number + caption) added to a layout; returns the number label."""
        f = QtWidgets.QFrame()
        f.setObjectName("stat")
        v = QtWidgets.QVBoxLayout(f)
        v.setContentsMargins(12, 10, 12, 10)
        v.setSpacing(2)
        n = QtWidgets.QLabel(val)
        n.setObjectName("kpi")
        v.addWidget(n)
        v.addWidget(label(text, "muted"))
        lay.addWidget(f)
        return n

    # ---- plumbing ----------------------------------------------------------
    def goto(self, k):
        self.pages.setCurrentIndex(k)
        for i, b in enumerate(self.navs):
            b.setChecked(i == k)

    def log(self, msg):
        self.sig.log.emit(msg)

    def _log(self, msg):
        line = time.strftime("%H:%M:%S  ") + msg
        try:
            with open(SESSION_LOG, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass

    def stage(self, text, frac=None):
        self.sig.stage.emit(text, -1.0 if frac is None else float(frac))

    def _stage(self, text, frac):
        self.stage_text = text
        self.hdr_sub.setText(text[:90])
        self.stage_lbl.setText(text)
        if frac < 0:
            self.pbar.setRange(0, 0)
        else:
            self.pbar.setRange(0, 1000)
            self.pbar.setValue(int(1000 * max(0.0, min(1.0, frac))))
        self.update_scan_marks()

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
        l = QtWidgets.QHBoxLayout(w)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(0)

        # ---- left rail: search, Customers, Custom, Smart Scan ----
        rail = QtWidgets.QWidget()
        rail.setObjectName("rail")
        rail.setFixedWidth(230)
        rl = QtWidgets.QVBoxLayout(rail)
        rl.setContentsMargins(0, 8, 0, 0)
        rl.setSpacing(0)
        self.search = FnLineEdit("Search customer, channel, video")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self.on_search)
        sw = QtWidgets.QWidget()
        swl = QtWidgets.QHBoxLayout(sw)
        swl.setContentsMargins(8, 0, 8, 6)
        swl.addWidget(self.search)
        rl.addWidget(sw)

        self.rail_scroll = QtWidgets.QScrollArea()
        self.rail_scroll.setWidgetResizable(True)
        self.rail_scroll.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
        self.rail_scroll.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.rail_body = QtWidgets.QWidget()
        self.rail_lay = QtWidgets.QVBoxLayout(self.rail_body)
        self.rail_lay.setContentsMargins(0, 0, 0, 0)
        self.rail_lay.setSpacing(0)
        self.rail_scroll.setWidget(self.rail_body)
        self.rail_slider = FnSlider(self.rail_scroll)
        rl.addWidget(self.rail_scroll, 1)

        bottom = QtWidgets.QWidget()
        bottom.setObjectName("railbottom")
        bl = QtWidgets.QVBoxLayout(bottom)
        bl.setContentsMargins(10, 10, 10, 10)
        bl.setSpacing(6)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
        self.smart_dot = Dot()
        self.smart_dot.set(None)
        row.addWidget(self.smart_dot)
        t = QtWidgets.QLabel("Smart Scan")
        t.setObjectName("grp")
        row.addWidget(t)
        row.addStretch(1)
        self.smart_cnt = QtWidgets.QLabel("")
        self.smart_cnt.setObjectName("cnt")
        row.addWidget(self.smart_cnt)
        bl.addLayout(row)
        self.smart_bar = QtWidgets.QProgressBar()
        self.smart_bar.setFixedHeight(3)
        self.smart_bar.setTextVisible(False)
        self.smart_bar.setRange(0, 1000)
        bl.addWidget(self.smart_bar)
        self.smart_sub = QtWidgets.QLabel("Off. Scans every unscanned video of every active channel, then waits for new ones.")
        self.smart_sub.setObjectName("warm")
        self.smart_sub.setWordWrap(True)
        bl.addWidget(self.smart_sub)
        self.btn_run = QtWidgets.QPushButton("Start Smart Scan")
        self.btn_run.setObjectName("scan")
        self.btn_run.clicked.connect(self.toggle)
        bl.addWidget(self.btn_run)
        rl.addWidget(bottom)
        l.addWidget(rail)

        # ---- right: the selected customer ----
        self.content = QtWidgets.QScrollArea()
        self.content.setWidgetResizable(True)
        self.content.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
        self.content_body = QtWidgets.QWidget()
        self.content_lay = QtWidgets.QVBoxLayout(self.content_body)
        self.content_lay.setContentsMargins(12, 10, 22, 12)
        self.content_lay.setSpacing(6)
        self.content.setWidget(self.content_body)
        self.content_slider = FnSlider(self.content)
        l.addWidget(self.content, 1)
        self.rebuild_rail()
        self.rebuild_content()
        return w

    # ---- data from the site -> customers / channels / videos ----
    def load_overview(self):
        if not self.settings.get("token"):
            return
        try:
            d = api(self.settings, "GET", "?action=overview", timeout=90)
        except Exception as e:
            self.log("Could not load the customer list: %s" % e)
            return
        if d.get("error"):
            self.log("Could not load the customer list: %s" % d["error"])
            return
        self.overview = d
        self.ui(self.build_model)

    def reload_site(self, force=False, channel_id=None):
        """Ask the site to look for new videos (all channels or one), then reload."""
        self.stage("Asking the site for new videos...")
        try:
            body = {"action": "refresh", "force": bool(force)}
            if channel_id:
                body["channelId"] = channel_id
            r = api(self.settings, "POST", "", body, timeout=170)
            if r.get("error"):
                self.log("Refresh: %s" % r["error"])
            else:
                self.log("Refresh: %d new video(s) on %d channel(s)." % (r.get("queued", 0), r.get("channels", 0)))
        except Exception as e:
            self.log("Refresh failed: %s" % e)
        self.load_overview()
        self.stage("Ready", 1)

    def build_model(self):
        d = self.overview or {}
        chans = d.get("channels") or []
        self.vid_rows = {v["videoId"]: v for v in d.get("videos") or []}
        self.matches_by_vid = {}
        for m in d.get("matches") or []:
            self.matches_by_vid.setdefault(m["videoId"], []).append(m)
        groups = {}
        users = {u["id"]: u for u in d.get("users") or []}
        for u in users.values():
            groups.setdefault("user:" + u["id"], [])  # every customer, channels or not
        for name in d.get("customLists") or []:
            groups.setdefault("custom:" + name, [])  # a list can be empty
        for c in chans:
            key = ("custom:" + c["group"]) if c.get("group") else ("user:" + c["userId"])
            groups.setdefault(key, []).append(c)
        rank = {"active": 0, "paused": 1, "noplan": 2}

        def gname(key, lst):
            if key.startswith("custom:"):
                return key.split(":", 1)[1]
            u = users.get(key.split(":", 1)[1]) or {}
            return u.get("email") or (lst[0].get("email") if lst else "") or key

        out = []
        for i, (key, lst) in enumerate(sorted(groups.items(),
                                              key=lambda kv: (kv[0].startswith("custom"), gname(*kv).lower()))):
            kind = "custom" if key.startswith("custom:") else "user"
            uid = key.split(":", 1)[1] if kind == "user" else "custom"
            for c in lst:
                c["videos"] = [v for v in self.vid_rows.values() if v["channelId"] == c["id"]]
                c["videos"].sort(key=lambda v: v.get("publishedAt") or "", reverse=True)
            lst.sort(key=lambda c: (c.get("url") == "solo", rank.get(c["state"], 3)))
            plan = "custom" if kind == "custom" else ((users.get(uid) or {}).get("plan") or
                                                      (lst[0].get("plan") if lst else "free"))
            out.append({"key": key, "kind": kind, "name": gname(key, lst), "userId": uid, "plan": plan,
                        "registered": (users.get(uid) or {}).get("createdAt", "")[:10] if kind == "user" else "",
                        "color": PALETTE[i % len(PALETTE)], "channels": lst})
        self.cust = out
        if self.sel_key not in {c["key"] for c in out}:
            self.sel_key = out[0]["key"] if out else None
        self.rebuild_rail()
        self.rebuild_content()
        self.refresh_status()

    def cust_by_key(self, key):
        for c in self.cust:
            if c["key"] == key:
                return c
        return None

    def on_search(self, text):
        self.search_text = text.strip().lower()
        self.rebuild_rail()
        self.rebuild_content()

    def matches_text(self, q, c):
        if not q:
            return True
        parts = [c["name"]] + [ch.get("title") or "" for ch in c["channels"]] + \
                [v.get("title") or "" for ch in c["channels"] for v in ch["videos"]]
        return q in " ".join(parts).lower()

    # ---- left rail ----
    def rebuild_rail(self):
        while self.rail_lay.count():
            it = self.rail_lay.takeAt(0)
            w_ = it.widget()
            if w_ is not None:
                w_.setParent(None)
                w_.deleteLater()
        self.rail_items = {}
        q = self.search_text
        only = bool(self.settings.get("only_with_channels"))
        for kind, title in (("user", "Customers"), ("custom", "Custom")):
            lst = [c for c in self.cust if c["kind"] == kind and self.matches_text(q, c)
                   and not (only and kind == "user" and not [ch for ch in c["channels"] if ch.get("url") != "solo"])]
            head = QtWidgets.QWidget()
            hh = QtWidgets.QHBoxLayout(head)
            hh.setContentsMargins(10, 4, 20, 4)
            hh.setSpacing(8)
            open_attr = "_open_" + kind
            if not hasattr(self, open_attr):
                setattr(self, open_attr, True)
            chev = Chevron(getattr(self, open_attr), ACCENT if kind == "user" else TEXT_GRAY)
            chev.clicked.connect(lambda _, k=kind: (setattr(self, "_open_" + k, not getattr(self, "_open_" + k)),
                                                    self.rebuild_rail()))
            hh.addWidget(chev)
            t = QtWidgets.QLabel(title)
            t.setObjectName("grp")
            hh.addWidget(t)
            hh.addStretch(1)
            n = QtWidgets.QLabel(str(len(lst)))
            n.setObjectName("cnt")
            hh.addWidget(n)
            if kind == "custom":
                b = circle_button("plus", "Add a channel to a Custom list")
                b.clicked.connect(self.add_custom)
                hh.addWidget(b)
            r = circle_button("refresh", "Ask the site to look for new videos and reload the list")
            r.clicked.connect(lambda: self.bg(self.reload_site, True))
            hh.addWidget(r)
            self.rail_lay.addWidget(head)
            if getattr(self, open_attr):
                for c in lst:
                    it = RailItem(c["key"], c["color"], c["name"], len([ch for ch in c["channels"] if ch.get("url") != "solo"]))
                    it.clicked.connect(self.select_cust)
                    it.set_selected(c["key"] == self.sel_key)
                    self.rail_lay.addWidget(it)
                    self.rail_items[c["key"]] = it
            if kind == "user":
                self.rail_lay.addSpacing(6)
        self.rail_lay.addStretch(1)
        self.update_scan_marks()

    def select_cust(self, key):
        self.sel_key = key
        for k, it in self.rail_items.items():
            it.set_selected(k == key)
        self.rebuild_content()

    # ---- right side ----
    def rebuild_content(self):
        while self.content_lay.count():
            it = self.content_lay.takeAt(0)
            w_ = it.widget()
            if w_ is not None:
                w_.setParent(None)
                w_.deleteLater()
        self.chan_bars = {}
        self.vtables = {}
        self.vitems_site = {}
        c = self.cust_by_key(self.sel_key)
        if not c:
            e = label("No customers loaded yet.\n\nPress the round arrow next to Customers, "
                      "or enter the admin token in Settings.", "empty")
            e.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
            self.content_lay.addWidget(e, 1)
            return
        chans = [ch for ch in c["channels"] if ch.get("url") != "solo"]
        solo = [ch for ch in c["channels"] if ch.get("url") == "solo"]
        head = QtWidgets.QHBoxLayout()
        head.setSpacing(10)
        head.addWidget(label(c["name"], "h1"))
        plan = {"max": "MAX plan", "pro": "PRO plan", "custom": "Your own list"}.get(c["plan"], "No plan")
        info = "%s  \u00b7  %d channel%s" % (plan, len(chans), "" if len(chans) == 1 else "s")
        if c.get("registered"):
            info += "  \u00b7  registered %s" % c["registered"]
        head.addWidget(label(info, "warm"))
        head.addStretch(1)
        if c["kind"] == "custom":
            bl = AnimatedButton("+ Add channel or video")
            bl.clicked.connect(lambda: self.add_custom_link(c["name"]))
            head.addWidget(bl)
            br = AnimatedButton("Remove list", accent="#ff3c3c")
            br.clicked.connect(lambda: self.remove_custom_list(c["name"]))
            head.addWidget(br)
        self.new_lbl = label("", "muted")
        self.new_lbl.setWordWrap(False)
        head.addWidget(self.new_lbl)
        self.btn_sheets = AnimatedButton("Send to Sheets", accent=GREEN)
        self.btn_sheets.setToolTip("New matches go to each composer's Google Sheet")
        self.btn_sheets.clicked.connect(lambda: self.bg(self.send_sheets))
        head.addWidget(self.btn_sheets)
        self.update_new_count()
        hw = QtWidgets.QWidget()
        hw.setLayout(head)
        self.content_lay.addWidget(hw)

        tabs = QtWidgets.QHBoxLayout()
        tabs.setSpacing(16)
        for key, text, n in (("channels", "Channels", len(chans)),
                             ("solo", "Videos" if c["kind"] == "custom" else "Solo videos",
                              sum(len(ch["videos"]) for ch in solo))):
            tb = QtWidgets.QPushButton("%s  %d" % (text, n))
            tb.setObjectName("tab")
            tb.setCheckable(True)
            tb.setChecked(key == self.sel_tab)
            tb.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
            tb.clicked.connect(lambda _, k=key: (setattr(self, "sel_tab", k), self.rebuild_content()))
            tabs.addWidget(tb)
        tabs.addStretch(1)
        if self.sel_tab == "solo" and c["kind"] == "user":
            bs = AnimatedButton("+ Add solo video")
            bs.setFixedHeight(22)
            bs.clicked.connect(lambda: self.add_solo(c["userId"]))
            tabs.addWidget(bs, 0, QtCore.Qt.AlignmentFlag.AlignVCenter)
        tw = QtWidgets.QWidget()
        tw.setObjectName("tabsrow")
        tw.setLayout(tabs)
        tw.setStyleSheet("#tabsrow { border-bottom: 1px solid #3a4650; }")
        self.content_lay.addWidget(tw)

        lst = chans if self.sel_tab == "channels" else solo
        if not lst:
            if c["kind"] == "custom":
                e = label("Empty. Press + Add channel or video and paste a YouTube link.", "empty")
            else:
                e = label("No channels on this customer's whitelist." if self.sel_tab == "channels"
                          else "No solo videos. Press + Add solo video to add one.", "empty")
            e.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
            self.content_lay.addWidget(e)
        for ch in lst:
            if self.sel_tab == "solo":
                self.open_ch.add(ch["id"])
            bar = ChannelBar(ch, c["color"], ch["id"] in self.open_ch)
            bar.toggled.connect(self.toggle_channel)
            bar.scan.connect(self.scan_channel)
            bar.stop.connect(self.stop_channel)
            n_match = sum(1 for v in ch["videos"] if self.matches_by_vid.get(v["videoId"]))
            n_wait = sum(1 for v in ch["videos"] if self.claim_of(v["videoId"])[0] == "wait")
            bar.set_meta(len(ch["videos"]), n_match, n_wait)
            self.content_lay.addWidget(bar)
            self.chan_bars[ch["id"]] = bar
            if ch["id"] in self.open_ch:
                self.content_lay.addWidget(self.video_table(ch))
        self.content_lay.addStretch(1)
        self.update_scan_marks()

    def update_new_count(self):
        """'N new matches not in sheets' for the selected customer (site-wide count is on the site)."""
        c = self.cust_by_key(self.sel_key)
        if not c or not hasattr(self, "new_lbl"):
            return
        n_new = sum(1 for ch in c["channels"] for v in ch["videos"]
                    for m in self.matches_by_vid.get(v["videoId"], []) if m.get("state") == "new")
        self.new_lbl.setText("%d new match%s not in sheets" % (n_new, "" if n_new == 1 else "es"))
        self.btn_sheets.setEnabled(n_new > 0)

    def toggle_channel(self, chid, open_):
        if open_:
            self.open_ch.add(chid)
        else:
            self.open_ch.discard(chid)
        self.rebuild_content()

    def claim_of(self, vid):
        """(key, text, fg, bg) of the claim state of a video from the site's matches."""
        ms = self.matches_by_vid.get(vid) or []
        if not ms:
            return "none", "", TEXT_GRAY, BG_INPUT
        states = {m["state"] for m in ms}
        if "in_sheet" in states or "new" in states:
            return "wait", "waiting for release", "#ffb3b3", "#5a2d2d"
        if states == {"released"}:
            return "rel", "released", "#9fe3b0", "#2e4d35"
        if "not_eligible" in states:
            return "noplan", "no plan when published", "#f2c14e", "#5a4420"
        return "other", ", ".join(sorted(states)), TEXT_GRAY, BG_INPUT

    def video_state(self, vid):
        """none / queue / run / found / clean / err for a site video."""
        if vid == self.checking:
            return "run"
        if any(q[0] == vid for q in self.queue):
            return "queue"
        v = self.vid_rows.get(vid) or {}
        c = self.checks.get(vid)
        if v.get("status") == "done" or (c and not c.get("error")):
            found = self.matches_by_vid.get(vid) or (c or {}).get("rows")
            return "found" if found else "clean"
        if v.get("status") == "error" or (c and c.get("error")):
            return "err"
        return "none"

    def video_table(self, ch):
        wrap = QtWidgets.QFrame()
        wrap.setObjectName("vwrap")
        wl = QtWidgets.QVBoxLayout(wrap)
        wl.setContentsMargins(14, 2, 0, 6)
        t = QtWidgets.QTreeWidget()
        t.setObjectName("vtable")
        t.setHeaderLabels(["Videos", "Published", "Length", "Matches", "Checked", "Claim", ""])
        t.setRootIsDecorated(False)
        t.setIndentation(0)
        t.setItemDelegate(KeepColors(t))
        t.setSelectionMode(QtWidgets.QAbstractItemView.SelectionMode.NoSelection)
        t.setVerticalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        t.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        t.itemDoubleClicked.connect(lambda it, _c: it.data(0, 256) and QtGui.QDesktopServices.openUrl(
            QtCore.QUrl("https://www.youtube.com/watch?v=" + it.data(0, 256))))
        t.setSizeAdjustPolicy(QtWidgets.QAbstractScrollArea.SizeAdjustPolicy.AdjustToContents)
        hd = t.header()
        hd.setStretchLastSection(False)
        hd.setSectionResizeMode(0, QtWidgets.QHeaderView.ResizeMode.Stretch)
        for i, wdt in enumerate([0, 100, 60, 70, 110, 150, 64]):
            if i:
                t.setColumnWidth(i, wdt)
        t.itemClicked.connect(lambda it, col, tt=t: self.on_video_click(tt, it, col))
        t.setContextMenuPolicy(QtCore.Qt.ContextMenuPolicy.CustomContextMenu)
        t.customContextMenuRequested.connect(lambda pos, tt=t: self.video_menu(tt, pos))
        self.vtables[ch["id"]] = t
        for v in ch["videos"]:
            vid = v["videoId"]
            it = QtWidgets.QTreeWidgetItem(["", "", "", "", "", "", ""])
            it.setSizeHint(0, QtCore.QSize(0, 30))
            it.setData(0, 256, vid)
            it.setText(0, "  " + (v.get("title") or vid))
            it.setToolTip(0, "%s\nDouble-click: open on YouTube" % (v.get("title") or vid))
            it.setText(1, (v.get("publishedAt") or "")[:10])
            it.setTextAlignment(2, QtCore.Qt.AlignmentFlag.AlignRight | QtCore.Qt.AlignmentFlag.AlignVCenter)
            it.setForeground(1, QtGui.QBrush(QtGui.QColor(TEXT_GRAY)))
            it.setForeground(2, QtGui.QBrush(QtGui.QColor(TEXT_GRAY)))
            t.addTopLevelItem(it)
            b = QtWidgets.QPushButton("Scan")
            b.setObjectName("small")
            b.setFixedWidth(50)
            b.clicked.connect(lambda _, x=vid, c=ch["id"]: self.scan_video(x, c))
            t.setItemWidget(it, 6, b)
            self.vitems_site[vid] = (t, it)
            self.fill_video_item(vid)
            if vid in self.open_vid:
                self.add_wave_row(t, it, vid)
        t.setFixedHeight(self.table_height(t))
        wl.addWidget(t)
        return wrap

    def table_height(self, t):
        h = t.header().sizeHint().height() + 6
        for i in range(t.topLevelItemCount()):
            it = t.topLevelItem(i)
            h += it.sizeHint(0).height() or 30
            for j in range(it.childCount()):
                h += it.child(j).sizeHint(0).height() or 100
        return h

    def fill_video_item(self, vid):
        pair = self.vitems_site.get(vid)
        if not pair:
            return
        t, it = pair
        v = self.vid_rows.get(vid) or {}
        c = self.checks.get(vid) or {}
        key = self.video_state(vid)
        it.setIcon(0, self.dot_icon(key))
        it.setForeground(0, QtGui.QBrush(QtGui.QColor(TEXT_TILE)))
        it.setText(2, fmt(c["dur"]) if c.get("dur") else "")
        ms = self.matches_by_vid.get(vid) or []
        n = len({m["track"] for m in ms}) if ms else len(c.get("rows") or [])
        if key in ("found", "clean"):
            it.setText(3, str(n))
            it.setForeground(3, QtGui.QBrush(QtGui.QColor(RED if n else TEXT_GRAY)))
            when = (c.get("at") or (v.get("scannedAt") or "").replace("T", " ")[:16])
            it.setText(4, when)
            it.setForeground(4, QtGui.QBrush(QtGui.QColor(TEXT_GRAY)))
        else:
            it.setText(3, "-")
            it.setForeground(3, QtGui.QBrush(QtGui.QColor(TEXT_GRAY)))
            it.setText(4, {"run": "scanning %d%%" % self.check_pct, "queue": "in queue", "err": "error",
                           "none": "not scanned"}[key])
            it.setForeground(4, QtGui.QBrush(QtGui.QColor(ACCENT if key == "run" else TEXT_GRAY)))
        f = it.font(4)
        f.setBold(key == "run")
        it.setFont(4, f)
        ck, ct, cfg, cbg = self.claim_of(vid)
        it.setText(5, ct)
        it.setForeground(5, QtGui.QBrush(QtGui.QColor(cfg)))
        b = t.itemWidget(it, 6)
        if b is not None:
            b.setText("Stop" if key in ("run", "queue") else "Scan")
            b.setObjectName("stop" if key in ("run", "queue") else "small")
            b.style().unpolish(b)
            b.style().polish(b)

    def on_video_click(self, t, it, col):
        vid = it.data(0, 256)
        if not vid:
            return
        if vid in self.open_vid:
            self.open_vid.discard(vid)
            it.takeChildren()
        else:
            self.open_vid.add(vid)
            self.add_wave_row(t, it, vid)
        t.setFixedHeight(self.table_height(t))

    def video_menu(self, t, pos):
        it = t.itemAt(pos)
        vid = it.data(0, 256) if it else None
        if not vid:
            return
        v = self.vid_rows.get(vid) or {}
        m = QtWidgets.QMenu(self)
        m.addAction("Open on YouTube", lambda: QtGui.QDesktopServices.openUrl(
            QtCore.QUrl("https://www.youtube.com/watch?v=" + vid)))
        m.addAction("Copy video link", lambda: QtWidgets.QApplication.clipboard().setText(
            "https://www.youtube.com/watch?v=" + vid))
        if self.matches_by_vid.get(vid):
            m.addSeparator()
            m.addAction("Remove match from the site and the composer's sheet", lambda: self.remove_match(vid))
        if v.get("note") == "solo" or str(v.get("channelId", "")).startswith(("wch_solo_", "wch_csolo_")):
            m.addSeparator()
            m.addAction("Remove this solo video", lambda: self.remove_solo(vid))
        m.exec(t.viewport().mapToGlobal(pos))

    def remove_match(self, vid):
        title = (self.vid_rows.get(vid) or {}).get("title") or vid
        if not ask_yes(self, "Remove match", "Remove the match of \"%s\" from the site and delete its row from "
                       "the composer's sheet? The video stays, the track just will not be counted as found." % title,
                       "Remove"):
            return

        def go():
            try:
                r = api(self.settings, "POST", "", {"action": "match_remove", "videoId": vid}, timeout=120)
                self.log("Remove match: %s" % (r.get("error") or "%d removed, %d sheet row(s)"
                                                % (r.get("removed", 0), r.get("sheetRows", 0))))
            except Exception as e:
                self.log("Remove match failed: %s" % e)
            self.load_overview()
        self.bg(go)

    def remove_solo(self, vid):
        title = (self.vid_rows.get(vid) or {}).get("title") or vid
        if not ask_yes(self, "Remove solo video", "Remove \"%s\" from this customer's solo videos?" % title, "Remove"):
            return

        def go():
            try:
                r = api(self.settings, "POST", "", {"action": "solo_remove", "videoId": vid}, timeout=60)
                self.log("Remove solo: %s" % (r.get("error") or "ok"))
            except Exception as e:
                self.log("Remove solo failed: %s" % e)
            self.load_overview()
        self.bg(go)

    def add_wave_row(self, t, it, vid):
        it.takeChildren()
        child = QtWidgets.QTreeWidgetItem([""])
        child.setFlags(QtCore.Qt.ItemFlag.ItemIsEnabled)
        it.addChild(child)
        child.setFirstColumnSpanned(True)
        it.setExpanded(True)
        c = self.checks.get(vid)
        w = QtWidgets.QWidget()
        wl = QtWidgets.QVBoxLayout(w)
        wl.setContentsMargins(26, 6, 10, 8)
        wl.setSpacing(5)
        if c and not c.get("error") and "env" in c:
            head = QtWidgets.QHBoxLayout()
            head.setSpacing(12)
            head.addWidget(label("Video audio", "title"))
            head.addWidget(label(fmt(c["dur"]), "muted"))
            rows = c.get("rows") or []
            zones, legend = [], {}
            for i, r in enumerate(rows):
                col = PALETTE[i % len(PALETTE)]
                legend[r["title"]] = (col, r.get("composer", ""))
                for a, b in r["regions"]:
                    zones.append((a / max(c["dur"], 0.1), b / max(c["dur"], 0.1), col, r["title"]))
            for title, (col, comp) in legend.items():
                lg = QtWidgets.QHBoxLayout()
                lg.setSpacing(5)
                lg.addWidget(Square(col))
                lg_t = QtWidgets.QLabel("%s (%s)" % (title, comp))
                lg_t.setObjectName("muted")
                lg.addWidget(lg_t)
                head.addLayout(lg)
            head.addStretch(1)
            hint = QtWidgets.QLabel("click = listen from here, wheel = zoom, drag = move, double-click = whole audio")
            hint.setObjectName("muted")
            head.addWidget(hint)
            stop = QtWidgets.QPushButton("Stop sound")
            stop.setObjectName("small")
            stop.clicked.connect(self.stop_play)
            head.addWidget(stop)
            wl.addLayout(head)
            wave = Wave(72)
            wave.set(np.array(c["env"], np.float32), [], c["dur"], key=vid, zones=zones)
            wave.clicked.connect(lambda f, v=vid, wv=wave: self.play_site(v, f, wv))
            wl.addWidget(wave)
        else:
            e = label("Not scanned yet" if not (c and c.get("error")) else "The check failed: %s" % c["error"], "empty")
            e.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
            e.setFixedHeight(60)
            e.setStyleSheet("background:#1c2429;border:1px solid %s;border-radius:5px;color:#6b7783" % BORDER_DARK)
            wl.addWidget(e)
        t.setItemWidget(child, 0, w)
        child.setSizeHint(0, QtCore.QSize(10, w.sizeHint().height() + 4))

    def play_site(self, vid, frac, wave):
        c = self.checks.get(vid)
        if not c:
            return
        path = c.get("audio")
        if not path or not os.path.isfile(path):
            self.log("The audio of this video is not on disk any more. Scan it again to listen.")
            return
        threading.Thread(target=self._play, args=(wave, path, frac * c["dur"], c["dur"]), daemon=True).start()

    # ---- scanning from the Scanner page ----
    def enqueue_site(self, vids, chid):
        """Put site videos into the check queue (results go back to the site)."""
        if self.base.ht is None:
            say(self, "Track base not ready", "The track base is empty, so there is nothing to search for yet.")
            return 0
        novoice = bool(self.settings["novoice"])
        added = []
        for vid in vids:
            if vid == self.checking or any(q[0] == vid for q in self.queue):
                continue
            with self.qlock:
                self.queue.append((vid, novoice, True))
            self.job_src[vid] = chid
            added.append(vid)
        if added:
            self.channel_total[chid] = self.channel_total.get(chid, 0) + len(added)
            self.bg(lambda: api(self.settings, "POST", "", {"action": "lease", "videoIds": added}, timeout=60))
        with self.qlock:
            start = added and not self.loop_on
            if start:
                self.loop_on = True
        if start:
            self.cancel = False
            self.btn_stop.setVisible(True)
            self.bg(self._check_loop)
        self.update_scan_marks()
        return len(added)

    def scan_video(self, vid, chid):
        key = self.video_state(vid)
        if key in ("run", "queue"):
            self.drop_jobs([vid])
            return
        self.enqueue_site([vid], chid)

    def scan_channel(self, chid):
        ch = self.find_channel(chid)
        if not ch:
            return
        todo = [v["videoId"] for v in ch["videos"] if self.video_state(v["videoId"]) in ("none", "err")]
        if not todo:
            if not ask_yes(self, "Scan again", "All %d videos of \"%s\" are scanned. Scan them all again?"
                           % (len(ch["videos"]), ch.get("title") or "this channel"), "Scan again"):
                return
            todo = [v["videoId"] for v in ch["videos"]]
        self.channel_total[chid] = 0
        self.enqueue_site(todo, chid)

    def stop_channel(self, chid):
        self.drop_jobs([vid for vid, c in self.job_src.items() if c == chid])

    def drop_jobs(self, vids):
        vids = set(vids)
        with self.qlock:
            self.queue[:] = [q for q in self.queue if q[0] not in vids]
        if self.checking in vids:
            self.cancel = True
            self.stage("Stopping...", None)
        for v in vids:
            self.job_src.pop(v, None)
        self.update_scan_marks()

    def find_channel(self, chid):
        for c in self.cust:
            for ch in c["channels"]:
                if ch["id"] == chid:
                    return ch
        return None

    def update_scan_marks(self):
        """Dots and counters for whatever is being scanned now (cheap, no rebuild)."""
        if not hasattr(self, "chan_bars"):
            return
        active = {}
        for vid, chid in self.job_src.items():
            if vid == self.checking or any(q[0] == vid for q in self.queue):
                active.setdefault(chid, 0)
                active[chid] += 1
        for chid, bar in self.chan_bars.items():
            if chid in active:
                total = max(self.channel_total.get(chid, 0), active[chid])
                bar.set_progress((total - active[chid], total))
            else:
                bar.set_progress(None)
                self.channel_total.pop(chid, None)
        for key, it in self.rail_items.items():
            c = self.cust_by_key(key)
            on = bool(c) and any(ch["id"] in active for ch in c["channels"])
            it.dot.set(ACCENT if on else None)
        for vid in list(self.vitems_site):
            self.fill_video_item(vid)
        left = len(self.queue) + (1 if self.checking else 0)
        total = len(self.job_src) if self.running else 0
        if self.running:
            self.smart_dot.set(ACCENT)
            self.smart_cnt.setText("%d left" % left if left else "waiting")
            self.smart_bar.setVisible(True)
            self.smart_bar.setValue(int(1000 * (1 - left / max(1, total))) if total else 1000)
            cur = self.find_channel(self.job_src.get(self.checking, "")) if self.checking else None
            self.smart_sub.setText(("Checking: %s" % (self.vid_rows.get(self.checking, {}).get("title") or self.checking)
                                    + (" (%s)" % cur.get("title") if cur else "")) if self.checking
                                   else "Nothing to scan. Looks for new videos every %d min." % self.settings["interval_min"])
        else:
            self.smart_dot.set(None)
            self.smart_cnt.setText("")
            self.smart_bar.setVisible(False)
            if left:
                self.smart_sub.setText("Scanning %d video(s) by hand." % left)
            else:
                self.smart_sub.setText("Off. Scans every unscanned video of every active channel, then waits for new ones.")

    def site_done(self, vid, rows, error=None):
        """A site video was checked on this computer: update the model and the row."""
        v = self.vid_rows.get(vid)
        if v is not None:
            v["status"] = "error" if error else "done"
            v["scannedAt"] = time.strftime("%Y-%m-%dT%H:%M")
            v["found"] = len(rows)
        if rows:
            self.matches_by_vid[vid] = [{"videoId": vid, "track": r["title"], "state": "new"} for r in rows]
        else:
            self.matches_by_vid.pop(vid, None)
        self.job_src.pop(vid, None)
        self.fill_video_item(vid)
        chid = (v or {}).get("channelId")
        bar = self.chan_bars.get(chid)
        ch = self.find_channel(chid) if chid else None
        if bar and ch:
            n_match = sum(1 for x in ch["videos"] if self.matches_by_vid.get(x["videoId"]))
            n_wait = sum(1 for x in ch["videos"] if self.claim_of(x["videoId"])[0] == "wait")
            bar.set_meta(len(ch["videos"]), n_match, n_wait)
        if vid in self.open_vid and vid in self.vitems_site:
            t, it = self.vitems_site[vid]
            self.add_wave_row(t, it, vid)
            t.setFixedHeight(self.table_height(t))
        self.update_new_count()
        self.update_scan_marks()

    def site_stopped(self, vid):
        self.job_src.pop(vid, None)
        self.fill_video_item(vid)
        self.update_scan_marks()

    def send_sheets(self):
        self.stage("Sending new matches to the composers' sheets...")
        try:
            r = api(self.settings, "POST", "", {"action": "sheets_update"}, timeout=170)
            if r.get("error"):
                self.log("Sheets: %s" % r["error"])
                self.stage("Sheets: %s" % r["error"], 0)
            else:
                self.log("Sheets updated: %s" % {k: v for k, v in r.items() if k != "ok"})
                self.stage("Sent to the sheets", 1)
        except Exception as e:
            self.log("Sheets failed: %s" % e)
            self.stage("Sheets failed", 0)
        self.load_overview()

    def add_custom(self):
        group = ask_text(self, "New list", "List name, for example Pixabay",
                         "Your own list of channels and videos to watch, outside the customers' whitelists. "
                         "Add links to it after it is created.")
        if not group:
            return

        def go():
            r = api(self.settings, "POST", "", {"action": "custom_list_add", "name": group.strip()}, timeout=60)
            self.log("New list: %s" % (r.get("error") or ("created " + (r.get("name") or group))))
            self.sel_key = "custom:" + (r.get("name") or group.strip())
            self.load_overview()
        self.bg(go)

    def add_custom_link(self, group):
        url = ask_text(self, "Add to " + group, "YouTube channel or video link",
                       "A channel link adds the channel (new videos are checked from today). "
                       "A video link adds just that video.")
        if not url:
            return

        def go():
            r = api(self.settings, "POST", "", {"action": "custom_link", "group": group, "url": url.strip()},
                    timeout=90)
            self.log("Add to %s: %s" % (group, r.get("error") or ("added " + (r.get("title") or url))))
            self.load_overview()
        self.bg(go)

    def remove_custom_list(self, group):
        if not ask_yes(self, "Remove list", "Remove the list \"%s\" with its channels and videos? "
                       "Videos found so far stay in the sheets." % group, "Remove"):
            return

        def go():
            r = api(self.settings, "POST", "", {"action": "custom_list_remove", "name": group}, timeout=90)
            self.log("Remove list %s: %s" % (group, r.get("error") or "ok"))
            self.load_overview()
        self.bg(go)

    def add_solo(self, user_id):
        url = ask_text(self, "Solo video", "YouTube video link",
                       "A single video of this customer, without a channel. It goes into the queue.")
        if not url:
            return
        m = re.search(r"(?:v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{11})", url.strip())
        if not m:
            say(self, "Solo video", "That does not look like a YouTube video link.")
            return

        def go():
            r = api(self.settings, "POST", "", {"action": "solo_add", "userId": user_id, "videoId": m.group(1)},
                    timeout=90)
            self.log("Solo add: %s" % (r.get("error") or ("added " + (r.get("title") or m.group(1)))))
            self.load_overview()
        self.bg(go)

    def refresh_status(self):
        on = self.running
        self.btn_run.setText("Stop Smart Scan" if on else "Start Smart Scan")
        self.btn_run.setObjectName("stop" if on else "scan")
        self.btn_run.style().unpolish(self.btn_run)
        self.btn_run.style().polish(self.btn_run)
        self.hdr_sub.setText("%s  -  base: %d tracks" % (self.settings["site"].replace("https://", ""),
                                                         len(self.base.meta)))
        n_local = sum(1 for m in self.base.meta.values() if m.get("source") == "local")
        self.base_site_val.setText(str(len(self.base.meta) - n_local))
        self.base_local_val.setText(str(n_local))
        self.update_scan_marks()

    # ---- Smart Scan: look for new videos, scan everything unscanned, repeat ----
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
            self.drop_jobs([vid for vid in self.job_src])
        self.refresh_status()

    def tick(self):
        if self.busy or not self.running:
            return
        self.busy = True
        self.bg(self._cycle)

    def _cycle(self):
        try:
            n_new = self.base.update(self.settings, self.log, self.stage)
            if n_new:
                self.log("%d new track(s) added to the base." % n_new)
                self.recheck_fresh()
            self.reload_site(False)
            time.sleep(0.5)  # let the model rebuild on the UI thread

            def go():
                if not self.running:
                    return
                todo = []
                for c in self.cust:
                    for ch in c["channels"]:
                        if ch.get("state") == "paused":
                            continue
                        for v in ch["videos"]:
                            if self.video_state(v["videoId"]) in ("none",):
                                todo.append((v["videoId"], ch["id"]))
                for vid, chid in todo:
                    self.enqueue_site([vid], chid)
                self.log("Smart Scan: %d video(s) to check." % len(todo))
                self.update_scan_marks()
            self.ui(go)
        finally:
            self.busy = False

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

    # ---- Check a video page --------------------------------------------------
    # Left: the channel's videos (as many as you like, Ctrl/Shift to pick
    # several). Each row shows its state: grey = not checked, gold = checking,
    # green = clean, red = our music found. Right: the HIGHLIGHTED video -
    # tracks found, both waveforms, click to listen. Results are kept in
    # data/checks.json, so a channel loaded again shows what was checked.
    def page_check(self):
        w = QtWidgets.QWidget()
        l = QtWidgets.QVBoxLayout(w)
        l.setContentsMargins(12, 10, 12, 12)
        l.setSpacing(12)

        split = QtWidgets.QSplitter(QtCore.Qt.Orientation.Horizontal)
        split.setHandleWidth(10)
        split.setChildrenCollapsible(False)

        # -- left: link, filters, the channel's videos, actions --
        left = QtWidgets.QFrame()
        left.setObjectName("pane")
        ll = QtWidgets.QVBoxLayout(left)
        ll.setContentsMargins(12, 12, 12, 12)
        ll.setSpacing(8)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(6)
        self.url = QtWidgets.QLineEdit()
        self.url.setPlaceholderText("Paste a YouTube channel or video link")
        self.url.returnPressed.connect(self.load_videos)
        b = QtWidgets.QPushButton("Load")
        b.clicked.connect(self.load_videos)
        row.addWidget(self.url, 1)
        row.addWidget(b)
        ll.addLayout(row)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(6)
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
        self.vlist.setColumnWidth(1, 60)
        self.vlist.setColumnWidth(2, 118)
        self.vlist.currentItemChanged.connect(lambda cur, _p: self.show_video(cur.data(0, 256) if cur else None))
        self.vlist.itemSelectionChanged.connect(self.update_check_btn)
        self.vlist.itemDoubleClicked.connect(lambda *_: self.check_selected())
        ll.addWidget(self.vlist, 1)
        self.vcount = label("Paste a link above. Pick several videos with Ctrl or Shift.", "muted")
        ll.addWidget(self.vcount)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
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
        rl.setContentsMargins(16, 14, 16, 14)
        rl.setSpacing(10)
        head = QtWidgets.QHBoxLayout()
        head.setSpacing(10)
        col = QtWidgets.QVBoxLayout()
        col.setSpacing(4)
        self.d_title = label("No video selected", "h2")
        self.d_sub = label("", "muted")
        col.addWidget(self.d_title)
        col.addWidget(self.d_sub)
        head.addLayout(col, 1)
        self.btn_open = QtWidgets.QPushButton("Open on YouTube")
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

        # found tracks
        self.res = QtWidgets.QTreeWidget()
        self.res.setHeaderLabels(["Track", "Composer", "Where in video", "Plays", "Verdict", "Site"])
        self.res.setRootIsDecorated(False)
        rh = self.res.header()
        rh.setStretchLastSection(False)
        rh.setSectionResizeMode(2, QtWidgets.QHeaderView.ResizeMode.Stretch)
        self.res.setColumnWidth(0, 150)
        self.res.setColumnWidth(1, 100)
        self.res.setColumnWidth(3, 56)
        self.res.setColumnWidth(4, 80)
        self.res.setColumnWidth(5, 110)
        self.res.itemClicked.connect(self.open_site_cell)
        self.res.setMouseTracking(True)
        self.res.setMaximumHeight(150)
        self.res.setItemDelegate(KeepColors(self.res))
        self.res.itemSelectionChanged.connect(self.draw)
        pl.addWidget(self.res)
        self.clean_lbl = label("None of our tracks found in this video.", "sub")
        self.clean_lbl.setStyleSheet("color:%s;font-size:13px;font-weight:600" % GREEN)
        pl.addWidget(self.clean_lbl)

        # waveforms with transport
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
        self.video_lbl = label("VIDEO AUDIO", "lbl")
        row.addWidget(self.video_lbl, 1)
        b_match = QtWidgets.QPushButton("Play match")
        b_match.setObjectName("small")
        b_match.setToolTip("Listen to the video from the start of the selected match")
        b_match.clicked.connect(self.play_match)
        row.addWidget(b_match)
        stop = QtWidgets.QPushButton("Stop sound")
        stop.setObjectName("small")
        stop.clicked.connect(self.stop_play)
        row.addWidget(stop)
        pl.addLayout(row)
        self.w_video = Wave()
        self.w_video.clicked.connect(lambda f: self.click_play("video", f))
        pl.addWidget(self.w_video)
        self.track_lbl = label("TRACK", "lbl")
        pl.addWidget(self.track_lbl)
        self.w_track = Wave()
        self.w_track.clicked.connect(lambda f: self.click_play("track", f))
        pl.addWidget(self.w_track)
        self.hint_lbl = label(HINT_FOUND, "muted")
        pl.addWidget(self.hint_lbl)

        # why + matching settings
        self.tabs = QtWidgets.QTabWidget()
        why_page = QtWidgets.QWidget()
        wl = QtWidgets.QVBoxLayout(why_page)
        wl.setContentsMargins(12, 10, 12, 10)
        self.why_lbl = label("", "why")
        self.why_lbl.setTextFormat(QtCore.Qt.TextFormat.RichText)
        self.why_lbl.setAlignment(QtCore.Qt.AlignmentFlag.AlignTop)
        wl.addWidget(self.why_lbl)
        wl.addStretch(1)
        self.tabs.addTab(why_page, "Why it was found")
        self.tabs.addTab(self.match_box(), "Matching settings")
        pl.addWidget(self.tabs, 1)

        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(res_page)
        self.d_stack.addWidget(scroll)
        rl.addWidget(self.d_stack, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 4)
        split.setStretchFactor(1, 7)
        split.setSizes([400, 760])
        l.addWidget(split, 1)
        self.show_video(None)
        self.update_check_btn()
        return w

    def play_match(self):
        """Listen to the video from where the selected match starts."""
        c = self.cur_check()
        row = self.sel_row()
        if not c or not row or not row.get("regions"):
            return
        self.click_play("video", row["regions"][0][0] / max(c["dur"], 0.1))

    def match_box(self):
        box = QtWidgets.QWidget()
        g = QtWidgets.QGridLayout(box)
        g.setContentsMargins(14, 12, 14, 12)
        g.setHorizontalSpacing(14)
        g.setVerticalSpacing(4)
        spec = [
            ("min_len", "Min. length, s", 0.0, 120.0, 0.5, 1,
             "How many seconds in a row the track must match. More = fewer false finds."),
            ("min_score", "Min. confidence", 1, 2000, 5, 0,
             "How many fingerprint points must match in the best chunk. More = stricter."),
            ("min_windows", "Chunks in a row", 1, 50, 1, 0,
             "Chunks of 8 s (every 2 s) that matched one place of the track. More = stricter."),
            ("strong", "Strong confidence", 1, 5000, 10, 0,
             "With this confidence one chunk is enough (min. length is still needed)."),
            ("align", "Precision, s", 0.1, 5.0, 0.1, 1,
             "How evenly the chunks must follow the track. Less = stricter."),
            ("noise_ratio", "Stronger than noise, x", 1.0, 20.0, 0.5, 1,
             "How many times a find must beat the random noise of this video. More = stricter."),
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
            lb.setStyleSheet("color:#aab3c2;font-size:12px;font-weight:600")
            r0, col = (i // 3) * 3, i % 3  # two rows of three
            g.addWidget(lb, r0, col)
            g.addWidget(sb, r0 + 1, col)
            hl = label(tip, "help")
            hl.setMinimumHeight(44)  # wrapped labels get squeezed in a grid otherwise
            g.addWidget(hl, r0 + 2, col, QtCore.Qt.AlignmentFlag.AlignTop)
            self.mspins[k] = sb
        self.cb_pitch = QtWidgets.QCheckBox("Also search in a shifted key (+-1 and +-2 semitones)")
        self.cb_pitch.setChecked(bool(MATCH.get("pitch")))
        self.cb_pitch.toggled.connect(lambda *_: self.match_note_update())
        g.addItem(QtWidgets.QSpacerItem(0, 6), 6, 0)
        g.addWidget(self.cb_pitch, 7, 0, 1, 3)
        g.addWidget(label("Finds tracks whose pitch was shifted in the video (a way around Content ID). "
                          "The check takes a bit longer.", "help"), 8, 0, 1, 3)
        row = QtWidgets.QHBoxLayout()
        self.match_note = label("", "muted")
        row.addWidget(self.match_note, 1)
        b_reset = QtWidgets.QPushButton("Reset")
        b_reset.setObjectName("ghost")
        b_reset.clicked.connect(self.match_reset)
        b_save = QtWidgets.QPushButton("Save")
        b_save.setObjectName("ghost")
        b_save.clicked.connect(self.match_save)
        b_apply = QtWidgets.QPushButton("Recheck this video")
        b_apply.setObjectName("gold")
        b_apply.clicked.connect(self.rematch)
        row.addWidget(b_reset)
        row.addWidget(b_save)
        row.addWidget(b_apply)
        g.addItem(QtWidgets.QSpacerItem(0, 6), 9, 0)
        g.addLayout(row, 10, 0, 1, 3)
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
        self.match_note.setText("Settings saved" if same else "Not saved: press Save to keep them")

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
                self.queue.append((vid, novoice, False))
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
                    vid, novoice, post = self.queue.pop(0)
                self.checking, self.check_pct = vid, 0
                self.ui(lambda v=vid: (self.refresh_item(v), self.show_if_current(v), self.update_scan_marks()))
                v = self.vmeta.get(vid) or {"id": vid, "title": (self.vid_rows.get(vid) or {}).get("title") or vid,
                                            "dur": 0}
                t0 = time.time()

                def prog(text, frac, title=v["title"], v_id=vid):
                    if self.cancel:
                        raise Cancelled()
                    self.stage("%s  -  %s" % (title[:50], text), frac)
                    if frac is not None:
                        pct = int(100 * frac)
                        if pct != self.check_pct:
                            self.check_pct = pct
                            self.ui(lambda: (self.refresh_item(v_id), self.fill_video_item(v_id)))
                rows, err = [], None
                try:
                    audio = download_audio(vid, prog)
                    dbg = []
                    keep = {}
                    samples, rows = find_in_audio(self.base, audio, novoice, prog, dbg, keep)
                    self.hcache[vid] = keep
                    write_check_log(self.base, vid, ("[site] " if post else "") + v["title"], novoice, rows, dbg,
                                    time.time() - t0)
                    env = envelope(samples, 6000)
                    self.checks[vid] = {"title": v["title"], "dur": len(samples) / fp.SR, "rows": rows,
                                        "env": [round(float(x), 4) for x in env], "audio": audio,
                                        "novoice": novoice, "at": time.strftime("%Y-%m-%d %H:%M"),
                                        "near": near_list(self.base, dbg)}
                    if post:
                        save_print(vid, samples, (self.vid_rows.get(vid) or {}).get("publishedAt", ""))
                    self.log("%s: %s  [%.0f s]" % (v["title"], ", ".join(r["title"] for r in rows) or "clean",
                                                   time.time() - t0))
                except Cancelled:
                    self.log("%s: stopped" % v["title"])
                    err = "stopped"
                except Exception as e:
                    if self.cancel:
                        self.log("%s: stopped" % v["title"])
                        err = "stopped"
                    else:
                        msg = str(e).splitlines()[0] if str(e) else repr(e)
                        msg = msg.replace("ERROR: ", "").split("; please report")[0][:220]
                        self.checks[vid] = {"title": v["title"], "error": msg, "at": time.strftime("%Y-%m-%d %H:%M")}
                        self.log("%s: FAILED %s" % (v["title"], msg))
                        err = msg
                if post and err != "stopped":
                    try:
                        if err:
                            api(self.settings, "POST", "", {"action": "result", "videoId": vid, "error": err})
                        else:
                            api(self.settings, "POST", "", {"action": "result", "videoId": vid,
                                                            "matches": [match_payload(self.base, r) for r in rows]})
                    except Exception as e:
                        self.log("Could not send the result to the site: %s" % e)
                elif post and err == "stopped":
                    try:
                        api(self.settings, "POST", "", {"action": "requeue", "videoId": vid})
                    except Exception:
                        pass
                try:
                    save_checks(self.checks)
                except Exception as e:
                    self.log("Could not save results: %s" % e)
                self.checking = None
                if self.cancel:
                    self.cancel = False
                if post:
                    self.ui(lambda v=vid, r=rows, e=err: self.site_stopped(v) if e == "stopped" else self.site_done(v, r, e))
                self.ui(lambda v=vid: (self.refresh_item(v), self.show_if_current(v), self.update_counts(),
                                       self.apply_filter(), self.update_scan_marks()))
            self.stage("Ready", 1)
        finally:
            self.checking = None
            self.loop_on = False
            self.cancel = False
            self.ui(lambda: (self.btn_stop.setVisible(False), self.update_scan_marks()))

    def stop_checking(self):
        with self.qlock:
            dropped = [q[0] for q in self.queue]
            self.queue.clear()
            self.cancel = True
        for v in dropped:
            self.job_src.pop(v, None)
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
            cnt = [(st.count("site"), "on site", GREEN), (st.count("local") + st.count("gone"), "not uploaded", RED),
                   (st.count("dup"), "duplicate", GOLD)]
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
            title = r["title"] + ("  (pitch %+d)" % r["pitch"] if r.get("pitch") else "")
            it = QtWidgets.QTreeWidgetItem([title, r["composer"],
                                            ", ".join("%s-%s" % (fmt(a), fmt(b)) for a, b in r["regions"]),
                                            fmt(r["total"]), reliability(c, r)[0]])
            it.setForeground(4, QtGui.QBrush(QtGui.QColor(reliability(c, r)[1])))
            st, url = self.base.site_state(r["track"])
            it.setText(5, site_look(st)[0])
            it.setData(5, 256, url)
            if url:
                it.setToolTip(5, "Open the track on the site: " + url)
            f5 = it.font(5)
            f5.setBold(True)
            it.setFont(5, f5)
            it.setForeground(0, QtGui.QBrush(QtGui.QColor(ORANGE if rej else RED)))
            it.setForeground(5, QtGui.QBrush(QtGui.QColor(site_look(self.base.site_state(r["track"])[0])[1])))
            if rej:
                for col in range(1, 5):
                    it.setForeground(col, QtGui.QBrush(QtGui.QColor("#9a9a9a")))
                it.setToolTip(0, "Not counted: " + verdict_text(r["rejected"]))
            self.res.addTopLevelItem(it)
        view = self.view_rows
        self.res.setVisible(bool(view))
        self.res.setFixedHeight(min(220, 34 + 32 * max(1, len(view))))
        self.clean_lbl.setVisible(not rows)
        self.clean_lbl.setText("None of our tracks found." + (
            " The table shows the closest similar parts (orange) that the program rejected: listen and judge."
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
        self.video_lbl.setText("VIDEO AUDIO")
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
        self.track_lbl.setText("TRACK  -  %s" % row["title"].upper())

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
        l.setContentsMargins(12, 10, 12, 12)
        l.setSpacing(12)
        l.addWidget(label("Settings", "h1"))
        grid = QtWidgets.QGridLayout()
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(12)

        # site connection
        c1, g1 = self.section("Site connection")
        self.e_site = QtWidgets.QLineEdit(self.settings["site"])
        self.e_token = QtWidgets.QLineEdit(self.settings["token"])
        self.e_token.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)
        self.e_token.setPlaceholderText("ADMIN_API_TOKEN from Cloudflare")
        self.form_row(g1, 1, "Site", self.e_site)
        self.form_row(g1, 2, "Admin token", self.e_token)
        grid.addWidget(c1, 0, 0)

        # automatic scanning
        c2, g2 = self.section("Automatic scanning")
        self.s_interval = QtWidgets.QSpinBox()
        self.s_interval.setRange(1, 120)
        self.s_interval.setValue(int(self.settings["interval_min"]))
        self.s_interval.setSuffix(" min")
        self.cb_novoice_auto = QtWidgets.QCheckBox("Remove voice in automatic scanning")
        self.cb_novoice_auto.setChecked(bool(self.settings["novoice"]))
        self.form_row(g2, 1, "Check every", self.s_interval, left=True)
        self.form_row(g2, 2, "Voice removal", self.cb_novoice_auto)
        g2.addWidget(label("Finds quiet music under talking. Much slower on long videos.", "help"), 3, 1)
        grid.addWidget(c2, 0, 1)

        # track base
        c3, g3 = self.section("Track base")
        g3.setColumnMinimumWidth(0, 0)
        stats = QtWidgets.QHBoxLayout()
        stats.setSpacing(10)
        self.base_site_val = self.stat(stats, "-", "tracks from the site")
        self.base_local_val = self.stat(stats, "-", "from the unreleased folder")
        g3.addLayout(stats, 1, 0, 1, 2)
        self.base_lbl = label("Unreleased tracks go in unreleased/<Composer>/<Track title>.wav. Tracks deleted "
                              "on the site or from the folder leave the base by themselves.", "help")
        g3.addWidget(self.base_lbl, 2, 0, 1, 2)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
        b3 = QtWidgets.QPushButton("Open unreleased folder")
        b3.setToolTip("Tracks not on the site yet: put them in unreleased/<Composer>/<Track title>.wav")
        b3.clicked.connect(lambda: (os.makedirs(UNRELEASED, exist_ok=True),
                                    QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(UNRELEASED))))
        row.addWidget(b3)
        b2 = QtWidgets.QPushButton("Update track base now")
        b2.clicked.connect(lambda: self.bg(self._update_base))
        row.addWidget(b2)
        row.addStretch(1)
        g3.addLayout(row, 3, 0, 1, 2)
        grid.addWidget(c3, 1, 0)

        # storage folder
        c4, g4 = self.section("Storage folder")
        g4.setColumnMinimumWidth(0, 0)
        sf = QtWidgets.QFrame()
        sf.setObjectName("stat")
        sfl = QtWidgets.QVBoxLayout(sf)
        sfl.setContentsMargins(12, 10, 12, 10)
        sfl.setSpacing(2)
        self.store_path_lbl = label("")
        self.store_path_lbl.setStyleSheet("color:#ffffff;font-size:12px")
        sfl.addWidget(self.store_path_lbl)
        self.store_lbl = label("", "help")
        sfl.addWidget(self.store_lbl)
        g4.addWidget(sf, 1, 0, 1, 2)
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
        b5 = QtWidgets.QPushButton("Open")
        b5.clicked.connect(lambda: QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(STORE)))
        row.addWidget(b5)
        self.btn_store = QtWidgets.QPushButton("Move to another disk...")
        self.btn_store.clicked.connect(self.change_store)
        row.addWidget(self.btn_store)
        row.addStretch(1)
        g4.addLayout(row, 2, 0, 1, 2)
        grid.addWidget(c4, 1, 1)

        # youtube sign-in
        c5 = card()
        h = QtWidgets.QHBoxLayout(c5)
        h.setContentsMargins(16, 14, 16, 14)
        h.setSpacing(16)
        col = QtWidgets.QVBoxLayout()
        col.setSpacing(4)
        col.addWidget(label("YouTube sign-in", "title"))
        col.addWidget(label("Needed only for age-restricted videos. A separate Edge window opens: sign in, "
                            "then close it.", "help"))
        h.addLayout(col, 1)
        b = QtWidgets.QPushButton("Sign in to YouTube")
        b.clicked.connect(lambda: (open_login_window(), self.log("Sign in in the Edge window, then close it.")))
        h.addWidget(b)
        grid.addWidget(c5, 2, 0, 1, 2)
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)
        l.addLayout(grid)

        row = QtWidgets.QHBoxLayout()
        row.setSpacing(12)
        save = QtWidgets.QPushButton("Save settings")
        save.setObjectName("gold")
        save.clicked.connect(self.save_settings)
        row.addWidget(save)
        row.addWidget(label("Matching thresholds live on the Check a video page, next to the result they affect.",
                            "help"), 1)
        l.addLayout(row)
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
        self.store_path_lbl.setText(STORE)
        self.store_lbl.setText("Track base, downloaded tracks and video audio, results, unreleased folder: "
                               "%.1f GB. Free on this disk: %.0f GB." % (size / 1e9, free))

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
