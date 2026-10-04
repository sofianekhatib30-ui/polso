FROM alpine:3.22

# coreutils serve per "date -d", che la versione di busybox non ha
RUN apk add --no-cache bash curl openssl jq coreutils ca-certificates

WORKDIR /checker
COPY check.sh .
RUN chmod +x check.sh

# controlla ogni ora; il file dei siti arriva da un volume (vedi docker-compose.yml)
CMD ["./check.sh", "--sites", "/config/sites.txt", "--every", "3600"]
