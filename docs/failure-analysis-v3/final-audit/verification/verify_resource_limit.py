"""Bounded hostile archive probe in a separate 32 MiB JVM. NOT CARLA data."""
import json
import subprocess
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

folder = Path('docs/failure-analysis-v3/final-audit/evidence')
archive = folder/'SYNTHETIC-oversized-input.zip'
with ZipFile(archive, 'x', compression=ZIP_DEFLATED) as z:
    z.writestr('runs/AUDIT_OVERSIZED/rep1_a1/result.json', '{}'+(' '*64*1024*1024))
command = ['java', '-Xmx32m', '-cp', 'target/classes',
           'com.vsos.core.failureanalysis.OfflineFailureAnalysis', str(archive), str(folder/'oversized-output')]
completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
text = completed.stdout.decode('utf-8', errors='replace')
(folder/'resource-limit-probe.log').write_text(text, encoding='utf-8')
result = dict(scope='SYNTHETIC_RESOURCE_ATTACK_PROBE_NOT_SIMULATION_DATA',
              command=command, compressed_archive_bytes=archive.stat().st_size,
              uncompressed_member_bytes=2+64*1024*1024, heap_limit='32 MiB',
              returncode=completed.returncode, out_of_memory='OutOfMemoryError' in text,
              no_production_source_modified=True)
assert result['out_of_memory'], result
(folder/'resource-limit-probe.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
