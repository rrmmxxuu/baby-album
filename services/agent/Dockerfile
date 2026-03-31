FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
WORKDIR /src
ARG TARGETOS
ARG TARGETARCH
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -o /out/agent ./cmd/agent

FROM alpine:3.21
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=build /out/agent /usr/local/bin/agent
CMD ["agent"]
