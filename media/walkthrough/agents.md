The bundled [pyxel skill](https://github.com/kitao/pyxel-skill) teaches agents
how to scope a game, which evidence to collect, and what to report. It appears
in the Configure Skills menu next to your own skills.

With [uv](https://docs.astral.sh/uv/) installed, the
[pyxel-mcp](https://github.com/kitao/pyxel-mcp) server is offered as well.
Agents can then run your game headlessly, press keys, stop on a condition such
as `score >= 1`, and look at the captured frame.

Ask agent mode: "Build a small Pyxel shooter and verify that the player can
score", then watch it iterate on real frames.
