"""Medication name normalization, copied verbatim from ConcilMed notebook."""
from __future__ import annotations
import re
import unicodedata
import numpy as np

_UNIT = r"(?:mg/kg/j|mg/kg|mcg/kg|mg/j|g/j|mcg|µg|ug|mg|g|ml|ui|u/ml|%|‰)"
_DOSE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(" + _UNIT + r")", re.IGNORECASE)
_DROP = {"ns", "iv", "sc", "po", "inh", "im", "ivl", "iv/sc", "ivsc",
         "lp", "nebulise", "cp", "gel", "gelule", "comprime", "sol"}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def norm_name(text) -> str:
    if text is None or (isinstance(text, float) and np.isnan(text)):
        return ""
    s = re.sub(r"^\s*rp\s*\d*\s*[.\-:]?\s*", "", str(text), flags=re.IGNORECASE)
    s = strip_accents(s).lower().strip()
    s = _DOSE_RE.sub(" ", s)
    s = re.sub(r"\d+(?:[.,]\d+)?", " ", s)
    s = re.sub(r"[^\w\s/]", " ", s)
    toks = [t.strip("/") for t in s.split()]
    toks = [t for t in toks if t and t not in _DROP]
    return " ".join(toks).strip().strip("/ ").strip()
