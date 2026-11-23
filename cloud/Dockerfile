# Stage 1: Build the Go backend binary
FROM golang:1.26-alpine AS builder

ENV GOTOOLCHAIN=auto

WORKDIR /build

# Cache dependency downloads
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build statically linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/server

# Stage 2: Minimal runtime image
FROM alpine:3.20

# Install runtime dependencies: SSL certificates and timezone data
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Create data directory for SQLite database and blob storage
RUN mkdir -p /app/data

# Copy compiled binary from builder stage
COPY --from=builder /app/server /app/server

# Default environment configuration
ENV PORT=8080 \
    ENV=production \
    DEV_MODE=false \
    DATA_DIR=/app/data

# Expose HTTP port
EXPOSE 8080

# Persist data directory
VOLUME ["/app/data"]

# Run the backend server
CMD ["/app/server"]
