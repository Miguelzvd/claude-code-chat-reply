declare module 'claude-code' {
  interface PluginState {
    'chat-reply': { picked: string | null; reply: string | null; generation: number }
  }
}
