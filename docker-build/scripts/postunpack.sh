#!/usr/bin/env bash

set -e

echo "=== Bootstrapping Hyperledger... ==="
# If downloading the binaries, curl is required as a prerequisite of the image
WGETRC=/dev/null wget -q -O - https://raw.githubusercontent.com/hyperledger/fabric/refs/heads/main/scripts/bootstrap.sh \
  | bash -s -- $1 $2
#  | bash -s -- $1 $2 -s -b

mkdir -p "${FABRIC_TOOLS_PATH}"/bin "${FABRIC_TOOLS_PATH}"/config "${CHAINCODE_PATH}"
cp -r fabric-samples/bin ${FABRIC_TOOLS_PATH}
cp -r fabric-samples/config ${FABRIC_TOOLS_PATH}
mv fabric-samples/test-network ${FABRIC_TOOLS_PATH}
rm -rf fabric-samples

# TODO: Investigate which images can be scrapped
echo
echo "=== Pulling extra images... ==="
# Used by monitorDocker.sh
docker pull gliderlabs/logspout
# Used by network.sh down
docker pull busybox
# Used as the channel's database
docker pull couchdb:3.3.3

echo
echo "=== Saving images... ==="
#docker_ids=$(/usr/local/bin/docker images --filter "label=${DIND_DEFAULT_LABEL}" --format "{{.ID}}" | sort -u)
docker_ids=$(/usr/local/bin/docker images --format "{{.ID}}" | sort -u)

for id in $docker_ids; do
  (
    echo "Saving image ${id}..."
    tags=$(/usr/local/bin/docker inspect --format='{{range .RepoTags}}{{.}} {{end}}' "$id")
    echo "${tags}" | xargs /usr/local/bin/docker save | pigz > "${DOCKER_IMAGE_PATHS}/${id}.tar.gz"
  ) &
done

wait

rm -f /postunpack.sh
