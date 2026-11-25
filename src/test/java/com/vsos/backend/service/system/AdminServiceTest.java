package com.vsos.backend.service.system;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.dto.auth.AdminRequests.*;
import com.vsos.backend.entity.enums.*;
import com.vsos.backend.repository.common.*;
import com.vsos.backend.security.LegacyAwarePasswordEncoder;
import com.vsos.backend.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminServiceTest {
    AdminRepository repo=mock(AdminRepository.class);
    NotificationService notifications=mock(NotificationService.class);
    LegacyAwarePasswordEncoder passwords=new LegacyAwarePasswordEncoder();
    AdminService service=new AdminService(repo,passwords,notifications,org.mockito.Mockito.mock(com.vsos.backend.service.workspace.WorkspaceChatHub.class));
    static Row user(String role, boolean active) {
        return new Row(Map.of("id",2L,"email","user@example.com","role",role,"is_active",active));
    }
    static UserRequest userRequest(RoleCode role,boolean active) {
        return new UserRequest("USER@example.com","Nguyen",null,"An",role,active,null);
    }
    static ReferenceRequest reference(TechRefType kind,BigDecimal value,boolean active) {
        return new ReferenceRequest("CODE",kind,"Name",value,"m",null,null,null,null,null,null,null,null,null,active);
    }
    @BeforeEach void setup() {
        when(repo.user(anyLong(),anyBoolean())).thenReturn(user("ENGINEER",true));
        when(repo.reference(anyLong(),anyBoolean())).thenReturn(new Row(Map.of("id",4L)));
        when(repo.workspace(anyLong(),anyBoolean())).thenReturn(new Row(Map.of("id",3L,"status","ACTIVE","manager_id",5L)));
    }
    @Test void createsInternalAccountWithBcryptAndNormalizesEmail() {
        var body=new UserRequest(" MANAGER@example.com ","Nguyen",null,"An",RoleCode.MANAGER,true,"strong-secret-92");
        when(repo.createUser(anyString(),anyString(),any(),anyString(),anyString(),anyBoolean(),anyString())).thenReturn(2L);
        var result=service.createUser(1,body);
        var hash=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repo).createUser(eq("manager@example.com"),eq("Nguyen"),isNull(),eq("An"),eq("MANAGER"),eq(true),hash.capture());
        assertThat(passwords.matches("strong-secret-92",hash.getValue())).isTrue();
        assertThat(result).doesNotContainKeys("password_hash","auth_version");
    }
    @Test void duplicateEmailAndOversizeUtf8PasswordRejected() {
        when(repo.emailExists("user@example.com",0)).thenReturn(true);
        assertThatThrownBy(()->service.createUser(1,userRequest(RoleCode.ENGINEER,true))).isInstanceOf(InvalidRequestException.class);
        when(repo.emailExists(anyString(),anyLong())).thenReturn(false);
        var b=new UserRequest("user@example.com","A",null,"B",RoleCode.MANAGER,true,"ậ".repeat(25));
        assertThatThrownBy(()->service.createUser(1,b)).isInstanceOf(InvalidRequestException.class);
        verify(repo,never()).createUser(anyString(),anyString(),any(),anyString(),anyString(),anyBoolean(),anyString());
    }
    @Test void cannotDemoteOrLockSelf() {
        when(repo.user(1,true)).thenReturn(user("ADMIN",true));
        assertThatThrownBy(()->service.updateUser(1,1,userRequest(RoleCode.MANAGER,true))).hasMessageContaining("mình");
        assertThatThrownBy(()->service.updateUser(1,1,userRequest(RoleCode.ADMIN,false))).hasMessageContaining("mình");
    }
    @Test void managerOwnershipBlocksRoleChangeAndLockIncludingArchivedWorkspaces() {
        when(repo.user(2,true)).thenReturn(user("MANAGER",true));
        when(repo.managesWorkspaces(2)).thenReturn(true);
        assertThatThrownBy(()->service.updateUser(1,2,userRequest(RoleCode.ENGINEER,true))).hasMessageContaining("workspace");
        assertThatThrownBy(()->service.updateUser(1,2,userRequest(RoleCode.MANAGER,false))).hasMessageContaining("workspace");
    }
    @Test void memberAndProjectDependenciesBlockRoleChange() {
        when(repo.hasRoleDependencies(2)).thenReturn(true);
        assertThatThrownBy(()->service.updateUser(1,2,userRequest(RoleCode.REVIEWER,true))).hasMessageContaining("phụ thuộc");
    }
    @Test void roleAndStatusChangesRevokeSessionsButNameChangesDoNot() {
        service.updateUser(1,2,userRequest(RoleCode.REVIEWER,true));
        verify(repo).updateUser(2,"user@example.com","Nguyen",null,"An","REVIEWER",true,true);
        service.updateUser(1,2,userRequest(RoleCode.ENGINEER,false));
        verify(repo).updateUser(2,"user@example.com","Nguyen",null,"An","ENGINEER",false,true);
        service.updateUser(1,2,userRequest(RoleCode.ENGINEER,true));
        verify(repo).updateUser(2,"user@example.com","Nguyen",null,"An","ENGINEER",true,false);
    }
    @Test void workspaceNeedsActiveManagerAndUniqueName() {
        var b=new WorkspaceRequest("Lab",null,2L);
        assertThatThrownBy(()->service.createWorkspace(1,b)).hasMessageContaining("MANAGER");
        when(repo.user(2,true)).thenReturn(user("MANAGER",false));
        assertThatThrownBy(()->service.createWorkspace(1,b)).hasMessageContaining("MANAGER");
        when(repo.user(2,true)).thenReturn(user("MANAGER",true));
        when(repo.workspaceNameExists("Lab",0)).thenReturn(true);
        assertThatThrownBy(()->service.createWorkspace(1,b)).hasMessageContaining("đã được sử dụng");
    }
    @Test void workspaceCreateAndReassignmentNotifyManagerWithoutTouchingChildren() {
        when(repo.user(2,true)).thenReturn(user("MANAGER",true));
        when(repo.createWorkspace("Lab",null,2,1)).thenReturn(3L);
        service.createWorkspace(1,new WorkspaceRequest("Lab",null,2L));
        service.updateWorkspace(1,3,new WorkspaceRequest("Lab",null,2L));
        verify(repo).updateWorkspace(3,"Lab",null,2);
        verify(notifications,times(2)).notify(eq(2L),eq(1L),eq(3L),eq("WORKSPACE_ASSIGNED"),anyString(),anyString(),eq("WORKSPACE"),eq(3L));
        // Repository update targets only workspaces, no child mutations.
    }
    @Test void unchangedManagerDoesNotNotifyAndArchivedCannotBeEdited() {
        when(repo.user(5,true)).thenReturn(user("MANAGER",true));
        service.updateWorkspace(1,3,new WorkspaceRequest("Lab",null,5L));
        verifyNoInteractions(notifications);
        when(repo.workspace(3,true)).thenReturn(new Row(Map.of("status","ARCHIVED")));
        assertThatThrownBy(()->service.updateWorkspace(1,3,new WorkspaceRequest("Lab",null,5L))).hasMessageContaining("lưu trữ");
    }
    @Test void referenceNumericContractAndUniquenessAreEnforced() {
        assertThatThrownBy(()->service.createReference(1,reference(TechRefType.STANDARD,BigDecimal.ONE,true))).hasMessageContaining("CONSTANT");
        assertThatThrownBy(()->service.createReference(1,reference(TechRefType.CONSTANT,null,true))).hasMessageContaining("giá trị");
        when(repo.referenceExists("CODE","CONSTANT","Name",0)).thenReturn(true);
        assertThatThrownBy(()->service.createReference(1,reference(TechRefType.CONSTANT,BigDecimal.ONE,true))).hasMessageContaining("đã được sử dụng");
    }
    @Test void referencesCreateActiveAndCanBeDisabledWithoutDeletion() {
        when(repo.createReference(any())).thenReturn(4L);
        service.createReference(1,reference(TechRefType.CONSTANT,BigDecimal.ONE,true));
        service.updateReference(1,4,reference(TechRefType.CONSTANT,new BigDecimal("2.5"),false));
        var values=org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(repo).updateReference(eq(4L),values.capture());
        assertThat(values.getValue()[14]).isEqualTo(false);
        assertThatThrownBy(()->service.createReference(1,reference(TechRefType.CONSTANT,BigDecimal.ONE,false))).hasMessageContaining("phải");
    }
    @Test void referenceDecimalsRemainExactWhenSentToJavascript() {
        var value = new BigDecimal("123456789012345678.123456789012");
        var result = AdminRepository.view(new Row(Map.of("id",4L,"ref_value",value)));
        assertThat(result.get("ref_value")).isEqualTo("123456789012345678.123456789012");
    }

    @Test void listValidatesAllFiltersBeforeSql() {
        assertThatThrownBy(()->service.list("users","","",null,0,20,"newest")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.list("users","","LOCKED",null,1,20,"newest")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.list("users","","","ROOT",1,20,"newest")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.list("users","","",null,1,20,"id;DROP")).isInstanceOf(InvalidRequestException.class);
        service.list("workspaces","Manager","ARCHIVED",null,2,20,"newest");
        verify(repo).list("workspaces","Manager","ARCHIVED",null,2,20,"newest");
    }
}