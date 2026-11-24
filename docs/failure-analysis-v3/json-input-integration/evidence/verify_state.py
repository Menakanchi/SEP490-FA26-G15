"""Diff/preservation and actual Maven log accounting; no source mutations."""
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

EV=Path('docs/failure-analysis-v3/json-input-integration/evidence')
FA=Path('src/main/java/com/vsos/core/failureanalysis')
TEST=Path('src/test/java/com/vsos/core/failureanalysis')
changed_names={'Evidence','EvidenceValidator','EvidenceReport','MetricProvenanceResolver','ObjectiveExplainer',
               'OfflineDiagnosticAnalysis','OfflineFailureAnalysis','OfflineMoboHandoff','MoboHandoffBuilder'}
allowed={str(FA/(name+'.java')).replace('\\','/') for name in changed_names}
new_main={'JsonInputAdapter.java','FailureAnalysisInput.java','JsonDiagnosticSummary.java'}
new_tests={'JsonInputAdapterTest.java','JsonInputIntegrationTest.java'}
before=json.loads((EV/'protected-before.json').read_text(encoding='utf-8-sig'))


def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as stream:
        for data in iter(lambda:stream.read(1048576),b''):h.update(data)
    return h.hexdigest()


hashes={};changed=set()
for name,expected in before.items():
    p=Path(name);assert p.is_file(),name
    actual=sha(p);hashes[name]=dict(before=expected,after=actual,unchanged=actual==expected)
    if actual!=expected:changed.add(p.as_posix())
assert changed==allowed,(changed,allowed)
stats=[]
for label,current,expected_new in [('main',FA,new_main),('test',TEST,new_tests)]:
    old_dir=EV/'before-source'/label
    assert {p.name for p in current.glob('*.java')}-{p.name for p in old_dir.glob('*.java')}==expected_new
    diff=[]
    for p in sorted(current.glob('*.java')):
        old=old_dir/p.name
        if label=='test' and old.exists():assert p.read_bytes()==old.read_bytes(),p
        a=old.read_text(encoding='utf-8').splitlines(True) if old.exists() else []
        b=p.read_text(encoding='utf-8').splitlines(True)
        if a!=b:
            lines=list(difflib.unified_diff(a,b,fromfile='before/'+p.name if old.exists() else '/dev/null',tofile=p.as_posix()))
            diff.extend(lines);stats.append(dict(file=p.as_posix(),added=sum(x.startswith('+') and not x.startswith('+++') for x in lines),removed=sum(x.startswith('-') and not x.startswith('---') for x in lines)))
    (EV/('production-source.diff' if label=='main' else 'new-tests.diff')).write_text(''.join(diff),encoding='utf-8')
(EV/'protected-after.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
(EV/'diff-stat.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
results={}
for label in ['baseline-focused','json-focused-second','focused-final','focused-accepted','focused-release','focused-final-accepted','full-final']:
    p=EV/(label+'.log')
    if not p.exists():continue
    text=p.read_text(encoding='utf-16')
    matches=[m for m in re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)',text) if ' -- in ' not in m[4]]
    assert matches,label
    t,f,e,k=map(int,matches[-1][:4]);results[label]=dict(total=t,passed=t-f-e-k,failures=f,errors=e,skipped=k,build='SUCCESS' if 'BUILD SUCCESS' in text else 'FAILURE')
assert results['baseline-focused']==dict(total=862,passed=860,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['focused-final-accepted']==dict(total=912,passed=910,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['full-final']==dict(total=1639,passed=1634,failures=2,errors=0,skipped=3,build='FAILURE')
focused=(EV/'focused-final-accepted.log').read_text(encoding='utf-16')
for name,count in [('HighSeverityFindingsRegressionTest',44),('Batch02RegressionTest',79),('Batch03ContextTest',72),('Batch03DossierRegressionTest',8),('Batch04ResourceTest',69),('JsonInputAdapterTest',39),('JsonInputIntegrationTest',11)]:
    m=re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+).* -- in com.vsos.core.failureanalysis.'+name,focused)
    assert m and tuple(map(int,m.groups()))==(count,0,0,0),(name,m)
full=(EV/'full-final.log').read_text(encoding='utf-16')
for name in ['executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt','executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor']:assert name in full
(EV/'test-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
summary=dict(status='PASS',protected_paths=len(hashes),unchanged=len(hashes)-len(changed),changed_existing=sorted(changed),new_main=sorted(new_main),new_tests=sorted(new_tests),
             old_tests_unchanged=True,contracts_raw_history_and_producer_consumer_unchanged=True,outside_scope_modifications=0)
(EV/'preservation-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
(EV/'git-status-after.txt').write_text(subprocess.check_output(['git','status','--short'],text=True),encoding='utf-8')
(EV/'git-diff-stat.txt').write_text(subprocess.check_output(['git','diff','--stat'],text=True),encoding='utf-8')
print(json.dumps(summary,indent=2));print(json.dumps(results,indent=2))
