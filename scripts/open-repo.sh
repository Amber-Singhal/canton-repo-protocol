#!/bin/bash
#
# Description:
#   This script automates the process of opening a new repo position on a local
#   Canton sandbox ledger. It simulates the two-step workflow:
#   1. The Borrower proposes a repo trade by creating a `RepoProposal` contract.
#   2. The Lender accepts the proposal, which atomically settles the trade (DvP).
#
# Prerequisites:
#   - A Canton sandbox started with `dpm sandbox`.
#   - The `canton-repo-protocol` DAR loaded into the sandbox.
#   - A setup script (e.g., `daml script --dar .daml/dist/canton-repo-protocol-*.dar --script-name Repo.Setup:setupInitialState`)
#     has been run to allocate parties and issue initial assets (USD for Lender, T-BOND for Borrower).
#   - `curl`, `jq`, and `openssl` must be installed.
#
set -euo pipefail

# --- Configuration ---
readonly JSON_API_URL="http://localhost:7575"
readonly APP_ID="canton-repo-protocol"

# Party IDs are hardcoded for simplicity in this sandbox script.
# These values are derived from display names "Borrower" and "Lender"
# when allocated via `allocatePartyWithHint` in a Daml Script.
# Your actual party IDs may vary depending on the participant they are allocated on.
readonly BORROWER_PARTY_ID="Borrower::12204c355f81f13b1945f77175c5e87901198539b7d5f0e386047a2745362e49d214"
readonly LENDER_PARTY_ID="Lender::12208a08d6c77045b7e80a9c688d076ff7a0c6441b4e9f7435f30325f414591d32b5"

# --- Helper Functions ---

# Check for required command-line tools
function check_tools() {
  for tool in curl jq openssl; do
    if ! command -v "$tool" &> /dev/null; then
      echo "ERROR: Required tool '$tool' is not installed. Please install it to continue." >&2
      exit 1
    fi
  done
}

# URL-safe base64 encoding
function base64_url() {
  base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n'
}

# Generates a Canton-compatible JWT for a given party ID.
# Uses the default 'secret' for sandboxes started with `dpm sandbox`.
function generate_jwt() {
  local party_id=$1
  local secret="secret"

  local header
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)

  local payload
  payload=$(jq -c -n \
      --arg pid "sandbox" \
      --arg appid "$APP_ID" \
      --arg party "$party_id" \
      '{participant_id: $pid, application_id: $appid, actAs: [$party]}' | base64_url)

  local signature
  signature=$(printf '%s' "${header}.${payload}" | \
      openssl dgst -sha256 -binary -hmac "${secret}" | base64_url)

  printf '%s' "${header}.${payload}.${signature}"
}

# Queries the ledger for a specific asset contract owned by a party.
function find_asset_cid() {
  local symbol=$1
  local owner_id=$2
  local owner_jwt=$3
  local template_id="Repo.Asset:Asset" # Assumes a standard asset template

  local query_payload
  query_payload=$(jq -n \
      --arg tid "$template_id" \
      --arg sym "$symbol" \
      '{templateIds: [$tid], query: {symbol: $sym}}')

  # Note: The query doesn't filter by owner because the JWT scope (`actAs`)
  # already restricts the query to what the party can see.
  local response
  response=$(curl -s -X POST "${JSON_API_URL}/v1/query" \
    -H "Authorization: Bearer $owner_jwt" \
    -H "Content-Type: application/json" \
    -d "$query_payload")

  if [[ $(echo "$response" | jq -r '.status') != "200" ]]; then
    echo "ERROR: Failed to query for asset '$symbol'." >&2
    echo "$response" | jq >&2
    exit 1
  fi

  echo "$response" | jq -r '.result[0].contractId'
}


# --- Main Script ---
check_tools

echo "▶️  Starting repo opening workflow..."

