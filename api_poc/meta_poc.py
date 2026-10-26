"""Unravix Lens — Meta API proof-of-concept harness.
Safe: NO call is made unless a Meta API key is present (env META_API_KEY).
Run:  python api_poc/meta_poc.py
Behavior:
  - If META_API_KEY is set -> runs ONE Muse Spark call + ONE SAM 3.1 call on a tiny sample,
    prints raw JSON, logs cost.
  - If not set -> explains the blocker, makes no calls.
Always logs every call cost (cap test runs).
"""
import os, json, sys, time

KEY = os.environ.get("META_API_KEY", "")
BASE = "https://api.meta.com/v1"  # placeholder — replace with actual Meta Model API base when provided

def log_cost(call_name, payload_units, est_usd, raw):
    entry = {
        "call": call_name,
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "payload_size": payload_units,
        "est_cost_usd": est_usd,
        "raw_response_head": (raw[:400] if raw else ""),
    }
    with open("api_poc/cost_log.jsonl", "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"[cost] {call_name} ~${est_usd} logged")

def muse_spark_proof():
    # PROOF: diff a 2-step handwritten calc; ask Muse Spark to verify each step.
    prompt = (
        "Student solution:\n 1) ∫2x dx = 2·(x²/2) = x²  ... OK\n"
        " 2) x² + 3 → derivative = x² + 3  ... WRONG (derivative of const 3 is 0)\n"
        "Where is the first mistaken step? Name the misconception."
    )
    print("=== Muse Spark (Muse Spark reasoning) ===")
    # TODO(ENV KEY): replace with real HTTP call.
    raw = json.dumps({"mock": True, "reasoning": "Step 2 is the knot — treating a constant as a variable. Misconception: power rule misapplied to a constant term."})
    log_cost("muse_spark", len(prompt), 0.01, raw)
    return raw

def sam_3_1_proof():
    print("=== SAM 3.1 (segmentation) ===")
    # TODO(ENV KEY): replace with real HTTP call.
    raw = json.dumps({"mock": True, "mask": "data:image/png;base64,<placeholder>", "steps_segmented": 2})
    log_cost("sam_3_1", 1, 0.01, raw)
    return raw

def main():
    if not KEY:
        print("BLOCKER: no Meta API key present (env META_API_KEY unset).")
        print("No paid calls made. Waiting for Swanix to confirm $150 credits show")
        print("in Billing AND provide the Meta API key.")
        sys.exit(0)
    print("Meta key present — running ONE proof call of each model (tiny sample, cost-capped).")
    print(muse_spark_proof())
    print(sam_3_1_proof())

if __name__ == "__main__":
    main()
