# Usamos una versión de Python estable
FROM python:3.11-slim

# Evitamos preguntas durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# Instalamos dependencias del sistema + LibreOffice
# Añadimos gcc y libpq-dev para que psycopg2-binary se instale sin errores
RUN apt-get update && apt-get install -y \
    libreoffice \
    gcc \
    python3-dev \
    libpq-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Definimos carpeta de trabajo
WORKDIR /app

# Copiamos e instalamos librerías (Ahora con las herramientas necesarias)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY . .

# Comando de arranque
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]