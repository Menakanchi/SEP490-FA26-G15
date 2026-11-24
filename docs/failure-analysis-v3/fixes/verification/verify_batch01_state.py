"""Validate the original negative reproductions, authorized diff and immutable evidence."""
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

BASE = Path('docs/failure-analysis-v3/fixes')
EV = BASE / 'batch-01-evidence'
AUDIT = Path('docs/failure-analysis-v3/final-audit')

after = json.loads((EV / 'final-replay/independent-probes-after.json').read_text())['observations']
before = json.loads((AUDIT / 'evidence/independent-probes-final-v2.json').read_text())['observations']
checks = []

def check(name, condition, detail):
    checks.append(dict(id=name, passed=bool(condition), evidence=detail))

mode = after['MODE_CONFLICT_STILL_DIAGNOSED']
check('FA-001-mode', mode['behavior']['value'] == 'UNKNOWN' and not mode['candidates']
      and mode['outcome']['value'] == 'COLLISION', 'Unresolved mode blocks functional candidates; positive contact survives')
time = after['NEGATIVE_TIMELINE_EVENT_TIMES']
check('FA-001-event-times', time['behavior']['value'] == 'UNKNOWN' and not time['candidates']
      and any(i['reason_code'] == 'AEB_EVENT_TIME_INVALID' for i in time['validation']), 'Negative decision/command are invalid, not valid engagement')
decomposition = after['BACKWARDS_CLOCK_STOPPING_DECOMPOSITION']['decomposition']
check('FA-002-clock', all(decomposition[k]['value'] is None and decomposition[k]['source_refs']
      and decomposition[k]['reason_codes'] for k in ['trace_component', 'extrapolated_component', 'replay_difference'])
      and decomposition['total_as_recorded']['value'] == 9.35, 'Breakdown withheld; stored canonical 9.35 retained')
stale = after['STALE_PRECONTACT_FRAME']
check('FA-003-stale', stale['contact']['vector_relative_speed']['value'] is None
      and stale['outcome']['value'] == 'COLLISION' and stale['contact']['recorded_relative_speed']['value'] == 13.935,
      'Stale declared before frame cannot reconstruct velocity; independent positive event/scalar survive')
outside = after['CONTACT_EVENT_OUTSIDE_RECORDED_EPISODE']
check('FA-003-episode', not outside['contact']['admissible_recorded_contact']
      and outside['outcome']['value'] is None and outside['contact']['contact_time']['value'] is None,
      'Event timestamp 50000 does not bind to its recorded world frame')
multiple = after['MULTIPLE_CONTACTS_ONE_WORLD_FRAME']
check('FA-004-multiplicity', multiple['outcome']['value'] == 'COLLISION'
      and multiple['contact']['recorded_relative_speed']['value'] == 13.935
      and not any(i['reason_code'] == 'DUPLICATE_FRAME_DISAGREEMENT' for i in multiple['validation']),
      'Other actor in same tick cannot erase matching target contact')
probe_summary = dict(checks=checks, passed=sum(c['passed'] for c in checks), failed=sum(not c['passed'] for c in checks),
                     original_probe_sha256=hashlib.sha256((AUDIT/'verification/FinalAuditProbe.java').read_bytes()).hexdigest(),
                     scope='EXACT_ORIGINAL_AUDIT_PROBE_WITH_NEW_PRODUCTION_CLASSES')
(EV/'probe-regression-summary.json').write_text(json.dumps(probe_summary, indent=2), encoding='utf-8')
assert all(c['passed'] for c in checks), checks

allowed = {f'src/main/java/com/vsos/core/failureanalysis/{name}.java' for name in [
    'EvidenceValidator', 'AebTimelineBuilder', 'DiagnosisPolicy', 'DiagnosticSupport',
    'DiagnosticReport', 'ImpactAnalyzer', 'ObjectiveExplainer']}
snapshot = json.loads((EV/'protected-before.json').read_text(encoding='utf-8-sig'))
changed, unauthorized, missing = [], [], []
for name, expected in snapshot.items():
    path = Path(name)
    if not path.is_file():
        missing.append(name)
    elif hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        changed.append(path.as_posix())
        if path.as_posix() not in allowed:
            unauthorized.append(name)
