# WSL2 Memory Limits for Local Test Runs

Audience: anyone running this repo's test suites on a WSL2 dev host.

## Why this file exists

On 2026-10-07 a full backend suite run killed the WSL2 distribution mid-session. The failure was
not in the code: the Linux global OOM killer fired and reaped the user-session services the agent
harness depends on. Evidence from `/var/log/kern.log`:

```
oom-kill:constraint=CONSTRAINT_NONE,...,global_oom,task=moshi-hook
Out of memory: Killed process 21295 (engram)
```

`CONSTRAINT_NONE` + `global_oom` means the whole VM ran out, not one cgroup. `engram` runs as a
systemd **user** service, so when it is killed the tool plumbing of the running session breaks too —
that is the mechanism behind "the agent stopped responding", and it makes the OOM look like a
software bug when it is a memory ceiling.

## The math on the current host

| Quantity | Value |
|---|---|
| Host RAM | 24 GiB |
| `.wslconfig` at the time | `memory=12884901888` (12 GiB), `swap=4294967296` (4 GiB) |
| `nproc` inside WSL | 12 |
| jest default workers | one per core → **11** |
| Cost per jest worker | a Node process running ts-jest, which compiles TypeScript **in memory**, per worker |
| Flutter test | spawns one `flutter_tester` per concurrency slot, each a full Dart isolate group |

11 jest workers × several hundred MB each blows past 12 GiB + 4 GiB of swap. Subagents multiply the
same pressure, because each one is its own Node process.

## Guardrail 1 — repo-side (already enforced, no action needed)

`apps/admin_backend/package.json` pins the jest cap:

```json
"jest": {
  "maxWorkers": 2,
  ...
}
```

Measured on this host after the cap: **3700/3700 passing**, peak ~1.5 GiB used with ~10 GiB free.

Why it lives in config instead of in a habit of passing flags: a guideline that the next session
forgets is not a guardrail. The failure mode (killed harness services) is severe enough to be
encoded.

CI is unaffected: `admin-backend-ci.yml` runs `npm test` on `ubuntu-latest` (2–4 cores, so the cap
is not a reduction), and `test:db` / `test:e2e` already run `--runInBand`.

Flutter has no equivalent config file, so the Flutter cap stays a documented flag:
`flutter test --concurrency=2`. See `AGENTS.md` → "Test Execution Limits".

## Guardrail 2 — host-side (optional, requires a restart)

The repo cap makes full runs survivable. Raising the VM ceiling adds headroom for running a suite
*and* subagents at once.

The recommended file is `docs/devex/wsl2/.wslconfig` (16 GiB RAM / 8 GiB swap, leaving 8 GiB to
Windows on a 24 GiB host).

To apply it:

```powershell
# 1. Back up the current file first
Copy-Item "$env:USERPROFILE\.wslconfig" "$env:USERPROFILE\.wslconfig.bak" -Force

# 2. Copy the recommended file over it
Copy-Item "<repo>\docs\devex\wsl2\.wslconfig" "$env:USERPROFILE\.wslconfig" -Force

# 3. Restart the VM. WARNING: this terminates every running WSL session, editors,
#    and any agent session in flight.
wsl --shutdown
```

It takes effect only on the next WSL start, which is why this file is versioned instead of written
straight onto the Windows drive: applying it mid-session would kill the work in progress.

### Verify the new ceiling

```bash
free -g                                  # total should now read 16, not 11
cat /proc/meminfo | head -1              # MemTotal
nproc                                    # unchanged: 12
```

### Rollback

```powershell
Copy-Item "$env:USERPROFILE\.wslconfig.bak" "$env:USERPROFILE\.wslconfig" -Force
wsl --shutdown
```

## If a run still dies

```bash
sudo dmesg -T | grep -iE "oom|killed process" | tail -20
tail -50 /var/log/kern.log | grep -iE "oom-kill|Out of memory"
systemctl --user status engram moshi-hook     # are the harness services alive?
```

If `engram` was reaped, restart it (`systemctl --user restart engram`) — but treat the run's output
as untrustworthy from the point of the kill, and re-run it.

## Known secondary symptom

Under memory pressure, `flutter test` intermittently fails to attach with
`WebSocketException: Invalid WebSocket upgrade request`, and **which files fail moves between
runs**. A file that fails inside a batch usually passes when run alone. This is toolchain noise, not
a regression: re-run the specific file with `--concurrency=1` and confirm the path is correct
before investigating the test itself.
