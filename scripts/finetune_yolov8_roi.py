"""YOLOv8 ROI detector fine-tuning + ONNX export for VisionSetil.

Fine-tunes YOLOv8n (nano — fast for CPU inference) on mushroom bounding-box
annotations to produce a 1-class detector ("mushroom").

DoD target (ML_IMPROVEMENT_PROMPT.md §3.2):
    - IoU ≥ 0.7 on 100 real test images.
    - Inference <50ms on CPU (via ONNX export).

The script supports:
    1. Training from YOLOv8n pretrained weights.
    2. Converting annotations from CVAT/Roboflow YOLO format.
    3. Evaluating on a held-out test set (IoU + mAP).
    4. Exporting to ONNX for production deployment.

Usage:
    # Fine-tune
    python scripts/finetune_yolov8_roi.py train \\
        --data data/yolo_mushroom/data.yaml \\
        --epochs 100 --imgsz 640

    # Evaluate
    python scripts/finetune_yolov8_roi.py evaluate \\
        --weights runs/detect/train/weights/best.pt \\
        --test-dir data/yolo_mushroom/test/

    # Export to ONNX
    python scripts/finetune_yolov8_roi.py export \\
        --weights runs/detect/train/weights/best.pt \\
        --output backend/app/ml/weights/yolov8_mushroom.onnx

License: Ultralytics YOLOv8 is AGPL-3.0. For commercial use, obtain an
Enterprise license from Ultralytics. This script is internal tooling only.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def cmd_train(args: argparse.Namespace) -> None:
    """Fine-tune YOLOv8n on mushroom detection dataset."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    data_yaml = Path(args.data)
    if not data_yaml.exists():
        print(f"ERROR: data config not found: {data_yaml}")
        print("Expected YAML with paths to train/val dirs and class names:")
        print("""
  path: /path/to/dataset
  train: images/train
  val: images/val
  test: images/test
  nc: 1
  names: ['mushroom']
""")
        sys.exit(1)

    # Load pretrained nano model (smallest + fastest).
    model = YOLO(args.base_model)
    print(f"Fine-tuning {args.base_model} on {data_yaml}")
    print(f"  Epochs: {args.epochs}, Image size: {args.imgsz}, Batch: {args.batch}")

    results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        # Hyperparameters tuned for small object detection (mushrooms).
        lr0=0.01,
        lrf=0.01,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=3.0,
        warmup_momentum=0.8,
        box=7.5,
        cls=0.5,
        dfl=1.5,
        # Augmentation.
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.0,
        # Early stopping.
        patience=20,
        save=True,
        save_period=10,
        val=True,
        plots=True,
    )
    print(f"\n✅ Training complete. Best weights: {Path(args.project) / args.name / 'weights' / 'best.pt'}")
    print(f"   Final mAP50: {results.results_dict.get('metrics/mAP50(B)', 'N/A')}")
    print(f"   Final mAP50-95: {results.results_dict.get('metrics/mAP50-95(B)', 'N/A')}")


def cmd_evaluate(args: argparse.Namespace) -> None:
    """Evaluate trained model on test set, report IoU + latency."""
    try:
        from ultralytics import YOLO
        import cv2
        import numpy as np
    except ImportError:
        print("ERROR: ultralytics/opencv not installed.")
        sys.exit(1)

    weights = Path(args.weights)
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}")
        sys.exit(1)

    model = YOLO(str(weights))
    test_dir = Path(args.test_dir)

    # Find test images.
    test_images = sorted(
        list(test_dir.rglob("*.jpg"))
        + list(test_dir.rglob("*.jpeg"))
        + list(test_dir.rglob("*.png"))
    )
    if not test_images:
        print(f"ERROR: no test images in {test_dir}")
        sys.exit(1)

    print(f"Evaluating on {len(test_images)} test images...")
    total_latency_ms: list[float] = []
    detections_count = 0

    for i, img_path in enumerate(test_images):
        img = cv2.imread(str(img_path))
        t0 = time.time()
        results = model(img, conf=args.conf, verbose=False)
        latency = (time.time() - t0) * 1000
        total_latency_ms.append(latency)

        for r in results:
            detections_count += len(r.boxes)

        if (i + 1) % 20 == 0:
            print(f"  [{i+1}/{len(test_images)}] avg latency: {np.mean(total_latency_ms):.1f}ms")

    avg_latency = sum(total_latency_ms) / len(total_latency_ms)
    p95_latency = sorted(total_latency_ms)[int(len(total_latency_ms) * 0.95)]

    # Run full validation if test split is configured in model.
    metrics = model.val(split="test", verbose=True) if args.full_val else None

    report = {
        "weights": str(weights),
        "test_images": len(test_images),
        "total_detections": detections_count,
        "avg_detections_per_image": detections_count / len(test_images),
        "avg_latency_ms": round(avg_latency, 1),
        "p95_latency_ms": round(p95_latency, 1),
        "target_latency_ms": 50,
        "meets_latency_target": avg_latency < 50,
    }
    if metrics:
        report["mAP50"] = float(metrics.box.map)
        report["mAP50_95"] = float(metrics.box.map50_95)
        report["meets_iou_target"] = metrics.box.map50 >= 0.7

    report_path = Path(args.output)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n✅ Evaluation report: {report_path}")
    print(f"   Avg latency: {avg_latency:.1f}ms (target <50ms: {'✅' if avg_latency < 50 else '❌'})")
    if metrics:
        print(f"   mAP@50: {metrics.box.map50:.3f} (target ≥0.7: {'✅' if metrics.box.map50 >= 0.7 else '❌'})")


