FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
COPY backend/app ./backend/app
COPY backend/static ./backend/static
COPY --from=frontend-builder /app/frontend/out ./frontend/out

RUN pip install --no-cache-dir --upgrade pip uv && \
    uv pip install --system --requirement ./backend/requirements.txt

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
