package com.vsos.backend.exception.project;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Getter
@RequiredArgsConstructor
public enum ProjectError {
    EXPERIENCER_ONLY(FORBIDDEN, "Project cá nhân chỉ dành cho tài khoản Experiencer."),
    NO_PROJECT_OPEN(CONFLICT, "Bạn chưa có project nào đang hoạt động. Tạo hoặc mở một project để tiếp tục."),
    PROJECT_NOT_FOUND(NOT_FOUND, "Không tìm thấy project #%s."),
    PROJECT_NOT_YOURS(FORBIDDEN, "Project #%s không phải project cá nhân của bạn."),
    PROJECT_ARCHIVED(CONFLICT, "Project “%s” đang lưu trữ. Bỏ lưu trữ để mở lại."),
    PROJECT_LIMIT_REACHED(CONFLICT, "Bạn đã có %d/%d project đang hoạt động. Lưu trữ hoặc xoá bớt trước."),
    PROJECT_BUSY(CONFLICT, "Project “%s” còn %d việc đang chờ hoặc đang chạy. Đợi xong hoặc huỷ rồi thử lại."),
    ALREADY_ARCHIVED(CONFLICT, "Project “%s” đã ở trạng thái lưu trữ."),
    NOT_ARCHIVED(CONFLICT, "Project “%s” đang hoạt động, không cần bỏ lưu trữ."),
    NAME_REQUIRED(BAD_REQUEST, "Tên project không được để trống."),
    NAME_TOO_LONG(BAD_REQUEST, "Tên project tối đa %d ký tự (đang có %d)."),
    NAME_INVALID(BAD_REQUEST, "Tên project không được chứa ký tự điều khiển."),
    NAME_DUPLICATE(CONFLICT, "Bạn đã có project tên “%s”. Hãy chọn tên khác."),
    DESCRIPTION_TOO_LONG(BAD_REQUEST, "Mô tả tối đa %d ký tự (đang có %d)."),
    VEHICLE_NOT_FOUND(BAD_REQUEST, "Xe #%s không có trong danh mục hoặc chưa được hỗ trợ."),
    VEHICLE_LOCKED(CONFLICT, "Project đã có %d lượt chạy bằng %s nên không đổi được xe. Tạo project mới để thử xe khác."),
    CONFIRM_NAME_MISMATCH(BAD_REQUEST, "Gõ đúng “%s” để xác nhận xoá vĩnh viễn.");

    private final HttpStatus status;
    private final String message;
}
