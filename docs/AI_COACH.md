# Grounded AI Coach

The `/coach` workspace builds a practice brief from real saved manual virtual solves and practice attempts. It never seeds performance records. Select a goal and one of your most recent 20 saved virtual records, then press **Build my practice plan**. The backend independently replays raw moves and checks every hash with the current canonical engine. It does not use a stale cached analysis to establish coaching facts.

Without a model, the page explicitly says **Verified engine coaching**. This deterministic mode recommends useful exercises from executed HTM versus exact-endpoint simplification, grip rotations, input gaps, inferred checkpoints, timing integrity and engine-checked case attempts. Practice history uses the most recent 20 attempts; its bounded sample is disclosed. Physical timer/video results have no verified move history and are outside this feature’s scope. Uncertain timing withholds gap, duration and checkpoint-time advice.

Advice links to the original saved solve in Solve Analysis or the exact case in Algorithm Trainer. Capture actions open `/live-solve?mode=virtual` so the new recording can supply verified move history. `?case=<catalog-id>` is validated against the bundled training catalog before selection. No generated algorithm is accepted or executed. Engine simplification is not a proof of global optimality; input gaps are not measured thinking time or physical turning pauses.

## Enable real model inference with Ollama

1. Install Ollama using its [official quickstart](https://docs.ollama.com/quickstart). Start its application or run `ollama serve` in a terminal. The API must listen on `127.0.0.1:11434`.
2. Download a local model, for example:

   ```sh
   ollama pull llama3.2:3b
   ```

3. Start the CubeCue backend with the model configured on the server:

   ```sh
   cd cubecue/backend
   CUBECUE_OLLAMA_MODEL=llama3.2:3b uv run uvicorn coach.main:app --host 127.0.0.1 --port 8000
   ```

4. Open `/coach`, check **Use llama3.2:3b via Ollama for this request**, then press **Build plan with AI**. Configuration alone never calls the model. Uncheck it to return to deterministic coaching. The page does not store opt-in in browser storage.

A configured model is not a claim that the service is running or that a model is installed. A successful, validated model selection is labeled **AI selected · engine grounded**. Unavailable models, timeouts, rejected responses and admission limits explicitly fall back to engine coaching with the reason shown. Initial model loading can exceed the intentionally short request budget; warm the model with `ollama run llama3.2:3b` and retry.

Choose a downloaded local model for local inference. An Ollama administrator can configure a cloud model; the page discloses this before opt-in. CubeCue never initiates a cloud request directly and has no cloud API keys. Check your Ollama configuration and chosen model if strict local inference is required.

## Exactly what the model sees

The request contains only the selected goal, verified fact IDs and their displayed text, approved template/fact pairs, a fixed instruction and a JSON schema. Facts can include total saved-record/practice counts, selected-record status/source, move counts, engine analytics version, eligible time/gap/checkpoint metrics, a catalog case ID and its bounded objective-success counts. Source links, solve UUIDs, dates, raw move events, notation, cube states, video, camera frames and the full history are not transmitted. The same disclosure appears next to the opt-in control. The browser never contacts Ollama and cannot choose a provider URL or model.

The adapter follows the official [Ollama chat API](https://docs.ollama.com/api/chat), using `POST /api/chat`, a JSON-schema `format`, and `stream: false`. A model can only select and order up to three approved `(template_id, fact_id)` pairs. The application validates strict schemas, eligible pair membership and uniqueness, then supplies all displayed wording and factual slots itself. Extra narrative, invented values, algorithms, unknown IDs and mismatched facts are rejected. The model cannot mutate solves, run tools or alter cube truth. Unrestricted model prose and open-ended chat are intentionally absent.

## Operational boundaries and checks

- Fixed HTTP loopback destination `127.0.0.1:11434`; no client/provider URL, proxy forwarding, redirects, authorization headers or client secrets.
- Eight-second provider deadline with remaining socket budgets, 32 KiB response cap, 256 generated-token budget and two concurrent provider calls with no waiting queue. The browser aborts after 15 seconds. Disconnecting the browser does not pretend to cancel Ollama’s own inference; server I/O is bounded independently.
- Read-only `GET /api/ai/context` and `POST /api/ai/coach`; unknown request properties are rejected and model opt-in requires a JSON boolean. Solve UUIDs resolve only through the local database. No new storage schema or model-generated persistence.
- Model tests mock the provider, so passing tests prove guardrails and rendering contracts, not real-model quality or installed-model availability. No successful live inference is claimed without executing a configured model.

Targeted verification:

```sh
cd cubecue/backend
uv run pytest tests/test_ai.py
uv run ruff check src/coach/ai src/coach/api/ai.py tests/test_ai.py
cd ..
npm test -- src/features/ai/CoachPage.test.tsx src/api/ai.test.ts src/features/library/AlgorithmTrainer.test.tsx
npm run build
```
