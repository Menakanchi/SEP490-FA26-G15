package com.vsos.backend.exception.project;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.vsos.backend.exception.project.ProjectError.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Bảng lỗi của project cá nhân: mã HTTP theo đúng loại lỗi (frontend dựa vào đó để báo "không tìm thấy", "không có quyền",
 * "nhập sai" hay "trạng thái không cho phép"), câu báo là tiếng Việt hoàn chỉnh và {@link ProjectException} điền đủ tham số.
 */
class ProjectErrorTest {

    private static final Pattern PLACEHOLDER = Pattern.compile("%[sd]");

    private static Set<ProjectError> withStatus(HttpStatus status) {
        EnumSet<ProjectError> out = EnumSet.noneOf(ProjectError.class);
        Arrays.stream(values()).filter(e -> e.getStatus() == status).forEach(out::add);
        return out;
    }

    @Test
    void onlyMissingProjectsAndTestsAreNotFound() {
        assertThat(withStatus(HttpStatus.NOT_FOUND)).containsExactlyInAnyOrder(PROJECT_NOT_FOUND, TEST_NOT_FOUND);
    }

    @Test
    void roleAndOwnershipProblemsAreForbidden() {
        assertThat(withStatus(HttpStatus.FORBIDDEN)).containsExactlyInAnyOrder(EXPERIENCER_ONLY, PROJECT_NOT_YOURS);
    }

    @Test
    void wrongInputIsABadRequest() {
        assertThat(withStatus(HttpStatus.BAD_REQUEST)).containsExactlyInAnyOrder(NAME_REQUIRED, NAME_TOO_LONG, NAME_INVALID,
                DESCRIPTION_TOO_LONG, VEHICLE_NOT_FOUND, CONFIRM_NAME_MISMATCH, REASON_REQUIRED, CONFIRM_REQUIRED);
    }

    @Test
    void everyOtherErrorIsAStateConflict() {
        assertThat(withStatus(HttpStatus.CONFLICT)).containsExactlyInAnyOrder(NO_PROJECT_OPEN, PROJECT_ARCHIVED, PROJECT_BUSY,
                ALREADY_ARCHIVED, NOT_ARCHIVED, NAME_DUPLICATE, VEHICLE_LOCKED, TEST_NOT_FINISHED, TEST_NOT_PASSED,
                CANDIDATE_ALREADY_DECIDED, BASELINE_CHANGED);
        assertThat(values()).allSatisfy(e -> assertThat(e.getStatus()).isIn(HttpStatus.NOT_FOUND, HttpStatus.FORBIDDEN,
                HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT));
    }

    @Test
    void everyMessageIsACompleteSentenceAndFormatsWithItsArguments() {
        for (ProjectError error : values()) {
            Matcher m = PLACEHOLDER.matcher(error.getMessage());
            Object[] args = m.results().map(r -> r.group().equals("%d") ? (Object) 3 : "x").toArray();

            ProjectException e = new ProjectException(error, args);

            assertThat(e.getError()).isEqualTo(error);
            assertThat(e.getMessage()).as(error.name()).doesNotContain("%s", "%d").endsWith(".");
        }
    }

    @Test
    void anExceptionFillsItsMessageInOrder() {
        assertThat(new ProjectException(PROJECT_BUSY, "Thử AEB", 2).getMessage())
                .isEqualTo("Project “Thử AEB” còn 2 việc đang chờ hoặc đang chạy. Đợi xong hoặc huỷ rồi thử lại.");
        assertThat(new ProjectException(NAME_TOO_LONG, 150, 151).getMessage()).isEqualTo("Tên project tối đa 150 ký tự (đang có 151).");
    }

    @Test
    void aMissingArgumentFailsLoudlyInsteadOfShowingAPlaceholder() {
        assertThatThrownBy(() -> new ProjectException(PROJECT_BUSY, "Thử AEB")).isInstanceOf(java.util.MissingFormatArgumentException.class);
    }
}
