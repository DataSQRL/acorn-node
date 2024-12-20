import { describe, test, expect } from "@jest/globals";

import {
  StandardAPIFunctionFactory,
  GraphQLSchemaConverter,
  graphQlSchemaConverterConfig,
  GraphQlOperationConverter,
} from "../../src/converter";
import { MockAPIExecutor } from "../mocks/mock-api-executor";
import { TestUtil } from "../test.utils";
import { APIFunction } from "../../src/tool";
import { ApiQuery } from "../../src/api";

const apiExecutor = MockAPIExecutor.create("none");
const functionFactory = new StandardAPIFunctionFactory(apiExecutor, new Set());
const operationConverter = new GraphQlOperationConverter(functionFactory);

function getConverter(): GraphQLSchemaConverter {
  return new GraphQLSchemaConverter(functionFactory);
}

function getFunctionsFromPath(path: string) {
  const schemaString = TestUtil.getAssetFileAsString(path);
  return getConverter().convertSchema(schemaString);
}

function snapshotFunctions(
  functions: APIFunction<ApiQuery>[],
  testName: string,
): void {
  TestUtil.snapshotTestOrCreate(
    JSON.stringify(
      functions.map((f) => f.toJSON()),
      null,
      2,
    ),
    `snapshot/${testName}.json`,
  );
}

describe("GraphQLSchemaConverter Tests", () => {
  test("testNutshop", () => {
    const converter = new GraphQLSchemaConverter(
      new StandardAPIFunctionFactory(apiExecutor, new Set(["customerid"])),
      graphQlSchemaConverterConfig.create(
        graphQlSchemaConverterConfig.createIgnorePrefixOperationFilter(
          "internal",
        ),
      ),
    );
    const schemaString = TestUtil.getAssetFileAsString(
      "graphql/nutshop-schema.graphqls",
    );

    const functions = converter.convertSchema(schemaString);
    expect(functions).toHaveLength(5);

    const ordersFunction = functions.find(
      (f) => f.getName().toLowerCase() === "orders",
    );
    expect(ordersFunction).toBeDefined();
    expect(ordersFunction?.function.parameters.properties).toHaveProperty(
      "customerid",
    );
    expect(
      ordersFunction?.getModelFunction().parameters.properties,
    ).not.toHaveProperty("customerid");

    snapshotFunctions(functions, "nutshop");
  });

  test("testCreditCard", () => {
    const functions = getFunctionsFromPath(
      "graphql/creditcard-rewards.graphqls",
    );
    expect(functions).toHaveLength(6);
    snapshotFunctions(functions, "creditcard-rewards");
  });

  test("testLawEnforcement", () => {
    const functions = getFunctionsFromPath("graphql/law_enforcement.graphqls");
    expect(functions).toHaveLength(7);
    snapshotFunctions(functions, "law_enforcement");
  });

  test("testSensors", () => {
    const converter = getConverter();
    const schemaString = TestUtil.getAssetFileAsString(
      "graphql/sensors.graphqls",
    );
    const functions = converter.convertSchema(schemaString);
    expect(functions).toHaveLength(5);

    const queries = operationConverter.convertOperations(
      TestUtil.getAssetFileAsString("graphql/sensors-aboveTemp.graphql"),
    );
    expect(queries).toHaveLength(2);
    expect(queries[0].function.name).toBe("HighTemps");

    snapshotFunctions([...functions, ...queries], "sensors");
  });
});
