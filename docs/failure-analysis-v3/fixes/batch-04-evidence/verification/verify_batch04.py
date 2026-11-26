"""Independent mathematical checks + actual ZIP/report comparison; no production edits."""
import csv
import hashlib
import io
import json
import math
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

BASE = Path('docs/failure-analysis-v3/fixes')
EV = BASE / 'batch-04-evidence' / 'final-confirmation'


def value(x):
    return x.get('value') if isinstance(x, dict) else None


def simpson(f, left, right, n=2000):
    if right <= left:
        return 0.0
    step = (right-left)/n
    return step/3*(f(left)+f(right)+4*sum(f(left+i*step) for i in range(1, n, 2))
                   +2*sum(f(left+i*step) for i in range(2, n, 2)))


def independent_stop(v, cap, jerk, delay):
    # Integrate a(t), solve v(t)=0 by monotone bisection, then integrate v(t).
    # Split quadrature at acceleration breakpoints. No production helper/closed-form D.
    if v == 0:
        return 0.0, 0.0
    ramp = cap/jerk
    def loss(t):
        u = max(0, t-delay)
        return simpson(lambda s: min(jerk*s, cap), 0, min(u, ramp), 2)+cap*max(0, u-ramp)
    lo, hi = 0.0, delay+ramp+v/cap+1
    for _ in range(85):
        mid = (lo+hi)/2
        if loss(mid) < v:
            lo = mid
        else:
            hi = mid
    end = (lo+hi)/2
    cuts = sorted(set([0, end]+[t for t in (delay, delay+ramp) if 0 < t < end]))
    distance = sum(simpson(lambda t: max(0, v-loss(t)), a, b, 20) for a, b in zip(cuts, cuts[1:]))
    return distance, end


probe = json.loads((EV/'independent-probes-after.json').read_text())
n = probe['numerics']
checks = []


def check(name, actual, expected, tolerance=1e-8):
    ok = actual == expected if not isinstance(expected, (int, float)) or isinstance(expected, bool) else actual is not None and math.isfinite(actual) and abs(actual-expected) <= tolerance
    checks.append(dict(id=name, actual=actual, expected=expected, absolute_numeric_tolerance=tolerance if isinstance(expected, (int, float)) else None, passed=ok))


for i, case in enumerate(n['stops']):
    distance, end = independent_stop(case['v'], case['cap'], case['jerk'], case['delay'])
    check(f'P02-distance-{i}', case['distance'], distance)
    check(f'P02-time-{i}', case['time'], end)
check('P01-friction', n['friction_cap'], .65*9.81, 1e-12)
check('I01-crossing-vector', n['relative_crossing'], math.sqrt(104), 1e-12)
check('G03-corner-tangent', n['corner_tangent']['conflict'], True)
check('G03-corner-clearance', n['corner_tangent']['clearance'], 0, 1e-12)
check('G03-corner-separated', n['corner_separated']['conflict'], False)
check('G03-euclidean-not-expanded-box', n['corner_separated']['clearance'], math.sqrt(.4**2+.4**2)-.5, 1e-12)
check('G04-full-body-occupancy-enter', n['full_body']['longitudinal'][0]['start'], (3-.3)/10, 1e-12)
check('G04-full-body-occupancy-exit', n['full_body']['longitudinal'][0]['end'], (3+.3+5)/10, 1e-12)
check('G03-rear-body-conflict', n['full_body']['conflict'], True)
check('G03-missing-clock', n['missing_clock']['conflict'], None)
check('G04-PET-disjoint', n['pet_disjoint']['seconds'], 1, 1e-12)
check('G04-PET-overlap', n['pet_overlap']['seconds'], None)
check('P04-margin-boundary', n['margin_boundary'], 0, 1e-12)
check('P03-inverse-boundary', n['inverse_boundary'], 8, 1e-10)
check('P03-infeasible-below-boundary', n['inverse_below_boundary'], 'NO_FEASIBLE_CAP_IN_DECLARED_DOMAIN')
check('G02-nonclosing-not-safe', n['ttc_nonclosing'], None)
assert all(x['passed'] for x in checks), [x for x in checks if not x['passed']]
(EV/'independent-math-checks.json').write_text(json.dumps(dict(scope='EXACT_MODEL_FIXTURES_NOT_MEASUREMENT_UNCERTAINTY', checks=checks, passed=len(checks), failed=0), indent=2), encoding='utf-8')

