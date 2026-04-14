"""Generate BPE token-id oracle for JS tokenizer parity tests.

Loads desk-pet/tokenizer.json (the source of truth for all 3 JS clients)
and produces tests/fixtures/bpe_oracle.json with token IDs for canonical
prompts. The JS pre-tokenizer fix is validated by token-for-token equality
against this oracle.

Usage:
    uv run python tests/generate_bpe_oracle.py
"""
from __future__ import annotations

import json
from pathlib import Path

from glublm.tokenizer import GlubTokenizer

REPO_ROOT = Path(__file__).resolve().parent.parent
TOKENIZER_PATH = REPO_ROOT / "desk-pet" / "tokenizer.json"
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "bpe_oracle.json"

PROMPTS: list[str] = [
    "",
    "water",
    " leading space",
    "i love you",
    "hello there",
    "water -> ",
    "why is the water thick",
    "cafe",
    "what's up",
    "can't won't don't",
    "x -> y -> z",
    "a very long prompt with punctuation, numbers 123, and symbols!!",
]


def main() -> None:
    if not TOKENIZER_PATH.exists():
        raise FileNotFoundError(f"Tokenizer not found at {TOKENIZER_PATH}")

    tok = GlubTokenizer.from_file(str(TOKENIZER_PATH))

    entries = []
    for prompt in PROMPTS:
        ids_with_specials = tok.encode(prompt, add_special_tokens=True)
        ids_without_specials = tok.encode(prompt, add_special_tokens=False)
        entries.append(
            {
                "prompt": prompt,
                "ids": ids_with_specials,
                "ids_no_specials": ids_without_specials,
            }
        )

    payload = {
        "tokenizer": str(TOKENIZER_PATH.relative_to(REPO_ROOT).as_posix()),
        "bos_id": tok.bos_id,
        "eos_id": tok.eos_id,
        "pad_id": tok.pad_id,
        "unk_id": tok.unk_id,
        "vocab_size": tok.vocab_size,
        "entries": entries,
    }

    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(entries)} entries to {FIXTURE_PATH.relative_to(REPO_ROOT).as_posix()}")
    for e in entries:
        sample = repr(e["prompt"])
        print(f"  {sample:50s} -> {len(e['ids'])} tokens")


if __name__ == "__main__":
    main()
