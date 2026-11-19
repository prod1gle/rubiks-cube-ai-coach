"""Opt-in, fixed-loopback Ollama adapter. Model prose never reaches the UI."""

import http.client
import json
import os
import re
import threading
import time

BUDGET_SECONDS = 8.0
MAX_RESPONSE_BYTES = 32768
_GATE = threading.BoundedSemaphore(2)


class ProviderError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def configured_model():
    model = os.environ.get("CUBECUE_OLLAMA_MODEL", "").strip()
    # Deliberately no client URL, proxy settings, redirect support, or credentials.
    return model if re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}", model) else None


def select(model, goal, facts, candidates):
    if not _GATE.acquire(blocking=False):
        raise ProviderError("busy")
    connection = http.client.HTTPConnection("127.0.0.1", 11434, timeout=BUDGET_SECONDS)
    deadline = time.monotonic() + BUDGET_SECONDS
    try:
        schema = {
            "type": "object",
            "properties": {
                "selections": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 3,
                    "items": {"enum": candidates},
                }
            },
            "required": ["selections"],
            "additionalProperties": False,
        }
        body = {
            "model": model,
            "stream": False,
            "format": schema,
            "options": {"temperature": 0, "num_predict": 256, "num_ctx": 4096},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a cube practice coach. Rank up to three supplied eligible "
                        "template/fact pairs for the selected goal. Select only exact supplied "
                        "pairs, without duplicates. Return only the JSON schema. "
                        "Never add prose, numbers, algorithms, or new facts."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "goal": goal,
                            "facts": facts,
                            "eligible_selections": candidates,
                        },
                        separators=(",", ":"),
                    ),
                },
            ],
        }
        connection.request(
            "POST", "/api/chat", json.dumps(body), {"Content-Type": "application/json"}
        )
        transport = connection.sock
        if transport:
            transport.settimeout(max(0.001, deadline - time.monotonic()))
        response = connection.getresponse()
        if response.status != 200:
            raise ProviderError("unavailable")
        chunks, size = [], 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProviderError("timeout")
            if transport:
                transport.settimeout(remaining)
            chunk = response.read1(min(4096, MAX_RESPONSE_BYTES + 1 - size))
            size += len(chunk)
            if size > MAX_RESPONSE_BYTES:
                raise ProviderError("rejected")
            if not chunk:
                break
            chunks.append(chunk)
        if time.monotonic() > deadline:
            raise ProviderError("timeout")
        envelope = json.loads(b"".join(chunks))
        if not isinstance(envelope, dict) or envelope.get("done") is not True:
            raise ProviderError("rejected")
        return json.loads(envelope["message"]["content"])
    except TimeoutError as error:
        raise ProviderError("timeout") from error
    except (OSError, http.client.HTTPException) as error:
        raise ProviderError("unavailable") from error
    except (ValueError, KeyError, TypeError) as error:
        raise ProviderError("rejected") from error
    finally:
        connection.close()
        _GATE.release()
