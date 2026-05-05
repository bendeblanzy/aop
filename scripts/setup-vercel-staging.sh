#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# setup-vercel-staging.sh — Crée et configure l'env Staging dans Vercel
#
# Usage :
#   1. Crée un token Vercel : https://vercel.com/account/tokens
#      (scope = "Full Access" ou au minimum "Project read/write")
#   2. Lance :
#        export VERCEL_TOKEN="..."
#        bash scripts/setup-vercel-staging.sh
#
# Ce script :
#   - identifie le projet Vercel "aop"
#   - crée un Custom Environment "Staging" branché sur la branche `staging`
#   - charge toutes les env vars depuis aop/.env.staging.local
#   - les pousse dans Vercel scopées à l'env Staging
#
# Idempotent : peut être relancé sans dupliquer les variables.
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Préchecks ───────────────────────────────────────────────────────────────
: "${VERCEL_TOKEN:?Set VERCEL_TOKEN avant de lancer ce script}"

ENV_FILE="$(dirname "$0")/../.env.staging.local"
[[ -f "$ENV_FILE" ]] || { echo "❌ $ENV_FILE introuvable"; exit 1; }

PROJECT_NAME="${VERCEL_PROJECT_NAME:-aop}"

API="https://api.vercel.com"
AUTH=(-H "Authorization: Bearer $VERCEL_TOKEN")

echo "→ Lecture du projet Vercel '$PROJECT_NAME'..."
PROJECT_JSON=$(curl -fsS "${AUTH[@]}" "$API/v9/projects/$PROJECT_NAME")
PROJECT_ID=$(echo "$PROJECT_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
TEAM_ID=$(echo "$PROJECT_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accountId',''))")
echo "  projectId = $PROJECT_ID"
echo "  teamId    = ${TEAM_ID:-<personal>}"

# Param suffix pour les requêtes (teamId est requis si compte team)
SUFFIX=""
[[ -n "$TEAM_ID" ]] && SUFFIX="?teamId=$TEAM_ID"

# ─── 1. Custom Environment "Staging" ────────────────────────────────────────
echo ""
echo "→ Vérification / création de l'environnement 'Staging'..."

EXISTING_ENVS=$(curl -fsS "${AUTH[@]}" "$API/v9/projects/$PROJECT_ID/custom-environments$SUFFIX")
STAGING_ENV_ID=$(echo "$EXISTING_ENVS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
envs = d.get('environments', d) if isinstance(d, dict) else d
for e in envs:
    if e.get('slug') == 'staging' or e.get('name','').lower() == 'staging':
        print(e['id']); break
" || echo "")

if [[ -z "$STAGING_ENV_ID" ]]; then
  echo "  → création..."
  CREATE_RESP=$(curl -fsS -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    "$API/v9/projects/$PROJECT_ID/custom-environments$SUFFIX" \
    -d '{
      "slug": "staging",
      "description": "Pré-prod permanente (branche Git: staging)",
      "branchMatcher": {"type": "equals", "pattern": "staging"}
    }')
  STAGING_ENV_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
  echo "  ✓ env Staging créé (id=$STAGING_ENV_ID)"
else
  echo "  ✓ env Staging existe déjà (id=$STAGING_ENV_ID)"
fi

# ─── 2. Env vars : lecture du .env.staging.local ────────────────────────────
echo ""
echo "→ Chargement des variables depuis .env.staging.local..."

declare -a VAR_NAMES=()
declare -A VAR_VALUES=()

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  [[ -z "$value" ]] && continue
  # Strip whitespace
  key=$(echo "$key" | xargs)
  VAR_NAMES+=("$key")
  VAR_VALUES["$key"]="$value"
done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")

echo "  → ${#VAR_NAMES[@]} variables non-vides trouvées"

# ─── 3. Push de chaque variable dans Vercel (scope = staging) ──────────────
echo ""
echo "→ Synchronisation des env vars dans Vercel (scope 'staging')..."

for key in "${VAR_NAMES[@]}"; do
  value="${VAR_VALUES[$key]}"

  # Type: secret pour les *_KEY/*_TOKEN/*_SECRET, sinon plain
  case "$key" in
    *_KEY|*_TOKEN|*_SECRET|*PASSWORD|*PASSWORD*)
      TYPE="encrypted"
      ;;
    NEXT_PUBLIC_*)
      TYPE="plain"
      ;;
    *)
      TYPE="encrypted"
      ;;
  esac

  # Vérifier si la variable existe déjà sur l'env Staging
  EXISTING=$(curl -fsS "${AUTH[@]}" \
    "$API/v9/projects/$PROJECT_ID/env$SUFFIX&decrypt=false" 2>/dev/null \
    || curl -fsS "${AUTH[@]}" "$API/v9/projects/$PROJECT_ID/env$SUFFIX")
  EXISTING_ID=$(echo "$EXISTING" | python3 -c "
import json, sys, os
key = os.environ['VVAR_KEY']
data = json.load(sys.stdin)
envs = data.get('envs', [])
for e in envs:
    if e.get('key') == key and 'staging' in (e.get('customEnvironmentIds') or []):
        print(e['id']); break
    if e.get('key') == key and 'staging' in (e.get('target') or []):
        print(e['id']); break
" VVAR_KEY="$key" 2>/dev/null || echo "")

  PAYLOAD=$(python3 -c "
import json, sys, os
print(json.dumps({
    'key': os.environ['VVAR_KEY'],
    'value': os.environ['VVAR_VALUE'],
    'type': os.environ['VVAR_TYPE'],
    'customEnvironmentIds': [os.environ['VVAR_ENV_ID']],
}))
" VVAR_KEY="$key" VVAR_VALUE="$value" VVAR_TYPE="$TYPE" VVAR_ENV_ID="$STAGING_ENV_ID")

  if [[ -n "$EXISTING_ID" ]]; then
    # Update
    RESP=$(curl -fsS -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
      "$API/v9/projects/$PROJECT_ID/env/$EXISTING_ID$SUFFIX" \
      -d "$PAYLOAD" || echo "ERROR")
    echo "  ↻ $key (updated)"
  else
    # Create
    RESP=$(curl -fsS -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
      "$API/v10/projects/$PROJECT_ID/env$SUFFIX" \
      -d "$PAYLOAD" || echo "ERROR")
    echo "  + $key (created)"
  fi
done

echo ""
echo "✅ Configuration Vercel staging terminée."
echo ""
echo "Prochaines étapes :"
echo "  1. Configure le DNS staging.ladndata.com (CNAME → cname.vercel-dns.com)"
echo "  2. Dans Vercel : Project → Settings → Domains → Add 'staging.ladndata.com' → assign to Staging"
echo "  3. Push un commit sur la branche 'staging' pour déclencher le 1er déploiement"
