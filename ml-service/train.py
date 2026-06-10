"""Train layer2 and layer4 models from the 3 ConcilMed lots and persist to .joblib.

Usage (from ml-service/):
    python train.py --data-dir data

Expected layout:
    data/lot 1/{patients,sejours,meds_chron,prescriptions,divergences}.xlsx
    data/lot 2/...
    data/data divergence/...
"""
from __future__ import annotations
import argparse
import hashlib
import json
from datetime import datetime, date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.layer2 import (
    build_pipeline as build_l2,
    L2_FEATURES, SERVICE_CODE_MAP, URGENCE_SERVICES,
)
from ml.layer4 import build_estimator as build_l4, build_X as build_l4_X
from ml.norm import norm_name

LOTS = {"Lot 1": "lot 1", "Lot 2": "lot 2", "Data divergence": "data divergence"}

SEJ_NUM_FIX = ["duree_sejour_j", "glucose_mmol_L", "hba1c_pct",
               "potassium_mmol_L", "hemoglobine_g_dL", "crp_mg_L"]


def fix_cell(v):
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return float(f"{v.day}.{v.month}")
    return v


def load_table(base: Path, lot: str, name: str) -> pd.DataFrame:
    df = pd.read_excel(base / LOTS[lot] / f"{name}.xlsx", sheet_name=0)
    if name == "sejours":
        for c in SEJ_NUM_FIX:
            if c in df.columns:
                df[c] = pd.to_numeric(df[c].map(fix_cell), errors="coerce")
    return df


def layer2_table(base: Path, lot: str) -> pd.DataFrame:
    pat = load_table(base, lot, "patients")
    sej = load_table(base, lot, "sejours")
    div = load_table(base, lot, "divergences")
    df = sej.merge(pat[["patient_id", "gender", "did", "dnid", "diabete",
                        "irc", "obesite", "score_comorb", "age"]],
                   on="patient_id", how="left")
    out = pd.DataFrame()
    out["sejour_id"] = df["sejour_id"]
    out["age"] = df["age"]
    out["gender_M"] = (df["gender"] == "M").astype(int)
    for c in ("did", "dnid", "diabete", "irc", "obesite", "score_comorb"):
        out[c] = df[c]
    out["nb_meds_chron"] = df["nb_meds_chroniques"]
    out["nb_meds_hosp"] = df["nb_meds_hosp"]
    out["service_code"] = df["service"].map(SERVICE_CODE_MAP).fillna(0).astype(int)
    out["urgence"] = df["service"].isin(URGENCE_SERVICES).astype(int)
    out["los_j"] = df["duree_sejour_j"]
    out["creat"] = df["creatinine_umol_L"]
    out["gluc"] = df["glucose_mmol_L"]
    out["hba1c"] = df["hba1c_pct"]
    out["k"] = df["potassium_mmol_L"]
    out["pas"] = df["PAS_mmHg"]
    out["crp"] = df["crp_mg_L"]
    dni = div[div["type"] == "DNI"]
    out["has_dni"] = out["sejour_id"].isin(dni["sejour_id"]).astype(int)
    return out


def omission_candidates(base: Path, lot: str) -> pd.DataFrame:
    mc = load_table(base, lot, "meds_chron").copy()
    pr = load_table(base, lot, "prescriptions").copy()
    sej = load_table(base, lot, "sejours")
    pat = load_table(base, lot, "patients")
    mc["nn"] = mc["medicament"].map(norm_name)
    pr["nn"] = pr["medicament"].map(norm_name)
    pres = pr.groupby("sejour_id")["nn"].apply(set).to_dict()
    rows = []
    for sid, grp in mc.groupby("sejour_id"):
        here = pres.get(sid, set())
        seen = set()
        for _, r in grp.iterrows():
            nn = r["nn"]
            if not nn or nn in seen:
                continue
            seen.add(nn)
            if nn in here:
                continue
            rows.append({"sejour_id": sid, "patient_id": r["patient_id"], "nn": nn})
    cand = pd.DataFrame(rows)
    cand = cand.merge(sej, on=["sejour_id", "patient_id"], how="left")
    cand = cand.merge(pat, on="patient_id", how="left")
    return cand


def gt_labels(base: Path, lot: str) -> pd.DataFrame:
    div = load_table(base, lot, "divergences").copy()
    div["nn"] = div["medicament"].map(norm_name)
    div = div.sort_values(
        ["type", "gravite"],
        key=lambda s: s.map({"DNI": 0, "DIND": 1, "DID": 2})
        if s.name == "type" else -s,
    )
    return div.drop_duplicates(["patient_id", "nn"])[["patient_id", "nn", "gravite"]]


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:12]


def train(base: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    # ---- Layer 2 -----------------------------------------------------------
    l2_frames = [layer2_table(base, lot) for lot in LOTS]
    l2 = pd.concat(l2_frames, ignore_index=True)
    X2, y2 = l2[L2_FEATURES].copy(), l2["has_dni"].astype(int)
    pipe2 = build_l2()
    pipe2.fit(X2, y2)
    joblib.dump(pipe2, out_dir / "layer2.joblib")
    print(f"[layer2] trained on {len(X2)} séjours, prevalence={y2.mean():.2%}")

    # ---- Layer 4 -----------------------------------------------------------
    l4_train = []
    for lot in LOTS:
        cand = omission_candidates(base, lot)
        gt = gt_labels(base, lot)
        if cand.empty:
            continue
        merged = cand.merge(gt, on=["patient_id", "nn"], how="left")
        merged["grave"] = (merged["gravite"] == 3).astype(int)
        l4_train.append(merged)
    l4 = pd.concat(l4_train, ignore_index=True)
    X4 = build_l4_X(l4)
    y4 = l4["grave"].astype(int)
    est = build_l4()
    est.fit(X4, y4)
    joblib.dump({"estimator": est, "columns": list(X4.columns)},
                out_dir / "layer4.joblib")
    print(f"[layer4] trained on {len(X4)} omissions, prevalence={y4.mean():.2%}")

    meta = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "layer2": {
            "n_samples": int(len(X2)),
            "positive_rate": float(y2.mean()),
            "sha": file_sha(out_dir / "layer2.joblib"),
        },
        "layer4": {
            "n_samples": int(len(X4)),
            "positive_rate": float(y4.mean()),
            "n_columns": int(X4.shape[1]),
            "sha": file_sha(out_dir / "layer4.joblib"),
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    print("Saved meta:", meta)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--out-dir", default="models")
    args = parser.parse_args()
    train(Path(args.data_dir), Path(args.out_dir))
