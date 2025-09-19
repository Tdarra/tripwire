import argparse
import json
import os
import re
import sys
from typing import Tuple, Optional, List

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split


def encode_string_labels(
    labels: pd.Series,
    pos_regex: str = r"(spam|scam|phish|fraud|malicious)",
) -> Tuple[np.ndarray, dict]:
    rx = re.compile(pos_regex, re.IGNORECASE)
    raw = labels.astype(str).str.strip()
    uniques = sorted(raw.unique().tolist())
    y = np.array([1 if rx.search(s) else 0 for s in raw], dtype=np.int32)
    info = {
        "unique_labels": uniques,
        "positive_regex": pos_regex,
        "positive_count": int(y.sum()),
        "negative_count": int((1 - y).sum()),
    }
    return y, info


def build_vectorizer(
    max_features: int = 5000,
    ngram_min: int = 1,
    ngram_max: int = 2,
    min_df: int = 2,
    vocabulary_path: Optional[str] = None,
) -> TfidfVectorizer:
    vocab = None
    if vocabulary_path:
        with pd.io.common.get_handle(vocabulary_path, "r", encoding="utf-8").get_handle() as fh:
            data = json.load(fh)
        if isinstance(data, dict) and "vocabulary" in data and isinstance(data["vocabulary"], dict):
            vocab = data["vocabulary"]
        elif isinstance(data, dict):
            vocab = data
        else:
            raise ValueError("Unsupported vocabulary JSON format.")
        max_features = None  # fixed dimension if vocab provided

    return TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(ngram_min, ngram_max),
        min_df=min_df,
        max_features=max_features,
        vocabulary=vocab,          # may be None or a dict
        dtype=np.float32,
    )


def _list_gcs_csvs(dir_uri: str) -> List[str]:
    """Return list of CSVs under a gs:// directory URI."""
    if not dir_uri.endswith("/"):
        dir_uri = dir_uri + "/"
    from fsspec.core import get_filesystem_class
    fs = get_filesystem_class("gs")()
    files = fs.glob(dir_uri + "**")
    return sorted([f for f in files if f.lower().endswith(".csv")])


def resolve_data_path(data_path: str) -> str:
    """Allow passing a folder URI. If folder, pick spam_converted.csv or first CSV."""
    if data_path.startswith("gs://"):
        last = data_path.rstrip("/").split("/")[-1]
        looks_like_file = "." in last
        if not looks_like_file:
            csvs = _list_gcs_csvs(data_path)
            if not csvs:
                raise FileNotFoundError(f"No CSV files found under {data_path}")
            for cand in csvs:
                if cand.lower().endswith("spam_converted.csv"):
                    print(f"[INFO] Using CSV: {cand} (found under folder)")
                    return cand
            print(f"[INFO] Using first CSV under folder: {csvs[0]}")
            return csvs[0]
    return data_path


def _is_gcs_path(p: str) -> bool:
    return p.startswith("gs://")


def _upload_to_gcs(local_path: str, gcs_dest_dir: str) -> str:
    """Upload local_path to gs://dest_dir/basename(local_path) using gcsfs."""
    from fsspec.core import get_filesystem_class
    fs = get_filesystem_class("gs")()
    base = os.path.basename(local_path)
    if not gcs_dest_dir.endswith("/"):
        gcs_dest_dir += "/"
    dest = gcs_dest_dir + base
    fs.put(local_path, dest)
    print(f"[INFO] Uploaded {local_path} -> {dest}")
    return dest


