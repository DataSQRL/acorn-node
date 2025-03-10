import { describe, expect, test } from "@jest/globals";
import { persistenceFormatters } from "../../../../src/modules/langchain/persistence/formatters";
import { DataSQRLChatMessage } from "../../../../src/modules/langchain/persistence/persistence-saver";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

describe("langchain persistence formatters", () => {
  describe("baseMessageMappers", () => {
    test("should map human message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "123",
        role: "human",
        content: "Hello, AI!",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "User",
      };

      const result = persistenceFormatters.baseMessageMappers.human(apiMessage);

      expect(result).toBeInstanceOf(HumanMessage);
      expect(result?.content).toBe("Hello, AI!");
      expect(result?.name).toBe("User");
    });

    test("should map AI message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "456",
        role: "ai",
        content: "I'm an AI assistant.",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "Assistant",
        functionCall: JSON.stringify([{ id: "tool1", name: "search" }]),
      };

      const result = persistenceFormatters.baseMessageMappers.ai(apiMessage);

      expect(result).toBeInstanceOf(AIMessage);
      expect(result?.content).toBe("I'm an AI assistant.");
      expect(result?.name).toBe("Assistant");
      expect((result as AIMessage).tool_calls).toEqual([
        { id: "tool1", name: "search" },
      ]);
    });

    test("should map system message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "789",
        role: "system",
        content: "You are a helpful assistant.",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
      };

      const result =
        persistenceFormatters.baseMessageMappers.system(apiMessage);

      expect(result).toBeInstanceOf(SystemMessage);
      expect(result?.content).toBe("You are a helpful assistant.");
    });

    test("should map tool message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "101",
        role: "tool",
        content: "Search result",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "search",
        functionCall: JSON.stringify({ tool_call_id: "tool1" }),
      };

      const result = persistenceFormatters.baseMessageMappers.tool(apiMessage);

      expect(result).toBeInstanceOf(ToolMessage);
      expect(result?.content).toBe("Search result");
      expect(result?.name).toBe("search");
      expect((result as ToolMessage).tool_call_id).toBe("tool1");
    });

    test("should return null for remove message type", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "999",
        role: "remove",
        content: "Content to be removed",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
      };

      const result =
        persistenceFormatters.baseMessageMappers.remove(apiMessage);

      expect(result).toBeNull();
    });

    test("should map generic message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "123",
        role: "generic",
        content: "Generic message",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "GenericUser",
      };

      const result =
        persistenceFormatters.baseMessageMappers.generic(apiMessage);

      expect(result).toBeInstanceOf(SystemMessage);
      expect(result?.content).toBe("Generic message");
      expect(result?.name).toBe("GenericUser");
    });

    test("should map developer message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "123",
        role: "developer",
        content: "Developer message",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "DevUser",
      };

      const result =
        persistenceFormatters.baseMessageMappers.developer(apiMessage);

      expect(result).toBeInstanceOf(SystemMessage);
      expect(result?.content).toBe("Developer message");
      expect(result?.name).toBe("DevUser");
    });

    test("should map function message correctly", () => {
      const apiMessage: DataSQRLChatMessage = {
        uuid: "123",
        role: "function",
        content: "Function message",
        customerid: "user123",
        timestamp: "2023-01-01T00:00:00.000Z",
        name: "Calculator",
        functionCall: JSON.stringify([{ id: "calc1", name: "calculate" }]),
      };

      const result =
        persistenceFormatters.baseMessageMappers.function(apiMessage);

      expect(result).toBeInstanceOf(AIMessage);
      expect(result?.content).toBe("Function message");
      expect(result?.name).toBe("Calculator");
      expect((result as AIMessage).tool_calls).toEqual([
        { id: "calc1", name: "calculate" },
      ]);
    });
  });

  describe("defaultDataSqrlApi", () => {
    test("messageToMutationVariables should correctly format a message", () => {
      const message = new HumanMessage("Hello, AI!");
      const config = { configurable: { thread_id: "thread123" } };

      const variables =
        persistenceFormatters.defaultDataSqrlApi.messageToMutationVariables(
          message,
          config as any,
        );

      expect(variables).toMatchObject({
        role: "human",
        content: "Hello, AI!",
        customerid: "thread123",
      });
      expect(variables).toHaveProperty("uuid");
      expect(variables).toHaveProperty("timestamp");
    });

    test("messageToApiMessage should correctly format a message", () => {
      const message = new AIMessage({
        content: "I'm an AI assistant",
        tool_calls: [{ id: "tool1", name: "search", arguments: "{}" }],
      });
      const config = { configurable: { thread_id: "thread123" } };

      const apiMessage =
        persistenceFormatters.defaultDataSqrlApi.messageToApiMessage(
          message,
          config as any,
        );

      expect(apiMessage).toMatchObject({
        role: "ai",
        content: "I'm an AI assistant",
        customerid: "thread123",
        functionCall: JSON.stringify([
          { id: "tool1", name: "search", arguments: "{}" },
        ]),
      });
      expect(apiMessage).toHaveProperty("uuid");
      expect(apiMessage).toHaveProperty("timestamp");
    });

    test("messageToApiMessage should handle tool messages", () => {
      const message = new ToolMessage({
        content: "Search result",
        tool_call_id: "tool1",
        name: "search",
      });
      const config = { configurable: { thread_id: "thread123" } };

      const apiMessage =
        persistenceFormatters.defaultDataSqrlApi.messageToApiMessage(
          message,
          config as any,
        );

      expect(apiMessage).toMatchObject({
        role: "tool",
        content: "Search result",
        customerid: "thread123",
        name: "search",
        functionCall: JSON.stringify({
          name: "search",
          tool_call_id: "tool1",
        }),
      });
    });

    test("messageToApiMessage should handle array content", () => {
      const message = new HumanMessage({
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
          {
            type: "image",
            image_url: { url: "https://example.com/image.jpg" },
          },
        ],
      });
      const config = { configurable: { thread_id: "thread123" } };

      const apiMessage =
        persistenceFormatters.defaultDataSqrlApi.messageToApiMessage(
          message,
          config as any,
        );

      expect(apiMessage).toMatchObject({
        role: "human",
        content: "Line 1\nLine 2",
        customerid: "thread123",
      });
    });

    test("messageToMutationVariables should handle array content", () => {
      const message = new HumanMessage({
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
          {
            type: "image",
            image_url: { url: "https://example.com/image.jpg" },
          },
        ],
      });
      const config = { configurable: { thread_id: "thread123" } };

      const variables =
        persistenceFormatters.defaultDataSqrlApi.messageToMutationVariables(
          message,
          config as any,
        );

      expect(variables).toMatchObject({
        role: "human",
        content: "Line 1\nLine 2",
        customerid: "thread123",
      });
    });

    test("queryResponseToMessageList should convert API messages to BaseMessages", () => {
      const apiMessages: DataSQRLChatMessage[] = [
        {
          uuid: "1",
          role: "human",
          content: "Hello",
          customerid: "user123",
          timestamp: "2023-01-01T00:00:00.000Z",
        },
        {
          uuid: "2",
          role: "ai",
          content: "Hi there",
          customerid: "user123",
          timestamp: "2023-01-01T00:00:01.000Z",
        },
        {
          uuid: "3",
          role: "system",
          content: "System message",
          customerid: "user123",
          timestamp: "2023-01-01T00:00:02.000Z",
        },
        {
          uuid: "4",
          role: "remove", // should be filtered out
          content: "To be removed",
          customerid: "user123",
          timestamp: "2023-01-01T00:00:03.000Z",
        },
      ];

      const messages =
        persistenceFormatters.defaultDataSqrlApi.queryResponseToMessageList(
          apiMessages,
        );

      expect(messages).toHaveLength(3);
      expect(messages[0]).toBeInstanceOf(HumanMessage);
      expect(messages[1]).toBeInstanceOf(AIMessage);
      expect(messages[2]).toBeInstanceOf(SystemMessage);
    });
  });
});
