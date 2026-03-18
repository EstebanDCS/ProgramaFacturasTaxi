import os
import json
import zipfile
import io
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from xhtml2pdf import pisa

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

class DatosTicket(BaseModel):
    numero_ticket: str
    importe: float
    pasajeros: List[str] = []
    # ... otros campos omitidos por brevedad pero procesados en el JSON

class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    tickets: List[DatosTicket]

# --- GENERACIÓN DE PDF (HTML a PDF) ---
def exportar_pdf(datos):
    html = f"""
    <html>
    <head><style>
        body {{ font-family: Helvetica; font-size: 12px; }}
        .header {{ text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        .total {{ font-weight: bold; font-size: 16px; margin-top: 20px; }}
    </style></head>
    <body>
        <div class="header">
            <h1>FACTURA DE SERVICIO</h1>
            <p>Barco: {datos['barco']} | Factura Nº: {datos['factura_numero']}</p>
        </div>
        <table>
            <thead><tr><th>Ticket</th><th>Pasajeros</th><th>Importe</th></tr></thead>
            <tbody>
    """
    total = 0
    for t in datos['tickets']:
        html += f"<tr><td>{t['numero_ticket']}</td><td>{', '.join(t['pasajeros'])}</td><td>{t['importe']}€</td></tr>"
        total += t['importe']
    
    html += f"""
            </tbody>
        </table>
        <div class="total text-right">TOTAL: {total:.2f}€</div>
    </body></html>
    """
    result = io.BytesIO()
    pisa.CreatePDF(io.BytesIO(html.encode("utf-8")), dest=result)
    return result.getvalue()

# --- RUTAS ---
@app.post("/generar")
async def generar(datos: DatosFactura, formato: str = "excel", x_password: str = Header(None)):
    if x_password != PASSWORD_SECRETA: raise HTTPException(status_code=401)
    
    # Guardar en BD
    db = SessionLocal()
    nueva = FacturaDB(numero_factura=datos.factura_numero, barco=datos.barco.upper(), 
                      importe_total=sum(t.importe for t in datos.tickets), datos_json=datos.json())
    db.add(nueva); db.commit(); db.close()

    nombre_base = f"{datos.barco.upper()}_{datetime.now().strftime('%d_%m_%Y')}"

    if formato == "pdf":
        pdf_content = exportar_pdf(datos.dict())
        return StreamingResponse(io.BytesIO(pdf_content), media_type="application/pdf", 
                                 headers={"Content-Disposition": f"attachment; filename={nombre_base}.pdf"})

    # Lógica de Excel y Ambos se mantiene igual pero apuntando a estas funciones
    return {"status": "procesando"}