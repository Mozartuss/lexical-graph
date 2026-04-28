# Lexical graph | WordNet visualisation

<p align="center">
  <img height="300px" src="https://raw.githubusercontent.com/aliiae/lexical-graph/master/images/graph.png" alt="Screenshot of a graph with lexical relations">
</p>

Technologies: *TypeScript, MongoDB, Express, React, Node, D3*.
Word lemmatisation is done with *wink-lemmatizer*.
Data processing is based on [wordnet-to-json](https://github.com/fluhus/wordnet-to-json).

## Repository layout

- `client/`: React + Vite frontend
- `server/`: Express + MongoDB API
- `nginx/`: production reverse proxy and static delivery
- `images/`: screenshots and documentation assets

## Local development

The repository now exposes root-level scripts so common tasks do not require manually changing directories.

### Docker

Run `npm run docker:dev` from the repository root.

The application will be available at [http://localhost:3000](http://localhost:3000) and the API at [http://localhost:8080](http://localhost:8080).

### Production Docker

The production compose file builds the React client into a separate nginx container, proxies the API to the internal server container, and serves the app under `/wordnet`.

Provide TLS certificates before starting:

```sh
mkdir -p nginx/certs
# place your certificate at nginx/certs/fullchain.pem
# place your private key at nginx/certs/privkey.pem
```

Then run:

```sh
npm run docker:prod
```

The application is served at `https://<host-name>/wordnet`, and API requests are proxied under `https://<host-name>/wordnet/api/...`.

Useful production environment variables:

```sh
HTTP_PORT=80
HTTPS_PORT=443
TLS_CERT_PATH=./nginx/certs/fullchain.pem
TLS_KEY_PATH=./nginx/certs/privkey.pem
DO_IMPORT_WORDNET=0
```

Set `DO_IMPORT_WORDNET=1` only when the server should import the WordNet dataset on startup.

### Without Docker

1. Install both application dependencies from the repository root:
   `npm run install:all`
2. Start MongoDB locally on `mongodb://127.0.0.1:27017/Wordnet`.
3. Start the API in one terminal:
   `npm run dev:server`
4. Start the client in a second terminal:
   `npm run dev:client`

### Useful root commands

```sh
npm run build
npm run build:client
npm run build:server
npm run test
```

## References
Princeton University "About WordNet." WordNet. Princeton University. 2010. http://wordnet.princeton.edu.
