#!/bin/bash
# Authelia user management
# Usage:
#   ./auth-user.sh list
#   ./auth-user.sh add  <username> [password]
#   ./auth-user.sh passwd <username> [password]
#   ./auth-user.sh delete <username>
#   ./auth-user.sh reset-link          — show last password-reset link

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USERS_FILE="$SCRIPT_DIR/authelia/users_database.yml"
NOTIFY_FILE="$SCRIPT_DIR/authelia/notification.txt"
COMPOSE="sg docker -c 'docker compose -f $SCRIPT_DIR/docker-compose.yml'"

CMD=${1:-help}
USERNAME=${2:-}

# Generate argon2id hash via Authelia's own CLI
_hash() {
    local pass="$1"
    sg docker -c "docker compose -f '$SCRIPT_DIR/docker-compose.yml' run --rm authelia \
        authelia crypto hash generate argon2 --password '$pass'" 2>/dev/null \
        | grep 'Digest:' | awk '{print $2}'
}

# Prompt for password if not given as argument
_get_pass() {
    local pass="${3:-}"
    if [ -z "$pass" ]; then
        read -s -p "Password: " pass; echo
    fi
    echo "$pass"
}

case "$CMD" in
  list)
    echo "Users:"
    python3 - "$USERS_FILE" << 'EOF'
import sys, yaml
with open(sys.argv[1]) as f:
    db = yaml.safe_load(f) or {}
for u, info in db.get('users', {}).items():
    groups = ','.join(info.get('groups', []))
    print(f"  {u:<20} groups=[{groups}]")
EOF
    ;;

  add)
    [ -z "$USERNAME" ] && { echo "Usage: $0 add <username> [password]"; exit 1; }
    PASS="${3:-}"
    [ -z "$PASS" ] && { read -s -p "Password for '$USERNAME': " PASS; echo; }
    echo "Hashing..."
    HASH=$(_hash "$PASS")
    [ -z "$HASH" ] && { echo "Error: failed to generate hash"; exit 1; }
    export _AUTHELIA_HASH="$HASH"
    export _AUTHELIA_USER="$USERNAME"
    python3 - "$USERS_FILE" << 'EOF'
import sys, os, yaml
users_file = sys.argv[1]
username = os.environ['_AUTHELIA_USER']
pw_hash  = os.environ['_AUTHELIA_HASH']
with open(users_file) as f:
    db = yaml.safe_load(f) or {}
db.setdefault('users', {})
if username in db['users']:
    print(f"Error: user '{username}' already exists. Use 'passwd' to change password.")
    sys.exit(1)
db['users'][username] = {
    'displayname': username,
    'password': pw_hash,
    'email': f'{username}@localhost',
    'groups': ['users'],
}
with open(users_file, 'w') as f:
    yaml.dump(db, f, default_flow_style=False, allow_unicode=True)
print(f"Added user: {username}")
print(f"They can reset their password at: http://localhost/authelia/")
EOF
    ;;

  passwd)
    [ -z "$USERNAME" ] && { echo "Usage: $0 passwd <username> [password]"; exit 1; }
    PASS="${3:-}"
    [ -z "$PASS" ] && { read -s -p "New password for '$USERNAME': " PASS; echo; }
    echo "Hashing..."
    HASH=$(_hash "$PASS")
    [ -z "$HASH" ] && { echo "Error: failed to generate hash"; exit 1; }
    export _AUTHELIA_HASH="$HASH"
    export _AUTHELIA_USER="$USERNAME"
    python3 - "$USERS_FILE" << 'EOF'
import sys, os, yaml
users_file = sys.argv[1]
username = os.environ['_AUTHELIA_USER']
pw_hash  = os.environ['_AUTHELIA_HASH']
with open(users_file) as f:
    db = yaml.safe_load(f) or {}
if username not in db.get('users', {}):
    print(f"Error: user '{username}' not found. Use 'list' to see existing users.")
    sys.exit(1)
db['users'][username]['password'] = pw_hash
with open(users_file, 'w') as f:
    yaml.dump(db, f, default_flow_style=False, allow_unicode=True)
print(f"Password updated for: {username}")
EOF
    ;;

  delete)
    [ -z "$USERNAME" ] && { echo "Usage: $0 delete <username>"; exit 1; }
    export _AUTHELIA_USER="$USERNAME"
    python3 - "$USERS_FILE" << 'EOF'
import sys, os, yaml
users_file = sys.argv[1]
username = os.environ['_AUTHELIA_USER']
with open(users_file) as f:
    db = yaml.safe_load(f) or {}
if username not in db.get('users', {}):
    print(f"Error: user '{username}' not found.")
    sys.exit(1)
del db['users'][username]
with open(users_file, 'w') as f:
    yaml.dump(db, f, default_flow_style=False, allow_unicode=True)
print(f"Deleted user: {username}")
EOF
    ;;

  reset-link)
    if [ ! -s "$NOTIFY_FILE" ]; then
        echo "No pending reset links."
        echo "To generate one: go to http://localhost/authelia/ → 'Forgot my password' → enter username."
        exit 0
    fi
    echo "=== Last password reset notification ==="
    cat "$NOTIFY_FILE"
    echo ""
    read -p "Clear notification file? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] && > "$NOTIFY_FILE" && echo "Cleared."
    ;;

  *)
    cat << 'HELP'
Authelia user management:
  ./auth-user.sh list                  — list all users
  ./auth-user.sh add    <user> [pass]  — create new user
  ./auth-user.sh passwd <user> [pass]  — change password
  ./auth-user.sh delete <user>         — remove user
  ./auth-user.sh reset-link            — show pending password-reset link

Password reset flow for new users:
  1. Create with:  ./auth-user.sh add <user> <temppass>
  2. Share temp password with the user
  3. They log in → Settings → Change Password (or use Forgot Password)
     The reset link will appear in: authelia/notification.txt
  4. Run ./auth-user.sh reset-link to retrieve it
HELP
    ;;
esac
