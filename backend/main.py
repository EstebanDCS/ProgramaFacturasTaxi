import os
import io
import re
import json
import zipfile
import shutil
import subprocess
import tempfile
from fastapi import FastAPI, Header, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import List, Optional
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

# Emails con acceso de administrador (ampliable vía variable de entorno separada por comas)
ADMIN_EMAILS = set(
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "estebandelka@gmail.com").split(",")
    if e.strip()
)


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


async def verificar_admin(user=Depends(verificar_usuario)):
    """Verifica que el usuario autenticado sea administrador."""
    email = (user.email or "").lower()
    if email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores.")
    return user


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


# ─── PLANTILLAS: HELPERS ──────────────────────────────────────────────────────

TAGS_DISPONIBLES = {
    "factura": [
        ("{{factura_numero}}", "Número de factura"),
        ("{{barco}}", "Nombre del barco"),
        ("{{fecha}}", "Fecha más reciente de servicio"),
        ("{{tickets_descripcion}}", "Números de ticket separados por espacio"),
        ("{{tickets_total}}", "Importe total de todos los tickets"),
        ("{{base_imponible}}", "Base imponible (total / 1.10)"),
        ("{{iva}}", "Importe del IVA"),
        ("{{total}}", "Importe total con IVA"),
    ],
    "bono": [
        ("{{ticket_numero}}", "Número del ticket"),
        ("{{ticket_importe}}", "Importe del ticket"),
        ("{{ticket_contacto}}", "Método de contacto"),
        ("{{ticket_pasajeros}}", "Lista de pasajeros"),
        ("{{ticket_fechas_solicitud}}", "Fechas de solicitud"),
        ("{{ticket_fechas_servicio}}", "Fechas de servicio"),
        ("{{ticket_origen}}", "Texto de recogida"),
        ("{{ticket_destino}}", "Texto de destino"),
        ("{{ticket_ida_vuelta}}", "Sí / No"),
        ("{{ticket_comentarios}}", "Observaciones"),
        ("{{barco}}", "Nombre del barco"),
    ],
}


def ticket_origen_texto(t: dict) -> str:
    partes = []
    if t.get("o_aeropuerto"): partes.append("Aeropuerto")
    if t.get("o_buque"): partes.append("Buque")
    if t.get("o_hotel"): partes.append(f"Hotel: {t.get('o_hotel_texto', '')}")
    if t.get("o_otros"): partes.append(t.get("o_otros_texto", "Otros"))
    return ", ".join(partes) or "—"


def ticket_destino_texto(t: dict) -> str:
    partes = []
    if t.get("d_aeropuerto"): partes.append("Aeropuerto")
    if t.get("d_buque"): partes.append("Buque")
    if t.get("d_hotel"): partes.append(f"Hotel: {t.get('d_hotel_texto', '')}")
    if t.get("d_hospital"): partes.append(f"Hospital: {t.get('d_hospital_texto', '')}")
    if t.get("d_clinica"): partes.append(f"Clínica: {t.get('d_clinica_texto', '')}")
    if t.get("d_inmigracion"): partes.append("Inmigración")
    if t.get("d_otros"): partes.append(t.get("d_otros_texto", "Otros"))
    return ", ".join(partes) or "—"


def preparar_datos_tags(datos_dict: dict) -> dict:
    """Prepara un diccionario plano con todos los valores para reemplazar tags."""
    tickets = datos_dict.get("tickets", [])
    total = sum(float(t.get("importe", 0)) for t in tickets)
    base = total / 1.10
    iva = total - base
    todas_fechas = []
    for t in tickets:
        todas_fechas.extend(t.get("fechas_servicio", []))
    fecha_max = ""
    if todas_fechas:
        try:
            fecha_max = max(datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f).strftime("%d/%m/%Y")
        except Exception:
            fecha_max = datetime.now().strftime("%d/%m/%Y")
    else:
        fecha_max = datetime.now().strftime("%d/%m/%Y")

    nums = [str(t.get("numero_ticket", "")).strip() for t in tickets if str(t.get("numero_ticket", "")).strip()]

    return {
        "{{factura_numero}}": datos_dict.get("factura_numero", ""),
        "{{barco}}": datos_dict.get("barco", "").upper(),
        "{{fecha}}": fecha_max,
        "{{tickets_descripcion}}": " ".join(nums),
        "{{tickets_total}}": f"{total:.2f}",
        "{{base_imponible}}": f"{base:.2f}",
        "{{iva}}": f"{iva:.2f}",
        "{{total}}": f"{total:.2f}",
    }


