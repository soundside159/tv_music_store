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
PACKAGES_VERSION = "4"
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
        if "Sign in" not in str(e) and "cookies" not in str(e):
            raise
    close_login_window()
    variants = []
    if os.path.isfile(COOKIES_TXT):
        variants.append({"cookiefile": COOKIES_TXT})
    if os.path.isdir(os.path.join(LOGIN_PROFILE, "Default")):
        variants.append({"cookiesfrombrowser": ("edge", os.path.join(LOGIN_PROFILE, "Default")),
                         "cookiefile": COOKIES_TXT})
    last = None
    for extra in variants:
        for client in (None, "web", "mweb", "web_creator", "tv"):
            o = dict(opts, **extra)
            if client:
                o["extractor_args"] = {"youtube": {"player_client": [client]}}
            try:
                with yt_dlp.YoutubeDL(o) as y:
                    return fn(y)
            except Exception as e2:
                last = e2
                if "age" not in str(e2).lower():
                    break
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
class Base:
    """Fingerprint base of the site's published tracks (full versions)."""

    def __init__(self):
        self.ht = None
        self.meta = {}  # base name -> {id, title, composer, path, addedAt}
        self.fresh = []  # (track id, hashes) added since the last re-check

    def load(self):
        if os.path.isfile(DB_PATH) and os.path.isfile(DB_INDEX):
            self.ht = fp.load_db(DB_PATH)
            self.meta = json.load(open(DB_INDEX, encoding="utf-8"))
        return self.ht is not None

    def update(self, settings, log, progress):
        """Download new tracks from the site and add them to the base."""
        tracks = api(settings, "GET", "?action=catalog", timeout=120)["tracks"]
        os.makedirs(CATALOG_DIR, exist_ok=True)
        if self.ht is None:
            import hash_table
            self.ht = hash_table.HashTable(hashbits=20, depth=100, maxtime=65536)
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
            hashes = fp.hashes_of(fp.load_mono(path), fp.DB_DENSITY, 1)
            self.ht.store(t["id"], hashes)
            self.meta[t["id"]] = {"id": t["id"], "title": t["title"], "composer": t["composer"], "path": path,
                                  "addedAt": t.get("addedAt", "")}
            self.fresh.append((t["id"], hashes))
            if (i + 1) % 20 == 0:
                self.save()
        self.save()
        return len(new)

    def save(self):
        self.ht.save(DB_PATH)
        json.dump(self.meta, open(DB_INDEX, "w", encoding="utf-8"))

    def title(self, name):
        m = self.meta.get(name)
        return m["title"] if m else name

    def composer(self, name):
        m = self.meta.get(name)
        return m["composer"] if m else ""


