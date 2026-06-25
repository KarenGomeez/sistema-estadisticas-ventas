"""Configuración central del proyecto."""
from pathlib import Path

# backend/core/config.py -> sube 3 niveles para llegar a la raíz del proyecto
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE_MB = 20
ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv", ".pdf"}
