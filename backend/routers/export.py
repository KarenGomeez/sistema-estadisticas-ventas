"""Endpoint de exportación a Excel."""
import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import pandas as pd

from ..models.schemas import AnalyzeRequest
from ..services import data_cleaning, file_parser, file_registry, stats_service

router = APIRouter(prefix="/api", tags=["export"])


@router.post("/export/excel")
async def export_excel(payload: AnalyzeRequest):
    try:
        path, ext = file_registry.get(payload.file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None

    try:
        raw_df = file_parser.read_sheet(path, ext, payload.sheet_id)
    except Exception as exc:
        raise HTTPException(400, f"No se pudo leer la hoja: {exc}") from exc

    clean_df, report = data_cleaning.clean_data(
        raw_df,
        date_col=payload.date_column,
        tipo_col=payload.tipo_column,
        zona_col=payload.zona_column,
        vendedor_col=payload.vendedor_column,
        promo_col=payload.promo_column,
        plan_nuevo_col=payload.plan_nuevo_column,
    )

    if clean_df.empty:
        raise HTTPException(400, "No quedaron filas válidas")

    # ── construir resúmenes ──────────────────────────────────────────
    resumen_mensual = pd.DataFrame(stats_service.resumen_mensual(clean_df))
    resumen_tipo    = pd.DataFrame(stats_service.trabajos_totales_por_tipo(clean_df))
    resumen_zona    = pd.DataFrame(stats_service.zona_totales(clean_df))
    resumen_vend    = pd.DataFrame(stats_service.vendedor_totales(clean_df))
    proyecciones    = stats_service.proyecciones(clean_df)
    df_proy = pd.DataFrame([{
        'Próxima semana': proyecciones['semana'],
        'Próximo mes':    proyecciones['mes'],
        'Próximo año':    proyecciones['anio'],
        'Tendencia':      proyecciones['tendencia'],
    }])

    # ── escribir xlsx en memoria ─────────────────────────────────────
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        # hoja 1: datos limpios
        export_df = clean_df.copy()
        export_df['fecha'] = export_df['fecha'].astype(str)
        export_df.to_excel(writer, sheet_name='Datos limpios', index=False)

        # hoja 2: resumen mensual
        resumen_mensual.to_excel(writer, sheet_name='Resumen mensual', index=False)

        # hoja 3: por tipo
        resumen_tipo.rename(columns={'valor': 'Tipo', 'cantidad': 'Total'}, inplace=True)
        resumen_tipo.to_excel(writer, sheet_name='Por tipo', index=False)

        # hoja 4: por zona
        resumen_zona.rename(columns={'valor': 'Zona', 'cantidad': 'Total'}, inplace=True)
        resumen_zona.to_excel(writer, sheet_name='Por zona', index=False)

        # hoja 5: por vendedor
        resumen_vend.rename(columns={'valor': 'Vendedor', 'cantidad': 'Total'}, inplace=True)
        resumen_vend.to_excel(writer, sheet_name='Por vendedor', index=False)

        # hoja 6: proyecciones
        df_proy.to_excel(writer, sheet_name='Proyecciones', index=False)

    buf.seek(0)
    headers = {'Content-Disposition': 'attachment; filename="estadisticas_agenda.xlsx"'}
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers=headers,
    )