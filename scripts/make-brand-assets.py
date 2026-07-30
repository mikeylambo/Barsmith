#!/usr/bin/env python3
"""
make-brand-assets.py — regenerates the committed brand images in public/:

    og-image.png             social share card (1200x630)
    icon-512.png             PWA install icon, opaque background
    icon-maskable-512.png    Android adaptive icon, artwork inside the safe zone

This is a design-asset generator, NOT part of `npm run build`. The outputs are
committed, so a normal build/deploy never needs Python. Run this only when the
tagline, wordmark, or brand colours change.

Requirements (not in package.json — this is the only Python in the repo):
    pip install Pillow fonttools brotli

Why it renders rather than hand-composing in an image editor:
  * The card must use the same Inter cut as the app UI, so it is drawn with the
    self-hosted src/assets/fonts/inter-latin.woff2 — one source of truth for the
    typeface. Pillow cannot read woff2, so the font is decompressed to a temp TTF.
  * The anvil mark is cropped out of the original icon artwork rather than
    re-drawn. The full lockup includes a "BARSMITH" wordmark whose light-on-light
    styling was designed for a white background and reads with inverted emphasis
    on the app's near-black; setting the wordmark in Inter Black instead matches
    what the app itself actually looks like.

Usage:
    python3 scripts/make-brand-assets.py
"""

import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib.woff2 import decompress

ROOT = Path(__file__).resolve().parent.parent
FONT_WOFF2 = ROOT / "src/assets/fonts/inter-latin.woff2"
# The untouched original lockup (transparent background, full wordmark). Kept as
# the source of truth for the artwork so regenerating icons is not lossy — the
# shipped icon-512.png is a composite derived from it.
ICON_SRC = ROOT / "src/assets/brand-lockup.png"
OUT = ROOT / "public/og-image.png"
OUT_ICON = ROOT / "public/icon-512.png"
OUT_MASKABLE = ROOT / "public/icon-maskable-512.png"

# 1200x630 is the size Open Graph consumers (and Twitter's summary_large_image)
# crop toward; anything else gets letterboxed or centre-cropped unpredictably.
W, H = 1200, 630
BG = (5, 5, 5)                  # #050505 — matches theme_color and the app shell
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)          # tailwind gray-400, as used for body copy in-app
DIM = (107, 114, 128)           # tailwind gray-500, for the small feature line

# The anvil + hammer + sparks, with the icon's wordmark cropped away. Bounds found
# by inspecting the alpha channel: full artwork spans x 48-454, and the wordmark
# starts around x 205 (its sparks overlap the "B", so the cut is just before it).
ANVIL_BOX = (48, 160, 175, 305)

TAGLINE = [
    "A writing gym, rhyme reference, and idea-capture",
    "tool for serious hip-hop writers.",
]
FEATURES = "WORD DRILLS  ·  BPM GRID  ·  RHYME MAPS  ·  WORKS OFFLINE"


def inter(ttf_path, size, weight):
    """Load the Inter variable font at a specific optical weight."""
    f = ImageFont.truetype(str(ttf_path), size)
    f.set_variation_by_axes([weight])
    return f


def make_icons():
    """
    Two problems with the icons this replaces:

    1. icon-512.png shipped with a fully transparent background and near-white
       artwork. Install surfaces composite a transparent icon over a backdrop of
       their choosing, so on any light launcher background the near-white anvil
       and wordmark were close to invisible. An opaque #050505 field — the same
       colour as theme_color and the app shell — makes it render identically
       everywhere.

    2. Neither icon declared `purpose: "maskable"`, so Android treated them as
       legacy icons and applied its adaptive mask anyway. The mask keeps only a
       centred circle 80% of the icon's width, which cropped the ends clean off
       a wordmark spanning the full frame. The maskable variant therefore drops
       the wordmark entirely and uses the anvil alone, sized to sit inside that
       safe circle — which is what a launcher icon should be regardless.
    """
    src = Image.open(ICON_SRC).convert("RGBA")

    # ── purpose: any — full lockup on an opaque field ──
    icon = Image.new("RGBA", src.size, (*BG, 255))
    icon.alpha_composite(src)
    icon.convert("RGB").save(OUT_ICON, optimize=True)

    # ── purpose: maskable — anvil only, inside Android's safe zone ──
    # The safe zone is a centred circle of diameter 80% of the icon width. Artwork
    # survives the mask only if its bounding box fits that circle, i.e. the box
    # diagonal must not exceed it.
    size = src.width
    safe_diameter = size * 0.8
    anvil = src.crop(ANVIL_BOX)
    ratio = anvil.width / anvil.height
    # diagonal = h * sqrt(ratio^2 + 1); solve for the tallest h that still fits,
    # then take 96% of it so the artwork does not kiss the mask boundary.
    h = int((safe_diameter / ((ratio**2 + 1) ** 0.5)) * 0.96)
    anvil = anvil.resize((int(h * ratio), h), Image.LANCZOS)

    maskable = Image.new("RGBA", (size, size), (*BG, 255))
    maskable.alpha_composite(anvil, ((size - anvil.width) // 2, (size - anvil.height) // 2))
    maskable.convert("RGB").save(OUT_MASKABLE, optimize=True)

    for p in (OUT_ICON, OUT_MASKABLE):
        print(f"wrote {p.relative_to(ROOT)} ({p.stat().st_size // 1024} KB)")


def make_og_card():
    with tempfile.TemporaryDirectory() as tmp:
        ttf = Path(tmp) / "inter.ttf"
        decompress(str(FONT_WOFF2), str(ttf))

        card = Image.new("RGB", (W, H), BG)

        # Forge glow: a soft warm pool behind the mark. Drawn large and downscaled
        # so the falloff is smooth without a real blur pass.
        glow = Image.new("RGB", (W // 4, H // 4), BG)
        gd = ImageDraw.Draw(glow)
        cx, cy = 74, 62
        for r in range(70, 0, -1):
            t = 1 - (r / 70)
            gd.ellipse(
                [cx - r, cy - r, cx + r, cy + r],
                fill=(int(5 + 30 * t**2), int(5 + 16 * t**2), int(5 + 6 * t**2)),
            )
        card.paste(glow.resize((W, H), Image.LANCZOS), (0, 0))

        d = ImageDraw.Draw(card)

        # ── Anvil mark, top-left ──
        anvil = Image.open(ICON_SRC).convert("RGBA").crop(ANVIL_BOX)
        scale = 190 / anvil.height
        anvil = anvil.resize((int(anvil.width * scale), 190), Image.LANCZOS)
        card.paste(anvil, (78, 74), anvil)

        # ── Wordmark ──
        # tracking-tighter in the app translates to a small negative letter-space,
        # which Pillow has no native support for — so glyphs are stepped manually.
        word_font = inter(ttf, 132, 900)
        x, y = 74, 298
        for ch in "BARSMITH":
            d.text((x, y), ch, font=word_font, fill=WHITE)
            x += d.textlength(ch, font=word_font) - 5

        # ── Tagline ──
        tag_font = inter(ttf, 37, 400)
        ty = 462
        for line in TAGLINE:
            d.text((78, ty), line, font=tag_font, fill=GRAY)
            ty += 46

        # ── Feature line, widely tracked to echo the app's uppercase labels ──
        feat_font = inter(ttf, 19, 800)
        fx = 78
        for ch in FEATURES:
            d.text((fx, 570), ch, font=feat_font, fill=DIM)
            fx += d.textlength(ch, font=feat_font) + 1.6

        card.save(OUT, optimize=True)
        print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    make_icons()
    make_og_card()
