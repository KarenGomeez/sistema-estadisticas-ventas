"""Registro en memoria de los archivos subidos durante la sesión del servidor.

Nota de diseño: para un proyecto de portfolio, mantener esto en memoria es
suficiente y mantiene el código simple. En un sistema productivo real, esto
se reemplazaría por una tabla en base de datos o un almacenamiento de sesión,
ya que este registro se pierde si el servidor se reinicia.
"""
from pathlib import Path
from typing import Dict, Tuple

_FILES: Dict[str, Tuple[Path, str]] = {}


def register(file_id: str, path: Path, ext: str) -> None:
    _FILES[file_id] = (path, ext)


def get(file_id: str) -> Tuple[Path, str]:
    if file_id not in _FILES:
        raise KeyError(file_id)
    return _FILES[file_id]