def preparar_datos_tags_ticket(t: dict, barco: str) -> dict:
    """Tags para un ticket individual (bono)."""
    f_sol = formatear_fechas(t.get("fechas_solicitud", []))
    f_ser = formatear_fechas(t.get("fechas_servicio", []))
    return {
        "{{ticket_numero}}": str(t.get("numero_ticket", "")),
        "{{ticket_importe}}": f"{float(t.get('importe', 0)):.2f}",
        "{{ticket_contacto}}": t.get("contacto_metodo", "").upper(),
        "{{ticket_pasajeros}}": ", ".join(t.get("pasajeros", [])),
        "{{ticket_fechas_solicitud}}": ", ".join(f_sol),
        "{{ticket_fechas_servicio}}": ", ".join(f_ser),
        "{{ticket_origen}}": ticket_origen_texto(t),
        "{{ticket_destino}}": ticket_destino_texto(t),
        "{{ticket_ida_vuelta}}": "Sí" if t.get("ida_vuelta") else "No",
        "{{ticket_comentarios}}": t.get("comentarios", ""),
        "{{barco}}": barco,
    }


def escanear_tags_excel(wb) -> list:
    """Escanea un workbook y devuelve las tags encontradas."""
    encontrados = set()
    patron = re.compile(r"\{\{[a-z_]+\}\}")
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    encontrados.update(patron.findall(cell.value))
    return sorted(encontrados)


def rellenar_tags_hoja(ws, tags_map: dict):
    """Reemplaza tags {{...}} en todas las celdas de una hoja."""
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                nuevo = cell.value
                for tag, valor in tags_map.items():
                    nuevo = nuevo.replace(tag, str(valor))
                if nuevo != cell.value:
                    # Intentar convertir a número si es puramente numérico
                    try:
                        cell.value = float(nuevo)
                    except (ValueError, TypeError):
                        cell.value = nuevo


