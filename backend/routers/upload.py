"""Endpoints relacionados a subir el archivo y explorar su contenido."""
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..core.config import ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB
from ..services import file_parser, file_registry

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Extensión no soportada: {ext or '(sin extensión)'}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"El archivo supera el límite de {MAX_FILE_SIZE_MB}MB")

    try:
        file_id, path, ext = file_parser.save_upload(file.filename, content)
        sheets = file_parser.list_sheets(path, ext)
    except Exception as exc:  # noqa: BLE001 - mensaje claro para el usuario
        raise HTTPException(400, f"No se pudo leer el archivo: {exc}") from exc

    file_registry.register(file_id, path, ext)
    return {"file_id": file_id, "file_type": ext.replace(".", ""), "sheets": sheets}


@router.get("/sheets/{file_id}/{sheet_id}/columns")
async def get_columns(file_id: str, sheet_id: str):
    path, ext = _get_file_or_404(file_id)
    try:
        df = file_parser.read_sheet(path, ext, sheet_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"No se pudo leer la hoja seleccionada: {exc}") from exc

    if df.empty:
        raise HTTPException(400, "La hoja/tabla seleccionada no tiene datos legibles")

    preview = df.head(5).fillna("").to_dict("records")
    return {"columns": [str(c) for c in df.columns], "preview": preview}


def _get_file_or_404(file_id: str):
    try:
        return file_registry.get(file_id)
    except KeyError:
        raise HTTPException(404, "Archivo no encontrado, volvé a subirlo") from None