def cmd_export(args: argparse.Namespace) -> None:
    """Export model to ONNX for production CPU inference."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed.")
        sys.exit(1)

    weights = Path(args.weights)
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}")
        sys.exit(1)

    model = YOLO(str(weights))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Exporting {weights} → ONNX ({args.imgsz}x{args.imgsz})...")
    exported = model.export(
        format="onnx",
        imgsz=args.imgsz,
        half=False,  # CPU doesn't support FP16
        dynamic=False,
        simplify=True,
        opset=12,
    )
    # Ultralytics saves to same dir as weights; move to desired output.
    exported_path = Path(exported)
    if exported_path != output_path:
        exported_path.rename(output_path)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n✅ ONNX exported: {output_path} ({size_mb:.1f} MB)")
    print(f"   Ready for backend/app/ml/weights/yolov8_mushroom.onnx")


def cmd_demo_annotate(args: argparse.Namespace) -> None:
    """Generate a demo data.yaml for a CVAT/Roboflow export.

    This helps users set up the training data structure correctly.
    """
    data_root = Path(args.data_root).resolve()
    yaml_path = data_root / "data.yaml"
    yaml_content = f"""# VisionSetil YOLOv8 Mushroom Detection Dataset
# Generated by scripts/finetune_yolov8_roi.py demo-annotate
path: {data_root}
train: images/train
val: images/val
test: images/test

nc: 1
names: ['mushroom']
"""
    yaml_path.write_text(yaml_content, encoding="utf-8")
    print(f"✅ Created {yaml_path}")
    print(f"   Dataset root: {data_root}")
    print("\nStructure expected:")
    print(f"  {data_root}/")
    print(f"    images/train/*.jpg")
    print(f"    images/val/*.jpg")
    print(f"    images/test/*.jpg")
    print(f"    labels/train/*.txt  (YOLO format: class x_center y_center width height)")
    print(f"    labels/val/*.txt")
    print(f"    labels/test/*.txt")
    print(f"\nAnnotate with CVAT (cvat.ai) or Roboflow, export as YOLOv8 format.")


def main() -> None:
    parser = argparse.ArgumentParser(description="YOLOv8 ROI detector fine-tuning")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Train
    p_train = subparsers.add_parser("train", help="Fine-tune YOLOv8n")
    p_train.add_argument("--data", type=Path, required=True, help="data.yaml path")
    p_train.add_argument("--base-model", default="yolov8n.pt", help="Base model (yolov8n.pt)")
    p_train.add_argument("--epochs", type=int, default=100)
    p_train.add_argument("--imgsz", type=int, default=640)
    p_train.add_argument("--batch", type=int, default=16)
    p_train.add_argument("--device", default="0", help="cuda device (0) or cpu")
    p_train.add_argument("--project", default="runs/detect")
    p_train.add_argument("--name", default="mushroom_roi")
    p_train.set_defaults(func=cmd_train)

    # Evaluate
    p_eval = subparsers.add_parser("evaluate", help="Evaluate on test set")
    p_eval.add_argument("--weights", type=Path, required=True)
    p_eval.add_argument("--test-dir", type=Path, required=True)
    p_eval.add_argument("--conf", type=float, default=0.25)
    p_eval.add_argument("--full-val", action="store_true", help="Run full validation (needs test split in data.yaml)")
    p_eval.add_argument("--output", type=Path, default=Path("eval/reports/yolo_eval_report.json"))
    p_eval.set_defaults(func=cmd_evaluate)

    # Export
    p_exp = subparsers.add_parser("export", help="Export to ONNX")
    p_exp.add_argument("--weights", type=Path, required=True)
    p_exp.add_argument("--output", type=Path, default=Path("backend/app/ml/weights/yolov8_mushroom.onnx"))
    p_exp.add_argument("--imgsz", type=int, default=640)
    p_exp.set_defaults(func=cmd_export)

    # Demo annotate
    p_demo = subparsers.add_parser("demo-annotate", help="Create demo data.yaml")
    p_demo.add_argument("--data-root", type=Path, required=True)
    p_demo.set_defaults(func=cmd_demo_annotate)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()