"""Fingerprint engine for the whitelist tester (wraps dpwe/audfprint, MIT).

build_db(files) -> hash table of FULL track versions.
find_tracks(audio_path, ht) -> list of found segments:
    {"track", "start", "end", "track_pos", "score"}  (seconds)
The audio is cut into short overlapping windows (WIN_S long, every HOP_S),
each window is matched on its own, and neighbouring windows that agree on
the same track at the same position are merged into one segment. So a track
that plays for only a few seconds in a long video is still found.
"""
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import audfprint_analyze  # noqa: E402
import audfprint_match  # noqa: E402
import hash_table  # noqa: E402

FFMPEG = "ffmpeg"  # set by the app to a full path when needed
SR = 11025
N_HOP = 256
FRAME_S = N_HOP / SR  # one fingerprint frame in seconds (~0.023 s)

DB_DENSITY = 100.0
QUERY_DENSITY = 200.0
FANOUT = 8

WIN_S = 8.0  # window length
HOP_S = 2.0  # window step
MIN_SCORE = 60  # best window of an aligned chain
MIN_WINDOWS = 3  # aligned windows in a row (about 12 s of music)
STRONG_SCORE = 150  # a single window this strong counts on its own

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # hide ffmpeg console on Windows


def load_mono(path, sr=SR):
    """Any audio/video file -> float32 mono numpy at `sr` (via ffmpeg)."""
    cmd = [FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"]
    out = subprocess.run(cmd, capture_output=True, check=True, creationflags=_NO_WINDOW).stdout
    return np.frombuffer(out, np.float32).copy()


def _analyzer(density, shifts):
    a = audfprint_analyze.Analyzer()
    a.density = density
    a.maxpksperframe = 5
    a.maxpairsperpeak = FANOUT
    a.f_sd = 30.0
    a.shifts = shifts
    a.target_sr = SR
    a.n_fft = 512
    a.n_hop = N_HOP
    a.fail_on_error = True
    return a


def hashes_of(samples, density, shifts):
    """(time_frame, hash) pairs for a mono signal, duplicates removed."""
    an = _analyzer(density, shifts)
    lists = []
    for s in range(max(1, shifts)):
        off = int(s / max(1, shifts) * N_HOP)
        peaks = an.find_peaks(samples[off:], SR)
        if len(peaks):
            lists.append(audfprint_analyze.landmarks2hashes(an.peaks2landmarks(peaks)))
    if not lists:
        return np.zeros((0, 2), np.int32)
    h = np.concatenate(lists)
    return np.unique(h, axis=0).astype(np.int32)


def build_db(items, save_path, progress=None):
    """items: list of (track_name, file_path). Saves and returns the table."""
    ht = hash_table.HashTable(hashbits=20, depth=100, maxtime=65536)
    for i, (name, path) in enumerate(items):
        if progress:
            progress(i, len(items), name)
        ht.store(name, hashes_of(load_mono(path), DB_DENSITY, 1))
    ht.save(save_path)
    if progress:
        progress(len(items), len(items), "")
    return ht


def load_db(path):
    return hash_table.HashTable(path)


def _matcher():
    m = audfprint_match.Matcher()
    m.window = 2
    m.threshcount = 5
    m.max_returns = 1
    m.search_depth = 100
    return m


CHUNK_S = 180.0  # long audio is fingerprinted in 3-minute pieces, several at once


def _chunk_hashes(args):
    """Worker: hashes of one piece, times shifted to the whole file."""
    piece, first_frame, density, shifts = args
    h = hashes_of(piece, density, shifts)
    if len(h):
        h[:, 0] += first_frame
    return h


def hashes_parallel(samples, density, shifts, progress=None):
    """Same as hashes_of, but long audio is cut into pieces that are analysed
    on all CPU cores at once (pieces overlap a little so nothing is lost)."""
    n = len(samples)
    step = int(CHUNK_S * SR)
    if n <= step * 1.5:
        if progress:
            progress(0, 1)
        h = hashes_of(samples, density, shifts)
        if progress:
            progress(1, 1)
        return h
    over = int(5 * SR)
    jobs = []
    for a in range(0, n, step):
        a0 = a - (a % N_HOP)
        jobs.append((samples[a0:min(n, a0 + step + over)], a0 // N_HOP, density, shifts))
    from concurrent.futures import ProcessPoolExecutor, as_completed
    out = []
    workers = max(1, min(len(jobs), (os.cpu_count() or 2) - 1))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_chunk_hashes, j) for j in jobs]
        for k, f in enumerate(as_completed(futs)):
            out.append(f.result())
            if progress:
                progress(k + 1, len(jobs))
    out = [h for h in out if len(h)]
    if not out:
        return np.zeros((0, 2), np.int32)
    return np.unique(np.concatenate(out), axis=0).astype(np.int32)


def all_hits(ht, h):
    """Vectorised hash_table.get_hits: rows [track_id, time_skew, hash, query_time]
    for every query hash at once (the original loops hash by hash)."""
    hashmask = (1 << ht.hashbits) - 1
    tmask = (1 << ht.maxtimebits) - 1
    hm = (h[:, 1] & hashmask).astype(np.int64)
    qt = h[:, 0].astype(np.int64)
    n = np.minimum(ht.depth, ht.counts[hm]).astype(np.int64)
    total = int(n.sum())
    if total == 0:
        return np.zeros((0, 4), np.int64)
    rep = np.repeat(np.arange(len(hm)), n)
    col = np.arange(total) - np.repeat(np.cumsum(n) - n, n)
    vals = ht.table[hm[rep], col].astype(np.int64)
    return np.stack([(vals >> ht.maxtimebits) - 1, (vals & tmask) - qt[rep], hm[rep], qt[rep]], axis=1)


def query_hashes(samples, progress=None):
    """Fingerprint of a video's audio for searching (all CPU cores)."""
    return hashes_parallel(samples, QUERY_DENSITY, 4, progress)


def print_hashes(samples):
    """Smaller fingerprint kept on disk for later re-checks against new tracks."""
    return hashes_of(samples, DB_DENSITY, 1)


def window_hits(samples, ht, progress=None, hash_progress=None, hashes=None, dur=None):
    """Best match of every window: list of (win_start_s, track, score, track_pos_s, t0, t1).
    `hashes` + `dur` = search a stored fingerprint instead of audio."""
    h = hashes if hashes is not None else query_hashes(samples, hash_progress)
    if len(h) == 0:
        return []
    m = _matcher()
    hits = all_hits(ht, h)
    if len(hits) == 0:
        return []
    hits = hits[np.argsort(hits[:, 3], kind="stable")]
    qt = hits[:, 3]
    dur = dur if dur is not None else len(samples) / SR
    out = []
    total = max(1, int(dur / HOP_S))
    s = 0.0
    k = 0
    while s < max(dur - 1.0, 0.01):
        a, b = int(s / FRAME_S), int((s + WIN_S) / FRAME_S)
        sl = hits[np.searchsorted(qt, a):np.searchsorted(qt, b)]
        if len(sl):
            ids, raw = m._best_count_ids(sl, ht)
            r = m._approx_match_counts(sl, ids, raw)
            if len(r):
                r = r[(-r[:, 1]).argsort()]
                tid, score, offs = int(r[0][0]), int(r[0][1]), int(r[0][2])
                # Where in this window the matching hashes really are, so a
                # segment starts/ends where the music does, not on a window edge.
                ok = sl[(sl[:, 0] == tid) & (np.abs(sl[:, 1] - offs) <= m.window), 3]
                t0 = int(ok.min()) if len(ok) else a
                t1 = int(ok.max()) if len(ok) else b
                out.append((s, ht.names[tid], score, max(0.0, (t0 + offs) * FRAME_S),
                            t0 * FRAME_S, t1 * FRAME_S))
        s += HOP_S
        k += 1
        if progress and k % 25 == 0:
            progress(k, total)
    if progress:
        progress(total, total)
    return out


def find_tracks(samples, ht, min_score=MIN_SCORE, strong=STRONG_SCORE, min_windows=MIN_WINDOWS,
                progress=None, hash_progress=None, hashes=None, dur=None):
    """Chain windows into segments. A window joins the chain of the same track
    when its position inside the track moved forward by the same amount as
    the window itself (+-1 s): real music lines up, random lookalikes don't.
    A segment counts when it has 2+ aligned windows and its best window
    scores >= min_score, or a single window scores >= strong."""
    hits = [w for w in window_hits(samples, ht, progress, hash_progress, hashes, dur) if w[2] >= 15]
    chains = []
    for s, name, score, pos, t0, t1 in hits:
        pos = pos - (t0 - s)  # track position at the window start (for alignment)
        joined = False
        for c in chains:
            if c["track"] != name or s - c["last_s"] > WIN_S + 0.01:
                continue
            if abs((pos - c["last_pos"]) - (s - c["last_s"])) <= 1.0:
                c.update(last_s=s, last_pos=pos, end=max(c["end"], t1), n=c["n"] + 1,
                         score=max(c["score"], score))
                joined = True
                break
        if not joined:
            chains.append({"track": name, "start": t0, "end": t1, "last_s": s,
                           "last_pos": pos, "track_pos": pos + (t0 - s), "n": 1, "score": score})
    dur = dur if dur is not None else len(samples) / SR
    out = []
    for c in chains:
        if (c["n"] >= min_windows and c["score"] >= min_score) or c["score"] >= strong:
            out.append({"track": c["track"], "start": c["start"], "end": min(c["end"], dur),
                        "track_pos": c["track_pos"], "score": c["score"], "windows": c["n"]})
    # A weak hit that overlaps a much stronger one is the strong track's shadow.
    keep = []
    for g in out:
        shadow = any(o is not g and o["score"] >= 4 * g["score"]
                     and o["start"] < g["end"] + HOP_S and g["start"] < o["end"] + HOP_S for o in out)
        if not shadow:
            keep.append(g)
    return sorted(keep, key=lambda g: g["start"])
