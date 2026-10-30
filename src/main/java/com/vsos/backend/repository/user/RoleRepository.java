package com.vsos.backend.repository.user;

import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.enums.RoleCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Integer> {
    Optional<Role> findByCode(RoleCode code);
}
