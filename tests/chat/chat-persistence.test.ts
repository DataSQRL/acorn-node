import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { chatPersistence, APIChatPersistence } from "../../src";
import { FetchApiQueryExecutor } from "../../src/api";

// Mock the FetchApiQueryExecutor to prevent actual API calls
jest.mock("../../src/api", () => {
  const originalModule = jest.requireActual("../../src/api");
  return {
    ...originalModule,
    FetchApiQueryExecutor: jest.fn().mockImplementation(() => ({
      executeQuery: jest.fn().mockImplementation((query, variables) => {
        if (query.query.includes("getMessages")) {
          return Promise.resolve(
            JSON.stringify({
              messages: [
                { id: "1", content: "Message 1" },
                { id: "2", content: "Message 2" },
              ],
            }),
          );
        } else if (query.query.includes("saveMessage")) {
          return Promise.resolve(
            JSON.stringify({
              saveMessage: { id: "3", content: variables.content },
            }),
          );
        }
        return Promise.resolve("{}");
      }),
    })),
  };
});

describe("chatPersistence", () => {
  describe("factory methods", () => {
    test("fromApi should create APIChatPersistence instance", () => {
      const config = {
        graphQlUri: "https://api.example.com/graphql",
        getMessagesQuery: "query getMessages { messages { id content } }",
        saveMessageMutation:
          "mutation saveMessage($content: String!) { saveMessage(content: $content) { id content } }",
      };

      const persistence = chatPersistence.fromApi(config);

      expect(persistence).toBeInstanceOf(APIChatPersistence);
      expect(FetchApiQueryExecutor).toHaveBeenCalledWith({
        graphqlUri: config.graphQlUri,
      });
    });

    test("NONE should provide a no-op implementation", async () => {
      const nonePersistence = chatPersistence.NONE;

      // Test currentState
      expect(nonePersistence.currentState).toEqual([]);

      // Test saveChatMessage
      const saveResult = await nonePersistence.saveChatMessage(
        { content: "test" },
        {},
      );
      expect(saveResult).toBe("");

      // Test getChatMessages
      const messages = await nonePersistence.getChatMessages({});
      expect(messages).toEqual([]);
    });
  });
});

describe("APIChatPersistence", () => {
  let mockApiExecutor: any;
  let persistence: APIChatPersistence<any>;
  const getMessagesQuery = {
    query: "query getMessages { messages { id content } }",
  };
  const saveMessageMutation = {
    query:
      "mutation saveMessage($content: String!) { saveMessage(content: $content) { id content } }",
  };

  beforeEach(() => {
    mockApiExecutor = {
      executeQuery: jest.fn(),
    };
    persistence = new APIChatPersistence(
      mockApiExecutor,
      getMessagesQuery,
      saveMessageMutation,
    );
  });

  test("constructor should initialize properties correctly", () => {
    expect(persistence.getMessagesQuery).toBe(getMessagesQuery);
    expect(persistence.saveMessageMutation).toBe(saveMessageMutation);
    expect(persistence.currentState).toEqual([]);
  });

  test("saveChatMessage should call apiExecutor and update state", async () => {
    const message = { content: "Hello, world!" };
    const variables = { content: "Hello, world!" };
    mockApiExecutor.executeQuery.mockResolvedValue('{"result": "success"}');

    const result = await persistence.saveChatMessage(message, variables);

    expect(mockApiExecutor.executeQuery).toHaveBeenCalledWith(
      saveMessageMutation,
      variables,
    );
    expect(result).toBe('{"result": "success"}');
    expect(persistence.currentState).toEqual([message]);
  });

  test("getChatMessages should call apiExecutor and update state", async () => {
    const variables = { conversationId: "123" };
    mockApiExecutor.executeQuery.mockResolvedValue(
      '{"messages": [{"id":"1","content":"Message 1"},{"id":"2","content":"Message 2"}]}',
    );

    const result = await persistence.getChatMessages(variables);

    expect(mockApiExecutor.executeQuery).toHaveBeenCalledWith(
      getMessagesQuery,
      variables,
    );
    expect(result).toEqual([
      { id: "2", content: "Message 2" },
      { id: "1", content: "Message 1" },
    ]);
    expect(persistence.currentState).toEqual([
      { id: "2", content: "Message 2" },
      { id: "1", content: "Message 1" },
    ]);
  });

  test("getChatMessages should handle errors", async () => {
    const variables = { conversationId: "123" };
    const error = new Error("API error");
    mockApiExecutor.executeQuery.mockRejectedValue(error);

    await expect(persistence.getChatMessages(variables)).rejects.toThrow(
      "API error",
    );
  });
});
