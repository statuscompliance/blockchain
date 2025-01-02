#!/usr/bin/env sh

# DIND (Docker in Docker) works by passing all the commands to the host daemon, so we
# need to wrap the Docker CLI to add the label automatically to all the resources created
# inside the blockhain container.

DOCKER_PATH="/usr/local/bin/docker"

echo "[DIND-STATUS-BLOCKCHAIN] Running through docker interceptor"

# ash doesn't support advanced bash expressions, so we need to iterate over the arguments
get_image_name() {
  local image_name
  for arg; do
    image_name="$arg"
  done
  echo "$image_name"
}

execute_docker_command() {
  local action="$1"
  shift
  $DOCKER_PATH "$action" --label "$DIND_DEFAULT_LABEL" --pull=never "$@"
}

case "$1" in
  run|create|build)
    # Remove first argument
    action="$1"
    shift
    execute_docker_command "$action" "$@"
    # 125 op code belongs to image not found, so other errors are skipped and must be solved independently,
    # so we're sure that the last argument will always be a missing image.
    if [[ "$?" -eq 125 ]]; then
      # Using docker instead of DOCKER_PATH directly to recursively run this script on pull
      docker pull $(get_image_name "$@")
      execute_docker_command "$action" "$@"
    fi
    ;;
  network|volume)
    if [[ "$2" == "create" ]]; then
      $DOCKER_PATH "$@" --label "$DIND_DEFAULT_LABEL"
    else
      $DOCKER_PATH "$@"
    fi
    ;;
  pull)
    $DOCKER_PATH "$@"
    image_name=$(get_image_name "$@")
    image_sha=$($DOCKER_PATH image inspect --format="{{.Id}}" "$image_name")

    if [[ $? -eq 0 ]]; then
      echo "[DIND-STATUS-BLOCKCHAIN] Rebuilding the image with the DIND label"
      echo "FROM $image_name" | $DOCKER_PATH build --label "$DIND_DEFAULT_LABEL" -t "$image_name" -
      $DOCKER_PATH rmi -f "$image_sha" > /dev/null 2>&1
    fi
    ;;
  *)
    # Other commands doesn't support labels, run without changes
    $DOCKER_PATH "$@"
    ;;
esac
