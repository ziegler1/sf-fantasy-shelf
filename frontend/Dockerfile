# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.25-alpine
COPY frontend/nginx/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY frontend/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist/sf-fantasy-shelf/browser /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
