import hashlib,json,math
from pathlib import Path
BASE=Path(__file__).resolve().parent
SOURCE=Path('D:/Downloads/vsos-collections-2026-11-24')
checks=[];sources=[];seen=set()
def check(name,ok):checks.append(dict(check=name,status='PASS' if ok else 'FAIL'))
def sha(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False).encode('utf-8')).hexdigest()
def pairs(items):
    out={}
    for k,v in items:
        if k in out:raise ValueError('duplicate key:'+k)
        out[k]=v
    return out
for p in sorted(SOURCE.glob('*.json')):
    data=p.read_bytes();c=json.loads(data,object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(ValueError(x)))
    sources.append(dict(file=p.name,sha256_bytes=hashlib.sha256(data).hexdigest(),size_bytes=len(data)))
    prefix=str(c['collection']['variant_id']);check(prefix+':schema',c['format']=='vehicsim.run-collection/v1')
    check(prefix+':project_scenario',c['collection']['project_id']==4 and c['collection']['scenario_id']==26)
    check(prefix+':not_falsely_sealed',c['collection']['sealed'] is False)
    check(prefix+':manifest_count',len(c['manifest'])==len(c['runs'])==2)
    manifest={x['run_id']:x for x in c['manifest']}
    check(prefix+':unique_manifest_ids',len(manifest)==len(c['manifest']))
    for item in c['runs']:
        r=item['result'];d=r['dataset'];id=d['identity'];m=r['outcome']['metrics'];e=r['evaluation']['aeb_result'];rid=item['run_id'];pref=str(rid)
        check(pref+':unique_run',rid not in seen);seen.add(rid);entry=manifest[rid]
        check(pref+':identity',rid==id['run_id']==r['source']['run_id'] and id['variant_id']==c['collection']['variant_id']==r['source']['scenario_version_id'] and id['scenario_id']==26 and id['project_id']==4)
        check(pref+':manifest_identity',all(entry[k]==id[k] for k in ['aeb_mode','aeb_version_id','carla_vehicle_model_id','seed','repetition','attempt','purpose','simulator']))
        check(pref+':source_seed',r['seed']==id['seed'])
        check(pref+':document_digest',sha(r)==entry['document_sha256'])
        check(pref+':dataset_formats',r['format']=='vehicsim.result/v1' and d['format']=='vehicsim.run-dataset/v1')
        check(pref+':export_capture_explicit',d['config']['aeb_version']['captured_when']=='COLLECTION_EXPORT' and d['config']['aeb_version']['status_at_result_time'] is None and d['config']['aeb_version']['verification']=='DECLARED')
        check(pref+':source_commit_missing_explicit',d['provenance']['git_commit'] is None and d['status']['provenance']['state']=='MISSING')
        for key in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']:
            objective=d['objectives'][key]
            check(pref+':canonical_copies:'+key,objective['value']==m[key]==e[key]==objective['evaluation_value'] and objective['consistent'] is True)
            applicable=m['collision'] if key=='impact_speed_mps' else id['aeb_mode']=='ON' and m['brake_onset_t'] is not None
            check(pref+':objective_state:'+key,objective['state']==('OK' if applicable else 'NOT_APPLICABLE') and (objective['value'] is not None if applicable else objective['value'] is None))
        check(pref+':canonical_version',d['objectives']['metric_version']['aggregation']=='adr040-stored-aggregation/1')
        payloads={'collisions.events':d['collisions']['events'],'sensors.summary':d['sensors']['summary']}
        tables={}
        for name in ['frames','ground_truth']:
            t=d['time_series'][name];rows=t['rows'];cols=t['columns'];tables[name]=[dict(zip(cols,row)) for row in rows]
            check(pref+':table:'+name,len(rows)==t['row_count'] and len(cols)==len(set(cols)) and all(len(row)==len(cols) for row in rows))
            payloads['time_series.'+name]={'columns':cols,'rows':rows}
        for name,value in payloads.items():check(pref+':payload_digest:'+name,sha(value)==d['provenance']['embedded_payloads'][name])
        f={x['frame']:x['sim_time_s'] for x in tables['frames']}
        check(pref+':recorder_clock',all(x['frame'] in f and f[x['frame']]==x['sim_time_s'] for x in tables['ground_truth']))
        check(pref+':collision_flag_count',len(d['collisions']['events'])==d['collisions']['count'] and bool(d['collisions']['events'])==m['collision']==entry['collision'])
        for event in d['collisions']['events']:check(pref+':contact_clock',f[event['frame']]==event['sim_time_s'])
        for name,rows in tables.items():
            masks=d['time_series']['quality'][name]['masks']
            sets={}
            for key,intervals in masks.items():
                check(pref+':mask_bounds:'+name+':'+key,all(0<=a<=b<len(rows) for a,b in intervals))
                sets[key]={i for a,b in intervals for i in range(a,b+1)}
            check(pref+':initialization:'+name,sets['initialization']=={i for i,row in enumerate(rows) if row['sim_time_s']<.5})
            first=min((x['sim_time_s'] for x in d['collisions']['events']),default=None)
            check(pref+':post_contact:'+name,sets['post_contact']=={i for i,row in enumerate(rows) if first is not None and row['sim_time_s']>=first})
    group=c['groups'][0]
    check(prefix+':one_on_one_off',len(group['on'])==len(group['off'])==1 and {entry['aeb_mode'] for entry in c['manifest']}=={'ON','OFF'})
check('six_actual_run_ids',seen=={2498,2499,2500,2510,2511,2512})
result=dict(total=len(checks),passed=sum(x['status']=='PASS' for x in checks),failed=sum(x['status']=='FAIL' for x in checks),source_files=sources,checks=checks)
(BASE/'input-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}));print([x for x in checks if x['status']=='FAIL'])
assert result['failed']==0
