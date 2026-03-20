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
