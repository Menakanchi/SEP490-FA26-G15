package com.vsos.backend.entity.workspace;

import com.vsos.backend.entity.enums.RoleCode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;

@Entity
@Table(name = "workspace_members", uniqueConstraints = {
        @UniqueConstraint(name = "uq_workspace_members", columnNames = {"workspace_id", "user_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkspaceMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "added_by_user_id")
    private User addedByUser;

    /** Role cấp khi thêm tài khoản EXPERIENCER (ADR-045); null = role có từ trước. */
    @Enumerated(EnumType.STRING)
    @Column(name = "granted_role")
    private RoleCode grantedRole;

    @CreationTimestamp
    @Column(name = "joined_at", nullable = false, updatable = false)
    private LocalDateTime joinedAt;
}
