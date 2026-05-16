FROM node:20
RUN mkdir -p /app
WORKDIR /app
COPY . .
RUN npm install && cp node_modules/@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.min.js public/
EXPOSE 8080
ENTRYPOINT ["npm", "start"]
