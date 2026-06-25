"""Punto de entrada de la aplicación."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import analysis, upload, export, auth
from .core.auth import init_db

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="Sistema de estadísticas de ventas")

# Inicializar DB de usuarios al arrancar
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(upload.router)
app.include_router(analysis.router)
app.include_router(export.router)
app.include_router(auth.router)

app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

@app.get("/favicon.svg")
async def favicon():
    return FileResponse(FRONTEND_DIR / "favicon.svg")

@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")