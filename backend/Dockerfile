# Capital Screener Backend
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
    libgdk-pixbuf-2.0-0 libcairo2 libpangocairo-1.0-0 \
    libffi8 fonts-liberation fonts-dejavu-core fontconfig curl \
    && fc-cache -fv && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY data/ /data/

RUN chmod +x /app/startup.sh && mkdir -p /app/data /app/qdrant_data /app/reports

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/api/health')" || exit 1

CMD ["/app/startup.sh"]
