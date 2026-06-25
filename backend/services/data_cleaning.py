"""Limpieza y normalización del DataFrame crudo de agenda.

Entrada:  DataFrame crudo con las columnas que el usuario seleccionó.
Salida:   DataFrame limpio con columnas estandarizadas + reporte de exclusiones.
"""
from typing import Dict, Optional, Tuple
import re
import unicodedata

import pandas as pd


# ─── helpers de normalización ───────────────────────────────────────────────

def _limpiar_texto(valor) -> Optional[str]:
    """Limpia un string: strip, espacios dobles, caracteres de control."""
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    texto = re.sub(r"[\x00-\x1F\x7F]", "", texto)   # caracteres de control
    texto = re.sub(r" {2,}", " ", texto)              # espacios dobles
    if texto.lower() in ("nan", "none", "n/a", "na", "-", ""):
        return None
    return texto


def _title_safe(texto: Optional[str]) -> Optional[str]:
    """Title case respetando acentos."""
    if texto is None:
        return None
    return texto.title()


def _normalizar_acento(texto: str) -> str:
    """Pasa a minúsculas sin acentos, para comparaciones."""
    nfkd = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _unificar_variantes(serie: pd.Series, mapa: dict) -> pd.Series:
    """Reemplaza variantes usando comparación sin acentos ni mayúsculas."""
    mapa_norm = {_normalizar_acento(k): v for k, v in mapa.items()}

    def _reemplazar(val):
        if pd.isna(val):
            return val
        clave = _normalizar_acento(str(val))
        return mapa_norm.get(clave, val)

    return serie.apply(_reemplazar)


# ─── mapas de normalización ──────────────────────────────────────────────────

TIPO_MAPA = {
    # Reconversión
    "reconversion": "Reconversión",
    "reconversión": "Reconversión",
    "reconversion promo4m": "Reconversión",
    "reconversión promo4m": "Reconversión",
    "reconversoin": "Reconversión",
    "reconvercion": "Reconversión",
    # Instalación
    "instalacion": "Instalación",
    "instalación": "Instalación",
    "inst": "Instalación",
    "instalacion tv": "Instalación TV",
    "instalación tv": "Instalación TV",
    # Mudanza
    "mudanza": "Mudanza",
    "mudansa": "Mudanza",
    # Extensión TV
    "extension tv": "Extensión TV",
    "extensión tv": "Extensión TV",
    "ext tv": "Extensión TV",
    # Baja
    "baja": "Baja",
    "bajas": "Baja",
}

ZONA_MAPA = {
    # normaliza "zona1", "ZONA 1", "Zona  1" → "Zona 1"
}


def _normalizar_zona(serie: pd.Series) -> pd.Series:
    """Unifica variantes de zona: 'zona1', 'ZONA 1', 'zona  1' → 'Zona 1'."""
    def _fix(val):
        if pd.isna(val):
            return val
        s = str(val).strip()
        # quitar espacios internos múltiples
        s = re.sub(r" {2,}", " ", s)
        # "zona1" → "Zona 1"
        s = re.sub(r"(?i)zona\s*(\w+)", lambda m: f"Zona {m.group(1).title()}", s)
        return s.title()
    return serie.apply(_fix)


def _normalizar_vendedor(serie: pd.Series) -> pd.Series:
    """Title case + colapsa espacios internos."""
    def _fix(val):
        if pd.isna(val):
            return val
        s = re.sub(r" {2,}", " ", str(val).strip())
        return s.title()
    return serie.apply(_fix)


# ─── función principal ───────────────────────────────────────────────────────

