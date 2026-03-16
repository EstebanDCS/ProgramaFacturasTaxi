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
    tickets: List[DatosTicket]

def obtener_ws_or_exception(wb, name):
    try: return wb[name]
    except KeyError: raise Exception(f"La hoja '{name}' no existe en la plantilla.")

# Función ultra-segura para escribir
def escribir(ws, celda, valor):
    if valor is None: return
    c = ws[celda]
    fila = c.row
    columna = c.column
    for rango in ws.merged_cells.ranges:
        if rango.min_row <= fila <= rango.max_row and rango.min_col <= columna <= rango.max_col:
            ws.cell(row=rango.min_row, column=rango.min_col).value = valor
            return
    try:
        c.value = valor
    except AttributeError: pass

@app.post("/generar")
async def generar_documento(datos: DatosFactura):
    try:
        workbook = openpyxl.load_workbook("plantilla.xlsm", keep_vba=True)
        hoja_invoice = obtener_ws_or_exception(workbook, "Hoja1")
        ws_ticket_template = obtener_ws_or_exception(workbook, "ticket")
        ws_ticket_template.sheet_state = 'visible'

        # --- PREPARAR LAS HOJAS (TRUCO PARA NO DEJAR HOJAS VACÍAS) ---
        # 1. Metemos la hoja original en nuestra lista
        hojas_tickets = [ws_ticket_template]
        # 2. Si hay más de 1 ticket, creamos las copias necesarias ANTES de rellenar
        for _ in range(1, len(datos.tickets)):
            hojas_tickets.append(workbook.copy_worksheet(ws_ticket_template))

        # --- A. DATOS GENERALES HOJA 1 ---
        escribir(hoja_invoice, 'E15', datos.factura_numero) 
        escribir(hoja_invoice, 'C17', datos.barco)          

        total_importe = 0.0
        fechas_servicio_obj = []
        fila_actual_invoice = 21 
        
        for i, t in enumerate(datos.tickets):
            ticket_num = i + 1
            # Cogemos la hoja correspondiente (la original para el 1, las copias para el resto)
            ws_ticket = hojas_tickets[i]
            ws_ticket.title = f"Ticket_{ticket_num:02d}"
            
            # --- DATOS DEL TICKET ---
            escribir(ws_ticket, 'E9', t.contacto_metodo)
            escribir(ws_ticket, 'C12', t.fechas_solicitud) 
            escribir(ws_ticket, 'B14', t.fecha_servicio)
            escribir(ws_ticket, 'C16', datos.barco)
            escribir(ws_ticket, 'B19', t.pasajeros)        
            escribir(ws_ticket, 'B46', t.comentarios)      
            escribir(ws_ticket, 'E51', t.importe)
            
            # --- ORIGEN (Ajustado a la columna C) ---
            escribir(ws_ticket, 'C26', '☑' if t.origen_tipo == 'aeropuerto' else '☐')
            escribir(ws_ticket, 'C27', '☑' if t.origen_tipo == 'buque' else '☐')
            
            escribir(ws_ticket, 'C28', '☑' if t.origen_tipo == 'hotel' else '☐')
            if t.origen_tipo == 'hotel': escribir(ws_ticket, 'E28', t.origen_texto_extra) 
            
            escribir(ws_ticket, 'C29', '☑' if t.origen_tipo == 'otros' else '☐')
            if t.origen_tipo == 'otros': escribir(ws_ticket, 'D30', t.origen_texto_extra) 
            
            # --- DESTINO (Ajustado a la columna C) ---
            escribir(ws_ticket, 'C33', '☑' if t.destino_tipo == 'aeropuerto' else '☐')
            escribir(ws_ticket, 'C34', '☑' if t.destino_tipo == 'buque' else '☐')
            
            escribir(ws_ticket, 'C35', '☑' if t.destino_tipo == 'hotel' else '☐')
            if t.destino_tipo == 'hotel': escribir(ws_ticket, 'E35', t.destino_texto_extra) 
            
            escribir(ws_ticket, 'C36', '☑' if t.destino_tipo == 'hospital' else '☐')
            if t.destino_tipo == 'hospital': escribir(ws_ticket, 'E36', t.destino_texto_extra) 
            
            escribir(ws_ticket, 'C37', '☑' if t.destino_tipo == 'clinica' else '☐')
            if t.destino_tipo == 'clinica': escribir(ws_ticket, 'E37', t.destino_texto_extra) 
            
            escribir(ws_ticket, 'C38', '☑' if t.destino_tipo == 'inmigracion' else '☐')
            
            escribir(ws_ticket, 'C39', '☑' if t.destino_tipo == 'otros' else '☐')
            if t.destino_tipo == 'otros': escribir(ws_ticket, 'D40', t.destino_texto_extra) 
            
            # --- IDA Y VUELTA ---
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

        # Finalizar Hoja1
        escribir(hoja_invoice, 'E38', total_importe)
        if fechas_servicio_obj:
            escribir(hoja_invoice, 'F17', max(fechas_servicio_obj).strftime("%d/%m/%Y")) 
            
        ruta_salida = "/tmp/factura_completa.xlsm"
        workbook.save(ruta_salida)
        
        return FileResponse(ruta_salida, filename=f"Factura_{datos.factura_numero}.xlsm", media_type='application/vnd.ms-excel.sheet.macroEnabled.12')
    except Exception as e:
        return {"error": str(e)}