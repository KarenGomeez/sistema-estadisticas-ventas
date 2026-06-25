"""Cálculo de estadísticas sobre el DataFrame de agenda."""
from typing import Dict, List
import pandas as pd


# ─── helpers ────────────────────────────────────────────────────────────────

def _mes_str(series: pd.Series) -> pd.Series:
    return series.dt.to_period("M").astype(str)


def _safe_counts(df: pd.DataFrame, col: str) -> List[Dict]:
    if col not in df.columns or df[col].dropna().empty:
        return []
    return (
        df[col].value_counts().reset_index()
        .rename(columns={col: "valor", "count": "cantidad"})
        .to_dict("records")
    )


def _normalizar_motivo(texto: str) -> str:
    if not isinstance(texto, str) or texto.strip() == "" or texto.strip().lower() in ["nan", "none"]:
        return "Sin especificar"
    t = texto.lower().strip()
    if any(p in t for p in ["muda", "traslada", "va a vivir", "se fue", "vive", "domicilio"]):
        return "Mudanza"
    if any(p in t for p in ["judicial", "judiaial"]):
        return "Judicial"
    if any(p in t for p in ["econom", "precio", "pagar", "costo", "gasto", "$$", "reduccion"]):
        return "Económico"
    if any(p in t for p in ["fallec", "murio", "muerte", "fallecimiento"]):
        return "Fallecimiento"
    if any(p in t for p in ["cerro", "cierra", "local", "negocio", "empresa", "dueño"]):
        return "Cierre de negocio"
    if any(p in t for p in ["starlink", "gigared", "otro servicio", "cambio de serv", "contrato otro"]):
        return "Cambio de proveedor"
    return "Otro"


