"""Guardrails của Trợ lý dự án (ADR-029): bảo vệ dữ liệu người dùng và chống prompt injection.

Bốn lớp, mỗi lớp có máy kiểm trong ``tests/test_vehicsim/test_assistant.py``:

1. **Đầu vào** (``check_question``): câu đòi ghi đè luật / tiết lộ prompt, hoặc đòi giá trị bí
   mật (API key, ``.env``, mật khẩu, email người dùng) bị chặn **trước khi** gọi LLM.
2. **Dữ liệu ra từ công cụ** (``scrub``): bỏ mọi khoá có tên nhạy cảm (email, password, token,
   người tạo/duyệt...), che email / API key / JWT / chuỗi bí mật dài trong mọi chuỗi. Trợ lý
   không bao giờ thấy thông tin cá nhân — tên người duyệt, email... chỉ xem trên màn hình.
3. **Văn bản do người dùng nhập** (tên họ kịch bản, mô tả, ghi chú AEB, lý do duyệt, tài
   liệu): ``neutralize`` thay câu giống mệnh lệnh cho AI bằng ``[đã lược …]`` — dữ liệu không
   được phép điều khiển trợ lý.
4. **Đầu ra** (``guard_answer``): che lại bí mật lần nữa; câu trả lời lộ một đoạn system
   prompt bị thay bằng lời từ chối.

Đây là phòng thủ nhiều lớp, không phải bộ lọc hoàn hảo: lớp quan trọng nhất là công cụ
**không có đường** tới bảng người dùng, cấu hình hay file (``agent_tools.py``).
"""

from __future__ import annotations

import re
import unicodedata

REDACTED_EMAIL = "[email ẩn]"
REDACTED_KEY = "[khoá ẩn]"
REDACTED_TOKEN = "[token ẩn]"
REDACTED_SECRET = "[chuỗi bí mật ẩn]"
NEUTRALIZED = "[đã lược: nội dung giống câu lệnh cho AI]"

BLOCKED_INJECTION = (
    "Mình không thể làm theo yêu cầu thay đổi luật, đổi vai hay tiết lộ hướng dẫn nội bộ. Bạn cứ hỏi về dữ liệu "
    "project — lượt chạy, ca lỗi, tham số AEB, regression — mình sẽ tra cứu và dẫn nguồn."
)
BLOCKED_SECRET = (
    "Mình không truy cập và không cung cấp thông tin bí mật hay thông tin cá nhân (API key, file .env, mật khẩu, "
    "token, email/danh sách người dùng). Thông tin tài khoản do quản trị viên quản lý ở màn hình riêng."
)


def fold(text: str) -> str:
    """Chữ thường, bỏ dấu tiếng Việt (đ → d) — để mẫu bắt được cả câu gõ không dấu."""
    text = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(ch for ch in text if not unicodedata.combining(ch))


# Mẫu so trên văn bản đã ``fold``. Ưu tiên bắt chắc ý đồ, chấp nhận lọt câu lách khéo —
# lớp sau (công cụ không có quyền, prompt, kiểm đầu ra) vẫn còn.
_INJECTION = re.compile(
    r"\b(bo qua|phot lo|quen di|ghi de|vo hieu)\b.{0,40}\b(huong dan|chi dan|luat|quy tac|lenh|prompt|rang buoc)"
    r"|\b(ignore|disregard|forget|override)\b.{0,40}\b(instruction|rule|prompt|above|previous|guardrail)"
    r"|system\s*prompt|prompt\s*(he thong|goc|noi bo)|developer\s*mode|jailbreak|\bdan\s*mode"
    r"|\byou are now\b|\bact as\b|\bpretend to\b|\bdong vai\b|\bban (bay )?gio la\b|\btu gio ban la\b"
    r"|\b(tiet lo|in ra|hien thi|cho xem|reveal|print|show)\b.{0,40}\b(prompt|huong dan (he thong|noi bo)|instruction)"
    r"|<\|?\s*(system|im_start|im_end)\s*\|?>|\[/?inst\]|#{2,}\s*(system|instruction)"
)
_SECRET_REQUEST = re.compile(
    r"api[\s_-]*key|\.env\b|openai_api_key|deepseek_api_key|jwt[\s_-]*secret|secret[\s_-]*key"
    r"|smtp[\s_-]*(pass|mat khau)|connection string|chuoi ket noi|database_url|\bdsn\b"
    r"|\b(mat khau|password)\b.{0,20}\b(cua|admin|database|db|smtp|gmail|email|tai khoan|user|nguoi dung|for|of)\b"
    r"|\b(email|so dien thoai|dia chi|thong tin ca nhan)\b.{0,20}\b(cua|nguoi dung|user|ky su|thanh vien|admin)\b"
    r"|danh sach\b.{0,15}\b(email|nguoi dung|tai khoan|user|thanh vien)"
    r"|\b(access|refresh|bearer)\s*token\b|\bma otp\b.{0,15}\bcua\b"
)

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_OPENAI_KEY = re.compile(r"\bsk-[A-Za-z0-9_\-]{12,}")
_JWT = re.compile(r"\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}")
# Hex dài, hoặc chuỗi LIỀN ≥ 32 ký tự trộn đủ hoa + thường + số như khoá thật. Không bắt tên
# file tài liệu ("ADR-027-bo-mo-phong-cam-duoc-hop-dong-json": các đoạn ngắn nối bằng "-").
_LONG_SECRET = re.compile(
    r"\b[A-Fa-f0-9]{32,}\b|\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]{32,}\b"
)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Khoá không bao giờ được rời công cụ, dù công cụ nào lỡ đưa vào.
_SENSITIVE_KEY = re.compile(
    r"email|password|passwd|pwd|hash|token|secret|otp|api_?key|phone|ip_?addr|"
    r"created_by|reviewed_by|requested_by|owner|author|user|full_name|reviewer",
    re.IGNORECASE,
)


