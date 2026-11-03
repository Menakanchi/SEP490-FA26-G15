package com.vsos.backend.service.aeb;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.system.SystemViewService;

/** Dữ liệu đọc của màn AEB: danh sách phiên bản AEB kèm tham số. Tách từ {@code ViewsService} (quy tắc đặt tên, mục 7). */
@Service
public class AebViewService {

    private final Queries queries;

    public AebViewService(Queries queries) {
        this.queries = queries;
    }

    public List<Map<String, Object>> aebVersions() {
        Row project = queries.currentProject();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row v : queries.versions(project.lng("id"), true)) {
            Map<String, Object> m = versionBrief(v);
            m.put("parameters", queries.aebValues(v.lng("id")));
            out.add(m);
        }
        return out;
    }

    /** Một dòng phiên bản AEB như các màn hiển thị; dùng chung với ngữ cảnh ({@link SystemViewService#context}). */
    public static Map<String, Object> versionBrief(Row v) {
        return Json.obj("id", v.lng("id"), "label", Vs.versionLabel(v), "version_number", v.lng("version_no"), "status", v.str("status"),
                "source", v.str("source"), "parent_version_id", v.getLong("parent_version_id"), "notes", v.str("notes"),
                "created_at", Vs.iso(v.ts("created_date")));
    }
}
