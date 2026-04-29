FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
WORKDIR /src
ARG TARGETOS
ARG TARGETARCH
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -o /out/api ./cmd/server

FROM ubuntu:24.04 AS libheif
ARG LIBHEIF_VERSION=1.20.2
ARG LIBHEIF_SHA256=68ac9084243004e0ef3633f184eeae85d615fe7e4444373a0a21cebccae9d12a
WORKDIR /tmp/libheif
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        cmake \
        g++ \
        libde265-dev \
        libjpeg-dev \
        libpng-dev \
        make \
        pkg-config \
        wget \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
RUN wget -O /tmp/libheif.tar.gz "https://github.com/strukturag/libheif/releases/download/v${LIBHEIF_VERSION}/libheif-${LIBHEIF_VERSION}.tar.gz" \
    && echo "${LIBHEIF_SHA256}  /tmp/libheif.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/libheif.tar.gz --strip-components=1 -C /tmp/libheif \
    && cmake -S /tmp/libheif -B /tmp/libheif-build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DBUILD_SHARED_LIBS=ON \
        -DBUILD_TESTING=OFF \
        -DWITH_EXAMPLES=ON \
    && cmake --build /tmp/libheif-build --parallel 2 \
    && cmake --install /tmp/libheif-build

FROM ubuntu:24.04
WORKDIR /app
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates ffmpeg libde265-0 libjpeg-turbo8 libpng16-16t64 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=libheif /usr/local /usr/local
RUN ldconfig
COPY --from=build /out/api /usr/local/bin/api
EXPOSE 8080
CMD ["api"]
