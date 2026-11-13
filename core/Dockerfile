FROM rust:bookworm AS builder

# Install MinGW toolchain for Windows 64-bit cross-compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    mingw-w64 \
    && rm -rf /var/lib/apt/lists/*

# Add Rust target for 64-bit Windows GNU
RUN rustup target add x86_64-pc-windows-gnu

# Configure cargo linker for mingw-w64
ENV CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc

# Set workspace directory
WORKDIR /workspace

# Copy workspace sources
COPY . .

# Build the workspace in release mode for Windows
RUN cargo build --release --target x86_64-pc-windows-gnu

# Prepare default output directory inside the image
RUN mkdir -p /output && \
    cp target/x86_64-pc-windows-gnu/release/tide-daemon.exe /output/

# Expose /output as a mountable volume
VOLUME ["/output"]

# When run as a container, copy the compiled binary into the mounted /output volume
CMD ["sh", "-c", "mkdir -p /output && cp /workspace/target/x86_64-pc-windows-gnu/release/tide-daemon.exe /output/ && echo '[+] Successfully copied tide-daemon.exe to /output'"]
