import os
import json
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# --- CONFIGURACIÓN DE BASE DE DATOS ---
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
# expose_headers es vital para que el navegador vea el nombre del archivo al descargar
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"], 
    expose_headers=["Content-Disposition"]
)

PASSWORD_SECRETA = os.environ.get("TAXI_PASSWORD")

# --- MODELOS DE DATOS ---
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

# --- LÓGICA DE EXCEL ---
def logic_crear_excel(datos_dict):
    base_path = os.path.dirname(__file__)
    template_path = os.path.join(base_path, "plantilla.xlsm")
    nombre = f"Factura_{datos_dict['barco']}_{datetime.now().strftime('%H%M%S')}.xlsm"
    output = os.path.join("/tmp", nombre)
    
    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    ws = wb.active
    ws["B2"] = datos_dict['factura_numero']
    ws["B3"] = datos_dict['barco'].upper()
    
    fila = 6
    for t in datos_dict['tickets']:
        ws.cell(row=fila, column=1, value=t['numero_ticket'])
        ws.cell(row=fila, column=2, value=", ".join(t['pasajeros']))
        ws.cell(row=fila, column=3, value=t['importe'])
        fila += 1
    
    wb.save(output)
    return output, nombre

# --- RUTAS ---
@app.get("/login")
async def login(x_password: str = Header(None)):
    if x_password == PASSWORD_SECRETA: return {"status": "ok"}
    raise HTTPException(status_code=401)

@app.get("/historial")
async def historial(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    rows = db.query(FacturaDB).order_by(FacturaDB.fecha_creacion.desc()).all()
    db.close()
    return rows

@app.post("/generar")
async def generar(datos: DatosFactura, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    nueva = FacturaDB(
        numero_factura=datos.factura_numero,
        barco=datos.barco.upper(),
        importe_total=sum(t.importe for t in datos.tickets),
        datos_json=json.dumps(datos.dict())
    )
    db.add(nueva); db.commit(); db.close()
    path, name = logic_crear_excel(datos.dict())
    return FileResponse(path, filename=name, media_type='application/vnd.ms-excel.sheet.macroEnabled.12')

@app.get("/re-descargar/{f_id}")
async def redescargar(f_id: int, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    db.close()
    if not f: raise HTTPException(status_code=404)
    path, name = logic_crear_excel(json.loads(f.datos_json))
    return FileResponse(path, filename=name, headers={"Content-Disposition": f"attachment; filename={name}"})

@app.delete("/limpiar-historial")
async def limpiar(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    db.query(FacturaDB).delete(); db.commit(); db.close()
    return {"msg": "Historial borrado"}