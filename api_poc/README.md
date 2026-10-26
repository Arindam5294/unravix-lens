# api_poc — Meta API proof
Phase 1, step 3. No paid call is made until a real Meta API key is present.

Status: **BLOCKED** — env `META_API_KEY` not set on the build machine.
Awaiting Swanix confirmation that the $150 Meta credits show in Billing + the key.

To run once the key is available:
```bash
export META_API_KEY=...
python api_poc/meta_poc.py
```
Every call logs its cost to `api_poc/cost_log.jsonl`.
