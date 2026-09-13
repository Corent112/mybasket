#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval
from rfdetr import RFDETRNano


def iou_xyxy(a, b):
    x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
    x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def coco_to_xyxy(bbox):
    x, y, w, h = map(float, bbox)
    return [x, y, x + w, y + h]


def center_xyxy(box):
    return ((box[0] + box[2]) * 0.5, (box[1] + box[3]) * 0.5)


def uv_from_center(center, image_rec):
    # The POC detector is intended to receive a rectified court crop. If a precise
    # court_bbox is stored in COCO, use it; otherwise the complete test image is
    # treated as the rectified court frame.
    if "court_bbox" in image_rec:
        x, y, w, h = map(float, image_rec["court_bbox"])
    else:
        x, y, w, h = 0.0, 0.0, float(image_rec["width"]), float(image_rec["height"])
    if w <= 0 or h <= 0:
        return None
    return ((center[0] - x) / w, (center[1] - y) / h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help="dossier contenant test/_annotations.coco.json")
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--threshold", type=float, default=0.30)
    ap.add_argument("--match-iou", type=float, default=0.50)
    ap.add_argument("--out", default="evaluation-report.json")
    args = ap.parse_args()

    dataset = Path(args.dataset)
    test_dir = dataset / "test"
    ann_path = test_dir / "_annotations.coco.json"
    data = json.loads(ann_path.read_text(encoding="utf-8"))
    images = {int(im["id"]): im for im in data["images"]}
    categories = {int(c["id"]): c["name"] for c in data["categories"]}

    gt_by_image = defaultdict(list)
    for ann in data["annotations"]:
        gt_by_image[int(ann["image_id"])].append({
            "category_id": int(ann["category_id"]),
            "box": coco_to_xyxy(ann["bbox"]),
        })

    model = RFDETRNano(pretrain_weights=args.checkpoint)
    coco_predictions = []
    pred_by_image = defaultdict(list)

    for image_id, rec in images.items():
        image = Image.open(test_dir / rec["file_name"]).convert("RGB")
        det = model.predict(image, threshold=args.threshold)
        for box, score, class_id in zip(det.xyxy, det.confidence, det.class_id):
            x1, y1, x2, y2 = map(float, box)
            category_id = int(class_id) + 1
            if category_id not in categories:
                continue
            pred = {
                "category_id": category_id,
                "box": [x1, y1, x2, y2],
                "score": float(score),
            }
            pred_by_image[image_id].append(pred)
            coco_predictions.append({
                "image_id": image_id,
                "category_id": category_id,
                "bbox": [x1, y1, max(0.0, x2 - x1), max(0.0, y2 - y1)],
                "score": float(score),
            })

    if not coco_predictions:
        raise RuntimeError("Aucune prédiction au seuil demandé; impossible de calculer COCOeval")

    coco_gt = COCO(str(ann_path))
    coco_dt = coco_gt.loadRes(coco_predictions)
    evaluator = COCOeval(coco_gt, coco_dt, "bbox")
    evaluator.evaluate(); evaluator.accumulate(); evaluator.summarize()

    # COCO precision tensor: [IoU, recall, category, area, maxDets]
    precision = evaluator.eval["precision"]
    per_class_ap50 = {}
    iou_index = int(np.argmin(np.abs(np.array(evaluator.params.iouThrs) - 0.50)))
    for class_index, category_id in enumerate(evaluator.params.catIds):
        values = precision[iou_index, :, class_index, 0, -1]
        values = values[values > -1]
        per_class_ap50[categories[int(category_id)]] = float(values.mean()) if values.size else None

    stats = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "uv_errors": []})
    false_positives = []
    false_negatives = []

    for image_id, rec in images.items():
        gt = gt_by_image.get(image_id, [])
        preds = sorted(pred_by_image.get(image_id, []), key=lambda p: p["score"], reverse=True)
        used_gt = set()

        for pred in preds:
            best = None
            best_iou = -1.0
            for gi, truth in enumerate(gt):
                if gi in used_gt or truth["category_id"] != pred["category_id"]:
                    continue
                ov = iou_xyxy(pred["box"], truth["box"])
                if ov > best_iou:
                    best_iou = ov; best = gi

            name = categories[pred["category_id"]]
            if best is not None and best_iou >= args.match_iou:
                used_gt.add(best)
                stats[name]["tp"] += 1
                pred_uv = uv_from_center(center_xyxy(pred["box"]), rec)
                gt_uv = uv_from_center(center_xyxy(gt[best]["box"]), rec)
                if pred_uv is not None and gt_uv is not None:
                    stats[name]["uv_errors"].append(math.hypot(pred_uv[0] - gt_uv[0], pred_uv[1] - gt_uv[1]))
            else:
                stats[name]["fp"] += 1
                false_positives.append({"image": rec["file_name"], "class": name, "score": pred["score"], "box": pred["box"]})

        for gi, truth in enumerate(gt):
            if gi in used_gt:
                continue
            name = categories[truth["category_id"]]
            stats[name]["fn"] += 1
            false_negatives.append({"image": rec["file_name"], "class": name, "box": truth["box"]})

    per_class = {}
    totals = {"tp": 0, "fp": 0, "fn": 0}
    all_uv_errors = []
    for category_id, name in categories.items():
        s = stats[name]
        tp, fp, fn = s["tp"], s["fp"], s["fn"]
        totals["tp"] += tp; totals["fp"] += fp; totals["fn"] += fn
        all_uv_errors.extend(s["uv_errors"])
        per_class[name] = {
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "ap50": per_class_ap50.get(name),
            "tp": tp, "fp": fp, "fn": fn,
            "mean_position_error_uv": float(np.mean(s["uv_errors"])) if s["uv_errors"] else None,
            "p95_position_error_uv": float(np.percentile(s["uv_errors"], 95)) if s["uv_errors"] else None,
        }

    tp, fp, fn = totals["tp"], totals["fp"], totals["fn"]
    report = {
        "checkpoint": args.checkpoint,
        "test_images": len(images),
        "threshold": args.threshold,
        "match_iou": args.match_iou,
        "metrics": {
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "map50": float(evaluator.stats[1]),
            "map50_95": float(evaluator.stats[0]),
            "mean_position_error_uv": float(np.mean(all_uv_errors)) if all_uv_errors else None,
            "p95_position_error_uv": float(np.percentile(all_uv_errors, 95)) if all_uv_errors else None,
        },
        "position_basis": "court_bbox when present, otherwise full rectified test image",
        "per_class": per_class,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
    }
    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
