package com.vsos.backend.service.system;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.auth.AdminRequests.*;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.enums.TechRefType;
import com.vsos.backend.repository.common.AdminRepository;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.LegacyAwarePasswordEncoder;
import com.vsos.backend.service.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.*;

/** UC-08..13,15..17; no deletion or workspace membership mutation. */
@Service
public class AdminService {
    private final AdminRepository repo;
    private final LegacyAwarePasswordEncoder passwords;
    private final NotificationService notifications;
    public AdminService(AdminRepository repo,LegacyAwarePasswordEncoder passwords,NotificationService notifications) {
        this.repo=repo; this.passwords=passwords; this.notifications=notifications;
    }

    @Transactional(readOnly=true)
    public Map<String,Object> list(String resource,String q,String status,String role,int page,int size,String sort) {
        if(page<1 || page>100000 || size<1 || size>100) throw invalid("Trang phải từ 1; số dòng từ 1 đến 100");
        if(!Set.of("newest","oldest","name").contains(sort)) throw invalid("Cách sắp xếp không hợp lệ");
        if(status!=null && !status.isBlank() && !Set.of("ACTIVE","workspaces".equals(resource) ? "ARCHIVED":"INACTIVE").contains(status))
            throw invalid("Trạng thái không hợp lệ");
        if(role!=null && !role.isBlank()) {
            try {
                if("users".equals(resource)) RoleCode.valueOf(role);
                else if("tech-references".equals(resource)) TechRefType.valueOf(role);
                else throw invalid("Bộ lọc không hợp lệ");
            } catch(IllegalArgumentException e) { throw invalid("Vai trò hoặc loại tài liệu không hợp lệ"); }
        }
        return repo.list(resource,q,status,role,page,size,sort);
    }
    public Map<String,Object> detail(String resource,long id) {
        return AdminRepository.view(required(switch(resource) {
            case "users" -> repo.user(id,false);
            case "workspaces" -> repo.workspace(id,false);
            case "tech-references" -> repo.reference(id,false);
            default -> throw invalid("Tài nguyên không hợp lệ");
        }));
    }