assert not unauthorized and not missing, (unauthorized, missing)
assert set(changed) == allowed, changed
audit_files = [name for name in snapshot if Path(name).as_posix().startswith(AUDIT.as_posix()+'/')]
diffs = []
for old in sorted((EV/'before-source').glob('*.java')):
    current = Path('src/main/java/com/vsos/core/failureanalysis')/old.name
    if old.read_bytes() != current.read_bytes():
        diffs.extend(difflib.unified_diff(old.read_text(encoding='utf-8').splitlines(True),
                                         current.read_text(encoding='utf-8').splitlines(True),
                                         fromfile='before/'+old.name, tofile=current.as_posix()))
(EV/'production-source.diff').write_text(''.join(diffs), encoding='utf-8')
test = Path('src/test/java/com/vsos/core/failureanalysis/HighSeverityFindingsRegressionTest.java')
(EV/'new-regression-test.diff').write_text(''.join(difflib.unified_diff([],test.read_text(encoding='utf-8').splitlines(True),
                                         fromfile='/dev/null',tofile=test.as_posix())),encoding='utf-8')
status = subprocess.check_output(['git','status','--short'],text=True)
(EV/'git-status-after.txt').write_text(status,encoding='utf-8')
tracked = subprocess.check_output(['git','diff','--stat'],text=True)
staged = subprocess.check_output(['git','diff','--cached','--stat'],text=True)
assert not tracked and not staged, (tracked, staged)

results = {}
for label in ['baseline-focused','regression-before-validated','regression-after-final','focused-after','full-after','focused-final','full-final','focused-accepted','full-accepted']:
    text = (EV/(label+'.log')).read_text(encoding='utf-16')
    counts = [m for m in re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)',text) if ' -- in ' not in m[4]]
    assert counts, label
    total, failed, errors, skip = map(int,counts[-1][:4])
    results[label] = dict(total=total, passed=total-failed-errors-skip, failures=failed, errors=errors, skipped=skip,
                          build='SUCCESS' if 'BUILD SUCCESS' in text else 'FAILURE')
assert results['baseline-focused'] == dict(total=590,passed=588,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['regression-before-validated'] == dict(total=37,passed=6,failures=31,errors=0,skipped=0,build='FAILURE')
assert results['focused-after'] == dict(total=632,passed=630,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['full-after'] == dict(total=1359,passed=1354,failures=2,errors=0,skipped=3,build='FAILURE')
assert results['focused-final'] == dict(total=633,passed=631,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['full-final'] == dict(total=1360,passed=1355,failures=2,errors=0,skipped=3,build='FAILURE')
assert results['focused-accepted'] == dict(total=634,passed=632,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['full-accepted'] == dict(total=1361,passed=1356,failures=2,errors=0,skipped=3,build='FAILURE')
focused = (EV/'focused-accepted.log').read_text(encoding='utf-16')
regression = re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+).* -- in com.vsos.core.failureanalysis.HighSeverityFindingsRegressionTest',focused)
assert regression and tuple(map(int,regression.groups())) == (44,0,0,0)
results['final-regression-in-focused'] = dict(total=44,passed=44,failures=0,errors=0,skipped=0)
full = (EV/'full-accepted.log').read_text(encoding='utf-16')
failures = sorted(set(re.findall(r'\[ERROR\]\s+([A-Za-z]\w*Test\.\w+):\d+',full)))
assert failures == sorted([
    'OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt',
    'OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor',
]), failures
report = (BASE/'FIX_BATCH_01_REPORT.md').read_text(encoding='utf-8')
broken = []
for target in re.findall(r'\]\(([^)]+)\)',report):
    if '://' in target or target.startswith('#'):
        continue
    if not (BASE/target.split('#',1)[0]).exists():
        broken.append(target)
assert not broken, broken
status_block = re.search(r'```text\n(.*?)\n```',report,re.S)
assert status_block and status_block.group(1).strip() == status.strip(), 'Report git status differs from current status'

summary = dict(protected_files=len(snapshot),unchanged=len(snapshot)-len(changed),authorized_source_changes=changed,
               unauthorized_changes=unauthorized,missing=missing,original_audit_files_unchanged=len(audit_files),
               original_audit_unchanged=True,raw_and_eight_contracts_unchanged=True,
               tracked_diff_stat=tracked,staged_diff_stat=staged,test_results=results,
               full_failure_names=failures,report_links_valid=True,report_git_status_matches=True,
               new_test_file=test.as_posix(),status='PASS')
(EV/'final-state-verification.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
