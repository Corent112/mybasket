#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path

CLASS_NAMES = ["attacker", "ball_carrier", "defender", "ball", "cone"]
CLASS_TO_ID = {name: i + 1 for i, name in enumerate(CLASS_NAMES)}
ALIASES = {
    "attacker": "attacker", "offense": "attacker", "offender": "attacker",
    "ball_carrier": "ball_carrier", "attacker_with_ball": "ball_carrier", "carrier": "ball_carrier",
    "defender": "defender", "defense": "defender",
    "ball": "ball", "basketball": "ball", "cone": "cone", "plot": "cone",
}
GROUP_SUFFIX_RE = re.compile(r"(?i)(?:[-_.](?:crop|cut|tile|fragment|frag|row|half|court|page|p)[-_.]?\d+)+$")


def parse_source(spec: str):
    parts = spec.split(":")
    if len(parts) < 2:
        raise SystemExit(f"--source invalide: {spec}")
    kind = parts[2] if len(parts) >= 3 else "synthetic"
    if kind not in {"synthetic", "real"}:
        raise SystemExit("kind doit être synthetic|real")
    return Path(parts[0]), Path(parts[1]), kind


def fallback_group_name(file_name: str) -> str:
    stem = Path(file_name).stem
    return GROUP_SUFFIX_RE.sub("", stem) or stem


def image_group(im: dict, source_index: int, kind: str) -> str:
    for key in ("source_group", "document_id", "source_document", "source_id", "parent_id"):
        value = im.get(key)
        if value not in (None, ""):
            return f"s{source_index:02d}:{kind}:{value}"
    file_name = str(im["file_name"])
    if kind == "real":
        return f"s{source_index:02d}:real:{fallback_group_name(file_name)}"
    return f"s{source_index:02d}:synthetic:{file_name}"