def generar_html_visual(config: dict, datos_dict: dict) -> str:
    """Genera HTML completo para un template visual + datos de factura."""
    emp = config.get("empresa", {})
    est = config.get("estilo", {})
    pag = config.get("pagina", {})
    sec = config.get("secciones", {})
    fac = config.get("factura", {})
    pie = config.get("pie", {})

    color1 = est.get("color_primario", "#1a2e4a")
    color2 = est.get("color_secundario", "#0d6dfd")
    fuente = est.get("fuente", "Helvetica, Arial, sans-serif")
    tam = est.get("tam_fuente", 10)
    moneda = fac.get("moneda", "€")
    iva_pct = fac.get("porcentaje_iva", 10)
    titulo_fac = fac.get("titulo", "FACTURA")

    # Márgenes en mm
    mg = pag.get("margenes", {})
    mt, mr, mb, ml = mg.get("top", 20), mg.get("right", 15), mg.get("bottom", 20), mg.get("left", 15)

    tickets = datos_dict.get("tickets", [])
    total = sum(float(t.get("importe", 0)) for t in tickets)
    base = total / (1 + iva_pct / 100)
    iva = total - base
    barco = datos_dict.get("barco", "").upper()

    # Fecha
    todas_fechas = []
    for t in tickets:
        todas_fechas.extend(t.get("fechas_servicio", []))
    fecha = datetime.now().strftime("%d/%m/%Y")
    if todas_fechas:
        try:
            fecha = max(datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f).strftime("%d/%m/%Y")
        except Exception:
            pass

    nums = [str(t.get("numero_ticket", "")).strip() for t in tickets if str(t.get("numero_ticket", "")).strip()]

    # Logo
    logo_html = ""
    if emp.get("logo_url"):
        logo_html = f'<img src="{emp["logo_url"]}" style="max-height:60px;max-width:180px;object-fit:contain;" />'

    # Filas de tickets
    filas_tickets = ""
    for t in tickets:
        desc_parts = [f"Ticket {t.get('numero_ticket', '')}"]
        if sec.get("pasajeros") and t.get("pasajeros"):
            desc_parts.append(f"Pasajeros: {', '.join(t['pasajeros'])}")
        if sec.get("origen_destino"):
            desc_parts.append(f"Origen: {ticket_origen_texto(t)}")
            desc_parts.append(f"Destino: {ticket_destino_texto(t)}")
        if sec.get("ida_vuelta") and t.get("ida_vuelta"):
            desc_parts.append("Ida y Vuelta: Sí")
        if sec.get("comentarios") and t.get("comentarios"):
            desc_parts.append(f"Obs: {t['comentarios']}")

        desc_html = "<br>".join(desc_parts)
        imp = float(t.get("importe", 0))
        filas_tickets += f"""
        <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:{tam}px;line-height:1.5;">{desc_html}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;white-space:nowrap;">{imp:.2f} {moneda}</td>
        </tr>"""

    # Fechas de servicio
    fechas_html = ""
    if sec.get("fechas_servicio") and todas_fechas:
        fechas_fmt = formatear_fechas(todas_fechas)
        fechas_html = f'<p style="margin:2px 0;color:#666;font-size:{tam - 1}px;">Fechas de servicio: {", ".join(fechas_fmt)}</p>'

    # Datos de pago en pie
    pago_html = ""
    if pie.get("mostrar_datos_pago") and pie.get("datos_pago"):
        pago_html = f'<p style="margin:4px 0;font-size:{tam - 1}px;color:#555;">{pie["datos_pago"]}</p>'

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page {{ size: {pag.get("size", "A4")} {pag.get("orientation", "portrait")}; margin: {mt}mm {mr}mm {mb}mm {ml}mm; }}
  body {{ font-family: {fuente}; font-size: {tam}px; color: #333; margin: 0; padding: 0; }}
  table {{ border-collapse: collapse; width: 100%; }}
</style></head><body>

<!-- CABECERA -->
<table style="margin-bottom:24px;">
<tr>
  <td style="vertical-align:top;width:60%;">
    {logo_html}
    <h2 style="margin:8px 0 2px;color:{color1};font-size:{tam + 6}px;">{emp.get("nombre", "")}</h2>
    <p style="margin:2px 0;color:#666;font-size:{tam - 1}px;">{emp.get("cif", "")}</p>
    <p style="margin:2px 0;color:#666;font-size:{tam - 1}px;">{emp.get("direccion", "")}</p>
    <p style="margin:2px 0;color:#666;font-size:{tam - 1}px;">{emp.get("telefono", "")} {emp.get("email", "")}</p>
  </td>
  <td style="vertical-align:top;text-align:right;">
    <h1 style="margin:0;color:{color2};font-size:{tam + 10}px;letter-spacing:2px;">{titulo_fac}</h1>
    <p style="margin:6px 0 2px;font-size:{tam + 1}px;"><strong>Nº:</strong> {datos_dict.get("factura_numero", "")}</p>
    <p style="margin:2px 0;font-size:{tam + 1}px;"><strong>Fecha:</strong> {fecha}</p>
    <p style="margin:2px 0;font-size:{tam + 1}px;"><strong>Ref:</strong> {barco}</p>
  </td>
</tr>
</table>

{fechas_html}

<!-- TABLA DE LÍNEAS -->
<table style="margin-top:16px;">
  <thead>
    <tr style="background:{color1};color:white;">
      <th style="padding:10px;text-align:left;font-size:{tam}px;">Descripción</th>
      <th style="padding:10px;text-align:right;font-size:{tam}px;">Importe</th>
    </tr>
  </thead>
  <tbody>
    {filas_tickets}
  </tbody>
</table>

<!-- TOTALES -->
<table style="margin-top:20px;width:auto;margin-left:auto;">
  {"<tr><td style='padding:4px 20px;color:#666;'>Base imponible</td><td style='padding:4px 10px;text-align:right;font-weight:600;'>" + f"{base:.2f} {moneda}</td></tr>" if fac.get("mostrar_desglose_iva", True) else ""}
  {"<tr><td style='padding:4px 20px;color:#666;'>IVA (" + str(iva_pct) + "%)</td><td style='padding:4px 10px;text-align:right;font-weight:600;'>" + f"{iva:.2f} {moneda}</td></tr>" if fac.get("mostrar_desglose_iva", True) else ""}
  <tr style="border-top:2px solid {color1};">
    <td style="padding:8px 20px;font-weight:800;font-size:{tam + 2}px;color:{color1};">TOTAL</td>
    <td style="padding:8px 10px;text-align:right;font-weight:800;font-size:{tam + 2}px;color:{color1};">{total:.2f} {moneda}</td>
  </tr>
</table>

<!-- PIE -->
<div style="margin-top:40px;padding-top:12px;border-top:1px solid #ddd;font-size:{tam - 1}px;color:#888;">
  <p>{pie.get("texto", "")}</p>
  {pago_html}
</div>

</body></html>"""
    return html


def html_a_pdf(html_content: str) -> str:
    """Convierte HTML a PDF usando LibreOffice. Devuelve path al PDF."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    html_path = os.path.join(TEMP_DIR, f"visual_{datetime.now().strftime('%H%M%S%f')}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    lo_profile = os.path.join(TEMP_DIR, "lo_profile_vis")
    try:
        subprocess.run(
            ["libreoffice", f"-env:UserInstallation=file://{lo_profile}",
             "--headless", "--convert-to", "pdf", "--outdir", TEMP_DIR, html_path],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {e}")
    pdf_path = html_path.replace(".html", ".pdf")
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="No se generó el PDF.")
    return pdf_path


def procesar_con_plantilla_excel(excel_bytes: bytes, datos_dict: dict) -> str:
    """Rellena tags en un Excel template y devuelve path al .xlsx generado."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    tmp_in = os.path.join(TEMP_DIR, f"tpl_{datetime.now().strftime('%H%M%S%f')}.xlsx")
    with open(tmp_in, "wb") as f:
        f.write(excel_bytes)

    wb = openpyxl.load_workbook(tmp_in)
    tags_factura = preparar_datos_tags(datos_dict)
    barco = datos_dict.get("barco", "").upper()
    tickets = datos_dict.get("tickets", [])

    # Primera hoja = factura: reemplazar tags globales
    if wb.worksheets:
        rellenar_tags_hoja(wb.worksheets[0], tags_factura)

    # Segunda hoja = bono template: duplicar por ticket
    if len(wb.worksheets) > 1 and tickets:
        ws_tpl = wb.worksheets[1]
        for i, t in enumerate(tickets):
            ws = ws_tpl if i == 0 else wb.copy_worksheet(ws_tpl)
            ws.title = f"Bono_{t.get('numero_ticket', i + 1)}"
            tags_t = preparar_datos_tags_ticket(t, barco)
            rellenar_tags_hoja(ws, tags_t)

    out_path = os.path.join(TEMP_DIR, f"gen_{datetime.now().strftime('%H%M%S%f')}.xlsx")
    wb.save(out_path)
    return out_path


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


# ─── RUTAS DE ADMINISTRADOR ──────────────────────────────────────────────────

@app.get("/admin/check")
async def admin_check(user=Depends(verificar_usuario)):
    """Devuelve si el usuario actual es admin (no lanza 403, solo informa)."""
    email = (user.email or "").lower()
    return {"is_admin": email in ADMIN_EMAILS}


@app.get("/admin/dashboard")
async def admin_dashboard(user=Depends(verificar_admin)):
    """Estadísticas globales para el panel de administración."""
    res = supabase.table("facturas") \
        .select("id, user_id, barco, importe_total, fecha_creacion, numero_factura") \
        .order("fecha_creacion", desc=True) \
        .execute()
    facturas = res.data or []

    # Cálculos
    total_facturas = len(facturas)
    total_importe = sum(f.get("importe_total", 0) for f in facturas)
    usuarios_unicos = len(set(f.get("user_id", "") for f in facturas))

    # Facturas de este mes
    ahora = datetime.utcnow()
    facturas_mes = [
        f for f in facturas
        if f.get("fecha_creacion", "").startswith(ahora.strftime("%Y-%m"))
    ]
    importe_mes = sum(f.get("importe_total", 0) for f in facturas_mes)

    # Top barcos por frecuencia
    barcos_count = {}
    barcos_importe = {}
    for f in facturas:
        b = f.get("barco", "DESCONOCIDO")
        barcos_count[b] = barcos_count.get(b, 0) + 1
        barcos_importe[b] = barcos_importe.get(b, 0) + f.get("importe_total", 0)

    top_barcos = sorted(barcos_count.items(), key=lambda x: x[1], reverse=True)[:10]
    top_barcos_data = [
        {"barco": b, "facturas": c, "importe": round(barcos_importe.get(b, 0), 2)}
        for b, c in top_barcos
    ]

    # Importe por mes (últimos 6 meses)
    meses = {}
    for f in facturas:
        fc = f.get("fecha_creacion", "")
        if len(fc) >= 7:
            mes_key = fc[:7]  # "2026-03"
            meses[mes_key] = meses.get(mes_key, 0) + f.get("importe_total", 0)
    meses_ordenados = sorted(meses.items())[-6:]

    # Actividad reciente (últimas 15)
    recientes = facturas[:15]

    return {
        "total_facturas": total_facturas,
        "total_importe": round(total_importe, 2),
        "usuarios_unicos": usuarios_unicos,
        "facturas_mes": len(facturas_mes),
        "importe_mes": round(importe_mes, 2),
        "top_barcos": top_barcos_data,
        "importe_por_mes": [{"mes": m, "importe": round(v, 2)} for m, v in meses_ordenados],
        "actividad_reciente": recientes,
    }


@app.get("/admin/facturas")
async def admin_facturas(user=Depends(verificar_admin)):
    """Todas las facturas de todos los usuarios."""
    res = supabase.table("facturas") \
        .select("id, user_id, numero_factura, barco, importe_total, fecha_creacion") \
        .order("fecha_creacion", desc=True) \
        .execute()
    return res.data


@app.get("/admin/factura/{f_id}")
async def admin_get_factura(f_id: int, user=Depends(verificar_admin)):
    """Obtener datos JSON de cualquier factura (sin filtro user_id)."""
    res = supabase.table("facturas") \
        .select("datos_json") \
        .eq("id", f_id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    return json.loads(res.data["datos_json"])


@app.get("/admin/re-descargar/{f_id}")
async def admin_redescargar(f_id: int, formato: str = "excel", user=Depends(verificar_admin)):
    """Re-descargar cualquier factura (sin filtro user_id)."""
    res = supabase.table("facturas") \
        .select("datos_json") \
        .eq("id", f_id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    return procesar_descarga(json.loads(res.data["datos_json"]), formato)


@app.delete("/admin/eliminar-factura/{f_id}")
async def admin_eliminar(f_id: int, user=Depends(verificar_admin)):
    """Eliminar cualquier factura (sin filtro user_id)."""
    supabase.table("facturas").delete().eq("id", f_id).execute()
    return {"msg": "Factura eliminada por administrador"}


# ─── RUTAS DE PLANTILLAS ─────────────────────────────────────────────────────

@app.get("/plantillas/tags")
async def get_tags_disponibles(user=Depends(verificar_usuario)):
    """Devuelve la lista de tags disponibles para Excel templates."""
    return TAGS_DISPONIBLES


@app.get("/plantillas")
async def listar_plantillas(user=Depends(verificar_usuario)):
    """Lista plantillas del usuario + públicas."""
    res = supabase.table("plantillas") \
        .select("id, nombre, tipo, es_publica, created_at, user_id") \
        .or_(f"user_id.eq.{user.id},es_publica.eq.true") \
        .order("created_at", desc=True) \
        .execute()
    return res.data


@app.get("/plantillas/{p_id}")
async def get_plantilla(p_id: int, user=Depends(verificar_usuario)):
    """Obtiene la config de una plantilla."""
    res = supabase.table("plantillas") \
        .select("*") \
        .eq("id", p_id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)
    return p


@app.post("/plantillas/crear-visual")
async def crear_plantilla_visual(
    nombre: str = Form(...),
    config_json: str = Form(...),
    user=Depends(verificar_usuario),
):
    """Crea una plantilla visual (JSON config)."""
    # Validar que el JSON es válido
    try:
        json.loads(config_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON de configuración inválido")

    nueva = {
        "user_id": user.id,
        "nombre": nombre,
        "tipo": "visual",
        "config_json": config_json,
    }
    res = supabase.table("plantillas").insert(nueva).execute()
    return {"msg": "✅ Plantilla visual creada", "id": res.data[0]["id"] if res.data else None}


@app.post("/plantillas/upload-excel")
async def upload_excel_template(
    file: UploadFile = File(...),
    nombre: str = Form(...),
    config_json: str = Form("{}"),
    user=Depends(verificar_usuario),
):
    """Sube un Excel con tags como plantilla."""
    if not file.filename.endswith((".xlsx", ".xlsm", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos Excel (.xlsx, .xlsm)")

    contenido = await file.read()

    # Escanear tags
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido))
        tags = escanear_tags_excel(wb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo el Excel: {e}")

    # Subir a Supabase Storage
    ext = os.path.splitext(file.filename)[1]
    storage_path = f"{user.id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
    try:
        supabase.storage.from_("plantillas").upload(
            path=storage_path,
            file=contenido,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo archivo: {e}")

    # Guardar en tabla con los tags detectados
    cfg = json.loads(config_json) if config_json else {}
    cfg["tags_detectados"] = tags
    cfg["filename_original"] = file.filename

    nueva = {
        "user_id": user.id,
        "nombre": nombre,
        "tipo": "excel",
        "config_json": json.dumps(cfg, separators=(",", ":")),
        "excel_path": storage_path,
    }
    res = supabase.table("plantillas").insert(nueva).execute()
    return {
        "msg": "✅ Plantilla Excel subida",
        "id": res.data[0]["id"] if res.data else None,
        "tags_detectados": tags,
    }


@app.put("/plantillas/{p_id}")
async def actualizar_plantilla(
    p_id: int,
    nombre: str = Form(...),
    config_json: str = Form(...),
    user=Depends(verificar_usuario),
):
    """Actualiza una plantilla visual."""
    supabase.table("plantillas").update({
        "nombre": nombre,
        "config_json": config_json,
    }).eq("id", p_id).eq("user_id", user.id).execute()
    return {"msg": "✅ Plantilla actualizada"}


@app.delete("/plantillas/{p_id}")
async def eliminar_plantilla(p_id: int, user=Depends(verificar_usuario)):
    """Elimina una plantilla y su archivo Excel si existe."""
    res = supabase.table("plantillas") \
        .select("excel_path") \
        .eq("id", p_id).eq("user_id", user.id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    # Borrar archivo de Storage si existe
    if res.data.get("excel_path"):
        try:
            supabase.storage.from_("plantillas").remove([res.data["excel_path"]])
        except Exception:
            pass
    supabase.table("plantillas").delete().eq("id", p_id).eq("user_id", user.id).execute()
    return {"msg": "Plantilla eliminada"}


@app.post("/plantillas/{p_id}/preview")
async def preview_plantilla(p_id: int, user=Depends(verificar_usuario)):
    """Genera un PDF de preview con datos de ejemplo."""
    res = supabase.table("plantillas") \
        .select("*") \
        .eq("id", p_id) \
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404)
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)

    # Datos de ejemplo
    ejemplo = {
        "factura_numero": "2026-0001",
        "barco": "MSC EJEMPLO",
        "tickets": [
            {
                "numero_ticket": "T-001", "importe": 45.00,
                "contacto_metodo": "whatsapp",
                "pasajeros": ["John Smith", "Jane Doe"],
                "fechas_solicitud": ["2026-03-15"],
                "fechas_servicio": ["2026-03-16"],
                "o_aeropuerto": True, "d_buque": True,
                "ida_vuelta": False, "comentarios": "2 maletas",
            },
            {
                "numero_ticket": "T-002", "importe": 35.00,
                "contacto_metodo": "telefono",
                "pasajeros": ["María García"],
                "fechas_solicitud": ["2026-03-16"],
                "fechas_servicio": ["2026-03-17"],
                "o_buque": True, "d_hotel": True, "d_hotel_texto": "Hotel Palace",
                "ida_vuelta": True, "comentarios": "",
            },
        ],
    }

    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)

    if p["tipo"] == "visual":
        config = json.loads(p["config_json"])
        html = generar_html_visual(config, ejemplo)
        pdf_path = html_a_pdf(html)
        return FileResponse(pdf_path, filename="preview.pdf",
                            headers={"Content-Disposition": "inline; filename=preview.pdf"},
                            background=cleanup)
    elif p["tipo"] == "excel":
        if not p.get("excel_path"):
            raise HTTPException(status_code=400, detail="Plantilla sin archivo Excel")
        excel_bytes = supabase.storage.from_("plantillas").download(p["excel_path"])
        out = procesar_con_plantilla_excel(excel_bytes, ejemplo)
        return FileResponse(out, filename="preview.xlsx",
                            headers={"Content-Disposition": "inline; filename=preview.xlsx"},
                            background=cleanup)


@app.post("/generar-con-plantilla")
async def generar_con_plantilla(
    datos: DatosFactura,
    formato: str = "pdf",
    plantilla_id: Optional[int] = None,
    user=Depends(verificar_usuario),
):
    """Genera factura usando una plantilla específica."""
    # Guardar en historial
    supabase.table("facturas").insert(datos_registro(user.id, datos)).execute()

    # Sin plantilla → flujo original
    if not plantilla_id:
        return procesar_descarga(datos.dict(), formato)

    # Cargar plantilla
    res = supabase.table("plantillas") \
        .select("*").eq("id", plantilla_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    p = res.data
    if p["user_id"] != user.id and not p.get("es_publica"):
        raise HTTPException(status_code=403)

    nombre_base = f"{datos.barco.replace(' ', '_').upper()}_{datetime.now().strftime('%d_%m_%Y')}"
    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)

    if p["tipo"] == "visual":
        config = json.loads(p["config_json"])
        html = generar_html_visual(config, datos.dict())
        pdf_path = html_a_pdf(html)
        pdf_name = f"{nombre_base}.pdf"
        final_path = os.path.join(TEMP_DIR, pdf_name)
        shutil.move(pdf_path, final_path)
        return FileResponse(final_path, filename=pdf_name,
                            headers={"Content-Disposition": f"attachment; filename={pdf_name}"},
                            background=cleanup)

    elif p["tipo"] == "excel":
        if not p.get("excel_path"):
            raise HTTPException(status_code=400)
        excel_bytes = supabase.storage.from_("plantillas").download(p["excel_path"])
        out = procesar_con_plantilla_excel(excel_bytes, datos.dict())
        xlsx_name = f"{nombre_base}.xlsx"
        final_path = os.path.join(TEMP_DIR, xlsx_name)
        shutil.move(out, final_path)

        if formato == "excel":
            return FileResponse(final_path, filename=xlsx_name,
                                headers={"Content-Disposition": f"attachment; filename={xlsx_name}"},
                                background=cleanup)
        # Convertir a PDF
        lo_profile = os.path.join(TEMP_DIR, "lo_profile_tpl")
        subprocess.run(
            ["libreoffice", f"-env:UserInstallation=file://{lo_profile}",
             "--headless", "--convert-to", "pdf", "--outdir", TEMP_DIR, final_path],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        pdf_name = f"{nombre_base}.pdf"
        pdf_path = os.path.join(TEMP_DIR, pdf_name)
        if formato == "pdf":
            return FileResponse(pdf_path, filename=pdf_name,
                                headers={"Content-Disposition": f"attachment; filename={pdf_name}"},
                                background=cleanup)
        # ambos → ZIP
        zip_name = f"{nombre_base}.zip"
        zip_path = os.path.join(TEMP_DIR, zip_name)
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.write(final_path, arcname=xlsx_name)
            if os.path.exists(pdf_path):
                zipf.write(pdf_path, arcname=pdf_name)
        return FileResponse(zip_path, filename=zip_name,
                            headers={"Content-Disposition": f"attachment; filename={zip_name}"},
                            background=cleanup)