// ─── Anthropic SSE assembly ──────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

export function assembleAnthropicStream(sseText: string): AnyObj {
  const assembled: AnyObj = {};
  const content: AnyObj[] = [];

  for (const line of sseText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') continue;

    let event: AnyObj;
    try { event = JSON.parse(raw) as AnyObj; } catch { continue; }

    switch (event.type) {
      case 'message_start': {
        const msg = (event.message ?? {}) as AnyObj;
        Object.assign(assembled, msg);
        assembled.content = content;
        break;
      }
      case 'content_block_start': {
        const idx = event.index as number;
        const block = { ...((event.content_block ?? {}) as AnyObj) };
        if (block.type === 'tool_use') block.input = '';
        content[idx] = block;
        break;
      }
      case 'content_block_delta': {
        const idx = event.index as number;
        const delta = (event.delta ?? {}) as AnyObj;
        if (!content[idx]) break;
        if (delta.type === 'text_delta') {
          content[idx].text = ((content[idx].text as string) ?? '') + (delta.text as string ?? '');
        } else if (delta.type === 'input_json_delta') {
          content[idx].input = ((content[idx].input as string) ?? '') + (delta.partial_json as string ?? '');
        }
        break;
      }
      case 'content_block_stop': {
        const idx = event.index as number;
        if (content[idx]?.type === 'tool_use' && typeof content[idx].input === 'string') {
          try { content[idx].input = JSON.parse(content[idx].input as string); } catch { /* keep string */ }
        }
        break;
      }
      case 'message_delta': {
        const delta = (event.delta ?? {}) as AnyObj;
        if (delta.stop_reason !== undefined) assembled.stop_reason = delta.stop_reason;
        if (delta.stop_sequence !== undefined) assembled.stop_sequence = delta.stop_sequence;
        if (event.usage) {
          assembled.usage = { ...((assembled.usage ?? {}) as AnyObj), ...(event.usage as AnyObj) };
        }
        break;
      }
    }
  }

  assembled.content = content;
  return assembled;
}

export function getAnthropicTokens(assembled: AnyObj): { input: number; output: number } {
  const usage = (assembled.usage ?? {}) as AnyObj;
  const input = ((usage.input_tokens as number) ?? 0)
    + ((usage.cache_creation_input_tokens as number) ?? 0)
    + ((usage.cache_read_input_tokens as number) ?? 0);
  return {
    input,
    output: (usage.output_tokens as number) ?? 0,
  };
}

// ─── OpenAI SSE assembly ─────────────────────────────────────────────────────

export function assembleOpenAIStream(sseText: string): AnyObj {
  const assembled: AnyObj = {};
  let content = '';
  const toolCalls: AnyObj[] = [];
  let finishReason: string | null = null;
  let usage: AnyObj | null = null;

  for (const line of sseText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') continue;

    let chunk: AnyObj;
    try { chunk = JSON.parse(raw) as AnyObj; } catch { continue; }

    if (!assembled.id) {
      assembled.id = chunk.id;
      assembled.model = chunk.model;
    }

    const choices = (chunk.choices as AnyObj[]) ?? [];
    if (choices.length > 0) {
      const choice = choices[0];
      const delta = (choice.delta ?? {}) as AnyObj;

      if (typeof delta.content === 'string') content += delta.content;

      const dtc = delta.tool_calls as AnyObj[] | undefined;
      if (dtc) {
        for (const tc of dtc) {
          const idx = tc.index as number;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: tc.id, type: tc.type, function: { name: '', arguments: '' } };
          }
          const fn = (tc.function ?? {}) as AnyObj;
          const existing = toolCalls[idx].function as AnyObj;
          if (fn.name) existing.name = fn.name;
          if (fn.arguments) existing.arguments = (existing.arguments as string) + (fn.arguments as string);
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason as string;
    }

    if (chunk.usage) usage = chunk.usage as AnyObj;
  }

  const message: AnyObj = { role: 'assistant', content: content || null };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  assembled.object = 'chat.completion';
  assembled.choices = [{ index: 0, message, finish_reason: finishReason }];
  if (usage) assembled.usage = usage;

  return assembled;
}

export function getOpenAITokens(assembled: AnyObj): { input: number; output: number } {
  const usage = (assembled.usage ?? {}) as AnyObj;
  return {
    input: (usage.prompt_tokens as number) ?? 0,
    output: (usage.completion_tokens as number) ?? 0,
  };
}
