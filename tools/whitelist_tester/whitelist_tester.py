"""Whitelist tester - press Run in VS Code.

1. Paste a YouTube channel link (or one video link) and press "Load videos".
2. Pick a video in the list and press "Check".
3. The program downloads only the audio, removes the voice (optional) and
   shows which of our tracks it found, and where.

First start installs the needed Python packages, downloads the voice-removal
model (~65 MB) and builds the fingerprint base from the tracks listed in
tracks_in_base.txt (full versions from your track folder). Later starts are fast.
"""
import os
import subprocess
import sys
import threading
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CACHE = os.path.join(DATA, "cache")
DB_PATH = os.path.join(DATA, "tracks_db.pklz")
MODEL_PATH = os.path.join(DATA, "UVR-MDX-NET-Inst_HQ_3.onnx")
MODEL_URL = "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_3.onnx"
LIST_PATH = os.path.join(HERE, "tracks_in_base.txt")
# Z:\Render\<Moi treki na stoki>\<Vse treki> MA title  (Cyrillic written as escapes)
TRACKS_DIR = "Z:\\Render\\\u041c\u043e\u0438 \u0442\u0440\u0435\u043a\u0438 \u043d\u0430 \u0441\u0442\u043e\u043a\u0438\\\u0412\u0441\u0435 \u0442\u0440\u0435\u043a\u0438 MA title"
OWN_FFMPEG = "H:\\BACKUP\\py\\SOFT\\Youtube downloader\\ffmpeg.exe"

PACKAGES = ["numpy", "scipy", "psutil", "onnxruntime", "soundfile", "yt-dlp[default]", "deno", "imageio-ffmpeg", "sounddevice"]
PACKAGES_VERSION = "3"  # bump to make the tester install new packages
VENV = os.path.join(DATA, "venv")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")
VENV_OK = os.path.join(VENV, "packages_ok.txt")


def use_private_python():
    """Run inside our own Python environment (data/venv) so the packages we
    need never change the main Python that other programs use."""
    if os.path.normcase(os.path.abspath(sys.executable)) == os.path.normcase(os.path.abspath(VENV_PY)):
        return
    os.makedirs(DATA, exist_ok=True)
    if not os.path.isfile(VENV_PY):
        print("Creating a private Python environment for the tester (one time)...")
        subprocess.check_call([sys.executable, "-m", "venv", VENV])
    have = open(VENV_OK).read().strip() if os.path.isfile(VENV_OK) else ""
    if have != PACKAGES_VERSION:
        print("Installing packages into it (one time, a few minutes)...")
        subprocess.check_call([VENV_PY, "-m", "pip", "install", "--upgrade", "pip"])
        subprocess.check_call([VENV_PY, "-m", "pip", "install", "--upgrade"] + PACKAGES)
        open(VENV_OK, "w").write(PACKAGES_VERSION)
    sys.exit(subprocess.call([VENV_PY, os.path.abspath(__file__)]))


use_private_python()
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")

import tkinter as tk  # noqa: E402
from tkinter import ttk  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "engine"))
import fp  # noqa: E402
import sep  # noqa: E402
import yt_dlp  # noqa: E402


COOKIES_TXT = os.path.join(DATA, "cookies.txt")
BROWSERS = ["firefox", "edge", "chrome", "brave", "opera"]


LOGIN_PROFILE = os.path.join(DATA, "youtube_login")  # private Edge profile, used only by the tester
EDGE_PATHS = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
LOGIN_URL = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/"


def open_login_window():
    """Opens a separate Edge window (own profile, your normal browser is untouched).
    Sign in to YouTube there once, then close that window."""
    edge = next((p for p in EDGE_PATHS if os.path.isfile(p)), None)
    if not edge:
        raise RuntimeError("Microsoft Edge not found")
    subprocess.Popen([edge, "--user-data-dir=" + LOGIN_PROFILE, "--no-first-run", LOGIN_URL])


def close_login_window():
    """Edge keeps its cookie file locked while running (also in the background),
    so close the tester's own Edge window before reading the login."""
    import psutil
    import time
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


