import os
import io
import json
import zipfile
import shutil
import subprocess
import openpyxl
from openpyxl.styles import Alignment
from datetime import datetime
from fastapi import HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from config import BASE_DIR, TEMP_DIR
from utils import (
    aplicar_formulas, escribir_celda, formatear_fechas,
    limpiar_temp, rellenar_tags_hoja, escanear_tags_excel,
    build_formula_context, evaluar_con_contexto, resolver_variable,
    flatten_tickets_to_tags, flatten_ticket_to_tags
)


def generar_html_visual(config: dict, datos_dict: dict) -> str:
    """Generate HTML for WeasyPrint from block-based config."""
    emp = config.get("empresa", {})
    est = config.get("estilo", {})
    pag = config.get("pagina", {})
    cols = config.get("columnas", [
        {"nombre": "Descripción", "campo": "descripcion", "alineacion": "left"},
        {"nombre": "Importe", "campo": "importe", "alineacion": "right"},
    ])
    impuestos = config.get("impuestos", [{"nombre": "IVA", "porcentaje": 21}])
    pie = config.get("pie", {})
    color1 = est.get("color_primario", "#1a2e4a")
    color2 = est.get("color_secundario", "#0d6dfd")
    fuente = est.get("fuente", "Helvetica, Arial, sans-serif")
    tam = est.get("tam_fuente", 10)
    moneda = config.get("moneda", "€")
    titulo = config.get("titulo", "FACTURA")
    mg = pag.get("margenes", {})
    mt, mr, mb, ml = mg.get("top", 20), mg.get("right", 15), mg.get("bottom", 20), mg.get("left", 15)
    interlineado = pag.get("interlineado", 1.4)

    # Data
    fecha = datos_dict.get("fecha", "") or datetime.now().strftime("%d/%m/%Y")
    cliente = datos_dict.get("cliente", {})
    lineas = datos_dict.get("lineas", [])
    notas = datos_dict.get("notas", "")
    tickets = datos_dict.get("tickets", [])

    # Apply formulas to lines
    lineas = aplicar_formulas(lineas, cols)

    # Find total column
    col_importe = ""
    for c in reversed(cols):
        if c.get("tipo") in ("moneda", "numero", "formula"):
            col_importe = c["campo"]; break
    if not col_importe and cols:
        col_importe = cols[-1].get("campo", "importe")

    # Subtotal
    subtotal = sum(float(l.get(col_importe, 0) or 0) for l in lineas)

    # Build formula context for cross-block calculations
    det = config.get("hoja_detalle", {})
    ticket_campos = det.get("campos", [])
    ctx = build_formula_context(subtotal, tickets, ticket_campos)

    # Auto-fill date from tickets if configured
    # (check if fecha field has autoFill in config - scan blocks for it)
    # For now, if fecha is empty and we have ticket dates, use the latest
    if not datos_dict.get("fecha") and tickets:
        for c in ticket_campos:
            if c.get("tipo") == "fecha":
                max_key = f"tickets_max_{c['campo']}"
                if ctx.get(max_key):
                    fecha = ctx[max_key]
                    break

    # Calculate taxes (with optional formula override)
    total_final = subtotal
    taxes_computed = []
    for imp in impuestos:
        if imp.get("formula") and str(imp["formula"]).startswith("="):
            monto = evaluar_con_contexto(imp["formula"], ctx) or 0
        else:
            pct = float(imp.get("porcentaje", 0))
            monto = subtotal * pct / 100
        taxes_computed.append({"nombre": imp.get("nombre", "Impuesto"), "porcentaje": imp.get("porcentaje", 0), "monto": monto})
        total_final += monto

    # ── Build HTML sections ──
    # Logo
    logo_html = f'<img src="{emp["logo_url"]}" class="logo" />' if emp.get("logo_url") else ""

    # Empresa info
    emp_nombre = emp.get("nombre", "")
    emp_sub = []
    if emp.get("cif"): emp_sub.append(emp["cif"])
    if emp.get("direccion"): emp_sub.append(emp["direccion"])
    contacts = [x for x in [emp.get("telefono"), emp.get("email")] if x]
    if contacts: emp_sub.append(" · ".join(contacts))

    # Cliente
    cliente_html = ""
    if config.get("cliente", {}).get("mostrar") and cliente:
        cl = [f'<strong>{cliente[k]}</strong>' if k == "nombre" else (f'CIF: {cliente[k]}' if k == "cif" else cliente[k])
              for k in ["nombre", "cif", "direccion", "email"] if cliente.get(k)]
        if cl:
            cliente_html = f'<div class="cliente-box"><div class="cliente-label">FACTURAR A:</div>{"<br>".join(cl)}</div>'

    # Table
    cols_vis = [c for c in cols if not c.get("oculta")]
    th_html = "".join(f'<th style="text-align:{c.get("alineacion","left")}">{c["nombre"]}</th>' for c in cols_vis)
    filas_html = ""
    for ri, linea in enumerate(lineas):
        cls = "row-alt" if ri % 2 == 1 else ""
        celdas = ""
        for c in cols_vis:
            val = linea.get(c.get("campo", ""), "")
            align = c.get("alineacion", "left")
            if c.get("tipo") in ("moneda", "formula"):
                try: display = f'{float(val):,.2f} {moneda}'
                except: display = str(val)
                celdas += f'<td class="num" style="text-align:{align}"><strong>{display}</strong></td>'
            elif c.get("tipo") == "numero":
                try: display = f'{float(val):g}'
                except: display = str(val)
                celdas += f'<td style="text-align:{align}">{display}</td>'
            else:
                celdas += f'<td style="text-align:{align}">{val}</td>'
        filas_html += f'<tr class="{cls}">{celdas}</tr>'

    # Totals
    totales_html = ""
    if config.get("mostrar_desglose", True):
        totales_html += f'<tr><td class="tot-label">Subtotal</td><td class="tot-val">{subtotal:,.2f} {moneda}</td></tr>'
        for t in taxes_computed:
            label = f'{t["nombre"]} ({t["porcentaje"]:g}%)' if t["porcentaje"] else t["nombre"]
            totales_html += f'<tr><td class="tot-label">{label}</td><td class="tot-val">{t["monto"]:,.2f} {moneda}</td></tr>'
    totales_html += f'<tr class="total-row"><td class="tot-label">TOTAL</td><td class="tot-val">{total_final:,.2f} {moneda}</td></tr>'

    ref_html = f'<div style="margin-top:4px"><strong>Ref:</strong> {datos_dict.get("referencia","")}</div>' if datos_dict.get("referencia") else ""
    notas_html = f'<p class="notas">{notas}</p>' if notas else ""
    pago_html = f'<p class="pago">{pie["datos_pago"]}</p>' if pie.get("mostrar_datos_pago") and pie.get("datos_pago") else ""

    # ── Ticket pages ──
    pags_tickets = ""
    if det.get("activar") and tickets and ticket_campos:
        titulo_ticket = det.get("titulo", "Ticket")
        # Get ticket block layout if available
        ticket_bloques = det.get("bloques", [])

        for idx, ticket in enumerate(tickets, 1):
            # Build ticket content based on campos
            campos_html = ""
            for campo in ticket_campos:
                val = ticket.get(campo.get("campo", ""), "")
                nombre_campo = campo.get("nombre", campo.get("campo", ""))
                tipo = campo.get("tipo", "texto")

                if tipo == "checkbox":
                    display = "☑ Sí" if val else "☐ No"
                elif tipo == "moneda":
                    try: display = f"{float(val):,.2f} {moneda}"
                    except: display = str(val)
                elif tipo == "fecha" and val:
                    try:
                        d = datetime.strptime(str(val), "%Y-%m-%d")
                        display = d.strftime("%d/%m/%Y")
                    except: display = str(val)
                else:
                    display = str(val) if val else ""

                campos_html += f'<tr><td class="det-label">{nombre_campo}</td><td class="det-val">{display}</td></tr>'

            pags_tickets += f'''
<div class="page-break"></div>
<table class="header-table">
<tr><td class="emp-col">{logo_html}<div class="emp-name" style="font-size:{tam+4}px">{emp_nombre}</div></td>
<td class="fac-col"><div class="fac-title" style="font-size:{tam+6}px;color:{color2}">{titulo_ticket} #{idx}</div>
<div>Factura: {datos_dict.get("numero_factura","")}</div><div>{fecha}</div></td></tr>
</table>
<table class="det-table">{campos_html}</table>'''

    # ── Assemble ──
    return f'''<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page {{
    size: {pag.get("size","A4")} {pag.get("orientation","portrait")};
    margin: {mt}mm {mr}mm {mb}mm {ml}mm;
}}
body {{
    font-family: {fuente};
    font-size: {tam}px;
    color: #333;
    margin: 0;
    padding: 0;
    line-height: {interlineado};
}}
.logo {{ max-height: 50px; max-width: 160px; display: block; margin-bottom: 8px; }}
.header-table {{ width: 100%; margin-bottom: 20px; }}
.header-table td {{ vertical-align: top; padding: 0; }}
.emp-col {{ width: 55%; }}
.fac-col {{ text-align: right; }}
.emp-name {{ font-size: {tam+8}px; font-weight: 800; color: {color1}; margin-bottom: 4px; }}
.emp-sub {{ font-size: {tam-1}px; color: #777; }}
.fac-title {{ font-size: {tam+14}px; font-weight: 900; color: {color2}; margin-bottom: 8px; }}
.cliente-box {{ background: #f5f6fa; padding: 10px 14px; margin: 14px 0; }}
.cliente-label {{ font-size: {tam-2}px; color: #999; font-weight: 700; margin-bottom: 4px; }}
.items-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
.items-table th {{
    background-color: {color1};
    color: white;
    font-weight: 700;
    padding: 8px 10px;
    font-size: {tam}px;
    border: none;
}}
.items-table td {{
    padding: 7px 10px;
    border-bottom: 1px solid #e0e4e8;
}}
.items-table .row-alt td {{ background-color: #f8f9fb; }}
.totals-table {{ width: auto; margin-left: auto; margin-top: 16px; }}
.tot-label {{ padding: 4px 14px; text-align: right; color: #888; }}
.tot-val {{ padding: 4px 14px; text-align: right; font-weight: 600; min-width: 100px; }}
.total-row td {{
    border-top: 2px solid {color1};
    padding: 8px 14px;
    font-weight: 800;
    color: {color1};
    font-size: {tam+2}px;
}}
.notas {{ margin-top: 20px; color: #888; font-size: {tam-1}px; white-space: pre-wrap; }}
.pago {{ color: #555; margin-top: 6px; }}
.footer {{ margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; font-size: {tam-2}px; color: #999; }}
.page-break {{ page-break-before: always; }}
.det-table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
.det-table td {{ padding: 6px 10px; border-bottom: 1px solid #eee; }}
.det-label {{ font-weight: 600; color: #555; width: 40%; }}
.det-val {{ color: #333; }}
</style>
</head><body>
<table class="header-table">
<tr>
<td class="emp-col">
{logo_html}
<div class="emp-name">{emp_nombre}</div>
{"<br>".join(f'<span class="emp-sub">{p}</span>' for p in emp_sub)}
</td>
<td class="fac-col">
<div class="fac-title">{titulo}</div>
<div><strong>Nº:</strong> {datos_dict.get("numero_factura","")}</div>
<div><strong>Fecha:</strong> {fecha}</div>
{ref_html}
</td>
</tr>
</table>

{cliente_html}

<table class="items-table">
<tr>{th_html}</tr>
{filas_html}
</table>

<table class="totals-table">
{totales_html}
</table>

{notas_html}

<div class="footer">
{pie.get("texto","")}{pago_html}
</div>

{pags_tickets}

</body></html>'''