    @Transactional
    public Map<String,Object> createUser(long actor,UserRequest b) {
        String email=email(b.email());
        if(repo.emailExists(email,0)) throw invalid("Email đã được sử dụng");
        if(b.password()==null || b.password().length()<8 || b.password().getBytes(StandardCharsets.UTF_8).length>72)
            throw invalid("Mật khẩu phải ít nhất 8 ký tự và tối đa 72 byte UTF-8");
        long id=repo.createUser(email,b.lastName().trim(),clean(b.middleName()),b.firstName().trim(),
                b.role().name(),b.isActive(),passwords.encode(b.password()));
        audit("user_create",actor,id);
        return detail("users",id);
    }
    @Transactional
    public Map<String,Object> updateUser(long actor,long id,UserRequest b) {
        Row old=required(repo.user(id,true));
        boolean roleChanged=!old.str("role").equals(b.role().name());
        boolean locking=!b.isActive();
        if(actor==id && (roleChanged || locking)) throw invalid("Không được tự đổi vai trò hoặc khóa tài khoản của mình");
        if((roleChanged || locking) && repo.managesWorkspaces(id))
            throw invalid("Chuyển toàn bộ workspace sang Manager khác trước khi đổi vai trò hoặc khóa tài khoản này");
        if(roleChanged && repo.hasRoleDependencies(id))
            throw invalid("Tài khoản còn thành viên workspace, project sở hữu hoặc task chưa xong; cần xử lý phụ thuộc trước khi đổi vai trò");
        String email=email(b.email());
        if(repo.emailExists(email,id)) throw invalid("Email đã được sử dụng");
        if(b.password()!=null && !b.password().isEmpty()) throw invalid("Đổi mật khẩu qua luồng tài khoản hoặc quên mật khẩu");
        boolean revoke=roleChanged || old.bool("is_active")!=b.isActive() || !email.equals(old.str("email"));
        repo.updateUser(id,email,b.lastName().trim(),clean(b.middleName()),b.firstName().trim(),
                b.role().name(),b.isActive(),revoke);
        audit("user_update",actor,id);
        return detail("users",id);
    }
    @Transactional
    public Map<String,Object> createWorkspace(long actor,WorkspaceRequest b) {
        requireManager(b.managerId());
        String name=b.name().trim();
        if(repo.workspaceNameExists(name,0)) throw invalid("Tên workspace đã được sử dụng");
        long id=repo.createWorkspace(name,clean(b.description()),b.managerId(),actor);
        assigned(actor,id,b.managerId(),name);
        audit("workspace_create",actor,id);
        return detail("workspaces",id);
    }
    @Transactional
    public Map<String,Object> updateWorkspace(long actor,long id,WorkspaceRequest b) {
        // Same user-row lock as role changes: assignment cannot race a Manager demotion/lock.
        requireManager(b.managerId());
        Row old=required(repo.workspace(id,true));
        if(!"ACTIVE".equals(old.str("status"))) throw invalid("Workspace đã lưu trữ, không thay đổi được");
        String name=b.name().trim();
        if(repo.workspaceNameExists(name,id)) throw invalid("Tên workspace đã được sử dụng");
        repo.updateWorkspace(id,name,clean(b.description()),b.managerId());
        if(old.lng("manager_id")!=b.managerId()) assigned(actor,id,b.managerId(),name);
        audit("workspace_update",actor,id);
        return detail("workspaces",id);
    }
    @Transactional
    public Map<String,Object> createReference(long actor,ReferenceRequest b) {
        validateReference(b,0);
        if(!b.isActive()) throw invalid("Tài liệu mới phải ở trạng thái bật");
        long id=repo.createReference(referenceValues(b));
        audit("reference_create",actor,id);
        return detail("tech-references",id);
    }
    @Transactional
    public Map<String,Object> updateReference(long actor,long id,ReferenceRequest b) {
        required(repo.reference(id,true));
        validateReference(b,id);
        repo.updateReference(id,referenceValues(b));
        audit("reference_update",actor,id);
        return detail("tech-references",id);
    }
    private void validateReference(ReferenceRequest b,long id) {
        if(b.refType()!=TechRefType.CONSTANT && b.refValue()!=null) throw invalid("Chỉ loại CONSTANT được có giá trị số");
        if(b.refType()==TechRefType.CONSTANT && b.refValue()==null) throw invalid("Hằng số phải có giá trị số");
        if(b.url()!=null && !b.url().isBlank()) {
            try {
                URI uri=URI.create(b.url().trim());
                if(!Set.of("http","https").contains(uri.getScheme()) || uri.getHost()==null) throw new IllegalArgumentException();
            } catch(IllegalArgumentException e) { throw invalid("URL phải là địa chỉ http hoặc https hợp lệ"); }
        }
        if(repo.referenceExists(b.refCode().trim(),b.refType().name(),b.refName().trim(),id))
            throw invalid("Mã hoặc tên tài liệu trong cùng loại đã được sử dụng");
    }
    private Object[] referenceValues(ReferenceRequest b) {
        return new Object[]{b.refCode().trim(),b.refType().name(),b.refName().trim(),b.refValue(),clean(b.unit()),
                clean(b.description()),clean(b.sourceType()),clean(b.sourceTitle()),clean(b.author()),clean(b.organization()),
                b.publicationYear(),clean(b.page()),clean(b.url()),clean(b.doi()),b.isActive()};
    }
    private void requireManager(long id) {
        Row user=required(repo.user(id,true));
        if(!"MANAGER".equals(user.str("role")) || !user.bool("is_active")) throw invalid("Chọn tài khoản MANAGER đang hoạt động");
    }
    private void assigned(long actor,long id,long manager,String name) {
        notifications.notify(manager,actor,id,"WORKSPACE_ASSIGNED","Bạn được giao quản lý workspace "+name,
                "Quản trị viên đã giao bạn quản lý workspace "+name+".","WORKSPACE",id);
    }
    private static String clean(String s) { return s==null || s.isBlank() ? null:s.trim(); }
    private static String email(String s) { return s.trim().toLowerCase(Locale.ROOT); }
    private static Row required(Row r) { if(r==null) throw new NotFoundException("bản ghi quản trị"); return r; }
    private static InvalidRequestException invalid(String s) { return new InvalidRequestException(s); }
    private static void audit(String action,long actor,long id) { AuditLog.event("admin."+action,"success","by",actor,"record_id",id); }
}