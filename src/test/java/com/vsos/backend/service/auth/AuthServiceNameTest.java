package com.vsos.backend.service.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceNameTest {

    @Test
    void splitsVietnameseFullNames() {
        assertArrayEquals(new String[]{"Nguyễn", "Văn", "Kiểm"}, AuthService.splitFullName("Nguyễn Văn Kiểm"));
        assertArrayEquals(new String[]{"Trần", "Thị Hồng", "Hạnh"}, AuthService.splitFullName("  Trần  Thị Hồng  Hạnh "));
        assertArrayEquals(new String[]{"Đỗ", null, "Tú"}, AuthService.splitFullName("Đỗ Tú"));
    }

    @Test
    void singleWordIsTheFirstName() {
        assertArrayEquals(new String[]{"", null, "Madonna"}, AuthService.splitFullName("Madonna"));
    }
}
