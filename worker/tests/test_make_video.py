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
    assert command[command.index("-crf") + 1] == str(make_video.VIDEO_CRF) and int(make_video.VIDEO_CRF) <= 18  # video nét, không nén mạnh


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


def _telemetry_csv(run: Path, frames: list[int]) -> None:
    sensors = run / "sensors"
    sensors.mkdir(parents=True, exist_ok=True)
    lines = ["frame,sim_time_s,ego_speed_ms,throttle,brake"] + [f"{n},{i * 0.1:.1f},{10.0 + i},0,{0.5 if i else 0}" for i, n in enumerate(frames)]
    (sensors / "frames.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_load_telemetry_maps_frame_to_time_speed_kmh_and_brake(tmp_path: Path) -> None:
    _telemetry_csv(tmp_path, [100, 110])
    (tmp_path / "sensors" / "frames.csv").write_text(
        (tmp_path / "sensors" / "frames.csv").read_text(encoding="utf-8") + "bad,row,x,y,z\n", encoding="utf-8")  # hàng hỏng bị bỏ qua
    data = make_video.load_telemetry(tmp_path / "sensors" / "frames.csv")
    assert data[100] == (0.0, 36.0, 0.0) and data[110] == pytest.approx((0.1, 39.6, 0.5))
    assert make_video.load_telemetry(tmp_path / "none.csv") == {}


def test_overlay_draws_speed_on_a_copy_without_touching_the_source(tmp_path: Path) -> None:
    pil = pytest.importorskip("PIL.Image")
    camera = tmp_path / "sensors" / "camera"
    camera.mkdir(parents=True)
    pil.new("RGB", (1280, 720), (30, 90, 160)).save(camera / "00000100.png")
    _telemetry_csv(tmp_path, [100])
    frames = make_video.frame_files(camera)
    work = tmp_path / "sensors" / make_video.OVERLAY_DIR
    assert make_video.draw_overlays(frames, make_video.load_telemetry(tmp_path / "sensors" / "frames.csv"), work) is True
    with pil.open(camera / "00000100.png") as original, pil.open(work / "00000100.png") as drawn:
        assert original.getpixel((60, 640)) == (30, 90, 160)  # ảnh gốc giữ nguyên
        assert drawn.size == (1280, 720) and drawn.tobytes() != original.tobytes()  # bản vẽ có bảng số liệu
    assert make_video.draw_overlays(frames, {}, tmp_path / "x") is False  # không có số liệu thì dùng ảnh gốc


def test_frames_are_dropped_only_after_the_video_exists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    camera = _frames(tmp_path, [1, 11])
    monkeypatch.setattr(make_video, "draw_overlays", lambda *a, **k: False)

    def fake_make(source, out_path, interval_s, **kwargs):  # noqa: ANN001, ANN202
        out_path.write_bytes(b"mp4")
        return out_path

    monkeypatch.setattr(make_video, "make_video", fake_make)
    assert make_video.build_run_video(tmp_path, 0.1, keep_frames=True) == tmp_path / make_video.VIDEO_NAME
    assert camera.is_dir()  # --keep-frames giữ ảnh
    assert make_video.build_run_video(tmp_path, 0.1) == tmp_path / make_video.VIDEO_NAME
    assert not camera.exists()  # mặc định ảnh được xoá sau khi ghép xong
    assert sorted(p.name for p in (tmp_path / "sensors").iterdir()) == []  # và không để lại thư mục tạm


def test_frames_are_kept_when_the_video_cannot_be_built(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    camera = _frames(tmp_path, [1, 11])
    monkeypatch.setattr(make_video, "draw_overlays", lambda *a, **k: False)
    monkeypatch.setattr(make_video, "make_video", lambda *a, **k: None)  # không có ffmpeg
    assert make_video.build_run_video(tmp_path, 0.1) is None
    assert len(list(camera.iterdir())) == 2  # không có video thì ảnh là thứ duy nhất để xem


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
