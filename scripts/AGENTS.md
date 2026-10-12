# Runtime scripts

Start/stop scripts consistently manage Docker Compose project `pm-mvp` from the project root. Startup creates `.env` from the example only when absent and waits for health. Stop targets that Compose project and preserves data; never kill processes based on their port. Windows scripts check native exit codes and restore the caller's directory. Unix scripts use portable Bash/Docker commands with strict error handling.
