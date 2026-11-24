"""Verify real outputs, exact authorized diff, unchanged history and recorded test outcomes."""
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

EV = Path('docs/failure-analysis-v3/fixes/batch-02-evidence')
FINAL = EV / 'final-confirmation'
FA = Path('src/main/java/com/vsos/core/failureanalysis')
TEST = Path('src/test/java/com/vsos/core/failureanalysis')
after = json.loads((FINAL/'independent-probes-after.json').read_text())['observations']
before = json.loads((EV/'independent-probes-before.json').read_text())['observations']
assert after == json.loads((FINAL/'independent-probes-post-signed-seed.json').read_text())['observations']
cross = json.loads((EV/'cross-jvm-schema-digest.json').read_text())
assert cross['status'] == 'PASS' and cross['jvm1'] == cross['jvm2']
checks = []


def check(name, condition):
    checks.append(dict(id=name, passed=bool(condition)))


check('FA-001-mode', after['MODE_CONFLICT_STILL_DIAGNOSED']['behavior']['value'] == 'UNKNOWN'
      and not after['MODE_CONFLICT_STILL_DIAGNOSED']['candidates'])
check('FA-001-time', after['NEGATIVE_TIMELINE_EVENT_TIMES']['behavior']['value'] == 'UNKNOWN'
      and not after['NEGATIVE_TIMELINE_EVENT_TIMES']['candidates'])
stop = after['BACKWARDS_CLOCK_STOPPING_DECOMPOSITION']['decomposition']
check('FA-002', all(stop[k]['value'] is None and stop[k]['reason_codes'] and stop[k]['source_refs']
                   for k in ['trace_component', 'extrapolated_component', 'replay_difference'])
      and stop['total_as_recorded']['value'] == 9.35)
stale = after['STALE_PRECONTACT_FRAME']
check('FA-003-stale', stale['contact']['vector_relative_speed']['value'] is None
      and stale['outcome']['value'] == 'COLLISION' and stale['contact']['recorded_relative_speed']['value'] == 13.935)
outside = after['CONTACT_EVENT_OUTSIDE_RECORDED_EPISODE']
check('FA-003-episode', not outside['contact']['admissible_recorded_contact'] and outside['contact']['contact_time']['value'] is None)
multiple = after['MULTIPLE_CONTACTS_ONE_WORLD_FRAME']
check('FA-004', multiple['outcome']['value'] == 'COLLISION'
      and not any(i['reason_code'] == 'DUPLICATE_FRAME_DISAGREEMENT' for i in multiple['validation']))
check('FA-005-original-reproduction', before['MISSING_NESTED_EV_STATUS']['schema'] == 'VERIFIED'
      and after['MISSING_NESTED_EV_STATUS']['schema'] == 'INVALID'
      and after['MISSING_NESTED_EV_STATUS']['integrity'] == 'VERIFIED')
hint = after['POSITIVE_SYNTHETIC_HINT_REFERENCES']
check('FA-006-original-reproduction', hint['hint']['status'] == 'SUSPECTED'
      and hint['hint']['related_candidate_ids'] == ['synthetic-ineffective']
      and hint['hint']['hypothesis_refs'] == hint['report_hypothesis_ids'] == [])
kinematic = after['KINEMATIC_PROFILE_EXPLANATION']
check('FA-008-original-reproduction', kinematic['signal']['value'] == 'ego_a'
      and kinematic['window']['value'] == 'brake_onset_t to end of run'
      and 'CARLA' not in json.dumps(kinematic['explanation'])
      and 'T_AEB' not in json.dumps(kinematic['explanation']))
for name, schema, overall in [('SYNTHETIC-POSITIVE', 'VERIFIED', 'NOT_DIRECTLY_CONSUMABLE'),
                              ('SYNTHETIC-INVALID-SCHEMA', 'INVALID', 'BLOCKED'),
                              ('SYNTHETIC-WRONG-CLAIM', 'VERIFIED', 'BLOCKED')]:
    r = json.loads((FINAL/(name+'-compatibility.json')).read_text())
    check(name, r['input_validation']['schema'] == schema and r['input_validation']['integrity'] == 'VERIFIED'
          and r['overall'] == overall and not r['dispatch_allowed'] and not r['operational_ready'])
    if name == 'SYNTHETIC-WRONG-CLAIM':
        check('typed-rejection-is-specific', any(f['code'] == 'HINT_TYPED_CLAIM_REFERENCE_INVALID' for f in r['findings']))
g = json.loads((FINAL/'GOLDEN18-audited-compatibility.json').read_text())
check('Golden18-schema-operational-distinction', g['input_validation']['schema'] == g['input_validation']['integrity'] == 'VERIFIED'
      and g['overall'] == 'NOT_DIRECTLY_CONSUMABLE' and not g['dispatch_allowed'])
assert all(c['passed'] for c in checks), checks
(EV/'probe-regression-summary.json').write_text(json.dumps(dict(checks=checks, passed=len(checks), failed=0), indent=2), encoding='utf-8')

allowed = {str(FA/(n+'.java')).replace('\\', '/') for n in ['ConsumerCompatibilityValidator', 'DiagnosticReport', 'EvidenceReport',
           'MetricProvenanceResolver', 'MoboHandoffBuilder', 'ObjectiveExplainer', 'ParameterHintBuilder']}
snapshot = json.loads((EV/'protected-before.json').read_text(encoding='utf-8-sig'))
changes, hashes, missing, unauthorized = [], {}, [], []
for name, expected in snapshot.items():
    p = Path(name)
    if not p.is_file():
        missing.append(name)
        continue
    actual = hashlib.sha256(p.read_bytes()).hexdigest()
    hashes[name] = dict(before=expected, after=actual, unchanged=actual == expected)
    if expected != actual:
        changes.append(p.as_posix())
        if p.as_posix() not in allowed:
            unauthorized.append(name)
