#!/usr/bin/env bash
# A checker that breaks: it reports on stderr and exits non-zero.
echo "checker exploded" >&2
exit 3
