#/bin/bash
## Since for building the images we need to use Docker in Docker, but it's not available 
## during the build process, we need to build the image in 2 steps with different Dockerfiles
HYPERLEDGER_VERSION=2.5.10
HYPERLEDGER_CA_VERSION=1.5.13
TMP_IMAGE_NAME=temp-status/blockchain

set -e

CONTAINER_ID=

cleanup() {
  docker rmi "${TMP_IMAGE_NAME}" > /dev/null 2>&1
  docker rm -f "${CONTAINER_ID}" > /dev/null 2>&1
}

trap cleanup EXIT

docker build -t "${TMP_IMAGE_NAME}" -f ./docker-build/Dockerfile.1 ./docker-build
CONTAINER_ID=$(docker create -v /var/run/docker.sock:/var/run/docker.sock "${TMP_IMAGE_NAME}" /postunpack.sh "${HYPERLEDGER_VERSION}" "${HYPERLEDGER_CA_VERSION}")
docker start --attach "${CONTAINER_ID}"
docker commit "${CONTAINER_ID}" "${TMP_IMAGE_NAME}"
docker save "${TMP_IMAGE_NAME}" > docker-image.tar
