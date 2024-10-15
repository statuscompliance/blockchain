FROM docker:27

ENV DIND_DEFAULT_LABEL="dind=status-blockchain"

# Environment preparation, Node setup
COPY scripts/docker-wrapper.sh /usr/local/sbin/docker
RUN chmod 0755 /usr/local/sbin/docker && \
  apk add --no-cache nodejs npm && \
  apk --purge del apk-tools && \
  rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk /var/lib/apk