import { useEffect } from "react";
import OpenAI from "openai";
import {
  createOpenAiToolResults,
  toOpenAiTools
} from "@datasqrl/acorn-node/openai";
import { useLogging, useSetup } from "./hooks";
import { getPrompt } from "./utils.ts";
import { ACTION_TOOL } from "./constants.ts";

function App() {
  const { openAI, apiTools, data } = useSetup();
  const { log, logEventArrived, logToolCalls } = useLogging();

  // The 'data' object is being changed each time a new
  // subscription payload arrives, triggering this useEffect
  useEffect(() => {
    if (!data || !apiTools) {
      return;
    }

    logEventArrived();

    (async function() {
      // The first message is being composed which
      // contains instructions for the OpenAI model
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{
        role: "user",
        content: getPrompt(data.LowFlowRate.assetId)
      }];

      let toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

      // 'while' loop will iterate until the model
      // responds with the 'action' function call
      while (!toolCalls.some((toolCall) => (
        toolCall.function.name === ACTION_TOOL.function.name
      ))) {
        // OpenAI model is being prompted with conversation
        // history and array of tools which contains GraphQL
        // queries and mutations, and the 'action' function
        const response = await openAI.chat.completions.create({
          model: "gpt-4o",
          messages,
          tools: [...toOpenAiTools(apiTools), ACTION_TOOL]
        });

        // GraphQL queries and mutations the model requested are being executed
        const toolCallResults = await createOpenAiToolResults(
          response.choices[0].message,
          apiTools
        );

        // An array of tools model requested to use is being stored to check
        // whether it contains the 'action' function after every iteration
        toolCalls = response.choices[0].message.tool_calls || [];

        // The model's response and result of execution of selected
        // GraphQL queries and mutations are being stored to preserve
        // conversation history for following iterations
        messages.push(response.choices[0].message, ...toolCallResults);

        logToolCalls(toolCalls, toolCallResults);
      }
    })();
  }, [apiTools, data, logEventArrived, logToolCalls, openAI.chat.completions]);

  return <pre>{log}</pre>;
}

export default App;
