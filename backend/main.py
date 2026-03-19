import os
import json
import zipfile
import shutil
import subprocess
from contextlib import contextmanager
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import List, Optional
import openpyxl
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ─── CONFIGURACIÓN BD ────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
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

# ─── APP ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Taxi App Pro API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

PASSWORD_SECRETA = os.environ.get("TAXI_PASSWORD", "")
BASE_DIR = os.path.dirname(__file__)
TEMP_DIR = os.path.join(BASE_DIR, "temp_files")


# ─── DEPENDENCIAS ────────────────────────────────────────────────────────────
def get_db():
    """Inyecta una sesión de BD y garantiza su cierre."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verificar_password(x_password: str = Header(None)):
    """Dependencia de autenticación reutilizable."""
    if x_password != PASSWORD_SECRETA:
        raise HTTPException(status_code=401, detail="No autorizado")
    return x_password


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
    """Escribe en una celda, resolviendo celdas combinadas automáticamente."""
    try:
        celda = ws[coord]
        if type(celda).__name__ == "MergedCell":
            for rango in ws.merged_cells.ranges:
                if coord in rango:
                    ws.cell(row=rango.min_row, column=rango.min_col).value = valor
                    return
        ws[coord] = valor
    except Exception:
        pass


def extraer_fecha_mas_reciente(tickets: list) -> Optional[datetime]:
    """Devuelve la fecha de servicio más reciente de todos los tickets."""
    todas = []
    for t in tickets:
        for f in t.get("fechas_servicio", []):
            try:
                todas.append(datetime.strptime(f, "%Y-%m-%d"))
            except ValueError:
                continue
    return max(todas) if todas else None


def formatear_fechas(fechas: list, fmt_in="%Y-%m-%d", fmt_out="%d/%m/%Y") -> list:
    """Convierte una lista de fechas de un formato a otro."""
    resultado = []
    for f in fechas:
        try:
            resultado.append(datetime.strptime(f, fmt_in).strftime(fmt_out))
        except ValueError:
            continue
    return resultado


# ─── GENERACIÓN DE EXCEL ─────────────────────────────────────────────────────
def crear_excel(datos: dict, nombre_base: str) -> tuple[str, str]:
    """Genera el archivo .xlsm a partir de la plantilla y los datos."""
    template_path = os.path.join(BASE_DIR, "plantilla.xlsm")
    os.makedirs(TEMP_DIR, exist_ok=True)

    name_xlsm = f"{nombre_base}.xlsm"
    path_salida = os.path.join(TEMP_DIR, name_xlsm)

    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    ws_factura = wb.worksheets[0]
    ws_template_bono = wb.worksheets[1] if len(wb.worksheets) > 1 else None
    esc = escribir_celda  # alias corto

    tickets = datos.get("tickets", [])
    barco = datos.get("barco", "").upper()

    # ── Hoja 1: Factura principal ──
    esc(ws_factura, "E15", datos.get("factura_numero", ""))
    esc(ws_factura, "C17", barco)

    fecha_max = extraer_fecha_mas_reciente(tickets)
    esc(ws_factura, "F17", (fecha_max or datetime.now()).strftime("%d/%m/%Y"))

    total_importe = sum(float(t.get("importe", 0)) for t in tickets)
    numeros = [str(t.get("numero_ticket", "")) for t in tickets]
    esc(ws_factura, "B21", ", ".join(numeros))

    base_imponible = total_importe / 1.10
    iva = total_importe - base_imponible
    esc(ws_factura, "F38", round(base_imponible, 2))
    esc(ws_factura, "F39", round(iva, 2))
    esc(ws_factura, "F40", round(total_importe, 2))

    # ── Hoja 2+: Bonos (1 por ticket) ──
    if ws_template_bono and tickets:
        for i, t in enumerate(tickets):
            ws = ws_template_bono if i == 0 else wb.copy_worksheet(ws_template_bono)
            ws.title = f"Bono_{t.get('numero_ticket', i + 1)}"

            esc(ws, "E2", t.get("numero_ticket", ""))
            esc(ws, "E9", t.get("contacto_metodo", "").upper())
            esc(ws, "C12", ", ".join(formatear_fechas(t.get("fechas_solicitud", []))))
            esc(ws, "C14", ", ".join(formatear_fechas(t.get("fechas_servicio", []))))
            esc(ws, "C16", barco)
            esc(ws, "B19", ", ".join(t.get("pasajeros", [])))

            # Checkboxes recogida
            MAPA_RECOGIDA = [
                ("o_aeropuerto", "C26", None),
                ("o_buque",      "C27", None),
                ("o_hotel",      "C28", ("o_hotel_texto", "E28")),
                ("o_otros",      "C29", ("o_otros_texto", "D30")),
            ]
            for campo, celda_check, texto_info in MAPA_RECOGIDA:
                if t.get(campo):
                    esc(ws, celda_check, "X")
                    if texto_info:
                        esc(ws, texto_info[1], t.get(texto_info[0], ""))

            # Checkboxes destino
            MAPA_DESTINO = [
                ("d_aeropuerto",  "C33", None),
                ("d_buque",       "C34", None),
                ("d_hotel",       "C35", ("d_hotel_texto",    "E35")),
                ("d_hospital",    "C36", ("d_hospital_texto", "E36")),
                ("d_clinica",     "C37", ("d_clinica_texto",  "E37")),
                ("d_inmigracion", "C38", None),
                ("d_otros",       "C39", ("d_otros_texto",    "D40")),
            ]
            for campo, celda_check, texto_info in MAPA_DESTINO:
                if t.get(campo):
                    esc(ws, celda_check, "X")
                    if texto_info:
                        esc(ws, texto_info[1], t.get(texto_info[0], ""))

            # Ida y vuelta
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
    except Exception as e:
        print(f"Error LibreOffice: {e}")
        raise HTTPException(status_code=500, detail="Error al generar el PDF.")

    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="No se pudo crear el archivo PDF.")

    if formato == "pdf":
        return FileResponse(
            pdf_path, filename=pdf_name,
            headers={"Content-Disposition": f"attachment; filename={pdf_name}"},
            background=cleanup,
        )

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


# ─── HELPERS DE BD ───────────────────────────────────────────────────────────
def crear_registro(db: Session, datos: DatosFactura) -> FacturaDB:
    """Crea y persiste un nuevo registro de factura."""
    nueva = FacturaDB(
        numero_factura=datos.factura_numero,
        barco=datos.barco.upper(),
        importe_total=datos.importe_total,
        datos_json=compact_json(datos.model_dump()),
    )
    db.add(nueva)
    db.commit()
    return nueva


def obtener_factura(db: Session, f_id: int) -> FacturaDB:
    """Obtiene una factura o lanza 404."""
    f = db.query(FacturaDB).filter(FacturaDB.id == f_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return f


def actualizar_registro(db: Session, f: FacturaDB, datos: DatosFactura):
    """Actualiza los campos de una factura existente."""
    f.numero_factura = datos.factura_numero
    f.barco = datos.barco.upper()
    f.importe_total = datos.importe_total
    f.datos_json = compact_json(datos.model_dump())
    db.commit()


# ─── RUTAS ───────────────────────────────────────────────────────────────────
@app.get("/login")
async def login(_: str = Depends(verificar_password)):
    return {"status": "ok"}


@app.get("/historial")
async def historial(
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    return db.query(FacturaDB).order_by(FacturaDB.fecha_creacion.desc()).all()


@app.post("/solo-guardar")
async def solo_guardar(
    datos: DatosFactura,
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    crear_registro(db, datos)
    return {"msg": "✅ Datos guardados en la nube"}


@app.post("/generar")
async def generar(
    datos: DatosFactura,
    formato: str = "excel",
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    crear_registro(db, datos)
    return procesar_descarga(datos.model_dump(), formato)


@app.get("/factura/{f_id}")
async def get_factura(
    f_id: int,
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    f = obtener_factura(db, f_id)
    return json.loads(f.datos_json)


@app.put("/actualizar/{f_id}")
async def actualizar(
    f_id: int,
    datos: DatosFactura,
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    f = obtener_factura(db, f_id)
    actualizar_registro(db, f, datos)
    return {"msg": "✅ Factura actualizada"}


@app.put("/actualizar-generar/{f_id}")
async def actualizar_generar(
    f_id: int,
    datos: DatosFactura,
    formato: str = "excel",
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    f = obtener_factura(db, f_id)
    actualizar_registro(db, f, datos)
    return procesar_descarga(datos.model_dump(), formato)


@app.get("/re-descargar/{f_id}")
async def redescargar_file(
    f_id: int,
    formato: str = "excel",
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    f = obtener_factura(db, f_id)
    return procesar_descarga(json.loads(f.datos_json), formato)


@app.delete("/eliminar-factura/{f_id}")
async def eliminar_factura(
    f_id: int,
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    f = obtener_factura(db, f_id)
    db.delete(f)
    db.commit()
    return {"msg": "Factura eliminada"}


@app.delete("/limpiar-historial")
async def limpiar(
    _: str = Depends(verificar_password),
    db: Session = Depends(get_db),
):
    db.query(FacturaDB).delete()
    db.commit()
    return {"msg": "ok"}