from pydantic import BaseModel
from typing import List


class DatosTicket(BaseModel):
    numero_ticket: str
    importe: float
    contacto_metodo: str = ""
    fechas_solicitud: List[str] = []
    fechas_servicio: List[str] = []
    pasajeros: List[str] = []
    o_aeropuerto: bool = False
    o_buque: bool = False
    o_hotel: bool = False
    o_hotel_texto: str = ""
    o_otros: bool = False
    o_otros_texto: str = ""
    d_aeropuerto: bool = False
    d_buque: bool = False
    d_hotel: bool = False
    d_hotel_texto: str = ""
    d_hospital: bool = False
    d_hospital_texto: str = ""
    d_clinica: bool = False
    d_clinica_texto: str = ""
    d_inmigracion: bool = False
    d_otros: bool = False
    d_otros_texto: str = ""
    ida_vuelta: bool = False
    comentarios: str = ""


class DatosFactura(BaseModel):
    factura_numero: str
    barco: str
    tickets: List[DatosTicket]

    @property
    def importe_total(self) -> float:
        return sum(t.importe for t in self.tickets)


class DatosCliente(BaseModel):
    nombre: str = ""
    cif: str = ""
    direccion: str = ""
    email: str = ""
    telefono: str = ""


class DatosFacturaGenerica(BaseModel):
    numero_factura: str
    fecha: str = ""
    referencia: str = ""
    cliente: DatosCliente = DatosCliente()
    lineas: List[dict] = []
    tickets: List[dict] = []
    notas: str = ""
    totales: dict = {}