"""FastAPI inference service for ConcilMed ML models (Étage 2 + Étage 4)."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
from typing import List, Optional

import joblib
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from ml.layer2 import encode_sejour, label_from_proba as l2_label
from ml.layer4 import encode_payload, build_X as build_l4_X, label_from_proba as l4_label

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "models"))
API_KEY = os.environ.get("ML_API_KEY")  # shared secret w/ the app

app = FastAPI(title="ConcilMed ML Service", version="1.0.0")

# --- model loading (lazy, on first request) ---------------------------------
_state: dict = {"layer2": None, "layer4": None, "meta": None}


def _load_meta() -> dict:
    meta_path = MODELS_DIR / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text())
    return {}


def _file_sha(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def get_layer2():
    if _state["layer2"] is None:
        p = MODELS_DIR / "layer2.joblib"
        if not p.exists():
            raise HTTPException(503, "layer2.joblib not trained. Run `python train.py` first.")
        _state["layer2"] = joblib.load(p)
    return _state["layer2"]


def get_layer4():
    if _state["layer4"] is None:
        p = MODELS_DIR / "layer4.joblib"
        if not p.exists():
            raise HTTPException(503, "layer4.joblib not trained. Run `python train.py` first.")
        _state["layer4"] = joblib.load(p)
    return _state["layer4"]


# --- auth -------------------------------------------------------------------
def require_api_key(authorization: Optional[str] = Header(None)) -> None:
    if API_KEY is None:
        # No key configured = open mode (dev only). Log a warning at startup.
        return
    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(401, "Invalid or missing API key")


# --- schemas ----------------------------------------------------------------
class SejourPayload(BaseModel):
    age: Optional[float] = None
    gender: Optional[str] = None
    did: Optional[int] = 0
    dnid: Optional[int] = 0
    diabete: Optional[int] = 0
    irc: Optional[int] = 0
    obesite: Optional[int] = 0
    hta: Optional[int] = 0
    score_comorb: Optional[float] = 0
    nb_meds_chron: Optional[float] = None
    nb_meds_hosp: Optional[float] = None
    service: Optional[str] = None
    los_j: Optional[float] = None
    creat: Optional[float] = None
    gluc: Optional[float] = None
    hba1c: Optional[float] = None
    k: Optional[float] = None
    pas: Optional[float] = None
    pad: Optional[float] = None
    crp: Optional[float] = None
    sodium: Optional[float] = None
    hb: Optional[float] = None


class Layer2Request(BaseModel):
    sejour: SejourPayload
    threshold: float = Field(default=0.5, ge=0, le=1)


class Layer2Response(BaseModel):
    proba_dni: float
    threshold: float
    label: str
    model_version: Optional[str] = None


class Layer4Request(BaseModel):
    sejour: SejourPayload
    medication_name: str
    threshold: float = Field(default=0.5, ge=0, le=1)


class Layer4BatchRequest(BaseModel):
    sejour: SejourPayload
    medication_names: List[str]
    threshold: float = Field(default=0.5, ge=0, le=1)


class Layer4Item(BaseModel):
    medication_name: str
    med_normalized: str
    proba_grave: float
    label: str


# --- endpoints --------------------------------------------------------------
@app.get("/health")
def health():
    meta = _load_meta()
    return {
        "status": "ok",
        "models_dir": str(MODELS_DIR),
        "layer2_sha": _file_sha(MODELS_DIR / "layer2.joblib"),
        "layer4_sha": _file_sha(MODELS_DIR / "layer4.joblib"),
        "meta": meta,
    }


@app.post("/predict/layer2", response_model=Layer2Response, dependencies=[Depends(require_api_key)])
def predict_layer2(req: Layer2Request):
    pipe = get_layer2()
    X = encode_sejour(req.sejour.model_dump())
    proba = float(pipe.predict_proba(X)[0, 1])
    return Layer2Response(
        proba_dni=proba,
        threshold=req.threshold,
        label=l2_label(proba, req.threshold),
        model_version=_file_sha(MODELS_DIR / "layer2.joblib"),
    )


@app.post("/predict/layer4", dependencies=[Depends(require_api_key)])
def predict_layer4(req: Layer4Request):
    bundle = get_layer4()
    est = bundle["estimator"]
    cols = bundle["columns"]
    df = encode_payload({"sejour": req.sejour.model_dump()}, req.medication_name)
    X = build_l4_X(df, cols=cols)
    proba = float(est.predict_proba(X)[0, 1])
    from ml.norm import norm_name
    return {
        "medication_name": req.medication_name,
        "med_normalized": norm_name(req.medication_name),
        "proba_grave": proba,
        "threshold": req.threshold,
        "label": l4_label(proba, req.threshold),
        "model_version": _file_sha(MODELS_DIR / "layer4.joblib"),
    }


@app.post("/predict/layer4/batch", dependencies=[Depends(require_api_key)])
def predict_layer4_batch(req: Layer4BatchRequest):
    bundle = get_layer4()
    est = bundle["estimator"]
    cols = bundle["columns"]
    from ml.norm import norm_name
    import pandas as pd
    sej_dict = req.sejour.model_dump()
    frames = [encode_payload({"sejour": sej_dict}, m) for m in req.medication_names]
    if not frames:
        return {"items": []}
    df = pd.concat(frames, ignore_index=True)
    X = build_l4_X(df, cols=cols)
    probas = est.predict_proba(X)[:, 1]
    items = [
        Layer4Item(
            medication_name=m,
            med_normalized=norm_name(m),
            proba_grave=float(p),
            label=l4_label(float(p), req.threshold),
        ).model_dump()
        for m, p in zip(req.medication_names, probas)
    ]
    return {"items": items, "threshold": req.threshold,
            "model_version": _file_sha(MODELS_DIR / "layer4.joblib")}
