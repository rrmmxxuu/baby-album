FROM golang:1.24-alpine AS build
WORKDIR /src
COPY . .
RUN go build -o /out/api ./cmd/server

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/api /usr/local/bin/api
EXPOSE 8080
CMD ["api"]

