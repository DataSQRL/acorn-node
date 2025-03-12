import OpenAI from 'openai';

export interface UseLoggingResult {
  log: string;
  logEventArrived: () => void;
  logToolCalls: (
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    toolCallResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[],
  ) => void;
}
