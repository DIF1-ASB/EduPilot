# Generation compatibility corrective pass — 2026-10-26

Production rollout is authorized by the user, with all existing data preserved. The user delegated provider choice to our recommendation after the initial preflight failed. No NVIDIA key or provider is deployed.

## Corrections and evidence

The new article generator initially passed the worker's encoded repair envelope as the assistant reply, instead of separating the original response and validation feedback. Corrected with a failing-then-passing boundary test. A second regression exposed that unsafe math stopped validation before reporting insufficient length/sections; article validation now reports every relevant problem to its sole repair. Acceptance thresholds, retry count and token/time limits are unchanged.

Existing Cloudflare Qwen produced a valid test but short articles and corrupted single-escaped `times` commands. GLM-4.7-Flash was evaluated in an isolated synthetic QA database and rejected: biology article remained694words after repair, and one quiz key incorrectly chose nucleus for a DNA/protein-synthesis question. It is not selected.

GPT-OSS-120B via the same Cloudflare endpoint completed all four synthetic jobs: ten-question math test, math article, ten-question biology test, biology article. Math article needed one bounded repair from630words. All outputs remain private drafts, never assigned to a real class. API reasoning is set to `low`, not claimed disabled; the client returns only answer content. NVIDIA's existing thinking suppression and Qwen/other-provider request behavior remain unchanged. New boundary coverage includes the exact host/model, another model, unrelated host and a lookalike hostname.

Successful format validation does not certify facts or school-level suitability. The biology article included material above sixth-grade level and an overbroad claim about mitochondria in all living cells. The biology quiz's claim about centrioles needs qualification. Teacher review/edit/explicit key confirmation remains required before test issuance, and generated articles remain drafts. These samples are not suitable for automatic publication as verified curriculum. No hazardous laboratory procedure was requested or published.

Primary provider references: [Cloudflare GPT-OSS model](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/), [Cloudflare reasoning controls and REST semantics](https://github.com/cloudflare/ai/blob/main/packages/workers-ai-provider/README.md#reasoning-controls).

## Production configuration

The main app keeps its existing Qwen model and existing Cloudflare credentials. Only the separate generation worker loads a second root-only `/etc/edupilot/generation.env` after `/etc/edupilot/runtime.env`:

```dotenv
AI_MODEL=@cf/openai/gpt-oss-120b
```

Set `GENERATION_JOBS_ENABLED=true` in the shared runtime file after preserving its exact previous bytes in a root-only deployment backup. Do not copy API keys into the model override file, Git, logs or reports. The systemd template uses the same pinned Node22 as the app and separate memory limits. Validate the installed unit on the actual host. Start and enable the worker only after successful application cutover. Do not reuse an unbuilt prototype as a release.

Use the existing [non-destructive rollout procedure](stage1-rollout.md): fresh Linux release/build/tests, final frozen backup, external SHA verification, copy restoration/migration, preservation manifest, proof-gated cutover and external authorization/workflow/export checks. Never restore the local QA database over production. Final deployment results belong in the external handoff report; this document does not claim cutover completed.