counts = Counter()
rows = []
formula_ids = Counter()
unresolved_refs = []
decomposition_diffs = []
oracle = {}
for line in Path('docs/failure-analysis-v3/GOLDEN18_EXPECTED_BEHAVIOR.md').read_text(encoding='utf-8').split('Expected aggregates:')[0].splitlines():
    if line.startswith('| FA-'):
        fields = [x.strip() for x in line.split('|')[1:-1]]
        oracle[fields[0]] = dict(ends=fields[1].split('/'), contacts=fields[2].split('/'), outcomes=fields[3].split('/'), on_times=fields[4].split(';'), off_times=fields[5])
assert len(oracle) == 18
ineffective = {'FA-G1-001-R1', 'FA-G2-027-R1', 'FA-G5-125-R1', 'FA-G5-125-R2', 'FA-G6-168-R2'}
ineffective.update(f'{case}-R{i}' for case in ('FA-G2-026', 'FA-G2-028', 'FA-G2-029') for i in (1, 2, 3))


def walk(x, registry, run):
    if isinstance(x, dict):
        if 'artifact_id' in x and 'locator' in x and x['artifact_id'] not in registry:
            unresolved_refs.append((run, x))
        if x.get('formula_id'):
            formula_ids[x['formula_id']] += 1
        for child in x.values():
            walk(child, registry, run)
    elif isinstance(x, list):
        for child in x:
            walk(child, registry, run)


with ZipFile('D:/Downloads/golden18_raw_artifacts.zip') as z:
    archive_hash = hashlib.sha256(Path('D:/Downloads/golden18_raw_artifacts.zip').read_bytes()).hexdigest()
    assert archive_hash == '22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339'
    manifest = list(csv.DictReader(io.StringIO(z.read('manifest.csv').decode('utf-8-sig'))))
    assert len(manifest) == len({x['path_in_zip'] for x in manifest}) == 978
    for member in manifest:
        data = z.read(member['path_in_zip'])
        assert len(data) == int(member['size_bytes'])
        assert hashlib.sha256(data).hexdigest() == member['sha256']
    for path in sorted(x for x in z.namelist() if x.endswith('/result.json') and x.startswith(('runs/', 'runs_aeboff/'))):
        raw = json.loads(z.read(path))
        case, rep = path.split('/')[1:3]
        key = f'{case}-R{rep[3:].split("_")[0]}'
        report = json.loads((EV/'diagnostics'/f'{key}.json').read_text())
        r = report['report']
        events = json.loads(z.read(path.rsplit('/', 1)[0]+'/sensors/collisions.json'))
        canonical = raw['outcome']['metrics']
        evaluation = raw['evaluation']['aeb_result']
        for metric in ('rms_jerk_mps3', 'impact_speed_mps', 'stopping_distance_m'):
            assert value(r['objectives'][metric]['canonical_value']) == canonical.get(metric), (key, metric)
            assert canonical.get(metric) == evaluation.get(metric), (key, metric, 'M/E')
            counts[f'{metric}:null' if canonical.get(metric) is None else f'{metric}:present'] += 1
        mode = value(report['input']['mode'])
        outcome = value(r['physical_outcome']) or 'UNKNOWN'
        counts['source_empty'] += raw.get('source') == {}
        case_key = case.replace('-OFF', '')
        slot = 3 if mode == 'OFF' else int(rep[3:].split('_')[0])-1
        expected = oracle[case_key]
        assert outcome == {'C':'COLLISION', 'U':'UNKNOWN'}[expected['outcomes'][slot]], key
        assert len(events) == int(expected['contacts'][slot]), key
        assert raw['outcome']['end_reason'] == {'X':'COLLISION', 'S':'EGO_STOPPED', 'T':'TARGET_CLEARED'}[expected['ends'][slot]], key
        times = expected['off_times'] if mode == 'OFF' else expected['on_times'][slot]
        expected_times = [None if x.strip() == '∅' else float(x.strip()) for x in times.split('/')]
        for field, expected_time in zip(('first_detection_t', 'aeb_decision_t', 'brake_onset_t'), expected_times):
            assert canonical.get(field) == expected_time, (key, field)
        actual_types = {c['type'] for c in r['failure_candidates']}
        expected_types = set() if mode == 'OFF' else {'NO_BRAKING'} if case_key in ('FA-G1-007', 'FA-G1-012') else {'FALSE_BRAKING'} if case_key in ('FA-G3-061', 'FA-G3-064') else {'INEFFECTIVE_BRAKING'} if key in ineffective else set()
        assert actual_types == expected_types, (key, actual_types, expected_types)
        counts['per_run_oracle_match'] += 1
        counts['runs'] += 1
        counts[mode] += 1
        counts[f'outcome:{outcome}'] += 1
        counts['raw_positive_contact'] += bool(events)
        counts['collision_disagreement'] += bool(canonical['collision']) != bool(events)
        assert value(r['confirmed_root_cause']) is None
        assert value(r['physical_limit']) is None
        assert value(r['physical_feasibility']) is None
        if not events:
            assert value(r['objectives']['impact_speed_mps']['physical_event_impact']) is None
        if mode == 'OFF':
            assert not r['failure_candidates'] and r['functional_assessment']['status'] == 'NOT_APPLICABLE'
        for c in r['failure_candidates']:
            assert c['status'] == 'SUSPECTED'
            counts['candidate:'+c['type']] += 1
        diff = value(r['objectives']['stopping_distance_m']['decomposition']['replay_difference'])
        if diff is not None:
            decomposition_diffs.append((key, diff))
        registry = {a['id'] for a in report['input']['artifacts']}
        walk(report, registry, key)
        rows.append(dict(run_key=key, case=case.replace('-OFF', ''), mode=mode, seed=raw['seed'],
                         outcome=outcome, raw_contact=bool(events), canonical_collision=canonical['collision'],
                         collision_disagreement=bool(canonical['collision']) != bool(events),
                         behavior=value(r['observed_behavior']), candidates='|'.join(c['type'] for c in r['failure_candidates']),
                         jerk=canonical.get('rms_jerk_mps3'), impact=canonical.get('impact_speed_mps'), stopping=canonical.get('stopping_distance_m'),
                         physical_impact=value(r['objectives']['impact_speed_mps']['physical_event_impact']),
                         nominal_clearance=value(r['geometry_results'][0]['minimum_clearance']),
                         nominal_conflict=value(r['geometry_results'][0]['conflict']),
                         model_stop=value(r['feasibility_results'][0]['stopping_distance']), stopping_replay_difference=diff,
                         source_result_sha256=hashlib.sha256(z.read(path)).hexdigest(), report_digest=report['content_digest']))

