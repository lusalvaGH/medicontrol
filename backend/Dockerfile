# MEDICONTROL - API NestJS. Imagen para el entorno local de demostración con Docker Compose
# (ver docs/instalacion-docker.md). La configuración llega por variables de entorno: la imagen
# no contiene .env, contraseñas ni secretos.

# ── 1. Compilación ───────────────────────────────────────────────────────────
FROM node:24.22.2-alpine3.24 AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── 2. Ejecución: solo dependencias de producción, usuario sin privilegios ───
FROM node:24.22.2-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=compilacion /app/dist ./dist
COPY scripts/crear-cuentas-iniciales.mjs ./scripts/
USER node
EXPOSE 3000
# /api/health responde 200 solo si la base de datos contesta (503 si no)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
