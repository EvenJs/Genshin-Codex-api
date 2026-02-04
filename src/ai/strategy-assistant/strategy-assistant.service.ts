import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiService } from '../ai.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import {
  STRATEGY_ASSISTANT_SYSTEM_PROMPT,
  buildStrategyAssistantUserPrompt,
} from '../prompts/strategy-assistant';
import { LlmMessage } from '../providers/llm-provider.interface';

export interface AiChatResponse {
  conversationId: string;
  response: string;
  aiGenerated: boolean;
  knowledgeUsed: boolean;
  generatedAt: string;
}

export type AiChatStreamEvent =
  | { type: 'meta'; conversationId: string; aiGenerated: boolean; knowledgeUsed: boolean }
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string };

interface ConversationState {
  userId: string;
  messages: LlmMessage[];
  updatedAt: number;
}

@Injectable()
export class StrategyAssistantService {
  private readonly logger = new Logger(StrategyAssistantService.name);
  private readonly conversations = new Map<string, ConversationState>();
  private readonly maxHistoryMessages = 12;
  private readonly maxIdleMs = 1000 * 60 * 60; // 1 hour

  constructor(
    private readonly aiService: AiService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<AiChatResponse> {
    const { conversation, id } = this.getOrCreateConversation(userId, conversationId);
    const knowledge = await this.knowledgeService.getKnowledgeContext(message);

    const aiAvailable = await this.aiService.isAvailable();
    const promptMessage = buildStrategyAssistantUserPrompt(message, knowledge.context);
    const llmMessages = this.buildLlmMessages(conversation, promptMessage);
    this.addMessage(conversation, { role: 'user', content: message });

    if (!aiAvailable) {
      const fallback = this.buildFallbackResponse(message, knowledge.context);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      return {
        conversationId: id,
        response: fallback,
        aiGenerated: false,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await this.aiService.chat({
        messages: llmMessages,
        temperature: 0.4,
      });

      this.addMessage(conversation, { role: 'assistant', content: response.content });

      return {
        conversationId: id,
        response: response.content,
        aiGenerated: true,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`AI chat failed: ${error instanceof Error ? error.message : error}`);
      const fallback = this.buildFallbackResponse(message, knowledge.context);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      return {
        conversationId: id,
        response: fallback,
        aiGenerated: false,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  async *chatStream(
    userId: string,
    message: string,
    conversationId?: string,
  ): AsyncGenerator<AiChatStreamEvent, void, unknown> {
    const { conversation, id } = this.getOrCreateConversation(userId, conversationId);
    const knowledge = await this.knowledgeService.getKnowledgeContext(message);

    const aiAvailable = await this.aiService.isAvailable();

    yield {
      type: 'meta',
      conversationId: id,
      aiGenerated: aiAvailable,
      knowledgeUsed: knowledge.hasResults,
    };

    const promptMessage = buildStrategyAssistantUserPrompt(message, knowledge.context);
    const llmMessages = this.buildLlmMessages(conversation, promptMessage);
    this.addMessage(conversation, { role: 'user', content: message });

    if (!aiAvailable) {
      const fallback = this.buildFallbackResponse(message, knowledge.context);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      yield { type: 'chunk', content: fallback };
      yield { type: 'done', conversationId: id };
      return;
    }

    let accumulated = '';

    try {
      const stream = this.aiService.chatStream({
        messages: llmMessages,
        temperature: 0.4,
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          accumulated += chunk.content;
          yield { type: 'chunk', content: chunk.content };
        }
      }

      const finalResponse = accumulated.trim()
        ? accumulated
        : '抱歉，我无法生成有效回复，请稍后再试。';

      this.addMessage(conversation, { role: 'assistant', content: finalResponse });
      yield { type: 'done', conversationId: id };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'AI streaming failed';
      this.logger.warn(`AI streaming failed: ${messageText}`);
      yield { type: 'error', message: messageText };
    }
  }

  private getOrCreateConversation(userId: string, conversationId?: string) {
    this.cleanupConversations();

    if (conversationId) {
      const existing = this.conversations.get(conversationId);
      if (existing && existing.userId === userId) {
        return { conversation: existing, id: conversationId };
      }
    }

    const id = randomUUID();
    const conversation: ConversationState = {
      userId,
      messages: [],
      updatedAt: Date.now(),
    };
    this.conversations.set(id, conversation);
    return { conversation, id };
  }

  private addMessage(conversation: ConversationState, message: LlmMessage) {
    conversation.messages.push(message);
    if (conversation.messages.length > this.maxHistoryMessages) {
      conversation.messages = conversation.messages.slice(-this.maxHistoryMessages);
    }
    conversation.updatedAt = Date.now();
  }

  private buildLlmMessages(
    conversation: ConversationState,
    promptMessage: string,
  ): LlmMessage[] {
    const history = conversation.messages.slice(-this.maxHistoryMessages);
    const systemMessages: LlmMessage[] = [
      { role: 'system', content: STRATEGY_ASSISTANT_SYSTEM_PROMPT },
    ];

    return [
      ...systemMessages,
      ...history.filter((message) => message.role !== 'system'),
      { role: 'user', content: promptMessage },
    ];
  }

  private buildFallbackResponse(message: string, knowledgeContext: string | null): string {
    if (knowledgeContext) {
      return `AI 服务暂时不可用，但我整理了可用资料供你参考：\n\n${knowledgeContext}\n\n你可以补充角色等级/武器/队伍需求，我会再帮你细化建议。`;
    }

    return (
      'AI 服务暂时不可用，请稍后再试。\n' +
      '你也可以告诉我：角色名称、武器、命座、队伍目标（深渊/大世界），我会优先给出通用建议。'
    );
  }

  private cleanupConversations() {
    const now = Date.now();
    for (const [id, conversation] of this.conversations.entries()) {
      if (now - conversation.updatedAt > this.maxIdleMs) {
        this.conversations.delete(id);
      }
    }
  }
}
