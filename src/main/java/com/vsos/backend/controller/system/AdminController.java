package com.vsos.backend.controller.system;

import com.vsos.backend.dto.auth.AdminRequests.*;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.system.AdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/vehicsim/admin")
public class AdminController {
    private final AdminService service;
    private final VehicSimAccess access;
    public AdminController(AdminService service,VehicSimAccess access) { this.service=service; this.access=access; }
    @GetMapping("/{resource:users|workspaces|tech-references}")
    public Map<String,Object> list(@PathVariable String resource,
            @RequestParam(defaultValue="") String q,@RequestParam(required=false) String status,
            @RequestParam(required=false) String role,@RequestParam(defaultValue="1") int page,
            @RequestParam(name="page_size",defaultValue="20") int size,@RequestParam(defaultValue="newest") String sort,
            @AuthenticationPrincipal UserDetails user) {
        VehicSimAccess.requireAdmin(user);
        return service.list(resource,q,status,role,page,size,sort);
    }
    @GetMapping("/{resource:users|workspaces|tech-references}/{id}")
    public Map<String,Object> detail(@PathVariable String resource,@PathVariable long id,@AuthenticationPrincipal UserDetails user) {
        VehicSimAccess.requireAdmin(user); return service.detail(resource,id);
    }
    private long writer(UserDetails user) {
        long id=VehicSimAccess.requireAdmin(user); access.limitWrites(id,"admin"); return id;
    }
    @PostMapping("/users") @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> createUser(@Valid @RequestBody UserRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.createUser(writer(user),b);
    }
    @PutMapping("/users/{id}")
    public Map<String,Object> updateUser(@PathVariable long id,@Valid @RequestBody UserRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.updateUser(writer(user),id,b);
    }
    @PostMapping("/workspaces") @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> createWorkspace(@Valid @RequestBody WorkspaceRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.createWorkspace(writer(user),b);
    }
    @PutMapping("/workspaces/{id}")
    public Map<String,Object> updateWorkspace(@PathVariable long id,@Valid @RequestBody WorkspaceRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.updateWorkspace(writer(user),id,b);
    }
    @PostMapping("/tech-references") @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> createReference(@Valid @RequestBody ReferenceRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.createReference(writer(user),b);
    }
    @PutMapping("/tech-references/{id}")
    public Map<String,Object> updateReference(@PathVariable long id,@Valid @RequestBody ReferenceRequest b,@AuthenticationPrincipal UserDetails user) {
        return service.updateReference(writer(user),id,b);
    }
}