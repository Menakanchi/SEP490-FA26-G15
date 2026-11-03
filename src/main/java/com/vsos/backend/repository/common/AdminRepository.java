package com.vsos.backend.repository.common;

import org.springframework.stereotype.Repository;
import java.util.*;

/** Parameterized Admin SQL; fixed table/column allowlists only. Transactions belong to AdminService. */
@Repository
public class AdminRepository {
    private final Db db;
    public AdminRepository(Db db) { this.db = db; }

    private static final String USERS = """
        SELECT u.id,u.email,u.last_name,u.middle_name,u.first_name,
               CONCAT_WS(' ',u.last_name,u.middle_name,u.first_name) AS full_name,
               r.code AS role,u.is_active,u.created_date,u.updated_at
        FROM users u JOIN roles r ON r.id=u.role_id
        """;
    private static final String WORKSPACES = """
        SELECT w.id,w.name,w.description,w.manager_id,w.status,w.created_date,w.updated_at,
               CONCAT_WS(' ',m.last_name,m.middle_name,m.first_name) AS manager_name,m.email AS manager_email,
               (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id=w.id) AS member_count,
               (SELECT COUNT(*) FROM projects p WHERE p.workspace_id=w.id) AS project_count
        FROM workspaces w JOIN users m ON m.id=w.manager_id
        """;
    public Map<String,Object> list(String resource, String q, String filter, String role, int page, int size, String sort) {
        String select;
        String where;
        List<Object> args = new ArrayList<>();
        String needle = q == null ? "" : q.trim();
        if (needle.length() > 100) throw new com.vsos.backend.common.Vs.InvalidRequestException("Từ khóa tối đa 100 ký tự");
        switch (resource) {
            case "users" -> {
                select = USERS;
                where = " WHERE (LOCATE(?,u.email)>0 OR LOCATE(?,CONCAT_WS(' ',u.last_name,u.middle_name,u.first_name))>0)";
                args.add(needle); args.add(needle);
                if (role != null && !role.isBlank()) { where += " AND r.code=?"; args.add(role); }
                if (filter != null && !filter.isBlank()) { where += " AND u.is_active=?"; args.add("ACTIVE".equals(filter)); }
            }
            case "workspaces" -> {
                select = WORKSPACES;
                where = " WHERE (LOCATE(?,w.name)>0 OR LOCATE(?,CONCAT_WS(' ',m.last_name,m.middle_name,m.first_name))>0 OR LOCATE(?,m.email)>0)";
                args.add(needle); args.add(needle); args.add(needle);
                if (filter != null && !filter.isBlank()) { where += " AND w.status=?"; args.add(filter); }
            }
            case "tech-references" -> {
                select = "SELECT t.* FROM tech_references t";
                where = " WHERE (LOCATE(?,t.ref_code)>0 OR LOCATE(?,t.ref_name)>0)";
                args.add(needle); args.add(needle);
                if (role != null && !role.isBlank()) { where += " AND t.ref_type=?"; args.add(role); }
                if (filter != null && !filter.isBlank()) { where += " AND t.is_active=?"; args.add("ACTIVE".equals(filter)); }
            }
            default -> throw new IllegalArgumentException("Unknown admin resource");
        }
        long count = ((Number)db.scalar("SELECT COUNT(*) FROM (" + select + where + ") admin_count", args.toArray())).longValue();
        String alias = switch(resource) { case "users" -> "u"; case "workspaces" -> "w"; default -> "t"; };
        String name = switch(resource) { case "users" -> "email"; case "workspaces" -> "name"; default -> "ref_name"; };
        String order = switch(sort) {
            case "name" -> alias+"."+name+" ASC,"+alias+".id DESC";
            case "oldest" -> alias+".id ASC";
            default -> alias+".id DESC";
        };
        args.add(size); args.add((page-1)*size);
        return Map.of("items", db.list(select+where+" ORDER BY "+order+" LIMIT ? OFFSET ?",args.toArray())
                .stream().map(AdminRepository::view).toList(), "total",count,"page",page,"page_size",size);
    }