def cookie_variants():
    """Ways to sign in to YouTube as you, tried in order when YouTube asks
    (age-restricted videos): the tester's own Edge login, data/cookies.txt,
    then your browsers."""
    out = []
    if os.path.isdir(os.path.join(LOGIN_PROFILE, "Default")):
        # cookiefile: yt-dlp also SAVES the login there, so later runs use the file
        out.append(("tester login", {"cookiesfrombrowser": ("edge", os.path.join(LOGIN_PROFILE, "Default")),
                                     "cookiefile": COOKIES_TXT}))
    if os.path.isfile(COOKIES_TXT):
        out.append(("cookies.txt", {"cookiefile": COOKIES_TXT}))
    for b in BROWSERS:
        out.append((b, {"cookiesfrombrowser": (b,)}))
    return out


def run_ydl(opts, fn, log):
    """Run fn(ydl) without sign-in; if YouTube wants sign-in, retry with your cookies."""
    try:
        with yt_dlp.YoutubeDL(opts) as y:
            return fn(y)
    except Exception as e:
        msg = str(e)
        if "Sign in" not in msg and "cookies" not in msg:
            raise
    close_login_window()
    last = None
    for name, extra in cookie_variants():
        try:
            r = None
            err = None
            for client in (None, "web", "mweb", "web_creator", "tv"):
                o = dict(opts, **extra)
                if client:
                    o["extractor_args"] = {"youtube": {"player_client": [client]}}
                try:
                    with yt_dlp.YoutubeDL(o) as y:
                        r = fn(y)
                    err = None
                    break
                except Exception as e2:
                    err = e2
                    if "age" not in str(e2).lower():
                        break
            if err:
                raise err
            log("  (signed in with your %s login)" % name)
            return r
        except Exception as e:
            last = e
            if name in ("tester login", "cookies.txt"):
                msg = str(e).splitlines()[0] if str(e) else str(e)
                if "Sign in" not in msg and "cookies" not in msg:
                    raise RuntimeError("signed in OK, but: " + msg)
                log("  %s did not work: %s" % (name, msg))
    raise RuntimeError("YouTube needs sign-in and none of your browsers worked. "
                       "Press \"Sign in to YouTube\", sign in, CLOSE that window, then try again. Last error: %s"
                       % (str(last).splitlines()[0] if last else ""))


def pick_ffmpeg():
    if os.path.isfile(OWN_FFMPEG):
        return OWN_FFMPEG
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


fp.FFMPEG = pick_ffmpeg()


def full_version(folder, name):
    """Full version WAV of a track folder: <name>.wav, (full version), (Full), else the longest WAV."""
    for c in (name + ".wav", name + " (full version).wav", name + " (Full).wav", name + " (Full Version).wav"):
        p = os.path.join(folder, c)
        if os.path.isfile(p):
            return p
    wavs = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".wav")]
    return max(wavs, key=os.path.getsize) if wavs else None


