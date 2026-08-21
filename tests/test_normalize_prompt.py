"""Khoá hành vi của khoá tra cứu chặn trùng (ADR-015 §15.2).

Cùng loại test như ``test_odd_key_is_stable``: ``normalize_prompt`` là một khoá
tra cứu, và khoá tra cứu hỏng **im lặng**. Đổi nó một chút — thêm bỏ dấu, đổi
thứ tự bước — thì không có gì bắn lỗi, chỉ là chặn trùng ngừng hoạt động với
mọi hàng đã ghi trước đó.
"""

import unicodedata

from src.models.schemas import normalize_prompt


def test_bo_khoang_trang_thua_va_ha_chu():
    assert normalize_prompt("  Xe MÁY  tạt   đầu Ô tô \n") == "xe máy tạt đầu ô tô"


def test_khoang_trang_khac_loai_cung_gop_ve_mot():
    """Tab, xuống dòng và no-break space đều là khoảng trắng.

    U+00A0 đáng kể nhất: nó lọt vào khi người dùng dán câu từ Word hoặc từ web,
    và mắt người không phân biệt được nó với dấu cách thường.
    """
    assert normalize_prompt("xe máy\ttạt\nđầu ô tô") == "xe máy tạt đầu ô tô"


def test_hai_cach_go_dau_tieng_viet_cho_cung_mot_khoa():
    """Telex dựng sẵn và tổ hợp dấu rời phải ra cùng một chuỗi.

    Không có bước NFC thì "tạt" gõ bằng hai kiểu bàn phím là hai chuỗi code
    point khác nhau — trông giống hệt nhau trên màn hình, nhưng ``=`` trong SQL
    thì không.
    """
    dung_san = "xe máy tạt đầu"
    to_hop = unicodedata.normalize("NFD", dung_san)
    assert to_hop != dung_san
    assert normalize_prompt(to_hop) == normalize_prompt(dung_san)


def test_khong_bo_dau_tieng_viet():
    """Bỏ dấu là đổi nghĩa, và đây là khoá dùng để **không** chạy lại một lần sinh.

    Gộp nhầm hai câu khác nhau nghĩa là trả về kết quả của câu kia.
    """
    assert normalize_prompt("tạt đầu") != normalize_prompt("tat dau")
    assert "ạ" in normalize_prompt("tạt đầu")


def test_chuoi_rong_va_chi_khoang_trang_ve_rong():
    assert normalize_prompt("") == ""
    assert normalize_prompt("   \n\t ") == ""


def test_ham_la_idempotent():
    """Chuẩn hoá lại một khoá đã chuẩn hoá phải ra chính nó.

    Backfill trong ``init_db`` chạy được nhiều lần; không idempotent thì lần
    chạy thứ hai đổi khoá của những hàng lần một vừa ghi.
    """
    goc = "  Xe MÁY  tạt   đầu Ô tô "
    mot_lan = normalize_prompt(goc)
    assert normalize_prompt(mot_lan) == mot_lan
