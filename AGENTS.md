# AGENTS.md

Every assistant working in this repository (Claude, Cursor, Codex or another) follows, in this order:

1. [CLAUDE.md](CLAUDE.md): this repository's responsibility and local rules.
2. The organisation's [rules](https://github.com/unset-sh/agent-kit/blob/ca8a1f6d28e13e258e043f0fb1a7ce52b42982c1/rules/org.md),
   [working rules](https://github.com/unset-sh/agent-kit/blob/ca8a1f6d28e13e258e043f0fb1a7ce52b42982c1/rules/working.md) and
   [engineering principles](https://github.com/unset-sh/agent-kit/blob/ca8a1f6d28e13e258e043f0fb1a7ce52b42982c1/rules/principles.md).

This foundation has no installed `.claude/` copy or CI check yet. The links above pin the instructions read
for the bootstrap; they are not an agent-kit release installation and are not claimed to update automatically.
Read all three files before starting work. Before designing boundaries or contracts, read the full
[org-principles skill](https://github.com/unset-sh/agent-kit/blob/ca8a1f6d28e13e258e043f0fb1a7ce52b42982c1/skills/org-principles/SKILL.md).
Before changing an organisation-wide decision, read
[org-decisions](https://github.com/unset-sh/agent-kit/blob/ca8a1f6d28e13e258e043f0fb1a7ce52b42982c1/skills/org-decisions/SKILL.md).
Use the applicable shared procedure when performing a recurring job.

When an approved agent-kit release is installed, adopt its normal local rule/skill paths and lock-file checks
in the same reviewed change. Do not hand-maintain copies of its rules or claim CI verification before it exists.
