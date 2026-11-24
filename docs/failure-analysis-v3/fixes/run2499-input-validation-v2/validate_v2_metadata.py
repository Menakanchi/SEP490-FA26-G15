"""Independent, read-only v2 metadata replay. No producer implementation is assumed."""
import collections,datetime,hashlib,json,math,re
from pathlib import Path
BASE=Path(__file__).resolve().parent
P=Path('D:/Downloads/result_run2499_full_dataset_v2.json')
OLD=Path('D:/Downloads/result_run2499_full_dataset.json')
data=P.read_bytes();old_data=OLD.read_bytes();r=json.loads(data);old=json.loads(old_data)
d=r['dataset'];ts=d['time_series'];quality=ts['quality'];clock=ts['clock'];p=d['provenance']
checks=[];hash_results=[]
def check(name,ok,detail=None):checks.append(dict(check=name,status='PASS' if ok else 'FAIL',detail=detail))
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False).encode('utf-8')).hexdigest()
def table(t):return [dict(zip(t['columns'],row)) for row in t['rows']]
def mask_indices(intervals,n):
    result=set();last=-1
    for pair in intervals:
        if not isinstance(pair,list) or len(pair)!=2 or any(type(i) is not int for i in pair):raise ValueError('mask format')
        a,b=pair
        if not 0<=a<=b<n or a<=last:raise ValueError('mask boundary/order')
        result.update(range(a,b+1));last=b
    return result
def top_serialized(text,key):
    # These root keys occur before the dataset; raw_decode finds the exact value span.
    m=re.search('"'+re.escape(key)+'"\\s*:',text);start=m.end()
    while text[start].isspace():start+=1
    _,end=json.JSONDecoder().raw_decode(text,start)
    return text[start:end].encode('utf-8')
for key in ['outcome','evaluation']:
    check('preserved_semantic:'+key,r[key]==old[key])
    check('preserved_value_bytes:'+key,top_serialized(data.decode(),key)==top_serialized(old_data.decode(),key))
for key in ['frames','ground_truth']:
    check('raw_table_unchanged:'+key,ts[key]==old['dataset']['time_series'][key])
check('contact_events_unchanged',d['collisions']['events']==old['dataset']['collisions']['events'])
check('sensor_summary_unchanged',d['sensors']==old['dataset']['sensors'])
check('derived_unchanged',d['derived']==old['dataset']['derived'])
payloads={
    'time_series.frames':{k:ts['frames'][k] for k in ['columns','rows']},
    'time_series.ground_truth':{k:ts['ground_truth'][k] for k in ['columns','rows']},
    'collisions.events':d['collisions']['events'],'sensors.summary':d['sensors']['summary']}
for key,value in payloads.items():
    actual=digest(value);expected=p['embedded_payloads'][key]
    check('embedded_payload_digest:'+key,actual==expected)
    hash_results.append(dict(payload=key,algorithm='SHA256_PYTHON_JSON_DUMPS_ENSURE_ASCII_FALSE_DEFAULT_SEPARATORS',actual=actual,declared=expected,match=actual==expected))
check('external_hashes_explicitly_declared',p['files_verification'].startswith('DECLARED:'))
# Tamper detection is a validator negative control, not new simulation/producer data.
tampered=json.loads(json.dumps(payloads['time_series.frames']));tampered['rows'][0][0]+=1
check('negative_control_modified_payload_digest_rejected',digest(tampered)!=p['embedded_payloads']['time_series.frames'])
check('hash_scope_not_identity_proof','verification' not in p['embedded_payloads'])
qspec=quality['spec'];threshold=qspec['max_plausible_accel_mps2'];warmup=qspec['initialization_window_s']
check('quality_threshold_source_supported',threshold==50.0 and warmup==.5)
check('quality_accel_column_spec',qspec['ground_truth_accel_columns']==['ax_ms2','ay_ms2','az_ms2'])
contact=min(e['sim_time_s'] for e in d['collisions']['events'])
check('quality_contact_time',quality['contact_time_s']==contact)
tables={k:table(ts[k]) for k in ['frames','ground_truth']};quality_counts={}
for name,rows in tables.items():
    masks=quality[name]['masks'];sets={}
    for mask,intervals in masks.items():
        try:sets[mask]=mask_indices(intervals,len(rows));valid=True
        except ValueError:valid=False;sets[mask]=set()
        check('mask_bounds_order:'+name+':'+mask,valid)
    init={i for i,row in enumerate(rows) if row['sim_time_s']<warmup}
    post={i for i,row in enumerate(rows) if row['sim_time_s']>=contact}
    cols=['ax_ms2','ay_ms2','az_ms2'] if name=='ground_truth' else ['imu_accel_x_ms2']
    bad={i for i,row in enumerate(rows) if any(type(row.get(k)) in (int,float) and abs(row[k])>threshold for k in cols)}
    check('mask_initialization_replay:'+name,sets['initialization']==init)
    check('mask_post_contact_replay:'+name,sets['post_contact']==post)
    check('mask_implausible_replay:'+name,sets['implausible_acceleration']==bad)
    quality_counts[name]={k:len(v) for k,v in sets.items()}
    for signal,claim in quality[name]['signals'].items():
        check('signal_mask_refs:'+name+':'+signal,all(m in masks for m in claim['masks']))
    if name=='ground_truth':
        check('implausible_rows_count',len(bad)==quality[name]['implausible_acceleration_rows']==d['sensors']['summary']['ground_truth']['implausible_accel_rows'])
