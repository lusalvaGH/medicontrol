# MEDICONTROL - Frontend React. Compila la aplicación una vez y la sirve con Nginx sin root,
# que además reenvía /api al backend por la red interna de Docker (ver nginx.conf).
# Es el entorno local de demostración: no es un despliegue productivo (no hay HTTPS).

# ── 1. Compilación ───────────────────────────────────────────────────────────
FROM node:24.22.2-alpine3.24 AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# ── 2. Servidor: Nginx sin privilegios (usuario nginx, puerto 8080) ─────────
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
