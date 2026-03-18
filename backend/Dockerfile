# Usamos una versión ligera de Python
FROM python:3.11-slim

# Evitamos que el sistema nos haga preguntas durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# Instalamos LibreOffice para poder convertir Excel a PDF
RUN apt-get update && apt-get install -y \
    libreoffice \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Definimos la carpeta de trabajo
WORKDIR /app

# Copiamos e instalamos las librerías de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos todo el resto del código (main.py, la plantilla, etc.)
COPY . .

# Arrancamos el servidor en el puerto que Render nos asigne
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"