def assign_groups(groups: dict[str, list[int]], valid_ratio: float, test_ratio: float, rng: random.Random):
    items = list(groups.items())
    rng.shuffle(items)
    items.sort(key=lambda kv: len(kv[1]), reverse=True)
    total = sum(len(ids) for _, ids in items)
    targets = {
        "test": total * test_ratio,
        "valid": total * valid_ratio,
        "train": total * max(0.0, 1.0 - valid_ratio - test_ratio),
    }
    counts = {k: 0 for k in targets}
    result = {k: [] for k in targets}
    for group_name, ids in items:
        candidates = []
        for split in ("test", "valid", "train"):
            target = targets[split]
            score = float("-inf") if target <= 0 else (target - counts[split]) / target
            candidates.append((score, split))
        _, chosen = max(candidates)
        result[chosen].append((group_name, ids))
        counts[chosen] += len(ids)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", action="append", required=True, help="annotations.json:images_dir[:synthetic|real]")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20260913)
    ap.add_argument("--valid-ratio", type=float, default=0.10)
    ap.add_argument("--test-ratio", type=float, default=0.10)
    ap.add_argument("--holdout", nargs="*", default=[], help="fichiers réels forcés en test; tout leur groupe est forcé en test")
    args = ap.parse_args()

    if args.valid_ratio < 0 or args.test_ratio < 0 or args.valid_ratio + args.test_ratio >= 1:
        raise SystemExit("valid-ratio et test-ratio doivent être >= 0 et leur somme < 1")

    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    for split_name in ("train", "valid", "test"):
        (out / split_name).mkdir(parents=True, exist_ok=True)

    images, annotations, sources = [], [], {}
    next_image_id = next_ann_id = 1
    for source_index, spec in enumerate(args.source):
        ann_path, image_dir, kind = parse_source(spec)
        data = json.loads(ann_path.read_text(encoding="utf-8"))
        catmap = {int(c["id"]): ALIASES.get(str(c["name"]).strip().lower()) for c in data.get("categories", [])}
        by_image = defaultdict(list)
        for ann in data.get("annotations", []):
            by_image[int(ann["image_id"])].append(ann)
        for im in data.get("images", []):
            src = image_dir / im["file_name"]
            if not src.exists():
                raise FileNotFoundError(src)
            new_name = f"s{source_index:02d}_{Path(im['file_name']).name}"
            group = image_group(im, source_index, kind)
            images.append({
                "id": next_image_id, "file_name": new_name, "width": int(im["width"]), "height": int(im["height"]),
                "source_kind": kind, "source_file": im["file_name"], "source_group": group,
            })
            sources[next_image_id] = (src, kind, im["file_name"], group)
            for ann in by_image.get(int(im["id"]), []):
                cname = catmap.get(int(ann["category_id"]))
                if cname not in CLASS_TO_ID:
                    continue
                x, y, w, h = map(float, ann["bbox"])
                if w <= 0 or h <= 0:
                    continue
                new_ann = {
                    "id": next_ann_id, "image_id": next_image_id, "category_id": CLASS_TO_ID[cname],
                    "bbox": [x, y, w, h], "area": w * h, "iscrowd": int(ann.get("iscrowd", 0)),
                }
                for key in ("court_u", "court_v", "court_xy", "court_center"):
                    if key in ann:
                        new_ann[key] = ann[key]
                annotations.append(new_ann)
                next_ann_id += 1
            next_image_id += 1

    holdout_names = set(args.holdout)
    forced_test_groups = {
        im["source_group"] for im in images
        if im["source_kind"] == "real" and im["source_file"] in holdout_names
    }
    grouped_by_kind = {"synthetic": defaultdict(list), "real": defaultdict(list)}
    for im in images:
        grouped_by_kind[im["source_kind"]][im["source_group"]].append(im["id"])

    rng = random.Random(args.seed)
    split_ids = {"train": set(), "valid": set(), "test": set()}
    split_groups = {"train": set(), "valid": set(), "test": set()}
    for kind in ("synthetic", "real"):
        groups = dict(grouped_by_kind[kind])
        if kind == "real":
            for group_name in list(groups):
                if group_name in forced_test_groups:
                    split_ids["test"].update(groups.pop(group_name))
                    split_groups["test"].add(group_name)
        assigned = assign_groups(groups, args.valid_ratio, args.test_ratio, rng)
        for split_name, entries in assigned.items():
            for group_name, ids in entries:
                split_ids[split_name].update(ids)
                split_groups[split_name].add(group_name)

    for a, b in (("train", "valid"), ("train", "test"), ("valid", "test")):
        overlap = split_groups[a] & split_groups[b]
        if overlap:
            raise RuntimeError(f"Fuite de groupes entre {a}/{b}: {sorted(overlap)[:10]}")

    by_ann = defaultdict(list)
    for ann in annotations:
        by_ann[ann["image_id"]].append(ann)
    categories = [{"id": i + 1, "name": name, "supercategory": "basketball_symbol"} for i, name in enumerate(CLASS_NAMES)]
    image_by_id = {im["id"]: im for im in images}
    report = {
        "classes": CLASS_NAMES, "seed": args.seed,
        "split_strategy": "group/source; never image-random across a group",
        "forced_test_groups": sorted(forced_test_groups), "splits": {},
    }

    for split_name, ids in split_ids.items():
        new_images, new_annotations, idmap = [], [], {}
        ni = na = 1
        for old_id in sorted(ids):
            im = image_by_id[old_id]
            src, kind, original, group = sources[old_id]
            shutil.copy2(src, out / split_name / im["file_name"])
            idmap[old_id] = ni
            new_images.append({
                "id": ni, "file_name": im["file_name"], "width": im["width"], "height": im["height"],
                "source_kind": kind, "source_file": original, "source_group": group,
            })
            ni += 1
        for old_id in sorted(ids):
            for ann in by_ann.get(old_id, []):
                copied = dict(ann)
                copied["id"] = na
                copied["image_id"] = idmap[old_id]
                new_annotations.append(copied)
                na += 1
        coco = {
            "info": {"description": f"MyBasket RF-DETR POC {split_name}", "version": "2"},
            "images": new_images, "annotations": new_annotations, "categories": categories,
        }
        (out / split_name / "_annotations.coco.json").write_text(json.dumps(coco, ensure_ascii=False, indent=2), encoding="utf-8")
        counts = Counter(CLASS_NAMES[a["category_id"] - 1] for a in new_annotations)
        report["splits"][split_name] = {
            "images": len(new_images), "groups": len(split_groups[split_name]), "annotations": len(new_annotations),
            "by_class": dict(counts), "by_source": dict(Counter(im["source_kind"] for im in new_images)),
            "source_groups": sorted(split_groups[split_name]),
        }

    (out / "split-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
