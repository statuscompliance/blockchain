#!/usr/bin/env bash

## Since for building the images we need to use Docker in Docker, but it's not available 
## during the build process, we need to build the image in 2 steps, running postunpack and
## commiting the changes to a new image after.

set -e

HYPERLEDGER_VERSION=${2:-2.5.10}
HYPERLEDGER_CA_VERSION=${3:-1.5.13}
TARGET_TAG=${1:-statuscompliance/blockchain}
TMP_IMAGE_NAME=temp-status/blockchain
TARGET_FILE=container
ARCHS=("amd64" "arm64")
REGISTRY_CONTAINER_ID=
CLEAN_LATEST_TAG=true

declare -A CONTAINER_IDS=()
declare -a pids=()

cleanup() {
  set +e
  for pid in "${pids[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid"
  done
  if [ ! -n "${SILENT+x}" ]; then
    echo -e "\nCleaning up (this may take a while)..."
  fi
  rm -rf docker-build/.build
  docker stop "${REGISTRY_CONTAINER_ID}" &> /dev/null
  if [ "${CLEAN_LATEST_TAG}" = true ]; then
    docker rmi "${TARGET_TAG}" &> /dev/null
  fi
  for ARCH in "${ARCHS[@]}"; do
    docker stop "${CONTAINER_IDS["${ARCH}"]}" &> /dev/null
    docker rmi -f "${TMP_IMAGE_NAME}:${ARCH}" 127.0.0.1:5000/"${TMP_IMAGE_NAME}:${ARCH}" &> /dev/null
    docker rm -f "${CONTAINER_IDS["${ARCH}"]}" &> /dev/null
  done
  docker builder prune -af &> /dev/null
  docker buildx prune -af &> /dev/null
  docker buildx rm statuscompliance-builder &> /dev/null
  docker rmi -f registry:2 &> /dev/null
  docker images --filter=reference='tonistiigi/binfmt' -q | xargs -r docker rmi -f &> /dev/null
  docker images --filter=reference='moby/buildkit*' -q | xargs -r docker rmi -f &> /dev/null
  $(docker images -q -f "dangling=true" | xargs -r docker rmi -f) &> /dev/null
  docker volume prune -f &> /dev/null
  set -e
}

trap cleanup EXIT
SILENT=true cleanup
rm -rf docker_images

# Copy files from packages to docker-build/.build, excluding those included in gitignore
mkdir -p docker-build/.build/packages
cp package*.json docker-build/.build
(cd packages && git ls-files --others --cached --exclude-standard) | sort -u | while read -r file; do
  if [ -f "packages/$file" ]; then
    mkdir -p "docker-build/.build/packages/$(dirname "$file")"
    cp -r "packages/$file" "docker-build/.build/packages/$file"
  fi
done

rm -rf docker-build/.build/packages/shared/configs docker-build/.build/packages/blockchainizer
find docker-build/.build \( -name ".gitignore" -o -name "tsconfig.json" -o -name "eslint.config.ts" \) -print0 | xargs -0 rm -rf

echo "Preparing for multi-platform building..."
# At least QEMU 9.2.0 version is needed so tini work inside the container in arm64.
# First, we uninstall older versions of QEMU so we stricly use latest (the install all command doesn't do this
# if older versions are found).
emulators=$(docker run --privileged -q --rm tonistiigi/binfmt)
emulators=$(echo "$emulators" | jq -r '.emulators | join(",")')
docker run --privileged --rm tonistiigi/binfmt --uninstall "${emulators}" &> /dev/null
docker run --privileged --rm tonistiigi/binfmt --install all &> /dev/null
docker buildx create --name statuscompliance-builder \
  --driver docker-container \
  --driver-opt=network=host \
  --bootstrap --use &> /dev/null

echo "Builders ready! Building images..."

for ARCH in "${ARCHS[@]}"; do
  (
    docker buildx build \
      --platform "linux/${ARCH}" \
      --load \
      --progress plain \
      -t "${TMP_IMAGE_NAME}:${ARCH}" \
      -f ./docker-build/Dockerfile \
      ./docker-build
  ) &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

pids=()

for ARCH in "${ARCHS[@]}"; do
  CONTAINER_IDS["${ARCH}"]=$(
    docker create \
      --platform "linux/${ARCH}" \
      --privileged \
      "${TMP_IMAGE_NAME}:${ARCH}" \
      /postunpack.sh "${HYPERLEDGER_VERSION}" "${HYPERLEDGER_CA_VERSION}"
  )
  # This is needed since the dictionary can't be accessed in a subshell (but individual variables can)
  container_id="${CONTAINER_IDS["${ARCH}"]}"
  (
    docker start --attach "${container_id}"
    docker stop "${container_id}" &> /dev/null
    docker commit \
      -c 'CMD ["/usr/bin/npm", "-w", "@statuscompliance/blockchain-middleware", "start"]' \
      "${container_id}" \
      "${TMP_IMAGE_NAME}:${ARCH}" &> /dev/null
  ) &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

pids=()

echo -e "\n\nImages committed! Exporting and preparing multi-platform image build (this may take a while)..."
mkdir -p docker_images

# Since for building multiplatform images we can only use the docker-container driver,
# which is an independent container from the host container. Hence, it doesn't have access
# to our local images. We need to push the images to a local registry so they
# can be pulled inside the build command.
REGISTRY_CONTAINER_ID=$(docker create --rm -q --network host registry:2)
docker start "${REGISTRY_CONTAINER_ID}" &> /dev/null

JOINED_PLATFORMS=""

for ARCH in "${ARCHS[@]}"; do
  if [ -z "$JOINED_PLATFORMS" ]; then
    JOINED_PLATFORMS="linux/$ARCH"
  else
    JOINED_PLATFORMS="$JOINED_PLATFORMS,linux/$ARCH"
  fi
  docker tag "${TMP_IMAGE_NAME}:${ARCH}" "${TARGET_TAG}" &> /dev/null
  docker save "${TARGET_TAG}" > "docker_images/${TARGET_FILE}-${ARCH}.tar"
  docker rmi "${TARGET_TAG}" &> /dev/null
  docker tag "${TMP_IMAGE_NAME}:${ARCH}" 127.0.0.1:5000/"${TMP_IMAGE_NAME}:${ARCH}" &> /dev/null
  docker push -q 127.0.0.1:5000/"${TMP_IMAGE_NAME}:${ARCH}" &> /dev/null
done

CURRENT_ARCH=$(docker version \
  --format '{{.Server.Arch}}{{if eq .Server.Arch "arm"}}/{{.Server.Variant}}{{end}}'
)
docker load -q < "docker_images/${TARGET_FILE}-${CURRENT_ARCH}.tar" &> /dev/null &

CLEAN_LATEST_TAG=false
TMP_DOCKERFILE=$(cat << EOF
ARG TARGETARCH
FROM 127.0.0.1:5000/${TMP_IMAGE_NAME}:\${TARGETARCH}
EOF
)

echo "Multi-platform build ready! Building..."

echo -e "${TMP_DOCKERFILE}" | docker buildx build \
  --platform "${JOINED_PLATFORMS}" \
  --output type=oci,dest="docker_images/${TARGET_FILE}-oci.tar" \
  -q \
  -t "${TARGET_TAG}" \
  -f - \
  . &> /dev/null

wait
echo "Images built!"
