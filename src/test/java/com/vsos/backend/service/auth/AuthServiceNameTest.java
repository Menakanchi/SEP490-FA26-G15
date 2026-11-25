package com.vsos.backend.service.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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

    /** UserManagement-10: tên 143 ký tự trước đây bị cắt còn 80 mà vẫn trả 200. */
    @Test
    void aPartLongerThanTheColumnIsRejectedInsteadOfCut() {
        String longName = "A".repeat(143);
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> AuthService.splitFullName("Nguyễn " + longName));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(e.getReason().startsWith("Tên tối đa 80 ký tự (đang có 143)"), e.getReason());

        assertTrue(assertThrows(ResponseStatusException.class, () -> AuthService.splitFullName("B".repeat(81) + " Văn An"))
                .getReason().startsWith("Họ tối đa 80"));
        assertTrue(assertThrows(ResponseStatusException.class, () -> AuthService.splitFullName("Lê " + "C".repeat(81) + " An"))
                .getReason().startsWith("Tên đệm tối đa 80"));
    }

    @Test
    void partsOfExactlyEightyCharactersAreKeptWhole() {
        String eighty = "D".repeat(80);
        assertArrayEquals(new String[]{eighty, null, eighty}, AuthService.splitFullName(eighty + " " + eighty));
    }
}
