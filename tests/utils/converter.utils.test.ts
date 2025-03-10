import { describe, expect, test } from "@jest/globals";
import {
  getNodeDescriptionByLocation,
  getNodeStringByLocation,
  processField,
  extractTypeFromDummy,
  printFieldType,
  printArgumentType,
} from "../../src/utils/converter.utils";
import { GraphQLArgument, GraphQLInputField, GraphQLString } from "graphql";
import { FunctionDefinitionParameters } from "../../src/tool";
import { VisitContext, UnwrapRequiredType } from "../../src/converter";

describe("converter utilities", () => {
  describe("getNodeDescriptionByLocation", () => {
    // Let's focus on testing the null/undefined cases since they're more predictable
    test("should return undefined if locations are null", () => {
      const sampleDef = "type Query { field: String }";
      expect(
        getNodeDescriptionByLocation(sampleDef, undefined),
      ).toBeUndefined();
      expect(
        getNodeDescriptionByLocation(sampleDef, 45, undefined),
      ).toBeUndefined();
    });
  });

  describe("getNodeStringByLocation", () => {
    test("should handle undefined location and stripComments", () => {
      const sampleDef = "type Query { field: String }";

      // Test with undefined location
      const result1 = getNodeStringByLocation(sampleDef);
      expect(result1).toBe(sampleDef);

      // Test with defined location and stripComments=true
      const result2 = getNodeStringByLocation(
        sampleDef,
        { start: 0, end: 10 },
        true,
      );
      expect(result2.length).toBeLessThanOrEqual(10);

      // Test with defined location and stripComments=false
      const result3 = getNodeStringByLocation(
        sampleDef,
        { start: 0, end: 10 },
        false,
      );
      expect(result3.length).toBeLessThanOrEqual(10);
    });
  });

  describe("processField", () => {
    let params: FunctionDefinitionParameters;
    let ctx: VisitContext;

    beforeEach(() => {
      params = {
        type: "object",
        properties: {},
        required: [],
      };

      ctx = {
        variables: {},
        numArgs: 0,
        queryParams: "",
        fields: [],
      };
    });

    test("should process required field correctly", () => {
      const unwrappedType: UnwrapRequiredType = {
        type: GraphQLString,
        required: true,
      };

      const result = processField(
        params,
        ctx,
        0,
        unwrappedType,
        "testArg",
        "originalTestArg",
        "Test description",
      );

      expect(params.required).toContain("testArg");
      expect(params.properties).toHaveProperty("testArg");
      expect(params.properties.testArg.description).toBe("Test description");
      expect(result.argName).toBe("$testArg");
      expect(result.queryBody).toBe("originalTestArg: $testArg");
    });

    test("should handle non-zero numArgs", () => {
      const unwrappedType: UnwrapRequiredType = {
        type: GraphQLString,
        required: false,
      };

      const result = processField(
        params,
        ctx,
        1,
        unwrappedType,
        "testArg",
        "originalTestArg",
      );

      expect(result.queryBody).toBe(", originalTestArg: $testArg");
    });

    test("should handle non-zero ctx.numArgs", () => {
      ctx.numArgs = 1;

      const unwrappedType: UnwrapRequiredType = {
        type: GraphQLString,
        required: false,
      };

      const result = processField(
        params,
        ctx,
        0,
        unwrappedType,
        "testArg",
        "originalTestArg",
      );

      expect(result.queryHeader).toBe(", ");
    });
  });

  describe("extractTypeFromDummy", () => {
    test("should extract type correctly", () => {
      const output = `
      type DummyType {
        testField: String
      }
      `;

      const result = extractTypeFromDummy(output, "testField");
      expect(result).toBe("String");
    });

    test("should remove comments when extracting type", () => {
      const output = `
      # Comment to ignore
      type DummyType {
        # Comment on field
        testField: String
      }
      `;

      const result = extractTypeFromDummy(output, "testField");
      expect(result).toBe("String");
    });

    test("should throw error if field not found", () => {
      const output = `
      type DummyType {
        differentField: String
      }
      `;

      expect(() => extractTypeFromDummy(output, "testField")).toThrow();
    });
  });

  describe("printFieldType and printArgumentType", () => {
    test("printFieldType should convert GraphQLInputField to string representation", () => {
      const field: GraphQLInputField = {
        name: "testField",
        type: GraphQLString,
        description: "Test description",
        defaultValue: undefined,
        extensions: undefined,
        astNode: undefined,
      };

      const result = printFieldType(field);
      expect(result).toBe("String");
    });

    test("printArgumentType should convert GraphQLArgument to string representation", () => {
      const arg: GraphQLArgument = {
        name: "testArg",
        type: GraphQLString,
        description: "Test description",
        defaultValue: undefined,
        extensions: undefined,
        astNode: undefined,
        deprecationReason: undefined,
      };

      const result = printArgumentType(arg);
      expect(result).toBe("String");
    });
  });
});
