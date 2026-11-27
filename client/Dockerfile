FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=80 API_UPSTREAM=http://server:4000 NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM)$"
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY 19-resolver.sh /docker-entrypoint.d/19-resolver.sh
RUN chmod +x /docker-entrypoint.d/19-resolver.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT}/nginx-health" || exit 1'
