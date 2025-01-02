#!/usr/bin/env bash

set -e

ping -c 1 -q 1.0.0.1


WGET_HSTS_FILE=/dev/null wget -qO- https://raw.githubusercontent.com/hyperledger/fabric/refs/heads/main/scripts/bootstrap.sh \
  | FABRIC_DOCKER_REGISTRY=ghcr.io/hyperledger bash -s -- $1 $2 -s -b

rm -f /postunpack.sh
