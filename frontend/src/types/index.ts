export type AppMode = 'ide' | 'vibe' | 'multi-ai';

export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'repairing'
  | 'awaiting_approval'
  | 'success'
  | 'failed'
  | 'rolled_back';

export type MultiAIStrategy =
  | 'sequential'
  | 'parallel'
  | 'pipeline'
  | 'consensus'
  | 'implement_fix';

export type MultiAIRole =
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'verifier'
  | 'synthesizer'
  | 'custom';

export interface MultiAINode {
  id: string;
  name: string;
  role: MultiAIRole;
  provider: string;
  model: string;
  systemInstruction?: string;
  contextSource?: 'shared' | 'previous' | 'custom';
  customContext?: string;
  dependencies?: string[];
  status: 'idle' | 'waiting' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  thinking?: string;
  error?: string;
  durationMs?: number;
  tokensEstimated?: number;
  enabled: boolean;
}

export interface MultiAIRunRecord {
  id: string;
  prompt: string;
  strategy: MultiAIStrategy;
  nodes: MultiAINode[];
  synthesis?: string;
  createdAt: string;
}

export interface PlanStep {
  id: number;
  description: string;
  status: AgentStatus;
  tool?: string;
  toolAction?: string;
  toolSummary?: string;
  input?: any;
  result?: string;
  error?: string;
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  currentStep: number;
  answer?: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  toolAction?: string;
  toolSummary?: string;
  arguments: Record<string, any>;
  result?: string;
  isError?: boolean;
  durationMs?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  domain?: string;
  parameters: any;
  requiresApproval?: boolean;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  description: string;
  files: string[];
  modifiedFiles?: string[];
  createdFiles?: string[];
  createdAt: string;
}

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
}

export interface MultiAIConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  providerId?: string;
  providerName?: string;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  description?: string;
  isBuiltin?: boolean;
}

export interface MultiAIResult {
  modelId: string;
  modelName: string;
  sandboxDir: string;
  answer: string;
  plan?: Plan;
  diff?: string;
  durationMs: number;
  status: AgentStatus;
  error?: string;
  filesEdited?: string[];
}

export interface MultiAISession {
  sessionId: string;
  prompt: string;
  verifyCmd?: string;
  createdAt: string;
  results: MultiAIResult[];
  selectedId?: string;
}

export interface AgentEvent {
  type:
    | 'status'
    | 'thought'
    | 'plan'
    | 'tool_start'
    | 'tool_end'
    | 'error'
    | 'checkpoint'
    | 'repair'
    | 'question'
    | 'approval_required';
  sessionId: string;
  payload: any;
}

export interface OpenTab {
  path: string;
  title: string;
  content: string;
  isDirty?: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileItem[];
}

export type TrajectoryItem =
  | { type: 'thought'; id: string; text: string; seconds?: number }
  | { type: 'tool'; toolCall: ToolCall };

export interface UnifiedMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  images?: string[];
  files?: string[];
  thinking?: string;
  workedTime?: string;
  statusNote?: string;
  plan?: Plan;
  toolCalls?: ToolCall[];
  trajectory?: TrajectoryItem[];
  timestamp?: string;
}

export interface ChatMessage {
  id: string;
  sessionId?: string;
  sender: 'user' | 'agent' | 'system' | 'tool';
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPrompt {
  question: string;
  options?: string[];
  isMultiSelect?: boolean;
}
