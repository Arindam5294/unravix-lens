# Hackathon compliance

- **All code written after the start.** Every file in this repository was created on or after 26 Oct 2026, 21:30 IST. Pre-start work was limited to design notes and API documentation reading; a throwaway API test before the start was deleted and is not in this repo.
- **Meta tooling.** The product runs on Meta's Model API: `sam-3.1` for segmentation and `muse-spark-1.3` (Standard mode) for reasoning and structured output.
- **No Muse Image.** The project does not call any Muse Image model.
- **Secrets.** No API keys in the repo. `MODEL_API_KEY` is a Cloudflare Worker secret; local runs read it from the environment.
- **Credits.** Meta credits are used only for product calls and testing (Phase 1 proof spend about $0.02).
- **Privacy.** Users are told to keep names and personal information off photos. The Worker does not store images; IPs are kept only as hashes for daily caps.
- **Attribution.** Built by Swanix Labs. Third-party assets: Caveat font (SIL OFL) used only to render the synthetic test image.
- **Separate deployment.** Lens deploys as its own Worker and Pages project; the existing unravix.tech site is not modified during the hackathon.