def fmt(sec):
    sec = int(round(sec))
    return "%d:%02d" % (sec // 60, sec % 60)


class App:
    def __init__(self, root):
        self.root = root
        self.ht = None
        self.videos = []
        root.title("TV Music Store - whitelist tester")
        root.geometry("1100x900")
        self.paths = {}
        self.result = None
        self.track_env = {}
        self.play = None  # (canvas, start_pos, started_at, length)

        top = ttk.Frame(root, padding=10)
        top.pack(fill="x")
        ttk.Label(top, text="YouTube channel or video link:").pack(side="left")
        self.url = tk.StringVar()
        self.entry = ttk.Entry(top, textvariable=self.url, width=70)
        self.entry.pack(side="left", padx=6, fill="x", expand=True)
        # Ctrl+V / C / X / A by KEY POSITION, so they also work with the Russian layout
        self.entry.bind("<Control-KeyPress>", self.entry_keys)
        emenu = tk.Menu(self.entry, tearoff=0)
        emenu.add_command(label="Paste", command=lambda: self.entry.event_generate("<<Paste>>"))
        emenu.add_command(label="Clear", command=lambda: self.url.set(""))
        self.entry.bind("<Button-3>", lambda e: emenu.tk_popup(e.x_root, e.y_root))
        self.load_btn = ttk.Button(top, text="Load videos", command=self.load_videos)
        self.load_btn.pack(side="left")
        ttk.Button(top, text="Sign in to YouTube", command=self.sign_in).pack(side="left", padx=(6, 0))

        mid = ttk.Frame(root, padding=(10, 0))
        mid.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(mid, columns=("title", "len"), show="headings", height=8)
        self.tree.heading("title", text="Video")
        self.tree.heading("len", text="Length")
        self.tree.column("title", width=780)
        self.tree.column("len", width=80, anchor="center")
        self.tree.pack(fill="both", expand=True)

        bar = ttk.Frame(root, padding=10)
        bar.pack(fill="x")
        self.novoice = tk.BooleanVar(value=False)
        ttk.Checkbutton(bar, text="Remove voice first (slower, finds quiet music under talking)",
                        variable=self.novoice).pack(side="left")
        self.check_btn = ttk.Button(bar, text="Check selected video", command=self.check)
        self.check_btn.pack(side="right")

        res = ttk.Frame(root, padding=(10, 0))
        res.pack(fill="x")
        self.res = ttk.Treeview(res, columns=("track", "where", "total", "strength"), show="headings", height=4)
        for c, t, w in (("track", "Track found", 300), ("where", "Where in the video", 520),
                        ("total", "Plays", 90), ("strength", "Match", 90)):
            self.res.heading(c, text=t)
            self.res.column(c, width=w, anchor="w" if c in ("track", "where") else "center")
        self.res.pack(fill="x")
        self.res.bind("<<TreeviewSelect>>", lambda e: self.draw())

        ttk.Label(root, text="YouTube audio (gold = selected track)", padding=(10, 6, 0, 0)).pack(anchor="w")
        self.cv_video = tk.Canvas(root, height=80, bg="#141414", highlightthickness=0)
        self.cv_video.pack(fill="x", padx=10)
        self.track_label = tk.StringVar(value="Track (gold = parts used in the video)")
        ttk.Label(root, textvariable=self.track_label, padding=(10, 6, 0, 0)).pack(anchor="w")
        self.cv_track = tk.Canvas(root, height=80, bg="#141414", highlightthickness=0)
        self.cv_track.pack(fill="x", padx=10)
        self.cv_video.bind("<Configure>", lambda e: self.draw())
        # Click a waveform to listen from that point; click again or press Stop to stop.
        self.cv_video.bind("<Button-1>", lambda e: self.click_play(self.cv_video, e.x))
        self.cv_track.bind("<Button-1>", lambda e: self.click_play(self.cv_track, e.x))
        ttk.Button(root, text="Stop sound", command=self.stop_play).pack(anchor="e", padx=10, pady=(4, 0))

        st = ttk.Frame(root, padding=(10, 6, 10, 2))
        st.pack(fill="x")
        self.stage_var = tk.StringVar(value="")
        ttk.Label(st, textvariable=self.stage_var, width=70).pack(side="left")
        self.pbar = ttk.Progressbar(st, length=300, maximum=1000)
        self.pbar.pack(side="right")

        self.out = tk.Text(root, height=7, wrap="word", font=("Consolas", 10))
        self.out.pack(fill="both", expand=False, padx=10, pady=(0, 10))
        menu = tk.Menu(self.out, tearoff=0)
        menu.add_command(label="Copy", command=lambda: self.copy_text(False))
        menu.add_command(label="Copy all", command=lambda: self.copy_text(True))
        self.out.bind("<Button-3>", lambda e: menu.tk_popup(e.x_root, e.y_root))
        self.out.bind("<Control-KeyPress>", self.log_keys)
        self.out.bind("<Key>", lambda e: None if (e.state & 4) else "break")  # no typing, copy allowed
        self.busy(True)
        self.bg(self.prepare)

    def entry_keys(self, e):
        ev = {86: "<<Paste>>", 67: "<<Copy>>", 88: "<<Cut>>"}.get(e.keycode)
        if ev:
            self.entry.event_generate(ev)
            return "break"
        if e.keycode == 65:
            self.entry.select_range(0, "end")
            return "break"
        return None

    def log_keys(self, e):
        if e.keycode == 65:
            self.out.tag_add("sel", "1.0", "end")
            return "break"
        if e.keycode == 67:
            self.copy_text(False)
            return "break"
        return None

    def stage(self, text, frac=None):
        """Shows the current step and how far it is (frac 0..1, None = unknown)."""
        def s():
            self.stage_var.set(text)
            if frac is None:
                self.pbar.config(mode="indeterminate")
                self.pbar.start(12)
            else:
                self.pbar.stop()
                self.pbar.config(mode="determinate", value=int(1000 * max(0.0, min(1.0, frac))))
        self.root.after(0, s)

    def copy_text(self, everything):
        try:
            txt = self.out.get("1.0", "end") if everything else self.out.get("sel.first", "sel.last")
        except tk.TclError:
            txt = self.out.get("1.0", "end")
        self.root.clipboard_clear()
        self.root.clipboard_append(txt)

    # ---- helpers -------------------------------------------------------
    def log(self, msg):
        def add():
            self.out.insert("end", msg + "\n")
            self.out.see("end")
        self.root.after(0, add)

    def busy(self, on):
        def s():
            st = "disabled" if on else "normal"
            self.load_btn.config(state=st)
            self.check_btn.config(state=st)
        self.root.after(0, s)

    def bg(self, fn, *a):
        def run():
            try:
                fn(*a)
            except Exception as e:  # show any error in the window
                self.log("ERROR: %s" % e)
                self.log(traceback.format_exc())
            finally:
                self.busy(False)
        threading.Thread(target=run, daemon=True).start()

    # ---- first start: model + base ---------------------------------------
    def prepare(self):
        os.makedirs(CACHE, exist_ok=True)
        if not os.path.isfile(MODEL_PATH):
            self.log("Downloading voice removal model (~65 MB)...")
            import urllib.request
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH + ".part")
            os.replace(MODEL_PATH + ".part", MODEL_PATH)
        names = [l.strip() for l in open(LIST_PATH, encoding="utf-8") if l.strip()]
        for n in names:
            folder = os.path.join(TRACKS_DIR, n)
            f = full_version(folder, n) if os.path.isdir(folder) else None
            if f:
                self.paths[n] = f
        if os.path.isfile(DB_PATH) and os.path.getmtime(DB_PATH) > os.path.getmtime(LIST_PATH):
            self.ht = fp.load_db(DB_PATH)
        else:
            items = []
            for n in names:
                folder = os.path.join(TRACKS_DIR, n)
                f = full_version(folder, n) if os.path.isdir(folder) else None
                if f:
                    items.append((n, f))
                else:
                    self.log("Not found, skipped: " + n)
            self.log("Building fingerprint base from %d full versions..." % len(items))
            self.ht = fp.build_db(items, DB_PATH, lambda i, t, n: n and self.log("  %d/%d %s" % (i + 1, t, n)))
        self.log("Ready. Tracks in base: %d (see tracks_in_base.txt)\n" % len(self.ht.names))

    def sign_in(self):
        try:
            open_login_window()
            self.log("An Edge window opened. Sign in to YouTube there, then CLOSE that window.\n"
                     "It is needed only once (for age-restricted videos).\n")
        except Exception as e:
            self.log("ERROR: %s" % e)

    # ---- videos ------------------------------------------------------------
    def load_videos(self):
        url = self.url.get().strip()
        if not url:
            return
        self.busy(True)
        self.bg(self._load, url)

    def _load(self, url):
        self.log("Loading video list...")
        opts = {"quiet": True, "extract_flat": True, "playlistend": 60, "skip_download": True}
        single = ("watch?v=" in url) or ("youtu.be/" in url) or ("/shorts/" in url)
        targets = [url] if single else [url.rstrip("/") + "/videos", url.rstrip("/") + "/shorts"]
        vids = []
        for t in targets:
                try:
                    info = run_ydl(opts, lambda y: y.extract_info(t, download=False, process=not single), self.log)
                except Exception as e:
                    self.log("Could not read %s: %s" % (t, str(e).splitlines()[0] if str(e) else e))
                    continue
                entries = info.get("entries") or [info]
                for e in entries:
                    if e and e.get("id"):
                        vids.append({"id": e["id"], "title": e.get("title") or e["id"],
                                     "dur": e.get("duration") or 0,
                                     "short": t.endswith("/shorts")})
        self.videos = vids

        def fill():
            self.tree.delete(*self.tree.get_children())
            for i, v in enumerate(vids):
                title = ("[Short] " if v["short"] else "") + v["title"]
                self.tree.insert("", "end", iid=str(i), values=(title, fmt(v["dur"]) if v["dur"] else ""))
        self.root.after(0, fill)
        self.log("Found %d videos.\n" % len(vids))

    def check(self):
        sel = self.tree.selection()
        if not sel or self.ht is None:
            return
        self.busy(True)
        self.bg(self._check, self.videos[int(sel[0])])

    def _check(self, v):
        import time
        t_all = time.time()
        steps = 4 if self.novoice.get() else 3
        self.log("=== %s" % v["title"])
        got = [f for f in os.listdir(CACHE) if f.startswith(v["id"] + ".") and ".novoice" not in f
               and not f.endswith(".part")]
        if got:
            audio = os.path.join(CACHE, got[0])
            self.stage("1/%d  Audio already downloaded" % steps, 1)
        else:
            def hook(d):
                if d.get("status") == "downloading":
                    tot = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                    done = d.get("downloaded_bytes") or 0
                    spd = (d.get("speed") or 0) / 1e6
                    self.stage("1/%d  Downloading audio  %.1f / %.1f MB  (%.1f MB/s)"
                               % (steps, done / 1e6, tot / 1e6, spd), done / tot if tot else None)
            self.stage("1/%d  Downloading audio..." % steps)
            # The smallest audio stream is plenty: fingerprints use 11 kHz mono.
            opts = {"quiet": True, "format": "worstaudio[abr>=40]/worstaudio/bestaudio/best",
                    "outtmpl": os.path.join(CACHE, v["id"] + ".%(ext)s"), "progress_hooks": [hook],
                    "ffmpeg_location": os.path.dirname(fp.FFMPEG)}
            t0 = time.time()
            run_ydl(opts, lambda y: y.download(["https://www.youtube.com/watch?v=" + v["id"]]), self.log)
            got = [f for f in os.listdir(CACHE) if f.startswith(v["id"] + ".") and ".novoice" not in f
                   and not f.endswith(".part")]
            audio = os.path.join(CACHE, got[0])
            self.log("  downloaded in %.0f s" % (time.time() - t0))

        found = {}
        self.stage("2/%d  Reading audio..." % steps)
        samples = fp.load_mono(audio)
        t0 = time.time()
        hits = fp.find_tracks(
            samples, self.ht,
            hash_progress=lambda k, n: self.stage("2/%d  Analysing audio  part %d of %d (all CPU cores)"
                                                  % (steps, k, n), k / max(1, n)),
            progress=lambda k, n: self.stage("3/%d  Searching the track base  %d%%"
                                             % (steps, 100 * k // max(1, n)), k / max(1, n)))
        for g in hits:
            found[(g["track"], int(g["start"]))] = g
        self.log("  %s of audio analysed and searched in %.0f s" % (fmt(len(samples) / fp.SR), time.time() - t0))
        if self.novoice.get():
            clean = os.path.join(CACHE, v["id"] + ".novoice.wav")
            if not os.path.isfile(clean):
                sep.separate(audio, clean, MODEL_PATH,
                             lambda k, n: self.stage("4/%d  Removing voice  %d%%" % (steps, 100 * k // max(1, n)),
                                                     k / max(1, n)))
            self.stage("4/%d  Searching music without voice..." % steps)
            for g in fp.find_tracks(fp.load_mono(clean), self.ht):
                key = (g["track"], int(g["start"]))
                if not any(t == g["track"] and abs(s - g["start"]) < 8 for t, s in found):
                    found[key] = g
        self.stage("Done in %.0f s" % (time.time() - t_all), 1)

        # One row per track: pieces closer than 10 s are one region of the video
        # (bloggers cut and loop the music, so the track position jumps; it is
        # still the same use).
        by_track = {}
        for g in sorted(found.values(), key=lambda x: x["start"]):
            by_track.setdefault(g["track"], []).append(g)
        rows = []
        for name, parts in by_track.items():
            regions = []
            for g in parts:
                if regions and g["start"] - regions[-1][1] <= 10:
                    regions[-1][1] = max(regions[-1][1], g["end"])
                else:
                    regions.append([g["start"], g["end"]])
            total = sum(b - a for a, b in regions)
            rows.append({"track": name, "regions": regions, "parts": parts, "total": total,
                         "score": max(p["score"] for p in parts)})
        rows.sort(key=lambda r: -r["total"])
        self.result = {"env": envelope(samples), "dur": len(samples) / fp.SR, "rows": rows, "audio": audio}

        def fill():
            self.res.delete(*self.res.get_children())
            for i, r in enumerate(rows):
                where = ", ".join("%s-%s" % (fmt(a), fmt(b)) for a, b in r["regions"])
                self.res.insert("", "end", iid=str(i), values=(r["track"], where, fmt(r["total"]),
                                                               strength_word(r["score"])))
            if rows:
                self.res.selection_set("0")
            self.draw()
        self.root.after(0, fill)
        if not rows:
            self.log("No tracks from the base found.\n")
        else:
            self.log("Found %d track(s). Click a row to see where.\n" % len(rows))

    # ---- listening ---------------------------------------------------------
    def click_play(self, cv, x):
        if not self.result:
            return
        w = max(cv.winfo_width(), 1)
        if cv is self.cv_video:
            path, dur = self.result["audio"], self.result["dur"]
        else:
            sel = self.res.selection()
            if not sel:
                return
            name = self.result["rows"][int(sel[0])]["track"]
            if name not in self.paths or name not in self.track_env:
                return
            path, dur = self.paths[name], self.track_env[name][1]
        pos = max(0.0, min(dur, x / w * dur))
        threading.Thread(target=self._play, args=(cv, path, pos, dur), daemon=True).start()

    def _play(self, cv, path, pos, dur):
        import time
        import numpy as np
        import sounddevice as sd
        sd.stop()
        cmd = [fp.FFMPEG, "-v", "error", "-ss", "%.2f" % pos, "-i", path, "-t", "60",
               "-f", "f32le", "-ac", "2", "-ar", "44100", "-"]
        raw = subprocess.run(cmd, capture_output=True, creationflags=0x08000000 if os.name == "nt" else 0).stdout
        data = np.frombuffer(raw, np.float32).reshape(-1, 2)
        if not len(data):
            return
        sd.play(data, 44100)
        self.play = (cv, pos, time.time(), len(data) / 44100.0, dur)
        self.root.after(0, self._tick)

    def _tick(self):
        import time
        for cv in (self.cv_video, self.cv_track):
            cv.delete("playhead")
        if not self.play:
            return
        cv, pos, t0, length, dur = self.play
        el = time.time() - t0
        if el > length:
            self.play = None
            return
        x = (pos + el) / max(dur, 0.1) * max(cv.winfo_width(), 1)
        cv.create_line(x, 0, x, 80, fill="#ffffff", width=2, tags="playhead")
        self.root.after(50, self._tick)

    def stop_play(self):
        try:
            import sounddevice as sd
            sd.stop()
        except Exception:
            pass
        self.play = None

    # ---- waveforms -------------------------------------------------------
    def draw(self):
        for cv in (self.cv_video, self.cv_track):
            cv.delete("all")
        if not self.result:
            return
        sel = self.res.selection()
        row = self.result["rows"][int(sel[0])] if sel else None
        dur = max(self.result["dur"], 0.1)
        w = max(self.cv_video.winfo_width(), 200)
        if row:
            for a, b in row["regions"]:
                self.cv_video.create_rectangle(a / dur * w, 0, b / dur * w, 80, fill="#3a3214", width=0)
        draw_env(self.cv_video, self.result["env"], w, 80, "#777777",
                 [(a / dur, b / dur) for a, b in row["regions"]] if row else [])
        if not row:
            return
        name = row["track"]
        if name not in self.track_env and name in self.paths:
            t = fp.load_mono(self.paths[name])
            self.track_env[name] = (envelope(t), len(t) / fp.SR)
        if name not in self.track_env:
            return
        env, tdur = self.track_env[name]
        tdur = max(tdur, 0.1)
        used = [(p["track_pos"] / tdur, (p["track_pos"] + p["end"] - p["start"]) / tdur) for p in row["parts"]]
        for a, b in used:
            self.cv_track.create_rectangle(a * w, 0, b * w, 80, fill="#3a3214", width=0)
        draw_env(self.cv_track, env, w, 80, "#777777", used)
        self.track_label.set("Track: %s  (%s long, gold = parts used in the video)" % (name, fmt(tdur)))


def envelope(samples, n=1200):
    import numpy as np
    if len(samples) < n:
        return np.abs(samples)
    k = len(samples) // n
    return np.abs(samples[:k * n]).reshape(n, k).max(axis=1)


def draw_env(cv, env, w, h, color, gold):
    m = float(env.max()) if len(env) else 1.0
    m = m or 1.0
    n = len(env)
    step = max(1, n // int(w))
    mid = h / 2
    for x in range(int(w)):
        i = int(x / w * n)
        v = float(env[i:i + step].max()) / m if i < n else 0.0
        f = x / w
        c = "#F4C430" if any(a <= f <= b for a, b in gold) else color
        cv.create_line(x, mid - v * mid * 0.9, x, mid + v * mid * 0.9, fill=c)


def strength_word(score):
    return "sure" if score >= 150 else ("good" if score >= 80 else "weak")

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
