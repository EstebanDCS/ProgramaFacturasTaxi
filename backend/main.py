from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from datetime import datetime

app = FastAPI()

# Permitir conexión desde cualquier web (tu GitHub Pages)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estructura de cada ticket individual
class Ticket(BaseModel):
    numero: str
    fechas_solicitud: str 
    fecha_principal: str  
    importe: float

# Estructura de la factura completa
class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    cliente: str
    tickets: List[Ticket]

@app.post("/generar")
async def generar_documento(datos: DatosFactura):
    # Cargar la plantilla original
    workbook = openpyxl.load_workbook("plantilla.xlsm", keep_vba=True)
    hoja_factura = workbook["Hoja1"]
    
    # --- A. DATOS GENERALES ---
    hoja_factura['E2'] = datos.factura_numero  # Nº de Factura
    
    # (Asegúrate de que estas letras coinciden con tu Excel)
    hoja_factura['B17'] = datos.barco          # Nombre del barco
    hoja_factura['A7'] = datos.cliente         # Nombre del cliente
    
    # --- B. LISTA DE TICKETS ---
    total_importe = 0.0
    fechas_obj = []
    
    # ¡Aquí le decimos que empiece a escribir en la fila 21!
    fila_actual = 21 
    
    for ticket in datos.tickets:
        # 1. Escribimos la descripción en la columna B
        texto_descripcion = f"Ticket Nº {ticket.numero} (Solicitudes: {ticket.fechas_solicitud})"
        hoja_factura[f'B{fila_actual}'] = texto_descripcion
        
        # 2. Escribimos el importe en la columna E (cámbiala si tu total va en otra columna como la D o F)
        hoja_factura[f'E{fila_actual}'] = ticket.importe
        
        # 3. Sumamos al total acumulado
        total_importe += ticket.importe
        
        # 4. Guardamos la fecha para ver cuál es la mayor
        if ticket.fecha_principal:
            try:
                fecha_dt = datetime.strptime(ticket.fecha_principal, "%Y-%m-%d")
                fechas_obj.append(fecha_dt)
            except ValueError:
                pass
                
        # Bajamos a la siguiente fila para el próximo ticket
        fila_actual += 1 

    # --- C. CÁLCULOS FINALES ---
    # Escribimos la suma total de todos los tickets en la E38
    hoja_factura['E38'] = total_importe 
    
    # Si hay fechas, buscamos la más reciente y la ponemos en la E17
    if fechas_obj:
        fecha_mayor = max(fechas_obj)
        hoja_factura['E17'] = fecha_mayor.strftime("%d/%m/%Y") 
        
    # --- D. GUARDAR Y DEVOLVER ---
    ruta_salida = "/tmp/factura_generada.xlsm"
    workbook.save(ruta_salida)
    
    return FileResponse(ruta_salida, filename=f"Factura_{datos.factura_numero}.xlsm", media_type='application/vnd.ms-excel.sheet.macroEnabled.12')