package com.vehicsim.service;

import com.vehicsim.dto.WorkspaceDtos.MemberItem;
import com.vehicsim.dto.WorkspaceDtos.RemoveMemberResult;
import com.vehicsim.dto.WorkspaceDtos.UserRef;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.repository.WorkspaceRepository;
import com.vehicsim.repository.WorkspaceRepository.UserAccount;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật quản lý workspace (M1…M5, ADR-035 / ADR-038): Manager chỉ thấy workspace mình được gán (khác thì 404), ADMIN thấy tất cả;
 * chỉ thêm ENGINEER / REVIEWER đang hoạt động; workspace lưu trữ không đổi thành viên; chủ project chưa bớt được.
 */
class WorkspaceServiceTest {

    private static final long MANAGER = 5L;
    private static final long OTHER_MANAGER = 6L;
    private static final long WS = 10L;
    private static final long ENGINEER = 20L;

    private WorkspaceRepository repo;
    private WorkspaceService service;

    @BeforeEach
    void setUp() {
        repo = mock(WorkspaceRepository.class);
        service = new WorkspaceService(repo);
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
        assertThatThrownBy(() -> service.detail(OTHER_MANAGER, "MANAGER", WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.members(OTHER_MANAGER, "MANAGER", WS)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.addMember(OTHER_MANAGER, "MANAGER", WS, ENGINEER)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.removeMember(OTHER_MANAGER, "MANAGER", WS, ENGINEER)).isInstanceOf(NotFoundException.class);
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong());
        verify(repo, never()).removeMember(anyLong(), anyLong());
    }

    @Test
    void missingWorkspaceIsNotFound() {
        assertThatThrownBy(() -> service.detail(MANAGER, "MANAGER", 99L)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void ownerAndAdminCanReadTheWorkspace() {
        assertThat(service.detail(MANAGER, "MANAGER", WS).workspace().id()).isEqualTo(WS);
        assertThat(service.detail(1L, "ADMIN", WS).workspace().id()).isEqualTo(WS);
        verify(repo, org.mockito.Mockito.times(2)).projectsOf(WS);
    }

    @Test
    void candidateSearchIsCappedAndBounded() {
        service.candidates(MANAGER, "MANAGER", WS, "eng");
        verify(repo).candidatesFor(WS, "eng", WorkspaceService.CANDIDATE_LIMIT);
        assertThatThrownBy(() -> service.candidates(MANAGER, "MANAGER", WS, "x".repeat(101))).isInstanceOf(InvalidRequestException.class);
    }

    // ------------------------------------------------------------------ M4: thêm

    @Test
    void addsAnActiveEngineerOrReviewerAndRecordsWhoAddedThem() {
        for (String role : List.of("ENGINEER", "REVIEWER")) {
            when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", role, true));
            when(repo.membersOf(WS)).thenReturn(List.of(member(ENGINEER)));

            assertThat(service.addMember(MANAGER, "MANAGER", WS, ENGINEER).userId()).isEqualTo(ENGINEER);
        }
        verify(repo, org.mockito.Mockito.times(2)).addMember(WS, ENGINEER, MANAGER);
    }

    @Test
    void onlyEngineersAndReviewersCanJoin() {
        for (String role : List.of("ADMIN", "MANAGER", "EXPERIENCER")) {
            when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "x@example.com", role, true));
            assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER))
                    .as("%s không vào workspace", role).isInstanceOf(InvalidRequestException.class).hasMessageContaining(role);
        }
        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong());
    }

    @Test
    void lockedUnknownOrExistingMembersAreRefused() {
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", false));
        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER)).hasMessageContaining("khoá");

        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, 404L)).isInstanceOf(NotFoundException.class);

        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", true));
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);
        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER)).hasMessageContaining("đã là thành viên");

        verify(repo, never()).addMember(anyLong(), anyLong(), anyLong());
    }

    @Test
    void archivedWorkspaceMembershipIsFrozen() {
        when(repo.find(WS)).thenReturn(workspace("ARCHIVED"));
        when(repo.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", true));
        when(repo.isMember(WS, ENGINEER)).thenReturn(true);

        assertThatThrownBy(() -> service.addMember(MANAGER, "MANAGER", WS, ENGINEER)).hasMessageContaining("lưu trữ");
        assertThatThrownBy(() -> service.removeMember(MANAGER, "MANAGER", WS, ENGINEER)).hasMessageContaining("lưu trữ");
        // Vẫn xem được workspace đã lưu trữ.
        assertThat(service.members(MANAGER, "MANAGER", WS)).isEmpty();
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
        verify(repo).unassignOpenTasks(WS, ENGINEER);
        verify(repo).removeMember(WS, ENGINEER);
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
