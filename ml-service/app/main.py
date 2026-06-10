"""ML ConcilMed FastAPI service.

Exposes layer2 (patient prioritization) and layer4 (omission severity)
predictions backed by scikit-learn models from the original notebook.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

MODELS_DIR = Path(__file__).parent / "models"
API_KEY_ENV = "ML_CONCILMED_API_KEY"

app = FastAPI(title="ML ConcilMed", version="1.0.0")


# ---------- Auth ----------
def require_api_key(authorization: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get(API_KEY_ENV)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{API_KEY_ENV} not configured on server",
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Lazy model loading ----------
_models: dict[str, Any] = {}


def _load(kind: str) -> Any:
    if kind in _models:
        return _models[kind]
    path = MODELS_DIR / f"{kind}.joblib"
    if not path.exists():
        return None
    _models[kind] = joblib.load(path)
    return _models[kind]


# ---------- Schemas ----------
class Layer2Input(BaseModel):
    age: Optional[float] = None
    sex: Optional[str] = None  # 'M' / 'F'
    nb_comorbidites: Optional[int] = 0
    has_insuffisance_renale: bool = False
    has_insuffisance_hepatique: bool = False
    nb_meds_hosp: Optional[int] = 0
    via_urgences: bool = False
    duree_sejour: Optional[float] = None
    service: Optional[str] = None
    creatinine: Optional[float] = None
    glucose: Optional[float] = None
    hba1c: Optional[float] = None
    kaliemie: Optional[float] = None
    pa_sys: Optional[float] = None
    pa_dia: Optional[float] = None
    crp: Optional[float] = None


class Layer2Output(BaseModel):
    score: float = Field(..., ge=0, le=1)
    label: int
    model_version: str
    model_kind: str


class Layer4Input(BaseModel):
    norm_name: str
    atc_class: Optional[str] = None
    age: Optional[float] = None
    nb_meds_hosp: Optional[int] = 0
    duree_sejour: Optional[float] = None
    service: Optional[str] = None


class Layer4Output(BaseModel):
    severity_score: float = Field(..., ge=0, le=1)
    is_severe: int
    model_version: str


class Layer4Batch(BaseModel):
    items: List[Layer4Input]


# ---------- Heuristic fallback (when .joblib is missing) ----------
def _heuristic_layer2(p: Layer2Input) -> float:
    # Documented in notebook: nb_meds_hosp dominates.
    base = min((p.nb_meds_hosp or 0) / 12.0, 1.0) * 0.75
    if p.via_urgences:
        base += 0.05
    if p.has_insuffisance_renale:
        base += 0.05
    if p.has_insuffisance_hepatique:
        base += 0.03
    if (p.age or 0) >= 75:
        base += 0.08
    return float(min(max(base, 0.0), 1.0))


HIGH_RISK_PREFIXES = ("A10A", "B01A", "C01A", "C03", "N02A", "N05A", "N05B", "L01")


def _heuristic_layer4(p: Layer4Input) -> float:
    name = (p.norm_name or "").lower()
    score = 0.3
    if p.atc_class and p.atc_class.upper().startswith(HIGH_RISK_PREFIXES):
        score += 0.35
    if any(k in name for k in ("insulin", "warfar", "digoxin", "metho", "amio")):
        score += 0.25
    if (p.age or 0) >= 75:
        score += 0.05
    if (p.nb_meds_hosp or 0) >= 8:
        score += 0.05
    return float(min(max(score, 0.0), 1.0))


# ---------- Routes ----------
@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "models": {
            "layer2": _load("layer2") is not None,
            "layer4": _load("layer4") is not None,
        },
    }


@app.post("/predict/layer2", response_model=Layer2Output, dependencies=[Depends(require_api_key)])
def predict_layer2(payload: Layer2Input) -> Layer2Output:
    model = _load("layer2")
    if model is None:
        score = _heuristic_layer2(payload)
        return Layer2Output(
            score=score,
            label=int(score >= 0.5),
            model_version="heuristic-fallback",
            model_kind="rule-based",
        )
    df = pd.DataFrame([payload.model_dump()])
    proba = float(model.predict_proba(df)[0, 1])
    return Layer2Output(
        score=proba,
        label=int(proba >= 0.5),
        model_version="layer2-v1",
        model_kind=type(model).__name__,
    )


def _predict_layer4_one(payload: Layer4Input, model: Any) -> Layer4Output:
    if model is None:
        score = _heuristic_layer4(payload)
        return Layer4Output(
            severity_score=score,
            is_severe=int(score >= 0.5),
            model_version="heuristic-fallback",
        )
    df = pd.DataFrame([payload.model_dump()])
    proba = float(model.predict_proba(df)[0, 1])
    return Layer4Output(
        severity_score=proba,
        is_severe=int(proba >= 0.5),
        model_version="layer4-v1",
    )


@app.post("/predict/layer4", response_model=Layer4Output, dependencies=[Depends(require_api_key)])
def predict_layer4(payload: Layer4Input) -> Layer4Output:
    return _predict_layer4_one(payload, _load("layer4"))


@app.post("/predict/layer4/batch", dependencies=[Depends(require_api_key)])
def predict_layer4_batch(batch: Layer4Batch) -> dict[str, Any]:
    model = _load("layer4")
    return {"results": [_predict_layer4_one(it, model).model_dump() for it in batch.items]}
