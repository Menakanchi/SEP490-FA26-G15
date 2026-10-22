package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * AEB versions (FE-11, bản tối thiểu cho vòng MVP): tạo cấu hình ứng viên. Port của ``aeb.py``.
 * <p>
 * Ứng viên luôn sinh từ một version cha, chép đủ 4 tham số chỉnh được rồi ghi đè các giá trị được đổi — nên mọi version
 * luôn có đủ bộ tham số, và mọi giá trị phải nằm trong [min_value, max_value] của ``aeb_parameters``.
 */
@Service
public class AebService {

    private final Db db;
    private final Queries queries;

    public AebService(Db db, Queries queries) {
        this.db = db;
        this.queries = queries;
    }

    @Transactional
    public long createCandidate(long projectId, long userId, long parentVersionId, Map<String, Double> values, String label, String notes) {
        Row parent = db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", parentVersionId, projectId);
        if (parent == null) {
            throw new NotFoundException("parent AEB version");
        }
        Map<String, Row> catalog = new LinkedHashMap<>();
        for (Row p : db.list("SELECT * FROM aeb_parameters")) {
            catalog.put(p.str("code"), p);
        }
        List<String> unknown = new ArrayList<>(new TreeSet<>(values.keySet()));
        unknown.removeIf(catalog::containsKey);
        if (!unknown.isEmpty()) {
            throw new InvalidRequestException("tham số không tồn tại: " + unknown);
        }
        for (Map.Entry<String, Double> e : values.entrySet()) {
            Row p = catalog.get(e.getKey());
            double lo = p.dbl("min_value");
            double hi = p.dbl("max_value");
            if (e.getValue() < lo || e.getValue() > hi) {
                throw new InvalidRequestException(e.getKey() + " = " + e.getValue() + " ngoài khoảng [" + lo + ", " + hi + "] " + p.str("unit"));
            }
        }
        Map<String, Double> parentValues = queries.aebValues(parent.lng("id"));
        Map<String, Double> merged = new LinkedHashMap<>(parentValues);
        merged.putAll(values);
        if (merged.equals(parentValues)) {
            throw new InvalidRequestException("ứng viên phải khác version cha ít nhất một tham số");
        }

        Object max = db.scalar("SELECT MAX(version_no) FROM aeb_versions WHERE project_id = ?", projectId);
        long nextNumber = (max == null ? 0 : ((Number) max).longValue()) + 1;
        String cleanLabel = label == null ? "" : label.strip();
        String cleanNotes = notes == null ? "" : notes.strip();
        long versionId = db.insert(
                "INSERT INTO aeb_versions (project_id, version_no, label, source, status, parent_version_id, notes, created_by_user_id, created_date) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)",
                projectId, nextNumber, cleanLabel.isEmpty() ? "v" + nextNumber : cleanLabel, "MANUAL", "CANDIDATE", parent.lng("id"),
                cleanNotes.isEmpty() ? null : cleanNotes, userId, Vs.now());
        List<Object[]> rows = new ArrayList<>();
        for (Map.Entry<String, Double> e : merged.entrySet()) {
            rows.add(new Object[]{versionId, catalog.get(e.getKey()).lng("id"), e.getValue()});
        }
        db.batchInsert("INSERT INTO aeb_parameter_values (aeb_version_id, parameter_id, param_value) VALUES (?,?,?)", rows);
        return versionId;
    }
}
