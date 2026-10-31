# Prompt · Fold subagent → skill+tools checklist
- Date: 2026-10-29
- Theme: single-agent-loop fold migration
- Status: 未实测（对照 Anthropic 文章 + single-agent-loop-kit）
- Sources: https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop · https://github.com/anthropics/single-agent-loop-kit
- Related: Practical AI Lab X archive

## Operator checklist (copy)

1. Score today on one end-to-end eval (every production chain).
2. Subagent prompt → Skill; APIs → tools the main loop calls.
3. Same eval again; keep the fold only if scores hold.
4. Keep a real subagent only for: true parallel throwaway work, hard permission/tool sandbox, or context so big it drowns the main loop.
