import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const picked = atom({ plugin: 'chat-reply', key: 'picked' } as const, null)
const generation = atom({ plugin: 'chat-reply', key: 'generation' } as const, 0)
const reply = atom({ plugin: 'chat-reply', key: 'reply' } as const, null)

const ACCENT = '#e8833a'
const MAX_LINES = 4
// Hovering a selection's edge makes the answer flap to undefined for a moment.
const GRACE_MS = 600

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

const preview = (text: string) => {
  const lines = text.split('\n')
  const shown = lines.slice(0, MAX_LINES)

  return lines.length > MAX_LINES ? [...shown, `… +${lines.length - MAX_LINES} lines`] : shown
}

export const register: Register = on => {
  let dismissed: string | null = null
  let current: string | null = null
  let lastSeenAt = 0

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
        let raw = sel?.text.trim() || null

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

  on('prompt.edit', ($, e, next) => {
    dismiss()

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    dismiss()
    const pending = await read($, reply)

    if (pending === null) {
      return next(e)
    }

    await update($, reply, () => null)

    return next({ ...e, text: quote(pending) + e.text })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, picked)
    const pending = await read($, reply)

    if (e.props.hasSurvey || (text === null && pending === null)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {pending !== null && (
          <Box flexDirection="column">
            <Box>
              <Text color={ACCENT}>↩ Replying to </Text>
              <Button key="clear" label="✕ Remove reply" onPress={() => update($, reply, () => null)} />
            </Box>
            {excerptBlock({ Box, Text }, preview(pending))}
          </Box>
        )}
        {text !== null && (
          <Box>
            <Button
              key="reply"
              label="💬 Reply"
              onPress={async () => {
                dismissed = text
                await update($, reply, () => text)
                await update($, picked, () => null)
              }}
            />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const parsed = parseReply(e.props.text)

    if (parsed === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text color={ACCENT}>↩ Replying to</Text>
        {excerptBlock({ Box, Text }, parsed.excerpt)}
        <Text>{parsed.message}</Text>
      </Box>
    )
  })
}
