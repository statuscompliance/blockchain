#!/bin/sh

set -e

echo "==== Starting DIND daemon & setup ===="
echo

find /run /var/run \( -iname 'docker*.pid' -o -iname 'container*.pid' \) | xargs rm -rf
/usr/local/bin/dockerd-entrypoint.sh dockerd &> /dev/null &

sleep 1
until docker info &> /dev/null; do
  sleep 1
done

echo

# Load into the daemon the embedded Hyperledger images
if [ -d "${DOCKER_IMAGE_PATHS}" ]; then
  for image in "${DOCKER_IMAGE_PATHS}"/*.tar*; do
    if [ -f "$image" ]; then
      echo "Loading image $image..."
      docker load < "$image" &> /dev/null
      echo "Image $image loaded!"
    fi
  done
fi

echo
echo "====      Setup finished!        ===="
echo

exec "$@"