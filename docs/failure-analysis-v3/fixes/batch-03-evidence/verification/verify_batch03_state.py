"""Batch03 scope, independent dossier/reference checks and recorded Maven outcomes.
Never mutates protected history or redefines the Golden18 oracle.
"""
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

EV = Path('docs/failure-analysis-v3/fixes/batch-03-evidence')
FINAL = EV / 'final-confirmation'
FA = Path('src/main/java/com/vsos/core/failureanalysis')
TEST = Path('src/test/java/com/vsos/core/failureanalysis')
allowed = {str(FA / (n + '.java')).replace('\\', '/') for n in ['DiagnosticReport', 'ObjectiveExplainer']}
new_main = {'AnalysisContext.java', 'AnalysisContextValidator.java', 'HypothesisInvestigator.java'}
new_tests = {'Batch03ContextTest.java', 'Batch03DossierRegressionTest.java'}
snapshot = json.loads((EV/'protected-before.json').read_text(encoding='utf-8-sig'))
hashes, changed, missing = {}, set(), []
for name, expected in snapshot.items():
    path = Path(name)
    if not path.is_file():
        missing.append(name)
        continue
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    hashes[name] = dict(before=expected, after=actual, unchanged=actual == expected)
    if expected != actual:
        changed.add(path.as_posix())
assert changed == allowed and not missing, (changed, missing)
for folder, current, expected in [('main', FA, new_main), ('test', TEST, new_tests)]:
    old = {p.name for p in (EV/'before-source'/folder).glob('*.java')}
    assert {p.name for p in current.glob('*.java')} - old == expected
    if folder == 'test':
        for p in (EV/'before-source'/folder).glob('*.java'):
            assert p.read_bytes() == (current/p.name).read_bytes(), p
diffs, stats = [], []
for folder, current in [('main', FA), ('test', TEST)]:
    lines = []
    for path in sorted(current.glob('*.java')):
        before = EV/'before-source'/folder/path.name
        a = before.read_text(encoding='utf-8').splitlines(True) if before.exists() else []
        b = path.read_text(encoding='utf-8').splitlines(True)
        if a != b:
            diff = list(difflib.unified_diff(a, b, fromfile='before/'+path.name if before.exists() else '/dev/null', tofile=path.as_posix()))
            lines.extend(diff)
            stats.append(dict(file=path.as_posix(), added=sum(x.startswith('+') and not x.startswith('+++') for x in diff),
                              removed=sum(x.startswith('-') and not x.startswith('---') for x in diff)))
    (EV/('production-source.diff' if folder == 'main' else 'new-regression-tests.diff')).write_text(''.join(lines), encoding='utf-8')
(EV/'protected-after.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')
(EV/'diff-stat.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')

results = {}
for label in ['baseline-focused', 'red-dossiers', 'context-first-run', 'context-hardening', 'focused-clean', 'focused-final',
              'focused-accepted-final', 'focused-sealed', 'focused-final-context-guards', 'full-final']:
    log = (EV/(label+'.log')).read_text(encoding='utf-16')
    counts = [m for m in re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)', log) if ' -- in ' not in m[4]]
    total, failed, errors, skip = map(int, counts[-1][:4])
    results[label] = dict(total=total, passed=total-failed-errors-skip, failures=failed, errors=errors, skipped=skip,
                          build='SUCCESS' if 'BUILD SUCCESS' in log else 'FAILURE')
assert results['baseline-focused'] == dict(total=713, passed=711, failures=0, errors=0, skipped=2, build='SUCCESS')
assert results['red-dossiers'] == dict(total=5, passed=0, failures=5, errors=0, skipped=0, build='FAILURE')
assert results['focused-final-context-guards'] == dict(total=793, passed=791, failures=0, errors=0, skipped=2, build='SUCCESS')
assert results['full-final'] == dict(total=1520, passed=1515, failures=2, errors=0, skipped=3, build='FAILURE')
full = (EV/'full-final.log').read_text(encoding='utf-16')
for name in ['executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt',
             'executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor']:
    assert name in full
focused = (EV/'focused-final-context-guards.log').read_text(encoding='utf-16')
for name, count in [('Batch02RegressionTest', 79), ('HighSeverityFindingsRegressionTest', 44), ('Batch03ContextTest', 72), ('Batch03DossierRegressionTest', 8)]:
    match = re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+).* -- in com.vsos.core.failureanalysis.'+name, focused)
    assert tuple(map(int, match.groups())) == (count, 0, 0, 0), (name, match)
