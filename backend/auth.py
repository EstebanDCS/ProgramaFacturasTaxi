from fastapi import Header, HTTPException, Depends
from config import supabase, ADMIN_EMAILS


async def verificar_usuario(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No hay sesión activa.")
    token = authorization.split(" ")[1]
    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Sesión inválida.")
        email = (res.user.email or "").lower()
        if email not in ADMIN_EMAILS:
            try:
                settings = supabase.table("user_settings") \
                    .select("disabled").eq("user_id", res.user.id).execute()
                if settings.data and len(settings.data) > 0 and settings.data[0].get("disabled"):
                    raise HTTPException(status_code=403, detail="Cuenta desactivada por administrador.")
            except HTTPException:
                raise
            except:
                pass
        return res.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token no válido: {e}")


async def verificar_admin(user=Depends(verificar_usuario)):
    if (user.email or "").lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Solo administradores.")
    return user


def log_actividad(user_id: str, accion: str, meta: str = ""):
    try:
        supabase.table("activity_log").insert({
            "user_id": user_id, "accion": accion, "meta": meta,
        }).execute()
    except Exception:
        pass
