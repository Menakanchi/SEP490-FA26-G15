"""Reuse original FA-010 input/32MiB child command; never modify audit history.
Also measure before/after ingestion in isolated, timed JVMs. Not CARLA data.
"""
import json, subprocess, hashlib
from pathlib import Path

ev=Path('docs/failure-analysis-v3/fixes/batch-04-evidence')
archive=Path('docs/failure-analysis-v3/final-audit/evidence/SYNTHETIC-oversized-input.zip')
command=['java','-Xmx32m','-cp','target/classes','com.vsos.core.failureanalysis.OfflineFailureAnalysis',str(archive),str(ev/'green-oversized-output')]
done=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
text=done.stdout.decode('utf-8',errors='replace');(ev/'resource-green.log').write_text(text,encoding='utf-8')
assert done.returncode!=0 and 'RESOURCE_LIMIT_EXCEEDED' in text and 'OutOfMemoryError' not in text,text
assert not list((ev/'green-oversized-output').glob('*.json'))
result=dict(command=command,returncode=done.returncode,category='RESOURCE_LIMIT_EXCEEDED',out_of_memory=False,
    partial_reports=0,archive_bytes=archive.stat().st_size,archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
    original_input_unmodified=True,heap='32 MiB',scope='SAME_ORIGINAL_AUDIT_SYNTHETIC_ARCHIVE_NOT_SIMULATION_DATA')
(ev/'resource-green.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))

subprocess.run(['javac','-encoding','UTF-8','-cp','target/classes','-d',str(ev/'probe-classes'),str(ev/'IngestionProbe.java')],check=True,timeout=30)
results={}
for label,heap,old in [('before-2g','2g',True),('after-512m','512m',False),('after-2g','2g',False)]:
    cp=('docs/failure-analysis-v3/fixes/batch-04-evidence/before-classes;' if old else '')+'target/classes;docs/failure-analysis-v3/fixes/batch-04-evidence/probe-classes'
    cmd=['java','-Xmx'+heap,'-cp',cp,'IngestionProbe','D:/Downloads/golden18_raw_artifacts.zip']
    r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
    s=r.stdout.decode('utf-8',errors='replace');(ev/(label+'.log')).write_text(s,encoding='utf-8')
    assert 'OutOfMemoryError' not in s,s
    results[label]=dict(command=cmd,returncode=r.returncode,heap=heap)
    if r.returncode==0:
        parsed=json.loads(s);assert parsed['runs']==72;results[label]['measurement']=parsed
    else:
        assert label=='after-512m' and 'RESOURCE_LIMIT_EXCEEDED' in s,s
        results[label]['controlled_capacity_rejection']=True
(ev/'memory-runtime-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
