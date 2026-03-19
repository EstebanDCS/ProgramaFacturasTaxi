import os
import json
import zipfile
import subprocess
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from openpyxl.styles import Alignment
from datetime import datetime
from supabase import create_client, Client

# --- CONFIGURACIÓN SUPABASE ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠️ ADVERTENCIA: Faltan las variables SUPABASE_URL o SUPABASE_KEY en Render")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])

# --- VERIFICADOR DE SESIÓN DE GOOGLE ---
async def verificar_usuario(authorization: str = Header(None)):
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
        raise HTTPException(status_code=401, detail=f"Token no válido: {str(e)}")

# --- MODELOS ---
class DatosLinea(BaseModel):
    descripcion: str
    importe: float

class DatosImpuesto(BaseModel):
    nombre: str
    porcentaje: float

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
    lineas: List[DatosLinea] = []
    impuestos: List[DatosImpuesto] = []
    incluir_tickets: bool = False
    tickets: List[DatosTicket] = []

def compact_json(data: dict) -> str:
    def strip(obj):
        if isinstance(obj, dict):
            return {k: strip(v) for k, v in obj.items() if v not in (False, "", [], None)}
        if isinstance(obj, list):
            return [strip(i) for i in obj]
        return obj
    return json.dumps(strip(data), separators=(',', ':'))

