# Unravix Lens 0.4.0 patch: all subjects (Class 1 to PhD) + "Ask a doubt" mode

Unzip at the repo root (in Codespaces), overwriting files, then run:

    npm test && npm run typecheck        # 90 tests, all green
    git checkout -b lens-0.4.0-doubt
    git add README.md docs/eval-set1.md docs/eval-doubts.md public/index.html public/js/app.js \
      public/samples/sample-doubt.json public/styles.css scripts/screens.py \
      worker/src/index.ts worker/src/meta.ts worker/src/prompt.ts worker/src/schema.ts \
      worker/test/schema.test.ts worker/test/worker.test.ts
    git commit -m "Lens 0.4.0: any subject Class 1 to PhD, Ask a doubt mode, not-step-checkable essays, eval set1 23/23"
    git checkout main && git merge --ff-only lens-0.4.0-doubt && git push origin main

(Or skip the branch and commit straight to main.) Worker 0.4.0-doubt and the Pages site are already deployed live,
so the push only syncs GitHub with what is live. wrangler.toml is unchanged (DAILY_CAP stays "15").
