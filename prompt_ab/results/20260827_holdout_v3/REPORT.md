# Prompt benchmark report

Commit: `6d2459838e803145e4c967081f61ef4d5a1b2d2e`
Repeats: 3

| Node | A pass | B pass | A median | B median | Winner |
|---|---:|---:|---:|---:|---|
| generate_draft | 60.7% | 68.0% | 1728 ms | 2248 ms | variant_B |
| parse_intent | 12.7% | 25.3% | 1139 ms | 1047 ms | variant_B |
| repair_draft | 33.3% | 32.2% | 1766 ms | 1804 ms | inconclusive |
