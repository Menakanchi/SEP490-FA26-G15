"""Read-only sample checks; JSON declarations are not external integrity proofs."""
import collections, datetime, hashlib, json, math, re, subprocess
from pathlib import Path

BASE=Path(__file__).resolve().parent
INPUT=Path('D:/Downloads/result_run2499_full_dataset.json')
checks=[]; duplicates=[]
def check(name, passed, detail=None):
    checks.append(dict(check=name,status='PASS' if passed else 'FAIL',detail=detail))
def object_pairs(pairs):
    d={}
    for k,v in pairs:
        if k in d:duplicates.append(k)
        d[k]=v
    return d
data=INPUT.read_bytes(); digest=hashlib.sha256(data).hexdigest()
r=json.loads(data.decode('utf-8-sig'),object_pairs_hook=object_pairs,
             parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
d=r['dataset'];m=r['outcome']['metrics'];e=r['evaluation']['aeb_result'];identity=d['identity'];p=d['provenance'];ts=d['time_series']
check('strict_json_no_duplicate_keys',not duplicates,duplicates)
check('supported_result_format',r['format']=='vehicsim.result/v1')
check('dataset_format',d['format']=='vehicsim.run-dataset/v1')
for k in ['identity','config','objectives','provenance','sensors','collisions','time_series','derived','status']:
    check('dataset_section:'+k,k in d)
for k in ['run_id','scenario_id','scenario_version_id','aeb_version_id','carla_vehicle_model_id','simulator']:
    check('source_identity_agreement:'+k,identity[k]==r['source'][k])
check('variant_identity',identity['variant_id']==identity['scenario_version_id'])
check('seed_identity',identity['seed']==r['seed'])
check('aeb_mode',identity['aeb_mode']==r['outcome']['case'].get('aeb_mode','ON'))
check('positive_repetition_attempt',all(type(identity[k]) is int and identity[k]>0 for k in ['repetition','attempt']))
params={'TTC_THRESHOLD':'ttc_threshold','BRAKE_ACTIVATION_DELAY':'brake_activation_delay','MAX_DECELERATION':'max_deceleration','BRAKE_BUILDUP_RATE':'brake_buildup_rate'}
for upper,lower in params.items():check('actual_parameter:'+upper,d['config']['aeb']['params'][upper]==r['outcome']['params'][lower])
for key in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']:
    v=d['objectives'][key]
    check('canonical_four_way_agreement:'+key,m[key]==e[key]==v['value']==v['evaluation_value'] and v['consistent'] is True,
          dict(value=m[key],evaluation=e[key],embedded=v['value']))
check('aggregation_contract',d['objectives']['metric_version']['aggregation']=='adr040-stored-aggregation/1')
check('producer_versions_agree',r['engine']==p['engine']==d['objectives']['metric_version']['engine'] and r['simulator']==identity['simulator']==p['simulator']==d['objectives']['metric_version']['simulator'])
check('jerk_metadata_agreement',d['objectives']['jerk_filter']==r['outcome']['case']['carla']['jerk_filtered'])
check('all_numbers_finite',True)
def walk(v):
    if isinstance(v,float) and not math.isfinite(v):checks[-1]['status']='FAIL'
    if isinstance(v,dict):
        for x in v.values():walk(x)
    if isinstance(v,list):
        for x in v:walk(x)
walk(r)
tables={}
for name in ['frames','ground_truth']:
    t=ts[name];cols=t['columns'];rows=t['rows']
    check('unique_columns:'+name,len(cols)==len(set(cols)))
    check('row_count:'+name,len(rows)==t['row_count']==p['files'][t['source']]['rows'],len(rows))
    check('row_width:'+name,all(len(x)==len(cols) for x in rows))
    mapped=[dict(zip(cols,x)) for x in rows];tables[name]=mapped
    by_actor=collections.defaultdict(list)
    for row in mapped:by_actor[row.get('actor_id','ego')].append(row)
    check('finite_nonnegative_monotonic_times:'+name,all(all(type(x['sim_time_s']) in (int,float) and x['sim_time_s']>=0 for x in rr) and all(a['sim_time_s']<b['sim_time_s'] for a,b in zip(rr,rr[1:])) for rr in by_actor.values()))
    check('unique_frames_per_actor:'+name,all(len({x['frame'] for x in rr})==len(rr) for rr in by_actor.values()))
    check('recorded_delta_0.01:'+name,all(all(abs(b['sim_time_s']-a['sim_time_s']-.01)<1e-8 for a,b in zip(rr,rr[1:])) for rr in by_actor.values()))
times={x['frame']:x['sim_time_s'] for x in tables['frames']}
check('shared_world_frame_time_agreement',all(x['frame'] in times and abs(times[x['frame']]-x['sim_time_s'])<1e-9 for x in tables['ground_truth']))
events=d['collisions']['events'];summary=d['sensors']['summary']
check('collision_count_consistency',len(events)==d['collisions']['count']==summary['collisions']==e['collision_count'])
check('collision_flags_agree',m['collision']==e['collision']==d['collisions']['flag_in_result']==bool(events))
for i,event in enumerate(events):
    check('contact_frame_time:'+str(i),event['frame'] in times and abs(times[event['frame']]-event['sim_time_s'])<1e-9)
    prior=[x for x in tables['ground_truth'] if x['frame']==event['gt_frame_before']]
    check('precontact_actor_binding:'+str(i),{x['actor_id'] for x in prior}>={event['other_actor_id']} and any(x['role']=='ego' for x in prior))
    ego=next(x for x in prior if x['role']=='ego');other=next(x for x in prior if x['actor_id']==event['other_actor_id'])
    rel=math.sqrt(sum((ego[k]-other[k])**2 for k in ['vx_ms','vy_ms','vz_ms']))
    check('precontact_relative_speed_vector:'+str(i),abs(rel-event['relative_speed_before_ms'])<.002,dict(recomputed=rel,recorded=event['relative_speed_before_ms']))
v=d['derived']['values'];nulls=d['derived']['null_reasons']
check('derived_reference_only',d['derived']['role']=='REFERENCE_ONLY')
check('derived_null_reasons',all(k in nulls and nulls[k] for k,x in v.items() if x is None))
check('stopping_margin_identity',abs(v['d_dist_to_crossing_at_decision_m']-v['d_required_braking_distance_m']-v['d_stopping_margin_model_m'])<.0002)
check('decision_delta_identity',abs(m['aeb_decision_t']-v['d_latest_feasible_decision_t']-v['d_actual_minus_latest_feasible_decision_s'])<1e-8)
check('latency_identity',abs(m['brake_onset_t']-m['aeb_decision_t']-m['braking_latency_s'])<1e-8)
a=v['d_available_decel_mps2'];speed=v['d_v_at_decision_mps'];delay=r['outcome']['params']['brake_activation_delay']+.1;j=min(r['outcome']['params']['brake_buildup_rate'],20);tr=a/j;vs=speed-a*tr/2
dist=speed*delay+speed*tr-j*tr**3/6+vs**2/(2*a)
check('reference_F04_replay_not_V3_authority',abs(dist-v['d_required_braking_distance_m'])<.0002,dict(replayed=dist,stored=v['d_required_braking_distance_m']))
for f,entry in p['files'].items():check('declared_hash_shape:'+f,bool(re.fullmatch('[0-9a-f]{64}',entry['sha256'])) and type(entry['bytes']) is int and entry['bytes']>=0)
check('provenance_timestamp_rfc3339',datetime.datetime.fromisoformat(p['generated_at_utc'].replace('Z','+00:00')).tzinfo is not None)
check('gt_summary_actor_rows',all(len([x for x in tables['ground_truth'] if x['actor_id']==a['actor_id']])==a['rows'] for a in summary['ground_truth']['actors']))
check('no_raw_file_mutation',hashlib.sha256(INPUT.read_bytes()).hexdigest()==digest)
command=['java','-Xmx256m','-cp','target/classes','com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis',str(INPUT),str(BASE/'direct-cli-output')]
proc=subprocess.run(command,capture_output=True,text=True,timeout=30)
(BASE/'direct-cli.log').write_text(proc.stdout+proc.stderr,encoding='utf-8')
check('current_cli_rejects_json_as_unsupported_container',proc.returncode!=0 and not (BASE/'direct-cli-output').exists(),dict(exit_code=proc.returncode,expected='No standalone JSON adapter yet'))
facts=dict(input_bytes=len(data),sha256=digest,identity=identity,canonical={k:m[k] for k in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']},core_frames=len(r['outcome']['frames']),telemetry_rows=len(tables['frames']),gt_rows=len(tables['ground_truth']),contact_count=len(events),contact_relative_speed_mps=events[0]['relative_speed_before_ms'],first_pedal_time_s=next(x['sim_time_s'] for x in tables['frames'] if x['brake'] and x['sim_time_s']>=.5),command_time_s=m['brake_onset_t'],declared_external_hashes_verifiable=False,gt_roles=sorted({x['role'] for x in tables['ground_truth']}))
out=dict(scope='ONE_REAL_INPUT_READ_ONLY_CHECK_NOT_CAMPAIGN',summary=dict(total=len(checks),passed=sum(x['status']=='PASS' for x in checks),failed=sum(x['status']=='FAIL' for x in checks)),facts=facts,checks=checks,direct_cli_command=command)
(BASE/'sample-validation.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(out['summary']));print(json.dumps(facts));print(json.dumps([c for c in checks if c['status']=='FAIL']))
assert out['summary']['failed']==0
