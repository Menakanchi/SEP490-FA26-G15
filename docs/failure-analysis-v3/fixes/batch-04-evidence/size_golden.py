import csv, hashlib, io, json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

archive=Path('D:/Downloads/golden18_raw_artifacts.zip')
out=Path('docs/failure-analysis-v3/fixes/batch-04-evidence')
def depth(root):
    stack=[(root,0)]; maximum=0; string=0; nodes=0
    while stack:
        x,d=stack.pop();maximum=max(maximum,d);nodes+=1
        if isinstance(x,dict):stack.extend((v,d+1) for v in x.values());string=max([string]+[len(k) for k in x])
        elif isinstance(x,list):stack.extend((v,d+1) for v in x)
        elif isinstance(x,str):string=max(string,len(x))
    return maximum,string,nodes
sizes=defaultdict(int);rows=defaultdict(int);ratios=[];maximum_depth=0;max_string=0;max_nodes=0;frames=0;max_cols=0;max_line=0
with ZipFile(archive) as z:
    files=[i for i in z.infolist() if not i.is_dir()]
    for i in files:
        ratios.append(i.file_size/max(1,i.compress_size))
        ext=Path(i.filename).suffix;sizes[ext]=max(sizes[ext],i.file_size)
        if ext not in ('.csv','.jsonl','.json'):continue
        data=z.read(i).decode('utf-8-sig');max_line=max(max_line,max(map(len,data.splitlines()),default=0))
        if ext=='.csv':
            parsed=csv.reader(io.StringIO(data));header=next(parsed,[]);max_cols=max(max_cols,len(header));count=sum(1 for _ in parsed);rows[ext]=max(rows[ext],count)
        else:
            objects=[json.loads(s) for s in data.splitlines() if s.strip()] if ext=='.jsonl' else [json.loads(data)]
            if ext=='.jsonl':rows[ext]=max(rows[ext],len(objects))
            for obj in objects:
                d,s,n=depth(obj);maximum_depth=max(maximum_depth,d);max_string=max(max_string,s);max_nodes=max(max_nodes,n)
                if isinstance(obj,dict):frames=max(frames,len(obj.get('outcome',{}).get('frames',[])))
    ratios.sort()
    result=dict(archive_bytes=archive.stat().st_size,total_uncompressed_bytes=sum(i.file_size for i in files),maximum_member=max(i.file_size for i in files),
        artifacts=len(files),zip_entries=len(z.infolist()),runs=sum(i.filename.endswith('/result.json') for i in files),maximum_size_by_extension=sizes,
        maximum_rows=rows,maximum_core_frames=frames,maximum_json_depth=maximum_depth,maximum_json_string_chars=max_string,maximum_json_nodes=max_nodes,
        maximum_csv_columns=max_cols,maximum_physical_line_chars=max_line,compression_ratio=dict(minimum=ratios[0],median=ratios[len(ratios)//2],p95=ratios[int(.95*(len(ratios)-1))],maximum=ratios[-1]),
        scope='ACTUAL_GOLDEN18_SIZING_NOT_PRODUCTION_MAXIMUM')
(out/'golden-sizing.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
