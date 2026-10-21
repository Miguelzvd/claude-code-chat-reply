import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const picked = atom({ plugin: 'chat-reply', key: 'picked' } as const, null)
const generation = atom({ plugin: 'chat-reply', key: 'generation' } as const, 0)
const reply = atom({ plugin: 'chat-reply', key: 'reply' } as const, null)
// First excerpt line the pinned box shows.
const top = atom({ plugin: 'chat-reply', key: 'top' } as const, 0)
// Whether the pinned box shows the whole excerpt instead of a scrolling window.
// Sent replies the person opened, by transcript row.
const opened = atom({ plugin: 'chat-reply', key: 'opened' } as const, {} as Record<string, boolean>)
const expanded = atom({ plugin: 'chat-reply', key: 'expanded' } as const, false)

const ACCENT = '#e8833a'
const VISIBLE_LINES = 5
// Hovering a selection's edge makes the answer flap to undefined for a moment.
const GRACE_MS = 600

// Prompt box, footer and notices are not conversation: a selection there is never quoted.
const CHROME_LINE = /shift\+tab|auto mode|accept edits|\[[A-Z]+:[A-Z]+\]|\bctx\b|copied \d+ chars|💬 Reply|Remove reply|^\s*[❯>]\s*$|[─━]{4}/

const HEADER = '[Replying to this excerpt from the conversation:]\n'

const quote = (text: string) =>
  HEADER +
  text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n') + '\n\n'

// Splits a submitted message into its quoted excerpt and what the person typed.
const parseReply = (text: string) => {
  if (!text.startsWith(HEADER)) {
    return null
  }

  const lines = text.slice(HEADER.length).split('\n')
  const end = lines.findIndex(line => !line.startsWith('> '))
  const count = end === -1 ? lines.length : end

  return {
    excerpt: lines.slice(0, count).map(line => line.slice(2)),
    message: lines.slice(count).join('\n').replace(/^\n/, ''),
  }
}

// The API gives no width, so wrapped rows are estimated from this many columns.
const WRAP_COLUMNS = 120

// A thin left-bar glyph per visual row; a filled one-cell Box is as wide as a full cell.
const excerptBlock = (ui: { Box: any; Text: any }, lines: string[]) => {
  const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / WRAP_COLUMNS)), 0)

  return (
    <ui.Box flexDirection="row" gap={1}>
      <ui.Box flexDirection="column" flexShrink={0}>
        {Array.from({ length: rows }, (_, i) => (
          <ui.Text key={i} color={ACCENT}>
            ▎
          </ui.Text>
        ))}
      </ui.Box>
      <ui.Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {lines.map((line, i) => (
          <ui.Text key={i} dimColor>
            {line === '' ? ' ' : line}
          </ui.Text>
        ))}
      </ui.Box>
    </ui.Box>
  )
}

const clamp = (offset: number, count: number) => Math.max(0, Math.min(offset, count - VISIBLE_LINES))

