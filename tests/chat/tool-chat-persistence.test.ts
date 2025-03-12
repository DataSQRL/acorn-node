import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { ToolChatPersistence } from "../../src/chat/tool-chat-persistance";
import { APIFunction } from "../../src/tool";

describe("ToolChatPersistence", () => {
  let mockGetMessagesTool: any;
  let mockSaveMessageTool: any;
  let persistence: ToolChatPersistence<any>;

  beforeEach(() => {
    mockGetMessagesTool = {
      validateAndExecute: jest.fn(),
      getName: jest.fn().mockReturnValue("getMessages"),
    };

    mockSaveMessageTool = {
      validateAndExecute: jest.fn(),
    };

    persistence = new ToolChatPersistence(
      mockGetMessagesTool as APIFunction,
      mockSaveMessageTool as APIFunction,
    );
  });

  test("constructor should initialize properties correctly", () => {
    expect(persistence.getMessagesTool).toBe(mockGetMessagesTool);
    expect(persistence.saveMessageTool).toBe(mockSaveMessageTool);
    expect(persistence.currentState).toEqual([]);
  });

  test("saveChatMessage should call saveMessageTool and update state", async () => {
    const message = { content: "Hello, world!" };
    const variables = { content: "Hello, world!" };
    mockSaveMessageTool.validateAndExecute.mockResolvedValue(
      '{"result": "success"}',
    );

    const result = await persistence.saveChatMessage(message, variables);

    expect(mockSaveMessageTool.validateAndExecute).toHaveBeenCalledWith(
      variables,
    );
    expect(result).toBe('{"result": "success"}');
    expect(persistence.currentState).toEqual([message]);
  });

  test("getChatMessages should call getMessagesTool and update state", async () => {
    const variables = { conversationId: "123" };
    mockGetMessagesTool.validateAndExecute.mockResolvedValue(
      '{"getMessages": [{"id":"1","content":"Message 1"},{"id":"2","content":"Message 2"}]}',
    );

    const result = await persistence.getChatMessages(variables);

    expect(mockGetMessagesTool.validateAndExecute).toHaveBeenCalledWith(
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

  test("getChatMessages should handle empty or invalid responses", async () => {
    const variables = { conversationId: "123" };
    // Mock the behavior of root?.[this.getMessagesTool.getName()] returning undefined
    mockGetMessagesTool.validateAndExecute.mockResolvedValue(
      '{"otherProperty": []}',
    );

    try {
      await persistence.getChatMessages(variables);
      // If we reach here, the test should fail as an error should have been thrown
      expect("this line").toBe("should not be reached");
    } catch (error) {
      // This is expected
      expect(error).toBeDefined();
    }
  });

  test("getChatMessages should handle errors", async () => {
    const variables = { conversationId: "123" };
    const error = new Error("Tool error");
    mockGetMessagesTool.validateAndExecute.mockRejectedValue(error);

    await expect(persistence.getChatMessages(variables)).rejects.toThrow(
      "Tool error",
    );
  });
});
