"""Endpoint que limpia los datos seleccionados y calcula las estadísticas."""
from fastapi import APIRouter, HTTPException

from ..models.schemas import AnalyzeRequest, PostventaRequest
from ..services import data_cleaning, file_parser, file_registry, stats_service
import pandas as pd
from fastapi.responses import StreamingResponse
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/analyze")
async def analyze(payload: AnalyzeRequest):
    try:
        path, ext = file_registry.get(payload.file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    try:
        raw_df = file_parser.read_sheet(path, ext, payload.sheet_id)
    except Exception as exc:
        raise HTTPException(400, f"No se pudo leer la hoja seleccionada: {exc}") from exc

    columnas_obligatorias = [payload.date_column, payload.tipo_column]
    columnas_opcionales = [payload.zona_column, payload.vendedor_column]

    for col in columnas_obligatorias:
        if col not in raw_df.columns:
            raise HTTPException(400, f"La columna '{col}' no existe en la hoja seleccionada")

    for col in columnas_opcionales:
        if col and col not in raw_df.columns:
            raise HTTPException(400, f"La columna '{col}' no existe en la hoja seleccionada")

    clean_df, report = data_cleaning.clean_data(
        raw_df,
        date_col=payload.date_column,
        tipo_col=payload.tipo_column,
        zona_col=payload.zona_column,
        vendedor_col=payload.vendedor_column,
        promo_col=payload.promo_column,
        plan_nuevo_col=payload.plan_nuevo_column,
        postventa_col=getattr(payload, "postventa_column", None),
        respuesta_col=getattr(payload, "respuesta_column", None),
    )

    if clean_df.empty:
        raise HTTPException(400, "No quedaron filas válidas después de la limpieza de datos")

    try:
        raw_bajas = file_parser.read_sheet(path, ext, 'Bajas')
    except Exception:
        raw_bajas = pd.DataFrame()

    raw_bajas['fecha_baja'] = pd.to_datetime(raw_bajas.iloc[:, 2], errors='coerce') if not raw_bajas.empty else None

    return {
        "cleaning_report": report,
        "resumen_mensual": stats_service.resumen_mensual(clean_df),
        "trabajos_por_mes": stats_service.trabajos_por_mes(clean_df),
        "trabajos_totales_por_tipo": stats_service.trabajos_totales_por_tipo(clean_df),
        "trabajos_por_zona": stats_service.trabajos_por_zona(clean_df),
        "zona_totales": stats_service.zona_totales(clean_df),
        "trabajos_por_vendedor": stats_service.trabajos_por_vendedor(clean_df),
        "vendedor_totales": stats_service.vendedor_totales(clean_df),
        "top_promociones": stats_service.top_promociones(clean_df),
        "promo_por_mes": stats_service.promo_por_mes(clean_df),
        "top_planes_nuevos": stats_service.top_planes_nuevos(clean_df),
        "proyecciones": stats_service.proyecciones(clean_df),
        "ventas_vs_bajas": stats_service.ventas_vs_bajas_por_mes(clean_df, raw_bajas) if not raw_bajas.empty else [],
        "riesgos": stats_service.riesgos(clean_df, raw_bajas) if not raw_bajas.empty else {},
        "registros": clean_df.fillna("").astype(str).to_dict("records"),
    }

@router.post("/postventa")
async def analyze_postventa(payload: PostventaRequest):
    try:
        path, ext = file_registry.get(payload.file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    try:
        raw_df = file_parser.read_sheet(path, ext, payload.sheet_id)
    except Exception as exc:
        raise HTTPException(400, f"No se pudo leer la hoja: {exc}") from exc

    if payload.postventa_column not in raw_df.columns:
        raise HTTPException(400, f"La columna '{payload.postventa_column}' no existe")

    df = raw_df.copy()
    df["postventa"] = df[payload.postventa_column].astype(str).str.strip().str.lower()

    # Mapear columnas originales
    if payload.date_column and payload.date_column in df.columns:
        df["fecha"] = pd.to_datetime(df[payload.date_column], errors="coerce").dt.strftime("%Y-%m-%d")
    if payload.tipo_column and payload.tipo_column in df.columns:
        df["tipo"] = df[payload.tipo_column].astype(str).str.strip().str.title()
    if payload.zona_column and payload.zona_column in df.columns:
        df["zona"] = df[payload.zona_column].astype(str)
    if payload.vendedor_column and payload.vendedor_column in df.columns:
        df["vendedor"] = df[payload.vendedor_column].astype(str)
    

    if payload.respuesta_column and payload.respuesta_column in df.columns:
        df["respuesta"] = df[payload.respuesta_column].astype(str).str.strip()
        df["respuesta"] = df["respuesta"].replace({"nan": "", "none": "", "None": ""})
    else:
        df["respuesta"] = ""

    contactados = df[df["postventa"].isin(["true", "verdadero", "1", "sí", "si", "yes", "1.0"])]
    total = len(df)

    registros = contactados[contactados["respuesta"].str.len() > 0].copy()
    cols = ["respuesta"]
    for c in ["fecha", "tipo", "zona", "vendedor"]:
        if c in df.columns:
            cols = [c] + cols if c != "respuesta" else cols
    # armar columnas disponibles
    # Copiar columnas originales del payload si existen
    for col_orig, col_dest in [
        (payload.postventa_column, None),  # ya procesada
    ]:
        pass

    # Intentar traer fecha, zona, vendedor del raw_df
    for orig, dest in [("fecha", "fecha"), ("Fecha", "fecha"),
                       ("zona", "zona"), ("Zona", "zona"),
                       ("vendedor", "vendedor"), ("Vendedor", "vendedor"),
                       ("tipo", "tipo"), ("Tipo", "tipo")]:
        if orig in df.columns and dest not in df.columns:
            df[dest] = df[orig].astype(str)

    available = [c for c in ["fecha", "tipo", "zona", "vendedor", "respuesta"] if c in registros.columns]
    registros = registros[available].fillna("").astype(str).to_dict("records")

    return {
        "total": total,
        "contactados": len(contactados),
        "no_contactados": total - len(contactados),
        "pct_contactados": round(len(contactados) / total * 100, 1) if total > 0 else 0,
        "registros": registros,
    }

@router.post("/export")
async def export_excel(payload: AnalyzeRequest):
    try:
        path, ext = file_registry.get(payload.file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    raw_df = file_parser.read_sheet(path, ext, payload.sheet_id)
    clean_df, report = data_cleaning.clean_data(
        raw_df,
        date_col=payload.date_column,
        tipo_col=payload.tipo_column,
        zona_col=payload.zona_column,
        vendedor_col=payload.vendedor_column,
        promo_col=payload.promo_column,
        plan_nuevo_col=payload.plan_nuevo_column,
    )

    try:
        raw_bajas = file_parser.read_sheet(path, ext, 'Bajas')
    except Exception:
        raw_bajas = pd.DataFrame()

    proy = stats_service.proyecciones(clean_df)
    resumen = stats_service.resumen_mensual(clean_df)
    vendedores = stats_service.vendedor_totales(clean_df)
    tipos = stats_service.trabajos_totales_por_tipo(clean_df)
    zonas = stats_service.zona_totales(clean_df)
    tasa_baja = 0
    if not raw_bajas.empty:
        try:
            riesgos = stats_service.riesgos(clean_df, raw_bajas)
            tasa_baja = riesgos.get("tasa_baja_promedio", 0)
        except Exception:
            tasa_baja = 0

    wb = Workbook()

    # ── Estilos ──────────────────────────────────────────────
    header_font    = Font(bold=True, color="FFFFFF")
    header_fill    = PatternFill("solid", fgColor="4F46E5")
    subheader_font = Font(bold=True)
    center         = Alignment(horizontal="center")

    def style_header_row(ws, row=1):
        for cell in ws[row]:
            cell.font      = header_font
            cell.fill      = header_fill
            cell.alignment = center

    def autofit(ws):
        for col in ws.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 50)

    # ── Hoja 1: Resumen general ───────────────────────────────
    ws1 = wb.active
    ws1.title = "Resumen General"
    ws1.append(["Indicador", "Valor"])
    style_header_row(ws1)
    ws1.append(["Total registros",      report["total_rows"]])
    ws1.append(["Registros válidos",    report["valid_rows"]])
    ws1.append(["Registros excluidos",  report["excluded_rows"]])
    ws1.append([])
    ws1.append(["Proyección semanal",   proy.get("semana", "—")])
    ws1.append(["Proyección mensual",   proy.get("mes", "—")])
    ws1.append(["Proyección anual",     proy.get("anio", "—")])
    ws1.append(["Promedio mensual",     proy.get("promedio_mensual", "—")])
    ws1.append(["Tendencia",            proy.get("tendencia", "—")])
    ws1.append([])
    ws1.append(["Tasa de baja promedio (%)", tasa_baja])
    for row in ws1.iter_rows(min_row=2):
        row[0].font = subheader_font
    autofit(ws1)

    # ── Hoja 2: Agenda completa ───────────────────────────────
    ws2 = wb.create_sheet("Agenda Completa")
    cols2 = [c for c in ["fecha", "tipo", "zona", "vendedor", "promo", "plan_nuevo"] if c in clean_df.columns]
    ws2.append([c.replace("_", " ").title() for c in cols2])
    style_header_row(ws2)
    for _, row in clean_df[cols2].iterrows():
        ws2.append([str(row[c]) if pd.notna(row[c]) else "" for c in cols2])
    autofit(ws2)

    # ── Hoja 3: Por mes ───────────────────────────────────────
    ws3 = wb.create_sheet("Por Mes")
    ws3.append(["Mes", "Total trabajos"])
    style_header_row(ws3)
    for r in resumen:
        ws3.append([r["mes"], r["total"]])
    autofit(ws3)

    # ── Hoja 4: Por vendedor ──────────────────────────────────
    ws4 = wb.create_sheet("Por Vendedor")
    ws4.append(["Vendedor", "Total trabajos"])
    style_header_row(ws4)
    for r in vendedores:
        ws4.append([r["valor"], r["cantidad"]])
    autofit(ws4)

    # ── Hoja 5: Por tipo ──────────────────────────────────────
    ws5 = wb.create_sheet("Por Tipo")
    ws5.append(["Tipo", "Total"])
    style_header_row(ws5)
    for r in tipos:
        ws5.append([r["valor"], r["cantidad"]])
    autofit(ws5)

    # ── Hoja 6: Por zona ──────────────────────────────────────
    ws6 = wb.create_sheet("Por Zona")
    ws6.append(["Zona", "Total trabajos"])
    style_header_row(ws6)
    for r in zonas:
        ws6.append([r["valor"], r["cantidad"]])
    autofit(ws6)

    # ── Devolver archivo ──────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=reporte_ventas.xlsx"}
    )
@router.get("/clientes")
async def get_clientes(file_id: str):
    """Devuelve la lista de clientes de la hoja Agendaa (o Agenda)."""
    try:
        path, ext = file_registry.get(file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    df = None
    for sheet_name in ["Agendaa", "Agenda", "agendaa", "agenda"]:
        try:
            df = file_parser.read_sheet(path, ext, sheet_name)
            break
        except Exception:
            continue

    if df is None or df.empty:
        raise HTTPException(404, "No se encontró la hoja de Agenda en el archivo")

    def find_col(candidates):
        for c in candidates:
            for col in df.columns:
                if col.strip().lower() == c.lower():
                    return col
        return None

    col_nombre    = find_col(["Nombre y Apellido (Completo)", "Nombre y Apellido"])
    col_dni       = find_col(["DNI ", "DNI", "dni"])
    col_codigo    = find_col(["Código", "Codigo", "código", "codigo"])
    col_agendar   = find_col(["Agendar como", "agendar como"])
    col_fecha     = find_col(["Fecha de turno", "Fecha", "Marca temporal"])
    col_vendedor  = find_col(["Vendedor ", "Vendedor", "vendedor"])
    col_zona      = find_col(["Zona", "zona"])
    col_situacion = find_col(["Situación ", "Situacion", "situación", "situacion"])

    registros = []
    for _, row in df.iterrows():
        r = {}
        r["nombre"]    = str(row[col_nombre]).strip()    if col_nombre    and pd.notna(row[col_nombre])    else ""
        r["dni"]       = str(row[col_dni]).strip()       if col_dni       and pd.notna(row[col_dni])       else ""
        r["codigo"]    = str(row[col_codigo]).strip()    if col_codigo    and pd.notna(row[col_codigo])    else ""
        r["agendar"]   = str(row[col_agendar]).strip()   if col_agendar   and pd.notna(row[col_agendar])   else ""
        r["vendedor"]  = str(row[col_vendedor]).strip()  if col_vendedor  and pd.notna(row[col_vendedor])  else ""
        r["zona"]      = str(row[col_zona]).strip()      if col_zona      and pd.notna(row[col_zona])      else ""
        r["situacion"] = str(row[col_situacion]).strip() if col_situacion and pd.notna(row[col_situacion]) else ""

        if col_fecha and pd.notna(row[col_fecha]):
            try:
                r["fecha"] = pd.to_datetime(row[col_fecha]).strftime("%Y-%m-%d")
            except Exception:
                r["fecha"] = str(row[col_fecha]).strip()
        else:
            r["fecha"] = ""

        for k in r:
            if r[k].lower() in ("nan", "none", "nat"):
                r[k] = ""
        if r["codigo"].endswith(".0"):
            r["codigo"] = r["codigo"][:-2]
        if r["dni"].endswith(".0"):
            r["dni"] = r["dni"][:-2]

        if r["nombre"] or r["codigo"]:
            registros.append(r)

    return {"total": len(registros), "registros": registros}

@router.get("/bajas")
async def get_bajas(file_id: str):
    """Devuelve estadísticas completas de la hoja Bajas."""
    try:
        path, ext = file_registry.get(file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    try:
        raw_bajas = file_parser.read_sheet(path, ext, 'Bajas')
    except Exception:
        raise HTTPException(404, "No se encontró la hoja 'Bajas' en el archivo")

    if raw_bajas.empty:
        raise HTTPException(400, "La hoja Bajas está vacía")

    return {
        "bajas_por_mes": stats_service.bajas_por_mes(raw_bajas),
        "bajas_por_motivo": stats_service.bajas_por_motivo(raw_bajas),
    }


@router.post("/bajas/comparacion")
async def comparacion_bajas(payload: AnalyzeRequest):
    """Compara ventas vs bajas mes a mes."""
    try:
        path, ext = file_registry.get(payload.file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado") from None

    raw_df = file_parser.read_sheet(path, ext, payload.sheet_id)
    clean_df, _ = data_cleaning.clean_data(
        raw_df,
        date_col=payload.date_column,
        tipo_col=payload.tipo_column,
        zona_col=payload.zona_column,
        vendedor_col=payload.vendedor_column,
        promo_col=payload.promo_column,
        plan_nuevo_col=payload.plan_nuevo_column,
    )

    try:
        raw_bajas = file_parser.read_sheet(path, ext, 'Bajas')
    except Exception:
        raise HTTPException(404, "No se encontró la hoja 'Bajas'")

    return {
        "comparacion": stats_service.comparacion_ventas_bajas(clean_df, raw_bajas),
        "bajas_por_mes": stats_service.bajas_por_mes(raw_bajas),
        "bajas_por_motivo": stats_service.bajas_por_motivo(raw_bajas),
    }
