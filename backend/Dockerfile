FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY backend/db ./db
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
