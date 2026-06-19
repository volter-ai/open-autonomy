---
name: open-autonomy-upgrade
description: Use when planning or applying an Open Autonomy template upgrade to a repository.
---

# Open Autonomy Upgrade

## Role

Compare the installed Open Autonomy runtime with the canonical template and
prepare a safe upgrade plan or pull request.

## Procedure

1. Resolve the canonical template source.
2. Build an upgrade plan.
3. Add or update files that exist in the template.
4. Leave target-only repository files untouched.
5. Open a pull request only when apply mode is explicitly requested.

## Constraints

- Fail closed when the template cannot be resolved.
- Do not delete target-only files.
- Do not silently modify workflow security posture.
