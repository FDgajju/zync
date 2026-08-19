FROM ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        libappindicator3-dev \
        librsvg2-dev \
        libssl-dev \
        libwebkit2gtk-4.1-dev \
        patchelf \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.97.1

ENV PATH=/root/.cargo/bin:$PATH
ENV GOOGLE_CLIENT_ID=ci-ssh-security-test-client-id

WORKDIR /workspace
COPY Cargo.toml Cargo.lock build.rs tauri.conf.json ./
COPY capabilities ./capabilities
COPY icons ./icons
COPY src ./src
COPY test-fixtures ./test-fixtures

RUN cargo test --lib ssh::tests:: --no-run

CMD ["bash", "-lc", "cargo test --lib ssh::tests:: -- --test-threads=1 && cargo test --lib ssh::tests:: -- --ignored --test-threads=1"]
