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

def exportar_pdf(datos):
    html = f"""
    <html>
    <head><style>
        body {{ font-family: Helvetica, sans-serif; font-size: 12px; color: #333; }}
        .header {{ text-align: center; border-bottom: 2px solid #0d6dfd; padding-bottom: 15px; margin-bottom: 20px; }}
        .header h1 {{ color: #0d6dfd; margin: 0; padding: 0; }}
        .info-box {{ margin-bottom: 20px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th {{ background-color: #f5f7fb; border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: bold; color: #1a2e4a; }}
        td {{ border: 1px solid #ddd; padding: 10px; text-align: left; }}
        .total-box {{ text-align: right; font-weight: bold; font-size: 18px; margin-top: 20px; color: #0d6dfd; }}
    </style></head>
    <body>
        <div class="header">
            <h1>FACTURA DE SERVICIOS - TAXI APP PRO</h1>
        </div>
        <div class="info-box">
            <strong>Barco / Referencia:</strong> {datos.get('barco', '').upper()}<br>
            <strong>Nº de Factura:</strong> {datos.get('factura_numero', '')}<br>
            <strong>Fecha de Emisión:</strong> {datetime.now().strftime('%d/%m/%Y')}
        </div>
        <table>
            <thead>
                <tr>
                    <th>Nº Ticket</th>
                    <th>Pasajeros</th>
                    <th>Contacto</th>
                    <th>Importe</th>
                </tr>
            </thead>
            <tbody>
    """
    total = 0
    for t in datos.get('tickets', []):
        pasajeros = ", ".join(t.get('pasajeros', [])) if t.get('pasajeros') else "No especificado"
        html += f"""
                <tr>
                    <td>{t.get('numero_ticket', '')}</td>
                    <td>{pasajeros}</td>
                    <td>{t.get('contacto_metodo', '').capitalize()}</td>
                    <td>{t.get('importe', 0):.2f} €</td>
                </tr>
        """
        total += float(t.get('importe', 0))
    
    html += f"""
            </tbody>
        </table>
        <div class="total-box">TOTAL A PAGAR: {total:.2f} €</div>
    </body>
    </html>
    """
    result = io.BytesIO()
    pisa.CreatePDF(io.BytesIO(html.encode("utf-8")), dest=result)
    return result.getvalue()

def procesar_descarga(datos_dict, formato):
    nombre_base = f"{datos_dict.get('barco', 'Factura').replace(' ', '_').upper()}_{datetime.now().strftime('%d_%m_%Y')}"
    
    if formato == "pdf":
        pdf_bytes = exportar_pdf(datos_dict)
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={nombre_base}.pdf"})
        
    elif formato == "excel":
        path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
        return FileResponse(path_xlsm, filename=name_xlsm, headers={"Content-Disposition": f"attachment; filename={name_xlsm}"})
        
    elif formato == "ambos":
        path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
        pdf_bytes = exportar_pdf(datos_dict)
        
        temp_dir = os.path.dirname(path_xlsm)
        zip_name = f"{nombre_base}.zip"
        zip_path = os.path.join(temp_dir, zip_name)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            zipf.write(path_xlsm, arcname=name_xlsm)
            zipf.writestr(f"{nombre_base}.pdf", pdf_bytes)
            
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