def html_a_pdf(html_content: str) -> str:
    """Convert HTML to PDF with WeasyPrint."""
    from weasyprint import HTML as WeasyprintHTML
    os.makedirs(TEMP_DIR, exist_ok=True)
    pdf_path = os.path.join(TEMP_DIR, f"vis_{datetime.now().strftime('%H%M%S%f')}.pdf")
    try:
        WeasyprintHTML(string=html_content).write_pdf(pdf_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {e}")
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="No se generó el PDF.")
    return pdf_path


def procesar_con_plantilla_excel(excel_bytes: bytes, datos_dict: dict, config: dict = None) -> str:
    """Fill Excel template with data, replacing {{tags}} with values + ticket aggregates."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    tmp_in = os.path.join(TEMP_DIR, f"tpl_{datetime.now().strftime('%H%M%S%f')}.xlsx")
    with open(tmp_in, "wb") as f:
        f.write(excel_bytes)
    wb = openpyxl.load_workbook(tmp_in)

    # Build comprehensive tag map
    tags = flatten_tickets_to_tags(datos_dict, config or {})

    # Replace tags in all sheets
    for ws in wb.worksheets:
        rellenar_tags_hoja(ws, tags)

    # If there are tickets and a template has a second sheet, duplicate it per ticket
    tickets = datos_dict.get("tickets", [])
    det = (config or {}).get("hoja_detalle", {})
    if det.get("activar") and tickets and len(wb.worksheets) > 1:
        ws_ticket_tpl = wb.worksheets[1]
        ticket_campos = det.get("campos", [])
        for i, ticket in enumerate(tickets):
            ws = ws_ticket_tpl if i == 0 else wb.copy_worksheet(ws_ticket_tpl)
            ws.title = f"{det.get('titulo', 'Ticket')}_{i+1}"
            ticket["_index"] = i + 1
            ticket_tags = flatten_ticket_to_tags(ticket, ticket_campos)
            rellenar_tags_hoja(ws, ticket_tags)

    out_path = os.path.join(TEMP_DIR, f"gen_{datetime.now().strftime('%H%M%S%f')}.xlsx")
    wb.save(out_path)
    return out_path


# ─── LEGACY: ORIGINAL TAXI EXCEL ─────────────────────────────────────────
def crear_excel(datos_dict, nombre_base):
    template_path = os.path.join(BASE_DIR, "plantilla.xlsm")
    if not os.path.exists(template_path):
        raise HTTPException(status_code=410, detail="La plantilla original (.xlsm) ya no está disponible.")
    os.makedirs(TEMP_DIR, exist_ok=True)
    name_xlsm = f"{nombre_base}.xlsm"
    path_salida = os.path.join(TEMP_DIR, name_xlsm)
    wb = openpyxl.load_workbook(template_path, keep_vba=True)
    ws_factura = wb.worksheets[0]
    ws_template_bono = wb.worksheets[1] if len(wb.worksheets) > 1 else None
    esc = escribir_celda
    tickets = datos_dict.get("tickets", [])
    barco = datos_dict.get("barco", "").upper()

    esc(ws_factura, "E15", datos_dict.get("factura_numero", ""))
    esc(ws_factura, "C17", barco)

    todas_fechas = []
    for t in tickets:
        todas_fechas.extend(t.get("fechas_servicio", []))
    if todas_fechas:
        try:
            fechas_obj = [datetime.strptime(f, "%Y-%m-%d") for f in todas_fechas if f]
            esc(ws_factura, "F17", max(fechas_obj).strftime("%d/%m/%Y"))
        except Exception:
            esc(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))
    else:
        esc(ws_factura, "F17", datetime.now().strftime("%d/%m/%Y"))

    numeros = [str(t.get("numero_ticket", "")).strip() for t in tickets if str(t.get("numero_ticket", "")).strip()]
    total_importe = sum(float(t.get("importe", 0)) for t in tickets)
    esc(ws_factura, "B21", " ".join(numeros))
    esc(ws_factura, "F21", round(total_importe, 2))
    try:
        ws_factura["B21"].alignment = Alignment(wrap_text=True, vertical="top", horizontal="left")
    except Exception:
        pass

    base_imponible = total_importe / 1.10
    iva = total_importe - base_imponible
    esc(ws_factura, "F38", round(base_imponible, 2))
    esc(ws_factura, "F39", round(iva, 2))
    esc(ws_factura, "F40", round(total_importe, 2))

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
            esc(ws, "B46", t.get("comentarios", ""))
            esc(ws, "E51", float(t.get("importe", 0)))

    for sheet in wb.worksheets:
        try:
            sheet.page_setup.fitToWidth = 1
            sheet.page_setup.fitToHeight = 1
            sheet.page_setup.paperSize = 9
            if hasattr(sheet, "sheet_properties") and hasattr(sheet.sheet_properties, "pageSetUpPr"):
                sheet.sheet_properties.pageSetUpPr.fitToPage = True
        except Exception:
            pass

    wb.save(path_salida)
    return path_salida, name_xlsm


def procesar_descarga(datos_dict, formato):
    nombre_base = f"{datos_dict.get('barco', 'Factura').replace(' ', '_').upper()}_{datetime.now().strftime('%d_%m_%Y')}"
    path_xlsm, name_xlsm = crear_excel(datos_dict, nombre_base)
    cleanup = BackgroundTask(limpiar_temp, TEMP_DIR)

    if formato == "excel":
        return FileResponse(path_xlsm, filename=name_xlsm,
                            headers={"Content-Disposition": f"attachment; filename={name_xlsm}"},
                            background=cleanup)

    pdf_name = f"{nombre_base}.pdf"
    pdf_path = os.path.join(TEMP_DIR, pdf_name)
    lo_profile = os.path.join(TEMP_DIR, "lo_profile")
    try:
        subprocess.run(["libreoffice", f"-env:UserInstallation=file://{lo_profile}",
                        "--headless", "--convert-to", "pdf", "--outdir", TEMP_DIR, path_xlsm],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception:
        raise HTTPException(status_code=500, detail="Error al generar PDF.")

    if formato == "pdf":
        if os.path.exists(pdf_path):
            return FileResponse(pdf_path, filename=pdf_name,
                                headers={"Content-Disposition": f"attachment; filename={pdf_name}"},
                                background=cleanup)
        raise HTTPException(status_code=500, detail="No se pudo crear el PDF.")

    zip_name = f"{nombre_base}.zip"
    zip_path = os.path.join(TEMP_DIR, zip_name)
    with zipfile.ZipFile(zip_path, "w") as zipf:
        zipf.write(path_xlsm, arcname=name_xlsm)
        if os.path.exists(pdf_path):
            zipf.write(pdf_path, arcname=pdf_name)
    return FileResponse(zip_path, filename=zip_name,
                        headers={"Content-Disposition": f"attachment; filename={zip_name}"},
                        background=cleanup)