export const register: Register = on => {
  let dismissed: string | null = null
  let current: string | null = null
  let lastSeenAt = 0
  let draft = ''

  // A selection in one transcript row carries a requestId. Without one it may reach into the prompt or
  // footer, or the Reply button that shifted the layout: drop those lines and keep the chat text.
  const clean = (sel: { text: string; requestId?: string }) => {
    if (sel.requestId !== undefined) {
      return sel.text.trim() || null
    }

    const text = sel.text
      .split('\n')
      .filter(line => !CHROME_LINE.test(line))
      .join('\n')
      .trim()

    return text !== '' && !(draft !== '' && draft.includes(text)) ? text : null
  }

  const dismiss = () => {
    dismissed = current
  }

  on('session.start', ($, e, next) => {
    // Each reload starts a new loop; the generation stops the ones left from before.
    const poll = async () => {
      const mine = (await $.clock.now()) + Math.random()
      await update($, generation, () => mine)

      while ((await read($, generation)) === mine) {
        const sel = await $.ui.selection()
        const now = await $.clock.now()
        let raw = sel ? clean(sel) : null

        if (raw !== null) {
          lastSeenAt = now
        } else if (current !== null && now - lastSeenAt < GRACE_MS) {
          raw = current
        }

        if (raw === null) {
          dismissed = null
        }

        if (raw !== current) {
          current = raw
        }

        const text = raw !== null && raw !== dismissed ? raw : null

        if (text !== (await read($, picked))) {
          await update($, picked, () => text)
        }

        await $.clock.sleep(150)
      }
    }
    void poll()

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    dismiss()
    const result = await next(e)
    draft = result.text

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    dismiss()
    draft = ''
    const pending = await read($, reply)

    if (pending === null) {
      return next(e)
    }

    await update($, reply, () => null)
    await update($, top, () => 0)
    await update($, expanded, () => false)

    return next({ ...e, text: quote(pending) + e.text })
  })

  // The wheel over the pinned excerpt moves its own window, not the band's.
  on('ui.scroll', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pending = await read($, reply)
    const count = pending === null ? 0 : pending.split('\n').length

    if ((await read($, expanded)) || count <= VISIBLE_LINES || (e.pointer !== undefined && (e.pointer.row < 1 || e.pointer.row > VISIBLE_LINES))) {
      return next(e)
    }

    await update($, top, offset => clamp(offset + e.by, count))

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, picked)
    const pending = await read($, reply)
    const offset = await read($, top)
    const open = await read($, expanded)

    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const lines = pending === null ? [] : pending.split('\n')
    const from = open ? 0 : clamp(offset, lines.length)
    const shown = open ? lines : lines.slice(from, from + VISIBLE_LINES)
    const long = lines.length > VISIBLE_LINES
    const move = (by: number) => update($, top, current => clamp(current + by, lines.length))

    return (
      <Box flexDirection="column">
        {pending !== null && (
          <Box flexDirection="column">
            <Box>
              <Text color={ACCENT}>↩ Replying to </Text>
              <Button
                key="clear"
                label="✕ Remove reply"
                onPress={async () => {
                  await update($, reply, () => null)
                  await update($, top, () => 0)
                  await update($, expanded, () => false)
                }}
              />
              {long && (
                <Button
                  key="toggle"
                  label={open ? '▴ Collapse' : '▾ Expand'}
                  onPress={() => update($, expanded, value => !value)}
                />
              )}
            </Box>
            {excerptBlock({ Box, Text }, shown)}
            {long && !open && (
              <Box>
                <Button key="up" label="▲" onPress={() => move(-1)} />
                <Button key="down" label="▼" onPress={() => move(1)} />
                <Text dimColor>{` ${from + 1}-${from + VISIBLE_LINES} of ${lines.length}`}</Text>
              </Box>
            )}
          </Box>
        )}
        {/* One row stays reserved for the button: it showing or hiding must not shift the chat. */}
        <Box height={1}>
          {text === null ? (
            <Text> </Text>
          ) : (
            <Button
              key="reply"
              label="💬 Reply"
              onPress={async () => {
                dismissed = text
                await update($, reply, () => text)
                await update($, top, () => 0)
                await update($, expanded, () => false)
                await update($, picked, () => null)
              }}
            />
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const parsed = parseReply(e.props.text)

    if (parsed === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const long = parsed.excerpt.length > VISIBLE_LINES
    const open = !long || (await read($, opened))[e.requestId] === true
    const shown = open ? parsed.excerpt : parsed.excerpt.slice(0, VISIBLE_LINES)

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={ACCENT}>↩ Replying to </Text>
          {long && (
            <Button
              key="toggle"
              label={open ? '▴ Collapse' : `▾ Expand (${parsed.excerpt.length} lines)`}
              onPress={() => update($, opened, rows => ({ ...rows, [e.requestId]: !open }))}
            />
          )}
        </Box>
        {excerptBlock({ Box, Text }, shown)}
        <Text>{parsed.message}</Text>
      </Box>
    )
  })

  // A Reply button under each block of the model's answer pins that block as the excerpt.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const body = await next(e)

    if (e.props.isSummary || e.props.text.trim() === '') {
      return body
    }

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {body}
        <Box>
          <Button
            key={`reply-${e.requestId}`}
            label="💬 Reply"
            onPress={async () => {
              await update($, reply, () => e.props.text.trim())
              await update($, top, () => 0)
              await update($, expanded, () => false)
            }}
          />
        </Box>
      </Box>
    )
  })
}
