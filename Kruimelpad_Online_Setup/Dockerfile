# Multi-stage build: frontend bouwen, daarna backend draaien

# === Stage 1: Frontend bouwen ===
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# === Stage 2: Backend met frontend erin ===
FROM python:3.12-slim
WORKDIR /app

# Installeer Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopieer backend code
COPY backend/ ./

# Kopieer de gebouwde frontend naar de static-map
COPY --from=frontend-build /app/frontend/dist ./static

# Railway geeft de PORT via environment variable
ENV PORT=8000
EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
