package com.vehicsim.audit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** TD-25: nhật ký thao tác — một dòng mỗi sự kiện, không cho giá trị người dùng chèn thêm dòng hay trường giả. */
class AuditLogTest {

    @Test
    void formatsOneKeyValueLinePerEvent() {
        assertThat(AuditLog.format("auth.login", "success", "user", "a@b.c", "ip", "10.0.0.1"))
                .isEqualTo("event=auth.login outcome=success user=a@b.c ip=10.0.0.1");
    }

    @Test
    void skipsNullValues() {
        assertThat(AuditLog.format("auth.login", "failure", "user", null, "reason", "bad_credentials"))
                .isEqualTo("event=auth.login outcome=failure reason=bad_credentials");
    }

    @Test
    void newlinesInAValueCannotForgeASecondLogLine() {
        String line = AuditLog.format("auth.login", "failure", "user", "x@y.z\nevent=auth.login outcome=success user=admin");
        assertThat(line).doesNotContain("\n").doesNotContain("\r");
        // Dấu "=" và khoảng trắng buộc giá trị phải nằm trong ngoặc kép: không thành trường mới.
        assertThat(line).contains("user=\"x@y.z event=auth.login outcome=success user=admin\"");
    }

    @Test
    void quotesAreEscaped() {
        assertThat(AuditLog.clean("a\"b c")).isEqualTo("\"a\\\"b c\"");
    }

    @Test
    void longValuesAreTruncated() {
        assertThat(AuditLog.clean("x".repeat(5000))).hasSize(AuditLog.MAX_VALUE_LENGTH);
    }

    @Test
    void emptyValueIsVisible() {
        assertThat(AuditLog.clean("")).isEqualTo("\"\"");
    }

    @Test
    void oddNumberOfKeyValuesIsAProgrammingError() {
        assertThatThrownBy(() -> AuditLog.format("e", "ok", "only-key")).isInstanceOf(IllegalArgumentException.class);
    }
}
