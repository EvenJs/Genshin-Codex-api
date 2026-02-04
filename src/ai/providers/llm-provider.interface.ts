/**
 * LLM Provider abstraction layer
 * Allows easy switching between different LLM providers (Ollama, OpenAI, etc.)
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
}

export interface LlmChatOptions extends LlmGenerateOptions {
  messages: LlmMessage[];
}

export interface LlmGenerateRequest {
  prompt: string;
  options?: LlmGenerateOptions;
}

export interface LlmResponse {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmStreamChunk {
  content: string;
  done: boolean;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';

export interface LlmProvider {
  /**
   * Generate a completion from a single prompt
   */
  generate(request: LlmGenerateRequest): Promise<LlmResponse>;

  /**
   * Generate a chat completion from messages
   */
  chat(options: LlmChatOptions): Promise<LlmResponse>;

  /**
   * Generate a streaming completion
   */
  generateStream(
    request: LlmGenerateRequest,
  ): AsyncGenerator<LlmStreamChunk, void, unknown>;

  /**
   * Generate a streaming chat completion
   */
  chatStream(
    options: LlmChatOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown>;

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get available models
   */
  listModels(): Promise<string[]>;
}
