from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
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
    
    # Orígenes múltiples
    o_aeropuerto: bool
    o_buque: bool
    o_hotel: bool
    o_hotel_texto: str
    o_otros: bool
    o_otros_texto: str
    
    # Destinos múltiples
    d_aeropuerto: bool
    d_buque: bool
    d_hotel: bool
    d_hotel_texto: str
    d_hospital: bool
    d_hospital_texto: str
    d_clinica: bool
    d_clinica_texto: str
    d_inmigracion: bool
    d_otros: bool
    d_otros_texto: str
    
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

        hojas_tickets = [ws_ticket_template]
        for _ in range(1, len(datos.tickets)):
            hojas_tickets.append(workbook.copy_worksheet(ws_ticket_template))

        # --- DATOS GENERALES ---
        escribir(hoja_invoice, 'E15', datos.factura_numero) 
        escribir(hoja_invoice, 'C17', datos.barco)          

        total_importe = 0.0
        fechas_servicio_obj = []
        fila_actual_invoice = 21 
        
        for i, t in enumerate(datos.tickets):
            ticket_num = i + 1
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
            
            # --- ORIGEN (Múltiple) ---
            escribir(ws_ticket, 'C26', '☑' if t.o_aeropuerto else '☐')
            escribir(ws_ticket, 'C27', '☑' if t.o_buque else '☐')
            
            escribir(ws_ticket, 'C28', '☑' if t.o_hotel else '☐')
            if t.o_hotel: escribir(ws_ticket, 'E28', t.o_hotel_texto) 
            
            escribir(ws_ticket, 'C29', '☑' if t.o_otros else '☐')
            if t.o_otros: escribir(ws_ticket, 'D30', t.o_otros_texto) 
            
            # --- DESTINO (Múltiple) ---
            escribir(ws_ticket, 'C33', '☑' if t.d_aeropuerto else '☐')
            escribir(ws_ticket, 'C34', '☑' if t.d_buque else '☐')
            
            escribir(ws_ticket, 'C35', '☑' if t.d_hotel else '☐')
            if t.d_hotel: escribir(ws_ticket, 'E35', t.d_hotel_texto) 
            
            escribir(ws_ticket, 'C36', '☑' if t.d_hospital else '☐')
            if t.d_hospital: escribir(ws_ticket, 'E36', t.d_hospital_texto) 
            
            escribir(ws_ticket, 'C37', '☑' if t.d_clinica else '☐')
            if t.d_clinica: escribir(ws_ticket, 'E37', t.d_clinica_texto) 
            
            escribir(ws_ticket, 'C38', '☑' if t.d_inmigracion else '☐')
            
            escribir(ws_ticket, 'C39', '☑' if t.d_otros else '☐')
            if t.d_otros: escribir(ws_ticket, 'D40', t.d_otros_texto) 
            
            # --- IDA Y VUELTA ---
            escribir(ws_ticket, 'C43', '☑' if t.ida_vuelta else '☐') 
            escribir(ws_ticket, 'D43', '☐' if t.ida_vuelta else '☑') 

            # Fechas y suma para la principal
            if t.fecha_servicio:
                try:
                    dt_serv = datetime.strptime(t.fecha_servicio, "%Y-%m-%d")
                    escribir(ws_ticket, 'B14', dt_serv.strftime("%d/%m/%Y"))
                    fechas_servicio_obj.append(dt_serv)
                except: pass

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