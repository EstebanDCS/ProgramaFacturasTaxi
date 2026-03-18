# Usamos una imagen de Python completa para evitar fallos de compilación
FROM python:3.11-slim

# Evitamos interacciones durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# Instalamos TODAS las dependencias necesarias:
# 1. Herramientas de compilación (gcc, dev)
# 2. Librerías para PDFs y gráficos (cairo, pango, ffi)
# 3. LibreOffice (por si decides volver a usarlo)
RUN apt-get update && apt-get install -y \
    libreoffice \
    gcc \
    python3-dev \
    libpq-dev \
    libcairo2-dev \
    pkg-config \
    libpangocairo-1.0-0 \
    libffi-dev \
    libjpeg-dev \
    zlib1g-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalamos las librerías de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el código
COPY . .

# Comando de arranque para Render
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]