// Caption chips under the photo/answer, shared by both modes (pure: no DOM, so it is unit-tested). Swanix Labs.

/** The violet "Judge access" chip, shown whenever the Worker says the call ran on a judge code. */
export function judgeChip(result) {
  return result && result.judge === true ? `<span class="chip chip--violet">Judge access</span>` : "";
}

/** Caption chips for an "Ask a doubt" answer. */
export function doubtCaption(result = {}) {
  const ms = result.timing?.total_ms;
  const secs = ms ? `${(ms / 1000).toFixed(1)} s` : "";
  return [
    result.sample ? `<span class="chip chip--violet">Sample · cached answer, no API call</span>` : "",
    `<span class="chip">Muse Spark 1.3</span>`,
    result.input?.image ? `<span class="chip">Photo read</span>` : `<span class="chip">Text only · no SAM call</span>`,
    secs ? `<span class="chip">${secs}</span>` : "",
    judgeChip(result),
  ].join("");
}
