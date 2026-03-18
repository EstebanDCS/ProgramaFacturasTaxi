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

# --- FUNCIONES DE EXCEL Y PDF (CON LIBREOFFICE) ---
def crear_excel(datos_dict, nombre_base):
    base_path = os.path.dirname(__file__)
    template_path = os.path.join(base_path, "plantilla.xlsm")
    
    temp_dir = os.path.join(base_path, "temp_files")
    os.makedirs(temp_dir, exist_ok=True)
    
    name_xlsm = f"{nombre_base}.xlsm"
    path_salida = os.path.join(temp_dir, name_xlsm)
    
    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    
    # FORZAR AJUSTE A4 EN TODAS LAS HOJAS (con manejo de errores)
    for sheet in wb.worksheets:
        try:
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            sheet.page_setup.paperSize = getattr(sheet, 'PAPERSIZE_A4', 9)
            if sheet.sheet_properties and sheet.sheet_properties.pageSetUpPr:
                sheet.sheet_properties.pageSetUpPr.fitToPage = True
        except Exception as e:
            print(f"Aviso al configurar pagina en openpyxl: {e}")
        
    ws = wb.active
    ws["B2"] = datos_dict.get('factura_numero', '')
    ws["B3"] = datos_dict.get('barco', '').upper()
    
    fila = 6
    for t in datos_dict.get('tickets', []):
        ws.cell(row=fila, column=1, value=t.get('numero_ticket', ''))
        ws.cell(row=fila, column=2, value=", ".join(t.get('pasajeros', [])))
        ws.cell(row=fila, column=3, value=t.get('importe', 0))
        fila += 1
    
    wb.save(path_salida)
    return path_salida, name_xlsm

def procesar_descarga(datos_dict, formato):
    nombre_base = f"{datos_dict.get('barco', 'Factura').replace(' ', '_').upper()}_{datetime.now().strftime('%d_%m_%Y')}"
    
    # 1. Siempre creamos el Excel primero
    path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
    temp_dir = os.path.dirname(path_xlsm)
    
    if formato == "excel":
        return FileResponse(path_xlsm, filename=name_xlsm, headers={"Content-Disposition": f"attachment; filename={name_xlsm}"})
        
    # 2. Si piden PDF o Ambos, convertimos el Excel usando LibreOffice
    pdf_name = f"{nombre_base}.pdf"
    pdf_path = os.path.join(temp_dir, pdf_name)
    
    try:
        # Usamos un perfil temporal para evitar errores de permisos en Render
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
        raise HTTPException(status_code=500, detail="Error al generar el PDF. Revisa los logs de Render.")

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