package com.vehicsim.exception;

import com.vehicsim.vehicsim.Vs;

/**
 * Lỗi nghiệp vụ của regression / khuyến nghị / quyết định Reviewer (màn 5). Mọi lớp đều kế thừa {@link Vs.InvalidRequestException}
 * nên {@link ApiExceptionHandler} vẫn trả 400 {@code {"detail": "<câu tiếng Việt>"}} như trước; tách lớp để code và test biết lỗi
 * thuộc loại nào thay vì chỉ so chuỗi thông báo.
 */
public final class RegressionExceptions {

    private RegressionExceptions() {
    }

    /** Bộ kịch bản không dùng được: chưa chọn bộ nào, tập rỗng, hoặc biến thể không thuộc họ. */
    public static class InvalidScenarioSetException extends Vs.InvalidRequestException {
        public InvalidScenarioSetException(String message) {
            super(message);
        }
    }

    /** Tiêu chí đạt không tồn tại hoặc ngưỡng không phải số. */
    public static class InvalidCriteriaException extends Vs.InvalidRequestException {
        public InvalidCriteriaException(String message) {
            super(message);
        }
    }

    /** Không so được: project chưa có baseline, hoặc version đem đi kiểm không ở trạng thái CANDIDATE. */
    public static class InvalidCandidateException extends Vs.InvalidRequestException {
        public InvalidCandidateException(String message) {
            super(message);
        }
    }

    /** Thao tác cần test đã chạy xong (quyết định, xuất gói) trong khi test còn chạy hoặc bị lỗi. */
    public static class TestNotFinishedException extends Vs.InvalidRequestException {
        public TestNotFinishedException(String message) {
            super(message);
        }
    }

    /**
     * Reviewer không được ra quyết định này: giá trị lạ, thiếu lý do / xác nhận, không có khuyến nghị, đã có quyết định cuối,
     * người tạo tự duyệt, Accept khi test chưa PASSED, baseline đã đổi hoặc candidate đã được quyết định ở test khác.
     */
    public static class DecisionNotAllowedException extends Vs.InvalidRequestException {
        public DecisionNotAllowedException(String message) {
            super(message);
        }
    }
}
