"""Layer 2 — patient prioritization (DNI risk).

Pipeline trained on the 3 ConcilMed lots, predicts P(has DNI) for a séjour.
Loaded at startup by app.py and exposed via /predict/layer2.
"""
from __future__ import annotations
from typing import Optional
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, VotingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

SERVICE_CODE_MAP = {
    "Médecine Interne": 1, "Gériatrie": 2, "Cardiologie": 3, "Néphrologie": 4,
    "Endocrinologie": 5, "Pneumologie": 6, "Urgences → Med. Interne": 7,
    "Réanimation Médicale": 8, "Neurologie": 9, "Rhumatologie": 10,
    "Hématologie": 11, "Oncologie": 12,
}
URGENCE_SERVICES = {"Réanimation Médicale", "Urgences → Med. Interne"}

L2_FEATURES = ["age", "gender_M", "did", "dnid", "diabete", "irc", "obesite",
               "score_comorb", "nb_meds_chron", "nb_meds_hosp", "service_code",
               "urgence", "los_j", "creat", "gluc", "hba1c", "k", "pas", "crp"]
L2_NUMERIC = ["age", "score_comorb", "nb_meds_chron", "nb_meds_hosp",
              "los_j", "creat", "gluc", "hba1c", "k", "pas", "crp"]
L2_BINARY = ["gender_M", "did", "dnid", "diabete", "irc", "obesite",
             "service_code", "urgence"]


def build_pipeline() -> Pipeline:
    pre = ColumnTransformer([
        ("num", Pipeline([
            ("imp", SimpleImputer(strategy="median")),
            ("sc", StandardScaler()),
        ]), L2_NUMERIC),
        ("bin", SimpleImputer(strategy="most_frequent"), L2_BINARY),
    ])
    hgb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06,
                                         max_leaf_nodes=31, l2_regularization=1.0,
                                         random_state=0)
    lr = LogisticRegression(max_iter=5000, C=0.5, class_weight="balanced")
    vc = VotingClassifier(estimators=[("hgb", hgb), ("lr", lr)],
                          voting="soft", weights=[2, 1])
    return Pipeline([("pre", pre), ("clf", vc)])


def encode_sejour(row: dict) -> pd.DataFrame:
    """Encode a single séjour dict to the layer-2 feature row."""
    service = row.get("service")
    out = {
        "age": row.get("age"),
        "gender_M": 1 if (row.get("gender") or "").upper() == "M" else 0,
        "did": row.get("did") or 0,
        "dnid": row.get("dnid") or 0,
        "diabete": row.get("diabete") or 0,
        "irc": row.get("irc") or 0,
        "obesite": row.get("obesite") or 0,
        "score_comorb": row.get("score_comorb") or 0,
        "nb_meds_chron": row.get("nb_meds_chron"),
        "nb_meds_hosp": row.get("nb_meds_hosp"),
        "service_code": SERVICE_CODE_MAP.get(service, 0),
        "urgence": 1 if service in URGENCE_SERVICES else 0,
        "los_j": row.get("los_j"),
        "creat": row.get("creat"),
        "gluc": row.get("gluc"),
        "hba1c": row.get("hba1c"),
        "k": row.get("k"),
        "pas": row.get("pas"),
        "crp": row.get("crp"),
    }
    return pd.DataFrame([out], columns=L2_FEATURES)


def label_from_proba(p: float, threshold: float) -> str:
    if p >= max(threshold, 0.75):
        return "à vérifier en priorité"
    if p >= threshold:
        return "à vérifier"
    return "risque faible"
