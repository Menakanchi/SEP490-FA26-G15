"""Ghép ảnh camera RGB của một run CARLA thành ``video.mp4`` để xem lại trên web, có vẽ tốc độ xe lên hình.

Chỉ là bước trình bày sau khi run đã xong: không đi vào lõi AEB, không đổi ``result.json`` nên không đổi identity run. Video hỏng hay thiếu ffmpeg
không làm hỏng run — ``build_run_video`` chỉ in cảnh báo và trả ``None``; khi đó ảnh PNG được giữ lại để vẫn xem được từng khung.

ffmpeg lấy từ gói ``imageio-ffmpeg`` (đã kèm file thực thi, có libx264) hoặc ``ffmpeg`` trong PATH. Số liệu vẽ lên hình (tốc độ, phanh, thời gian) đọc từ
``sensors/frames.csv`` theo số frame CARLA, nên khớp đúng khung ảnh; cần Pillow, thiếu thì video không có chữ.
"""

from __future__ import annotations

import csv
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

VIDEO_NAME = "video.mp4"
FRAME_NAME = re.compile(r"^[0-9]{8}\.png$")
FFMPEG_TIMEOUT_S = 120.0
VIDEO_CRF = 17  # libx264: càng nhỏ càng nét (18 ≈ gần như không mất chi tiết nhìn thấy được; trước đây 23 làm video mờ)
OVERLAY_DIR = "video_frames"  # thư mục tạm chứa ảnh đã vẽ số liệu; xoá sau khi ghép


def find_ffmpeg() -> str | None:
    """Đường dẫn ffmpeg: ưu tiên bản kèm gói imageio-ffmpeg, sau đó PATH; không có thì ``None``."""
    try:
        import imageio_ffmpeg  # noqa: PLC0415 — thư viện tuỳ chọn

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 — thiếu gói hoặc không tìm được binary đều rơi về PATH
        return shutil.which("ffmpeg")


def frame_files(camera_dir: Path) -> list[Path]:
    """Ảnh ``camera/<frame 8 chữ số>.png`` theo thứ tự frame."""
    if not camera_dir.is_dir():
        return []
    return sorted(p for p in camera_dir.iterdir() if FRAME_NAME.match(p.name))


def load_telemetry(frames_csv: Path) -> dict[int, tuple[float, float, float]]:
    """``sensors/frames.csv`` → ``{frame: (sim_time_s, tốc độ km/h, phanh 0..1)}``. File thiếu hoặc hàng hỏng thì bỏ qua hàng đó."""
    if not frames_csv.is_file():
        return {}
    out: dict[int, tuple[float, float, float]] = {}
    with frames_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            try:
                out[int(row["frame"])] = (float(row["sim_time_s"]), float(row["ego_speed_ms"]) * 3.6, min(1.0, max(0.0, float(row["brake"]))))
            except (KeyError, TypeError, ValueError):
                continue
    return out


def draw_overlay(image, speed_kmh: float, brake: float, t_s: float):  # noqa: ANN001, ANN201 — PIL.Image (nhập trễ)
    """Vẽ bảng số liệu ở góc trái dưới: tốc độ km/h cỡ lớn, thanh phanh, thời gian mô phỏng. Chữ không dấu để font mặc định nào cũng hiển thị được."""
    from PIL import Image, ImageDraw, ImageFont  # noqa: PLC0415 — Pillow tuỳ chọn

    width, height = image.size
    k = width / 1280.0  # bố cục thiết kế cho 1280×720
    panel_w, panel_h, margin = round(340 * k), round(158 * k), round(24 * k)
    left, top = margin, height - margin - panel_h
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((left, top, left + panel_w, top + panel_h), radius=round(14 * k), fill=(10, 14, 20, 165))
    big, mid, small = (ImageFont.load_default(size=max(10, round(s * k))) for s in (74, 28, 24))
    draw.text((left + 20 * k, top + 8 * k), f"{speed_kmh:.0f}", font=big, fill=(255, 255, 255, 255))
    draw.text((left + 20 * k + draw.textlength(f"{speed_kmh:.0f}", font=big) + 10 * k, top + 52 * k), "km/h", font=mid, fill=(200, 210, 225, 255))
    bar_l, bar_t, bar_w, bar_h = left + 20 * k, top + 100 * k, 190 * k, 16 * k
    draw.rounded_rectangle((bar_l, bar_t, bar_l + bar_w, bar_t + bar_h), radius=bar_h / 2, fill=(255, 255, 255, 60))
    if brake > 0.01:
        draw.rounded_rectangle((bar_l, bar_t, bar_l + bar_w * brake, bar_t + bar_h), radius=bar_h / 2, fill=(236, 64, 52, 255))
    draw.text((bar_l + bar_w + 14 * k, bar_t - 5 * k), "PHANH", font=small, fill=(255, 140, 130, 255) if brake > 0.01 else (170, 180, 195, 255))
    draw.text((left + 20 * k, top + 124 * k), f"t = {t_s:.1f} s", font=small, fill=(200, 210, 225, 255))
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def draw_overlays(frames: list[Path], telemetry: dict[int, tuple[float, float, float]], out_dir: Path) -> bool:
    """Vẽ số liệu lên từng ảnh, ghi vào ``out_dir`` (cùng tên file). ``False`` khi không làm được (thiếu Pillow / không có số liệu): khi đó dùng ảnh gốc."""
    try:
        from PIL import Image  # noqa: PLC0415
    except ImportError:
        print("[video] Thiếu Pillow nên video không có số liệu tốc độ (pip install pillow).", file=sys.stderr)
        return False
    if not telemetry:
        return False
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in frames:
        t_s, speed_kmh, brake = telemetry.get(int(path.stem), (0.0, 0.0, 0.0))
        with Image.open(path) as image:
            draw_overlay(image, speed_kmh, brake, t_s).save(out_dir / path.name, compress_level=1)
    return True


