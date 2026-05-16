FROM nginx:1.26-alpine

RUN mkdir -p /var/cache/nginx/tiles && chown -R nginx:nginx /var/cache/nginx

COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./ssl/cert.pem /etc/nginx/ssl/cert.pem
COPY ./ssl/key.pem /etc/nginx/ssl/key.pem