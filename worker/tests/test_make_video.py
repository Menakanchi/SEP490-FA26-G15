"""Ghép ảnh camera thành video.mp4: chạy được không cần ffmpeg/imageio — ffmpeg được thay bằng hàm giả."""

import subprocess
from pathlib import Path

import make_video
import pytest


def _frames(run: Path, numbers: list[int]) -> Path:
    camera = run / "sensors" / "camera"
    camera.mkdir(parents=True)
    for n in numbers:
        (camera / f"{n:08d}.png").write_bytes(b"png")
    return camera


def _ok_runner(calls: list):
    def run(command, **kwargs):  # noqa: ANN001, ANN202
        calls.append(command)
        Path(command[-1]).write_bytes(b"mp4-bytes")  # ffmpeg thật ghi file đích cuối dòng lệnh
        return subprocess.CompletedProcess(command, 0, "", "")

    return run


def test_frame_files_keep_frame_order_and_skip_other_files(tmp_path: Path) -> None:
    camera = _frames(tmp_path, [301, 21, 101])
    (camera / "notes.txt").write_text("x")
    (camera / "1.png").write_bytes(b"x")
    assert [p.name for p in make_video.frame_files(camera)] == ["00000021.png", "00000101.png", "00000301.png"]
    assert make_video.frame_files(tmp_path / "absent") == []


def test_concat_list_gives_each_frame_its_interval_and_repeats_the_last(tmp_path: Path) -> None:
    camera = _frames(tmp_path, [1, 11])
    text = make_video.concat_list(make_video.frame_files(camera), 0.1)
    lines = text.splitlines()
    assert lines[1] == "duration 0.100000" and lines[3] == "duration 0.100000"
    assert lines[0] != lines[2]
    assert lines[4] == lines[2]  # ffmpeg bỏ duration của mục cuối: lặp lại để ảnh cuối vẫn đủ thời gian


def test_make_video_builds_atomically_and_cleans_temp_files(tmp_path: Path) -> None:
    _frames(tmp_path, [1, 11, 21])
    calls: list = []
    out = tmp_path / make_video.VIDEO_NAME
    result = make_video.make_video(tmp_path / "sensors" / "camera", out, 0.1, ffmpeg="ffmpeg", runner=_ok_runner(calls))
    assert result == out and out.read_bytes() == b"mp4-bytes"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["sensors", "video.mp4"]  # không để lại .partial / .concat
    command = calls[0]
    assert command[0] == "ffmpeg" and "libx264" in command and "+faststart" in command
    assert "fps=10," in command[command.index("-vf") + 1]


def test_make_video_returns_none_without_frames_or_ffmpeg(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    out = tmp_path / make_video.VIDEO_NAME
    assert make_video.make_video(tmp_path / "sensors" / "camera", out, 0.1, ffmpeg="ffmpeg", runner=_ok_runner([])) is None
    _frames(tmp_path, [1])
    monkeypatch.setattr(make_video, "find_ffmpeg", lambda: None)
    assert make_video.make_video(tmp_path / "sensors" / "camera", out, 0.1) is None
    assert not out.exists()


def test_ffmpeg_failure_raises_and_leaves_no_partial_video(tmp_path: Path) -> None:
    _frames(tmp_path, [1, 11])

    def failing(command, **kwargs):  # noqa: ANN001, ANN202
        Path(command[-1]).write_bytes(b"half")
        return subprocess.CompletedProcess(command, 1, "", "Unknown encoder 'libx264'")

    with pytest.raises(RuntimeError, match="libx264"):
        make_video.make_video(tmp_path / "sensors" / "camera", tmp_path / make_video.VIDEO_NAME, 0.1, ffmpeg="ffmpeg", runner=failing)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["sensors"]


def test_build_run_video_never_breaks_the_run_and_drops_a_stale_video(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                                                      capsys: pytest.CaptureFixture[str]) -> None:
    _frames(tmp_path, [1, 11])
    (tmp_path / make_video.VIDEO_NAME).write_bytes(b"old run")

    def boom(*args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        raise RuntimeError("ffmpeg mã 1: lỗi")

    monkeypatch.setattr(make_video, "make_video", boom)
    assert make_video.build_run_video(tmp_path, 0.1) is None  # lỗi chỉ thành cảnh báo
    assert not (tmp_path / make_video.VIDEO_NAME).exists()  # video của lần chạy trước không đứng cạnh kết quả mới
    assert "Không tạo được video.mp4" in capsys.readouterr().err
