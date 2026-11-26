package com.vsos.backend.common;

import com.vsos.backend.controller.analysis.AnalysisController;
import com.vsos.backend.controller.regression.RegressionController;
import com.vsos.backend.security.*;
import com.vsos.backend.service.analysis.*;
import com.vsos.backend.service.regression.*;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CsvExportTest {
    @Test void utf8EncodingAddsExactlyOneBom() {
        for (String input : List.of("Phân tích lỗi", "\uFEFFPhân tích lỗi", "\uFEFF\uFEFFPhân tích lỗi")) {
            assertThat(new String(Csv.utf8WithBom(input), StandardCharsets.UTF_8)).isEqualTo("\uFEFFPhân tích lỗi");
        }
    }
    private void assertExcelCsv(byte[] body, String header) {
        assertThat(body).startsWith((byte) 0xef, (byte) 0xbb, (byte) 0xbf);
        assertThat(new String(body, StandardCharsets.UTF_8)).startsWith("\uFEFF" + header).contains("Phân tích lỗi");
    }

    @Test void failureExportHasBomAndPreservesVietnameseAndQuotedCells() {
        var views = mock(AnalysisViewService.class);
        when(views.failureList(isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(1), eq(100_000)))
                .thenReturn(Json.obj("items", List.of(Json.obj("run_id", 1, "family", "Phân tích lỗi, \"AEB\""))));
        var controller = new AnalysisController(views, mock(AnalysisService.class), mock(VehicSimAccess.class));
        var response = controller.exportFailures(null, null, null, null, null, null);
        assertExcelCsv(response.getBody(), "run_id,");
        assertThat(new String(response.getBody(), StandardCharsets.UTF_8)).contains("\"Phân tích lỗi, \"\"AEB\"\"\"");
    }

    @Test void regressionExportHasBomAndPreservesVietnamese() {
        var projects = mock(ProjectAccess.class);
        when(projects.hasProject()).thenReturn(true);
        var reports = mock(RegressionReportService.class);
        when(reports.exportCsv(7)).thenReturn("variant,name\r\n1,Phân tích lỗi\r\n");
        var controller = new RegressionController(mock(RegressionService.class), mock(ReviewDecisionService.class), reports,
                mock(RegressionViewService.class), mock(VehicSimAccess.class), projects);
        assertExcelCsv(controller.exportRegressionCsv(7, null).getBody(), "variant,name");
    }
}
