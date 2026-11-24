# 05 — Input, identity, clocks và data quality

Verdict **PARTIAL**: original Golden18 import/hashes/canonical preservation tốt;
validation không đủ mạnh ở một số source-to-claim transitions và untrusted intake.
Không dùng empty events làm SAFE và không tự sinh DB IDs.

## Actual input verification

ZIP original `D:/Downloads/golden18_raw_artifacts.zip` SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Audit trực tiếp978manifest members: toàn bộ byte sizes/SHA256 khớp; run layout đủ
72result/frames/GT/contact bundles. Không extract/repair input. Script/evidence:
[verify_independent.py](verification/verify_independent.py),
[golden72-summary.json](evidence/golden72-summary.json).

RawArtifactAdapter L21–47 index ZIP/directory/manifest, L60–87 bind run_key và
metadata, L90–121 parse/hash, L124–135 root/symlink/traversal guard. JSON/CSV/JSONL
được giữ riêng artifact IDs, URI,hash và integrity. CSV hỗ trợ quotes/newlines/BOM,
CRCRLF và empty-cell=null; bad quoting/header/field counts thành parse issues.
Không unzip nên ZIP traversal không có extraction path; unsafe names bị reject.
Constructor/read budgets và close-on-failure còn cần hardening (FA-010).

## Identity và provenance

- Artifact `run_key` không phải DB `run_id`. source={} ở72/72; variant_id không
  parse từ FA-G…/label. BaselineBindingResolver cần explicit hash-pinned source/run/
  project/version/actual parameters/creation lineage; default tuple không xác minhv1.
- 18cases/3ONreps+1OFF: giữ mọi repetition/attempt. Same seed không là independent
  observations hoặc deterministic CARLA proof; không giảm3rep thành một mean/best run.
- Actual091 TTC=.6 ở cảON/OFF, không thay1.5. M1C kiểm variant+seed uniqueness và
  variant-disjoint operational partitions; Golden18 hiện diagnostic-only.
- Environment commit/JAR hash được ghi như provenance; source/JAR byte equivalence
  chưa chứng nhận. Pedal-map name không là calibrated domain/residual certificate.
- Hai radar khác nhau; recorder selected point/summary không là primary AEB track.
  Missing primary returns/rejections/delivery/frame age không được bù bằng GT.

## Status/error handling review

| Path | Actual behavior | Assessment |
|---|---|---|
|Missing result/stream/field|Placeholder artifact/UNKNOWN có reason, không số0|PASS trên tested paths |
|Hash/size/parse failure|Artifact unusable; canonical read INVALID, nguồn sensor độc lập còn có thể dùng|PASS tested isolation |
|Wrong numeric/NaN/Infinity/negative canonical|INVALID/null; valid evaluation copy giữ riêng; không serialize nonfinite|PASS tests, aggregate overflow explicitly rejected |
|M/evaluation disagreement|CONFLICTING, producer/copy giữ cả hai, không average|PASS; clean72copies match |
|Stream clock backwards/frame duplicate/GT-vs-CSV time|Issues phát hiện, nhiều consumers dùng blocked gate|PARTIAL: FA-002 bypass trong decomposition |
|Event metadata times / mode conflict|Không consistently gate timeline/diagnosis|FA-001 |
|Contact time/frame/preimpact support|Actor/same before-frame checks có, age/episode join thiếu|FA-003 |
|Many collision events same frame|Bị nhầm duplicate state → invalidate whole stream|FA-004 |
|Handoff EV wrapper thiếu status/source_refs|Có thể schema VERIFIED nếu rehash đúng|FA-005 |
|Oversized compressed member|readAllBytes có thể OOM process|FA-010 |

Issue codes được trả rõ trên các parse errors; report không crash cho fixture
wrong-typed canonical sample đã kiểm (BLOCKED). Điều đó không chứng minh mọi
untrusted JSON/CSV combination an toàn hoặc validate đầy đủ nested schema.

## Clocks, coverage và calibration

Core GameTime và recorder world-snapshot origin không có authoritative mapping;
GT/CSV/contact cùng recorder clock vẫn phải kiểm frame-time consistency. Không áp
universal+.01s hoặc dùng inferred+.27 của064R1 như exact causal ordering.
Sensor-only tail không kéo dài core physics episode;011 vẫn end5.09<due5.15.

No-event absence cần attach/health/actor scope/complete encounter/drain watermark;
Golden18 không cung cấp đủ. Report31recorded contacts và41UNKNOWN là đúng, không
UNKNOWN=collision hoặc SAFE. Positive event impulse0 vẫn được giữ.

Calibration applicability domain/residual/actual quality package chưa bound vào
operational baseline. Current report luônUNKNOWN cho corrected pedal response,
NA cho uncorrected kinematics. Đây là truthful data limitation, đồng thời positive
domain handling chưa wired (FA-007). Không lấy Golden18 làm proof calibration fit
đã hoàn tất; cũng không phủ nhận Golden18 đã sử dụng calibrated simulator metadata.

DEP-01/02 là thiếu actual authorized data, không sửa parser để fabricate IDs/score/
range hoặc borrow current DB calibration. Eight original specs và old audits không
được ghi đè trong đợt này.

Mọi finding đầy đủ fields/severity/ownership ở
[10_DEFECTS_AND_REMAINING_WORK.md](10_DEFECTS_AND_REMAINING_WORK.md).
