# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`chat-reply` is a Claude Code mod. Select text in the terminal and a Reply button appears above the prompt. Click it and the excerpt is pinned above the prompt and sent with the next message as a quote. See `README.md` for the behavior and the install steps.

## Layout

- `.claude-plugin/plugin.json`: the manifest.
- `hooks/hooks.json`: lists the hooks module, `./register.tsx`.
- `hooks/register.tsx`: the whole mod. It polls `$.ui.selection()`, draws the button and the pinned excerpt in an `AbovePrompt` render hook, and redraws quoted `UserMessage` rows.
- `types/index.d.ts`: the `$.state` contract.

`tsconfig.json` and `.claude-plugin/types/` are generated and stay out of git.

## Rules

- The hooks module has no DOM and no Node. Everything outside it goes through `$`.
- The message sent to the model starts with the line `[Replying to this excerpt from the conversation:]`, then the excerpt as a markdown quote. `parseReply` reads the same format back to draw the transcript, so change `quote` and `parseReply` together.
- Claude Code gives no event when a selection is cleared. The button hides when the person edits or sends the prompt, clicks Reply, or selects other text. Do not add a timer back.
- `$.ui.selection()` answers `undefined` for a moment when the pointer crosses a selection's edge. `GRACE_MS` covers that flap.
- The quote bar has one row per row of text. An empty line must render a space, or its row has zero height and the bar grows past the text.
- The bar's height assumes a terminal of `WRAP_COLUMNS` (120) columns. The API gives no width.

## Checks

Run these before a commit:

```
claude plugin validate .
```

Test by hand in fullscreen mode: select text that has a blank line, click Reply, and check that the bar matches the excerpt's height.

## Commits

Write commit messages in Portuguese, Conventional Commit style (`feat:`, `fix:`, `docs:`), with a short title and a body that says why.
