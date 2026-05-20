# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.25-alpine

# Store the template — envsubst writes the final config at startup
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/dist/sf-fantasy-shelf/browser /usr/share/nginx/html

EXPOSE 80

# Substitute $BACKEND_URL into the nginx config, then start nginx.
# BACKEND_URL must be set as an environment variable, e.g.:
#   Local:   http://backend:3000
#   Railway: https://<backend-service>.railway.app
CMD ["/bin/sh", "-c", \
  "envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template \
   > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
