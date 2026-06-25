"""Sistema de autenticación simple con SQLite + bcrypt."""
import sqlite3
from pathlib import Path
from typing import Optional

from passlib.context import CryptContext

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "auth.db"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USUARIOS_INICIALES = [
    ("admin", "admin123", "admin"),
]


def init_db():
    """Crea la tabla de usuarios e inserta los usuarios iniciales si no existen."""
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            rol      TEXT NOT NULL DEFAULT 'usuario'
        )
    """)
    for username, password, rol in USUARIOS_INICIALES:
        exists = cur.execute(
            "SELECT 1 FROM usuarios WHERE username=?", (username,)
        ).fetchone()
        if not exists:
            hashed = pwd_context.hash(password)
            cur.execute(
                "INSERT INTO usuarios (username, password, rol) VALUES (?,?,?)",
                (username, hashed, rol),
            )
    con.commit()
    con.close()


def verify_user(username: str, password: str) -> Optional[dict]:
    """Retorna el usuario si las credenciales son correctas, None si no."""
    con = sqlite3.connect(DB_PATH)
    row = con.execute(
        "SELECT username, password, rol FROM usuarios WHERE username=?",
        (username,)
    ).fetchone()
    con.close()
    if not row:
        return None
    if not pwd_context.verify(password, row[1]):
        return None
    return {"username": row[0], "rol": row[2]}

def list_users() -> list:
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT id, username, rol FROM usuarios").fetchall()
    con.close()
    return [{"id": r[0], "username": r[1], "rol": r[2]} for r in rows]


def create_user(username: str, password: str, rol: str) -> bool:
    try:
        con = sqlite3.connect(DB_PATH)
        hashed = pwd_context.hash(password)
        con.execute("INSERT INTO usuarios (username, password, rol) VALUES (?,?,?)", (username, hashed, rol))
        con.commit()
        con.close()
        return True
    except sqlite3.IntegrityError:
        return False


def change_password(username: str, new_password: str) -> bool:
    hashed = pwd_context.hash(new_password)
    con = sqlite3.connect(DB_PATH)
    cur = con.execute("UPDATE usuarios SET password=? WHERE username=?", (hashed, username))
    con.commit()
    con.close()
    return cur.rowcount > 0


def delete_user(username: str) -> bool:
    con = sqlite3.connect(DB_PATH)
    cur = con.execute("DELETE FROM usuarios WHERE username=?", (username,))
    con.commit()
    con.close()
    return cur.rowcount > 0