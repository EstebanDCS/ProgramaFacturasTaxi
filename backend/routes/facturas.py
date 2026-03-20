import json
from fastapi import APIRouter, Depends, HTTPException
from config import supabase
from auth import verificar_usuario, log_actividad
from models import DatosFactura
from utils import datos_registro
from generador import procesar_descarga

router = APIRouter()


@router.get("/historial")
async def historial(user=Depends(verificar_usuario)):
    try:
        res = supabase.table("facturas") \
            .select("id, numero_factura, barco, importe_total, fecha_creacion, plantilla_nombre") \
            .eq("user_id", user.id).order("fecha_creacion", desc=True).execute()
    except Exception:
        res = supabase.table("facturas") \
            .select("id, numero_factura, barco, importe_total, fecha_creacion") \
            .eq("user_id", user.id).order("fecha_creacion", desc=True).execute()
    return res.data


@router.post("/solo-guardar")
async def solo_guardar(datos: DatosFactura, user=Depends(verificar_usuario)):
    supabase.table("facturas").insert(datos_registro(user.id, datos)).execute()
    log_actividad(user.id, "guardar_factura", "plantilla=original")
    return {"msg": "Datos guardados en la nube"}


@router.post("/generar")
async def generar(datos: DatosFactura, formato: str = "excel", user=Depends(verificar_usuario)):
    supabase.table("facturas").insert(datos_registro(user.id, datos)).execute()
    log_actividad(user.id, "generar_factura", f"formato={formato},plantilla=original")
    return procesar_descarga(datos.dict(), formato)


@router.get("/factura/{f_id}")
async def get_factura(f_id: int, user=Depends(verificar_usuario)):
    res = supabase.table("facturas").select("datos_json") \
        .eq("id", f_id).eq("user_id", user.id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    raw = res.data["datos_json"]
    if raw.startswith("ENC:"):
        return {"datos_json_cifrado": raw}
    return json.loads(raw)


@router.put("/actualizar/{f_id}")
async def actualizar(f_id: int, datos: DatosFactura, user=Depends(verificar_usuario)):
    registro = datos_registro(user.id, datos)
    del registro["user_id"]
    supabase.table("facturas").update(registro).eq("id", f_id).eq("user_id", user.id).execute()
    log_actividad(user.id, "actualizar_factura")
    return {"msg": "Factura actualizada"}


@router.put("/actualizar-generar/{f_id}")
async def actualizar_generar(f_id: int, datos: DatosFactura, formato: str = "excel", user=Depends(verificar_usuario)):
    registro = datos_registro(user.id, datos)
    del registro["user_id"]
    supabase.table("facturas").update(registro).eq("id", f_id).eq("user_id", user.id).execute()
    log_actividad(user.id, "actualizar_generar", f"formato={formato}")
    return procesar_descarga(datos.dict(), formato)


@router.get("/re-descargar/{f_id}")
async def redescargar_file(f_id: int, formato: str = "excel", user=Depends(verificar_usuario)):
    res = supabase.table("facturas").select("datos_json") \
        .eq("id", f_id).eq("user_id", user.id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    raw = res.data["datos_json"]
    if raw.startswith("ENC:"):
        raise HTTPException(status_code=400, detail="Datos cifrados.")
    log_actividad(user.id, "redescargar", f"formato={formato}")
    return procesar_descarga(json.loads(raw), formato)


@router.delete("/eliminar-factura/{f_id}")
async def eliminar_factura(f_id: int, user=Depends(verificar_usuario)):
    supabase.table("facturas").delete().eq("id", f_id).eq("user_id", user.id).execute()
    log_actividad(user.id, "eliminar_factura")
    return {"msg": "Factura eliminada"}


@router.delete("/limpiar-historial")
async def limpiar(user=Depends(verificar_usuario)):
    supabase.table("facturas").delete().eq("user_id", user.id).execute()
    log_actividad(user.id, "limpiar_historial")
    return {"msg": "ok"}
