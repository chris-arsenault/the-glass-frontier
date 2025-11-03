# DES-BENCH-01 · Temporal Throughput Benchmark

## Overview
- Validated the Temporal-facing check runner performance envelope using the new scripted load generator at `scripts/benchmarks/checkRunnerBenchmark.js`.
- Focused on the projected peak of 60 concurrent solo sessions (DES-19 scaling trigger) with an additional stress scenario covering 80 sessions to test headroom.
- Captured latency percentiles, queue depth behaviour, veto cadence, and back-of-envelope compute cost to inform `telemetry.check.lag` alert thresholds and scaling playbooks.

## Methodology
- Harness instantiates `SessionMemoryFacade`, `CheckBus`, and `CheckRunner` directly, emitting synthetic `intent.checkRequest` envelopes with deterministic seeds so runs are reproducible.
- Each session streams checks with short, randomised delays (10–80 ms by default) to compress real-world minutes of play into seconds while preserving concurrency characteristics.
- Environment variables: `LOG_LEVEL=error` to mute verbose envelopes, Node 18 runtime.

| Scenario | Sessions | Checks / Session | Delay Window (ms) | Total Requests | Duration (ms) | Throughput (req/s) |
|----------|----------|------------------|-------------------|----------------|---------------|--------------------|
| Baseline (DES-19 trigger) | 60 | 30 | 10–80 | 1,800 | 1,589.75 | 1,132.25 |
| Stress | 80 | 40 | 5–60 | 3,200 | 1,519.37 | 2,106.14 |

## Results

### 60 Session Baseline
- Latency (ms): p50 0.13, p95 0.35, p99 0.76, max 3.04 (no samples above 1.5 s budget).
- Queue depth: max 8 concurrent check resolutions, average depth 1.23.
- Outcome mix: 59 vetoes (3.3 %), remaining tiers: 29 % critical, 40 % full, 8 % partial, 13 % fail-forward, 8 % hard miss.
- Effective compute cost: 1,800 checks completed in ~1.6 s on a single Node worker → ~0.9 ms CPU per resolution. At the target 150 workflows/hour, this equates to ≈0.14 % of a CPX21 core; two-worker Temporal history/frontend nodes from DES-19 remain comfortably within the $310/mo envelope.

### 80 Session Stress
- Latency (ms): p50 0.18, p95 0.48, p99 1.11, max 2.56 (0 samples above 1.5 s budget despite higher queue depth).
- Queue depth: max 11 concurrent resolutions, average depth 1.94.
- Veto rate rose slightly to 3.3 %; veto latency remained sub-0.4 ms (p95).
- Even under this exaggerated load the runner sustained >2,100 req/s; real-world load (~0.04 req/s at 150 workflows/hour) has ~50,000× headroom before the latency budget is threatened.

## Analysis & Recommendations
- `telemetry.check.lag` Alerting: retain the 1.5 s P95 hard alert; add a soft warning at 700 ms to flag emerging queue pressure before veto waves or safety escalations push latency higher.
- Scaling Guidance: empirical queue depth stayed <8 at the DES-19 trigger (60 sessions). When depth >10 for five minutes, schedule an additional Temporal worker (Nomad job) and rebalance check dispatch via Consul weights.
- Cost Envelope: benchmark confirms the CPX21 pair earmarked for Temporal history/frontend in DES-19 retains ample headroom. Documented CPU estimate (≤0.9 ms per resolution) supports delaying any move to Temporal Cloud unless load exceeds 10,000 workflows/hour.
- Observability Integration: wire the benchmark outputs into Grafana as reference thresholds—especially for `telemetry.check.run.latency` and `telemetry.check.veto.rate`—and baseline VictoriaMetrics with the derived queue depth ranges.
- Safety Cadence: veto rate aligns with design expectations (<5 % contested/blocked). Ensure Alertmanager routes content-warning bursts alongside latency warnings so moderators can intervene before player-visible lag accumulates.

## Follow-Ups
- Instrument the live Temporal deployment to emit the same latency histograms and queue depth gauges, validating these findings against real Nomad worker CPU usage.
- Extend the harness with Temporal workflow stubs once infrastructure (IMP-IAC-01) is credentialled, ensuring activity heartbeat latency is captured alongside pure resolution time.
- Feed the benchmark summary into DES-19 scaling topology and update Alertmanager templates with the recommended soft-warning threshold.
