import argparse
import json
import os
import re
from typing import Tuple

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
    """
    Convert string labels to binary 0/1.
    Any label matching pos_regex (case-insensitive) -> 1 (positive = SCAM),
    everything else -> 0 (negative = SAFE).
    Returns (y, info) where y is np.ndarray and info includes mapping and counts.
    """
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
    vocabulary_path: str = None,
) -> TfidfVectorizer:
    """
    Create a TfidfVectorizer. If vocabulary_path is provided (local or gs://),
    load an existing vocabulary to lock feature order; otherwise learn it.
    """
    vocab = None
    if vocabulary_path:
        # gs:// paths are supported if gcsfs is installed (declared in setup.py)
        with pd.io.common.get_handle(vocabulary_path, "r", encoding="utf-8").get_handle() as fh:
            data = json.load(fh)
        # Accept either {"vocabulary": {...}} or plain mapping {...}
        if isinstance(data, dict) and "vocabulary" in data and isinstance(data["vocabulary"], dict):
            vocab = data["vocabulary"]
        elif isinstance(data, dict):
            vocab = data
        else:
            raise ValueError("Unsupported vocabulary JSON format.")
        max_features = None  # vocabulary fixes dimension

    vec = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(ngram_min, ngram_max),
        min_df=min_df,
        max_features=max_features,
        vocabulary=vocab,
        dtype=np.float32,
    )
    return vec


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_path", required=True, type=str,
                        help="Path to CSV (gs://bucket/path.csv)")
    parser.add_argument("--text_column", default="text", type=str,
                        help="Name of the text column")
    parser.add_argument("--label_column", default="label", type=str,
                        help="Name of the string label column (e.g., spam/ham)")
    parser.add_argument("--pos_regex", default=r"(spam|scam|phish|fraud|malicious)", type=str,
                        help="Regex (case-insensitive) defining the positive class (SCAM)")
    parser.add_argument("--max_features", default=5000, type=int)
    parser.add_argument("--ngram_min", default=1, type=int)
    parser.add_argument("--ngram_max", default=2, type=int)
    parser.add_argument("--min_df", default=2, type=int)
    parser.add_argument("--vocabulary_path", default=None, type=str,
                        help="Optional gs:// or local path to an existing vocabulary JSON.")

    args = parser.parse_args()

    # Vertex sets this for you when you fill "Model output directory" in the job form
    model_dir = os.environ.get("AIP_MODEL_DIR", "/tmp/model")
    os.makedirs(model_dir, exist_ok=True)
    print(f"[INFO] AIP_MODEL_DIR={model_dir}")

    print(f"[INFO] Loading CSV from: {args.data_path}")
    df = pd.read_csv(args.data_path)

    if args.text_column not in df.columns or args.label_column not in df.columns:
        raise ValueError(f"CSV must contain columns '{args.text_column}' and '{args.label_column}'")

    texts = df[args.text_column].astype(str).fillna("")
    y, info = encode_string_labels(df[args.label_column], pos_regex=args.pos_regex)
    print(f"[INFO] Label encoding: {json.dumps(info, indent=2)}")

    # Split
    X_train_text, X_test_text, y_train, y_test = train_test_split(
        texts, y, test_size=0.2, random_state=42, stratify=y
    )

    # Vectorize
    vec = build_vectorizer(
        max_features=args.max_features,
        ngram_min=args.ngram_min,
        ngram_max=args.ngram_max,
        min_df=args.min_df,
        vocabulary_path=args.vocabulary_path,
    )
    X_train = vec.fit_transform(X_train_text) if vec.vocabulary_ is None else vec.transform(X_train_text)
    X_test = vec.transform(X_test_text)

    # Handle class imbalance
    pos = float((y_train == 1).sum())
    neg = float((y_train == 0).sum())
    scale_pos_weight = (neg / pos) if pos > 0 else 1.0
    print(f"[INFO] Train counts -> pos={int(pos)}, neg={int(neg)}, scale_pos_weight={scale_pos_weight:.4f}")

    dtrain = xgb.DMatrix(X_train, label=y_train)
    dtest = xgb.DMatrix(X_test, label=y_test)

    params = {
        "objective": "binary:logistic",
        "eval_metric": "aucpr",        # PR AUC is robust for imbalance
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

    # Evaluate
    y_proba = bst.predict(dtest)
    y_hat = (y_proba >= 0.5).astype(int)

    p = precision_score(y_test, y_hat, zero_division=0)
    r = recall_score(y_test, y_hat, zero_division=0)
    f1 = f1_score(y_test, y_hat, zero_division=0)

    print("\n=== Classification Report (threshold=0.5) ===")
    print(classification_report(y_test, y_hat, digits=4))
    print(f"[METRIC] precision={p:.4f} recall={r:.4f} f1={f1:.4f}")

    if f1 < 0.80:
        print("[WARN] F1 below 0.80 — consider tuning ngrams/max_features or threshold.")

    # ---- Save artifacts for Vertex prediction container ----
    model_path = os.path.join(model_dir, "model.bst")  # required name
    bst.save_model(model_path)
    print(f"[INFO] Saved XGBoost model to {model_path}")

    # Also save the TF-IDF vocabulary you trained with (so proxy can match)
    vocab_json = {
        "vocabulary": vec.vocabulary_,
        "ngram_range": [vec.ngram_range[0], vec.ngram_range[1]],
        "max_features": args.max_features if vec.vocabulary_ is None else None,
        "min_df": args.min_df,
        "lowercase": True,
        "stop_words": "english"
    }
    vocab_out = os.path.join(model_dir, "tfidf_vocab.json")
    with open(vocab_out, "w", encoding="utf-8") as f:
        json.dump(vocab_json, f)
    print(f"[INFO] Saved TF-IDF vocabulary to {vocab_out}")

    # Save a small metadata file for reference
    with open(os.path.join(model_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump({
            "label_column": args.label_column,
            "text_column": args.text_column,
            "pos_regex": args.pos_regex,
            "vec_dim": int(X_train.shape[1]),
            "f1": float(f1),
            "precision": float(p),
            "recall": float(r)
        }, f, indent=2)

    print("[INFO] Done.")


if __name__ == "__main__":
    main()
