import os
import io
import json
import shutil
import subprocess
import openpyxl
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask
from config import supabase, TEMP_DIR
from auth import verificar_usuario, log_actividad
from models import DatosFacturaGenerica
from utils import compact_json, limpiar_temp, escanear_tags_excel
from generador import generar_html_visual, html_a_pdf, procesar_con_plantilla_excel

router = APIRouter()


@router.get("/plantillas")
async def listar_plantillas(user=Depends(verificar_usuario)):
    res = supabase.table("plantillas") \
        .select("id, nombre, tipo, config_json, es_publica, created_at, user_id") \
        .or_(f"user_id.eq.{user.id},es_publica.eq.true") \
        .order("created_at", desc=True).execute()
    return res.data


@router.get("/plantillas/{p_id}")
async def get_plantilla(p_id: int, user=Depends(verificar_usuario)):
    res = supabase.table("plantillas").select("*") \
        .eq("id", p_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)
    return p


@router.post("/plantillas/crear-visual")
async def crear_plantilla_visual(nombre: str = Form(...), config_json: str = Form(...), user=Depends(verificar_usuario)):
    try:
        json.loads(config_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON inválido")
    res = supabase.table("plantillas").insert({
        "user_id": user.id, "nombre": nombre, "tipo": "visual", "config_json": config_json,
    }).execute()
    log_actividad(user.id, "crear_plantilla", f"tipo=visual,nombre={nombre}")
    return {"msg": "Plantilla creada", "id": res.data[0]["id"] if res.data else None}


@router.post("/plantillas/upload-excel")
async def upload_excel_template(file: UploadFile = File(...), nombre: str = Form(...), config_json: str = Form("{}"), user=Depends(verificar_usuario)):
    if not file.filename.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Solo .xlsx o .xlsm")
    contenido = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido))
        tags = escanear_tags_excel(wb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {e}")
    ext = os.path.splitext(file.filename)[1]
    storage_path = f"{user.id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
    try:
        supabase.storage.from_("plantillas").upload(path=storage_path, file=contenido,
            file_options={"content-type": file.content_type or "application/octet-stream"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo: {e}")
    cfg = json.loads(config_json) if config_json else {}
    cfg["tags_detectados"] = tags
    cfg["filename_original"] = file.filename
    res = supabase.table("plantillas").insert({
        "user_id": user.id, "nombre": nombre, "tipo": "excel",
        "config_json": json.dumps(cfg, separators=(",", ":")), "excel_path": storage_path,
    }).execute()
    log_actividad(user.id, "crear_plantilla", f"tipo=excel,nombre={nombre}")
    return {"msg": "Plantilla subida", "id": res.data[0]["id"] if res.data else None, "tags_detectados": tags}


@router.put("/plantillas/{p_id}")
async def actualizar_plantilla(p_id: int, nombre: str = Form(...), config_json: str = Form(...), user=Depends(verificar_usuario)):
    supabase.table("plantillas").update({"nombre": nombre, "config_json": config_json}) \
        .eq("id", p_id).eq("user_id", user.id).execute()
    return {"msg": "Actualizada"}


@router.delete("/plantillas/{p_id}")
async def eliminar_plantilla(p_id: int, user=Depends(verificar_usuario)):
    res = supabase.table("plantillas").select("excel_path") \
        .eq("id", p_id).eq("user_id", user.id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    if res.data.get("excel_path"):
        try:
            supabase.storage.from_("plantillas").remove([res.data["excel_path"]])
        except Exception:
            pass
    supabase.table("plantillas").delete().eq("id", p_id).eq("user_id", user.id).execute()
    log_actividad(user.id, "eliminar_plantilla")
    return {"msg": "Eliminada"}


@router.post("/plantillas/{p_id}/preview")
async def preview_plantilla(p_id: int, user=Depends(verificar_usuario)):
    res = supabase.table("plantillas").select("*").eq("id", p_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)
    ejemplo = {
        "numero_factura": "2026-0001", "fecha": "19/03/2026", "referencia": "REF-EJEMPLO",
        "cliente": {"nombre": "Empresa Ejemplo S.L.", "cif": "B12345678", "direccion": "Calle Mayor 10, Madrid"},
        "lineas": [
            {"descripcion": "Servicio profesional", "cantidad": "10", "precio": "50.00", "horas": "10", "tarifa": "50.00", "importe": "500.00", "total": "500.00"},
            {"descripcion": "Material fungible", "cantidad": "1", "precio": "30.00", "horas": "2", "tarifa": "30.00", "importe": "30.00", "total": "30.00"},
        ],
        "notas": "Pago a 30 días.",
    }
    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)
    if p["tipo"] == "visual":
        config = json.loads(p["config_json"])
        html = generar_html_visual(config, ejemplo)
        pdf_path = html_a_pdf(html)
        return FileResponse(pdf_path, filename="preview.pdf",
                            headers={"Content-Disposition": "inline; filename=preview.pdf"}, background=cleanup)
    elif p["tipo"] == "excel":
        if not p.get("excel_path"):
            raise HTTPException(status_code=400)
        excel_bytes = supabase.storage.from_("plantillas").download(p["excel_path"])
        out = procesar_con_plantilla_excel(excel_bytes, ejemplo)
        return FileResponse(out, filename="preview.xlsx", background=cleanup)


@router.get("/health")
async def health():
    try:
        supabase.table("plantillas").select("id").limit(1).execute()
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=503, detail="Servidor iniciando...")


@router.post("/guardar-con-plantilla")
async def guardar_con_plantilla(datos: DatosFacturaGenerica, plantilla_id: Optional[int] = None, user=Depends(verificar_usuario)):
    if not plantilla_id:
        raise HTTPException(status_code=400, detail="Se requiere plantilla_id")
    res = supabase.table("plantillas").select("nombre").eq("id", plantilla_id).single().execute()
    plantilla_nombre = res.data["nombre"] if res.data else "custom"

    config = {}
    try:
        pr = supabase.table("plantillas").select("config_json").eq("id", plantilla_id).single().execute()
        if pr.data:
            config = json.loads(pr.data.get("config_json", "{}"))
    except Exception:
        pass

    cols = config.get("columnas", [])
    col_importe = config.get("columna_importe", "")
    if not col_importe and cols:
        for c in reversed(cols):
            if c.get("tipo") in ("moneda", "numero", "formula"):
                col_importe = c["campo"]
                break

    # Use pre-computed totals from frontend if available, otherwise calculate
    totales = datos.dict().get("totales", {})
    if totales and totales.get("total"):
        importe_total = float(totales["total"])
    else:
        importe_total = 0
        for linea in datos.lineas:
            try:
                importe_total += float(linea.get(col_importe, 0))
            except (ValueError, TypeError):
                pass

    registro = {
        "user_id": user.id,
        "numero_factura": datos.numero_factura,
        "barco": datos.referencia or plantilla_nombre,
        "importe_total": round(importe_total, 2),
        "datos_json": compact_json(datos.dict()),
        "plantilla_nombre": plantilla_nombre,
    }
    supabase.table("facturas").insert(registro).execute()
    log_actividad(user.id, "guardar_con_plantilla", f"plantilla={plantilla_nombre}")
    return {"msg": "Factura guardada en la nube"}


@router.post("/generar-con-plantilla")
async def generar_con_plantilla(datos: DatosFacturaGenerica, formato: str = "pdf", plantilla_id: Optional[int] = None, user=Depends(verificar_usuario)):
    if not plantilla_id:
        raise HTTPException(status_code=400, detail="Se requiere plantilla_id")
    res = supabase.table("plantillas").select("*").eq("id", plantilla_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)

    nombre_base = f"Factura_{datos.numero_factura.replace(' ', '_')}_{datetime.now().strftime('%d_%m_%Y')}"
    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)
    log_actividad(user.id, "generar_con_plantilla", f"plantilla={p['nombre']},formato={formato}")

    if p["tipo"] == "visual":
        config = json.loads(p["config_json"])
        html = generar_html_visual(config, datos.dict())
        if formato == "html":
            return Response(content=html, media_type="text/html",
                            headers={"Content-Disposition": f"attachment; filename={nombre_base}.html"})
        try:
            pdf_path = html_a_pdf(html)
            pdf_name = f"{nombre_base}.pdf"
            final_path = os.path.join(TEMP_DIR, pdf_name)
            shutil.move(pdf_path, final_path)
            return FileResponse(final_path, filename=pdf_name,
                                headers={"Content-Disposition": f"attachment; filename={pdf_name}"}, background=cleanup)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generando PDF: {e}. Prueba con formato=html.")
    elif p["tipo"] == "excel":
        if not p.get("excel_path"):
            raise HTTPException(status_code=400)
        excel_bytes = supabase.storage.from_("plantillas").download(p["excel_path"])
        config_excel = json.loads(p.get("config_json", "{}"))
        out = procesar_con_plantilla_excel(excel_bytes, datos.dict(), config_excel)
        xlsx_name = f"{nombre_base}.xlsx"
        final_path = os.path.join(TEMP_DIR, xlsx_name)
        shutil.move(out, final_path)
        if formato == "excel":
            return FileResponse(final_path, filename=xlsx_name,
                                headers={"Content-Disposition": f"attachment; filename={xlsx_name}"}, background=cleanup)
        try:
            lo_profile = os.path.join(TEMP_DIR, "lo_profile_tpl")
            subprocess.run(["libreoffice", f"-env:UserInstallation=file://{lo_profile}",
                            "--headless", "--convert-to", "pdf", "--outdir", TEMP_DIR, final_path],
                           check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            pdf_name = f"{nombre_base}.pdf"
            pdf_path = os.path.join(TEMP_DIR, pdf_name)
            return FileResponse(pdf_path, filename=pdf_name,
                                headers={"Content-Disposition": f"attachment; filename={pdf_name}"}, background=cleanup)
        except Exception:
            return FileResponse(final_path, filename=xlsx_name,
                                headers={"Content-Disposition": f"attachment; filename={xlsx_name}"}, background=cleanup)