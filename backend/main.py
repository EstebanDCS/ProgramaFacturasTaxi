import os
import json
import zipfile
import subprocess
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# --- CONFIGURACIÓN BD ---
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class FacturaDB(Base):
    __tablename__ = "facturas"
    id = Column(Integer, primary_key=True, index=True)
    numero_factura = Column(String)
    barco = Column(String)
    importe_total = Column(Float)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    datos_json = Column(Text)

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])

PASSWORD_SECRETA = os.environ.get("TAXI_PASSWORD")

# --- MODELOS ---
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

    # Función inteligente para escribir en celdas combinadas sin crashear
    def escribir(ws, coord, valor):
        try:
            celda = ws[coord]
            if type(celda).__name__ == 'MergedCell':
                for rango in ws.merged_cells.ranges:
                    if coord in rango:
                        ws.cell(row=rango.min_row, column=rango.min_col).value = valor
                        return
            ws[coord] = valor
        except Exception as e:
            pass # Si falla una celda, ignora el error y sigue con el resto
    
    # ==========================================
    # --- 1. HOJA 1: FACTURA PRINCIPAL ---
    # ==========================================
    escribir(ws_factura, "E15", datos_dict.get('factura_numero', ''))
    barco = datos_dict.get('barco', '').upper()
    escribir(ws_factura, "C17", barco)
    
    tickets = datos_dict.get('tickets', [])
    
    # Buscar la fecha de servicio más reciente para la Factura
    todas_fechas = []
    for t in tickets:
        todas_fechas.extend(t.get('fechas_servicio', []))
    
    if todas_fechas:
        try:
            fechas_obj = [datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f]
            max_fecha = max(fechas_obj)
            escribir(ws_factura, "F17", max_fecha.strftime("%d/%m/%Y"))
        except:
            escribir(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
    else:
        escribir(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
        
    fila_ticket = 21
    total_importe = 0.0
    for t in tickets:
        pasajeros = ", ".join(t.get('pasajeros', []))
        num_ticket = t.get('numero_ticket', '')
        desc = f"Nº {num_ticket}" if num_ticket else "Ticket"
        if pasajeros: desc += f" — {pasajeros}"
        
        escribir(ws_factura, f"B{fila_ticket}", desc)
        escribir(ws_factura, f"F{fila_ticket}", float(t.get('importe', 0)))
        
        total_importe += float(t.get('importe', 0))
        fila_ticket += 1
        
    # Totales (Filas 38, 39, 40)
    base_imponible = total_importe / 1.10
    iva = total_importe - base_imponible
    escribir(ws_factura, "F38", round(base_imponible, 2))
    escribir(ws_factura, "F39", round(iva, 2))
    escribir(ws_factura, "F40", round(total_importe, 2))
    
    # ==========================================
    # --- 2. HOJA 2: BONOS (1 POR TICKET) ---
    # ==========================================
    if ws_template_bono and tickets:
        for i, t in enumerate(tickets):
            if i == 0:
                ws_bono = ws_template_bono
                ws_bono.title = f"Bono_{t.get('numero_ticket', i+1)}"
            else:
                ws_bono = wb.copy_worksheet(ws_template_bono)
                ws_bono.title = f"Bono_{t.get('numero_ticket', i+1)}"
            
            escribir(ws_bono, "E2", t.get('numero_ticket', ''))
            escribir(ws_bono, "E9", t.get('contacto_metodo', '').upper())
            
            f_sol = [datetime.strptime(f, "%Y-%m-%d").strftime("%d/%m/%Y") for f in t.get('fechas_solicitud', []) if f]
            f_ser = [datetime.strptime(f, "%Y-%m-%d").strftime("%d/%m/%Y") for f in t.get('fechas_servicio', []) if f]
            
            escribir(ws_bono, "C12", ", ".join(f_sol))
            escribir(ws_bono, "C14", ", ".join(f_ser))
            escribir(ws_bono, "C16", barco)
            escribir(ws_bono, "B19", ", ".join(t.get('pasajeros', [])))
            
            # Checkboxes Recogida
            if t.get('o_aeropuerto'): escribir(ws_bono, "C26", "X")
            if t.get('o_buque'): escribir(ws_bono, "C27", "X")
            if t.get('o_hotel'): 
                escribir(ws_bono, "C28", "X")
                escribir(ws_bono, "E28", t.get('o_hotel_texto', ''))
            if t.get('o_otros'):
                escribir(ws_bono, "C29", "X")
                escribir(ws_bono, "D30", t.get('o_otros_texto', ''))
                
            # Checkboxes Destino
            if t.get('d_aeropuerto'): escribir(ws_bono, "C33", "X")
            if t.get('d_buque'): escribir(ws_bono, "C34", "X")
            if t.get('d_hotel'): 
                escribir(ws_bono, "C35", "X")
                escribir(ws_bono, "E35", t.get('d_hotel_texto', ''))
            if t.get('d_hospital'):
                escribir(ws_bono, "C36", "X")
                escribir(ws_bono, "E36", t.get('d_hospital_texto', ''))
            if t.get('d_clinica'):
                escribir(ws_bono, "C37", "X")
                escribir(ws_bono, "E37", t.get('d_clinica_texto', ''))
            if t.get('d_inmigracion'): escribir(ws_bono, "C38", "X")
            if t.get('d_otros'):
                escribir(ws_bono, "C39", "X")
                escribir(ws_bono, "D40", t.get('d_otros_texto', ''))
                
            # Checkbox Ida y vuelta
            if t.get('ida_vuelta'):
                escribir(ws_bono, "C43", "X")
            else:
                escribir(ws_bono, "D43", "X")
                
            escribir(ws_bono, "B46", t.get('comentarios', ''))
            escribir(ws_bono, "E51", float(t.get('importe', 0)))

    # FORZAR AJUSTE A4 EN TODAS LAS HOJAS
    for sheet in wb.worksheets:
        try:
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            sheet.page_setup.paperSize = getattr(sheet, 'PAPERSIZE_A4', 9)
            if getattr(sheet, 'sheet_properties', None) and getattr(sheet.sheet_properties, 'pageSetUpPr', None):
                sheet.sheet_properties.pageSetUpPr.fitToPage = True
        except:
            pass
            
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
        cmd = [
            "libreoffice", 
            f"-env:UserInstallation=file://{lo_profile}",
            "--headless", 
            "--convert-to", 
            "pdf", 
            "--outdir", 
            temp_dir, 
            path_xlsm
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        print(f"Error LibreOffice: {e}")
        raise HTTPException(status_code=500, detail="Error al generar el PDF.")

    if formato == "pdf":
        if os.path.exists(pdf_path):
            return FileResponse(pdf_path, filename=pdf_name, headers={"Content-Disposition": f"attachment; filename={pdf_name}"})
        else:
            raise HTTPException(status_code=500, detail="No se pudo crear el archivo PDF.")
            
    elif formato == "ambos":
        zip_name = f"{nombre_base}.zip"
        zip_path = os.path.join(temp_dir, zip_name)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            zipf.write(path_xlsm, arcname=name_xlsm)
            if os.path.exists(pdf_path):
                zipf.write(pdf_path, arcname=pdf_name)
            
        return FileResponse(zip_path, filename=zip_name, headers={"Content-Disposition": f"attachment; filename={zip_name}"})

# --- RUTAS DE LA API ---
@app.get("/login")
async def login(x_password: str = Header(None)):
    if x_password == PASSWORD_SECRETA: return {"status": "ok"}
    raise HTTPException(status_code=401)

@app.get("/historial")
async def historial(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    res = db.query(FacturaDB).order_by(FacturaDB.fecha_creacion.desc()).all()
    db.close()
    return res

@app.post("/solo-guardar")
async def solo_guardar(datos: DatosFactura, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    nueva = FacturaDB(
        numero_factura=datos.factura_numero,
        barco=datos.barco.upper(),
        importe_total=sum(t.importe for t in datos.tickets),
        datos_json=compact_json(datos.dict())
    )
    db.add(nueva); db.commit(); db.close()
    return {"msg": "✅ Datos guardados en la nube"}

@app.post("/generar")
async def generar(datos: DatosFactura, formato: str = "excel", x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    nueva = FacturaDB(
        numero_factura=datos.factura_numero,
        barco=datos.barco.upper(),
        importe_total=sum(t.importe for t in datos.tickets),
        datos_json=compact_json(datos.dict())
    )
    db.add(nueva); db.commit(); db.close()
    return procesar_descarga(datos.dict(), formato)

@app.get("/factura/{f_id}")
async def get_factura(f_id: int, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    db.close()
    if not f: raise HTTPException(status_code=404)
    return json.loads(f.datos_json)

@app.put("/actualizar/{f_id}")
async def actualizar(f_id: int, datos: DatosFactura, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    if not f:
        db.close()
        raise HTTPException(status_code=404)
    f.numero_factura = datos.factura_numero
    f.barco = datos.barco.upper()
    f.importe_total = sum(t.importe for t in datos.tickets)
    f.datos_json = compact_json(datos.dict())
    db.commit(); db.close()
    return {"msg": "✅ Factura actualizada"}

@app.put("/actualizar-generar/{f_id}")
async def actualizar_generar(f_id: int, datos: DatosFactura, formato: str = "excel", x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    if not f:
        db.close()
        raise HTTPException(status_code=404)
    f.numero_factura = datos.factura_numero
    f.barco = datos.barco.upper()
    f.importe_total = sum(t.importe for t in datos.tickets)
    f.datos_json = compact_json(datos.dict())
    db.commit(); db.close()
    return procesar_descarga(datos.dict(), formato)

@app.get("/re-descargar/{f_id}")
async def redescargar_file(f_id: int, formato: str = "excel", x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    db.close()
    if not f: raise HTTPException(status_code=404)
    return procesar_descarga(json.loads(f.datos_json), formato)

@app.delete("/eliminar-factura/{f_id}")
async def eliminar_factura(f_id: int, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    if not f:
        db.close()
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    db.delete(f)
    db.commit()
    db.close()
    return {"msg": "Factura eliminada"}

@app.delete("/limpiar-historial")
async def limpiar(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    db.query(FacturaDB).delete(); db.commit(); db.close()
    return {"msg": "ok"}