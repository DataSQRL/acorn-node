import { describe, expect, test } from "@jest/globals";
import {
  ApiQuery,
  VoidApiQueryExecutor,
  FunctionDefinition,
  ErrorType,
} from "../../../src";

describe("VoidApiQueryExecutor", () => {
  const queryExecutor = new VoidApiQueryExecutor();
  const mockQuery: ApiQuery = { query: "test query" };
  const mockFunctionDef: FunctionDefinition = {
    name: "test",
    parameters: {
      type: "object",
      properties: {
        param: { type: "string" },
      },
      required: [],
    },
  };

  test("should have validation disabled by default", () => {
    expect(queryExecutor.enableValidation).toBe(false);
  });

  test("validate should always return valid result", () => {
    // Test with valid function definition
    const result1 = queryExecutor.validate(mockFunctionDef);
    expect(result1.isValid()).toBe(true);
    expect(result1.errorType).toBe(ErrorType.NONE);

    // Test with invalid parameters - should still return valid
    const result2 = queryExecutor.validate(mockFunctionDef, { param: 123 });
    expect(result2.isValid()).toBe(true);
    expect(result2.errorType).toBe(ErrorType.NONE);
  });

  test("executeQuery should always return 'void' string", async () => {
    // Test without arguments
    const result1 = await queryExecutor.executeQuery(mockQuery);
    expect(result1).toBe("void");

    // Test with arguments
    const result2 = await queryExecutor.executeQuery(mockQuery, {
      param: "test",
    });
    expect(result2).toBe("void");
  });
});
