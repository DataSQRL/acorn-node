import { useCallback, useState } from 'react';
import { UseLoggingResult } from './types.ts';
import OpenAI from 'openai';

export default function useLogging(): UseLoggingResult {
  const [log, setLog] = useState('Monitoring...');

  const appendLog = useCallback((value: string) => {
    setLog((previousLog) => `${previousLog}\n\n${value}`);
  }, []);

  const logEventArrived = useCallback(() => {
    setLog('Monitoring...\n\nEvent arrived...');
  }, []);

  const logToolCalls = useCallback((
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    toolCallResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[],
  ) => {
    toolCalls.forEach((toolCall) => {
      let output = `'${toolCall.function.name}' function was called with such payload:\n${JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}`;
      const toolCallResult = toolCallResults.find(({ tool_call_id }) => (
        tool_call_id === toolCall.id
      ));

      if (toolCallResult?.content && typeof toolCallResult.content === 'string') {
        output += `\nGot such response:\n${JSON.stringify(JSON.parse(toolCallResult.content), null, 2)}`;
      }

      appendLog(output);
    });
  }, [appendLog]);

  return { log, logEventArrived, logToolCalls };
}
