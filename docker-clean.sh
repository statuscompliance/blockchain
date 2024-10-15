#!/usr/bin/env bash

docker system prune -a -f --volumes
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
docker volume rm $(docker volume ls --filter dangling=true -q)
docker rmi -f $(docker images -qa)
docker system prune -a -f --volumes