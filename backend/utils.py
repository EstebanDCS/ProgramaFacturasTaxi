import os
import re
import json
import shutil
from datetime import datetime
from models import DatosFactura


def compact_json(data: dict) -> str:
    def strip(obj):
        if isinstance(obj, dict):
            return {k: strip(v) for k, v in obj.items() if v not in (False, "", [], None)}
        if isinstance(obj, list):
            return [strip(i) for i in obj]
        return obj
    return json.dumps(strip(data), separators=(",", ":"))


def limpiar_temp(directorio: str):
    try:
        if os.path.exists(directorio):
            shutil.rmtree(directorio)
    except OSError:
        pass


def escribir_celda(ws, coord: str, valor):
    try:
        if type(ws[coord]).__name__ != "MergedCell":
            ws[coord] = valor
    except Exception:
        pass


def formatear_fechas(fechas: list, fmt_in="%Y-%m-%d", fmt_out="%d/%m/%Y") -> list:
    resultado = []
    for f in fechas:
        try:
            resultado.append(datetime.strptime(f, fmt_in).strftime(fmt_out))
        except ValueError:
            continue
    return resultado


def datos_registro(user_id: str, datos: DatosFactura, plantilla: str = "original") -> dict:
    return {
        "user_id": user_id,
        "numero_factura": datos.factura_numero,
        "barco": datos.barco.upper(),
        "importe_total": datos.importe_total,
        "datos_json": compact_json(datos.dict()),
        "plantilla_nombre": plantilla,
    }


def datos_registro_cifrado(user_id: str, datos_json_cifrado: str, meta: dict) -> dict:
    return {
        "user_id": user_id,
        "numero_factura": meta.get("numero_factura", ""),
        "barco": meta.get("barco", ""),
        "importe_total": meta.get("importe_total", 0),
        "datos_json": datos_json_cifrado,
        "plantilla_nombre": meta.get("plantilla_nombre", "original"),
    }


def ticket_origen_texto(t: dict) -> str:
    partes = []
    if t.get("o_aeropuerto"): partes.append("Aeropuerto")
    if t.get("o_buque"): partes.append("Buque")
    if t.get("o_hotel"): partes.append(f"Hotel: {t.get('o_hotel_texto', '')}")
    if t.get("o_otros"): partes.append(t.get("o_otros_texto", "Otros"))
    return ", ".join(partes) or "—"


def ticket_destino_texto(t: dict) -> str:
    partes = []
    if t.get("d_aeropuerto"): partes.append("Aeropuerto")
    if t.get("d_buque"): partes.append("Buque")
    if t.get("d_hotel"): partes.append(f"Hotel: {t.get('d_hotel_texto', '')}")
    if t.get("d_hospital"): partes.append(f"Hospital: {t.get('d_hospital_texto', '')}")
    if t.get("d_clinica"): partes.append(f"Clínica: {t.get('d_clinica_texto', '')}")
    if t.get("d_inmigracion"): partes.append("Inmigración")
    if t.get("d_otros"): partes.append(t.get("d_otros_texto", "Otros"))
    return ", ".join(partes) or "—"


def escanear_tags_excel(wb) -> list:
    encontrados = set()
    patron = re.compile(r"\{\{[a-z_]+\}\}")
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    encontrados.update(patron.findall(cell.value))
    return sorted(encontrados)


def rellenar_tags_hoja(ws, tags_map: dict):
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                nuevo = cell.value
                for tag, valor in tags_map.items():
                    nuevo = nuevo.replace(tag, str(valor))
                if nuevo != cell.value:
                    try:
                        cell.value = float(nuevo)
                    except (ValueError, TypeError):
                        cell.value = nuevo


def evaluar_formula(formula: str, linea: dict) -> str:
    if not formula or not formula.startswith("="):
        return formula
    expr = formula[1:].strip()
    for campo, valor in sorted(linea.items(), key=lambda x: -len(x[0])):
        try:
            num = float(valor) if valor else 0
        except (ValueError, TypeError):
            num = 0
        expr = expr.replace(campo, str(num))
    if re.match(r'^[\d\s\.\+\-\*\/\(\)]+$', expr):
        try:
            return f"{eval(expr):.2f}"
        except Exception:
            return "0.00"
    return "0.00"


def aplicar_formulas(lineas: list, columnas: list) -> list:
    resultado = []
    for linea in lineas:
        ln = dict(linea)
        for col in columnas:
            if col.get("tipo") == "formula" and col.get("formula"):
                ln[col["campo"]] = evaluar_formula(col["formula"], ln)
        resultado.append(ln)
    return resultado