    /** Preserve DECIMAL(30,12) across JSON/JavaScript; numeric JSON would round large constants. */
    public static Map<String,Object> view(Row row) {
        Map<String,Object> result = new LinkedHashMap<>(row.asMap());
        if (result.get("ref_value") instanceof java.math.BigDecimal decimal) {
            result.put("ref_value", decimal.toPlainString());
        }
        return result;
    }

    public Row user(long id, boolean lock) {
        return db.first(USERS+" WHERE u.id=?"+(lock ? " FOR UPDATE" : ""),id);
    }
    public Row workspace(long id, boolean lock) {
        return db.first(WORKSPACES+" WHERE w.id=?"+(lock ? " FOR UPDATE" : ""),id);
    }
    public Row reference(long id, boolean lock) {
        return db.first("SELECT * FROM tech_references WHERE id=?"+(lock ? " FOR UPDATE" : ""),id);
    }
    public boolean emailExists(String email,long except) {
        return db.first("SELECT id FROM users WHERE email=? AND id<>?",email,except)!=null;
    }
    public boolean workspaceNameExists(String name,long except) {
        return db.first("SELECT id FROM workspaces WHERE name=? AND id<>?",name,except)!=null;
    }
    public boolean referenceExists(String code,String kind,String name,long except) {
        return db.first("SELECT id FROM tech_references WHERE (ref_code=? OR (ref_type=? AND ref_name=?)) AND id<>?",
                code,kind,name,except)!=null;
    }
    public boolean managesWorkspaces(long id) {
        return db.first("SELECT id FROM workspaces WHERE manager_id=? LIMIT 1",id)!=null;
    }
    public boolean hasRoleDependencies(long id) {
        return db.first("""
            SELECT id FROM workspace_members WHERE user_id=?
            UNION ALL SELECT id FROM projects WHERE created_by_user_id=?
            UNION ALL SELECT id FROM workspace_tasks WHERE assigned_to_user_id=? AND status<>'DONE'
            LIMIT 1
            """,id,id,id)!=null;
    }
    public long createUser(String email,String last,String middle,String first,String role,boolean active,String hash) {
        return db.insert("""
            INSERT INTO users(email,last_name,middle_name,first_name,role_id,is_active,password_hash)
            VALUES(?,?,?,?,(SELECT id FROM roles WHERE code=?),?,?)
            """,email,last,middle,first,role,active,hash);
    }
    public void updateUser(long id,String email,String last,String middle,String first,String role,boolean active,boolean revoke) {
        db.update("""
            UPDATE users SET email=?,last_name=?,middle_name=?,first_name=?,
              role_id=(SELECT id FROM roles WHERE code=?),is_active=?,auth_version=auth_version+? WHERE id=?
            """,email,last,middle,first,role,active,revoke ? 1 : 0,id);
    }
    public long createWorkspace(String name,String description,long manager,long actor) {
        return db.insert("INSERT INTO workspaces(name,description,manager_id,created_by_user_id) VALUES(?,?,?,?)",
                name,description,manager,actor);
    }
    public void updateWorkspace(long id,String name,String description,long manager) {
        db.update("UPDATE workspaces SET name=?,description=?,manager_id=? WHERE id=?",name,description,manager,id);
    }
    private static final String REF_COLUMNS = "ref_code,ref_type,ref_name,ref_value,unit,description,source_type,source_title,author,organization,publication_year,page,url,doi,is_active";
    public long createReference(Object[] values) {
        return db.insert("INSERT INTO tech_references("+REF_COLUMNS+") VALUES("+Db.placeholders(values.length)+")",values);
    }
    public void updateReference(long id,Object[] values) {
        List<Object> args = new ArrayList<>(Arrays.asList(values)); args.add(id);
        String set = String.join(",",Arrays.stream(REF_COLUMNS.split(",")).map(c->c+"=?").toList());
        db.update("UPDATE tech_references SET "+set+" WHERE id=?",args.toArray());
    }
}