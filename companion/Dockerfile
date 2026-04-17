# GlubLM companion server - multi-stage Docker image
# Build context must be the repo root so we can COPY both companion/ and
# desk-pet/ (the model + tokenizer live under desk-pet/ and are loaded via
# relative path by server/index.js).
#
# Build:   docker build -t glub-companion -f companion/Dockerfile .
# Prefer:  use companion/docker-compose.yml, which sets context: ..

FROM node:20-alpine

# onnxruntime-node pulls native .node bindings on install; Alpine needs
# libstdc++ at runtime to load them.
RUN apk add --no-cache libstdc++

WORKDIR /app

# Install deps first for a cacheable layer.
COPY companion/package.json companion/package-lock.json ./companion/
RUN cd companion && npm ci --omit=dev

# Application source.
COPY companion/ ./companion/

# Model + tokenizer live in desk-pet/ and are loaded via a relative path
# from server/index.js (see `inference.load(...)`).
COPY desk-pet/model.onnx desk-pet/tokenizer.json ./desk-pet/

ENV NODE_ENV=production \
    PORT=3210 \
    STATE_FILE=/app/state/pet-state.json

EXPOSE 3210

VOLUME ["/app/state"]

WORKDIR /app/companion
CMD ["node", "server/index.js"]
