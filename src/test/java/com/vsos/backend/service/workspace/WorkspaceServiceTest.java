package com.vsos.backend.service.workspace;

import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.RemoveMemberResult;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UserRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.workspace.WorkspaceRepository;
import com.vsos.backend.repository.workspace.WorkspaceRepository.UserAccount;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import com.vsos.backend.service.notification.NotificationService;

/**
 * Luật quản lý workspace (M1…M5, ADR-035 / ADR-038 / ADR-045): Manager chỉ thấy workspace mình được gán (khác thì 404), ADMIN thấy
 * tất cả; chỉ thêm tài khoản EXPERIENCER đang hoạt động và cấp role ENGINEER / REVIEWER cho người đó; bớt khỏi workspace cuối cùng
 * thì role đã cấp trả về EXPERIENCER; workspace lưu trữ không đổi thành viên; chủ project chưa bớt được.
 */
class WorkspaceServiceTest {

    private static final long MANAGER = 5L;
    private static final long OTHER_MANAGER = 6L;
    private static final long WS = 10L;
    private static final long ENGINEER = 20L;

    private WorkspaceRepository repo;
    private NotificationService notifications;
    private WorkspaceChatHub chat;
    private WorkspaceService service;

    @BeforeEach
    void setUp() {
        repo = mock(WorkspaceRepository.class);
        notifications = mock(NotificationService.class);
        chat = mock(WorkspaceChatHub.class);
        service = new WorkspaceService(repo, notifications, chat);
        when(repo.find(WS)).thenReturn(workspace("ACTIVE"));
    }

    private static WorkspaceSummary workspace(String status) {
        return new WorkspaceSummary(WS, "AEB Pedestrian", null, status, new UserRef(MANAGER, "Quản Lý", "m@example.com"), 1, 1, 0,
                LocalDateTime.now());
    }

    private static MemberItem member(long userId) {
        return new MemberItem(userId, "Kỹ Sư", "e@example.com", "ENGINEER", true, LocalDateTime.now(), null, 0, 0, 0);
    }

    // ------------------------------------------------------------------ M1–M3: phạm vi xem

    @Test
    void managerOnlyListsTheirOwnWorkspacesWhileAdminSeesAll() {
        service.listWorkspaces(MANAGER, "MANAGER");
        verify(repo).listManagedBy(MANAGER);
        verify(repo, never()).listAll();

        service.listWorkspaces(1L, "ADMIN");
        verify(repo).listAll();
    }

