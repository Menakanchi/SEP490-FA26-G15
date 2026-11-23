"""Ghép ảnh camera RGB của một run CARLA thành ``video.mp4`` để xem lại trên web.

Chỉ là bước trình bày sau khi run đã xong: không đi vào lõi AEB, không đổi ``result.json`` nên không đổi identity run. Video hỏng hay thiếu ffmpeg
không làm hỏng run — ``build_run_video`` chỉ in cảnh báo và trả ``None``; web vẫn xem được ảnh từng khung.

ffmpeg lấy từ gói ``imageio-ffmpeg`` (đã kèm file thực thi, có libx264) hoặc ``ffmpeg`` trong PATH.
"""

from __future__ import annotations

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


def build_run_video(run_dir: Path, interval_s: float) -> Path | None:
    """Tạo ``<run_dir>/video.mp4`` từ ``<run_dir>/sensors/camera``. Không bao giờ làm hỏng run: lỗi chỉ thành cảnh báo trên stderr."""
    out_path = run_dir / VIDEO_NAME
    out_path.unlink(missing_ok=True)  # không để video của lần chạy trước đứng cạnh kết quả mới
    try:
        video = make_video(run_dir / "sensors" / "camera", out_path, interval_s)
    except Exception as exc:  # noqa: BLE001 — video chỉ là phần xem lại
        print(f"[video] Không tạo được {VIDEO_NAME}: {exc}", file=sys.stderr)
        return None
    if video is None:
        print(f"[video] Bỏ qua {VIDEO_NAME}: chưa có ảnh camera hoặc chưa cài ffmpeg (pip install imageio-ffmpeg).", file=sys.stderr)
    return video
