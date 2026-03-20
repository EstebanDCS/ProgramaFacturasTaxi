from datetime import datetime
from fastapi import APIRouter, Depends
from config import supabase
from auth import verificar_usuario

router = APIRouter()


@router.get("/user/stats")
async def user_stats(user=Depends(verificar_usuario)):
    try:
        facturas = supabase.table("facturas") \
            .select("id, fecha_creacion, plantilla_nombre, importe_total") \
            .eq("user_id", user.id).execute().data or []
    except Exception:
        facturas = supabase.table("facturas") \
            .select("id, fecha_creacion, importe_total") \
            .eq("user_id", user.id).execute().data or []

    try:
        plantillas = supabase.table("plantillas") \
            .select("id, nombre, tipo") \
            .eq("user_id", user.id).execute().data or []
    except Exception:
        plantillas = []

    ahora = datetime.utcnow()
    facturas_mes = [f for f in facturas if f.get("fecha_creacion", "").startswith(ahora.strftime("%Y-%m"))]

    por_plantilla = {}
    for f in facturas:
        p = f.get("plantilla_nombre", "original")
        if p not in por_plantilla:
            por_plantilla[p] = {"count": 0, "importe": 0}
        por_plantilla[p]["count"] += 1
        por_plantilla[p]["importe"] += f.get("importe_total", 0)

    meses = {}
    for f in facturas:
        fc = f.get("fecha_creacion", "")
        if len(fc) >= 7:
            mk = fc[:7]
            meses[mk] = meses.get(mk, 0) + 1
    meses_ord = sorted(meses.items())[-6:]

    return {
        "total_facturas": len(facturas),
        "total_importe": round(sum(f.get("importe_total", 0) for f in facturas), 2),
        "facturas_este_mes": len(facturas_mes),
        "total_plantillas": len(plantillas),
        "por_plantilla": [{"nombre": k, **v} for k, v in por_plantilla.items()],
        "facturas_por_mes": [{"mes": m, "count": c} for m, c in meses_ord],
    }
