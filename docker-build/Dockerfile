FROM node:lts-slim AS build

WORKDIR /app
COPY .build/ .
RUN npm ci --no-audit --omit=dev -w @statuscompliance/blockchain-middleware

FROM docker:27-dind

ARG NODE_VERSION=22
ARG NPM_VERSION=10.9.1
# Populated automatically by Docker buildx
ARG TARGETARCH

ENV TINI_SUBREAPER=true TINI_KILL_PROCESS_GROUP=true
ENV DOCKER_IMAGE_PATHS="/docker-images" CHAINCODE_PATH="/chaincodes" FABRIC_TOOLS_PATH="/fabric"
ENV FABRIC_CFG_PATH="${FABRIC_TOOLS_PATH}/config"
ENV PATH="${PATH}:${FABRIC_TOOLS_PATH}/bin:${FABRIC_TOOLS_PATH}/config"
#ENV DIND_DEFAULT_LABEL="dind=status-blockchain"

# Environment preparation
COPY scripts/*.sh /
RUN chmod +x /*.sh && \
  # Remove set -eu from the Docker entrypoint script
  sed -i '/set -e\|set -eu/ { N; /set -e\|set -eu/ {d;} }' /usr/local/bin/dockerd-entrypoint.sh && \
# chmod 0755 /usr/local/sbin/docker && \
# apk add --no-cache nodejs~=${NODE_VERSION} npm~=${NPM_VERSION} bash tini curl libc6-compat jq && \
# We're using the fabric-tools container directly, but libc6-compat si required for running the Fabric binaries outside the inner containers
# TODO: Workaround because Nodejs LTS in Alpine repositories does not resolve modules properly
  apk add --no-cache nodejs-current npm bash tini curl libc6-compat jq && \
  apk --purge del apk-tools && \
  mkdir -p "${DOCKER_IMAGE_PATHS}" && \
  rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk /var/lib/apk

SHELL ["/bin/bash", "-c"]
WORKDIR /app

COPY --from=build /app .

ENTRYPOINT ["/sbin/tini", "-g", "--", "/entrypoint.sh"]

## The CMD is set in the build-docker.sh script that builds this Dockerfile