def find_in_audio(base, audio, novoice, progress):
    """All tracks found in one audio file: list of rows (one per track)."""
    samples = fp.load_mono(audio)
    found = []
    progress("Analysing audio...", None)
    h = fp.query_hashes(samples, lambda k, n: progress("Analysing audio  part %d of %d" % (k, n), k / max(1, n)))
    found += fp.find_tracks(
        samples, base.ht, hashes=h,
        progress=lambda k, n: progress("Searching the track base  %d%%" % (100 * k // max(1, n)), k / max(1, n)))
    if novoice:
        if not os.path.isfile(MODEL_PATH):
            progress("Downloading voice removal model (65 MB)...", None)
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH + ".part")
            os.replace(MODEL_PATH + ".part", MODEL_PATH)
        clean = os.path.splitext(audio)[0] + ".novoice.wav"
        if not os.path.isfile(clean):
            sep.separate(audio, clean, MODEL_PATH,
                         lambda k, n: progress("Removing voice  %d%%" % (100 * k // max(1, n)), k / max(1, n)))
        for g in fp.find_tracks(fp.load_mono(clean), base.ht):
            if not any(o["track"] == g["track"] and abs(o["start"] - g["start"]) < 8 for o in found):
                found.append(g)
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
        rows.append({"track": name, "title": base.title(name), "composer": base.composer(name),
                     "regions": regions, "parts": parts, "total": sum(b - a for a, b in regions),
                     "score": max(p["score"] for p in parts)})
    rows.sort(key=lambda r: -r["total"])
    return samples, rows


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


CHECKS = os.path.join(DATA, "checks.json")  # results of "Check a video" (survive restarts)


def load_checks():
    try:
        return json.load(open(CHECKS, encoding="utf-8"))
    except Exception:
        return {}


def save_checks(d):
    os.makedirs(DATA, exist_ok=True)
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
GREEN = "#5ee69a"
STATUS_COLORS = {"none": "#4a4a4a", "queue": "#8f8f8f", "run": GOLD, "found": RED, "clean": GREEN,
                 "err": "#ff9f43"}

QSS = """
* { font-family: 'Inter', 'Segoe UI', sans-serif; color: #f2f2f2; }
QMainWindow, QWidget#root { background: #111111; }
QDialog, QMessageBox { background: #161616; }
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
QSpinBox { background: #111; border: 1px solid #2c2c2c; border-radius: 8px; padding: 6px; }
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
    """Waveform with gold regions; click = play from there."""
    clicked = QtCore.pyqtSignal(float)

    def __init__(self, height=84):
        super().__init__()
        self.env = None
        self.gold = []
        self.head = None
        self.hover = None
        self.dur = 0.0
        self.setMinimumHeight(height)
        self.setMaximumHeight(height + 30)
        self.setMouseTracking(True)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)

    def set(self, env, gold, dur=0.0):
        self.env, self.gold, self.dur = env, gold, dur
        self.update()

    def mousePressEvent(self, e):
        if self.env is not None:
            self.clicked.emit(max(0.0, min(1.0, e.position().x() / max(1, self.width()))))

    def mouseMoveEvent(self, e):
        self.hover = max(0.0, min(1.0, e.position().x() / max(1, self.width())))
        self.update()

    def leaveEvent(self, _):
        self.hover = None
        self.update()

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
        for a, b in self.gold:
            p.fillRect(QtCore.QRectF(a * w, 0, max(2, (b - a) * w), h), QtGui.QColor("#3a3214"))
        if self.env is not None and len(self.env):
            m = float(self.env.max()) or 1.0
            n = len(self.env)
            mid = h / 2
            grey, gold = QtGui.QColor("#6f6f6f"), QtGui.QColor(GOLD)
            for x in range(w):
                i = int(x / w * n)
                v = float(self.env[i:i + max(1, n // w)].max()) / m if i < n else 0.0
                f = x / w
                p.setPen(gold if any(a <= f <= b for a, b in self.gold) else grey)
                p.drawLine(x, int(mid - v * mid * 0.9), x, int(mid + v * mid * 0.9))
        if self.head is not None:
            p.setPen(QtGui.QPen(QtGui.QColor("#ffffff"), 2))
            x = int(self.head * w)
            p.drawLine(x, 0, x, h)
        f = p.font()
        f.setPointSize(8)
        p.setFont(f)
        if self.dur:
            p.setPen(QtGui.QColor("#666"))
            p.drawText(QtCore.QRectF(6, h - 16, 60, 14), QtCore.Qt.AlignmentFlag.AlignLeft, "0:00")
            p.drawText(QtCore.QRectF(w - 66, h - 16, 60, 14), QtCore.Qt.AlignmentFlag.AlignRight, fmt(self.dur))
        if self.hover is not None:
            x = int(self.hover * w)
            p.setPen(QtGui.QPen(QtGui.QColor(255, 255, 255, 90), 1))
            p.drawLine(x, 0, x, h)
            if self.dur:
                t = fmt(self.hover * self.dur)
                tx = min(max(x + 6, 4), w - 50)
                p.fillRect(QtCore.QRectF(tx - 3, 3, 44, 16), QtGui.QColor(0, 0, 0, 170))
                p.setPen(QtGui.QColor("#ffffff"))
                p.drawText(QtCore.QRectF(tx - 3, 3, 44, 16), QtCore.Qt.AlignmentFlag.AlignCenter, t)
        p.end()


class KeepColors(QtWidgets.QStyledItemDelegate):
    """Selected rows keep their own text colours (red = found, green = clean)."""

    def initStyleOption(self, opt, index):
        super().initStyleOption(opt, index)
        fg = index.data(QtCore.Qt.ItemDataRole.ForegroundRole)
        if fg is not None:
            opt.palette.setBrush(QtGui.QPalette.ColorRole.HighlightedText, fg)


class Signals(QtCore.QObject):
    log = QtCore.pyqtSignal(str)
    stage = QtCore.pyqtSignal(str, float)  # frac < 0 = unknown
    done = QtCore.pyqtSignal(object)


class App(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = load_settings()
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
        self.ui(self.refresh_status)

    # ---- Scanner page --------------------------------------------------------
    def page_scanner(self):
        w = QtWidgets.QWidget()
        l = QtWidgets.QVBoxLayout(w)
        l.setContentsMargins(0, 0, 0, 0)
        l.addWidget(label("Whitelist Scanner", "h1"))
        l.addWidget(label("Takes new videos of whitelisted channels from the site, finds our tracks in them and "
                          "sends the results to Admin -> Whitelisting. Leave it running.", "sub"))
        l.addSpacing(10)
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
        self.k_checked = self.kpi(cl, "0", "videos checked")
        self.k_found = self.kpi(cl, "0", "with our music")
        self.btn_run = QtWidgets.QPushButton("Start scanning")
        self.btn_run.setObjectName("gold")
        self.btn_run.clicked.connect(self.toggle)
        cl.addWidget(self.btn_run)
        l.addWidget(c)
        l.addSpacing(8)
        l.addWidget(label("LAST VIDEOS", "lbl"))
        self.recent_list = QtWidgets.QTreeWidget()
        self.recent_list.setHeaderLabels(["Time", "Video", "Channel", "Found"])
        self.recent_list.setRootIsDecorated(False)
        self.recent_list.setAlternatingRowColors(True)
        self.recent_list.setColumnWidth(0, 70)
        self.recent_list.setColumnWidth(1, 360)
        self.recent_list.setColumnWidth(2, 200)
        l.addWidget(self.recent_list, 1)
        return w

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
        checked = len(self.recent)
        found = sum(1 for r in self.recent if r["found"])
        self.k_checked.setText(str(checked))
        self.k_found.setText(str(found))
        self.side_status.setText(("Scanner: running" if on else "Scanner: stopped"))
        self.base_lbl.setText("Track base: %d published tracks from the site (full versions). New tracks are "
                              "added automatically every few hours." % len(self.base.meta))

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
            segs = fp.find_tracks(None, small, hashes=z["h"], dur=float(z["dur"][0]))
            if not segs:
                continue
            rows = rows_from_segments(self.base, segs)
            vid = f[:-4]
            api(self.settings, "POST", "", {"action": "result", "videoId": vid, "append": True,
                                            "matches": [{"trackId": r["track"], "track": r["title"],
                                                         "regions": r["regions"], "total": r["total"],
                                                         "score": r["score"]} for r in rows]})
            hits += 1
            self.log("Re-check: %s found in %s" % (", ".join(r["title"] for r in rows), vid))
        self.log("Re-check for new track(s) done: %d video(s) with them." % hits)

    def scan_one(self, v):
        t0 = time.time()
        title = v.get("title") or v["videoId"]
        try:
            audio = download_audio(v["videoId"], lambda t, f: self.stage("%s  -  %s" % (title[:40], t), f))
            samples, rows = find_in_audio(self.base, audio, self.settings["novoice"],
                                          lambda t, f: self.stage("%s  -  %s" % (title[:40], t), f))
            save_print(v["videoId"], samples, v.get("publishedAt", ""))
            matches = [{"trackId": r["track"], "track": r["title"], "regions": r["regions"],
                        "total": r["total"], "score": r["score"]} for r in rows]
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
            self.log("%s: FAILED %s" % (title, msg))
            try:
                api(self.settings, "POST", "", {"action": "result", "videoId": v["videoId"], "error": msg})
            except Exception:
                pass
            self.add_recent(v, "error: " + msg[:60])

    def add_recent(self, v, found):
        rec = {"time": time.strftime("%H:%M"), "title": v.get("title", ""), "channel": v.get("channelTitle", ""),
               "found": found if found and not found.startswith("error") else ""}
        self.recent.insert(0, rec)

        def put():
            it = QtWidgets.QTreeWidgetItem([rec["time"], rec["title"], rec["channel"], found or "-"])
            if rec["found"]:
                it.setForeground(3, QtGui.QBrush(QtGui.QColor(RED)))
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
        self.res = QtWidgets.QTreeWidget()
        self.res.setHeaderLabels(["Track found", "Composer", "Where in the video", "Plays", "Match"])
        self.res.setRootIsDecorated(False)
        rh = self.res.header()
        rh.setStretchLastSection(False)
        rh.setSectionResizeMode(2, QtWidgets.QHeaderView.ResizeMode.Stretch)
        self.res.setColumnWidth(0, 170)
        self.res.setColumnWidth(1, 105)
        self.res.setColumnWidth(3, 52)
        self.res.setColumnWidth(4, 56)
        self.res.setMaximumHeight(150)
        self.res.setItemDelegate(KeepColors(self.res))
        self.res.itemSelectionChanged.connect(self.draw)
        pl.addWidget(self.res)
        self.clean_lbl = label("None of our tracks found in this video.", "sub")
        self.clean_lbl.setStyleSheet("color:%s;font-size:13px;font-weight:600" % GREEN)
        pl.addWidget(self.clean_lbl)
        pl.addSpacing(4)
        self.video_lbl = label("VIDEO AUDIO  -  click to listen", "lbl")
        pl.addWidget(self.video_lbl)
        self.w_video = Wave()
        self.w_video.clicked.connect(lambda f: self.click_play("video", f))
        pl.addWidget(self.w_video)
        pl.addSpacing(4)
        self.track_lbl = label("TRACK", "lbl")
        pl.addWidget(self.track_lbl)
        self.w_track = Wave()
        self.w_track.clicked.connect(lambda f: self.click_play("track", f))
        pl.addWidget(self.w_track)
        row = QtWidgets.QHBoxLayout()
        self.hint_lbl = label("Gold = where the track plays. Click a waveform to listen from there.", "muted")
        row.addWidget(self.hint_lbl, 1)
        stop = QtWidgets.QPushButton("Stop sound")
        stop.setObjectName("ghost")
        stop.clicked.connect(self.stop_play)
        row.addWidget(stop)
        pl.addLayout(row)
        pl.addStretch(1)
        self.d_stack.addWidget(res_page)
        rl.addWidget(self.d_stack, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 5)
        split.setStretchFactor(1, 6)
        split.setSizes([520, 620])
        l.addWidget(split, 1)
        self.show_video(None)
        self.update_check_btn()
        return w

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
                    self.stage("%s  -  %s" % (title[:50], text), frac)
                    if frac is not None:
                        pct = int(100 * frac)
                        if pct != self.check_pct:
                            self.check_pct = pct
                            self.ui(lambda: self.refresh_item(v_id))
                try:
                    audio = download_audio(vid, prog)
                    samples, rows = find_in_audio(self.base, audio, novoice, prog)
                    env = envelope(samples)
                    self.checks[vid] = {"title": v["title"], "dur": len(samples) / fp.SR, "rows": rows,
                                        "env": [round(float(x), 4) for x in env], "audio": audio,
                                        "novoice": novoice, "at": time.strftime("%Y-%m-%d %H:%M")}
                    self.log("%s: %s  [%.0f s]" % (v["title"], ", ".join(r["title"] for r in rows) or "clean",
                                                   time.time() - t0))
                except Exception as e:
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
            self.stage("All selected videos checked", 1)
        finally:
            self.checking = None
            self.loop_on = False

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
        self.res.blockSignals(True)
        self.res.clear()
        for r in rows:
            it = QtWidgets.QTreeWidgetItem([r["title"], r["composer"],
                                            ", ".join("%s-%s" % (fmt(a), fmt(b)) for a, b in r["regions"]),
                                            fmt(r["total"]), strength_word(r["score"])])
            it.setForeground(0, QtGui.QBrush(QtGui.QColor(RED)))
            self.res.addTopLevelItem(it)
        self.res.setVisible(bool(rows))
        self.res.setFixedHeight(min(150, 34 + 32 * max(1, len(rows))))
        self.clean_lbl.setVisible(not rows)
        self.hint_lbl.setText("Gold = where the track plays. Click a waveform to listen from there." if rows
                              else "Click the waveform to listen from there.")
        self.track_lbl.setVisible(bool(rows))
        self.w_track.setVisible(bool(rows))
        if rows:
            self.res.setCurrentItem(self.res.topLevelItem(0))
        self.res.blockSignals(False)
        self.draw()

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
            {"trackId": x["track"], "track": x["title"], "regions": x["regions"], "total": x["total"],
             "score": x["score"]} for x in c["rows"]]})
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
        return c["rows"][i] if 0 <= i < len(c["rows"]) else None

    def draw(self):
        c = self.cur_check()
        if not c:
            return
        row = self.sel_row()
        dur = max(c["dur"], 0.1)
        self.w_video.set(np.array(c["env"], np.float32), [(a / dur, b / dur) for a, b in row["regions"]] if row else [],
                         dur)
        self.video_lbl.setText("VIDEO AUDIO  -  click to listen")
        if not row:
            self.w_track.set(None, [])
            return
        name = row["track"]
        path = (self.base.meta.get(name) or {}).get("path")
        if name not in self.track_env and path and os.path.isfile(path):
            t = fp.load_mono(path)
            self.track_env[name] = (envelope(t), len(t) / fp.SR)
        if name not in self.track_env:
            self.w_track.set(None, [])
            return
        env, tdur = self.track_env[name]
        used = [(p["track_pos"] / tdur, (p["track_pos"] + p["end"] - p["start"]) / tdur) for p in row.get("parts", [])]
        self.w_track.set(env, used, tdur)
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
        b2 = QtWidgets.QPushButton("Update track base now")
        b2.clicked.connect(lambda: self.bg(self._update_base))
        h3.addWidget(b2)
        l.addWidget(c3)
        l.addStretch(1)
        return w

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
    app.setStyleSheet(QSS)
    w = App()
    w.show()
    w.refresh_status()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
