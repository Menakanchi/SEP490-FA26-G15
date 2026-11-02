package com.vsos.backend.controller.project;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.project.ProjectDtos.AdoptRequest;
import com.vsos.backend.dto.project.ProjectDtos.DeleteProjectRequest;
import com.vsos.backend.dto.project.ProjectDtos.ProjectItem;
import com.vsos.backend.dto.project.ProjectDtos.ProjectJourney;
import com.vsos.backend.dto.project.ProjectDtos.ProjectList;
import com.vsos.backend.dto.project.ProjectDtos.ProjectRequest;
import com.vsos.backend.dto.project.ProjectDtos.VehicleOption;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.project.ProjectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/vehicsim/projects")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Project", description = "Project cá nhân: Experiencer quản lý và làm việc; chủ project đã đổi role chỉ xem")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class ProjectController {

    private final ProjectService projects;
    private final VehicSimAccess access;

    @Operation(summary = "Danh sách project cá nhân theo trạng thái, tìm theo tên, phân trang")
    @GetMapping
    public ProjectList list(@RequestParam(defaultValue = "ACTIVE") String status, @RequestParam(defaultValue = "") String q,
                            @RequestParam(defaultValue = "1") int page, @RequestParam(name = "page_size", defaultValue = "9") int pageSize,
                            @AuthenticationPrincipal UserDetails user) {
        return projects.list(VehicSimAccess.userId(user), status, q, page, pageSize);
    }

    @Operation(summary = "Xe chọn được khi tạo hoặc sửa project")
    @GetMapping("/vehicle-options")
    public List<VehicleOption> vehicleOptions(@AuthenticationPrincipal UserDetails user) {
        VehicSimAccess.requireExperiencer(user);
        return projects.vehicles();
    }

    @Operation(summary = "Tạo project cá nhân kèm xe và baseline AEB v1.0")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectItem create(@RequestBody ProjectRequest body, @AuthenticationPrincipal UserDetails user) {
        return projects.create(writer(user), body);
    }

    @Operation(summary = "Chi tiết project cá nhân")
    @GetMapping("/{projectId}")
    public ProjectItem get(@PathVariable long projectId, @AuthenticationPrincipal UserDetails user) {
        return projects.get(VehicSimAccess.userId(user), projectId);
    }

    @Operation(summary = "Hành trình 5 bước của project: trạng thái từng bước, bước tiếp theo và số liệu tóm tắt")
    @GetMapping("/{projectId}/journey")
    public ProjectJourney journey(@PathVariable long projectId, @AuthenticationPrincipal UserDetails user) {
        return projects.journey(VehicSimAccess.userId(user), projectId);
    }

    @Operation(summary = "Dùng ứng viên đã đạt kiểm chứng làm baseline của project, mở vòng cải tiến tiếp theo")
    @PostMapping("/{projectId}/regressions/{testId}/adopt")
    public ProjectJourney adopt(@PathVariable long projectId, @PathVariable long testId, @RequestBody AdoptRequest body,
                                @AuthenticationPrincipal UserDetails user) {
        return projects.adopt(writer(user), projectId, testId, body);
    }

    @Operation(summary = "Sửa tên, mô tả hoặc xe (xe chỉ đổi được khi chưa có lượt chạy)")
    @PatchMapping("/{projectId}")
    public ProjectItem update(@PathVariable long projectId, @RequestBody ProjectRequest body, @AuthenticationPrincipal UserDetails user) {
        return projects.update(writer(user), projectId, body);
    }

    @Operation(summary = "Lưu trữ project")
    @PostMapping("/{projectId}/archive")
    public ProjectItem archive(@PathVariable long projectId, @AuthenticationPrincipal UserDetails user) {
        return projects.archive(writer(user), projectId);
    }

    @Operation(summary = "Bỏ lưu trữ project")
    @PostMapping("/{projectId}/unarchive")
    public ProjectItem unarchive(@PathVariable long projectId, @AuthenticationPrincipal UserDetails user) {
        return projects.unarchive(writer(user), projectId);
    }

    @Operation(summary = "Xoá vĩnh viễn project cùng mọi dữ liệu (gõ đúng tên để xác nhận)")
    @DeleteMapping("/{projectId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long projectId, @RequestBody DeleteProjectRequest body, @AuthenticationPrincipal UserDetails user) {
        projects.delete(writer(user), projectId, body.confirmName());
    }

    private long writer(UserDetails user) {
        long userId = VehicSimAccess.requireExperiencer(user);
        access.limitWrites(userId, "project");
        return userId;
    }
}
