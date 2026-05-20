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
COPY --from=build /app/dist/sf-fantasy-shelf/browser /usr/share/nginx/html
EXPOSE 80
CMD ["/bin/sh", "-c", \
  "envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template \
   > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
