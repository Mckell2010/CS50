# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json tsconfig.json vite.config.ts ./
COPY frontend ./frontend
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-audit --no-fund && npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.lock ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir -r requirements.lock && useradd --create-home --uid 10001 explorer
COPY --chown=explorer:explorer backend ./backend
COPY --from=frontend --chown=explorer:explorer /app/frontend/dist ./frontend/dist
RUN mkdir /app/data && chown explorer:explorer /app/data
USER explorer
ENV APP_ENV=production AUTH_MODE=entra SEED_SAMPLE=false COOKIE_SECURE=true
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]
