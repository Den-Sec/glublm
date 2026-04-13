"""GlubLM HuggingFace Space - Gradio chat interface."""
from __future__ import annotations

import gradio as gr
import torch
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file

from glublm.config import ModelConfig
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer

REPO_ID = "DenSec02/glublm-18m"

# Download weights and tokenizer from HF Hub
weights_path = hf_hub_download(REPO_ID, "model.safetensors")
tok_path = hf_hub_download(REPO_ID, "tokenizer.json")

tok = GlubTokenizer.from_file(tok_path)
# HF model repo has 18M weights - override defaults to match
cfg = ModelConfig(
    vocab_size=tok.vocab_size,
    d_model=448,
    n_layers=8,
    n_heads=7,
    ffn_hidden=896,
    max_seq_len=48,
)
model = GlubLM(cfg)

state = load_file(weights_path)
model.load_state_dict(state, strict=False)
model.eval()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)


def chat(prompt: str, temperature: float, top_k: int, top_p: float, max_new_tokens: int) -> str:
    return generate(
        model=model,
        tokenizer=tok,
        prompt=prompt,
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        device=device,
    )


TAGLINE = "the language model that already forgot this sentence"

with gr.Blocks(title="GlubLM") as demo:
    gr.Markdown(f"# GlubLM\n> *{TAGLINE}*\n\nAn 18M-parameter goldfish with a 10-second memory. [Try the 35M Desk Pet](https://den-sec.github.io/glublm/desk-pet/).")
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="say something to the goldfish", value="hello")
            temperature = gr.Slider(0.1, 1.5, value=0.8, step=0.05, label="temperature")
            top_k = gr.Slider(1, 100, value=40, step=1, label="top-k")
            top_p = gr.Slider(0.1, 1.0, value=0.9, step=0.05, label="top-p")
            max_new = gr.Slider(8, 64, value=32, step=1, label="max new tokens")
            btn = gr.Button("generate", variant="primary")
        with gr.Column():
            out = gr.Textbox(label="glub says", lines=6)
    btn.click(fn=chat, inputs=[prompt, temperature, top_k, top_p, max_new], outputs=out)

    gr.Markdown(
        "Learn more: [GitHub](https://github.com/Den-Sec/glublm) - "
        "[Model card](https://huggingface.co/DenSec02/glublm-18m) - "
        "[Dataset](https://huggingface.co/datasets/DenSec02/glublm-60k-ted)"
    )

if __name__ == "__main__":
    demo.launch()
