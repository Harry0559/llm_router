type JsonObj = Record<string, unknown>;

export type AgentType = 'main_agent' | 'subagent' | 'title_gen';

interface InnerCCState {
  externalId: string;
  historyAnchors: string[];
  activeTurnAnchor: string;
  pendingCompaction: boolean;
  lastUpdatedAt: number;
}

const INNERCC_SESSION_TTL_MS = 1000 * 60 * 60;
const INNERCC_PENDING_COMPACTION_WINDOW_MS = 1000 * 60 * 10;
const INNERCC_TITLE_ATTACH_WINDOW_MS = 1000 * 60 * 2;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripSystemReminderTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<available-deferred-tools>[\s\S]*?<\/available-deferred-tools>/g, ' ')
    .replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, ' ');
}

function sanitizeAnchor(text: string): string {
  return normalizeWhitespace(stripSystemReminderTags(text));
}

function getToolName(tool: unknown): string | null {
  if (!tool || typeof tool !== 'object') return null;
  const obj = tool as JsonObj;
  if (typeof obj.name === 'string' && obj.name) return obj.name;
  const fn = obj.function as JsonObj | undefined;
  if (fn && typeof fn.name === 'string' && fn.name) return fn.name;
  return null;
}

export function extractToolNames(body: JsonObj): string[] {
  const tools = body.tools as unknown[] | undefined;
  if (!Array.isArray(tools)) return [];
  return tools.map(getToolName).filter((name): name is string => Boolean(name));
}

export function classifyAgentType(body: JsonObj): AgentType {
  const toolNames = extractToolNames(body);
  if (toolNames.length === 0) return 'title_gen';
  if (toolNames.includes('Agent')) return 'main_agent';
  return 'subagent';
}

