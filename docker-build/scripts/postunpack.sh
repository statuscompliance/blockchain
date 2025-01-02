#!/usr/bin/env bash

set -e

echo "=== Bootstrapping Hyperledger... ==="
curl https://raw.githubusercontent.com/hyperledger/fabric/refs/heads/main/scripts/bootstrap.sh \
  | bash -s -- $1 $2 -s -b
#  | bash -s -- $1 $2

#mkdir -p /fabric/bin /fabric/config
#cp -r fabric-samples/bin /fabric
#cp -r fabric-samples/config /fabric
#mv fabric-samples/config fabric-samples/configtx

echo
echo "=== Saving images... ==="
docker_ids=$(/usr/local/bin/docker images --filter "label=${DIND_DEFAULT_LABEL}" --format "{{.ID}}" | sort -u)

for id in $docker_ids; do
  (
    echo "Saving image ${id}..."
    tags=$(/usr/local/bin/docker inspect --format='{{range .RepoTags}}{{.}} {{end}}' "$id")
    echo "${tags}" | xargs /usr/local/bin/docker save | pigz > "${DOCKER_IMAGE_PATHS}/${id}.tar.gz"
  ) &
done

wait

rm -f /postunpack.sh
