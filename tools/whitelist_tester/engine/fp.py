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
MIN_LEN_S = 6.0  # the matching music must last at least this long
NOISE_RATIO = 2.5  # a find must be this many times stronger than the random noise of the same audio
ALIGN_S = 1.0  # windows of one chain must agree on the track position within this

# Details of the last find_tracks() call, for the app's check log: every chain
# of windows (found or rejected) with its score, so wrong or missed matches
# can be studied and the rules tuned.
LAST_DEBUG = {}

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
    return hashes_multi_of(samples, density, shifts, [0])[0]


def _pitch_peaks(peaks, semitones):
    """Peaks as if the audio were moved by `semitones` (frequency bins scaled).
    Much faster than re-analysing pitch-shifted audio, and as good for matching."""
    if not semitones:
        return peaks
    q = np.array(peaks, dtype=np.float64)
    q[:, 1] = np.round(q[:, 1] * 2 ** (semitones / 12.0))
    q = q[(q[:, 1] >= 0) & (q[:, 1] < 255)].astype(int)
    return [tuple(x) for x in q]


def hashes_multi_of(samples, density, shifts, semis):
    """Like hashes_of, for several pitch moves at once: {semitones: hashes}.
    The audio is analysed once; each pitch move only re-pairs the peaks."""
    an = _analyzer(density, shifts)
    lists = {st: [] for st in semis}
    for s in range(max(1, shifts)):
        off = int(s / max(1, shifts) * N_HOP)
        peaks = an.find_peaks(samples[off:], SR)
        if len(peaks):
            for st in semis:
                pk = _pitch_peaks(peaks, st)
                if len(pk):
                    lists[st].append(audfprint_analyze.landmarks2hashes(an.peaks2landmarks(pk)))
    out = {}
    for st in semis:
        out[st] = (np.unique(np.concatenate(lists[st]), axis=0).astype(np.int32) if lists[st]
                   else np.zeros((0, 2), np.int32))
    return out


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
    """Worker: hashes of one piece (for every pitch move), times shifted to the whole file."""
    piece, first_frame, density, shifts, semis = args
    hs = hashes_multi_of(piece, density, shifts, semis)
    for h in hs.values():
        if len(h):
            h[:, 0] += first_frame
    return hs


def hashes_parallel(samples, density, shifts, progress=None, semis=(0,)):
    """Same as hashes_of, but long audio is cut into pieces that are analysed
    on all CPU cores at once (pieces overlap a little so nothing is lost).
    Returns hashes, or {semitones: hashes} when `semis` has more than one move."""
    semis = list(semis)
    n = len(samples)
    step = int(CHUNK_S * SR)
    if n <= step * 1.5:
        if progress:
            progress(0, 1)
        hs = hashes_multi_of(samples, density, shifts, semis)
        if progress:
            progress(1, 1)
        return hs if len(semis) > 1 else hs[semis[0]]
    over = int(5 * SR)
    jobs = []
    for a in range(0, n, step):
        a0 = a - (a % N_HOP)
        jobs.append((samples[a0:min(n, a0 + step + over)], a0 // N_HOP, density, shifts, semis))
    from concurrent.futures import ProcessPoolExecutor, as_completed
    parts = {st: [] for st in semis}
    workers = max(1, min(len(jobs), (os.cpu_count() or 2) - 1))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_chunk_hashes, j) for j in jobs]
        for k, f in enumerate(as_completed(futs)):
            for st, h in f.result().items():
                if len(h):
                    parts[st].append(h)
            if progress:
                progress(k + 1, len(jobs))
    out = {st: (np.unique(np.concatenate(v), axis=0).astype(np.int32) if v else np.zeros((0, 2), np.int32))
           for st, v in parts.items()}
    return out if len(semis) > 1 else out[semis[0]]


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


def query_hashes_pitched(samples, semis, progress=None):
    """{semitones: fingerprint} of a video's audio, also with the pitch moved
    (one analysis for all of them)."""
    return hashes_parallel(samples, QUERY_DENSITY, 4, progress, semis=[0] + [s for s in semis if s])


def print_hashes(samples):
    """Smaller fingerprint kept on disk for later re-checks against new tracks."""
    return hashes_of(samples, DB_DENSITY, 1)


