import hashlib,json
from pathlib import Path
base=Path(__file__).resolve().parent
envelope=json.loads((base/'probe-output/TEST_ONLY-mapped-diagnostic.json').read_text())
r=envelope['report'];s=json.loads((base/'probe-output/java-probe-summary.json').read_text())
checks=[]
def check(name,value):checks.append(dict(check=name,status='PASS' if value else 'FAIL'))
check('bounded_java_parse',s['resource_counters']['actual_read_bytes']==265802)
for key,value in [('rms_jerk_mps3',17.68),('impact_speed_mps',6.067),('stopping_distance_m',17.518)]:
    o=r['objectives'][key];check('java_canonical:'+key,o['canonical_value']['value']==value and o['copy_agreement']=='MATCH')
check('contact_observed',r['physical_outcome']['value']=='COLLISION' and r['impact_analysis']['contact_time']['value']==3.92)
check('contact_not_canonical_overwrite',r['impact_analysis']['recorded_relative_speed']['value']==6.084 and r['objectives']['impact_speed_mps']['canonical_value']['value']==6.067)
check('stopping_replay_match',r['objectives']['stopping_distance_m']['decomposition']['replay_difference']['value']==0)
check('stopping_has_extrapolation',r['objectives']['stopping_distance_m']['decomposition']['extrapolated_component']['value']>3)
check('unattributed_pedal',r['aeb_timeline']['first_pedal_sample']['value']==.57 and r['aeb_timeline']['command_onset']['value']==2.6 and r['aeb_timeline']['control_activity']=='CONTROL_ACTIVITY_UNATTRIBUTED')
check('candidate_suspected_only',[(x['type'],x['status']) for x in r['failure_candidates']]==[('INEFFECTIVE_BRAKING','SUSPECTED')])
check('root_not_confirmed',r['confirmed_root_cause']['status']=='UNKNOWN')
check('physical_limit_not_confirmed',r['physical_limit']['status']=='UNKNOWN')
check('no_invalid_or_conflicting_stream_issues',not any(x['status'] in ['INVALID','CONFLICTING'] for x in s['validation_issues']))
check('no_external_integrity_verification_claim',s['all_artifact_integrity']=='UNVERIFIED')
check('original_input_unchanged',hashlib.sha256(Path('D:/Downloads/result_run2499_full_dataset_v2.json').read_bytes()).hexdigest()==s['input_sha256'])
result=dict(scope='TEST_ONLY_MAPPED_JAVA_PROBE',total=len(checks),passed=sum(x['status']=='PASS' for x in checks),failed=sum(x['status']=='FAIL' for x in checks),checks=checks)
(base/'java-assertions.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
assert result['failed']==0
