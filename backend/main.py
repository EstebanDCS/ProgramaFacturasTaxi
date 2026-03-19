import os
import json
import zipfile
import shutil
import subprocess
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import List
import openpyxl
from openpyxl.styles import Alignment
from datetime import datetime
from supabase import create_client, Client

# ─── CONFIGURACIÓN SUPABASE ─────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠️ ADVERTENCIA: Faltan las variables SUPABASE_URL o SUPABASE_KEY en Render")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# ─── APP ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Gestión Facturas API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

BASE_DIR = os.path.dirname(__file__)
TEMP_DIR = os.path.join(BASE_DIR, "temp_files")


# ─── AUTENTICACIÓN ───────────────────────────────────────────────────────────
async def verificar_usuario(authorization: str = Header(None)):
    """Valida el token JWT de Supabase y devuelve el usuario."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Acceso denegado. No hay sesión activa.")
    token = authorization.split(" ")[1]
    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
        return res.user
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ ERROR verificando token: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail=f"Token no válido: {str(e)}")


# ─── MODELOS PYDANTIC ────────────────────────────────────────────────────────
class DatosTicket(BaseModel):
    numero_ticket: str
    importe: float
    contacto_metodo: str = ""
    fechas_solicitud: List[str] = []
    fechas_servicio: List[str] = []
    pasajeros: List[str] = []
    o_aeropuerto: bool = False
    o_buque: bool = False
    o_hotel: bool = False
    o_hotel_texto: str = ""
    o_otros: bool = False
    o_otros_texto: str = ""
    d_aeropuerto: bool = False
    d_buque: bool = False
    d_hotel: bool = False
    d_hotel_texto: str = ""
    d_hospital: bool = False
    d_hospital_texto: str = ""
    d_clinica: bool = False
    d_clinica_texto: str = ""
    d_inmigracion: bool = False
    d_otros: bool = False
    d_otros_texto: str = ""
    ida_vuelta: bool = False
    comentarios: str = ""


class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    tickets: List[DatosTicket]

    @property
    def importe_total(self) -> float:
        return sum(t.importe for t in self.tickets)


# ─── UTILIDADES ──────────────────────────────────────────────────────────────
def compact_json(data: dict) -> str:
    """Serializa JSON eliminando valores vacíos (False, '', [], None)."""
    def strip(obj):
        if isinstance(obj, dict):
            return {k: strip(v) for k, v in obj.items() if v not in (False, "", [], None)}
        if isinstance(obj, list):
            return [strip(i) for i in obj]
        return obj
    return json.dumps(strip(data), separators=(",", ":"))


def limpiar_temp(directorio: str):
    """Elimina el directorio temporal tras enviar la respuesta."""
    try:
        if os.path.exists(directorio):
            shutil.rmtree(directorio)
    except OSError:
        pass


def escribir_celda(ws, coord: str, valor):
    """Escribe en una celda, ignorando celdas combinadas."""
    try:
        if type(ws[coord]).__name__ != "MergedCell":
            ws[coord] = valor
    except Exception:
        pass


def formatear_fechas(fechas: list, fmt_in="%Y-%m-%d", fmt_out="%d/%m/%Y") -> list:
    """Convierte una lista de fechas de un formato a otro."""
    resultado = []
    for f in fechas:
        try:
            resultado.append(datetime.strptime(f, fmt_in).strftime(fmt_out))
        except ValueError:
            continue
    return resultado


def datos_registro(user_id: str, datos: DatosFactura) -> dict:
    """Construye el dict para insertar/actualizar en Supabase."""
    return {
        "user_id": user_id,
        "numero_factura": datos.factura_numero,
        "barco": datos.barco.upper(),
        "importe_total": datos.importe_total,
        "datos_json": compact_json(datos.dict()),
    }


# ─── GENERACIÓN DE EXCEL ─────────────────────────────────────────────────────
def crear_excel(datos_dict: dict, nombre_base: str) -> tuple[str, str]:
    """Genera el archivo .xlsm a partir de la plantilla y los datos."""
    template_path = os.path.join(BASE_DIR, "plantilla.xlsm")
    os.makedirs(TEMP_DIR, exist_ok=True)

    name_xlsm = f"{nombre_base}.xlsm"
    path_salida = os.path.join(TEMP_DIR, name_xlsm)

    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    ws_factura = wb.worksheets[0]
    ws_template_bono = wb.worksheets[1] if len(wb.worksheets) > 1 else None
    esc = escribir_celda  # alias corto

    tickets = datos_dict.get("tickets", [])
    barco = datos_dict.get("barco", "").upper()

    # ── Hoja 1: Factura principal ──
    esc(ws_factura, "E15", datos_dict.get("factura_numero", ""))
    esc(ws_factura, "C17", barco)

    # Fecha más reciente de servicio
    todas_fechas = []
    for t in tickets:
        todas_fechas.extend(t.get("fechas_servicio", []))
    if todas_fechas:
        try:
            fechas_obj = [datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f]
            esc(ws_factura, "F17", max(fechas_obj).strftime("%d/%m/%Y"))
        except Exception:
            esc(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
    else:
        esc(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))

    # Descripción + importe total
    numeros = [str(t.get("numero_ticket", "")).strip() for t in tickets if str(t.get("numero_ticket", "")).strip()]
    total_importe = sum(float(t.get("importe", 0)) for t in tickets)

    esc(ws_factura, "B21", " ".join(numeros))
    esc(ws_factura, "F21", round(total_importe, 2))

    try:
        ws_factura["B21"].alignment = Alignment(wrap_text=True, vertical="top", horizontal="left")
    except Exception:
        pass

    # Totales
    base_imponible = total_importe / 1.10
    iva = total_importe - base_imponible
    esc(ws_factura, "F38", round(base_imponible, 2))
    esc(ws_factura, "F39", round(iva, 2))
    esc(ws_factura, "F40", round(total_importe, 2))

    # ── Hojas de Bonos (1 por ticket) ──
    if ws_template_bono and tickets:
        # Mapas de checkboxes para evitar bloques if repetitivos
        MAPA_RECOGIDA = [
            ("o_aeropuerto", "C26", None),
            ("o_buque",      "C27", None),
            ("o_hotel",      "C28", ("o_hotel_texto", "E28")),
            ("o_otros",      "C29", ("o_otros_texto", "D30")),
        ]
        MAPA_DESTINO = [
            ("d_aeropuerto",  "C33", None),
            ("d_buque",       "C34", None),
            ("d_hotel",       "C35", ("d_hotel_texto",    "E35")),
            ("d_hospital",    "C36", ("d_hospital_texto", "E36")),
            ("d_clinica",     "C37", ("d_clinica_texto",  "E37")),
            ("d_inmigracion", "C38", None),
            ("d_otros",       "C39", ("d_otros_texto",    "D40")),
        ]

        for i, t in enumerate(tickets):
            ws = ws_template_bono if i == 0 else wb.copy_worksheet(ws_template_bono)
            ws.title = f"Bono_{t.get('numero_ticket', i + 1)}"

            esc(ws, "E2", t.get("numero_ticket", ""))
            esc(ws, "E9", t.get("contacto_metodo", "").upper())
            esc(ws, "C12", ", ".join(formatear_fechas(t.get("fechas_solicitud", []))))
            esc(ws, "C14", ", ".join(formatear_fechas(t.get("fechas_servicio", []))))
            esc(ws, "C16", barco)
            esc(ws, "B19", ", ".join(t.get("pasajeros", [])))

            for campo, celda, texto_info in MAPA_RECOGIDA + MAPA_DESTINO:
                if t.get(campo):
                    esc(ws, celda, "X")
                    if texto_info:
                        esc(ws, texto_info[1], t.get(texto_info[0], ""))

            esc(ws, "C43" if t.get("ida_vuelta") else "D43", "X")
            esc(ws, "B46", t.get("comentarios", ""))
            esc(ws, "E51", float(t.get("importe", 0)))

    # Ajuste A4 en todas las hojas
    for sheet in wb.worksheets:
        try:
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            sheet.page_setup.paperSize = 9  # A4
            if hasattr(sheet, "sheet_properties") and hasattr(sheet.sheet_properties, "pageSetUpPr"):
                sheet.sheet_properties.pageSetUpPr.fitToPage = True
        except Exception:
            pass

    wb.save(path_salida)
    return path_salida, name_xlsm


# ─── GENERACIÓN DE DESCARGA ─────────────────────────────────────────────────
def procesar_descarga(datos_dict: dict, formato: str) -> FileResponse:
    """Genera Excel, PDF o ambos y devuelve la respuesta de archivo."""
    nombre_base = (
        f"{datos_dict.get('barco', 'Factura').replace(' ', '_').upper()}"
        f"_{datetime.now().strftime('%d_%m_%Y')}"
    )
    path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)

    if formato == "excel":
        return FileResponse(
            path_xlsm, filename=name_xlsm,
            headers={"Content-Disposition": f"attachment; filename={name_xlsm}"},
            background=cleanup,
        )

    # Convertir a PDF con LibreOffice
    pdf_name = f"{nombre_base}.pdf"
    pdf_path = os.path.join(TEMP_DIR, pdf_name)
    lo_profile = os.path.join(TEMP_DIR, "lo_profile")

    try:
        subprocess.run(
            [
                "libreoffice",
                f"-env:UserInstallation=file://{lo_profile}",
                "--headless", "--convert-to", "pdf",
                "--outdir", TEMP_DIR, path_xlsm,
            ],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Error al generar el PDF.")

    if formato == "pdf":
        if os.path.exists(pdf_path):
            return FileResponse(
                pdf_path, filename=pdf_name,
                headers={"Content-Disposition": f"attachment; filename={pdf_name}"},
                background=cleanup,
            )
        raise HTTPException(status_code=500, detail="No se pudo crear el archivo PDF.")

    # formato == "ambos" → ZIP
    zip_name = f"{nombre_base}.zip"
    zip_path = os.path.join(TEMP_DIR, zip_name)
    with zipfile.ZipFile(zip_path, "w") as zipf:
        zipf.write(path_xlsm, arcname=name_xlsm)
        if os.path.exists(pdf_path):
            zipf.write(pdf_path, arcname=pdf_name)

    return FileResponse(
        zip_path, filename=zip_name,
        headers={"Content-Disposition": f"attachment; filename={zip_name}"},
        background=cleanup,
    )


# ─── RUTAS DE LA API ─────────────────────────────────────────────────────────

@app.get("/historial")
async def historial(user=Depends(verificar_usuario)):
    res = supabase.table("facturas") \
        .select("id, numero_factura, barco, importe_total, fecha_creacion") \
        .eq("user_id", user.id) \
        .order("fecha_creacion", desc=True) \
        .execute()
    return res.data


@app.post("/solo-guardar")
async def solo_guardar(datos: DatosFactura, user=Depends(verificar_usuario)):
    supabase.table("facturas").insert(datos_registro(user.id, datos)).execute()
    return {"msg": "✅ Datos guardados en la nube"}


@app.post("/generar")
async def generar(datos: DatosFactura, formato: str = "excel", user=Depends(verificar_usuario)):
    supabase.table("facturas").insert(datos_registro(user.id, datos)).execute()
    return procesar_descarga(datos.dict(), formato)


@app.get("/factura/{f_id}")
async def get_factura(f_id: int, user=Depends(verificar_usuario)):
    res = supabase.table("facturas") \
        .select("datos_json") \
        .eq("id", f_id).eq("user_id", user.id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    return json.loads(res.data["datos_json"])


@app.put("/actualizar/{f_id}")
async def actualizar(f_id: int, datos: DatosFactura, user=Depends(verificar_usuario)):
    registro = datos_registro(user.id, datos)
    del registro["user_id"]  # no actualizamos el owner
    supabase.table("facturas").update(registro).eq("id", f_id).eq("user_id", user.id).execute()
    return {"msg": "✅ Factura actualizada"}


@app.put("/actualizar-generar/{f_id}")
async def actualizar_generar(f_id: int, datos: DatosFactura, formato: str = "excel", user=Depends(verificar_usuario)):
    registro = datos_registro(user.id, datos)
    del registro["user_id"]
    supabase.table("facturas").update(registro).eq("id", f_id).eq("user_id", user.id).execute()
    return procesar_descarga(datos.dict(), formato)


@app.get("/re-descargar/{f_id}")
async def redescargar_file(f_id: int, formato: str = "excel", user=Depends(verificar_usuario)):
    res = supabase.table("facturas") \
        .select("datos_json") \
        .eq("id", f_id).eq("user_id", user.id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    return procesar_descarga(json.loads(res.data["datos_json"]), formato)


@app.delete("/eliminar-factura/{f_id}")
async def eliminar_factura(f_id: int, user=Depends(verificar_usuario)):
    supabase.table("facturas").delete().eq("id", f_id).eq("user_id", user.id).execute()
    return {"msg": "Factura eliminada"}


@app.delete("/limpiar-historial")
async def limpiar(user=Depends(verificar_usuario)):
    supabase.table("facturas").delete().eq("user_id", user.id).execute()
    return {"msg": "ok"}