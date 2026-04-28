FROM node:24-alpine AS client-build

WORKDIR /usr/src/app

ARG VITE_BASE_PATH=/wordnet/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

COPY client/package*.json ./
RUN npm ci

COPY client .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /usr/src/app/dist /usr/share/nginx/html/wordnet

EXPOSE 80 443
