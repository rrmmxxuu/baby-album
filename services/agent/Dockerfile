FROM golang:1.25-alpine AS build
WORKDIR /src
COPY . .
RUN go build -o /out/agent ./cmd/agent

FROM alpine:3.21
WORKDIR /app
RUN apk add --no-cache ca-certificates ffmpeg
COPY --from=build /out/agent /usr/local/bin/agent
CMD ["agent"]