def check_question(text: str) -> str | None:
    """``"injection"`` / ``"secret"`` nếu câu hỏi phải chặn, ``None`` nếu cho qua."""
    folded = fold(text)
    if _INJECTION.search(folded):
        return "injection"
    if _SECRET_REQUEST.search(folded):
        return "secret"
    return None


def redact(text: str) -> str:
    """Che email, API key, JWT, chuỗi bí mật dài trong một chuỗi bất kỳ."""
    text = _EMAIL.sub(REDACTED_EMAIL, text)
    text = _OPENAI_KEY.sub(REDACTED_KEY, text)
    text = _JWT.sub(REDACTED_TOKEN, text)
    return _LONG_SECRET.sub(REDACTED_SECRET, text)


def neutralize(text: str | None, limit: int = 300) -> str:
    """Văn bản người dùng nhập → an toàn để đưa vào ngữ cảnh LLM.

    Bỏ ký tự điều khiển, dấu rào code, gộp khoảng trắng, cắt ngắn; câu nào giống mệnh lệnh
    cho AI thì thay bằng ``NEUTRALIZED`` (cắt theo câu để giữ phần vô hại).
    """
    if not text:
        return ""
    text = _CONTROL.sub(" ", str(text)).replace("```", " ").replace("<|", " ").replace("|>", " ")
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?;:\n])\s+", text)
    kept = [NEUTRALIZED if _INJECTION.search(fold(s)) or _SECRET_REQUEST.search(fold(s)) else s for s in sentences]
    out = redact(" ".join(dict.fromkeys(kept)))  # gộp nhiều câu bị lược liền nhau
    return out if len(out) <= limit else out[: limit - 1] + "…"


def neutralize_document(text: str) -> str:
    """Như ``neutralize`` nhưng giữ xuống dòng, không cắt — cho tài liệu repo khi lập chỉ mục."""
    lines = []
    for line in text.splitlines():
        lines.append(NEUTRALIZED if _INJECTION.search(fold(line)) else line)
    return redact("\n".join(lines))


def scrub(value):
    """Đệ quy: bỏ khoá nhạy cảm, che bí mật trong mọi chuỗi. Dùng cho MỌI kết quả công cụ."""
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items() if not _SENSITIVE_KEY.search(str(k))}
    if isinstance(value, (list, tuple)):
        return [scrub(v) for v in value]
    if isinstance(value, str):
        return redact(value)
    return value


# Trường văn bản tự do do người dùng nhập trong payload ``views.py`` — có thể chứa câu lệnh cài cắm.
FREE_TEXT_KEYS = frozenset(
    {"name", "description", "notes", "note", "conditions", "family", "title", "label", "natural_language_input"}
)


def clean(value, *, limit: int = 300):
    """``scrub`` + ``neutralize`` các trường văn bản tự do. Dùng cho mọi payload view đưa vào LLM."""
    if isinstance(value, dict):
        return {
            k: neutralize(v, limit) if k in FREE_TEXT_KEYS and isinstance(v, str) else clean(v, limit=limit)
            for k, v in value.items()
            if not _SENSITIVE_KEY.search(str(k))
        }
    if isinstance(value, (list, tuple)):
        return [clean(v, limit=limit) for v in value]
    if isinstance(value, str):
        return redact(value)
    return value


def guard_answer(answer: str, system_prompt: str) -> tuple[str, bool]:
    """``(câu trả lời an toàn, đã_chặn)``. Che bí mật; lộ ≥ 60 ký tự liền của system prompt thì từ chối."""
    compact = re.sub(r"\s+", " ", system_prompt)
    plain = re.sub(r"\s+", " ", answer)
    for start in range(0, max(1, len(compact) - 60), 30):
        if compact[start : start + 60] in plain:
            return BLOCKED_INJECTION, True
    return redact(answer), False
