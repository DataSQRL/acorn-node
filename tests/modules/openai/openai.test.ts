import { describe, expect, test, jest } from "@jest/globals";
import { APIFunction, FunctionDefinition } from "../../../src";
import {
  toOpenAiTools,
  createOpenAiToolResults,
} from "../../../src/modules/openai";

// Mock APIFunction
jest.mock("../../../src/tool", () => {
  const originalModule = jest.requireActual("../../../src/tool");
  return {
    ...originalModule,
    APIFunction: {
      ...originalModule.APIFunction,
      executeTools: jest.fn(),
    },
  };
});

describe("OpenAI module", () => {
  const mockFunctionDef: FunctionDefinition = {
    name: "testFunction",
    description: "Test function description",
    parameters: {
      type: "object",
      required: ["requiredParam"],
      properties: {
        requiredParam: { type: "string" },
        optionalParam: { type: "number" },
      },
    },
  };

  const mockApiFunction = {
    function: mockFunctionDef,
    apiQuery: { query: "test" },
    apiExecutor: {},
    getName: () => "testFunction",
  } as unknown as APIFunction;

  test("toOpenAiTools should convert API functions to OpenAI tools format", () => {
    const result = toOpenAiTools([mockApiFunction]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "function",
      function: {
        name: "testFunction",
        description: "Test function description",
        parameters: {
          type: "object",
          required: ["requiredParam"],
          properties: {
            requiredParam: { type: "string" },
            optionalParam: { type: "number" },
          },
        },
        additionalProperties: false,
      },
      strict: true,
    });
  });

  test("createOpenAiToolResults should process tool call messages", async () => {
    // Setup message with tool_calls
    const mockMessage = {
      tool_calls: [
        {
          id: "tool-call-1",
          function: {
            name: "testFunction",
            arguments: JSON.stringify({ requiredParam: "test value" }),
          },
        },
        {
          id: "tool-call-2",
          function: {
            name: "testFunction",
            arguments: JSON.stringify({ requiredParam: "another test" }),
          },
        },
      ],
    };

    // Mock the executeTools response
    (APIFunction.executeTools as jest.Mock).mockResolvedValue([
      JSON.stringify({ result: "success 1" }),
      JSON.stringify({ result: "success 2" }),
    ]);

    const result = await createOpenAiToolResults(mockMessage as any, [
      mockApiFunction,
    ]);

    // Check that APIFunction.executeTools was called with the correct parameters
    expect(APIFunction.executeTools).toHaveBeenCalledWith(
      [
        { name: "testFunction", arguments: { requiredParam: "test value" } },
        { name: "testFunction", arguments: { requiredParam: "another test" } },
      ],
      [mockApiFunction],
    );

    // Check that the result has the expected format
    expect(result).toEqual([
      {
        role: "tool",
        tool_call_id: "tool-call-1",
        content: JSON.stringify({ result: "success 1" }),
      },
      {
        role: "tool",
        tool_call_id: "tool-call-2",
        content: JSON.stringify({ result: "success 2" }),
      },
    ]);
  });

  test("createOpenAiToolResults should handle messages without tool_calls", async () => {
    // Setup message without tool_calls
    const mockMessage = {
      content: "This is a regular message",
    };

    // Reset mock before this specific test
    (APIFunction.executeTools as jest.Mock).mockClear();

    const result = await createOpenAiToolResults(mockMessage as any, [
      mockApiFunction,
    ]);

    // Should return an empty array
    expect(result).toEqual([]);
    expect(APIFunction.executeTools).not.toHaveBeenCalled();
  });
});
