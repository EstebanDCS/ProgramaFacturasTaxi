import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from config import supabase, ADMIN_EMAILS, TEMP_DIR
from auth import verificar_usuario, verificar_admin, log_actividad

router = APIRouter()


@router.get("/admin/check")
async def admin_check(user=Depends(verificar_usuario)):
    return {"is_admin": (user.email or "").lower() in ADMIN_EMAILS}


@router.get("/admin/stats")
async def admin_stats(user=Depends(verificar_admin)):
    facturas = supabase.table("facturas") \
        .select("id, user_id, fecha_creacion, plantilla_nombre") \
        .order("fecha_creacion", desc=True).execute().data or []

    plantillas = supabase.table("plantillas") \
        .select("id, user_id, tipo, created_at").execute().data or []

    ahora = datetime.utcnow()
    usuarios_unicos = len(set(f.get("user_id", "") for f in facturas))
    facturas_hoy = [f for f in facturas if f.get("fecha_creacion", "").startswith(ahora.strftime("%Y-%m-%d"))]
    facturas_mes = [f for f in facturas if f.get("fecha_creacion", "").startswith(ahora.strftime("%Y-%m"))]

    uso_plantillas = {}
    for f in facturas:
        p = f.get("plantilla_nombre", "original")
        uso_plantillas[p] = uso_plantillas.get(p, 0) + 1

    dias = {}
    for f in facturas:
        fc = f.get("fecha_creacion", "")
        if len(fc) >= 10:
            dias[fc[:10]] = dias.get(fc[:10], 0) + 1
    dias_ord = sorted(dias.items())[-14:]

    return {
        "total_facturas": len(facturas),
        "total_plantillas": len(plantillas),
        "usuarios_unicos": usuarios_unicos,
        "facturas_hoy": len(facturas_hoy),
        "facturas_este_mes": len(facturas_mes),
        "uso_plantillas": [{"nombre": k, "count": v} for k, v in sorted(uso_plantillas.items(), key=lambda x: -x[1])],
        "facturas_por_dia": [{"dia": d, "count": c} for d, c in dias_ord],
    }


@router.get("/admin/users")
async def admin_users(user=Depends(verificar_admin)):
    facturas = supabase.table("facturas") \
        .select("user_id, fecha_creacion").execute().data or []

    plantillas = supabase.table("plantillas") \
        .select("user_id").execute().data or []

    settings = supabase.table("user_settings") \
        .select("user_id, disabled").execute().data or []
    disabled_map = {s["user_id"]: s["disabled"] for s in settings}

    users = {}
    for f in facturas:
        uid = f.get("user_id", "")
        if uid not in users:
            users[uid] = {"user_id": uid, "facturas": 0, "plantillas": 0, "ultima_actividad": "", "disabled": disabled_map.get(uid, False)}
        users[uid]["facturas"] += 1
        fc = f.get("fecha_creacion", "")
        if fc > users[uid]["ultima_actividad"]:
            users[uid]["ultima_actividad"] = fc

    for p in plantillas:
        uid = p.get("user_id", "")
        if uid in users:
            users[uid]["plantillas"] += 1
        else:
            users[uid] = {"user_id": uid, "facturas": 0, "plantillas": 1, "ultima_actividad": "", "disabled": disabled_map.get(uid, False)}

    return sorted(users.values(), key=lambda x: x["ultima_actividad"], reverse=True)


@router.put("/admin/users/{uid}/toggle")
async def admin_toggle_user(uid: str, user=Depends(verificar_admin)):
    if uid == user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta de administrador.")
    existing = supabase.table("user_settings") \
        .select("disabled").eq("user_id", uid).execute().data
    if existing:
        new_state = not existing[0].get("disabled", False)
        supabase.table("user_settings").update({"disabled": new_state, "updated_at": datetime.utcnow().isoformat()}) \
            .eq("user_id", uid).execute()
    else:
        new_state = True
        supabase.table("user_settings").insert({"user_id": uid, "disabled": True}).execute()
    log_actividad(user.id, "admin_toggle_user", f"target={uid[:8]},disabled={new_state}")
    return {"msg": f"Usuario {'desactivado' if new_state else 'activado'}", "disabled": new_state}


@router.get("/admin/activity")
async def admin_activity(user=Depends(verificar_admin), limit: int = 50):
    res = supabase.table("activity_log") \
        .select("id, user_id, accion, meta, created_at") \
        .order("created_at", desc=True) \
        .limit(limit).execute()
    return res.data


@router.get("/admin/system")
async def admin_system(user=Depends(verificar_admin)):
    facturas_count = len(supabase.table("facturas").select("id").execute().data or [])
    plantillas_count = len(supabase.table("plantillas").select("id").execute().data or [])
    logs_count = len(supabase.table("activity_log").select("id").execute().data or [])

    temp_size = 0
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            fp = os.path.join(TEMP_DIR, f)
            if os.path.isfile(fp):
                temp_size += os.path.getsize(fp)

    return {
        "facturas_en_bd": facturas_count,
        "plantillas_en_bd": plantillas_count,
        "logs_en_bd": logs_count,
        "temp_files_mb": round(temp_size / 1024 / 1024, 2),
        "admin_emails": list(ADMIN_EMAILS),
        "server_time": datetime.utcnow().isoformat(),
    }
