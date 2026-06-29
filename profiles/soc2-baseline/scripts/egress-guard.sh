#!/usr/bin/env bash
# Self-managed, NO-ACCOUNT egress allowlist for GitHub-hosted runners — the free Harden-Runner Action only
# BLOCKS on PUBLIC repos (Community tier), so this is the private-repo fallback that needs zero signup.
# Allows: loopback + established + DNS + GitHub's published /meta IP ranges (so the Actions runner control
# plane keeps working — without these the job hangs) + the resolved IPs of EXTRA_ALLOW_HOSTS (the agent's
# own egress: model proxy, npm, github CDNs). Everything else is default-DENY (REJECT on OUTPUT, v4 + v6).
set -euo pipefail
command -v ipset >/dev/null || { sudo apt-get update -qq || true; sudo apt-get install -y ipset >/dev/null; }
# Hosts the agent legitimately reaches beyond the /meta ranges (npm, github content CDNs) + the model proxy,
# auto-derived from MODEL_PROXY_URL so wiring can never miss it (a missed proxy host would break every run).
EXTRA="${EXTRA_ALLOW_HOSTS:-registry.npmjs.org objects.githubusercontent.com codeload.github.com release-assets.githubusercontent.com}"
proxy_host="$(printf %s "${MODEL_PROXY_URL:-}" | sed -E 's#^https?://([^/]+).*#\1#')"
[ -n "$proxy_host" ] && EXTRA="$EXTRA $proxy_host"
sudo ipset create oa_allow4 hash:net -exist
sudo ipset create oa_allow6 hash:net family inet6 -exist
meta="$(curl -s --max-time 20 https://api.github.com/meta)"
echo "$meta" | jq -r '((.actions//[])+(.api//[])+(.web//[])+(.git//[])+(.packages//[])+(.hooks//[])+(.dependabot//[]))[]' \
  | while read -r c; do case "$c" in *:*) sudo ipset add oa_allow6 "$c" -exist 2>/dev/null;; *) sudo ipset add oa_allow4 "$c" -exist 2>/dev/null;; esac; done
for h in $EXTRA; do getent ahosts "$h" | awk '{print $1}' | sort -u | while read -r ip; do
  case "$ip" in *:*) sudo ipset add oa_allow6 "$ip" -exist 2>/dev/null;; *) sudo ipset add oa_allow4 "$ip" -exist 2>/dev/null;; esac; done; done
for ipt in iptables ip6tables; do
  sudo $ipt -A OUTPUT -o lo -j ACCEPT
  sudo $ipt -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  sudo $ipt -A OUTPUT -p udp --dport 53 -j ACCEPT
  sudo $ipt -A OUTPUT -p tcp --dport 53 -j ACCEPT
done
sudo iptables  -A OUTPUT -m set --match-set oa_allow4 dst -j ACCEPT
sudo ip6tables -A OUTPUT -m set --match-set oa_allow6 dst -j ACCEPT
sudo iptables  -A OUTPUT -j REJECT --reject-with icmp-port-unreachable
sudo ip6tables -A OUTPUT -j REJECT --reject-with icmp6-port-unreachable
echo "egress-guard installed: $(sudo ipset list oa_allow4 | grep -cE '^[0-9]') v4 nets + EXTRA($EXTRA), default-deny"
