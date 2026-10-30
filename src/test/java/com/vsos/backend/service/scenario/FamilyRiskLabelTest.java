package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;

/**
 * Nhãn tập thử của biến thể (task 5, Trung đề xuất 25/10/2026): tự suy từ hành vi người đi bộ, sửa tay được, lưu trong
 * {@code scenario_ir_json}; AUTO bỏ nhãn sửa tay.
 */
class FamilyRiskLabelTest {

    private Db db;
    private FamilyService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        service = new FamilyService(db);
        when(db.first(startsWith("SELECT v.id FROM scenario_versions v JOIN scenarios s"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("id", 21L)));
    }

    @Test
    void labelIsDerivedFromPedestrianBehaviourUnlessSetByHand() {
        Map<String, Object> crossing = Map.of("stops_at_curb", false);
        Map<String, Object> curb = Map.of("stops_at_curb", true);
        assertThat(FamilyService.autoRiskLabel(crossing)).isEqualTo("DANGEROUS");
        assertThat(FamilyService.autoRiskLabel(curb)).isEqualTo("SAFE");
        assertThat(FamilyService.riskLabel(crossing)).isEqualTo("DANGEROUS");
        assertThat(FamilyService.riskLabelManual(crossing)).isFalse();

        Map<String, Object> marked = Map.of("stops_at_curb", false, "risk_label", "SAFE");
        assertThat(FamilyService.riskLabel(marked)).isEqualTo("SAFE");
        assertThat(FamilyService.autoRiskLabel(marked)).isEqualTo("DANGEROUS");
        assertThat(FamilyService.riskLabelManual(marked)).isTrue();
        // Giá trị rác trong IR không được coi là nhãn sửa tay.
        assertThat(FamilyService.riskLabel(Map.of("stops_at_curb", true, "risk_label", "x"))).isEqualTo("SAFE");
    }

    @Test
    void countsAlwaysHaveBothLabels() {
        List<Row> rows = List.of(
                new Row(Json.obj("scenario_ir_json", "{\"stops_at_curb\":false}")),
                new Row(Json.obj("scenario_ir_json", "{\"stops_at_curb\":true}")),
                new Row(Json.obj("scenario_ir_json", "{\"stops_at_curb\":false,\"risk_label\":\"SAFE\"}")));
        assertThat(FamilyService.riskCounts(rows)).containsEntry("DANGEROUS", 1L).containsEntry("SAFE", 2L);
        assertThat(FamilyService.riskCounts(List.of())).containsEntry("DANGEROUS", 0L).containsEntry("SAFE", 0L);
    }

    @Test
    void manualLabelIsWrittenIntoTheVariantIr() {
        when(db.first(startsWith("SELECT scenario_ir_json"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("scenario_ir_json", "{\"stops_at_curb\":false,\"risk_label\":\"SAFE\"}")));
        Map<String, Object> out = service.setRiskLabel(1L, 8L, 21L, "SAFE");
        verify(db).update(startsWith("UPDATE scenario_versions SET scenario_ir_json = JSON_SET"), eq("SAFE"), eq(21L));
        assertThat(out).containsEntry("risk_label", "SAFE").containsEntry("auto_label", "DANGEROUS").containsEntry("manual", true);
    }

    @Test
    void autoRemovesTheManualLabel() {
        when(db.first(startsWith("SELECT scenario_ir_json"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("scenario_ir_json", "{\"stops_at_curb\":false}")));
        Map<String, Object> out = service.setRiskLabel(1L, 8L, 21L, "AUTO");
        verify(db).update(startsWith("UPDATE scenario_versions SET scenario_ir_json = JSON_REMOVE"), eq(21L));
        assertThat(out).containsEntry("risk_label", "DANGEROUS").containsEntry("manual", false);
    }

    @Test
    void unknownLabelOrVariantOutsideTheFamilyIsRefused() {
        assertThatThrownBy(() -> service.setRiskLabel(1L, 8L, 21L, "maybe")).isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("DANGEROUS");
        when(db.first(startsWith("SELECT v.id FROM scenario_versions v JOIN scenarios s"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> service.setRiskLabel(1L, 8L, 99L, "SAFE")).isInstanceOf(NotFoundException.class);
        verify(db, never()).update(anyString(), any(Object[].class));
    }
}