def main():
    print("[DEBUG] python:", sys.version)
    print("[DEBUG] argv:", " ".join(sys.argv))

    parser = argparse.ArgumentParser()
    parser.add_argument("--data_path", required=False, type=str,
                        help="Path to CSV (gs://bucket/path.csv or local path or gs://bucket/folder/)")
    parser.add_argument("--text_column", default="text", type=str)
    parser.add_argument("--label_column", default="label", type=str)
    parser.add_argument("--pos_regex", default=r"(spam|scam|phish|fraud|malicious)", type=str)
    parser.add_argument("--max_features", default=5000, type=int)
    parser.add_argument("--ngram_min", default=1, type=int)
    parser.add_argument("--ngram_max", default=2, type=int)
    parser.add_argument("--min_df", default=2, type=int)
    parser.add_argument("--vocabulary_path", default=None, type=str,
                        help="Optional gs:// or local path to vocabulary JSON.")
    args = parser.parse_args()

    # NOTE: your bucket is tripwire-ml-projects (not artifacts)
    raw_path = args.data_path or os.environ.get("DATA_PATH")
    if not raw_path:
        raise SystemExit("ERROR: Provide --data_path=gs://tripwire-ml-projects/… or set DATA_PATH.")

    data_path = resolve_data_path(raw_path)

    # Vertex provides AIP_MODEL_DIR (often a gs:// path)
    aip_model_dir = os.environ.get("AIP_MODEL_DIR", "/tmp/model")
    print(f"[INFO] AIP_MODEL_DIR={aip_model_dir}")

    # We'll always save locally first, then upload if AIP_MODEL_DIR is gs://
    local_out_dir = "/tmp/tripwire_model"
    os.makedirs(local_out_dir, exist_ok=True)

    print(f"[INFO] Loading CSV from: {data_path}")
    df = pd.read_csv(data_path)
    if args.text_column not in df.columns or args.label_column not in df.columns:
        raise ValueError(f"CSV must contain '{args.text_column}' and '{args.label_column}'")

    texts = df[args.text_column].astype(str).fillna("")
    y = np.array([
        1 if re.search(args.pos_regex, str(lbl).strip(), flags=re.IGNORECASE) else 0
        for lbl in df[args.label_column]
    ], dtype=np.int32)
    print(f"[INFO] Label counts: pos={int(y.sum())}, neg={int((1-y).sum())}")

    X_train_text, X_test_text, y_train, y_test = train_test_split(
        texts, y, test_size=0.2, random_state=42, stratify=y
    )

    vec = build_vectorizer(
        max_features=args.max_features,
        ngram_min=args.ngram_min,
        ngram_max=args.ngram_max,
        min_df=args.min_df,
        vocabulary_path=args.vocabulary_path,
    )
    print("[INFO] Fitting TF-IDF on training text...")
    X_train = vec.fit_transform(X_train_text)
    X_test = vec.transform(X_test_text)
    print(f"[INFO] TF-IDF dims: train={X_train.shape}, test={X_test.shape}")

    pos = float((y_train == 1).sum())
    neg = float((y_train == 0).sum())
    scale_pos_weight = (neg / pos) if pos > 0 else 1.0
    print(f"[INFO] Train counts -> pos={int(pos)}, neg={int(neg)}, scale_pos_weight={scale_pos_weight:.4f}")

    dtrain = xgb.DMatrix(X_train, label=y_train)
    dtest = xgb.DMatrix(X_test, label=y_test)

    params = {
        "objective": "binary:logistic",
        "eval_metric": "aucpr",
        "max_depth": 6,
        "eta": 0.2,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "scale_pos_weight": scale_pos_weight,
        "tree_method": "hist",
    }
    num_round = 400

    print("[INFO] Training XGBoost...")
    bst = xgb.train(
        params,
        dtrain,
        num_boost_round=num_round,
        evals=[(dtrain, "train"), (dtest, "test")],
        early_stopping_rounds=50
    )

    y_proba = bst.predict(dtest)
    y_hat = (y_proba >= 0.5).astype(int)

    p = precision_score(y_test, y_hat, zero_division=0)
    r = recall_score(y_test, y_hat, zero_division=0)
    f1 = f1_score(y_test, y_hat, zero_division=0)
    print("\n=== Classification Report (threshold=0.5) ===")
    print(classification_report(y_test, y_hat, digits=4))
    print(f"[METRIC] precision={p:.4f} recall={r:.4f} f1={f1:.4f}")

    # ---- Save to local temp first ----
    local_model = os.path.join(local_out_dir, "model.bst")
    bst.save_model(local_model)
    print(f"[INFO] Saved XGBoost model to {local_model}")

    vocab_src = vec.vocabulary_ or {}
    vocab_safe = {str(term): int(idx) for term, idx in vocab_src.items()}
    vocab_json = {
        "vocabulary": vocab_safe,
        "ngram_range": [int(vec.ngram_range[0]), int(vec.ngram_range[1])],
        "max_features": None,
        "min_df": int(args.min_df),
        "lowercase": True,
        "stop_words": "english"
    }
    local_vocab = os.path.join(local_out_dir, "tfidf_vocab.json")
    with open(local_vocab, "w", encoding="utf-8") as f:
        json.dump(vocab_json, f)

    local_meta = os.path.join(local_out_dir, "metadata.json")
    with open(local_meta, "w", encoding="utf-8") as f:
        json.dump({
            "label_column": str(args.label_column),
            "text_column": str(args.text_column),
            "pos_regex": str(args.pos_regex),
            "vec_dim": int(X_train.shape[1]),
            "f1": float(f1),
            "precision": float(p),
            "recall": float(r)
        }, f, indent=2)

    # ---- If AIP_MODEL_DIR is gs://, upload there; else copy to that local dir ----
    if _is_gcs_path(aip_model_dir):
        print(f"[INFO] Uploading artifacts to {aip_model_dir} ...")
        _upload_to_gcs(local_model, aip_model_dir)
        _upload_to_gcs(local_vocab, aip_model_dir)
        _upload_to_gcs(local_meta, aip_model_dir)
    else:
        os.makedirs(aip_model_dir, exist_ok=True)
        for fpath in (local_model, local_vocab, local_meta):
            dest = os.path.join(aip_model_dir, os.path.basename(fpath))
            with open(fpath, "rb") as src, open(dest, "wb") as dst:
                dst.write(src.read())
            print(f"[INFO] Copied {fpath} -> {dest}")

    print("[INFO] Done.")
    # Optional: explicitly print where we wrote (useful in logs)
    print(f"[INFO] Artifacts available under: {aip_model_dir}")


if __name__ == "__main__":
    main()