function textPartsFromContent(content: unknown): string[] {
  if (typeof content === 'string') {
    const cleaned = sanitizeAnchor(content);
    return cleaned ? [cleaned] : [];
  }

  if (!Array.isArray(content)) return [];

  const out: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as JsonObj;
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    const cleaned = sanitizeAnchor(block.text);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

export function extractUserAnchors(body: JsonObj): string[] {
  const messages = body.messages as unknown[] | undefined;
  if (!Array.isArray(messages)) return [];

  const anchors: string[] = [];
  for (const item of messages) {
    if (!item || typeof item !== 'object') continue;
    const msg = item as JsonObj;
    if (msg.role !== 'user') continue;
    const textParts = textPartsFromContent(msg.content);
    if (textParts.length === 0) continue;
    anchors.push(textParts[textParts.length - 1]);
  }
  return anchors;
}

function getLatestUserAnchor(body: JsonObj): string {
  const anchors = extractUserAnchors(body);
  return anchors[anchors.length - 1] ?? '';
}

function extractPrimarySystemText(body: JsonObj): string {
  const messages = body.messages as unknown[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const first = messages[0];
  if (!first || typeof first !== 'object') return '';
  const msg = first as JsonObj;
  if (msg.role !== 'system') return '';

  const parts = textPartsFromContent(msg.content);
  if (parts.length > 0) return parts.join('\n');
  if (typeof msg.content === 'string') return sanitizeAnchor(msg.content);
  return '';
}

export function isInnerCCOpenAI(body: JsonObj, protocol: 'anthropic' | 'openai'): boolean {
  if (protocol !== 'openai') return false;
  const systemText = extractPrimarySystemText(body);
  return systemText.includes('You are InnerCC, an internal AI coding assistant.');
}

function isInnerCCTitleRequest(body: JsonObj): boolean {
  const toolNames = extractToolNames(body);
  if (toolNames.length !== 0) return false;
  const systemText = extractPrimarySystemText(body);
  return systemText.includes('Generate a concise, sentence-case title');
}

export function isCompactionSummaryRequest(anchor: string): boolean {
  const lowered = anchor.toLowerCase();
  return lowered.includes('respond with text only')
    && lowered.includes('create a detailed summary of the conversation so far');
}

function anchorsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function isPrefix(prefix: string[], value: string[]): boolean {
  return prefix.length <= value.length && prefix.every((item, index) => item === value[index]);
}

function currentMessageRole(body: JsonObj): string {
  const messages = body.messages as unknown[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1];
  if (!last || typeof last !== 'object') return '';
  const msg = last as JsonObj;
  return typeof msg.role === 'string' ? msg.role : '';
}

export class InnerCCOpenAITracker {
  private readonly states: InnerCCState[] = [];

  private syntheticSessionSeq = 0;

  private makeSyntheticSessionExternalId(anchor: string, timestamp: number): string {
    this.syntheticSessionSeq += 1;
    const preview = encodeURIComponent(anchor.slice(0, 48) || `session-${this.syntheticSessionSeq}`);
    return `synthetic:innercc_openai:${timestamp.toString(36)}:${this.syntheticSessionSeq.toString(36)}:${preview}`;
  }

  private recentStates(now: number): InnerCCState[] {
    return this.states
      .filter((state) => now - state.lastUpdatedAt <= INNERCC_SESSION_TTL_MS)
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  }

  private findStateByExternalId(externalId: string): InnerCCState | null {
    return this.states.find((state) => state.externalId === externalId) ?? null;
  }

  private updateStateAfterResolution(state: InnerCCState, body: JsonObj, timestamp: number, isNewRun: boolean): void {
    const anchors = extractUserAnchors(body);
    const latestAnchor = anchors[anchors.length - 1] ?? state.activeTurnAnchor;
    const titleRequest = isInnerCCTitleRequest(body);

    if (latestAnchor) {
      state.activeTurnAnchor = latestAnchor;
    }

    if (anchors.length > 0) {
      if (state.pendingCompaction && isNewRun) {
        state.historyAnchors = anchors;
      } else if (anchorsEqual(state.historyAnchors, anchors) || isPrefix(state.historyAnchors, anchors)) {
        state.historyAnchors = anchors;
      } else if (titleRequest && isNewRun) {
        // Title-only requests may arrive before the main request for the new turn.
        // Keep the established history chain intact and only advance the active turn anchor.
      } else if (isNewRun) {
        state.historyAnchors = anchors;
      }
    }

    state.pendingCompaction = isCompactionSummaryRequest(latestAnchor);
    state.lastUpdatedAt = timestamp;
  }

  private resolveExistingState(body: JsonObj, timestamp: number): { state: InnerCCState | null; isNewRun: boolean } {
    const anchors = extractUserAnchors(body);
    const latestAnchor = anchors[anchors.length - 1] ?? '';
    const lastRole = currentMessageRole(body);
    const titleRequest = isInnerCCTitleRequest(body);
    const recent = this.recentStates(timestamp);

    for (const state of recent) {
      if (lastRole === 'tool' && anchorsEqual(state.historyAnchors, anchors)) {
        return { state, isNewRun: false };
      }

      if (anchorsEqual(state.historyAnchors, anchors)) {
        return { state, isNewRun: false };
      }

      if (state.pendingCompaction && timestamp - state.lastUpdatedAt <= INNERCC_PENDING_COMPACTION_WINDOW_MS) {
        return { state, isNewRun: true };
      }

      if (isPrefix(state.historyAnchors, anchors) && anchors.length > state.historyAnchors.length) {
        if (state.activeTurnAnchor && latestAnchor === state.activeTurnAnchor) {
          return { state, isNewRun: false };
        }
        return { state, isNewRun: true };
      }

      if (titleRequest && latestAnchor && timestamp - state.lastUpdatedAt <= INNERCC_TITLE_ATTACH_WINDOW_MS) {
        if (latestAnchor === state.activeTurnAnchor) {
          return { state, isNewRun: false };
        }
        if (state.historyAnchors.length > 0) {
          return { state, isNewRun: true };
        }
      }
    }

    return { state: null, isNewRun: true };
  }

  resolveSessionSignal(body: JsonObj, protocol: 'anthropic' | 'openai', timestamp: number): string {
    if (!isInnerCCOpenAI(body, protocol)) return '__unknown__';
    const { state } = this.resolveExistingState(body, timestamp);
    if (state) return state.externalId;
    const firstAnchor = getLatestUserAnchor(body) || 'innercc-session';
    const externalId = this.makeSyntheticSessionExternalId(firstAnchor, timestamp);
    this.states.push({
      externalId,
      historyAnchors: [],
      activeTurnAnchor: firstAnchor,
      pendingCompaction: false,
      lastUpdatedAt: timestamp,
    });
    return externalId;
  }

  resolveRunSignal(body: JsonObj, protocol: 'anthropic' | 'openai', externalSessionId: string, timestamp: number): boolean {
    const existing = this.findStateByExternalId(externalSessionId);
    if (!existing) return true;

    const { state, isNewRun } = this.resolveExistingState(body, timestamp);
    const target = state ?? existing;
    this.updateStateAfterResolution(target, body, timestamp, isNewRun);
    return isNewRun;
  }
}

const liveInnerCCTracker = new InnerCCOpenAITracker();

export function resolveSessionSignal(body: JsonObj, protocol: 'anthropic' | 'openai', timestamp: number): string {
  try {
    const metadata = (body.metadata ?? {}) as JsonObj;
    const raw = metadata.user_id as string | undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as JsonObj;
      const sid = parsed.session_id as string | undefined;
      if (sid) return sid;
    }
  } catch {
    // Ignore and continue into synthetic resolution below.
  }

  if (isInnerCCOpenAI(body, protocol)) {
    return liveInnerCCTracker.resolveSessionSignal(body, protocol, timestamp);
  }

  return '__unknown__';
}

export function resolveRunSignal(body: JsonObj, protocol: 'anthropic' | 'openai', externalSessionId: string, agentType: AgentType, timestamp: number): boolean {
  if (isInnerCCOpenAI(body, protocol)) {
    return liveInnerCCTracker.resolveRunSignal(body, protocol, externalSessionId, timestamp);
  }

  if (agentType !== 'main_agent') return false;

  const messages = body.messages as unknown[] | undefined;
  if (!messages || messages.length === 0) return true;

  const last = messages[messages.length - 1] as JsonObj;
  if (last.role !== 'user') return false;

  const content = last.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content) || content.length === 0) return false;

  return (content as JsonObj[]).every(item => item.type === 'text');
}

export function getSyntheticSessionDisplayName(externalId: string, latestAnchor: string): string | null {
  if (!externalId.startsWith('synthetic:innercc_openai:')) return null;
  const pretty = latestAnchor || decodeURIComponent(externalId.split(':').slice(4).join(':') || 'innercc');
  return pretty.slice(0, 48);
}
