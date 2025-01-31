#!/usr/bin/env bash

## Since for building the images we need to use Docker in Docker, but it's not available 
## during the build process, we need to build the image in 2 steps, running postunpack and
## commiting the changes to a new image after.

set -e

HYPERLEDGER_VERSION=${2:-2.5.10}
HYPERLEDGER_CA_VERSION=${3:-1.5.13}
TARGET_TAG=${1:-statuscompliance/blockchain}
TMP_IMAGE_NAME=temp-status/blockchain
TARGET_FILE=docker-image.tar

CONTAINER_ID=

cleanup() {
  echo "Cleaning up..."
  set +e
  rm -rf docker-build/.build
  docker rm -f "${CONTAINER_ID}" &> /dev/null
  docker rmi -f "${TMP_IMAGE_NAME}" &> /dev/null
  $(docker images -q -f "dangling=true" | xargs -r docker rmi -f) &> /dev/null &
  docker builder prune -af &> /dev/null &
  docker buildx prune -af &> /dev/null &
  wait
  docker volume prune -f &> /dev/null
}

trap cleanup EXIT
rm -rf "${TARGET_FILE}" docker-build/.build

# Copy files from app to docker-build/.build, excluding those included in gitignore
mkdir -p docker-build/.build
(cd app && git ls-files --others --cached --exclude-standard) | sort -u | while read -r file; do
  if [ -f "app/$file" ]; then
    mkdir -p "docker-build/.build/$(dirname "$file")"
    cp "app/$file" "docker-build/.build/$file"
  fi
done

rm -rf docker-build/.build/packages/shared/configs docker-build/.build/packages/blockchainizer
find docker-build/.build \( -name ".gitignore" -o -name "tsconfig.json" -o -name "eslint.config.ts" \) -print0 | xargs -0 rm -rf

docker build \
  --no-cache \
  --force-rm \
  -t "${TMP_IMAGE_NAME}" \
  -f ./docker-build/Dockerfile \
  ./docker-build

CONTAINER_ID=$(docker create \
  --privileged \
  "${TMP_IMAGE_NAME}" \
  /postunpack.sh ${HYPERLEDGER_VERSION} ${HYPERLEDGER_CA_VERSION})
docker start --attach "${CONTAINER_ID}"

echo -e "\nBuild finished! Committing..."
docker stop "${CONTAINER_ID}" &> /dev/null
docker commit -c 'CMD ["/usr/bin/npm", "-w", "@statuscompliance/blockchain-middleware", "start"]' \
  "${CONTAINER_ID}" "${TARGET_TAG}" &> /dev/null
echo "Image committed! Saving to ${TARGET_FILE}"
docker save "${TARGET_TAG}" > "${TARGET_FILE}"