def build_formula_context(subtotal, tickets, ticket_campos):
    """Build context dict with aggregated variables from lines and tickets."""
    ctx = {"subtotal": subtotal or 0}
    tix = tickets or []
    ctx["tickets_count"] = len(tix)
    for c in (ticket_campos or []):
        campo = c.get("campo", "")
        tipo = c.get("tipo", "texto")
        if not campo:
            continue
        if tipo in ("moneda", "numero"):
            vals = [float(t.get(campo, 0) or 0) for t in tix]
            ctx[f"tickets_sum_{campo}"] = sum(vals)
            ctx[f"tickets_avg_{campo}"] = sum(vals) / len(vals) if vals else 0
            ctx[f"tickets_min_{campo}"] = min(vals) if vals else 0
            ctx[f"tickets_max_{campo}"] = max(vals) if vals else 0
        elif tipo == "fecha":
            dates = sorted([t.get(campo, "") for t in tix if t.get(campo)])
            ctx[f"tickets_min_{campo}"] = dates[0] if dates else ""
            ctx[f"tickets_max_{campo}"] = dates[-1] if dates else ""
        # Join: concatenate text values across tickets
        vals = [str(t.get(campo, "")) for t in tix if t.get(campo)]
        if vals:
            ctx[f"tickets_join_{campo}"] = ", ".join(vals)
    return ctx


def evaluar_con_contexto(formula, ctx):
    """Evaluate a formula using named variables from context."""
    if not formula or not str(formula).startswith("="):
        return None
    expr = str(formula)[1:].strip()
    for key in sorted(ctx.keys(), key=lambda k: -len(k)):
        expr = expr.replace(key, str(ctx.get(key, 0)))
    if re.match(r'^[\d\s\.\+\-\*\/\(\)]+$', expr):
        try:
            return eval(expr)
        except Exception:
            return 0
    return 0


def resolver_variable(formula, ctx):
    """Resolve a simple variable reference (e.g. =tickets_max_fecha)."""
    if not formula or not str(formula).startswith("="):
        return formula
    key = str(formula)[1:].strip()
    return ctx.get(key, formula)


def flatten_tickets_to_tags(datos_dict, config):
    """Flatten ticket data into {{tag}} replacements for Excel templates."""
    tags = {}
    # Basic fields
    for k, v in datos_dict.items():
        if isinstance(v, str):
            tags[f"{{{{{k}}}}}"] = v
        elif isinstance(v, (int, float)):
            tags[f"{{{{{k}}}}}"] = str(v)
    # Client
    cliente = datos_dict.get("cliente", {})
    for k, v in cliente.items():
        tags[f"{{{{cliente_{k}}}}}"] = str(v)
    # Totals
    totales = datos_dict.get("totales", {})
    for k, v in totales.items():
        if isinstance(v, (int, float)):
            tags[f"{{{{total_{k}}}}}"] = f"{v:.2f}"
    # Context variables (ticket aggregates)
    ticket_campos = config.get("hoja_detalle", {}).get("campos", [])
    tickets = datos_dict.get("tickets", [])
    lineas = datos_dict.get("lineas", [])
    subtotal = totales.get("subtotal", 0) if totales else sum(
        float(l.get("importe", 0) or 0) for l in lineas
    )
    ctx = build_formula_context(subtotal, tickets, ticket_campos)
    for k, v in ctx.items():
        tags[f"{{{{{k}}}}}"] = str(v) if not isinstance(v, float) else f"{v:.2f}"
    return tags


def flatten_ticket_to_tags(ticket, ticket_campos):
    """Flatten a single ticket's data into {{tag}} replacements, expanding checkbox_groups."""
    tags = {}
    for campo in ticket_campos:
        campo_id = campo.get("campo", "")
        tipo = campo.get("tipo", "texto")
        if tipo == "checkbox_group":
            # Expand each option: {{ch_group_option}} = "X" or ""
            for op in campo.get("opciones", []):
                val = ticket.get(op.get("id", ""), False)
                tags[f"{{{{{op['id']}}}}}"] = "X" if val else ""
                # Associated text field
                if op.get("texto_campo"):
                    tags[f"{{{{{op['texto_campo']}}}}}"] = str(ticket.get(op["texto_campo"], ""))
        elif tipo == "checkbox":
            tags[f"{{{{{campo_id}}}}}"] = "X" if ticket.get(campo_id) else ""
        else:
            tags[f"{{{{{campo_id}}}}}"] = str(ticket.get(campo_id, ""))
    tags["{{ticket_num}}"] = str(ticket.get("_index", ""))
    return tags