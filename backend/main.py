import os
import json
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from openpyxl.styles import Alignment
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# --- CONFIGURACIÓN BASE DE DATOS ---
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelo de la tabla de Facturas (La crea Python sola)
class FacturaDB(Base):
    __tablename__ = "facturas"
    id = Column(Integer, primary_key=True, index=True)
    numero_factura = Column(String)
    barco = Column(String)
    importe_total = Column(Float)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    datos_json = Column(Text)

# Crear tablas automáticamente
Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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

# --- RUTAS ---
@app.get("/login")
async def login(x_password: str = Header(None)):
    if x_password == PASSWORD_SECRETA: return {"status": "ok"}
    raise HTTPException(status_code=401)

@app.get("/historial")
async def obtener_historial(x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    db = SessionLocal()
    # Traemos las últimas 50 facturas
    registros = db.query(FacturaDB).order_by(FacturaDB.fecha_creacion.desc()).limit(50).all()
    db.close()
    return registros

@app.post("/generar")
async def generar_documento(datos: DatosFactura, x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)

    try:
        # 💾 GUARDAR EN BD
        db = SessionLocal()
        total = sum(t.importe for t in datos.tickets)
        nueva_factura = FacturaDB(
            numero_factura=datos.factura_numero,
            barco=datos.barco.upper(),
            importe_total=total,
            datos_json=json.dumps(datos.dict())
        )
        db.add(nueva_factura)
        db.commit()
        db.close()

        # 📄 GENERAR EXCEL (Lógica simplificada para ejemplo, usa la tuya completa aquí)
        template_path = "plantilla.xlsm"
        output_path = f"/tmp/{datos.barco}.xlsm"
        wb = openpyxl.load_workbook(template_path, keep_vba=True)
        # ... (aquí iría tu código de rellenar celdas que ya tenemos) ...
        wb.save(output_path)
        
        return FileResponse(output_path, filename=f"{datos.barco}.xlsm")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})