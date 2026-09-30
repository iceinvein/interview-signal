# The machine every agent run happens on. A run sees this image, its own
# work dir at /work and (Codex only) a scratch CODEX_HOME: none of the
# operator's files, keychain, SSH keys or logins. Build with
# ./run.sh --build-image, which pins both CLIs to the host's versions.
FROM node:24-bookworm-slim

ARG CLAUDE_CODE_VERSION
ARG CODEX_VERSION

# --no-install-recommends keeps git from pulling in openssh-client: the image
# has no ssh client at all, so no key could be used even if one appeared.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git procps python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

RUN test -n "$CLAUDE_CODE_VERSION" && test -n "$CODEX_VERSION" \
 && npm install -g "@anthropic-ai/claude-code@$CLAUDE_CODE_VERSION" "@openai/codex@$CODEX_VERSION" \
 && npm cache clean --force

# A CLI that updated itself mid-run would no longer match the recorded version.
ENV DISABLE_AUTOUPDATER=1 LANG=C.UTF-8

RUN useradd --create-home --home-dir /home/candidate --shell /bin/bash candidate
COPY --chown=candidate:candidate gitconfig /home/candidate/.gitconfig

USER candidate
WORKDIR /work
