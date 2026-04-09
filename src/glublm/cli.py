"""GlubLM command-line interface."""
from __future__ import annotations

from pathlib import Path

import click
import torch

from glublm import __version__
from glublm.config import ModelConfig, TrainConfig
from glublm.dataset import GlubDataset, load_samples
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


@click.group(help="GlubLM - the language model that already forgot this sentence.")
@click.version_option(__version__, prog_name="glublm")
def main() -> None:
    pass


@main.command(help="Chat with a trained GlubLM checkpoint.")
@click.option("--ckpt", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--tokenizer", "tok_path", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--prompt", type=str, default=None, help="Single-shot prompt (no interactive loop)")
@click.option("--max-new-tokens", type=int, default=32)
@click.option("--temperature", type=float, default=0.8)
@click.option("--top-k", type=int, default=40)
@click.option("--top-p", type=float, default=0.9)
def chat(
    ckpt: str,
    tok_path: str,
    prompt: str | None,
    max_new_tokens: int,
    temperature: float,
    top_k: int,
    top_p: float,
) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok = GlubTokenizer.from_file(tok_path)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg).to(device)
    state = torch.load(ckpt, map_location=device, weights_only=True)
    model.load_state_dict(state.get("model", state))
    model.eval()

    def _reply(text: str) -> str:
        return generate(
            model=model,
            tokenizer=tok,
            prompt=text,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
            device=device,
        )

    if prompt is not None:
        click.echo(_reply(prompt))
        return

    click.echo("glub! ask me anything. (ctrl-c to quit)")
    while True:
        try:
            user = click.prompt("you", type=str)
        except click.exceptions.Abort:
            click.echo("\nglub bye!")
            return
        click.echo(f"glub: {_reply(user)}")


@main.command(help="Train GlubLM on a dataset JSON file.")
@click.option("--data", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--out", type=click.Path(), default="checkpoints/glublm.pt")
@click.option("--tokenizer-out", type=click.Path(), default="checkpoints/tokenizer.json")
@click.option("--epochs", type=int, default=4)
@click.option("--batch-size", type=int, default=64)
@click.option("--lr", type=float, default=3e-4)
def train(
    data: str,
    out: str,
    tokenizer_out: str,
    epochs: int,
    batch_size: int,
    lr: float,
) -> None:
    from torch.utils.data import DataLoader

    from glublm.train import save_checkpoint, train_one_epoch

    samples = load_samples(data)
    corpus = [f"{s['input']} {s['output']}" for s in samples]

    click.echo(f"training tokenizer on {len(corpus)} samples ...")
    tok = GlubTokenizer.train(corpus, vocab_size=5120)
    Path(tokenizer_out).parent.mkdir(parents=True, exist_ok=True)
    tok.save(tokenizer_out)
    click.echo(f"saved tokenizer -> {tokenizer_out}")

    mcfg = ModelConfig(vocab_size=tok.vocab_size)
    tcfg = TrainConfig(lr=lr, batch_size=batch_size, epochs=epochs)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dtype = torch.bfloat16 if device.type == "cuda" else torch.float32

    ds = GlubDataset(samples, tok, max_seq_len=mcfg.max_seq_len)
    loader = DataLoader(ds, batch_size=tcfg.batch_size, shuffle=True, drop_last=True)
    model = GlubLM(mcfg).to(device)
    optim = torch.optim.AdamW(
        model.parameters(),
        lr=tcfg.lr,
        betas=(tcfg.beta1, tcfg.beta2),
        weight_decay=tcfg.weight_decay,
    )

    total_steps = epochs * len(loader)
    warmup_steps = max(int(total_steps * tcfg.warmup_ratio), 1)
    click.echo(
        f"training {model.num_parameters():,} params for "
        f"{epochs} epochs x {len(loader)} batches = {total_steps} steps on {device}"
    )

    step = 0
    for epoch in range(epochs):
        step, losses = train_one_epoch(
            model=model,
            loader=loader,
            optim=optim,
            step=step,
            total_steps=total_steps,
            warmup_steps=warmup_steps,
            base_lr=tcfg.lr,
            grad_clip=tcfg.grad_clip,
            device=device,
            dtype=dtype,
            pad_id=tok.pad_id,
        )
        click.echo(f"  epoch {epoch + 1}/{epochs} - final batch loss {losses[-1]:.4f}")

    save_checkpoint(out, model, optim, step=step, epoch=epochs)
    click.echo(f"saved checkpoint -> {out}")


@main.command(name="generate-data", help="Run the multi-agent dataset generation pipeline.")
@click.option("--topics", type=click.Path(exists=True, dir_okay=False), default="data_gen/topics.yaml")
@click.option("--team-config", type=click.Path(exists=True, dir_okay=False), default="data_gen/team_config.yaml")
@click.option("--out", type=click.Path(), default="data/glublm_pilot_10k.json")
@click.option("--target", type=int, default=10000, help="Total number of samples to produce")
@click.option("--budget-usd", type=float, default=1000.0, help="Approximate cost cap in USD (subscription mode is effectively free)")
@click.option("--num-workers", type=int, default=4, help="Parallel claude -p subprocesses")
@click.option("--skip-critic", is_flag=True, default=False, help="Skip the critic agent (forbidden scan + persona guardian still run)")
@click.option("--only-group", type=click.Choice(["goldfish_physical", "ted_lasso_wisdom"]), default=None, help="Generate samples for a single group only")
def generate_data(
    topics: str,
    team_config: str,
    out: str,
    target: int,
    budget_usd: float,
    num_workers: int,
    skip_critic: bool,
    only_group: str | None,
) -> None:
    # data_gen/ lives at the project root, not under src/glublm, so it is
    # not part of the installed wheel. Add the project root (three levels
    # up from this file) to sys.path so `from data_gen...` resolves when
    # the CLI is invoked from the installed glublm entry point.
    import sys as _sys
    _project_root = str(Path(__file__).resolve().parents[2])
    if _project_root not in _sys.path:
        _sys.path.insert(0, _project_root)

    from dotenv import load_dotenv

    from data_gen.orchestrator import Orchestrator

    load_dotenv()
    orch = Orchestrator(
        topics_path=topics,
        team_config_path=team_config,
        out_path=out,
        target_total=target,
        budget_usd=budget_usd,
        num_workers=num_workers,
        skip_critic=skip_critic,
        only_group=only_group,
    )
    orch.run()


if __name__ == "__main__":
    main()
