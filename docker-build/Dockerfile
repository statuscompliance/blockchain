FROM node:lts-slim AS build

WORKDIR /tmp/build
COPY .build/ .
RUN npm ci --no-audit --omit=dev -w @statuscompliance/blockchain-middleware

FROM docker:27-dind

ARG NODE_VERSION=22.11.0
ARG NPM_VERSION=10.9.1
ENV DIND_DEFAULT_LABEL="dind=status-blockchain"
ENV TINI_SUBREAPER="true" TINI_KILL_PROCESS_GROUP="true"
ENV DOCKER_IMAGE_PATHS="/docker-images"
#ENV PATH="${PATH}:/fabric/bin:/fabric/config"

# Environment preparation, Node setup
COPY scripts/docker-wrapper.sh /usr/local/sbin/docker
COPY scripts/postunpack.sh /postunpack.sh
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /usr/local/sbin/docker && \
  chmod +x /*.sh && \
  apk add --no-cache nodejs~=${NODE_VERSION} npm~=${NPM_VERSION} bash iptables tini curl && \
  apk --purge del apk-tools && \
  mkdir -p "${DOCKER_IMAGE_PATHS}" && \
  rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk /var/lib/apk

SHELL ["/bin/bash", "-c"]
WORKDIR /app

COPY --from=build /tmp/build .

ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/docker-init", "/entrypoint.sh"]
CMD ["npm", "start"]
