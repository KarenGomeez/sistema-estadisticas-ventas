"""Esquemas Pydantic usados por los routers."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SheetInfo(BaseModel):
    sheet_id: str
    name: str
    is_best_effort: bool = False


class UploadResponse(BaseModel):
    file_id: str
    file_type: str
    sheets: List[SheetInfo]


class ColumnsResponse(BaseModel):
    columns: List[str]
    preview: List[Dict[str, Any]]


class AnalyzeRequest(BaseModel):
    file_id: str
    sheet_id: str
    date_column: str
    tipo_column: str          # "Agendar como"
    zona_column: Optional[str] = None    # "Zona"
    vendedor_column: Optional[str] = None  # "Vendedor"
    promo_column: Optional[str] = None   # "Promoción (Instalación)"
    plan_nuevo_column: Optional[str] = None  # "Plan Nuevo"
    postventa_column: Optional[str] = None
    respuesta_column: Optional[str] = None
    
class PostventaRequest(BaseModel):
    file_id: str
    sheet_id: str
    postventa_column: str
    respuesta_column: Optional[str] = None
    date_column: Optional[str] = None
    tipo_column: Optional[str] = None
    zona_column: Optional[str] = None
    vendedor_column: Optional[str] = None

class CleaningReport(BaseModel):
    total_rows: int
    valid_rows: int
    excluded_rows: int
    reasons: Dict[str, int]
