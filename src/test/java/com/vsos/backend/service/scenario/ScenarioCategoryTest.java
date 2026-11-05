package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.service.common.LlmService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Mở category khỏi gán cứng CP_CROSSING (ADR-050): họ xe phía trước, nhận diện category từ câu mô tả, danh mục category. */
class ScenarioCategoryTest {

    private static FamilyService.LeadFamilySpec lead(String category, List<Double> ego, List<Double> target, List<Double> distance, List<Double> decel,
                                                     List<Double> overlap) {
        return new FamilyService.LeadFamilySpec("x", "", category, ego, target, distance, decel, overlap, List.of("CLEAR"), List.of("DAY"));
    }

    @Test
    void leadFamilyGridCarriesCategoryAndOnlyBrakingFamiliesHaveADecelAxis() {
        FamilyService.LeadFamilySpec ccrs = lead("CCRS", List.of(30.0, 50.0), List.of(0.0), List.of(40.0), null, List.of(100.0, -100.0));
        ccrs.validate();
        assertThat(ccrs.variantCount()).isEqualTo(4);
        assertThat(ccrs.grid()).allSatisfy(ir -> {
            assertThat(ir.get("category")).isEqualTo("CCRS");
            assertThat(ir).doesNotContainKey("target_decel_mps2");
        });
        assertThat(ccrs.grid().stream().map(FamilyService::autoRiskLabel).distinct().toList()).containsExactlyInAnyOrder("DANGEROUS", "SAFE");

        FamilyService.LeadFamilySpec ccrb = lead("CCRB", List.of(50.0), List.of(50.0), List.of(12.0, 40.0), List.of(-2.0, -6.0), null);
        ccrb.validate();
        assertThat(ccrb.variantCount()).isEqualTo(4);
        assertThat(ccrb.grid()).allSatisfy(ir -> assertThat(ir.get("target_decel_mps2")).isIn(-2.0, -6.0));
        assertThat(ccrb.parameterSpace()).containsKey("target_decel_mps2");
    }

    @Test
    void leadFamilyRulesRejectImpossibleCombinations() {
        assertThatThrownBy(() -> lead("CCRS", List.of(50.0), List.of(10.0), List.of(40.0), null, null).validate())
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("CCRS");
        assertThatThrownBy(() -> lead("CCRM", List.of(30.0), List.of(40.0), List.of(40.0), null, null).validate())
                .hasMessageContaining("CCRM");
        assertThatThrownBy(() -> lead("CCRB", List.of(50.0), List.of(50.0), List.of(12.0), null, null).validate())
                .hasMessageContaining("target_decels_mps2");
        assertThatThrownBy(() -> lead("CCRS", List.of(50.0), List.of(0.0), List.of(40.0), List.of(-6.0), null).validate())
                .hasMessageContaining("chỉ dùng cho CCRB");
        assertThatThrownBy(() -> lead("CCRM", List.of(12.0), List.of(10.0), List.of(200.0), null, null).validate())
                .hasMessageContaining("không đuổi kịp");
        assertThatThrownBy(() -> lead("CUT_IN", List.of(50.0), List.of(30.0), List.of(20.0), null, null).validate())
                .hasMessageContaining("CUT_IN");
    }

    @Test
    void crossingFamilyStillReportsItsOldCategory() {
        FamilyService.FamilySpec crossing = new FamilyService.FamilySpec("x", "", List.of(40.0), List.of(20.0), List.of(1.5), List.of(false),
                List.of("CLEAR"), List.of("DAY"));
        assertThat(crossing.category()).isEqualTo("CP_CROSSING");
        assertThat(crossing.targetType()).isEqualTo("PEDESTRIAN");
        assertThat(crossing.grid().get(0)).doesNotContainKey("category");
    }

    @Test
    void catalogSaysWhichCategoriesRunAndWhere() {
        Map<String, Map<String, Object>> byCode = new java.util.LinkedHashMap<>();
        ScenarioRules.catalog().forEach(row -> byCode.put((String) row.get("code"), row));
        assertThat(byCode).hasSize(7);
        assertThat(byCode.get("CP_CROSSING").get("simulators")).isEqualTo(List.of("KINEMATIC", "CARLA"));
        assertThat(byCode.get("CCRB").get("simulators")).isEqualTo(List.of("KINEMATIC"));
        assertThat(byCode.get("CUT_IN").get("supported")).isEqualTo(false);
    }

    @Test
    void rulesRecogniseLeadVehicleSentences() {
        Map<String, Object> ir = DescribeService.ruleBased("Xe chạy 60 km/h, xe tải phía trước đang chạy 40 km/h thì phanh gấp 6 m/s2, cách 20 m, trời mưa");
        assertThat(ir.get("category")).isEqualTo("CCRB");
        assertThat(ir.get("ego_speed_kmh")).isEqualTo(60.0);
        assertThat(ir.get("target_speed_kmh")).isEqualTo(40.0);
        assertThat(ir.get("target_decel_mps2")).isEqualTo(-6.0);
        assertThat(ir.get("initial_distance_m")).isEqualTo(20.0);
        assertThat(ir.get("weather")).isEqualTo("RAIN");

        Map<String, Object> parked = DescribeService.ruleBased("Ô tô chạy 50 km/h, xe phía trước đang đứng yên cách 30 m");
        assertThat(parked.get("category")).isEqualTo("CCRS");
        assertThat(parked.get("target_speed_kmh")).isEqualTo(0.0);

        assertThat(DescribeService.ruleBased("Xe máy cắt vào làn ngay trước đầu xe ô tô").get("category")).isEqualTo("CUT_IN");
        assertThat(DescribeService.ruleBased("Xe chạy 40 km/h, người đi bộ băng qua đường").get("category")).isEqualTo("CP_CROSSING");
    }

    @Test
    void describeWithoutLlmBuildsALeadVehicleIrAndNamesUnsupportedCategories() {
        DescribeService service = new DescribeService(new LlmService(new LlmService.Properties("deepseek", "", "https://api.openai.com/v1", "", "http://localhost:1", "", "", "none", 0.7, 5)));
        Map<String, Object> out = service.describe("Ô tô chạy 50 km/h, xe phía trước đang đứng yên cách 30 m ban đêm");
        assertThat(out.get("category")).isEqualTo("CCRS");
        assertThat(out.get("motif")).isEqualTo("lead_vehicle");
        @SuppressWarnings("unchecked") Map<String, Object> ir = (Map<String, Object>) out.get("ir");
        assertThat(ir).containsEntry("category", "CCRS").containsEntry("initial_distance_m", 30.0).containsEntry("time_of_day", "NIGHT");
        assertThat(ir).doesNotContainKey("target_decel_mps2");

        assertThatThrownBy(() -> service.describe("Xe máy cắt vào làn ngay trước đầu xe ô tô đang chạy"))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("CUT_IN").hasMessageContaining("chưa có bộ mô phỏng");
    }
}