assert set(changes) == allowed and not missing and not unauthorized, (changes, missing, unauthorized)
for folder, dest, new_name in [('main', FA, 'HandoffSchemaValidator.java'), ('test', TEST, 'Batch02RegressionTest.java')]:
    existing = {p.name for p in (EV/'before-source'/folder).glob('*.java')}
    assert {p.name for p in dest.glob('*.java')} - existing == {new_name}
    for p in (EV/'before-source'/folder).glob('*.java'):
        if folder == 'test':
            assert p.read_bytes() == (dest/p.name).read_bytes(), p
diff = []
stats = []
for p in sorted(FA.glob('*.java')):
    old = EV/'before-source/main'/p.name
    old_lines = old.read_text(encoding='utf-8').splitlines(True) if old.exists() else []
    new_lines = p.read_text(encoding='utf-8').splitlines(True)
    if old_lines != new_lines:
        d = list(difflib.unified_diff(old_lines, new_lines, fromfile='before/'+p.name if old.exists() else '/dev/null', tofile=p.as_posix()))
        diff.extend(d)
        stats.append(dict(file=p.as_posix(), added=sum(x.startswith('+') and not x.startswith('+++') for x in d),
                          removed=sum(x.startswith('-') and not x.startswith('---') for x in d)))
(EV/'production-source.diff').write_text(''.join(diff), encoding='utf-8')
test = TEST/'Batch02RegressionTest.java'
(EV/'new-regression-test.diff').write_text(''.join(difflib.unified_diff([], test.read_text().splitlines(True), fromfile='/dev/null', tofile=test.as_posix())), encoding='utf-8')
(EV/'protected-after.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')
(EV/'diff-stat.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
results = {}
for label in ['baseline-focused', 'red', 'red-signed-seed', 'green', 'focused-accepted-final', 'full-accepted-final']:
    text = (EV/(label+'.log')).read_text(encoding='utf-16')
    counts = [m for m in re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)', text) if ' -- in ' not in m[4]]
    total, failed, errors, skip = map(int, counts[-1][:4])
    results[label] = dict(total=total, passed=total-failed-errors-skip, failures=failed, errors=errors, skipped=skip,
                          build='SUCCESS' if 'BUILD SUCCESS' in text else 'FAILURE')
assert results['baseline-focused'] == dict(total=634, passed=632, failures=0, errors=0, skipped=2, build='SUCCESS')
assert results['red'] == dict(total=44, passed=13, failures=31, errors=0, skipped=0, build='FAILURE')
assert results['red-signed-seed'] == dict(total=3, passed=1, failures=2, errors=0, skipped=0, build='FAILURE')
assert results['green'] == dict(total=179, passed=179, failures=0, errors=0, skipped=0, build='SUCCESS')
assert results['focused-accepted-final'] == dict(total=713, passed=711, failures=0, errors=0, skipped=2, build='SUCCESS')
assert results['full-accepted-final'] == dict(total=1440, passed=1435, failures=2, errors=0, skipped=3, build='FAILURE')
focused = (EV/'focused-accepted-final.log').read_text(encoding='utf-16')
for name, count in [('Batch02RegressionTest', 79), ('HighSeverityFindingsRegressionTest', 44)]:
    match = re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+).* -- in com.vsos.core.failureanalysis.'+name, focused)
    assert match and tuple(map(int, match.groups())) == (count, 0, 0, 0)
full = (EV/'full-accepted-final.log').read_text(encoding='utf-16')
failures = sorted(set(re.findall(r'\[ERROR\]\s+([A-Za-z]\w*Test\.\w+):\d+', full)))
assert failures == sorted(['OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt',
                           'OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor']), failures
status = subprocess.check_output(['git', 'status', '--short'], text=True)
(EV/'git-status-after.txt').write_text(status, encoding='utf-8')
assert not subprocess.check_output(['git','diff','--stat'], text=True)
assert not subprocess.check_output(['git','diff','--cached','--stat'], text=True)
report = Path('docs/failure-analysis-v3/fixes/FIX_BATCH_02_REPORT.md').read_text(encoding='utf-8')
for link in re.findall(r'\]\(([^)]+)\)', report):
    if link == 'batch-02-evidence/final-state-verification.json':
        continue  # This result file is created below, after every check succeeds.
    if '://' not in link and not link.startswith('#'):
        assert (Path('docs/failure-analysis-v3/fixes')/link.split('#', 1)[0]).exists(), link
status_block = re.search(r'```text\n(.*?)\n```', report, re.S)
assert status_block and status_block.group(1).strip() == status.strip(), 'Report Git status differs from actual status'
summary = dict(status='PASS', protected_files=len(snapshot), unchanged=len(snapshot)-len(changes), authorized_source_changes=changes,
               new_source_file=(FA/'HandoffSchemaValidator.java').as_posix(), new_test_file=test.as_posix(),
               new_source_sha256=hashlib.sha256((FA/'HandoffSchemaValidator.java').read_bytes()).hexdigest(),
               new_test_sha256=hashlib.sha256(test.read_bytes()).hexdigest(),
               old_tests_unchanged=True, unauthorized_changes=unauthorized, missing=missing,
               original_audit_unchanged=True, batch01_history_unchanged=True, eight_contracts_and_raw_unchanged=True,
               original_audit_files=sum(n.replace('\\','/').startswith('docs/failure-analysis-v3/final-audit/') for n in snapshot),
               batch01_files=sum('/batch-01-evidence/' in n.replace('\\','/') for n in snapshot),
               test_results=results, full_failure_names=failures, git_status=status, report_links_valid=True)
(EV/'final-state-verification.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
