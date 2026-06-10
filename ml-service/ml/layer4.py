"""Layer 4 — severity of an omission (P(grade=3))."""
from __future__ import annotations
from typing import List, Optional
import pandas as pd
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.pipeline import Pipeline

from .norm import norm_name

L4_NUM = ["duree_sejour_j", "nb_meds_chroniques", "nb_meds_hosp", "age",
          "score_comorb", "irc", "diabete", "hta", "obesite", "did", "dnid",
          "creatinine_umol_L", "crp_mg_L", "potassium_mmol_L", "glucose_mmol_L",
          "hba1c_pct", "PAS_mmHg", "PAD_mmHg", "sodium_mmol_L", "hemoglobine_g_dL"]
L4_CAT = ["nn", "service", "gender"]


def build_X(df: pd.DataFrame, cols: Optional[List[str]] = None) -> pd.DataFrame:
    num = [c for c in L4_NUM if c in df.columns]
    cat = [c for c in L4_CAT if c in df.columns]
    X = pd.get_dummies(df[num + cat], columns=cat, dummy_na=True)
    if cols is not None:
        X = X.reindex(columns=cols, fill_value=0)
    return X.fillna(-1)


def build_estimator() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=400, learning_rate=0.05, max_leaf_nodes=15,
        l2_regularization=1.0, random_state=0, class_weight="balanced",
    )


def encode_payload(payload: dict, medication_name: str) -> pd.DataFrame:
    """Build a single-row DataFrame for layer-4 inference from the API payload."""
    sej = payload.get("sejour", payload) or {}
    row = {
        "duree_sejour_j": sej.get("los_j") or sej.get("duree_sejour_j"),
        "nb_meds_chroniques": sej.get("nb_meds_chron") or sej.get("nb_meds_chroniques"),
        "nb_meds_hosp": sej.get("nb_meds_hosp"),
        "age": sej.get("age"),
        "score_comorb": sej.get("score_comorb"),
        "irc": sej.get("irc") or 0,
        "diabete": sej.get("diabete") or 0,
        "hta": sej.get("hta") or 0,
        "obesite": sej.get("obesite") or 0,
        "did": sej.get("did") or 0,
        "dnid": sej.get("dnid") or 0,
        "creatinine_umol_L": sej.get("creat") or sej.get("creatinine_umol_L"),
        "crp_mg_L": sej.get("crp") or sej.get("crp_mg_L"),
        "potassium_mmol_L": sej.get("k") or sej.get("potassium_mmol_L"),
        "glucose_mmol_L": sej.get("gluc") or sej.get("glucose_mmol_L"),
        "hba1c_pct": sej.get("hba1c") or sej.get("hba1c_pct"),
        "PAS_mmHg": sej.get("pas") or sej.get("PAS_mmHg"),
        "PAD_mmHg": sej.get("pad") or sej.get("PAD_mmHg"),
        "sodium_mmol_L": sej.get("sodium") or sej.get("sodium_mmol_L"),
        "hemoglobine_g_dL": sej.get("hb") or sej.get("hemoglobine_g_dL"),
        "nn": norm_name(medication_name),
        "service": sej.get("service"),
        "gender": sej.get("gender"),
    }
    return pd.DataFrame([row])


def label_from_proba(p: float, threshold: float) -> str:
    if p >= max(threshold, 0.7):
        return "oubli probablement grave"
    if p >= threshold:
        return "oubli à vérifier"
    return "oubli probablement non grave"
