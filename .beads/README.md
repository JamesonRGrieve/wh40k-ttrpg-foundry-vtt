# Beads - AI-Native Issue Tracking

Welcome to Beads! This repository uses **Beads** for issue tracking - a modern, AI-native tool designed to live directly in your codebase alongside your code.

## What is Beads?

Beads is issue tracking that lives in your repo, making it perfect for AI coding agents and developers who want their issues close to their code. No web UI required - everything works through the CLI and integrates seamlessly with git.

**Learn more:** [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## Quick Start

### Essential Commands

```bash
# Create new issues
bd create "Add user authentication"

# View all issues
bd list

# View issue details
bd show <issue-id>

# Update issue status
bd update <issue-id> --status in_progress
bd update <issue-id> --status done

# Sync with git remote
bd sync
```

### Additional Flags for `bd create`

```
Create a new issue (or multiple issues from markdown file)

Usage:
  bd create [title] [flags]

Aliases:
  create, new

Flags:
      --acceptance string       Acceptance criteria
      --agent-rig string        Agent's rig name (requires --type=agent)
  -a, --assignee string         Assignee
      --body-file string        Read description from file (use - for stdin)
      --defer string            Defer until date (issue hidden from bd ready until then). Same formats as --due
      --deps strings            Dependencies in format 'type:id' or 'id' (e.g., 'discovered-from:bd-20,blocks:bd-15' or 'bd-20')
  -d, --description string      Issue description
      --design string           Design notes
      --dry-run                 Preview what would be created without actually creating
      --due string              Due date/time. Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
      --ephemeral               Create as ephemeral (ephemeral, not exported to JSONL)
  -e, --estimate int            Time estimate in minutes (e.g., 60 for 1 hour)
      --event-actor string      Entity URI who caused this event (requires --type=event)
      --event-category string   Event category (e.g., patrol.muted, agent.started) (requires --type=event)
      --event-payload string    Event-specific JSON data (requires --type=event)
      --event-target string     Entity URI or bead ID affected (requires --type=event)
      --external-ref string     External reference (e.g., 'gh-9', 'jira-ABC')
  -f, --file string             Create multiple issues from markdown file
      --force                   Force creation even if prefix doesn't match database prefix
  -h, --help                    help for create
      --id string               Explicit issue ID (e.g., 'bd-42' for partitioning)
  -l, --labels strings          Labels (comma-separated)
      --mol-type string         Molecule type: swarm (multi-polecat), patrol (recurring ops), work (default)
      --notes string            Additional notes
      --parent string           Parent issue ID for hierarchical child (e.g., 'bd-a3f8e9')
      --prefix string           Create issue in rig by prefix (e.g., --prefix bd- or --prefix bd or --prefix beads)
  -p, --priority string         Priority (0-4 or P0-P4, 0=highest) (default "2")
      --repo string             Target repository for issue (overrides auto-routing)
      --rig string              Create issue in a different rig (e.g., --rig beads)
      --role-type string        Agent role type: polecat|crew|witness|refinery|mayor|deacon (requires --type=agent)
      --silent                  Output only the issue ID (for scripting)
      --title string            Issue title (alternative to positional argument)
  -t, --type string             Issue type (bug|feature|task|epic|chore|merge-request|molecule|gate|agent|role|rig|convoy|event); enhancement is alias for feature (default "task")
      --validate                Validate description contains required sections for issue type
      --waits-for string        Spawner issue ID to wait for (creates waits-for dependency for fanout gate)
      --waits-for-gate string   Gate type: all-children (wait for all) or any-children (wait for first) (default "all-children")
```

### additional flags for 'bd update'

```
If no issue ID is provided, updates the last touched issue (from most recent
create, update, show, or close operation).

Usage:
  bd update [id...] [flags]

Flags:
      --acceptance string      Acceptance criteria
      --add-label strings      Add labels (repeatable)
  -a, --assignee string        Assignee
      --await-id string        Set gate await_id (e.g., GitHub run ID for gh:run gates)
      --body-file string       Read description from file (use - for stdin)
      --claim                  Atomically claim the issue (sets assignee to you, status to in_progress; fails if already claimed)
      --defer string           Defer until date (empty to clear). Issue hidden from bd ready until then
  -d, --description string     Issue description
      --design string          Design notes
      --due string             Due date/time (empty to clear). Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
  -e, --estimate int           Time estimate in minutes (e.g., 60 for 1 hour)
      --external-ref string    External reference (e.g., 'gh-9', 'jira-ABC')
  -h, --help                   help for update
      --notes string           Additional notes
      --parent string          New parent issue ID (reparents the issue, use empty string to remove parent)
  -p, --priority string        Priority (0-4 or P0-P4, 0=highest)
      --remove-label strings   Remove labels (repeatable)
      --session string         Claude Code session ID for status=closed (or set CLAUDE_SESSION_ID env var)
      --set-labels strings     Set labels, replacing all existing (repeatable)
  -s, --status string          New status
      --title string           New title
  -t, --type string            New type (bug|feature|task|epic|chore|merge-request|molecule|gate|agent|role|rig|convoy|event|slot)
```

### Working with Issues

Issues in Beads are:
- **Git-native**: Stored in `.beads/issues.jsonl` and synced like code
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow
- **Always in sync**: Auto-syncs with your commits

*Beads: Issue tracking that moves at the speed of thought* ⚡

## Your First Issues

```bash
# Create a few issues
./bd create "Set up database" -p 1 -t task
./bd create "Create API" -p 2 -t feature
./bd create "Add authentication" -p 2 -t feature

# List them
./bd list
```

**Note:** Issue IDs are hash-based (e.g., `bd-a1b2`, `bd-f14c`) to prevent collisions when multiple agents/branches work concurrently.

## Hierarchical Issues (Epics)

For large features, use hierarchical IDs to organize work:

```bash
# Create epic (generates parent hash ID)
./bd create "Auth System" -t epic -p 1
# Returns: bd-a3f8e9

# Create child tasks (automatically get .1, .2, .3 suffixes)
./bd create "Design login UI" -p 1       # bd-a3f8e9.1
./bd create "Backend validation" -p 1    # bd-a3f8e9.2
./bd create "Integration tests" -p 1     # bd-a3f8e9.3

# View hierarchy
./bd dep tree bd-a3f8e9
```

Output:
```
🌲 Dependency tree for bd-a3f8e9:

→ bd-a3f8e9: Auth System [epic] [P1] (open)
  → bd-a3f8e9.1: Design login UI [P1] (open)
  → bd-a3f8e9.2: Backend validation [P1] (open)
  → bd-a3f8e9.3: Integration tests [P1] (open)
```

## Add Dependencies

```bash
# API depends on database
./bd dep add bd-2 bd-1

# Auth depends on API
./bd dep add bd-3 bd-2

# View the tree
./bd dep tree bd-3
```

Output:
```
🌲 Dependency tree for bd-3:

→ bd-3: Add authentication [P2] (open)
  → bd-2: Create API [P2] (open)
    → bd-1: Set up database [P1] (open)
```

## Find Ready Work

```bash
./bd ready
```

Output:
```
📋 Ready work (1 issues with no blockers):

1. [P1] bd-1: Set up database
```

Only bd-1 is ready because bd-2 and bd-3 are blocked!

## Work the Queue

```bash
# Start working on bd-1
./bd update bd-1 --status in_progress

# Complete it
./bd close bd-1 --reason "Database setup complete"

# Check ready work again
./bd ready
```

Now bd-2 is ready! 🎉

## Track Progress

```bash
# See blocked issues
./bd blocked

# View statistics
./bd stats
```
