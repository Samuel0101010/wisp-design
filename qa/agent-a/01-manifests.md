# Section 1: Plugin Manifest Schema Validity

| File | Check | Result |
|---|---|---|
| plugin.json | repository is string | PASS |
| plugin.json | all required fields | PASS |
| marketplace.json | plugins[0].source is object {source,repo} | PASS |
| hooks/hooks.json | 3-layer shape, 4 events | PASS |
| commands/wisp-design.md | description + allowed-tools in frontmatter | PASS |
