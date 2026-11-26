import type { FailureDetail } from "@/types/vehicsim";
import { classificationPresentation } from "./analysisClassificationData";
import styles from "./AnalysisRunEvidence.module.css";

/** Legacy-only boundary: a future V3 report needs its own contract and renderer. */
export function AnalysisClassification({ detail }: { detail: FailureDetail }) {
  const state = classificationPresentation(detail);
  return <div className={styles.classification} aria-label="Đánh giá và phân loại từ backend">
    <dl className={styles.classificationFacts}>
      <div><dt>Kết quả đánh giá</dt><dd>{state.evaluation}</dd></div>
      <div><dt>{state.trusted ? "Phân loại lỗi đã lưu" : "Phân loại đã lưu · chưa đủ điều kiện kết luận"}</dt><dd>{state.classification}</dd></div>
    </dl>
    <p className="analysis-caption">Va chạm chưa chứng minh bỏ sót phanh hay phanh không hiệu quả. Không va chạm chưa chứng minh phanh oan hoặc an toàn tuyệt đối. Phân loại giữ nguyên từ backend; giao diện không tự chấm. Đây chưa phải Failure Analysis V3.1: API chưa cung cấp lỗi chức năng nghi ngờ, giả thuyết nguyên nhân hoặc nguyên nhân gốc đã xác nhận của lõi V3.1.</p>
  </div>;
}
