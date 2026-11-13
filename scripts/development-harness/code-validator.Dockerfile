# Build only with git archive of the contract's fixed public main, never candidate context.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG BASE_SHA
LABEL future-roi-baseline=$BASE_SHA
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build:prediction
# Chromium is nested inside the non-root, credential-free, network-none Docker boundary.
RUN printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage "$@"\n' > /usr/local/bin/harness-chromium && chmod 755 /usr/local/bin/harness-chromium
ENV HOME=/tmp TEST_BROWSER=/usr/local/bin/harness-chromium
USER 1000:1000
