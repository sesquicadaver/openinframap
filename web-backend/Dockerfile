FROM ghcr.io/astral-sh/uv:debian-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libeccodes0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app
RUN uv sync --no-dev

EXPOSE 80
ENTRYPOINT uv run uvicorn main:app --host 0.0.0.0 --port 80 --proxy-headers --forwarded-allow-ips='*'
