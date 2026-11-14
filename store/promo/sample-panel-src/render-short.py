"""Short promo: a fast cut of cdd-stoich-tools-promo-full.mp4.

Takes ~2 s out of the settled part of each chosen scene, hard cuts, its own
progress bar, music from the top of the original track.

usage: python render-short.py <repo> <ffmpeg.exe> <out.mp4>
"""
import os, subprocess, sys
import numpy as np

W, H, FPS = 1920, 1080, 30
REPO, FFMPEG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FULL = os.path.join(REPO, "store", "promo", "cdd-stoich-tools-promo-full.mp4")
MUSIC = os.path.join(REPO, "store", "promo", "cdd-stoich-tools-promo.mp4")

N0 = 45.4          # where the new scenes start in the full video
D = 4.6            # length of each new scene
def new(i, length=1.9):
    s = N0 + i * D + 2.35      # captions and callouts are all in by then
    return (s, s + length)

CLIPS = [
    (0.8, 2.8),        # title
    (8.6, 10.8),       # sample panel
    (19.8, 21.9),      # fill from the sample record
    (26.6, 28.6),      # batch picker
    (32.0, 34.0),      # A4 print sheet
    (13.0, 14.9),      # copy fields between vaults
    new(0),            # copy as next step
    new(1),            # HPLC injection
    new(3),            # several samples at once
    new(4),            # location tree preview
    new(5),            # scan racks
    new(6),            # merge vaults
    new(8),            # plate map preview
    new(9),            # column manager
    new(11),           # dose-response easy override
    (N0 + 12 * D + 1.7, N0 + 12 * D + 6.4),   # end card
]
TOTAL = sum(b - a for a, b in CLIPS)

parts = "".join(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}];" for i, (a, b) in enumerate(CLIPS))
cat = "".join(f"[v{i}]" for i in range(len(CLIPS))) + f"concat=n={len(CLIPS)}:v=1:a=0[v]"
dec = subprocess.Popen([FFMPEG, "-v", "error", "-i", FULL, "-filter_complex", parts + cat,
                        "-map", "[v]", "-r", str(FPS), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       stdout=subprocess.PIPE)
enc = subprocess.Popen([FFMPEG, "-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-i", MUSIC, "-map", "0:v", "-map", "1:a",
    "-af", f"afade=t=out:st={TOTAL - 2.5:.2f}:d=2.5", "-t", f"{TOTAL:.2f}",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)

g = np.linspace(0, 1, W)[None, :, None]
BAR = (np.array((56, 189, 248)) * (1 - g) + np.array((52, 211, 153)) * g).astype(np.uint8)
size, n, total_frames = W * H * 3, 0, int(TOTAL * FPS)
while True:
    buf = dec.stdout.read(size)
    if len(buf) < size:
        break
    arr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
    arr[H - 6:, :, :] = (11, 17, 38)
    w = int(W * min(1.0, n / total_frames))
    if w:
        arr[H - 6:, :w, :] = BAR[:, :w, :]
    enc.stdin.write(arr.tobytes())
    n += 1
enc.stdin.close()
enc.wait()
print("frames", n, "seconds", round(TOTAL, 1), "rc", enc.returncode)
