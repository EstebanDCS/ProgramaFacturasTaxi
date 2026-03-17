from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from openpyxl.styles import Alignment
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
    fechas_solicitud: List[str] 
    fechas_servicio: List[str]  
    pasajeros: str
    o_aeropuerto: bool
    o_buque: bool
    o_hotel: bool
    o_hotel_texto: str
    o_otros: bool
    o_otros_texto: str
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

# Función con reducción automática de letra (shrinkToFit)
def escribir(ws, celda, valor, shrink=False):
    if valor is None or valor == "": return
    c = ws[celda]
    fila = c.row
    columna = c.column
    target_cell = c
    
    for rango in ws.merged_cells.ranges:
        if rango.min_row <= fila <= rango.max_row and rango.min_col <= columna <= rango.max_col:
            target_cell = ws.cell(row=rango.min_row, column=rango.min_col)
            break
            
    try:
        target_cell.value = valor
        if shrink:
            # Hace la letra pequeña si no cabe, sin agrandar la celda
            target_cell.alignment = Alignment(shrinkToFit=True, wrapText=False)
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

        escribir(hoja_invoice, 'E15', datos.factura_numero) 
        escribir(hoja_invoice, 'C17', datos.barco)          

        total_importe = 0.0
        fechas_servicio_obj = []
        fila_actual_invoice = 21 
        
        for i, t in enumerate(datos.tickets):
            ticket_num = i + 1
            ws_ticket = hojas_tickets[i]
            ws_ticket.title = f"Ticket_{ticket_num:02d}"
            
            # --- FORMATEAR MÚLTIPLES FECHAS ---
            fechas_sol_list = []
            for f in t.fechas_solicitud:
                if f:
                    try: fechas_sol_list.append(datetime.strptime(f, "%Y-%m-%d").strftime("%d/%m/%Y"))
                    except: pass
            
            fechas_serv_list = []
            for f in t.fechas_servicio:
                if f:
                    try: 
                        dt = datetime.strptime(f, "%Y-%m-%d")
                        fechas_serv_list.append(dt.strftime("%d/%m/%Y"))
                        fechas_servicio_obj.append(dt)
                    except: pass

            fechas_sol_str = ", ".join(fechas_sol_list)
            fechas_serv_str = ", ".join(fechas_serv_list)
            
            # --- DATOS DEL TICKET ---
            escribir(ws_ticket, 'E2', ticket_num) # NUMERO DE TICKET EN E2
            escribir(ws_ticket, 'E9', t.contacto_metodo)
            escribir(ws_ticket, 'C12', fechas_sol_str, shrink=True) 
            escribir(ws_ticket, 'B14', fechas_serv_str, shrink=True)
            escribir(ws_ticket, 'C16', datos.barco, shrink=True)
            escribir(ws_ticket, 'B19', t.pasajeros, shrink=True)        
            escribir(ws_ticket, 'B46', t.comentarios, shrink=True)      
            escribir(ws_ticket, 'E51', t.importe)
            
            # --- ORIGEN ---
            escribir(ws_ticket, 'C26', '☑' if t.o_aeropuerto else '☐')
            escribir(ws_ticket, 'C27', '☑' if t.o_buque else '☐')
            escribir(ws_ticket, 'C28', '☑' if t.o_hotel else '☐')
            if t.o_hotel: escribir(ws_ticket, 'E28', t.o_hotel_texto, shrink=True) 
            escribir(ws_ticket, 'C29', '☑' if t.o_otros else '☐')
            if t.o_otros: escribir(ws_ticket, 'D30', t.o_otros_texto, shrink=True) 
            
            # --- DESTINO ---
            escribir(ws_ticket, 'C33', '☑' if t.d_aeropuerto else '☐')
            escribir(ws_ticket, 'C34', '☑' if t.d_buque else '☐')
            escribir(ws_ticket, 'C35', '☑' if t.d_hotel else '☐')
            if t.d_hotel: escribir(ws_ticket, 'E35', t.d_hotel_texto, shrink=True) 
            escribir(ws_ticket, 'C36', '☑' if t.d_hospital else '☐')
            if t.d_hospital: escribir(ws_ticket, 'E36', t.d_hospital_texto, shrink=True) 
            escribir(ws_ticket, 'C37', '☑' if t.d_clinica else '☐')
            if t.d_clinica: escribir(ws_ticket, 'E37', t.d_clinica_texto, shrink=True) 
            escribir(ws_ticket, 'C38', '☑' if t.d_inmigracion else '☐')
            escribir(ws_ticket, 'C39', '☑' if t.d_otros else '☐')
            if t.d_otros: escribir(ws_ticket, 'D40', t.d_otros_texto, shrink=True) 
            
            # --- IDA Y VUELTA ---
            escribir(ws_ticket, 'C43', '☑' if t.ida_vuelta else '☐') 
            escribir(ws_ticket, 'D43', '☐' if t.ida_vuelta else '☑') 

            # --- HOJA PRINCIPAL ---
            escribir(hoja_invoice, f'B{fila_actual_invoice}', f"Ticket Nº {ticket_num:02d} (Solicitudes: {fechas_sol_str})")
            escribir(hoja_invoice, f'E{fila_actual_invoice}', t.importe)
            
            total_importe += t.importe
            fila_actual_invoice += 1

        escribir(hoja_invoice, 'E38', total_importe)
        if fechas_servicio_obj:
            escribir(hoja_invoice, 'F17', max(fechas_servicio_obj).strftime("%d/%m/%Y")) 
            
        ruta_salida = "/tmp/factura_completa.xlsm"
        workbook.save(ruta_salida)
        
        return FileResponse(ruta_salida, filename=f"Factura_{datos.factura_numero}.xlsm", media_type='application/vnd.ms-excel.sheet.macroEnabled.12')
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})