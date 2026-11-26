import difflib, hashlib, json, re, subprocess
from pathlib import Path
EV=Path('docs/failure-analysis-v3/fixes/batch-04-evidence'); FINAL=EV/'final-confirmation'
FA=Path('src/main/java/com/vsos/core/failureanalysis'); TEST=Path('src/test/java/com/vsos/core/failureanalysis')
changed_names={'RawArtifactAdapter','ArtifactCsv','HandoffSnapshots','BaselineBindingResolver','OfflineMoboHandoff','ConsumerSourceInspection','SearchRangeResolver'}
allowed={str(FA/(n+'.java')).replace('\\','/') for n in changed_names}
new={'ArchiveIndex.java','BoundedInput.java','InputRejectedException.java','InputResourcePolicy.java'}
snapshot=json.loads((EV/'protected-before.json').read_text(encoding='utf-8-sig'));hashes={};changed=set()
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
for name,expected in snapshot.items():
    p=Path(name);assert p.is_file(),name
    actual=sha(p);hashes[name]=dict(before=expected,after=actual,unchanged=actual==expected)
    if actual!=expected:changed.add(p.as_posix())
assert changed==allowed,changed
stats=[]
for label,current,expected_new in [('main',FA,new),('test',TEST,{'Batch04ResourceTest.java'})]:
    before=EV/'before-source'/label
    assert {p.name for p in current.glob('*.java')}-{p.name for p in before.glob('*.java')}==expected_new
    lines=[]
    for p in sorted(current.glob('*.java')):
        old=before/p.name;a=old.read_text(encoding='utf-8').splitlines(True) if old.exists() else [];b=p.read_text(encoding='utf-8').splitlines(True)
        if label=='test' and old.exists():assert old.read_bytes()==p.read_bytes(),p
        if a!=b:
            d=list(difflib.unified_diff(a,b,fromfile='before/'+p.name if old.exists() else '/dev/null',tofile=p.as_posix()));lines.extend(d)
            stats.append(dict(file=p.as_posix(),added=sum(x.startswith('+') and not x.startswith('+++') for x in d),removed=sum(x.startswith('-') and not x.startswith('---') for x in d)))
    (EV/('production-source.diff' if label=='main' else 'new-resource-tests.diff')).write_text(''.join(lines),encoding='utf-8')
(EV/'protected-after.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8');(EV/'diff-stat.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
results={}
for label in ['baseline-focused','resource-first-green','focused-first','focused-final','focused-accepted','full-final']:
    s=(EV/(label+'.log')).read_text(encoding='utf-16')
    matches=[m for m in re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)([^\r\n]*)',s) if ' -- in ' not in m[4]]
    t,f,e,k=map(int,matches[-1][:4]);results[label]=dict(total=t,passed=t-f-e-k,failures=f,errors=e,skipped=k,build='SUCCESS' if 'BUILD SUCCESS' in s else 'FAILURE')
assert results['baseline-focused']==dict(total=793,passed=791,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['focused-accepted']==dict(total=862,passed=860,failures=0,errors=0,skipped=2,build='SUCCESS')
assert results['full-final']==dict(total=1589,passed=1584,failures=2,errors=0,skipped=3,build='FAILURE')
s=(EV/'focused-accepted.log').read_text(encoding='utf-16')
for name,count in [('HighSeverityFindingsRegressionTest',44),('Batch02RegressionTest',79),('Batch03ContextTest',72),('Batch03DossierRegressionTest',8),('Batch04ResourceTest',69)]:
    m=re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+).* -- in com.vsos.core.failureanalysis.'+name,s)
    assert tuple(map(int,m.groups()))==(count,0,0,0),(name,m)
full=(EV/'full-final.log').read_text(encoding='utf-16')
for name in ['executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt','executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor']:assert name in full
(EV/'test-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
oldbase=EV.parent/'batch-03-evidence/final-confirmation';same=0
for p in (FINAL/'diagnostics').glob('*.json'):
    old=json.loads((oldbase/'diagnostics'/p.name).read_text());actual=json.loads(p.read_text())
    assert actual['report']==old['report'],p.name
    assert actual['input']==old['input'],p.name
    assert actual['content_digest']==old['content_digest'],p.name
    same+=1
assert same==72
before=json.loads((oldbase/'GOLDEN18-audited-handoff.json').read_text());after=json.loads((FINAL/'GOLDEN18-audited-handoff.json').read_text())
assert before['content_digest']==after['content_digest']
out=dict(status='PASS',reports_with_identical_input_report_and_content_digest=same,handoff_content_digest_unchanged=True,
    all_math_policy_context_and_dossier_source_unchanged=True,protected_paths=len(hashes),unchanged=len(hashes)-len(changed),changed_existing=sorted(changed),
    new_production=sorted(new),old_tests_unchanged=True,contracts_raw_history_unchanged=True,outside_scope_modifications=0)
(EV/'preservation-summary.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
(EV/'git-status-after.txt').write_text(subprocess.check_output(['git','status','--short'],text=True),encoding='utf-8')
(EV/'git-diff-stat.txt').write_text(subprocess.check_output(['git','diff','--stat'],text=True),encoding='utf-8')
print(json.dumps(out,indent=2));print(json.dumps(results,indent=2))
