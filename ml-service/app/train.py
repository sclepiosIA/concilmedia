"""Skeleton for retraining the two models from CSV batches in ../data/.

Run: `python -m app.train` from ml-service/ to regenerate
app/models/layer2.joblib and app/models/layer4.joblib.

Replace the placeholders with the exact preprocessing from the original
notebook before using in production.
"""
from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, VotingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MODELS_DIR = Path(__file__).resolve().parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _load_concat(glob: str) -> pd.DataFrame:
    frames = [pd.read_csv(p) for p in DATA_DIR.glob(glob)]
    if not frames:
        raise SystemExit(f"No CSVs matching {glob} in {DATA_DIR}")
    return pd.concat(frames, ignore_index=True)


def train_layer2() -> None:
    df = _load_concat("layer2_*.csv")
    y = df.pop("target_dni")
    num = ["age", "nb_comorbidites", "nb_meds_hosp", "duree_sejour",
           "creatinine", "glucose", "hba1c", "kaliemie", "pa_sys", "pa_dia", "crp"]
    cat = ["sex", "service"]
    pre = ColumnTransformer([
        ("num", StandardScaler(), num),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat),
    ])
    voting = VotingClassifier(
        estimators=[
            ("hgb", HistGradientBoostingClassifier(max_iter=300)),
            ("lr", LogisticRegression(max_iter=1000)),
        ],
        voting="soft",
    )
    pipe = Pipeline([("pre", pre), ("model", voting)]).fit(df, y)
    joblib.dump(pipe, MODELS_DIR / "layer2.joblib")
    print("Wrote", MODELS_DIR / "layer2.joblib")


def train_layer4() -> None:
    df = _load_concat("layer4_*.csv")
    y = df.pop("severe")
    num = ["age", "nb_meds_hosp", "duree_sejour"]
    cat = ["norm_name", "atc_class", "service"]
    pre = ColumnTransformer([
        ("num", StandardScaler(), num),
        ("cat", OneHotEncoder(handle_unknown="ignore", max_categories=200), cat),
    ])
    pipe = Pipeline([
        ("pre", pre),
        ("model", HistGradientBoostingClassifier(max_iter=400)),
    ]).fit(df, y)
    joblib.dump(pipe, MODELS_DIR / "layer4.joblib")
    print("Wrote", MODELS_DIR / "layer4.joblib")


if __name__ == "__main__":
    train_layer2()
    train_layer4()