assert counts['runs'] == 72 and counts['ON'] == 54 and counts['OFF'] == 18
assert counts['outcome:COLLISION'] == 31 and counts['outcome:UNKNOWN'] == 41
assert counts['collision_disagreement'] == 12
assert not unresolved_refs, unresolved_refs
assert all(abs(v) < 1e-9 for _, v in decomposition_diffs)
with (EV/'golden72-review.csv').open('w', newline='', encoding='utf-8') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
handoff = json.loads((EV/'GOLDEN18-audited-handoff.json').read_text())
by_key = {m['run_key']: m for m in handoff['members']}
assert set(by_key) == {r['run_key'] for r in rows}
for row in rows:
    m = by_key[row['run_key']]
    assert value(m['diagnostic_report_ref']) == row['report_digest']
    assert value(m['artifact_digest']) == row['source_result_sha256']
    assert value(m['seed']) == row['seed']
    assert m['partition'] == 'DIAGNOSTIC_ONLY'
    assert value(m['run_id']) is None and value(m['variant_id']) is None
summary = dict(scope='ACTUAL_GOLDEN18_OFFLINE_ONLY_NOT_POST_FIT_OPERATIONAL_ACCEPTANCE', counts=counts,
               archive_sha256=archive_hash, manifest_byte_hashes_and_sizes_verified=len(manifest),
               case_clusters=len({r['case'] for r in rows}), stopping_decompositions_replayed=len(decomposition_diffs),
               maximum_stopping_replay_difference=max(abs(v) for _, v in decomposition_diffs),
               unresolved_artifact_references=len(unresolved_refs), formula_ids_observed=formula_ids,
               all_canonical_values_preserved=True, all_handoff_run_report_hashes_bound=True,
               baseline_identity=handoff['baseline']['identity_status'], baseline_scores=handoff['baseline_objectives']['availability'],
               handoff_eligibility=handoff['eligibility_manifest']['counts'], suspected_hints=len(handoff['parameter_hints']))
(EV/'golden72-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
print('Independent mathematical checks:', len(checks), 'PASS')
