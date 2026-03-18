import os
import json
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# --- CONFIGURACIÓN DB ---
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
    d_aeropuerto: bool = False
    d_buque: bool = False
    d_hotel: bool = False
    d_hotel_texto: str = ""
    ida_vuelta: bool = False
    comentarios: str = ""

class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    tickets: List[DatosTicket]

# --- LÓGICA EXCEL (CENTRALIZADA) ---
def crear_excel(datos_dict):
    base_path = os.path.dirname(__file__)
    template_path = os.path.join(base_path, "plantilla.xlsm")
    output_name = f"Factura_{datos_dict['barco']}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsm"
    output_path = os.path.join("/tmp", output_name)
    
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
    
    wb.save(output_path)
    return output_path, output_name

# --- RUTAS ---
@app.get("/login")
async def login(x_password: str = Header(None)):
    if x_password == PASSWORD_SECRETA: return {"status": "ok"}
    raise HTTPException(status_code=401)

@app.get("/historial")
async def obtener_historial(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    registros = db.query(FacturaDB).order_by(FacturaDB.fecha_creacion.desc()).all()
    db.close()
    return registros

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
    
    path, name = crear_excel(datos.dict())
    return FileResponse(path, filename=name)

@app.get("/re-descargar/{f_id}")
async def redescargar(f_id: int, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    db.close()
    if not f: raise HTTPException(status_code=404)
    
    path, name = crear_excel(json.loads(f.datos_json))
    return FileResponse(path, filename=name)

@app.delete("/limpiar-historial")
async def limpiar(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    db.query(FacturaDB).delete(); db.commit(); db.close()
    return {"msg": "Historial vaciado"}