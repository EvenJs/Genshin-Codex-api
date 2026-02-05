import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiService } from '../ai.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  aiResultId?: string;
}

export type AiChatStreamEvent =
  | { type: 'meta'; conversationId: string; aiGenerated: boolean; knowledgeUsed: boolean }
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId: string; aiResultId?: string }
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
    private readonly prisma: PrismaService,
  ) {}

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    language?: string,
  ): Promise<AiChatResponse> {
    const { conversation, id } = this.getOrCreateConversation(userId, conversationId);
    const knowledge = await this.knowledgeService.getKnowledgeContext(message);

    const aiAvailable = await this.aiService.isAvailable();
    const promptMessage = buildStrategyAssistantUserPrompt(
      message,
      knowledge.context,
      language,
    );
    const llmMessages = this.buildLlmMessages(conversation, promptMessage);
    this.addMessage(conversation, { role: 'user', content: message });

    if (!aiAvailable) {
      const fallback = this.buildFallbackResponse(message, knowledge.context, language);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      const aiResultId = await this.saveAiResult({
        userId,
        conversationId: id,
        input: {
          message,
          knowledgeUsed: knowledge.hasResults,
        },
        output: {
          response: fallback,
          knowledgeUsed: knowledge.hasResults,
        },
        aiGenerated: false,
        language,
      });
      return {
        conversationId: id,
        response: fallback,
        aiGenerated: false,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
        aiResultId,
      };
    }

    try {
      const response = await this.aiService.chatForUser(userId, {
        messages: llmMessages,
        temperature: 0.4,
      });

      this.addMessage(conversation, { role: 'assistant', content: response.content });

      const aiResultId = await this.saveAiResult({
        userId,
        conversationId: id,
        input: {
          message,
          knowledgeUsed: knowledge.hasResults,
        },
        output: {
          response: response.content,
          knowledgeUsed: knowledge.hasResults,
        },
        aiGenerated: true,
        language,
        model: response.model ?? null,
        promptTokens: response.promptTokens ?? null,
        completionTokens: response.completionTokens ?? null,
        totalTokens: response.totalTokens ?? null,
      });

      return {
        conversationId: id,
        response: response.content,
        aiGenerated: true,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
        aiResultId,
      };
    } catch (error) {
      this.logger.warn(`AI chat failed: ${error instanceof Error ? error.message : error}`);
      const fallback = this.buildFallbackResponse(message, knowledge.context, language);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      const aiResultId = await this.saveAiResult({
        userId,
        conversationId: id,
        input: {
          message,
          knowledgeUsed: knowledge.hasResults,
        },
        output: {
          response: fallback,
          knowledgeUsed: knowledge.hasResults,
        },
        aiGenerated: false,
        language,
      });
      return {
        conversationId: id,
        response: fallback,
        aiGenerated: false,
        knowledgeUsed: knowledge.hasResults,
        generatedAt: new Date().toISOString(),
        aiResultId,
      };
    }
  }

  async *chatStream(
    userId: string,
    message: string,
    conversationId?: string,
    language?: string,
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

    const promptMessage = buildStrategyAssistantUserPrompt(
      message,
      knowledge.context,
      language,
    );
    const llmMessages = this.buildLlmMessages(conversation, promptMessage);
    this.addMessage(conversation, { role: 'user', content: message });

    if (!aiAvailable) {
      const fallback = this.buildFallbackResponse(message, knowledge.context, language);
      this.addMessage(conversation, { role: 'assistant', content: fallback });
      yield { type: 'chunk', content: fallback };
      const aiResultId = await this.saveAiResult({
        userId,
        conversationId: id,
        input: {
          message,
          knowledgeUsed: knowledge.hasResults,
        },
        output: {
          response: fallback,
          knowledgeUsed: knowledge.hasResults,
        },
        aiGenerated: false,
        language,
      });
      yield { type: 'done', conversationId: id, aiResultId };
      return;
    }

    let accumulated = '';

    try {
      const stream = this.aiService.chatStreamForUser(userId, {
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
      const aiResultId = await this.saveAiResult({
        userId,
        conversationId: id,
        input: {
          message,
          knowledgeUsed: knowledge.hasResults,
        },
        output: {
          response: finalResponse,
          knowledgeUsed: knowledge.hasResults,
        },
        aiGenerated: true,
        language,
      });
      yield { type: 'done', conversationId: id, aiResultId };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'AI streaming failed';
      this.logger.warn(`AI streaming failed: ${messageText}`);
      yield { type: 'error', message: messageText };
    }
  }

  private async saveAiResult(params: {
    userId: string;
    conversationId: string;
    input: unknown;
    output: unknown;
    aiGenerated: boolean;
    language?: string;
    model?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  }): Promise<string> {
    const input = this.toJsonInput(params.input);
    const output = this.toJsonInput(params.output);
    const result = await this.prisma.aiResult.create({
      data: {
        userId: params.userId,
        conversationId: params.conversationId,
        feature: 'STRATEGY_CHAT',
        input,
        output,
        aiGenerated: params.aiGenerated,
        language: params.language,
        model: params.model ?? undefined,
        promptTokens: params.promptTokens ?? undefined,
        completionTokens: params.completionTokens ?? undefined,
        totalTokens: params.totalTokens ?? undefined,
      },
      select: { id: true },
    });

    return result.id;
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
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

  private buildFallbackResponse(
    message: string,
    knowledgeContext: string | null,
    language?: string,
  ): string {
    const isEn = this.normalizeLanguage(language) === 'en';

    if (knowledgeContext) {
      return isEn
        ? `AI is temporarily unavailable, but here is relevant knowledge for you:\n\n${knowledgeContext}\n\nShare your character level/weapon/team goals and I can refine the advice.`
        : `AI 服务暂时不可用，但我整理了可用资料供你参考：\n\n${knowledgeContext}\n\n你可以补充角色等级/武器/队伍需求，我会再帮你细化建议。`;
    }

    return isEn
      ? 'AI is temporarily unavailable. Please try again later.\nYou can also share your character, weapon, constellations, and goal (Abyss/Overworld) so I can give general guidance.'
      : 'AI 服务暂时不可用，请稍后再试。\n你也可以告诉我：角色名称、武器、命座、队伍目标（深渊/大世界），我会优先给出通用建议。';
  }

  private normalizeLanguage(language?: string): 'en' | 'zh' {
    if (language?.toLowerCase().startsWith('en')) return 'en';
    return 'zh';
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
