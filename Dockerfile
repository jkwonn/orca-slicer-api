FROM node:22-bookworm AS build

ARG ORCA_VERSION=2.3.2
ARG TARGETARCH

WORKDIR /app

# Download OrcaSlicer and extract the embedded squashfs directly via unsquashfs
# instead of running `./orca.AppImage --appimage-extract`. The latter fails
# silently when cross-building linux/amd64 on Apple Silicon (QEMU emulation
# can't run the AppImage runtime reliably). Extracting the squashfs payload at
# its byte offset bypasses the AppImage binary entirely and works under both
# emulation and native.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates squashfs-tools python3 \
	&& rm -rf /var/lib/apt/lists/*

# Extract the squashfs payload from the AppImage by parsing the ELF header to
# find where the runtime binary ends, then running unsquashfs at that offset.
# This works under QEMU emulation because we never execute the amd64 AppImage.
# The first-`hsqs` approach doesn't work because the string appears in the
# runtime's data section.
RUN set -eux; \
	if [ "$TARGETARCH" = "arm64" ]; then \
		URL="https://github.com/kldzj/orca-slicer-arm64/releases/download/v${ORCA_VERSION}-arm64/OrcaSlicer-${ORCA_VERSION}-arm64-linux.AppImage"; \
	else \
		URL="https://github.com/SoftFever/OrcaSlicer/releases/download/v${ORCA_VERSION}/OrcaSlicer_Linux_AppImage_Ubuntu2404_V${ORCA_VERSION}.AppImage"; \
	fi; \
	echo "Downloading $URL"; \
	curl -fSL -o orca.AppImage "$URL"; \
	SIZE=$(stat -c%s orca.AppImage); \
	echo "Downloaded AppImage: $SIZE bytes"; \
	test "$SIZE" -gt 100000000 || { echo "AppImage suspiciously small"; exit 1; }; \
	OFFSET=$(python3 -c "import struct; d=open('orca.AppImage','rb').read(8192); assert d[:4]==b'\\x7fELF', 'Not an ELF'; e_shoff=struct.unpack('<Q',d[40:48])[0]; e_shentsize=struct.unpack('<H',d[58:60])[0]; e_shnum=struct.unpack('<H',d[60:62])[0]; print(e_shoff + e_shentsize*e_shnum)"); \
	echo "Squashfs offset (ELF-derived): $OFFSET"; \
	test -n "$OFFSET" || { echo "Failed to derive squashfs offset"; exit 1; }; \
	unsquashfs -d squashfs-root -o "$OFFSET" orca.AppImage; \
	rm orca.AppImage; \
	test -x squashfs-root/AppRun || { echo "squashfs-root/AppRun missing after extract"; ls -la squashfs-root; exit 1; }; \
	echo "Extract OK — squashfs-root contains $(ls squashfs-root | wc -l) entries"

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM ubuntu:24.04

RUN apt-get update \
	&& apt-get upgrade -y \
	&& apt-get install -y --no-install-recommends \
	curl ca-certificates gnupg \
	&& mkdir -p /etc/apt/keyrings \
	&& curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
	&& echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends \
	nodejs \
	libgl1 libgl1-mesa-dri libegl1 \
	libgtk-3-0 \
	libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 \
	libwebkit2gtk-4.1-0 \
	&& update-ca-certificates \
	&& rm -rf /var/lib/apt/lists/*


COPY --from=build /app/dist/src /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/squashfs-root /app/squashfs-root

# Sinter: pre-bake every printer / preset / filament profile we support into the
# DATA_PATH. Runs python3 for JSON patching.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 \
	&& rm -rf /var/lib/apt/lists/*
COPY setup-profiles.sh /app/setup-profiles.sh
RUN chmod +x /app/setup-profiles.sh && /app/setup-profiles.sh

ENV PORT=3000
ENV ORCASLICER_PATH=/app/squashfs-root/AppRun
ENV DATA_PATH=/app/data
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "app/dist/index.js"]