# 1. Generate authentication tokens
echo "🔑 Generating JWTs for Borrower and Lender..."
readonly BORROWER_JWT=$(generate_jwt "$BORROWER_PARTY_ID")
readonly LENDER_JWT=$(generate_jwt "$LENDER_PARTY_ID")

# 2. Find prerequisite asset contracts
echo "🔎 Searching for initial asset contracts (Cash for Lender, Collateral for Borrower)..."
readonly CASH_CID=$(find_asset_cid "USD" "$LENDER_PARTY_ID" "$LENDER_JWT")
readonly COLLATERAL_CID=$(find_asset_cid "T-BOND-2033" "$BORROWER_PARTY_ID" "$BORROWER_JWT")

if [ "$CASH_CID" == "null" ] || [ "$COLLATERAL_CID" == "null" ]; then
  echo "❌ ERROR: Could not find required asset contracts." >&2
  echo "Please ensure the setup script has been run to issue assets:" >&2
  echo "  - Lender should own a 'USD' asset." >&2
  echo "  - Borrower should own a 'T-BOND-2033' asset." >&2
  exit 1
fi
echo "   - Found Lender's cash (USD): ${CASH_CID}"
echo "   - Found Borrower's collateral (T-BOND-2033): ${COLLATERAL_CID}"

# 3. Borrower creates the RepoProposal
echo "🖊️  Borrower is proposing a new repo trade..."
readonly TRADE_DATE=$(date -u +"%Y-%m-%d")

readonly proposal_payload=$(jq -n \
  --arg borrower "$BORROWER_PARTY_ID" \
  --arg lender "$LENDER_PARTY_ID" \
  --arg collateralCid "$COLLATERAL_CID" \
  --arg principal "9800000.00" \
  --arg term "1" \
  --arg rate "0.0525" \
  --arg tradeDate "$TRADE_DATE" \
  '{
     "templateId": "Repo.Proposal:RepoProposal",
     "payload": {
       "borrower": $borrower,
       "lender": $lender,
       "collateralCid": $collateralCid,
       "principalAmount": $principal,
       "termDays": $term,
       "repoRate": $rate,
       "tradeDate": $tradeDate
     }
   }')

proposal_response=$(curl -s -X POST "${JSON_API_URL}/v1/create" \
  -H "Authorization: Bearer $BORROWER_JWT" \
  -H "Content-Type: application/json" \
  -d "$proposal_payload")

if [[ $(echo "$proposal_response" | jq -r '.status') != "200" ]]; then
  echo "❌ ERROR: Failed to create repo proposal." >&2
  echo "$proposal_response" | jq >&2
  exit 1
fi

readonly PROPOSAL_CID=$(echo "$proposal_response" | jq -r '.result.contractId')
echo "   - Repo proposal created successfully: ${PROPOSAL_CID}"

# 4. Lender accepts the proposal
echo "✅ Lender is accepting the proposal, triggering DvP settlement..."
readonly accept_payload=$(jq -n \
   --arg cashCid "$CASH_CID" \
   '{
     "templateId": "Repo.Proposal:RepoProposal",
     "contractId": "'"$PROPOSAL_CID"'",
     "choice": "Accept",
     "argument": {
       "cashCid": $cashCid
     }
   }')

accept_response=$(curl -s -X POST "${JSON_API_URL}/v1/exercise" \
  -H "Authorization: Bearer $LENDER_JWT" \
  -H "Content-Type: application/json" \
  -d "$accept_payload")

if [[ $(echo "$accept_response" | jq -r '.status') != "200" ]]; then
  echo "❌ ERROR: Failed to accept repo proposal." >&2
  echo "$accept_response" | jq >&2
  exit 1
fi

readonly REPO_TRADE_CID=$(echo "$accept_response" | jq -r '.result.exerciseResult')
echo "   - Repo accepted and settled atomically."

echo "✅ Repo trade successfully opened!"
echo "   - Active RepoTrade contract: ${REPO_TRADE_CID}"
echo "🏁 Workflow complete."