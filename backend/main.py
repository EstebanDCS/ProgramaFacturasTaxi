from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List
import openpyxl
from openpyxl.styles import Alignment
from datetime import datetime
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://estebandcs.github.io"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"] 
)

PASSWORD_SECRETA = os.environ.get("TAXI_PASSWORD") 

def verificar_seguridad(x_password: str = Header(default=None)):
    if not PASSWORD_SECRETA or x_password != PASSWORD_SECRETA:
        raise HTTPException(status_code=401, detail="Acceso denegado. Contraseña incorrecta.")

@app.post("/login")
async def login(x_password: str = Header(default=None)):
    if not PASSWORD_SECRETA or x_password != PASSWORD_SECRETA:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"status": "ok"}

class DatosTicket(BaseModel):
    numero_ticket: str  
    contacto_metodo: str
    fechas_solicitud: List[str] 
    fechas_servicio: List[str]  
    pasajeros: List[str] 
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
    fecha_factura: str # <--- NUEVO DATO DE FECHA MANUAL
    tickets: List[DatosTicket]

def obtener_ws_or_exception(wb, name):
    try: return wb[name]
    except KeyError: raise Exception(f"La hoja '{name}' no existe en la plantilla.")

def escribir(ws, celda, valor, shrink=False, h_align=None, v_align=None):
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
        current_align = target_cell.alignment
        target_cell.alignment = Alignment(
            horizontal=h_align if h_align else current_align.horizontal,
            vertical=v_align if v_align else current_align.vertical,
            shrinkToFit=shrink if shrink else current_align.shrinkToFit,
            wrapText=current_align.wrapText
        )
    except AttributeError: pass

@app.post("/generar", dependencies=[Depends(verificar_seguridad)])
async def generar_documento(datos: DatosFactura):
    try:
        workbook = openpyxl.load_workbook("plantilla.xlsm", keep_vba=True)
        hoja_invoice = obtener_ws_or_exception(workbook, "Hoja1")
        ws_ticket_template = obtener_ws_or_exception(workbook, "ticket")
        ws_ticket_template.sheet_state = 'visible'

        hojas_tickets = [ws_ticket_template]
        for _ in range(1, len(datos.tickets)):
            hojas_tickets.append(workbook.copy_worksheet(ws_ticket_template))

        barco_mayusculas = datos.barco.upper() if datos.barco else "SIN_BARCO"

        # --- DATOS HOJA PRINCIPAL ---
        escribir(hoja_invoice, 'E15', datos.factura_numero, shrink=True, h_align='center', v_align='center') 
        escribir(hoja_invoice, 'C17', barco_mayusculas, shrink=True)          
        
        # Fecha Manual
        fecha_final_str = ""
        if datos.fecha_factura:
            try:
                dt_fac = datetime.strptime(datos.fecha_factura, "%Y-%m-%d")
                escribir(hoja_invoice, 'F17', dt_fac.strftime("%d/%m/%Y"), h_align='center')
                fecha_final_str = "_" + dt_fac.strftime("%d-%m-%Y")
            except: pass

        total_importe = 0.0
        numeros_de_ticket = [] 
        
        for i, t in enumerate(datos.tickets):
            ws_ticket = hojas_tickets[i]
            ws_ticket.title = f"T_{t.numero_ticket}"[:31]
            
            numeros_de_ticket.append(t.numero_ticket)
            total_importe += t.importe
            
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
                    except: pass

            fechas_sol_str = ", ".join(fechas_sol_list)
            fechas_serv_str = ", ".join(fechas_serv_list)
            
            pasajeros_str = ", ".join([p for p in t.pasajeros if p.strip()])
            
            escribir(ws_ticket, 'E2', t.numero_ticket, h_align='center') 
            escribir(ws_ticket, 'E9', t.contacto_metodo)
            escribir(ws_ticket, 'C12', fechas_sol_str, shrink=True) 
            escribir(ws_ticket, 'C14', fechas_serv_str, shrink=True, h_align='center', v_align='center') 
            escribir(ws_ticket, 'C16', barco_mayusculas, shrink=True) 
            escribir(ws_ticket, 'B19', pasajeros_str, shrink=True, h_align='left', v_align='top')
            escribir(ws_ticket, 'B46', t.comentarios, shrink=True)      
            escribir(ws_ticket, 'E51', t.importe)
            
            escribir(ws_ticket, 'C26', '☑' if t.o_aeropuerto else '☐')
            escribir(ws_ticket, 'C27', '☑' if t.o_buque else '☐')
            escribir(ws_ticket, 'C28', '☑' if t.o_hotel else '☐')
            if t.o_hotel: escribir(ws_ticket, 'E28', t.o_hotel_texto, shrink=True) 
            escribir(ws_ticket, 'C29', '☑' if t.o_otros else '☐')
            if t.o_otros: escribir(ws_ticket, 'D30', t.o_otros_texto, shrink=True) 
            
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
            
            escribir(ws_ticket, 'C43', '☑' if t.ida_vuelta else '☐') 
            escribir(ws_ticket, 'D43', '☐' if t.ida_vuelta else '☑') 

        tickets_unidos = ", ".join(numeros_de_ticket)
        escribir(hoja_invoice, 'B21', tickets_unidos, shrink=True, h_align='left', v_align='top')
        
        base_imponible = total_importe / 1.1
        iva = total_importe - base_imponible
        
        escribir(hoja_invoice, 'F40', round(total_importe, 2))      
        escribir(hoja_invoice, 'F38', round(base_imponible, 2))     
        escribir(hoja_invoice, 'F39', round(iva, 2))                

        # Nombre de archivo dinámico
        nombre_descarga = f"{barco_mayusculas}{fecha_final_str}.xlsm".replace(" ", "_")
            
        ruta_salida = "/tmp/factura_completa.xlsm"
        workbook.save(ruta_salida)
        
        return FileResponse(ruta_salida, filename=nombre_descarga, media_type='application/vnd.ms-excel.sheet.macroEnabled.12')
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})