def _fast_best(sl, window=2):
    """Best (track id, score, time offset) of one window's hits, all at once:
    for every track and time offset, count the hits whose offset is within
    +-window of it; the biggest count wins. Same idea as audfprint's
    _approx_match_counts, but without its slow loop over candidate tracks."""
    span = 1 << 22
    key = sl[:, 0] * span + (sl[:, 1] + (span >> 1))
    keys, counts = np.unique(key, return_counts=True)
    # Only the most frequent offsets can be the winner: score just those
    # (a real match piles many hits on one offset, noise spreads them out).
    top = np.argpartition(-counts, min(len(counts) - 1, 63))[:64] if len(counts) > 64 else np.arange(len(counts))
    cand = keys[top]
    cum = np.concatenate([[0], np.cumsum(counts)])
    win = cum[np.searchsorted(keys, cand + window, "right")] - cum[np.searchsorted(keys, cand - window, "left")]
    i = int(np.argmax(win))
    return int(cand[i] // span), int(win[i]), int(cand[i] % span - (span >> 1))


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
    allq = np.sort(h[:, 0])  # every query hash time: how many the window had
    dur = dur if dur is not None else len(samples) / SR
    out = []
    total = max(1, int(dur / HOP_S))
    s = 0.0
    k = 0
    while s < max(dur - 1.0, 0.01):
        a, b = int(s / FRAME_S), int((s + WIN_S) / FRAME_S)
        sl = hits[np.searchsorted(qt, a):np.searchsorted(qt, b)]
        if len(sl) >= 15:  # fewer hits than the lowest score that is ever kept: nothing to find here
            tid, score, offs = _fast_best(sl, m.window)
            if score > 0:
                # Where in this window the matching hashes really are, so a
                # segment starts/ends where the music does, not on a window edge.
                ok = sl[(sl[:, 0] == tid) & (np.abs(sl[:, 1] - offs) <= m.window), 3]
                t0 = int(ok.min()) if len(ok) else a
                t1 = int(ok.max()) if len(ok) else b
                nq = int(np.searchsorted(allq, b) - np.searchsorted(allq, a))
                out.append((s, ht.names[tid], score, max(0.0, (t0 + offs) * FRAME_S),
                            t0 * FRAME_S, t1 * FRAME_S, 100.0 * score / max(1, nq)))
        s += HOP_S
        k += 1
        if progress and k % 25 == 0:
            progress(k, total)
    if progress:
        progress(total, total)
    return out


def noise_level(chains, track, min_score=MIN_SCORE, min_windows=MIN_WINDOWS):
    """Strongest chance match of the other tracks: chains that are weak or are
    too few windows (a long, strong chain cut only by the length rule is not noise)."""
    vals = [c["score"] for c in chains if c["track"] != track and c.get("verdict") != "found"
            and (c["score"] < min_score or c["n"] < min_windows)]
    return max(vals or [0])


def find_tracks(samples, ht, min_score=MIN_SCORE, strong=STRONG_SCORE, min_windows=MIN_WINDOWS,
                progress=None, hash_progress=None, hashes=None, dur=None, min_len=MIN_LEN_S, align=ALIGN_S,
                noise_ratio=NOISE_RATIO):
    """Chain windows into segments. A window joins the chain of the same track
    when its position inside the track moved forward by the same amount as
    the window itself (+-1 s): real music lines up, random lookalikes don't.
    A segment counts when it has 2+ aligned windows and its best window
    scores >= min_score, or a single window scores >= strong."""
    hits = [w for w in window_hits(samples, ht, progress, hash_progress, hashes, dur) if w[2] >= 15]
    chains = []
    for s, name, score, pos, t0, t1, pct in hits:
        pos = pos - (t0 - s)  # track position at the window start (for alignment)
        joined = False
        for c in chains:
            if c["track"] != name or s - c["last_s"] > WIN_S + 0.01:
                continue
            if abs((pos - c["last_pos"]) - (s - c["last_s"])) <= align:
                c.update(last_s=s, last_pos=pos, end=max(c["end"], t1), n=c["n"] + 1,
                         score=max(c["score"], score), pct=max(c["pct"], pct))
                joined = True
                break
        if not joined:
            chains.append({"track": name, "start": t0, "end": t1, "last_s": s,
                           "last_pos": pos, "track_pos": pos + (t0 - s), "n": 1, "score": score,
                           "pct": pct})
    global LAST_DEBUG
    dur = dur if dur is not None else len(samples) / SR
    out = []
    for c in chains:
        length = min(c["end"], dur) - c["start"]
        if length < min_len:
            c["verdict"] = "rejected: matching part only %.1f s, need %.0f s" % (length, min_len)
        elif (c["n"] >= min_windows and c["score"] >= min_score) or c["score"] >= strong:
            out.append({"track": c["track"], "start": c["start"], "end": min(c["end"], dur),
                        "track_pos": c["track_pos"], "score": c["score"], "windows": c["n"],
                        "pct": round(c["pct"], 1)})
            c["verdict"] = "found"
        elif c["score"] < min_score:
            c["verdict"] = "rejected: score %d < %d" % (c["score"], min_score)
        else:
            c["verdict"] = "rejected: only %d window(s) in a row, need %d" % (c["n"], min_windows)
    # A find must stand out from the random noise of this same audio: the
    # strongest weak or short chance match of any OTHER track.
    for g in list(out):
        noise = noise_level(chains, g["track"], min_score, min_windows)
        if g["score"] < noise_ratio * noise:
            out.remove(g)
            for c in chains:
                if c["track"] == g["track"] and c["start"] == g["start"]:
                    c["verdict"] = "rejected: only %.1fx stronger than the noise (%d), need %.1fx" % (
                        g["score"] / max(1, noise), noise, noise_ratio)
    # A weak hit that overlaps a much stronger one is the strong track's shadow.
    keep = []
    for g in out:
        shadow = any(o is not g and o["score"] >= 4 * g["score"]
                     and o["start"] < g["end"] + HOP_S and g["start"] < o["end"] + HOP_S for o in out)
        if not shadow:
            keep.append(g)
        else:
            for c in chains:
                if c["track"] == g["track"] and c["start"] == g["start"]:
                    c["verdict"] = "rejected: overlaps a much stronger track"
    LAST_DEBUG = {"duration": round(dur, 1), "windows_with_hits": len(hits),
                  "chains": [{"track": c["track"], "start": round(c["start"], 1), "end": round(c["end"], 1),
                              "track_pos": round(c["track_pos"], 1), "windows": c["n"], "score": c["score"],
                              "pct": round(c["pct"], 1),
                              "verdict": c.get("verdict", "")}
                             for c in sorted(chains, key=lambda c: -c["score"])]}
    return sorted(keep, key=lambda g: g["start"])
