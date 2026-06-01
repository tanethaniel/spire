# CLAUDE.md

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

### Available skills

- `/office-hours` — Office hours
- `/plan-ceo-review` — CEO review planning
- `/plan-eng-review` — Engineering review planning
- `/plan-design-review` — Design review planning
- `/plan-devex-review` — DevEx review planning
- `/design-consultation` — Design consultation
- `/design-shotgun` — Design shotgun
- `/design-html` — Design to HTML
- `/design-review` — Design review
- `/review` — Code review
- `/ship` — Ship changes
- `/land-and-deploy` — Land and deploy
- `/canary` — Canary deployment
- `/benchmark` — Benchmarking
- `/browse` — Web browsing (use this for all browsing)
- `/connect-chrome` — Connect to Chrome
- `/qa` — QA testing
- `/qa-only` — QA only
- `/setup-browser-cookies` — Set up browser cookies
- `/setup-deploy` — Set up deployment
- `/setup-gbrain` — Set up GBrain
- `/retro` — Retrospective
- `/investigate` — Investigate issues
- `/document-release` — Document a release
- `/document-generate` — Generate documentation
- `/codex` — Codex integration
- `/cso` — CSO
- `/autoplan` — Auto-planning
- `/devex-review` — DevEx review
- `/careful` — Careful mode
- `/freeze` — Freeze
- `/guard` — Guard
- `/unfreeze` — Unfreeze
- `/gstack-upgrade` — Upgrade gstack
- `/learn` — Learn from context

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
