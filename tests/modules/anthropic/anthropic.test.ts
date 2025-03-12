import { describe, expect, test, jest } from "@jest/globals";
import { APIFunction, FunctionDefinition } from "../../../src";
import {
  toAnthropicAiTools,
  createAnthropicToolResult,
} from "../../../src/modules/anthropic";

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

describe("Anthropic module", () => {
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

  test("toAnthropicAiTools should convert API functions to Anthropic tools format", () => {
    const result = toAnthropicAiTools([mockApiFunction]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "testFunction",
      description: "Test function description",
      input_schema: {
        type: "object",
        required: ["requiredParam"],
        properties: {
          requiredParam: { type: "string" },
          optionalParam: { type: "number" },
        },
      },
    });
  });

  test("createAnthropicToolResult should process tool call messages", async () => {
    // Setup message with tool_use blocks
    const mockMessage = {
      content: [
        {
          type: "tool_use",
          id: "tool-use-1",
          name: "testFunction",
          input: { requiredParam: "test value" },
        },
        {
          type: "tool_use",
          id: "tool-use-2",
          name: "testFunction",
          input: { requiredParam: "another test" },
        },
      ],
    };

    // Mock the executeTools response
    (APIFunction.executeTools as jest.Mock).mockResolvedValue([
      JSON.stringify({ result: "success 1" }),
      JSON.stringify({ result: "success 2" }),
    ]);

    const result = await createAnthropicToolResult(
      mockMessage as any,
      [mockApiFunction],
      "Custom prompt",
    );

    // Check that APIFunction.executeTools was called with the correct parameters
    expect(APIFunction.executeTools).toHaveBeenCalledWith(
      [
        { name: "testFunction", arguments: { requiredParam: "test value" } },
        { name: "testFunction", arguments: { requiredParam: "another test" } },
      ],
      [mockApiFunction],
    );

    // Check that the result has the expected format
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool-use-1",
          content: JSON.stringify({ result: "success 1" }),
        },
        {
          type: "tool_result",
          tool_use_id: "tool-use-2",
          content: JSON.stringify({ result: "success 2" }),
        },
        {
          type: "text",
          text: "Custom prompt",
        },
      ],
    });
  });

  test("createAnthropicToolResult should use default prompt when not provided", async () => {
    // Setup simple message with one tool_use block
    const mockMessage = {
      content: [
        {
          type: "tool_use",
          id: "tool-use-1",
          name: "testFunction",
          input: { requiredParam: "test value" },
        },
      ],
    };

    // Mock the executeTools response for a single tool - return as array for map to work correctly
    (APIFunction.executeTools as jest.Mock).mockResolvedValue([
      JSON.stringify({ result: "success" }),
    ]);

    const result = await createAnthropicToolResult(mockMessage as any, [
      mockApiFunction,
    ]);

    // Check that the result contains the default prompt
    expect(result.content[result.content.length - 1]).toEqual({
      type: "text",
      text: "Answer with these tool results",
    });
  });
});
