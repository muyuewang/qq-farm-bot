ARG NAPCAT_IMAGE=mlikiowa/napcat-docker:latest
FROM ${NAPCAT_IMAGE}

COPY napcat/plugins/qq-miniapp-openauth /opt/qq-farm-bot/qq-miniapp-openauth
COPY napcat/docker-entrypoint.sh /usr/local/bin/qq-farm-napcat-entrypoint

RUN chmod +x /usr/local/bin/qq-farm-napcat-entrypoint

ENTRYPOINT ["/usr/local/bin/qq-farm-napcat-entrypoint"]
