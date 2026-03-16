from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import openpyxl
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DEFINICIÓN DE DATOS ---
class DatosTicket(BaseModel):
    contacto_metodo: str
    fechas_solicitud: str
    fecha_servicio: str
    pasajeros: str
    
    origen_tipo: str 
    origen_texto_extra: str 
    
    destino_tipo: str 
    destino_texto_extra: str 
    
    ida_vuelta: bool
    comentarios: str
    importe: float

class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    cliente: str
    tickets: List[DatosTicket]

def obtener_ws_or_exception(wb, name):
    try: return wb[name]
    except KeyError: raise Exception(f"La hoja '{name}' no existe en la plantilla.")

# 🟢 FUNCIÓN INTELIGENTE ANTIBALAS PARA CELDAS COMBINADAS 🟢
def escribir(ws, celda, valor):
    if valor is None:
        return
    try:
        # Intenta escribir normalmente
        ws[celda] = valor
    except AttributeError:
        # Si da el error de "MergedCell", busca la celda principal de la combinación
        for rango in ws.merged_cells.ranges:
            if celda in rango:
                celda_principal = rango.start_cell.coordinate
                ws[celda_principal] = valor
                break

@app.post("/generar")
async def generar_documento(datos: DatosFactura):
    try:
        workbook = openpyxl.load_workbook("plantilla.xlsm", keep_vba=True)
        hoja_invoice = obtener_ws_or_exception(workbook, "Hoja1")
        ws_ticket_template = obtener_ws_or_exception(workbook, "ticket")
        ws_ticket_template.sheet_state = 'visible'

        # --- A. DATOS GENERALES HOJA 1 ---
        escribir(hoja_invoice, 'E2', datos.factura_numero)
        escribir(hoja_invoice, 'A7', datos.cliente)

        total_importe = 0.0
        fechas_servicio_obj = []
        fila_actual_invoice = 21 
        ticket_num = 1
        
        for t in datos.tickets:
            # 1. CLONAR HOJA
            ws_ticket = workbook.copy_worksheet(ws_ticket_template)
            ws_ticket.title = f"Ticket_{ticket_num:02d}"
            
            # --- DATOS DEL TICKET ---
            escribir(ws_ticket, 'E9', t.contacto_metodo)
            escribir(ws_ticket, 'B12', t.fechas_solicitud)
            escribir(ws_ticket, 'B14', t.fecha_servicio)
            escribir(ws_ticket, 'C16', datos.barco)
            escribir(ws_ticket, 'B19', t.pasajeros)
            escribir(ws_ticket, 'B46', t.comentarios)
            escribir(ws_ticket, 'E51', t.importe)
            
            # --- CHECKBOXES DE ORIGEN ---
            escribir(ws_ticket, 'B26', '☑' if t.origen_tipo == 'aeropuerto' else '☐')
            escribir(ws_ticket, 'B27', '☑' if t.origen_tipo == 'buque' else '☐')
            
            escribir(ws_ticket, 'B28', '☑' if t.origen_tipo == 'hotel' else '☐')
            if t.origen_tipo == 'hotel': escribir(ws_ticket, 'D28', t.origen_texto_extra)
            
            escribir(ws_ticket, 'B29', '☑' if t.origen_tipo == 'otros' else '☐')
            if t.origen_tipo == 'otros': escribir(ws_ticket, 'D29', t.origen_texto_extra)
            
            # --- CHECKBOXES DE DESTINO ---
            escribir(ws_ticket, 'B31', '☑' if t.destino_tipo == 'aeropuerto' else '☐')
            escribir(ws_ticket, 'B32', '☑' if t.destino_tipo == 'buque' else '☐')
            
            escribir(ws_ticket, 'B33', '☑' if t.destino_tipo == 'hotel' else '☐')
            if t.destino_tipo == 'hotel': escribir(ws_ticket, 'D33', t.destino_texto_extra)
            
            escribir(ws_ticket, 'B34', '☑' if t.destino_tipo == 'hospital' else '☐')
            if t.destino_tipo == 'hospital': escribir(ws_ticket, 'D34', t.destino_texto_extra)
            
            escribir(ws_ticket, 'B35', '☑' if t.destino_tipo == 'clinica' else '☐')
            if t.destino_tipo == 'clinica': escribir(ws_ticket, 'D35', t.destino_texto_extra)
            
            escribir(ws_ticket, 'B36', '☑' if t.destino_tipo == 'inmigracion' else '☐')
            
            escribir(ws_ticket, 'B37', '☑' if t.destino_tipo == 'otros' else '☐')
            if t.destino_tipo == 'otros': escribir(ws_ticket, 'D37', t.destino_texto_extra)
            
            # --- CHECKBOXES IDA Y VUELTA ---
            escribir(ws_ticket, 'C43', '☑' if t.ida_vuelta else '☐') 
            escribir(ws_ticket, 'D43', '☐' if t.ida_vuelta else '☑') 

            # Fechas para la Hoja1
            if t.fecha_servicio:
                try:
                    dt_serv = datetime.strptime(t.fecha_servicio, "%Y-%m-%d")
                    escribir(ws_ticket, 'B14', dt_serv.strftime("%d/%m/%Y"))
                    fechas_servicio_obj.append(dt_serv)
                except: pass

            # Escribir resumen en Hoja1
            escribir(hoja_invoice, f'B{fila_actual_invoice}', f"Ticket Nº {ticket_num:02d} (Solicitudes: {t.fechas_solicitud})")
            escribir(hoja_invoice, f'E{fila_actual_invoice}', t.importe)
            
            total_importe += t.importe
            fila_actual_invoice += 1
            ticket_num += 1

        # Finalizar Hoja1
        escribir(hoja_invoice, 'E38', total_importe)
        if fechas_servicio_obj:
            escribir(hoja_invoice, 'E17', max(fechas_servicio_obj).strftime("%d/%m/%Y"))
            
        ruta_salida = "/tmp/factura_completa.xlsm"
        workbook.save(ruta_salida)
        
        return FileResponse(ruta_salida, filename=f"Factura_{datos.factura_numero}.xlsm", media_type='application/vnd.ms-excel.sheet.macroEnabled.12')
    except Exception as e:
        return {"error": str(e)}