    @Test
    void anotherManagersWorkspaceLooksLikeItDoesNotExist() {
        assertThatThrownBy(() -> service.detail(OTHER_MANAGER, WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.members(OTHER_MANAGER, WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.addMember(OTHER_MANAGER, "MANAGER", WS, ENGINEER, "ENGINEER")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.removeMember(OTHER_MANAGER, "MANAGER", WS, ENGINEER)).isInstanceOf(NotFoundException.class);
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong(), any());
        verify(repo, never()).setRole(anyLong(), anyString());
        verify(repo, never()).removeMember(anyLong(), anyLong());
    }

    @Test
    void missingWorkspaceIsNotFound() {
        assertThatThrownBy(() -> service.detail(MANAGER, 99L)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void managerAndMembersReadTheWorkspaceButOutsidersDoNot() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        assertThat(service.detail(MANAGER, WS).workspace().id()).isEqualTo(WS);
        assertThat(service.detail(ENGINEER, WS).workspace().id()).isEqualTo(WS);
        assertThat(service.members(ENGINEER, WS)).isEmpty();
        assertThatThrownBy(() -> service.detail(1L, WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.members(1L, WS)).isInstanceOf(NotFoundException.class);
        verify(repo, times(2)).projectsOf(WS);
    }

    // ------------------------------------------------------------------ M2: sửa thông tin, chat

    @Test
    void theAssignedManagerRenamesTheWorkspaceWithTrimmedValues() {
        service.updateInfo(MANAGER, "MANAGER", WS, "  AEB đêm mưa  ", "   ");
        verify(repo).updateInfo(WS, "AEB đêm mưa", null);
        verify(repo, times(2)).find(WS);
    }

    @Test
    void workspaceInfoCannotBeChangedByOthersWhenArchivedOrToADuplicateName() {
        assertThatThrownBy(() -> service.updateInfo(OTHER_MANAGER, "MANAGER", WS, "Mới", null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.updateInfo(ENGINEER, "MANAGER", WS, "Mới", null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.updateInfo(MANAGER, "MANAGER", 99L, "Mới", null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.updateInfo(MANAGER, "MANAGER", WS, " ", null)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.updateInfo(MANAGER, "MANAGER", WS, "x".repeat(151), null))
                .isInstanceOf(InvalidRequestException.class);
        when(repo.nameTaken("Trùng", WS)).thenReturn(true);
        assertThatThrownBy(() -> service.updateInfo(MANAGER, "MANAGER", WS, "Trùng", null)).hasMessageContaining("đã được sử dụng");
        when(repo.find(WS)).thenReturn(workspace("ARCHIVED"));
        assertThatThrownBy(() -> service.updateInfo(MANAGER, "MANAGER", WS, "Mới", null)).hasMessageContaining("lưu trữ");
        verify(repo, never()).updateInfo(anyLong(), any(), any());
    }

    @Test
    void realtimeChatOpensOnlyForTheManagerAndMembersAndSentMessagesArePushed() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        when(repo.insertMessage(WS, ENGINEER, "Đã chạy xong baseline")).thenReturn(77L);

        service.openChatStream(ENGINEER, WS);
        service.openChatStream(MANAGER, WS);
        verify(chat).subscribe(WS, ENGINEER);
        verify(chat).subscribe(WS, MANAGER);
        assertThatThrownBy(() -> service.openChatStream(1L, WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.openChatStream(ENGINEER, 99L)).isInstanceOf(NotFoundException.class);
        verify(chat, never()).subscribe(anyLong(), eq(1L));

        service.sendMessage(ENGINEER, WS, "  Đã chạy xong baseline ");
        verify(chat).publish(org.mockito.ArgumentMatchers.argThat(m -> m.id() == 77L && m.workspaceId() == WS
                && "Đã chạy xong baseline".equals(m.messageText())));
        assertThatThrownBy(() -> service.sendMessage(ENGINEER, WS, " ")).isInstanceOf(InvalidRequestException.class);
        verify(chat, times(1)).publish(any());
    }

    @Test
    void chatReturnsTheLatestPageOrOnlyNewerMessagesAndHidesOtherWorkspaces() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        service.listMessages(ENGINEER, WS, 50, null, null);
        verify(repo).listMessages(WS, 50, null, null);
        service.listMessages(MANAGER, WS, 1000, 42L, null);
        verify(repo).listMessages(WS, 200, 42L, null);
        service.listMessages(ENGINEER, WS, 50, null, 42L);
        verify(repo).listMessages(WS, 50, null, 42L);
        assertThatThrownBy(() -> service.listMessages(ENGINEER, WS, 50, -1L, null)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.listMessages(ENGINEER, WS, 50, null, 0L)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.listMessages(ENGINEER, WS, 50, 10L, 42L)).hasMessageContaining("một mốc");
        assertThatThrownBy(() -> service.listMessages(1L, WS, 50, null, 42L)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.sendMessage(1L, WS, "xin chào")).isInstanceOf(NotFoundException.class);
        verify(repo, never()).insertMessage(anyLong(), anyLong(), any());
    }

    @Test
    void candidateSearchOnlyAnswersAnExactEmailAndNeverListsUsers() {
        service.candidates(MANAGER, "MANAGER", WS, "  eng@example.com ");
        verify(repo).candidateByEmail(WS, "eng@example.com");

        // Trống, chỉ khoảng trắng, tên người hoặc một phần email: rỗng và không chạm DB.
        for (String q : new String[] {null, "", "   ", "eng", "Nguyễn Văn A", "@example.com", "eng@"}) {
            org.mockito.Mockito.clearInvocations(repo);
            assertThat(service.candidates(MANAGER, "MANAGER", WS, q)).as("q=" + q).isEmpty();
            verify(repo, never()).candidateByEmail(anyLong(), any());
        }
        assertThatThrownBy(() -> service.candidates(MANAGER, "MANAGER", WS, "x".repeat(250) + "@e.com"))
                .isInstanceOf(InvalidRequestException.class);
        // Manager của workspace khác vẫn 404, kể cả với email đúng.
        assertThatThrownBy(() -> service.candidates(1L, "MANAGER", WS, "eng@example.com")).isInstanceOf(NotFoundException.class);
    }

    // ------------------------------------------------------------------ M4: thêm

    @Test
    void addingAnExperiencerGrantsTheChosenRoleAndRecordsIt() {
        for (String granted : List.of("ENGINEER", "REVIEWER")) {
            when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "EXPERIENCER", true));
            when(repo.membersOf(WS)).thenReturn(List.of(member(ENGINEER)));

            assertThat(service.addMember(MANAGER, "MANAGER", WS, ENGINEER, granted).userId()).isEqualTo(ENGINEER);

            InOrder order = inOrder(repo);
            order.verify(repo).setRole(ENGINEER, granted);
            order.verify(repo).addMember(WS, ENGINEER, MANAGER, granted);
        }
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER), eq(WS), eq("MEMBER_ADDED"), contains("AEB Pedestrian"),
                contains("vai trò Kỹ sư"), eq("WORKSPACE"), eq(WS));
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER), eq(WS), eq("MEMBER_ADDED"), contains("AEB Pedestrian"),
                contains("vai trò Người duyệt"), eq("WORKSPACE"), eq(WS));
    }

    @Test
    void theGrantedRoleMustBeEngineerOrReviewer() {
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "x@example.com", "EXPERIENCER", true));
        for (String granted : java.util.Arrays.asList(null, "", "ADMIN", "MANAGER", "EXPERIENCER", "engineer")) {
            assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER, granted))
                    .as("cấp role %s", granted).isInstanceOf(InvalidRequestException.class).hasMessageContaining("Chọn vai trò");
        }
        verify(repo, never()).setRole(anyLong(), anyString());
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void onlySelfSignupAccountsCanJoin() {
        for (String role : List.of("ADMIN", "MANAGER", "ENGINEER", "REVIEWER")) {
            when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "x@example.com", role, true));
            assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER, "ENGINEER"))
                    .as("%s không thêm được", role).isInstanceOf(InvalidRequestException.class).hasMessageContaining(role);
        }
        verify(repo, never()).setRole(anyLong(), anyString());
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong(), any());
        verifyNoInteractions(notifications);
    }

    @Test
    void lockedUnknownOrExistingMembersAreRefused() {
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "EXPERIENCER", false));
        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER, "ENGINEER")).hasMessageContaining("khoá");

        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, 404L, "ENGINEER")).isInstanceOf(NotFoundException.class);

        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", true));
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER, "ENGINEER")).hasMessageContaining("đã là thành viên");

        verify(repo, never()).setRole(anyLong(), anyString());
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void archivedWorkspaceMembershipIsFrozen() {
        when(repo.find(WS)).thenReturn(workspace("ARCHIVED"));
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "EXPERIENCER", true));
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);

        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER, "ENGINEER")).hasMessageContaining("lưu trữ");
        assertThatThrownBy(() -> service.removeMember(MANAGER, "MANAGER", WS, ENGINEER)).hasMessageContaining("lưu trữ");
        // Vẫn xem được workspace đã lưu trữ.
        assertThat(service.members(MANAGER, WS)).isEmpty();
    }

    // ------------------------------------------------------------------ M5: bớt

    @Test
    void removingAMemberReportsTheProjectsTheyLeaveAndUnassignsTheirOpenTasks() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        when(repo.ownedProjectNames(WS, ENGINEER)).thenReturn(List.of());
        when(repo.projectMembershipCount(WS, ENGINEER)).thenReturn(2);
        when(repo.unassignOpenTasks(WS, ENGINEER)).thenReturn(3);

        RemoveMemberResult result = service.removeMember(MANAGER, "MANAGER", WS, ENGINEER);

        assertThat(result.removedProjectMemberships()).isEqualTo(2);
        assertThat(result.unassignedTasks()).isEqualTo(3);
        assertThat(result.roleReverted()).as("role do Admin cấp (granted_role NULL) giữ nguyên").isFalse();
        verify(repo).unassignOpenTasks(WS, ENGINEER);
        verify(repo).removeMember(WS, ENGINEER);
        verify(chat).disconnect(WS, ENGINEER);
        verify(repo, never()).setRole(anyLong(), anyString());
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER),
                eq(WS), eq("SYSTEM"), anyString(),
                contains("3 task"), eq("WORKSPACE"), eq(WS));
    }

    @Test
    void leavingTheLastWorkspaceTurnsAGrantedRoleBackIntoExperiencer() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        when(repo.ownedProjectNames(WS, ENGINEER)).thenReturn(List.of());
        when(repo.grantedRole(WS, ENGINEER)).thenReturn("REVIEWER");
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "REVIEWER", true));
        when(repo.workspaceCount(ENGINEER)).thenReturn(0);

        assertThat(service.removeMember(MANAGER, "MANAGER", WS, ENGINEER).roleReverted()).isTrue();

        InOrder order = inOrder(repo);
        order.verify(repo).grantedRole(WS, ENGINEER);
        order.verify(repo).removeMember(WS, ENGINEER);
        order.verify(repo).setRole(ENGINEER, "EXPERIENCER");
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER), eq(WS), eq("SYSTEM"), anyString(),
                contains("Experiencer"), eq("WORKSPACE"), eq(WS));
    }

    @Test
    void aGrantedRoleIsKeptWhileStillInAnotherWorkspaceOrAfterAdminChangedIt() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        when(repo.ownedProjectNames(WS, ENGINEER)).thenReturn(List.of());
        when(repo.grantedRole(WS, ENGINEER)).thenReturn("ENGINEER");

        // Còn ở workspace khác.
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", true));
        when(repo.workspaceCount(ENGINEER)).thenReturn(1);
        assertThat(service.removeMember(MANAGER, "MANAGER", WS, ENGINEER).roleReverted()).isFalse();

        // Admin đã đổi role khác sau khi thêm: không ghi đè quyết định của Admin.
        when(repo.workspaceCount(ENGINEER)).thenReturn(0);
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "MANAGER", true));
        assertThat(service.removeMember(MANAGER, "MANAGER", WS, ENGINEER).roleReverted()).isFalse();

        verify(repo, never()).setRole(anyLong(), anyString());
    }

    @Test
    void projectOwnersCannotBeRemovedYet() {
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        when(repo.ownedProjectNames(WS, ENGINEER)).thenReturn(List.of("VF8 AEB MVP"));

        assertThatThrownBy(() -> service.removeMember(MANAGER, "MANAGER", WS, ENGINEER))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("VF8 AEB MVP");
        verify(repo, never()).removeMember(anyLong(), anyLong());
        verify(repo, never()).unassignOpenTasks(anyLong(), anyLong());
    }

    @Test
    void removingSomeoneWhoIsNotAMemberIsNotFound() {
        assertThatThrownBy(() -> service.removeMember(MANAGER, "MANAGER", WS, ENGINEER)).isInstanceOf(NotFoundException.class);
        verify(repo, never()).removeMember(anyLong(), anyLong());
    }
}
