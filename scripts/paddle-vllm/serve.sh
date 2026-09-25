#!/usr/bin/env bash
# Runs the PaddleOCR-VL vLLM server for oh-my-paper inside WSL.
# Usage: serve.sh PORT, with the API key on the first line of stdin.
# The server stops as soon as stdin closes, so it never outlives the app that started it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="$1"
IFS= read -r api_key
export VLLM_API_KEY="$api_key"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_NO_USAGE_STATS=1 DO_NOT_TRACK=1

# vLLM refuses to start unless its whole share of the GPU is free, so request what the
# server needs (weights, activations, CUDA graphs and a KV cache: about 4.7 GiB) rather
# than a fixed fraction. The rest stays free for the layout model and the desktop.
total_mib="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1)"
utilization="$(awk -v total="$total_mib" 'BEGIN { value = 4700 / total; if (value > 0.85) value = 0.85; printf "%.2f", value }')"
config="$(mktemp --suffix=.yaml)"
cat >"$config" <<EOF
trust-remote-code: true
gpu-memory-utilization: $utilization
max-model-len: 16384
max-num-batched-tokens: 16384
max-num-seqs: 32
api-server-count: 1
EOF

"$root/.venv/bin/paddlex_genai_server" \
  --model_name PaddleOCR-VL-1.6-0.9B \
  --model_dir "$root/models/PaddleOCR-VL-1.6" \
  --backend vllm \
  --host 127.0.0.1 \
  --port "$port" \
  --backend_config "$config" </dev/null &
server=$!
# A background job reads /dev/null unless stdin is redirected explicitly.
(
  cat >/dev/null
  kill -TERM "$server" 2>/dev/null
) <&0 &
watcher=$!

cleanup() {
  kill -TERM "$server" "$watcher" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  rm -f "$config"
}
trap cleanup EXIT
wait "$server"
