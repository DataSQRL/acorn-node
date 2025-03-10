import { describe, expect, test } from "@jest/globals";
import { ValidationResult, ErrorType } from "../../src";

describe("ValidationResult", () => {
  test("VALID static property should be a valid result", () => {
    expect(ValidationResult.VALID.errorType).toBe(ErrorType.NONE);
    expect(ValidationResult.VALID.errorMessage).toBeUndefined();
    expect(ValidationResult.VALID.isValid()).toBe(true);
  });

  test("constructor should initialize properties correctly", () => {
    const result = new ValidationResult(
      ErrorType.INVALID_ARGUMENT,
      "Test error message",
    );

    expect(result.errorType).toBe(ErrorType.INVALID_ARGUMENT);
    expect(result.errorMessage).toBe("Test error message");
  });

  test("isValid should return true for NONE error type", () => {
    const result = new ValidationResult(ErrorType.NONE);
    expect(result.isValid()).toBe(true);
  });

  test("isValid should return false for error types other than NONE", () => {
    const notFound = new ValidationResult(ErrorType.NOT_FOUND, "Not found");
    expect(notFound.isValid()).toBe(false);

    const invalidJson = new ValidationResult(
      ErrorType.INVALID_JSON,
      "Invalid JSON",
    );
    expect(invalidJson.isValid()).toBe(false);

    const invalidArg = new ValidationResult(
      ErrorType.INVALID_ARGUMENT,
      "Invalid argument",
    );
    expect(invalidArg.isValid()).toBe(false);
  });
});
