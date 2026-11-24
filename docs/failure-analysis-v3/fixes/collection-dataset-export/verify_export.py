import hashlib,json,math
from pathlib import Path
B=Path(__file__).resolve().parent;P=Path('D:/Downloads/mobo_dataset_scenario26.json')
h=json.loads(P.read_text(encoding='utf-8'));c=json.loads((B/'m1d-compatibility.json').read_text(encoding='utf-8'));dto=json.loads((B/'actual-consumer-dto.json').read_text(encoding='utf-8'));v=h['collection_dataset']
checks=[]
def check(name,ok):checks.append(dict(check=name,status='PASS' if ok else 'FAIL'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
check('schema_integrity_verified',c['input_validation']['schema']=='VERIFIED' and c['input_validation']['integrity']=='VERIFIED')
check('no_schema_or_integrity_failure',not any(x['status']=='FAIL' for x in c['findings']))
check('validator_used_current_output_bytes',sha(P)==c['input']['handoff_byte_sha256']==dto['input_sha256_bytes'])
check('compatibility_not_falsely_ready',c['overall']=='NOT_DIRECTLY_CONSUMABLE' and not c['dispatch_allowed'])
check('top_identity',h['scenario_id']==26 and h['project_id']==4 and h['base_aeb_version_id']==33 and h['variant_ids']==[1032,1033,1034])
check('proposed_partitions',h['optimization_run_ids']==[2499,2500] and h['validation_run_ids']==[2498] and h['partition_status']=='PROPOSED_NOT_FROZEN')
check('off_not_operational',h['diagnostic_control_run_ids']==[2510,2511,2512])
original={};source=Path('D:/Downloads/vsos-collections-2026-11-24')
for sc in v['source_collections']:
    variant=sc['collection']['variant_id'];p=source/f'vehicsim-variant-{variant}-collection.json';actual=json.loads(p.read_text(encoding='utf-8'))
    check('all_source_content_preserved:'+str(variant),sc==actual)
    for item in sc['runs']:original[item['run_id']]=item['result']
check('all_six_documents',set(original)=={2498,2499,2500,2510,2511,2512})
members={int(x['run_key']):x for x in h['members']};manifest={x['run_id']:x for x in v['run_manifest']}
check('all_six_manifest_members',set(members)==set(manifest)==set(original))
for rid,raw in original.items():
    m=manifest[rid];member=members[rid];report=v['diagnostic_reports'][str(rid)]['report'];identity=raw['dataset']['identity']
    for key in ['run_id','variant_id','scenario_id']:check('member_declared_identity:'+str(rid)+':'+key,member[key]['value']==str(identity[key]))
    check('replication_preserved:'+str(rid),member['replicate']['value']==identity['repetition'] and member['attempt']['value']==identity['attempt'])
    for key in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']:
        expected=raw['outcome']['metrics'][key]
        check('recorded_objective:'+str(rid)+':'+key,m['recorded_objectives'][key]['canonical_value']['value']==expected==report['objectives'][key]['canonical_value']['value'])
    check('root_unknown:'+str(rid),report['confirmed_root_cause']['status']=='UNKNOWN')
    if identity['aeb_mode']=='OFF':check('off_no_functional_candidate:'+str(rid),report['failure_candidates']==[] and member['partition']=='DIAGNOSTIC_ONLY')
check('only_one_freeze_safe',[(m['run_id'],m['analysis_service_outcome']) for m in manifest.values() if m['aeb_mode']=='ON' and m['analysis_service_outcome']=='SAFE']==[(2498,'SAFE')])
check('run2500_conflict_visible',manifest[2500]['legacy_outcome']=='SAFE' and manifest[2500]['analysis_service_outcome']=='FALSE_BRAKING' and original[2500]['evaluation']['aeb_result']['false_activation'] is True)
selection=v['proposed_selection'];splits=selection['all_variant_disjoint_nonempty_splits']
check('all_six_possible_splits_tested',len(splits)==6 and len({tuple(s['optimization']) for s in splits})==6)
check('no_valid_two_safe_split',all(not s['passes_available_freeze_predicates'] for s in splits))
optvars={original[x]['dataset']['identity']['variant_id'] for x in h['optimization_run_ids']};valvars={original[x]['dataset']['identity']['variant_id'] for x in h['validation_run_ids']}
check('variant_disjoint',not optvars&valvars)
a=selection['optimization_recorded_aggregate']
check('canonical_aggregation_profile',a['version']=='adr040-stored-aggregation/1')
check('canonical_jerk',a['rms_jerk_mps3']['value']==(17.68+21.621)/2)
check('canonical_impact_zero_only_in_aggregate',a['impact_speed_mps']['value']==6.067/2 and original[2500]['outcome']['metrics']['impact_speed_mps'] is None)
check('canonical_stopping',a['stopping_distance_m']['value']==(17.518+16.627)/2)
for key in ['rms_jerk_mps3','impact_speed_mps','stopping_distance_m']:check('aggregate_valid:'+key,a[key]['status']=='VALID' and a[key]['samples']==2)
check('validation_na_preserved',selection['validation_recorded_aggregate']['rms_jerk_mps3']['status']=='NOT_APPLICABLE' and selection['validation_recorded_aggregate']['rms_jerk_mps3']['value'] is None)
check('no_verified_baseline_score',h['baseline_objectives']['availability']=='UNKNOWN' and h['baseline']['identity_status']=='UNKNOWN')
check('no_hints_or_invented_narrowed_ranges',h['parameter_hints']==[] and all(x['suggested_range']['value'] is None for x in h['search_ranges'].values()))
check('sourced_engine_bounds',all(h['search_space'][key]==[rng['engine_domain']['value']['lower'],rng['engine_domain']['value']['upper']] for key,rng in h['search_ranges'].items()))
check('no_faked_seal',not h['handoff_ready'] and h['dataset']['selection_status']=='UNFROZEN' and selection['sealed'] is False)
check('no_dispatch_or_external_actions',v['execution']=={'dispatch_allowed':False,'optimizer_called':False,'database_accessed':False,'new_trials_generated':False})
check('actual_dto_has_no_dataset_input',dto['dataset_id_supported'] is False and dto['frozen_partition_supported'] is False)
check('actual_dto_loses_partitions',{'optimization_run_ids','validation_run_ids','variant_ids'}<=set(dto['critical_dataset_fields_discarded']))
check('actual_dto_known_fields_read',dto['scenario_id_received']==26 and dto['base_aeb_version_id_received']==33 and dto['bean_validation_violations']==0)
legacy=dto['actual_consumer_aggregation_probe']['consumer_helper_values']
check('actual_consumer_aggregation_diverges',legacy['rms_jerk_mps3']==19.651 and legacy['impact_speed_mps']==3.034 and legacy['stopping_distance_m']==17.072 and dto['actual_consumer_aggregation_probe']['exact_canonical_parity'] is False)
for entry in json.loads((B/'input-validation.json').read_text())['source_files']:check('input_unchanged:'+entry['file'],sha(source/entry['file'])==entry['sha256_bytes'])
snapshot=json.loads(Path('docs/failure-analysis-v3/fixes/batch-04-evidence/protected-after.json').read_text());protected=0
for name,entry in snapshot.items():
    if name.startswith(('src/','docs/failure-analysis-v3/')):
        assert sha(Path(name))==entry['after'],name
        protected+=1
check('production_contracts_history_unchanged',protected==1256)
result=dict(output_file=str(P),bytes=P.stat().st_size,sha256_bytes=sha(P),content_digest=h['content_digest'],checks_total=len(checks),passed=sum(x['status']=='PASS' for x in checks),failed=sum(x['status']=='FAIL' for x in checks),protected_paths_unchanged=protected,checks=checks)
(B/'export-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}));print([x for x in checks if x['status']=='FAIL'])
assert result['failed']==0
