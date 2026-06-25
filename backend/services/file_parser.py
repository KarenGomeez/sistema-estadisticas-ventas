"""Lectura de archivos: Excel, CSV y PDF.

Este módulo SOLO se encarga de leer y devolver datos crudos (sin limpiar).
La limpieza vive en `data_cleaning.py` y las estadísticas en `stats_service.py`.

Para PDF: cada tabla detectada en cada página se trata como una "hoja" más,
reutilizando el mismo mecanismo de selección que usamos para Excel. Si no se
detecta ninguna tabla, se ofrece una extracción de texto "best effort".
"""
import re
import uuid
from pathlib import Path
from typing import Dict, List

import pandas as pd
import pdfplumber

from ..core.config import UPLOAD_DIR


def save_upload(filename: str, content: bytes) -> tuple[str, Path, str]:
    """Guarda el archivo subido en disco y devuelve (file_id, path, extensión)."""
    ext = Path(filename).suffix.lower()
    file_id = uuid.uuid4().hex
    dest = UPLOAD_DIR / f"{file_id}{ext}"
    dest.write_bytes(content)
    return file_id, dest, ext


def list_sheets(path: Path, ext: str) -> List[Dict]:
    """Devuelve la lista de 'hojas' disponibles para que el usuario elija."""
    if ext in (".xlsx", ".xls"):
        xls = pd.ExcelFile(path)
        return [
            {"sheet_id": name, "name": name, "is_best_effort": False}
            for name in xls.sheet_names
        ]

    if ext == ".csv":
        return [{"sheet_id": "data", "name": "Datos (CSV)", "is_best_effort": False}]

    if ext == ".pdf":
        sheets: List[Dict] = []
        with pdfplumber.open(path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                for t_idx, table in enumerate(tables, start=1):
                    if table and len(table) > 1:
                        sheets.append(
                            {
                                "sheet_id": f"p{page_num}_t{t_idx}",
                                "name": f"Página {page_num}, tabla {t_idx}",
                                "is_best_effort": False,
                            }
                        )
        if not sheets:
            sheets.append(
                {
                    "sheet_id": "best_effort",
                    "name": "Extracción de texto (mejor esfuerzo)",
                    "is_best_effort": True,
                }
            )
        return sheets

    raise ValueError(f"Tipo de archivo no soportado: {ext}")


def read_sheet(path: Path, ext: str, sheet_id: str) -> pd.DataFrame:
    """Lee una hoja/tabla puntual y la devuelve como DataFrame crudo."""
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(path, sheet_name=sheet_id)
        df.columns = [str(c).strip() for c in df.columns]
        return df
    if ext == ".csv":
        return pd.read_csv(path)

    if ext == ".pdf":
        if sheet_id == "best_effort":
            return _read_pdf_best_effort(path)
        return _read_pdf_table(path, sheet_id)

    raise ValueError(f"Tipo de archivo no soportado: {ext}")


def _read_pdf_table(path: Path, sheet_id: str) -> pd.DataFrame:
    match = re.match(r"p(\d+)_t(\d+)$", sheet_id)
    if not match:
        raise ValueError(f"sheet_id inválido para PDF: {sheet_id}")
    page_num, table_num = int(match.group(1)), int(match.group(2))

    with pdfplumber.open(path) as pdf:
        page = pdf.pages[page_num - 1]
        tables = page.extract_tables()
        table = tables[table_num - 1]

    header, *rows = table
    header = [h.strip() if h else f"columna_{i + 1}" for i, h in enumerate(header)]
    return pd.DataFrame(rows, columns=header)


def _read_pdf_best_effort(path: Path) -> pd.DataFrame:
    """Extracción best-effort cuando no se detectan tablas reales.

    Estrategia: en lugar de usar el texto plano (pdfplumber colapsa espacios
    múltiples a uno solo y se pierde la alineación), se usa la posición x/y
    real de cada palabra en la página. Las palabras se agrupan en líneas por
    su coordenada vertical, y dentro de cada línea se cortan columnas nuevas
    cuando el espacio horizontal entre palabras supera un umbral. Esto
    reconstruye razonablemente bien reportes de texto con columnas alineadas
    (como los que genera un sistema viejo o una exportación simple a PDF).
    No funciona para PDFs sin alineación tabular real.
    """
    column_gap_threshold = 10  # puntos; separación típica entre columnas

    rows: List[List[str]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            if not words:
                continue

            lines: Dict[float, List[Dict]] = {}
            for word in words:
                # agrupamos por 'top' redondeado para tolerar pequeñas
                # diferencias de alineación vertical dentro de la misma línea
                key = round(word["top"] / 3) * 3
                lines.setdefault(key, []).append(word)

            for key in sorted(lines.keys()):
                line_words = sorted(lines[key], key=lambda w: w["x0"])
                row = [line_words[0]["text"]]
                prev_x1 = line_words[0]["x1"]
                for word in line_words[1:]:
                    if word["x0"] - prev_x1 > column_gap_threshold:
                        row.append(word["text"])
                    else:
                        row[-1] += " " + word["text"]
                    prev_x1 = word["x1"]
                if len(row) > 1:
                    rows.append(row)

    if not rows:
        return pd.DataFrame()

    max_cols = max(len(r) for r in rows)
    rows = [r + [""] * (max_cols - len(r)) for r in rows]
    columns = [f"columna_{i + 1}" for i in range(max_cols)]
    return pd.DataFrame(rows, columns=columns)
