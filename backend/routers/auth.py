"""Endpoints de autenticación: login y logout."""
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from ..core.auth import verify_user, list_users, create_user, change_password, delete_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest, response: Response):
    user = verify_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    response.set_cookie(
        key="session_user",
        value=user["username"],
        httponly=True,
        max_age=60 * 60 * 8,  # 8 horas
        samesite="lax",
    )
    response.set_cookie(
        key="session_rol",
        value=user["rol"],
        httponly=True,
        max_age=60 * 60 * 8,
        samesite="lax",
    )
    return {"username": user["username"], "rol": user["rol"]}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session_user")
    response.delete_cookie("session_rol")
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    username = request.cookies.get("session_user")
    rol = request.cookies.get("session_rol")
    if not username:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {"username": username, "rol": rol}

@router.get("/users")
async def get_users(request: Request):
    rol = request.cookies.get("session_rol")
    if rol != "admin":
        raise HTTPException(403, "Solo administradores")
    return list_users()


class CreateUserRequest(BaseModel):
    username: str
    password: str
    rol: str = "usuario"

@router.post("/users")
async def post_create_user(payload: CreateUserRequest, request: Request):
    rol = request.cookies.get("session_rol")
    if rol != "admin":
        raise HTTPException(403, "Solo administradores")
    if not payload.username or not payload.password:
        raise HTTPException(400, "Usuario y contraseña requeridos")
    ok = create_user(payload.username, payload.password, payload.rol)
    if not ok:
        raise HTTPException(400, "El usuario ya existe")
    return {"ok": True}


class ChangePasswordRequest(BaseModel):
    username: str
    new_password: str

@router.put("/users/password")
async def put_change_password(payload: ChangePasswordRequest, request: Request):
    rol = request.cookies.get("session_rol")
    if rol != "admin":
        raise HTTPException(403, "Solo administradores")
    ok = change_password(payload.username, payload.new_password)
    if not ok:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True}


@router.delete("/users/{username}")
async def delete_user_endpoint(username: str, request: Request):
    rol = request.cookies.get("session_rol")
    if rol != "admin":
        raise HTTPException(403, "Solo administradores")
    if username == "admin":
        raise HTTPException(400, "No se puede eliminar el usuario admin")
    current = request.cookies.get("session_user")
    if username == current:
        raise HTTPException(400, "No podés eliminarte a vos mismo")
    ok = delete_user(username)
    if not ok:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True}