def clean_data(
    df: pd.DataFrame,
    date_col: str,
    tipo_col: str,
    zona_col: Optional[str] = None,
    vendedor_col: Optional[str] = None,
    promo_col: Optional[str] = None,
    plan_nuevo_col: Optional[str] = None,
    postventa_col: Optional[str] = None,
    respuesta_col: Optional[str] = None,
) -> Tuple[pd.DataFrame, Dict]:
# Normalizar nombres de columna por si vienen con espacios
    date_col       = date_col.strip()       if date_col       else date_col
    tipo_col       = tipo_col.strip()       if tipo_col       else tipo_col
    zona_col       = zona_col.strip()       if zona_col       else zona_col
    vendedor_col   = vendedor_col.strip()   if vendedor_col   else vendedor_col
    promo_col      = promo_col.strip()      if promo_col      else promo_col
    plan_nuevo_col = plan_nuevo_col.strip() if plan_nuevo_col else plan_nuevo_col
    postventa_col  = postventa_col.strip()  if postventa_col  else postventa_col
    respuesta_col  = respuesta_col.strip()  if respuesta_col  else respuesta_col

    total = len(df)
    excluded: Dict[str, int] = {}
    warnings_list = []

    work = df.copy()

    # ── 1. duplicados ──────────────────────────────────────────────────────
    cols_dup = [c for c in [date_col, tipo_col, zona_col, vendedor_col] if c and c in work.columns]
    duplicados = work.duplicated(subset=cols_dup, keep="first").sum()
    if duplicados:
        excluded["duplicados"] = int(duplicados)
        warnings_list.append(f"Se eliminaron {duplicados} filas duplicadas")
    work = work.drop_duplicates(subset=cols_dup, keep="first")

    # ── 2. fecha ───────────────────────────────────────────────────────────
    # intentar múltiples formatos
    work["fecha"] = pd.to_datetime(work[date_col], errors="coerce", dayfirst=True)

    # segundo intento con formato explícito para los que fallaron
    mask_nulos = work["fecha"].isna()
    if mask_nulos.any():
        for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d"):
            if not mask_nulos.any():
                break
            parsed = pd.to_datetime(work.loc[mask_nulos, date_col], format=fmt, errors="coerce")
            work.loc[mask_nulos & parsed.notna(), "fecha"] = parsed[parsed.notna()]
            mask_nulos = work["fecha"].isna()

    sin_fecha = work["fecha"].isna().sum()
    if sin_fecha:
        excluded["fecha_invalida"] = int(sin_fecha)
        warnings_list.append(f"{sin_fecha} filas con fecha inválida o vacía")
    work = work.dropna(subset=["fecha"])

    # fechas fuera de rango razonable (antes de 2000 o futuro lejano)
    hoy = pd.Timestamp.today()
    fuera_rango = ((work["fecha"].dt.year < 2000) | (work["fecha"] > hoy + pd.DateOffset(months=3))).sum()
    if fuera_rango:
        excluded["fecha_fuera_rango"] = int(fuera_rango)
        warnings_list.append(f"{fuera_rango} filas con fecha fuera de rango (antes del 2000 o futuro lejano)")
    work = work[
        (work["fecha"].dt.year >= 2000) &
        (work["fecha"] <= hoy + pd.DateOffset(months=3))
    ]

    # ── 3. tipo de trabajo ────────────────────────────────────────────────
    work["tipo"] = work[tipo_col].apply(_limpiar_texto)
    work["tipo"] = _unificar_variantes(work["tipo"].fillna(""), TIPO_MAPA)
    work["tipo"] = work["tipo"].apply(lambda x: _title_safe(_limpiar_texto(x)))
    work["tipo"] = work["tipo"].replace("", pd.NA)

    sin_tipo = work["tipo"].isna().sum()
    if sin_tipo:
        excluded["tipo_vacio"] = int(sin_tipo)
        warnings_list.append(f"{sin_tipo} filas sin tipo de trabajo")
    work = work.dropna(subset=["tipo"])

    # ── 4. zona (opcional) ────────────────────────────────────────────────
    if zona_col and zona_col in df.columns:
        work["zona"] = work[zona_col].apply(_limpiar_texto)
        work["zona"] = _normalizar_zona(work["zona"])
        work["zona"] = work["zona"].replace("", pd.NA)
    else:
        work["zona"] = pd.NA

    # ── 5. vendedor (opcional) ────────────────────────────────────────────
    if vendedor_col and vendedor_col in df.columns:
        work["vendedor"] = work[vendedor_col].apply(_limpiar_texto)
        work["vendedor"] = _normalizar_vendedor(work["vendedor"])
        work["vendedor"] = work["vendedor"].replace("", pd.NA)
    else:
        work["vendedor"] = pd.NA

    # ── 6. promoción (opcional) ───────────────────────────────────────────
    if promo_col and promo_col in df.columns:
        work["promo"] = work[promo_col].apply(_limpiar_texto)

    # ── 7. plan nuevo (opcional) ──────────────────────────────────────────
    if plan_nuevo_col and plan_nuevo_col in df.columns:
        work["plan_nuevo"] = work[plan_nuevo_col].apply(_limpiar_texto)
        work["plan_nuevo"] = work["plan_nuevo"].apply(
            lambda x: x.upper() if isinstance(x, str) else x
        )

# ── 7b. plan combinado: plan nuevo si existe, sino promoción ─────────
    if (plan_nuevo_col and plan_nuevo_col in df.columns) or (promo_col and promo_col in df.columns):
        plan_nuevo_raw = (
            work[plan_nuevo_col].apply(_limpiar_texto)
            if plan_nuevo_col and plan_nuevo_col in df.columns
            else pd.Series([None] * len(work), index=work.index)
        )
        promo_raw = (
            work[promo_col].apply(_limpiar_texto)
            if promo_col and promo_col in df.columns
            else pd.Series([None] * len(work), index=work.index)
        )
        work["plan"] = plan_nuevo_raw.combine_first(promo_raw)
        work["plan"] = work["plan"].apply(lambda x: x.upper() if isinstance(x, str) else x)

    # ── 8. postventa (opcional) ───────────────────────────────────────────
    if postventa_col and postventa_col in df.columns:
        work["postventa"] = df[postventa_col].astype(str).str.strip().str.lower().isin(
            ["true", "verdadero", "1", "sí", "si", "yes", "1.0"]
        )

    # ── 9. respuesta postventa (opcional) ─────────────────────────────────
    if respuesta_col and respuesta_col in df.columns:
        work["respuesta"] = work[respuesta_col].apply(_limpiar_texto).fillna("")

    # ── columnas finales ───────────────────────────────────────────────────
    keep = ["fecha", "tipo", "zona", "vendedor"]
    for col in ["promo", "plan_nuevo", "plan", "postventa", "respuesta"]:
        if col in work.columns:
            keep.append(col)

    clean = work[keep].reset_index(drop=True)
    valid = len(clean)

    report = {
        "total_rows": total,
        "valid_rows": valid,
        "excluded_rows": total - valid,
        "reasons": excluded,
        "warnings": warnings_list,
    }
    return clean, report