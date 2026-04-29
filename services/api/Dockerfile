FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
WORKDIR /src
ARG TARGETOS
ARG TARGETARCH
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -o /out/api ./cmd/server

FROM ubuntu:24.04
WORKDIR /app
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates ffmpeg libheif-examples \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/api /usr/local/bin/api
EXPOSE 8080
CMD ["api"]
