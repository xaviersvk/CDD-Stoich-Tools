"""Full promo, 1920x1080: the 19.16.0 promo's scenes (0-45.4 s, re-used as footage)
followed by new scenes built from stills, and a new end card.

usage: python render2.py <repo> <ffmpeg.exe> <out.mp4> [preview]
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
SH = os.path.join(HERE, "shots")
REPO, FFMPEG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PREVIEW = len(sys.argv) > 4
OLD = os.path.join(REPO, "store", "promo", "cdd-stoich-tools-promo.mp4")
OLD_LEN = 45.4

FD = "C:/Windows/Fonts/"
def font(name, size):
    return ImageFont.truetype(FD + name, size)
BLACK = "seguibl.ttf" if os.path.exists(FD + "seguibl.ttf") else "segoeuib.ttf"
SEMI, REG, BOLD = "seguisb.ttf", "segoeui.ttf", "segoeuib.ttf"
WHITE, MUTED = (240, 244, 252), (150, 164, 190)
BLUE, GREEN, AMBER = (56, 189, 248), (52, 211, 153), (251, 191, 36)

def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)
def ramp(t, a, b):
    return ease((t - a) / (b - a))

def make_bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    base = np.zeros((H, W, 3), np.float32)
    base[:] = (11, 17, 38)
    d1 = np.exp(-(((x - 380) / 900) ** 2 + ((y - 100) / 460) ** 2))
    base += d1[..., None] * np.array([8, 26, 64], np.float32)
    d2 = np.exp(-(((x - 1750) / 620) ** 2 + ((y - 1080) / 340) ** 2))
    base += d2[..., None] * np.array([4, 58, 52], np.float32)
    grid = ((x % 64) < 1) | ((y % 64) < 1)
    base[grid] += 6
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
BG = make_bg()

def rounded(img, r):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], r, fill=255)
    img.putalpha(m)
    return img

def with_shadow(img, blur=30, off=(0, 18), alpha=160):
    pad = blur * 3
    out = Image.new("RGBA", (img.size[0] + pad * 2, img.size[1] + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    a = img.getchannel("A").point(lambda v: v * alpha // 255)
    sh.paste((0, 0, 0, 255), (pad + off[0], pad + off[1]), a)
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    out.alpha_composite(img, (pad, pad))
    return out, pad

def fade(img, a):
    if a >= 0.999:
        return img
    out = img.copy()
    out.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    return out

def put(c, img, xy, a=1.0):
    if a > 0.003:
        c.alpha_composite(fade(img, a), (int(round(xy[0])), int(round(xy[1]))))

def spaced(d, xy, text, f, fill, spacing):
    x = xy[0]
    for ch in text:
        d.text((x, xy[1]), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing

def caption(kicker, title, sub):
    layer = Image.new("RGBA", (W, 260), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    spaced(d, (110, 70), kicker, font(BOLD, 24), BLUE, 5)
    d.text((110, 104), title, font=font(BLACK, 62), fill=WHITE)
    d.text((110, 192), sub, font=font(REG, 29), fill=MUTED)
    return layer

def chip(text, color=BLUE, px=26):
    f = font(BOLD, px)
    tw = int(ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(text, font=f))
    w, h = tw + 44, int(px * 2.1)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([1, 1, w - 2, h - 2], h // 2, fill=(13, 20, 40, 245), outline=color + (255,), width=3)
    d.text((22, h / 2 - 1), text, font=f, fill=WHITE, anchor="lm")
    return img

def ring(w, h, color=BLUE, r=14):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([2, 2, w - 3, h - 3], r, outline=color + (255,), width=5)
    return img

def shot(name, crop, f, white_pad=0):
    img = Image.open(os.path.join(SH, name)).convert("RGB")
    if crop:
        img = img.crop(crop)
    img = img.resize((round(img.size[0] * f), round(img.size[1] * f)), Image.LANCZOS)
    if white_pad:
        card = Image.new("RGB", (img.size[0] + 2 * white_pad, img.size[1] + 2 * white_pad), (255, 255, 255))
        card.paste(img, (white_pad, white_pad))
        img = card
    return rounded(img, 18)

class Scene:
    """Still + caption + callouts. Callouts are (kind, x, y, obj, t_in) in shot pixels (after scaling)."""
    def __init__(self, kicker, title, sub, img, callouts, dur=4.6, top=270):
        self.cap = caption(kicker, title, sub)
        self.img = img
        self.sh, self.pad = with_shadow(img)
        self.callouts = callouts
        self.dur = dur
        avail = H - top - 40
        self.x = (W - img.size[0]) // 2
        self.y = top + max(0, (avail - img.size[1]) // 2)

    def draw(self, c, t):
        put(c, self.cap, (0, 0))
        a = ramp(t, 0.0, 0.5)
        dy = (1 - a) * 26
        put(c, self.sh, (self.x - self.pad, self.y - self.pad + dy), a)
        for x, y, obj, t_in in self.callouts:
            b = ramp(t, t_in, t_in + 0.35)
            put(c, obj, (self.x + x, self.y + y + (1 - b) * 12), b)

SCENES = []

# 1 next step
f = 1.45
SCENES.append(Scene("ELN ENTRIES", "Carry a reaction into the next step",
    "One click: the products become the reactants of a new reaction.",
    shot("nextstep.png", None, f, 0),
    [(int(958 * f), int(8 * f), ring(int(34 * f), int(34 * f)), 1.0),
     (int(958 * f) - 300, 0, chip("Copy as next step"), 1.3)]))

# 2 registration
f = 1.5
SCENES.append(Scene("REGISTRATION", "No more bounce off a missing project",
    "The project picker sits next to Create \u2014 and Create waits until you choose.",
    shot("project.png", (0, 196, 1118, 470), f, 0),
    [(int(660 * f), int(198 * f), ring(int(232 * f), int(50 * f)), 1.0),
     (int(660 * f) - 20, int(198 * f) - 76, chip("Project, right where you submit"), 1.3)]))

# 3 location tree
f = 0.97
SCENES.append(Scene("INVENTORY", "See what is in the box before you open it",
    "Hover a position: sample, amount, location and structure.",
    shot("loctree.png", (150, 0, 567, 783), f, 0),
    [(-370, 300, chip("Sample \u00b7 amount \u00b7 structure"), 1.2),
     (440, 40, chip("Search the location tree"), 1.9)]))

# 4 scan racks
f = 1.2
SCENES.append(Scene("LOCATIONS", "Scan a whole shelf of racks at once",
    "Barcode scanner or a paste from Excel. Nothing is saved until you press Save.",
    shot("scanracks.png", (0, 0, 1304, 600), f, 0),
    [(int(330 * f), int(178 * f), ring(int(960 * f), int(124 * f), GREEN), 1.1),
     (int(700 * f), int(330 * f), chip("A path creates the shelves on the way", GREEN), 1.5)]))

# 5 plates
f = 0.92
SCENES.append(Scene("PLATES", "Know where every plate lives",
    "A Location column on the Plates tab \u2014 and a CSV export of all of it.",
    shot("plates.png", None, f, 0),
    [(int(228 * f), int(120 * f), ring(int(250 * f), int(700 * f)), 1.0),
     (int(1000 * f), int(52 * f), chip("Export plate locations (CSV)"), 1.6)]))

# 6 plate map
f = 1.12
SCENES.append(Scene("PLATE MAP", "Structures right on the plate map",
    "Hover a well to see what is in it \u2014 no click, no new tab.",
    shot("platemap.png", (0, 0, 1231, 650), f, 0),
    [(int(830 * f), int(250 * f), chip("Hover preview"), 1.2)]))

# 7 column manager
f = 1.0
SCENES.append(Scene("TABLES", "Find one column among 128",
    "Search, category chips and type badges in the column manager.",
    shot("colmgr.png", (0, 44, 478, 800), f, 0),
    [(500, 70, chip("Search and categories"), 1.1),
     (500, 300, chip("Entity \u00b7 Batch \u00b7 Sample \u00b7 Event"), 1.6)], top=262))


# ---- second batch of scenes ----
def _save(img, name):
    img.save(os.path.join(SH, name))
    return name

# merged tree: tree crop on top, the footer toggle under it
_t = Image.open(os.path.join(SH, "mergetree.png")).convert("RGB")
_t = _t.resize((int(_t.size[0] * 2.3), int(_t.size[1] * 2.3)), Image.LANCZOS)
_g = Image.open(os.path.join(SH, "mergetoggle.png")).convert("RGB").crop((130, 12, 280, 58))
_g = _g.resize((int(_g.size[0] * 1.7), int(_g.size[1] * 1.7)), Image.LANCZOS)
_m = Image.new("RGB", (_t.size[0] + 60, _t.size[1] + _g.size[1] + 70), (255, 255, 255))
_m.paste(_t, (30, 24))
_m.paste(_g, (30, _t.size[1] + 40))
_save(_m, "merge_comp.png")

# saved searches without the Owner column
# (the raw capture carries colleagues' names in the Owner column, so only the
# stitched saved_comp.png is kept in the repo)
if os.path.exists(os.path.join(SH, "saved.png")):
    _s = Image.open(os.path.join(SH, "saved.png")).convert("RGB")
    _c = Image.new("RGB", (650 + (1535 - 815), 468), (255, 255, 255))
    _c.paste(_s.crop((0, 0, 650, 468)), (0, 0))
    _c.paste(_s.crop((815, 0, 1535, 468)), (650, 0))
    _save(_c, "saved_comp.png")

f = 3.3
HPLC = Scene("HPLC INJECTION", "How much do I inject?",
    "Reaction molarity, aliquot, vial and target amount — the volume, for every reaction.",
    shot("hplc.png", (22, 46, 298, 140), f, 0),
    [(int(196 * f), int(8 * f), ring(int(70 * f), int(34 * f), GREEN), 1.1),
     (int(120 * f), int(94 * f) + 24, chip("Out of range? One sentence says what to change", GREEN), 1.6)])

f = 0.82
PICK = Scene("INVENTORY", "Create several samples at once",
    "Select the empty positions in Pick Location — and find the box by name first.",
    shot("pickloc.png", None, f, 0),
    [(int(1180 * f), int(200 * f), chip("4 positions selected"), 1.1),
     (int(30 * f), int(240 * f), chip("Filter boxes by name"), 1.7)])

f = 1.0
MERGE = Scene("LOCATIONS", "One location tree across all your vaults",
    "Each dot is a vault that has the location. Create the missing ones right here.",
    shot("merge_comp.png", None, f, 0),
    [(520, 150, chip("Each dot = a vault that has it"), 1.1),
     (330, _m.size[1] - 100, chip("Switch on Merge vaults"), 1.7)])

f = 1.0
DOSE = Scene("DOSE-RESPONSE", "Override a curve right in the results",
    "Easy Override puts the choice and Apply under every plot.",
    shot("dose.png", (0, 0, 1470, 760), f, 0),
    [(int(1106 * f), int(384 * f), ring(int(240 * f), int(42 * f)), 1.1),
     (int(1200 * f), int(6 * f), ring(int(170 * f), int(42 * f), AMBER), 1.5),
     (int(760 * f), int(380 * f), chip("Pick and Apply, per plot"), 1.3)])

f = 1.15
SAVED = Scene("SAVED SEARCHES", "Share a search with one click",
    "Copy Link on every saved search — paste it to a colleague.",
    shot("saved_comp.png", None, f, 0),
    [(int(832 * f), int(58 * f), ring(int(84 * f), int(404 * f)), 1.1),
     (int(940 * f), int(-14 * f), chip("Copy Link"), 1.4)])

_ns, _reg, _tree, _scan, _plates, _pmap, _col = SCENES
SCENES = [_ns, HPLC, _reg, PICK, _tree, _scan, MERGE, _plates, _pmap, _col, SAVED, DOSE]

# ---------- end card ----------
def centered(lines, h):
    layer = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = 0
    for txt, fn, px, col, gap in lines:
        d.text((W / 2, y), txt, font=font(fn, px), fill=col, anchor="ma")
        y += int(px * 1.2) + gap
    return layer

icon = Image.open(os.path.join(REPO, "icons", "icon128.png")).convert("RGBA").resize((100, 100), Image.LANCZOS)
tile = rounded(Image.new("RGBA", (130, 130), (255, 255, 255, 255)), 30)
tile.alpha_composite(icon, (15, 15))
ICON, ICON_PAD = with_shadow(tile, blur=22, alpha=150)
END_A = centered([("...and many more", BLACK, 76, WHITE, 26),
                  ("phrases  \u00b7  prefix colours  \u00b7  one-click copy on fields  \u00b7  your own entity-type order", REG, 30, MUTED, 6),
                  ("copy protocol forms between vaults  \u00b7  plate tooltips  \u00b7  sensible filter defaults", REG, 30, MUTED, 0)], 240)
END_B = centered([("100+ users around the world", BLACK, 54, GREEN, 0)], 80)
def pills(labels):
    f = font(REG, 27)
    dd = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    ws = [int(dd.textlength(l, font=f)) + 56 for l in labels]
    layer = Image.new("RGBA", (W, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = (W - sum(ws) - 16 * (len(ws) - 1)) // 2
    for l, w in zip(labels, ws):
        d.rounded_rectangle([x, 1, x + w, 62], 31, fill=(16, 24, 46, 220), outline=(70, 84, 116, 255), width=2)
        d.text((x + w / 2, 31), l, font=f, fill=WHITE, anchor="mm")
        x += w + 16
    return layer
END_P = pills(["Free and open source", "Chrome", "Firefox", "Runs locally in your browser"])
END_U = centered([("github.com/xaviersvk/CDD-Stoich-Tools", SEMI, 34, BLUE, 0)], 60)
END_D = centered([("Written by CDD Vault users. Not a product of, or endorsed by, Collaborative Drug Discovery.",
                   REG, 20, (110, 124, 150), 0)], 40)
END_DUR = 6.6

def end_card(c, t):
    a = ramp(t, 0.0, 0.5)
    put(c, ICON, ((W - 130) // 2 - ICON_PAD, 100 - ICON_PAD), a)
    put(c, END_A, (0, 280 + (1 - a) * 16), a)
    put(c, END_B, (0, 540), ramp(t, 0.6, 1.0))
    put(c, END_P, (0, 650), ramp(t, 0.9, 1.3))
    put(c, END_U, (0, 760), ramp(t, 1.1, 1.5))
    put(c, END_D, (0, 1000), ramp(t, 1.1, 1.5))

NEW_LEN = sum(s.dur for s in SCENES) + END_DUR
TOTAL = OLD_LEN + NEW_LEN
XF = 0.28

def new_frame(t):
    acc = 0.0
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    a = 1.0
    for s in SCENES:
        if t < acc + s.dur:
            lt = t - acc
            s.draw(layer, lt)
            a = min(1.0, lt / XF, (s.dur - lt) / XF)
            break
        acc += s.dur
    else:
        lt = t - acc
        end_card(layer, lt)
        a = min(1.0, lt / XF)
    out = BG.copy()
    out.alpha_composite(fade(layer, max(0.0, a)))
    return out.convert("RGB")

_g = np.linspace(0, 1, W)[None, :, None]
BAR = (np.array(BLUE) * (1 - _g) + np.array(GREEN) * _g).astype(np.uint8)

def bar(arr, p):
    arr[H - 6:, :, :] = (11, 17, 38)
    w = int(W * p)
    if w > 0:
        arr[H - 6:, :w, :] = BAR[:, :w, :]
    return arr

if PREVIEW:
    acc = 0.0
    for i, s in enumerate(SCENES):
        new_frame(acc + 3.6).save(os.path.join(HERE, "p2_%02d.png" % i))
        acc += s.dur
    new_frame(acc + 4.0).save(os.path.join(HERE, "p2_end.png"))
    sys.exit(0)

# audio: the original track for the re-used part, then two more passes of its
# steady middle (6-49 s; it fades out after 50 s), cross-faded, so music runs to the end
af = (f"[1:a]atrim=0:{OLD_LEN},asetpts=N/SR/TB[a0];"
      "[1:a]atrim=6:49,asetpts=N/SR/TB[a1];[1:a]atrim=6:49,asetpts=N/SR/TB[a2];"
      "[a0][a1]acrossfade=d=1[x];[x][a2]acrossfade=d=1[y];"
      f"[y]atrim=0:{TOTAL},afade=t=out:st={TOTAL - 3}:d=3[a]")
enc = subprocess.Popen([FFMPEG, "-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-i", OLD, "-filter_complex", af, "-map", "0:v", "-map", "[a]", "-t", f"{TOTAL}",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)

dec = subprocess.Popen([FFMPEG, "-v", "error", "-i", OLD, "-t", f"{OLD_LEN}",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-r", str(FPS), "-"], stdout=subprocess.PIPE)
n_old = int(OLD_LEN * FPS)
size = W * H * 3
i = 0
while i < n_old:
    buf = dec.stdout.read(size)
    if len(buf) < size:
        break
    arr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
    enc.stdin.write(bar(arr, (i / FPS) / TOTAL).tobytes())
    i += 1
dec.kill()
n_new = int(NEW_LEN * FPS)
for j in range(n_new):
    t = j / FPS
    arr = np.asarray(new_frame(t)).copy()
    enc.stdin.write(bar(arr, (i / FPS + t) / TOTAL).tobytes())
enc.stdin.close()
enc.wait()
print("old frames", i, "new frames", n_new, "total s", round(TOTAL, 1), "rc", enc.returncode)