(EV/'test-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')

before_base = EV.parent/'batch-02-evidence/final-confirmation/diagnostics'
dossiers, plans, objective_links = 0, 0, 0
before_after = {}
for path in sorted((FINAL/'diagnostics').glob('*.json')):
    report = json.loads(path.read_text())
    body = report['report']
    old = json.loads((before_base/path.name).read_text())['report']
    for key in ['physical_outcome', 'observed_behavior', 'impact_analysis', 'paired_mitigation', 'physical_feasibility', 'physical_limit']:
        assert body[key] == old[key], (path.name, key)
    assert body['functional_candidates'] == old['functional_candidates']
    assert not body['analysis_context']['verified_no_contact'] and not body['analysis_context']['packages']
    assert all(x['status'] in ('UNKNOWN', 'NOT_APPLICABLE') for x in body['calibration_applicability'])
    candidate_ids = {x['id'] for x in body['functional_candidates']}
    hypothesis_ids = {x['id'] for x in body['root_cause_hypotheses']}
    assert len(hypothesis_ids) == len(body['root_cause_hypotheses'])
    for hypothesis in body['root_cause_hypotheses']:
        dossiers += 1
        assert hypothesis['status'] == 'SUSPECTED'
        assert hypothesis['root_cause_certainty']['status'] == 'UNKNOWN'
        assert set(hypothesis['related_failure_candidate_ids']) <= candidate_ids
        assert hypothesis['technical_mechanism'] and hypothesis['source_mechanism_refs']
        assert hypothesis['supporting_evidence'] and hypothesis['alternative_hypotheses'] and hypothesis['missing_evidence']
        assert hypothesis['runtime_source_equivalence']['status'] == 'UNKNOWN'
        for plan in hypothesis['falsification_tests']:
            plans += 1
            assert plan['execution_status'] == 'NOT_EXECUTED'
            assert plan['executable_status'] == 'BLOCKED_BY_EXTERNAL_EVIDENCE'
            assert all(plan[x] for x in ['hypothesis', 'required_evidence', 'expected_if_true', 'refuting_observation', 'required_alignment', 'formula_refs', 'source_mechanism_refs'])
    for objective in ['rms_jerk_mps3', 'impact_speed_mps', 'stopping_distance_m']:
        links = body['objectives'][objective]['explanation']['hypothesis_objective_links']
        assert len(links) == len(hypothesis_ids)
        for link in links:
            objective_links += 1
            assert link['hypothesis_id'] in hypothesis_ids and link['relation'] == 'HYPOTHESIZED'
            assert link['source_refs'] and link['formula_refs'] and link['limitations']
    if path.stem in ['FA-G1-007-R1', 'FA-G3-064-R1', 'FA-G5-125-R1']:
        before_after[path.stem] = dict(before_hypotheses=old['root_cause_hypotheses'], after_hypotheses=body['root_cause_hypotheses'],
                                     unchanged_outcome=body['physical_outcome'], unchanged_candidates=body['functional_candidates'])
assert dossiers == 26 and objective_links == 78
(FINAL/'dossier-verification.json').write_text(json.dumps(dict(status='PASS', dossiers=dossiers, plans_not_executed=plans,
    objective_links=objective_links, canonical_values_changed=0, before_after_facts_unchanged=72, production_authorities_supplied=0), indent=2), encoding='utf-8')
(FINAL/'finding-before-after.json').write_text(json.dumps(before_after, indent=2), encoding='utf-8')
git = subprocess.check_output(['git', 'status', '--short'], text=True)
(EV/'git-status-after.txt').write_text(git, encoding='utf-8')
diff = subprocess.check_output(['git', 'diff', '--stat'], text=True)
(EV/'git-diff-stat.txt').write_text(diff, encoding='utf-8')
summary = dict(protected_paths=len(hashes), protected_paths_unchanged=len(hashes)-len(changed), changed_existing=sorted(changed),
               new_main=sorted(new_main), new_tests=sorted(new_tests), outside_scope_changes=0, all_old_tests_unchanged=True,
               contracts_and_prior_reports_unchanged=True, raw_archive_unchanged=True, dossiers=dossiers, plans=plans, objective_links=objective_links)
(EV/'preservation-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
print(json.dumps(results, indent=2))