def concat_list(frames: list[Path], interval_s: float) -> str:
    """Danh sách cho demuxer ``concat`` của ffmpeg. Số frame trong tên file không liên tục (recorder lưu mỗi N frame) nên không dùng mẫu ``%08d``.

    Mỗi ảnh giữ ``interval_s`` giây; ảnh cuối lặp lại một dòng vì ffmpeg bỏ qua ``duration`` của mục cuối.
    """
    def entry(path: Path) -> str:
        return "file '" + path.resolve().as_posix().replace("'", "'\\''") + "'"

    lines: list[str] = []
    for path in frames:
        lines += [entry(path), f"duration {interval_s:.6f}"]
    lines.append(entry(frames[-1]))
    return "\n".join(lines) + "\n"


def make_video(camera_dir: Path, out_path: Path, interval_s: float, *, ffmpeg: str | None = None,
               runner: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> Path | None:
    """Ghép ``camera_dir/*.png`` thành mp4 H.264. Trả đường dẫn video, hoặc ``None`` khi không có ảnh / không có ffmpeg.

    ffmpeg lỗi thì ném ``RuntimeError`` kèm đuôi stderr. File được ghi tạm rồi đổi tên, nên không bao giờ để lại mp4 dở dang.
    """
    frames = frame_files(camera_dir)
    if not frames:
        return None
    exe = ffmpeg or find_ffmpeg()
    if exe is None:
        return None
    fps = max(1, round(1.0 / interval_s))
    listing = out_path.with_name(out_path.stem + ".concat.txt")
    partial = out_path.with_name(out_path.stem + ".partial.mp4")
    listing.write_text(concat_list(frames, interval_s), encoding="utf-8")
    command = [exe, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
               "-vf", f"fps={fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(VIDEO_CRF), "-movflags", "+faststart", str(partial)]
    try:
        done = runner(command, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S, check=False)
        if done.returncode != 0 or not partial.is_file() or partial.stat().st_size == 0:
            raise RuntimeError(f"ffmpeg mã {done.returncode}: {(done.stderr or '').strip()[-400:]}")
        partial.replace(out_path)
    finally:
        listing.unlink(missing_ok=True)
        partial.unlink(missing_ok=True)
    return out_path


def build_run_video(run_dir: Path, interval_s: float, *, keep_frames: bool = False) -> Path | None:
    """Tạo ``<run_dir>/video.mp4`` từ ``<run_dir>/sensors/camera`` (có vẽ số liệu từ ``sensors/frames.csv``).

    Không bao giờ làm hỏng run: lỗi chỉ thành cảnh báo trên stderr và ảnh PNG được giữ lại. Ghép xong thì xoá ``sensors/camera`` (video đã thay ảnh, mỗi run
    đỡ khoảng 70 MB) trừ khi ``keep_frames``.
    """
    out_path = run_dir / VIDEO_NAME
    out_path.unlink(missing_ok=True)  # không để video của lần chạy trước đứng cạnh kết quả mới
    camera_dir = run_dir / "sensors" / "camera"
    work = run_dir / "sensors" / OVERLAY_DIR
    try:
        source = camera_dir
        try:
            if draw_overlays(frame_files(camera_dir), load_telemetry(run_dir / "sensors" / "frames.csv"), work):
                source = work
        except Exception as exc:  # noqa: BLE001 — chữ trên hình chỉ là phụ, không có thì dùng ảnh gốc
            print(f"[video] Không vẽ được số liệu lên hình, dùng ảnh gốc: {exc}", file=sys.stderr)
        video = make_video(source, out_path, interval_s)
    except Exception as exc:  # noqa: BLE001 — video chỉ là phần xem lại
        print(f"[video] Không tạo được {VIDEO_NAME}: {exc}", file=sys.stderr)
        return None
    finally:
        shutil.rmtree(work, ignore_errors=True)
    if video is None:
        print(f"[video] Bỏ qua {VIDEO_NAME}: chưa có ảnh camera hoặc chưa cài ffmpeg (pip install imageio-ffmpeg).", file=sys.stderr)
        return None
    if not keep_frames:
        shutil.rmtree(camera_dir, ignore_errors=True)
    return video
