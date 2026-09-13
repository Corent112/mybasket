#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, random, shutil
from collections import Counter, defaultdict
from pathlib import Path

CLASS_NAMES=["attacker","ball_carrier","defender","ball","cone"]
CLASS_TO_ID={n:i+1 for i,n in enumerate(CLASS_NAMES)}
ALIASES={
 "attacker":"attacker","offense":"attacker","offender":"attacker",
 "ball_carrier":"ball_carrier","attacker_with_ball":"ball_carrier","carrier":"ball_carrier",
 "defender":"defender","defense":"defender",
 "ball":"ball","basketball":"ball","cone":"cone","plot":"cone",
}

def parse_source(spec):
    p=spec.split(":")
    if len(p)<2: raise SystemExit(f"--source invalide: {spec}")
    kind=p[2] if len(p)>=3 else "synthetic"
    if kind not in {"synthetic","real"}: raise SystemExit("kind doit être synthetic|real")
    return Path(p[0]),Path(p[1]),kind

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--source",action="append",required=True,help="annotations.json:images_dir[:synthetic|real]")
    ap.add_argument("--out",required=True)
    ap.add_argument("--seed",type=int,default=20260913)
    ap.add_argument("--valid-ratio",type=float,default=.10)
    ap.add_argument("--test-ratio",type=float,default=.10)
    ap.add_argument("--holdout",nargs="*",default=[],help="noms de fichiers réels forcés en test")
    args=ap.parse_args()

    out=Path(args.out)
    if out.exists(): shutil.rmtree(out)
    for s in ("train","valid","test"): (out/s).mkdir(parents=True,exist_ok=True)

    images=[]; annotations=[]; sources={}; next_i=1; next_a=1
    for src_idx,spec in enumerate(args.source):
        ann_path,img_dir,kind=parse_source(spec)
        data=json.loads(ann_path.read_text(encoding="utf-8"))
        catmap={int(c["id"]):ALIASES.get(str(c["name"]).strip().lower()) for c in data.get("categories",[])}
        byimg=defaultdict(list)
        for a in data.get("annotations",[]): byimg[int(a["image_id"])].append(a)
        for im in data.get("images",[]):
            src=img_dir/im["file_name"]
            if not src.exists(): raise FileNotFoundError(src)
            new_name=f"s{src_idx:02d}_{Path(im['file_name']).name}"
            rec={"id":next_i,"file_name":new_name,"width":int(im["width"]),"height":int(im["height"]),
                 "source_kind":kind,"source_file":im["file_name"]}
            images.append(rec); sources[next_i]=(src,kind,im["file_name"])
            for a in byimg.get(int(im["id"]),[]):
                cname=catmap.get(int(a["category_id"]))
                if cname not in CLASS_TO_ID: continue
                x,y,w,h=map(float,a["bbox"])
                if w<=0 or h<=0: continue
                annotations.append({"id":next_a,"image_id":next_i,"category_id":CLASS_TO_ID[cname],
                                    "bbox":[x,y,w,h],"area":w*h,"iscrowd":int(a.get("iscrowd",0))})
                next_a+=1
            next_i+=1

    rng=random.Random(args.seed)
    hold=set(args.holdout)
    real=[i["id"] for i in images if i["source_kind"]=="real"]
    synth=[i["id"] for i in images if i["source_kind"]=="synthetic"]
    forced={i["id"] for i in images if i["source_kind"]=="real" and i["source_file"] in hold}
    real=[x for x in real if x not in forced]
    rng.shuffle(real); rng.shuffle(synth)

    def split(ids):
        n=len(ids); nt=round(n*args.test_ratio); nv=round(n*args.valid_ratio)
        return ids[nt+nv:],ids[nt:nt+nv],ids[:nt]
    st,sv,se=split(synth); rt,rv,re=split(real)
    splits={"train":set(st+rt),"valid":set(sv+rv),"test":set(se+re)|forced}

    byann=defaultdict(list)
    for a in annotations: byann[a["image_id"]].append(a)
    cats=[{"id":i+1,"name":n,"supercategory":"basketball_symbol"} for i,n in enumerate(CLASS_NAMES)]
    report={"classes":CLASS_NAMES,"splits":{}}
    image_by_id={i["id"]:i for i in images}

    for split_name,ids in splits.items():
        new_images=[]; new_anns=[]; idmap={}; ni=1; na=1
        for old in sorted(ids):
            im=image_by_id[old]; src,kind,orig=sources[old]
            shutil.copy2(src,out/split_name/im["file_name"])
            idmap[old]=ni
            new_images.append({"id":ni,"file_name":im["file_name"],"width":im["width"],"height":im["height"],
                               "source_kind":kind,"source_file":orig})
            ni+=1
        for old in sorted(ids):
            for a in byann.get(old,[]):
                aa=dict(a); aa["id"]=na; aa["image_id"]=idmap[old]; new_anns.append(aa); na+=1
        coco={"info":{"description":f"MyBasket RF-DETR POC {split_name}","version":"1"},
              "images":new_images,"annotations":new_anns,"categories":cats}
        (out/split_name/"_annotations.coco.json").write_text(json.dumps(coco,ensure_ascii=False,indent=2),encoding="utf-8")
        counts=Counter(CLASS_NAMES[a["category_id"]-1] for a in new_anns)
        report["splits"][split_name]={"images":len(new_images),"annotations":len(new_anns),
            "by_class":dict(counts),"by_source":dict(Counter(i["source_kind"] for i in new_images))}
    (out/"split-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