def _limpiar_bajas(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    work["fecha_baja"] = pd.to_datetime(work.iloc[:, 2], errors="coerce")
    work = work[work["fecha_baja"].notna()]
    work = work[work["fecha_baja"].dt.year >= 2024]
    work["concretado"] = work.iloc[:, 0].astype(str).str.strip().str.lower().isin(["true", "1", "sí", "si", "yes"])
    motivo_col = "Motivo" if "Motivo" in work.columns else work.columns[15] if work.shape[1] > 15 else None
    work["motivo"] = work[motivo_col].apply(_normalizar_motivo) if motivo_col else "Sin especificar"
    return work.reset_index(drop=True)


# ─── agenda ─────────────────────────────────────────────────────────────────

def trabajos_por_mes(df: pd.DataFrame) -> List[Dict]:
    work = df.copy()
    work["mes"] = _mes_str(work["fecha"])
    return work.groupby(["mes", "tipo"]).size().reset_index(name="cantidad").to_dict("records")


def trabajos_totales_por_tipo(df: pd.DataFrame) -> List[Dict]:
    return _safe_counts(df, "tipo")


def trabajos_por_zona(df: pd.DataFrame) -> List[Dict]:
    return df.groupby(["zona", "tipo"]).size().reset_index(name="cantidad").to_dict("records")


def zona_totales(df: pd.DataFrame) -> List[Dict]:
    return _safe_counts(df, "zona")


def trabajos_por_vendedor(df: pd.DataFrame) -> List[Dict]:
    return df.groupby(["vendedor", "tipo"]).size().reset_index(name="cantidad").to_dict("records")


def vendedor_totales(df: pd.DataFrame) -> List[Dict]:
    return _safe_counts(df, "vendedor")


def top_promociones(df: pd.DataFrame) -> List[Dict]:
    if "promo" not in df.columns:
        return []
    instalaciones = df[df["tipo"].str.lower().str.contains("instalac", na=False)]
    return _safe_counts(instalaciones, "promo")


def promo_por_mes(df: pd.DataFrame) -> List[Dict]:
    if "promo" not in df.columns:
        return []
    inst = df[df["tipo"].str.lower().str.contains("instalac", na=False)].copy()
    inst["mes"] = _mes_str(inst["fecha"])
    return inst.groupby(["mes", "promo"]).size().reset_index(name="cantidad").to_dict("records")


def top_planes_nuevos(df: pd.DataFrame) -> List[Dict]:
    if "plan" not in df.columns:
        return []
    d = df.copy()
    d["plan"] = d["plan"].astype(str).str.strip().str.upper()
    d["plan"] = d["plan"].replace({"NAN": pd.NA, "NONE": pd.NA, "": pd.NA})
    return _safe_counts(d, "plan")


def resumen_mensual(df: pd.DataFrame) -> List[Dict]:
    work = df.copy()
    work["mes"] = _mes_str(work["fecha"])
    return work.groupby("mes").size().reset_index(name="total").to_dict("records")


def proyecciones(df: pd.DataFrame) -> Dict:
    df = df.copy()
    df["mes"] = _mes_str(df["fecha"])
    por_mes = df.groupby("mes").size()

    if len(por_mes) == 0:
        return {}

    promedio_3m = round(float(por_mes.tail(3).mean()), 1)
    mes_actual = int(por_mes.iloc[-1]) if len(por_mes) >= 1 else 0
    mes_anterior = int(por_mes.iloc[-2]) if len(por_mes) >= 2 else 0
    variacion_mom = mes_actual - mes_anterior
    variacion_pct = round((variacion_mom / mes_anterior * 100), 1) if mes_anterior > 0 else 0
    tendencia = int(por_mes.iloc[-1] - por_mes.iloc[-3]) if len(por_mes) >= 3 else 0

    return {
        "semana": round(promedio_3m / 4),
        "mes": round(promedio_3m),
        "anio": round(promedio_3m * 12),
        "tendencia": tendencia,
        "promedio_mensual": promedio_3m,
        "mes_actual": mes_actual,
        "mes_anterior": mes_anterior,
        "variacion_mom": variacion_mom,
        "variacion_pct": variacion_pct,
        "nombre_mes_actual": str(por_mes.index[-1]) if len(por_mes) >= 1 else "",
        "nombre_mes_anterior": str(por_mes.index[-2]) if len(por_mes) >= 2 else "",
    }


def riesgos(df_agenda: pd.DataFrame, df_bajas: pd.DataFrame) -> Dict:
    df_a = df_agenda.copy()
    df_b = _limpiar_bajas(df_bajas) if not df_bajas.empty else pd.DataFrame()

    df_a["mes"] = _mes_str(df_a["fecha"])
    tasa_promedio = 0.0
    if not df_b.empty:
        df_b["mes"] = df_b["fecha_baja"].dt.to_period("M").astype(str)
        ventas_m = df_a.groupby("mes").size()
        bajas_m = df_b.groupby("mes").size()
        tasas = (bajas_m / ventas_m).dropna()
        tasa_promedio = round(float(tasas.mean() * 100), 1) if len(tasas) > 0 else 0.0

    zona = df_a.groupby("zona").size().sort_values() if "zona" in df_a.columns else pd.Series(dtype=int)
    zona_riesgo = zona.index[0] if len(zona) > 0 else "-"
    zona_riesgo_cant = int(zona.iloc[0]) if len(zona) > 0 else 0
    zona_total = int(zona.sum()) if len(zona) > 0 else 1
    zona_pct = round(zona_riesgo_cant / zona_total * 100, 1)

    vendedor = df_a.groupby("vendedor").size().sort_values(ascending=False) if "vendedor" in df_a.columns else pd.Series(dtype=int)
    total = len(df_a)
    top2 = vendedor.head(2)
    concentracion = round(top2.sum() / total * 100, 1) if total > 0 else 0
    top2_nombres = " y ".join(top2.index.tolist())

    return {
        "tasa_baja_promedio": tasa_promedio,
        "tasa_baja_explicacion": f"Por cada 100 ventas, {tasa_promedio} clientes se dan de baja en promedio",
        "zona_riesgo": zona_riesgo,
        "zona_riesgo_cant": zona_riesgo_cant,
        "zona_riesgo_pct": zona_pct,
        "zona_explicacion": f"La zona {zona_riesgo} registra la menor actividad ({zona_riesgo_cant} trabajos, {zona_pct}% del total)",
        "concentracion_pct": concentracion,
        "top2_vendedores": top2_nombres,
        "concentracion_explicacion": f"{top2_nombres} concentran el {concentracion}% de todas las ventas",
    }


# ─── bajas ──────────────────────────────────────────────────────────────────

def bajas_por_mes(df_bajas: pd.DataFrame) -> List[Dict]:
    df = _limpiar_bajas(df_bajas)
    df["mes"] = df["fecha_baja"].dt.to_period("M").astype(str)
    result = df.groupby("mes").agg(total=("mes", "count"), concretadas=("concretado", "sum")).reset_index()
    result["concretadas"] = result["concretadas"].astype(int)
    return result.to_dict("records")


def bajas_por_motivo(df_bajas: pd.DataFrame) -> List[Dict]:
    df = _limpiar_bajas(df_bajas)
    counts = df["motivo"].value_counts().reset_index()
    counts.columns = ["motivo", "cantidad"]
    return counts.to_dict("records")


def comparacion_ventas_bajas(df_agenda: pd.DataFrame, df_bajas: pd.DataFrame) -> List[Dict]:
    df_a = df_agenda.copy()
    df_a["mes"] = _mes_str(df_a["fecha"])
    ventas = df_a.groupby("mes").size().reset_index(name="ventas")

    df_b = _limpiar_bajas(df_bajas)
    df_b["mes"] = df_b["fecha_baja"].dt.to_period("M").astype(str)
    bajas = df_b.groupby("mes").size().reset_index(name="bajas")

    merged = ventas.merge(bajas, on="mes", how="left").fillna(0)
    merged["ventas"] = merged["ventas"].astype(int)
    merged["bajas"] = merged["bajas"].astype(int)
    merged["neto"] = merged["ventas"] - merged["bajas"]
    merged["tasa_baja_pct"] = (merged["bajas"] / merged["ventas"].replace(0, 1) * 100).round(1)
    return merged.sort_values("mes").to_dict("records")


def resumen_postventa(df: pd.DataFrame) -> dict:
    if "postventa" not in df.columns:
        return {}
    total = len(df)
    contactados = df[df["postventa"].isin(["true", "verdadero", "1", "sí", "si", "yes"])]
    registros = []
    if "respuesta" in df.columns:
        con_resp = contactados[contactados["respuesta"].notna() & (contactados["respuesta"] != "")]
        registros = con_resp[["fecha", "tipo", "zona", "vendedor", "respuesta"]].fillna("").astype(str).to_dict("records")
    return {
        "total": total,
        "contactados": len(contactados),
        "no_contactados": total - len(contactados),
        "pct_contactados": round(len(contactados) / total * 100, 1) if total > 0 else 0,
        "registros": registros,
    }


def ventas_vs_bajas_por_mes(df_agenda: pd.DataFrame, df_bajas: pd.DataFrame) -> List[Dict]:
    return comparacion_ventas_bajas(df_agenda, df_bajas)
