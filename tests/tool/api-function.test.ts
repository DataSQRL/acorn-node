import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import {
  ApiQuery,
  APIFunction,
  ToolCall,
  FunctionDefinition,
  ValidationResult,
  ErrorType,
  APIQueryExecutor,
} from "../../src";

describe("APIFunction", () => {
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

  const mockQuery: ApiQuery = {
    query: "test query",
  };

  // Mock API executor
  class MockApiExecutor implements APIQueryExecutor {
    enableValidation = true;

    validate = jest.fn().mockReturnValue(ValidationResult.VALID);
    executeQuery = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ result: "success" }));
  }

  let mockApiExecutor: MockApiExecutor;
  let apiFunction: APIFunction;

  beforeEach(() => {
    mockApiExecutor = new MockApiExecutor();
    apiFunction = new APIFunction(mockFunctionDef, mockQuery, mockApiExecutor);
  });

  test("should correctly initialize with valid function definition", () => {
    expect(apiFunction.getName()).toBe("testFunction");
    expect(apiFunction.function).toBe(mockFunctionDef);
    expect(apiFunction.apiQuery).toBe(mockQuery);
    expect(apiFunction.apiExecutor).toBe(mockApiExecutor);
  });

  test("should throw error when initializing with invalid function definition", () => {
    mockApiExecutor.validate = jest
      .fn()
      .mockReturnValue(
        new ValidationResult(
          ErrorType.INVALID_JSON,
          "Invalid function definition",
        ),
      );

    expect(() => {
      new APIFunction(mockFunctionDef, mockQuery, mockApiExecutor);
    }).toThrow(/Function \[testFunction\] invalid for API/);
  });

  test("validate should call apiExecutor.validate with correct params", () => {
    const args = { requiredParam: "test" };
    apiFunction.validate(args);

    expect(mockApiExecutor.validate).toHaveBeenCalledWith(
      mockFunctionDef,
      args,
    );
  });

  test("execute should call apiExecutor.executeQuery with correct params", async () => {
    const args = { requiredParam: "test" };
    await apiFunction.execute(args);

    expect(mockApiExecutor.executeQuery).toHaveBeenCalledWith(mockQuery, args);
  });

  test("validateAndExecute should execute when validation passes", async () => {
    const args = { requiredParam: "test" };
    mockApiExecutor.validate.mockReturnValue(ValidationResult.VALID);

    const result = await apiFunction.validateAndExecute(args);

    expect(mockApiExecutor.validate).toHaveBeenCalledWith(
      mockFunctionDef,
      args,
    );
    expect(mockApiExecutor.executeQuery).toHaveBeenCalledWith(mockQuery, args);
    expect(result).toBe(JSON.stringify({ result: "success" }));
  });

  test("validateAndExecute should throw when validation fails", async () => {
    const args = { requiredParam: 123 }; // Wrong type
    mockApiExecutor.validate.mockReturnValue(
      new ValidationResult(
        ErrorType.INVALID_ARGUMENT,
        "requiredParam must be string",
      ),
    );

    await expect(apiFunction.validateAndExecute(args)).rejects.toThrow(
      /It looks like you tried to call function `testFunction`, but this has failed with the following error: requiredParam must be string/,
    );

    expect(mockApiExecutor.validate).toHaveBeenCalledWith(
      mockFunctionDef,
      args,
    );
    expect(mockApiExecutor.executeQuery).not.toHaveBeenCalled();
  });

  test("validateAndExecuteFromString should parse JSON and execute when valid", async () => {
    const validJson = JSON.stringify({ requiredParam: "test" });
    mockApiExecutor.validate.mockReturnValue(ValidationResult.VALID);

    const result = await apiFunction.validateAndExecuteFromString(validJson);

    expect(mockApiExecutor.validate).toHaveBeenCalledWith(mockFunctionDef, {
      requiredParam: "test",
    });
    expect(mockApiExecutor.executeQuery).toHaveBeenCalledWith(mockQuery, {
      requiredParam: "test",
    });
    expect(result).toBe(JSON.stringify({ result: "success" }));
  });

  test("validateAndExecuteFromString should return error message for invalid JSON", async () => {
    const invalidJson = "{invalid json}";

    const result = await apiFunction.validateAndExecuteFromString(invalidJson);

    expect(result).toContain("It looks like you tried to call function");
    expect(result).toContain("Malformed JSON");
    // Not checking mockApiExecutor calls as the implementation might parse first then validate
    expect(mockApiExecutor.executeQuery).not.toHaveBeenCalled();
  });

  test("toJSON should return correct object representation", () => {
    const jsonObj = apiFunction.toJSON();

    expect(jsonObj).toEqual({
      function: mockFunctionDef,
      apiQuery: mockQuery,
    });
  });

  describe("executeTools", () => {
    test("should execute a single tool call", async () => {
      const toolCall: ToolCall = {
        name: "testFunction",
        arguments: { requiredParam: "test" },
      };

      const tools = [apiFunction];

      const result = await APIFunction.executeTools(toolCall, tools);

      expect(result).toBe(JSON.stringify({ result: "success" }));
    });

    test("should execute multiple tool calls", async () => {
      const toolCalls: ToolCall[] = [
        { name: "testFunction", arguments: { requiredParam: "test1" } },
        { name: "testFunction", arguments: { requiredParam: "test2" } },
      ];

      const tools = [apiFunction];

      const results = await APIFunction.executeTools(toolCalls, tools);

      expect(results).toEqual([
        JSON.stringify({ result: "success" }),
        JSON.stringify({ result: "success" }),
      ]);
    });

    test("should return empty string when tool not found", async () => {
      const toolCall: ToolCall = {
        name: "nonExistentTool",
        arguments: { param: "test" },
      };

      const tools = [apiFunction];

      const result = await APIFunction.executeTools(toolCall, tools);

      expect(result).toBe("");
    });
  });
});
