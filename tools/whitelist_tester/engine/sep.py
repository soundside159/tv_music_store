"""Remove voice from audio with the UVR MDX-Net Inst HQ3 ONNX model (no torch).
sep.separate(in_path, out_wav) writes the instrumental (music only) as 44.1k stereo wav.
"""
import os, subprocess, numpy as np, onnxruntime as ort, soundfile as sf
import fp

N_FFT = 6144
HOP = 1024
DIM_F = 3072
DIM_T = 256
COMPENSATE = 1.022
SR = 44100

_sess = None
def _session(model):
    global _sess
    if _sess is None:
        so = ort.SessionOptions()
        _sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
    return _sess

_WIN = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)  # periodic hann

def _stft(x):  # x: (2, n) -> (2, bins, frames) complex, torch.stft(center=True) equivalent
    pad = N_FFT // 2
    x = np.pad(x, ((0, 0), (pad, pad)), mode="reflect")
    nfr = 1 + (x.shape[1] - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(nfr)[:, None]
    fr = x[:, idx] * _WIN  # (2, nfr, N_FFT)
    return np.fft.rfft(fr, axis=2).transpose(0, 2, 1)  # (2, bins, nfr)

def _istft(spec, length):  # spec (2, bins, frames)
    fr = np.fft.irfft(spec.transpose(0, 2, 1), n=N_FFT, axis=2) * _WIN
    nfr = fr.shape[1]
    out = np.zeros((2, N_FFT + HOP * (nfr - 1)), np.float32)
    wsum = np.zeros(out.shape[1], np.float32)
    for i in range(nfr):
        out[:, i * HOP:i * HOP + N_FFT] += fr[:, i]
        wsum[i * HOP:i * HOP + N_FFT] += _WIN ** 2
    out /= np.maximum(wsum, 1e-8)
    pad = N_FFT // 2
    return out[:, pad:pad + length]

def _run_chunk(sess, chunk):  # chunk (2, chunk_size)
    spec = _stft(chunk)[:, :DIM_F, :DIM_T]  # (2, DIM_F, DIM_T)
    x = np.stack([spec[0].real, spec[0].imag, spec[1].real, spec[1].imag])[None].astype(np.float32)
    y = sess.run(None, {"input": x})[0][0]  # (4, DIM_F, DIM_T)
    out = np.zeros((2, N_FFT // 2 + 1, DIM_T), np.complex64)
    out[0, :DIM_F] = y[0] + 1j * y[1]
    out[1, :DIM_F] = y[2] + 1j * y[3]
    return _istft(out, chunk.shape[1])

def load(path):
    raw = subprocess.run([fp.FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True,
                         creationflags=0x08000000 if os.name == "nt" else 0).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()

def separate(in_path, out_wav, model, progress=None):
    sess = _session(model)
    mix = load(in_path)
    n = mix.shape[1]
    chunk = HOP * (DIM_T - 1)
    trim = N_FFT // 2
    gen = chunk - 2 * trim
    pad = gen - n % gen
    m = np.concatenate([np.zeros((2, trim), np.float32), mix, np.zeros((2, pad + trim), np.float32)], 1)
    outs = []
    steps = list(range(0, m.shape[1] - chunk + 1, gen))
    for k, i in enumerate(steps):
        if progress:
            progress(k, len(steps))
        outs.append(_run_chunk(sess, m[:, i:i + chunk])[:, trim:trim + gen])
    inst = np.concatenate(outs, 1)[:, :n] * COMPENSATE
    sf.write(out_wav, inst.T, SR)
    return out_wav
