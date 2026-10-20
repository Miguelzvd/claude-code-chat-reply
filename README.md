# chat-reply

A Claude Code mod to reply to a specific part of the conversation.

Select text in the terminal and a **💬 Reply** button appears above the prompt. Click it and the excerpt is pinned above the prompt, apart from what you type. Send your message and the excerpt goes with it as a quote; in the transcript it is drawn with an orange bar so you can tell the quote from your own text.

- **Remove reply** unpins the excerpt, so the message goes out without it.
- Selecting other text and clicking **Reply** again replaces the pinned excerpt only.
- The model receives the excerpt as a markdown quote under the line `[Replying to this excerpt from the conversation:]`.

## Install

In a Claude Code terminal session:

```
/plugin install chat-reply --marketplace Miguelzvd/claude-code-chat-reply
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install chat-reply --marketplace Miguelzvd/claude-code-chat-reply
```

## Limitations

- Needs fullscreen mode: outside it `$.ui.selection()` returns nothing.
- Claude Code gives no event when a selection is cleared, so the button is hidden by a timer and when you edit or send the prompt.
- The quote bar's height is estimated for a 120-column terminal; in a much narrower or wider one it can be a row short or long.
