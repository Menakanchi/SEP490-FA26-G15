"""Audit artifact completeness and byte preservation; never writes old repo files."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

BASE = Path('docs/failure-analysis-v3/final-audit')
EV = BASE / 'evidence'
before = json.loads((EV / 'protected-before.json').read_text(encoding='utf-8-sig'))
changed, missing = [], []
for name, expected in before.items():
    path = Path(name)
    if not path.is_file():
        missing.append(name)
    elif hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        changed.append(name)

status = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True, check=True).stdout
diff = subprocess.run(['git', 'diff', '--stat'], capture_output=True, text=True, check=True).stdout
cached = subprocess.run(['git', 'diff', '--cached', '--stat'], capture_output=True, text=True, check=True).stdout
(EV / 'git-status-after.txt').write_text(status, encoding='utf-8')
(EV / 'git-diff-after.txt').write_text(diff, encoding='utf-8')

expected_reports = [
    '01_EXECUTIVE_VERDICT.md', '02_FORMULA_IMPLEMENTATION_AUDIT.md',
    '03_FAILURE_DIAGNOSIS_AUDIT.md', '04_OBJECTIVE_ANALYSIS_AUDIT.md',
    '05_INPUT_DATA_QUALITY_AUDIT.md', '06_DIAGNOSTIC_REPORT_AUDIT.md',
    '07_MOBO_OUTPUT_CONTRACT_AUDIT.md', '08_TEST_AND_CODE_QUALITY_AUDIT.md',
    '09_OFFLINE_END_TO_END_AUDIT.md', '10_DEFECTS_AND_REMAINING_WORK.md',
]
broken_links = []
for name in expected_reports:
    body = (BASE / name).read_text(encoding='utf-8')
    assert len(body) > 1000, name
    for target in re.findall(r'\]\(([^)]+)\)', body):
        if '://' in target or target.startswith('#'):
            continue
        target_path = target.split('#', 1)[0].strip('<>')
        resolved = BASE / target_path
        if resolved == EV / 'protected-after-check.json':
            continue  # This script creates its own linked result below.
        if not resolved.exists():
            broken_links.append(dict(report=name, target=target))

test_logs = {}
for label in ['focused', 'full']:
    body = (EV / f'{label}-verify.log').read_text(encoding='utf-16')
    totals = re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)', body)
    aggregate = [row for row in totals if ' -- in ' not in row[4]]
    assert aggregate, label
    total, failed, errors, skipped = map(int, aggregate[-1][:4])
    test_logs[label] = dict(total=total, passed=total-failed-errors-skipped,
                            failures=failed, errors=errors, skipped=skipped,
                            build='SUCCESS' if 'BUILD SUCCESS' in body else 'FAILURE')

summary = dict(
    protected_files=len(before), unchanged=len(before)-len(changed)-len(missing),
    changed=changed, missing=missing, tracked_diff_stat=diff,
    staged_diff_stat=cached, mandatory_reports=len(expected_reports), broken_links=broken_links,
    diagnostics=len(list((EV / 'diagnostics').glob('*.json'))), test_logs=test_logs,
    status='PASS' if not (changed or missing or diff or cached or broken_links) else 'FAIL',
)
(EV / 'protected-after-check.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
assert summary['status'] == 'PASS'
assert test_logs['focused'] == dict(total=590, passed=588, failures=0, errors=0, skipped=2, build='SUCCESS')
assert test_logs['full'] == dict(total=1317, passed=1312, failures=2, errors=0, skipped=3, build='FAILURE')
assert summary['diagnostics'] == 72