# --- FUNCIONES DE EXCEL Y PDF ---
def crear_excel(datos_dict, nombre_base):
    base_path = os.path.dirname(__file__)
    template_path = os.path.join(base_path, "plantilla.xlsm")
    temp_dir = os.path.join(base_path, "temp_files")
    os.makedirs(temp_dir, exist_ok=True)
    
    name_xlsm = f"{nombre_base}.xlsm"
    path_salida = os.path.join(temp_dir, name_xlsm)
    
    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    ws_factura = wb.worksheets[0]
    ws_template_bono = wb.worksheets[1] if len(wb.worksheets) > 1 else None

    def escribir(ws, coord, valor):
        try:
            if type(ws[coord]).__name__ != 'MergedCell':
                ws[coord] = valor
        except:
            pass
    
    # 1. FACTURA PRINCIPAL
    escribir(ws_factura, "E15", datos_dict.get('factura_numero', ''))
    barco = datos_dict.get('barco', '').upper()
    escribir(ws_factura, "C17", barco)
    
    # Fecha: La calculamos de los tickets (si hay) o ponemos la de hoy
    todas_fechas = []
    for t in datos_dict.get('tickets', []): todas_fechas.extend(t.get('fechas_servicio', []))
    if todas_fechas:
        try:
            fechas_obj = [datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f]
            escribir(ws_factura, "F17", max(fechas_obj).strftime("%d/%m/%Y"))
        except:
            escribir(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
    else:
        escribir(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
        
    # --- LÍNEAS DE LA FACTURA GENERAL ---
    desc_lines = []
    importe_lines = []
    base_imponible = 0.0
    
    for l in datos_dict.get('lineas', []):
        desc = str(l.get('descripcion', '')).strip()
        importe = float(l.get('importe', 0))
        if desc:
            desc_lines.append(desc)
            importe_lines.append(f"{importe:.2f}")
            base_imponible += importe
            
    escribir(ws_factura, "B21", "\n".join(desc_lines))
    escribir(ws_factura, "F21", "\n".join(importe_lines))
    
    try:
        ws_factura["B21"].alignment = Alignment(wrap_text=True, vertical='top', horizontal='left')
        ws_factura["F21"].alignment = Alignment(wrap_text=True, vertical='top', horizontal='right')
    except:
        pass
        
    # --- IMPUESTOS Y TOTALES ---
    escribir(ws_factura, "F38", round(base_imponible, 2))
    
    # Limpiamos las celdas debajo por si la plantilla original tiene texto
    for r in range(39, 45):
        escribir(ws_factura, f"E{r}", "")
        escribir(ws_factura, f"F{r}", "")
        
    fila_imp = 39
    total_impuestos = 0.0
    for imp in datos_dict.get('impuestos', []):
        pct = float(imp.get('porcentaje', 0))
        monto = base_imponible * (pct / 100.0)
        total_impuestos += monto
        escribir(ws_factura, f"E{fila_imp}", f"{imp.get('nombre', '')} {pct}%")
        escribir(ws_factura, f"F{fila_imp}", round(monto, 2))
        fila_imp += 1
        
    total_final = base_imponible + total_impuestos
    escribir(ws_factura, f"E{fila_imp}", "TOTAL")
    escribir(ws_factura, f"F{fila_imp}", round(total_final, 2))
    
    # 2. BONOS (HOJAS EXTRA)
    tickets = datos_dict.get('tickets', [])
    incluir = datos_dict.get('incluir_tickets', False)
    
    if incluir and ws_template_bono and tickets:
        for i, t in enumerate(tickets):
            ws_bono = ws_template_bono if i == 0 else wb.copy_worksheet(ws_template_bono)
            ws_bono.title = f"Bono_{t.get('numero_ticket', i+1)}"
            
            escribir(ws_bono, "E2", t.get('numero_ticket', ''))
            escribir(ws_bono, "E9", t.get('contacto_metodo', '').upper())
            
            f_sol = [datetime.strptime(f, "%Y-%m-%d").strftime("%d/%m/%Y") for f in t.get('fechas_solicitud', []) if f]
            f_ser = [datetime.strptime(f, "%Y-%m-%d").strftime("%d/%m/%Y") for f in t.get('fechas_servicio', []) if f]
            escribir(ws_bono, "C12", ", ".join(f_sol))
            escribir(ws_bono, "C14", ", ".join(f_ser))
            escribir(ws_bono, "C16", barco)
            escribir(ws_bono, "B19", ", ".join(t.get('pasajeros', [])))
            
            if t.get('o_aeropuerto'): escribir(ws_bono, "C26", "X")
            if t.get('o_buque'): escribir(ws_bono, "C27", "X")
            if t.get('o_hotel'): 
                escribir(ws_bono, "C28", "X"); escribir(ws_bono, "E28", t.get('o_hotel_texto', ''))
            if t.get('o_otros'):
                escribir(ws_bono, "C29", "X"); escribir(ws_bono, "D30", t.get('o_otros_texto', ''))
                
            if t.get('d_aeropuerto'): escribir(ws_bono, "C33", "X")
            if t.get('d_buque'): escribir(ws_bono, "C34", "X")
            if t.get('d_hotel'): 
                escribir(ws_bono, "C35", "X"); escribir(ws_bono, "E35", t.get('d_hotel_texto', ''))
            if t.get('d_hospital'):
                escribir(ws_bono, "C36", "X"); escribir(ws_bono, "E36", t.get('d_hospital_texto', ''))
            if t.get('d_clinica'):
                escribir(ws_bono, "C37", "X"); escribir(ws_bono, "E37", t.get('d_clinica_texto', ''))
            if t.get('d_inmigracion'): escribir(ws_bono, "C38", "X")
            if t.get('d_otros'):
                escribir(ws_bono, "C39", "X"); escribir(ws_bono, "D40", t.get('d_otros_texto', ''))
                
            if t.get('ida_vuelta'): escribir(ws_bono, "C43", "X")
            else: escribir(ws_bono, "D43", "X")
                
            escribir(ws_bono, "B46", t.get('comentarios', ''))
            escribir(ws_bono, "E51", float(t.get('importe', 0)))
    elif ws_template_bono:
        # Si no se incluyen tickets, eliminamos la hoja verde del Excel
        wb.remove(ws_template_bono)

    for sheet in wb.worksheets:
        try:
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            sheet.page_setup.paperSize = getattr(sheet, 'PAPERSIZE_A4', 9)
            if getattr(sheet, 'sheet_properties', None) and getattr(sheet.sheet_properties, 'pageSetUpPr', None):
                sheet.sheet_properties.pageSetUpPr.fitToPage = True
        except: pass
            
    wb.save(path_salida)
    return path_salida, name_xlsm

def procesar_descarga(datos_dict, formato):
    nombre_base = f"{datos_dict.get('barco', 'Factura').replace(' ', '_').upper()}_{datetime.now().strftime('%d_%m_%Y')}"
    path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
    temp_dir = os.path.dirname(path_xlsm)
    
    if formato == "excel":
        return FileResponse(path_xlsm, filename=name_xlsm, headers={"Content-Disposition": f"attachment; filename={name_xlsm}"})
        
    pdf_name = f"{nombre_base}.pdf"
    pdf_path = os.path.join(temp_dir, pdf_name)
    
    try:
        lo_profile = os.path.join(temp_dir, "lo_profile")
        subprocess.run(["libreoffice", f"-env:UserInstallation=file://{lo_profile}", "--headless", "--convert-to", "pdf", "--outdir", temp_dir, path_xlsm], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except:
        raise HTTPException(status_code=500, detail="Error al generar el PDF.")

    if formato == "pdf":
        if os.path.exists(pdf_path): return FileResponse(pdf_path, filename=pdf_name, headers={"Content-Disposition": f"attachment; filename={pdf_name}"})
        raise HTTPException(status_code=500, detail="No se pudo crear el archivo PDF.")
            
    elif formato == "ambos":
        zip_name = f"{nombre_base}.zip"
        zip_path = os.path.join(temp_dir, zip_name)
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            zipf.write(path_xlsm, arcname=name_xlsm)
            if os.path.exists(pdf_path): zipf.write(pdf_path, arcname=pdf_name)
        return FileResponse(zip_path, filename=zip_name, headers={"Content-Disposition": f"attachment; filename={zip_name}"})


# --- RUTAS DE LA API (CON MANEJO EXHAUSTIVO DE ERRORES) ---
def calcular_total_py(datos: DatosFactura) -> float:
    base = sum(l.importe for l in datos.lineas)
    imps = sum(base * (i.porcentaje / 100.0) for i in datos.impuestos)
    return base + imps

@app.get("/historial")
async def historial(user = Depends(verificar_usuario)):
    try:
        res = supabase.table("facturas").select("id, numero_factura, barco, importe_total, fecha_creacion").eq("user_id", user.id).order("fecha_creacion", desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/solo-guardar")
async def solo_guardar(datos: DatosFactura, user = Depends(verificar_usuario)):
    try:
        nueva = {
            "user_id": user.id,
            "numero_factura": datos.factura_numero,
            "barco": datos.barco.upper(),
            "importe_total": calcular_total_py(datos),
            "datos_json": compact_json(datos.dict())
        }
        supabase.table("facturas").insert(nueva).execute()
        return {"msg": "✅ Datos guardados en la nube"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la Base de Datos: {str(e)}")

@app.post("/generar")
async def generar(datos: DatosFactura, formato: str = "excel", user = Depends(verificar_usuario)):
    try:
        nueva = {
            "user_id": user.id,
            "numero_factura": datos.factura_numero,
            "barco": datos.barco.upper(),
            "importe_total": calcular_total_py(datos),
            "datos_json": compact_json(datos.dict())
        }
        supabase.table("facturas").insert(nueva).execute()
        return procesar_descarga(datos.dict(), formato)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la Base de Datos: {str(e)}")

@app.get("/factura/{f_id}")
async def get_factura(f_id: int, user = Depends(verificar_usuario)):
    try:
        res = supabase.table("facturas").select("datos_json").eq("id", f_id).eq("user_id", user.id).single().execute()
        if not res.data: raise HTTPException(status_code=404)
        return json.loads(res.data["datos_json"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/actualizar/{f_id}")
async def actualizar(f_id: int, datos: DatosFactura, user = Depends(verificar_usuario)):
    try:
        nueva = {
            "numero_factura": datos.factura_numero,
            "barco": datos.barco.upper(),
            "importe_total": calcular_total_py(datos),
            "datos_json": compact_json(datos.dict())
        }
        supabase.table("facturas").update(nueva).eq("id", f_id).eq("user_id", user.id).execute()
        return {"msg": "✅ Factura actualizada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/actualizar-generar/{f_id}")
async def actualizar_generar(f_id: int, datos: DatosFactura, formato: str = "excel", user = Depends(verificar_usuario)):
    try:
        nueva = {
            "numero_factura": datos.factura_numero,
            "barco": datos.barco.upper(),
            "importe_total": calcular_total_py(datos),
            "datos_json": compact_json(datos.dict())
        }
        supabase.table("facturas").update(nueva).eq("id", f_id).eq("user_id", user.id).execute()
        return procesar_descarga(datos.dict(), formato)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/re-descargar/{f_id}")
async def redescargar_file(f_id: int, formato: str = "excel", user = Depends(verificar_usuario)):
    try:
        res = supabase.table("facturas").select("datos_json").eq("id", f_id).eq("user_id", user.id).single().execute()
        if not res.data: raise HTTPException(status_code=404)
        return procesar_descarga(json.loads(res.data["datos_json"]), formato)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/eliminar-factura/{f_id}")
async def eliminar_factura(f_id: int, user = Depends(verificar_usuario)):
    try:
        supabase.table("facturas").delete().eq("id", f_id).eq("user_id", user.id).execute()
        return {"msg": "Factura eliminada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/limpiar-historial")
async def limpiar(user = Depends(verificar_usuario)):
    try:
        supabase.table("facturas").delete().eq("user_id", user.id).execute()
        return {"msg": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))