from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = ROOT / "build"
PUBLIC_DIR = ROOT / "public"


def build_icon(size: int) -> Image.Image:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)

    def rr(x0: float, y0: float, x1: float, y1: float, radius: float, **kwargs) -> None:
        draw.rounded_rectangle(
            (int(size * x0), int(size * y0), int(size * x1), int(size * y1)),
            radius=int(size * radius),
            **kwargs,
        )

    for offset, alpha in [(0.0, 38), (0.015, 20), (0.03, 10)]:
        rr(0.17 + offset, 0.30 + offset, 0.83 + offset, 0.89 + offset, 0.13, fill=(0, 0, 0, alpha))

    fries = [
        ((0.28, 0.15, 0.38, 0.60), (245, 215, 77, 255)),
        ((0.38, 0.11, 0.49, 0.62), (250, 225, 102, 255)),
        ((0.49, 0.09, 0.60, 0.63), (247, 218, 88, 255)),
        ((0.60, 0.13, 0.70, 0.61), (252, 228, 116, 255)),
        ((0.70, 0.18, 0.79, 0.58), (244, 210, 64, 255)),
    ]
    for rect, color in fries:
        rr(*rect, 0.05, fill=color, outline=(120, 86, 18, 220), width=max(2, size // 64))

    carton = [
        (int(size * 0.20), int(size * 0.35)),
        (int(size * 0.80), int(size * 0.35)),
        (int(size * 0.71), int(size * 0.86)),
        (int(size * 0.29), int(size * 0.86)),
    ]
    draw.polygon(carton, fill=(211, 67, 61, 255), outline=(120, 32, 28, 255))
    draw.line(carton + [carton[0]], fill=(120, 32, 28, 255), width=max(3, size // 42))
    draw.polygon(
        [
            (int(size * 0.27), int(size * 0.40)),
            (int(size * 0.73), int(size * 0.40)),
            (int(size * 0.67), int(size * 0.74)),
            (int(size * 0.33), int(size * 0.74)),
        ],
        fill=(228, 84, 76, 220),
    )
    rr(0.40, 0.50, 0.60, 0.77, 0.07, fill=(247, 222, 92, 235), outline=(167, 126, 29, 220), width=max(2, size // 64))
    draw.polygon(
        [
            (int(size * 0.20), int(size * 0.35)),
            (int(size * 0.80), int(size * 0.35)),
            (int(size * 0.75), int(size * 0.41)),
            (int(size * 0.25), int(size * 0.41)),
        ],
        fill=(235, 96, 89, 235),
    )
    return icon


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    electron_assets = ROOT / "electron" / "assets"
    electron_assets.mkdir(parents=True, exist_ok=True)

    image_512 = build_icon(512)
    image_512.save(BUILD_DIR / "icon.png")
    image_512.save(PUBLIC_DIR / "app-icon.png")
    image_512.save(BUILD_DIR / "icon.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    image_512.save(electron_assets / "app-icon.png")
    image_512.save(electron_assets / "tray.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])


if __name__ == "__main__":
    main()
