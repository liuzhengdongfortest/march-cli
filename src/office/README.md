# Deprecated Office Integration

This directory is retained only as deprecated implementation archive.

The Office / PowerPoint integration is intentionally isolated from March runtime:

- Office tools are not registered in the tool capability registry.
- `march office ...` is disabled at the CLI command boundary.
- The Office daemon must not be started by normal March flows.

Do not add new runtime dependencies on this directory. If Office support is revisited, design a new capability boundary first instead of re-enabling this code in place.
