from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import openpyxl

app = FastAPI()

# Permite que la web se comunique con este servidor
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DatosTicket(BaseModel):
    fecha: str
    cliente: str
    importe: float

@app.post("/generar")
async def generar_documento(datos: DatosTicket):
    # 1. Abrimos tu plantilla
    workbook = openpyxl.load_workbook("plantilla.xlsm", keep_vba=True)
    hoja_ticket = workbook["ticket"]
    hoja_factura = workbook["Hoja1"]

    # 2. Rellenamos los datos (EJEMPLO: Cambia 'C3' por la celda real de tu Excel)
    hoja_factura['A7'] = datos.cliente # Celda del cliente en la factura
    hoja_ticket['B14'] = datos.fecha   # Celda de la fecha en el ticket
    hoja_factura['E38'] = datos.importe # Celda del total

    # 3. Guardamos y enviamos
    ruta_salida = "/tmp/factura.xlsm"
    workbook.save(ruta_salida)

    return FileResponse(ruta_salida, filename="Factura_Taxi.xlsm", media_type='application/vnd.ms-excel.sheet.macroEnabled.12')