check('quality_flagged',d['status']['signal_quality']['state']=='FLAGGED')
check('structure_vs_signal_quality_separate',d['status']['time_series']['state']=='OK' and quality['ground_truth']['signals']['ax_ms2,ay_ms2,az_ms2,a_along_v_ms2']['state']=='FLAGGED')
try:mask_indices([[0,len(tables['frames'])]],len(tables['frames']));bad_mask_rejected=False
except ValueError:bad_mask_rejected=True
check('negative_control_invalid_mask_rejected',bad_mask_rejected)
for name,stream in [('frames','frames_csv'),('ground_truth','ground_truth_csv')]:
    rows=tables[name];meta=clock['streams'][stream];frames={x['frame'] for x in rows};times=sorted({x['sim_time_s'] for x in rows})
    check('clock_stream_counts:'+stream,meta['rows']==len(rows) and meta['distinct_frames']==len(frames))
    check('clock_stream_world_frames:'+stream,meta['world_frame_first']==min(frames) and meta['world_frame_last']==max(frames))
    check('clock_stream_time_range:'+stream,meta['t_first']==min(times) and meta['t_last']==max(times))
    steps=[b-a for a,b in zip(times,times[1:])]
    check('clock_stream_steps:'+stream,abs(meta['step_s']['min']-min(steps))<1e-8 and abs(meta['step_s']['max']-max(steps))<1e-8)
core=r['outcome']['frames'];meta=clock['streams']['core_frames']
check('core_clock_count_range',meta['rows']==len(core) and meta['t_first']==core[0]['t'] and meta['t_last']==core[-1]['t'])
check('core_world_frame_unknown_explicit',meta['world_frame_column'] is None and not any('frame' in x for x in core))
f={x['frame']:x['sim_time_s'] for x in tables['frames']};g={x['frame']:x['sim_time_s'] for x in tables['ground_truth']};common=f.keys()&g.keys();al=clock['alignment']['frames_csv_vs_ground_truth_csv']
check('recorder_binding_observed',al['binding']=='OBSERVED' and al['method']=='world frame id')
check('recorder_alignment_counts',al['common_frames']==len(common) and al['only_in_frames_csv']==len(f.keys()-g.keys()) and al['only_in_ground_truth_csv']==len(g.keys()-f.keys()))
check('recorder_alignment_difference',abs(al['max_abs_time_diff_s']-max(abs(f[k]-g[k]) for k in common))<1e-9)
core_al=clock['alignment']['core_frames_vs_frames_csv'];nearest=max(min(abs(x['t']-t) for t in f.values()) for x in core)
check('core_nearest_time_statistic',abs(core_al['max_abs_time_diff_s']-nearest)<1e-9)
check('core_alignment_not_promoted',core_al['binding']=='DECLARED')
version=d['config']['aeb_version'];identity=d['identity']
check('declared_project_version_binding',version['id']==identity['aeb_version_id'] and version['project_id']==identity['project_id'])
check('aeb_version_claim_not_verified',version['verification']=='DECLARED' and version['matches_run'] is True)
check('baseline_label_version_consistent',version['version_no']==1 and version['label']==d['config']['aeb']['label']=='v1.0')
check('declared_baseline_status_consistent',version['status_at_result_time']=='BASELINE' and version['is_project_baseline_at_result_time'] is True)
check('aeb_capture_timestamp',datetime.datetime.fromisoformat(version['captured_at_utc'].replace('Z','+00:00')).tzinfo is not None)
for key in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']:
    claim=d['objectives'][key]
    check('objective_state:'+key,claim['state']=='OK' and claim['reason'] is None and claim['value'] is not None)
check('all_section_states_recognized',all(s['state'] in ['OK','MISSING','INVALID','CONFLICTING','FLAGGED'] for s in d['status'].values()))
check('v2_file_unchanged',hashlib.sha256(P.read_bytes()).hexdigest()==hashlib.sha256(data).hexdigest())
check('v1_file_unchanged',OLD.read_bytes()==old_data)
out=dict(scope='ONE_REAL_SAMPLE_METADATA_REPLAY_NOT_PRODUCER_BRANCH_COVERAGE',total=len(checks),passed=sum(c['status']=='PASS' for c in checks),failed=sum(c['status']=='FAIL' for c in checks),input_sha256=hashlib.sha256(data).hexdigest(),payload_hashes=hash_results,quality_mask_row_counts=quality_counts,checks=checks,
         not_tested=['Producer OFF/noncollision/no-braking/null/missing/invalid/conflicting branches need real exports or producer tests','Core-to-recorder independent clock binding','External original file byte hashes','Current baseline authority/freshness and calibration domain'])
(BASE/'v2-metadata-validation.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k not in ['checks','payload_hashes','not_tested']}))
print(json.dumps([c for c in checks if c['status']=='FAIL']))
assert out['failed']==0
