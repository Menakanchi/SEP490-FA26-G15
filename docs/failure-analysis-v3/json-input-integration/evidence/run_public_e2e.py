"""Real supplied exports through public Java CLIs, not a test input bridge.
Run from repository root after Maven has completed. Output paths must be new.
"""
import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
EV = Path('docs/failure-analysis-v3/json-input-integration/evidence')
FINAL = EV / (sys.argv[1] if len(sys.argv)>1 else 'accepted-final')
FINAL.mkdir(exist_ok=False)
commands = []


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def execute(args, log):
    process = subprocess.run([str(x) for x in args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    log.write_text(process.stdout + process.stderr, encoding='utf-8')
    commands.append(dict(argv=[str(x) for x in args], exit_code=process.returncode, log=str(log)))
    assert process.returncode == 0, (args, process.stderr[-3000:])


def cli(class_name, args, log):
    execute(['java', '-Xmx2g', '-cp', 'target/classes', 'com.vsos.core.failureanalysis.'+class_name, *args], log)


checks = []
rows = []
inputs = [Path('D:/Downloads/result_run2499_full_dataset.json'), Path('D:/Downloads/result_run2499_full_dataset_v2.json')]
inputs += sorted(Path('D:/Downloads/vsos-collections-2026-11-24').glob('vehicsim-variant-*-collection.json'))
assert len(inputs) == 5, inputs
for i, source in enumerate(inputs):
    before = sha(source)
    dest = FINAL / ('input-'+str(i)+'-'+source.stem)
    dest.mkdir()
    raw = json.loads(source.read_text(encoding='utf-8'))
    docs = [x['result'] for x in raw['runs']] if 'runs' in raw else [raw]
    cli('OfflineDiagnosticAnalysis', [source, dest/'diagnostics'], dest/'diagnostic-cli.log')
    cli('OfflineMoboHandoff', [source, dest/'diagnostics', dest/'handoff.json', ROOT], dest/'handoff-cli.log')
    cli('OfflineConsumerCompatibility', [dest/'handoff.json', sha(dest/'handoff.json'), ROOT, dest/'compatibility.json'], dest/'compatibility-cli.log')
    handoff = json.loads((dest/'handoff.json').read_text())
    manifest = json.loads((dest/'diagnostics/_input_manifest.json').read_text())
    assert manifest['status'] == 'COMPLETE'
    assert len(handoff['members']) == len(docs) == manifest['expected_members']
    assert handoff['baseline']['identity_status'] == handoff['baseline_objectives']['availability'] == 'UNKNOWN'
    assert not handoff['eligibility_manifest']['consumer_dispatch_allowed']
    assert handoff['consumer_compatibility']['overall'] == 'NOT_DIRECTLY_CONSUMABLE'
    members = {m['run_key']:m for m in handoff['members']}
    for doc in docs:
        key = str(doc['dataset']['identity']['run_id'])
        report = json.loads((dest/'diagnostics'/f'{key}.json').read_text())
        r = report['report']
        m = members[key]
        for metric in ('rms_jerk_mps3', 'impact_speed_mps', 'stopping_distance_m'):
            assert r['objectives'][metric]['canonical_value']['value'] == doc['outcome']['metrics'][metric]
            assert m['recorded_objectives'][metric]['canonical_value']['value'] == doc['outcome']['metrics'][metric]
            assert r['objectives'][metric]['declared_metadata']['value'] == doc['dataset']['objectives'][metric]
        identity = doc['dataset']['identity']
        assert report['input']['mode']['value'] == identity['aeb_mode']
        assert report['input']['declared_identity']['variant_id']['value'] == str(identity['variant_id'])
        assert m['replicate']['value'] == identity['repetition'] and m['attempt']['value'] == identity['attempt']
        assert r['confirmed_root_cause']['value'] is r['physical_limit']['value'] is None
        if identity['aeb_mode'] == 'OFF':
            assert r['failure_candidates'] == [] and r['functional_assessment']['status'] == 'NOT_APPLICABLE'
        for view in report['input']['artifacts']:
            provenance = view.get('provenance', {})
            if provenance.get('embedded_digest', {}).get('actual'):
                assert provenance['embedded_digest']['status'] == 'MATCH'
            if provenance.get('hash_scope') == 'CONTAINER_BYTES_NOT_ORIGINAL_EXTERNAL_FILE':
                assert view['sha256'] == before and view['integrity'] == 'UNVERIFIED'
        if key == '2499':
            assert [(c['type'], c['status']) for c in r['failure_candidates']] == [('INEFFECTIVE_BRAKING', 'SUSPECTED')]
            assert r['impact_analysis']['recorded_relative_speed']['value'] == 6.084
            decomposition = r['objectives']['stopping_distance_m']['decomposition']
            assert abs(decomposition['trace_component']['value'] - 14.493) < 1e-9
            assert abs(decomposition['extrapolated_component']['value'] - 3.0247529877) < 1e-9
    # Keep per-input rows separate; repeated run2499 exports are not extra independent runs.
    with (dest/'diagnostics/FUNCTIONAL_TEST_SUMMARY.csv').open(encoding='utf-8', newline='') as stream:
        rows.extend(dict(input_file=str(source), **row) for row in csv.DictReader(stream))
    assert sha(source) == before
    checks.append(dict(input=str(source), sha256=before, runs=len(docs), report_directory=str(dest/'diagnostics'),
                       handoff=str(dest/'handoff.json'), compatibility=str(dest/'compatibility.json'), status='PASS'))
with (EV.parent/'FUNCTIONAL_TEST_SUMMARY.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)

# Replay legacy corpus unchanged, in new output paths only.
golden = FINAL/'golden72'
golden.mkdir()
archive = Path('D:/Downloads/golden18_raw_artifacts.zip')
cli('OfflineDiagnosticAnalysis', [archive, golden/'diagnostics'], golden/'diagnostic-cli.log')
cli('OfflineMoboHandoff', [archive, golden/'diagnostics', golden/'GOLDEN18-audited-handoff.json', ROOT], golden/'handoff-cli.log')
cli('OfflineConsumerCompatibility', [golden/'GOLDEN18-audited-handoff.json', sha(golden/'GOLDEN18-audited-handoff.json'), ROOT, golden/'GOLDEN18-audited-compatibility.json'], golden/'compatibility-cli.log')
probe_classes = EV/'probe-classes'
probe_classes.mkdir(exist_ok=True)
execute(['javac','-cp','target/classes;target/test-classes','-d',probe_classes,'docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java'],golden/'probe-compile.log')
execute(['java','-Xmx2g','-cp','target/classes;target/test-classes;'+str(probe_classes),'com.vsos.core.failureanalysis.FinalAuditProbe',archive,golden/'independent-probes-after.json'],golden/'probe.log')

# Reuse the independent audit oracle with only its output directory changed.
old = Path('docs/failure-analysis-v3/fixes/batch-04-evidence/verification')
oracle = (old/'verify_batch04.py').read_text(encoding='utf-8').replace("EV = BASE / 'batch-04-evidence' / 'final-confirmation'", f"EV = Path({str(golden.as_posix())!r})")
oracle_path = EV/'verify_golden_and_physics.py'
oracle_path.write_text(oracle, encoding='utf-8')
execute(['python', oracle_path],golden/'oracle.log')
digests = (old/'VerifyReportDigests.java').read_text(encoding='utf-8').replace('docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation',golden.as_posix())
digest_path = EV/'VerifyReportDigests.java'
digest_path.write_text(digests, encoding='utf-8')
execute(['java','-Xmx2g','-cp','target/classes',digest_path],golden/'digests.log')
preserved = 0
historical = Path('docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation')
for p in (golden/'diagnostics').glob('*.json'):
    current = json.loads(p.read_text()); prior = json.loads((historical/'diagnostics'/p.name).read_text())
    assert all(current[k] == prior[k] for k in ('input','report','content_digest')),p.name
    preserved += 1
assert preserved == 72
assert json.loads((golden/'GOLDEN18-audited-handoff.json').read_text())['content_digest'] == json.loads((historical/'GOLDEN18-audited-handoff.json').read_text())['content_digest']
(EV/'e2e-results.json').write_text(json.dumps(dict(scope='PUBLIC_PRODUCTION_CLIS_REAL_EXPORTS_OFFLINE_NO_CONSUMER_EXECUTION',inputs=checks,
    report_executions=len(rows),distinct_run_ids=len({r['run_key'] for r in rows}),golden_reports_identical=preserved,
    golden_handoff_digest_unchanged=True,commands=commands),indent=2),encoding='utf-8')
print('PASS: actual exports',len(checks),'report executions',len(rows),'distinct run IDs',len({r['run_key'] for r in rows}),'Golden72 preserved',preserved)
