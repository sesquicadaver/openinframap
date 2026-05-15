#!/bin/bash
# User management helper for Authelia
# Usage:
#   ./auth-user.sh hash <password>    — generate password hash
#   ./auth-user.sh add <username>     — add new user (prompts for password)

set -e

CMD=${1:-help}
USER=${2:-}

case "$CMD" in
  hash)
    if [ -z "$USER" ]; then
      echo "Usage: $0 hash <password>"
      exit 1
    fi
    sg docker -c "docker compose run --rm authelia authelia crypto hash generate argon2 --password '$USER'"
    ;;
  add)
    if [ -z "$USER" ]; then
      echo "Usage: $0 add <username>"
      exit 1
    fi
    read -s -p "Password for $USER: " PASS
    echo
    HASH=$(sg docker -c "docker compose run --rm authelia authelia crypto hash generate argon2 --password '$PASS'" | grep 'Digest:' | awk '{print $2}')
    echo ""
    echo "Add to authelia/users_database.yml:"
    echo ""
    echo "  $USER:"
    echo "    displayname: '$USER'"
    echo "    password: '$HASH'"
    echo "    email: '$USER@localhost'"
    echo "    groups:"
    echo "      - admins"
    ;;
  *)
    echo "Usage: $0 <hash|add> [arg]"
    echo "  hash <password>  — print argon2id hash for a password"
    echo "  add  <username>  — generate YAML entry for new user"
    ;;
esac
