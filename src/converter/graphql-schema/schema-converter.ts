import {
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  GraphQLArgument,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLString,
  printSchema,
  printType,
} from "graphql";
import { ApiQuery } from "../../api";
import { APIFunction, FunctionDefinitionParameters } from "../../tool";
import { APIFunctionFactory } from "../api-function-factory";
import graphQlSchemaConverterConfig, {
  GraphQLSchemaConverterConfig,
} from "./schema-converter-config";
import {
  combineArgNameStrings,
  combineOperationNameStrings,
  createFunctionDefinition,
  getNodeDescriptionByLocation,
} from "../../utils";
import { VisitContext } from "./visit-context";
import typeConverter, { UnwrapRequiredType } from "./type-converter";

export interface SchemaConverter<TApiQuery extends ApiQuery = ApiQuery> {
  convertSchema(schemaDefinition: string): APIFunction<TApiQuery>[];
  convertSchemaFromUri(
    schemaDefinition: string,
  ): Promise<APIFunction<TApiQuery>[]>;
}

// TODO: move to schema converter utils
const processField = (
  params: FunctionDefinitionParameters,
  ctx: VisitContext,
  numArgs: number,
  unwrappedType: UnwrapRequiredType,
  argName: string,
  originalName: string,
  description?: string,
) => {
  let queryBody = "";
  let queryHeader = "";
  const argDef = typeConverter.convertToArgument(unwrappedType.type);
  argDef.description = description;

  if (numArgs > 0) {
    queryBody += ", ";
  }
  if (ctx.numArgs + numArgs > 0) {
    queryHeader += ", ";
  }

  // TODO: implement this without object mutation
  if (unwrappedType.required) {
    params.required.push(argName);
  }
  params.properties[argName] = argDef;

  argName = "$" + argName;
  queryBody += originalName + ": " + argName;

  return {
    argName,
    queryHeader,
    queryBody,
  };
};

// TODO: move to schema converter utils
const extractTypeFromDummy = (output: string, fieldName: string) => {
  // Remove comments
  output = output
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  const pattern = new RegExp(`${fieldName}\\s*:\\s*([^)}]+)`);
  const match = output.match(pattern);

  if (!match) {
    throw new Error(`Could not find type in: ${output}`);
  }

  return match[1].trim();
};
const printFieldType = (field: GraphQLInputField) => {
  const type = new GraphQLInputObjectType({
    name: "DummyType",
    fields: {
      [field.name]: field,
    },
  });
  const output = printType(type);
  // TODO: do it in a more elegant way
  return extractTypeFromDummy(output, field.name);
};

const printArgumentType = (argument: GraphQLArgument) => {
  const { description, ...argumentWithoutDescription } = argument;

  const type = new GraphQLObjectType({
    name: "DummyType",
    fields: {
      dummyField: {
        type: GraphQLString,
        args: {
          [argumentWithoutDescription.name]: argumentWithoutDescription,
        },
      },
    },
  });
  const output = printType(type);
  // TODO: do it in a more elegant way
  return extractTypeFromDummy(output, argument.name);
};

export class GraphQLSchemaConverter<TApiQuery extends ApiQuery = ApiQuery>
  implements SchemaConverter<TApiQuery>
{
  constructor(
    private functionFactory: APIFunctionFactory<TApiQuery>,
    private config: GraphQLSchemaConverterConfig = graphQlSchemaConverterConfig.create(),
  ) {}

  async convertSchemaFromUri() {
    const introspectionQuery = {
      query: getIntrospectionQuery(),
    } as TApiQuery;
    const res =
      await this.functionFactory.apiExecutor.executeQuery(introspectionQuery);
    const schemaDefinition = buildClientSchema(JSON.parse(res));
    return this.convertSchema(printSchema(schemaDefinition));
  }

  convertSchema(schemaDefinition: string): APIFunction<TApiQuery>[] {
    const schema = buildSchema(schemaDefinition);

    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();

    const queries = queryType?.getFields() || {};
    const mutations = mutationType?.getFields() || {};

    const functionsFromQueries = Object.values(queries)
      .map(
        this.createApiFunctionFromGraphQLOperation("query", schemaDefinition),
      )
      .filter(Boolean);
    const functionsFromMutations = Object.values(mutations)
      .map(
        this.createApiFunctionFromGraphQLOperation(
          "mutation",
          schemaDefinition,
        ),
      )
      .filter(Boolean);

    return [
      ...functionsFromQueries,
      ...functionsFromMutations,
    ] as APIFunction<TApiQuery>[];
  }

  private createApiFunctionFromGraphQLOperation =
    (operationName: "query" | "mutation", schemaDefinition: string) =>
    (field: GraphQLField<any, any>) => {
      try {
        if (this.config.operationFilter(operationName, field.name)) {
          return this.convertToApiFunction(
            operationName,
            field,
            schemaDefinition,
          );
        }
      } catch (e) {
        console.error(`Error converting query: ${field.name}`, e);
      }
      return null;
    };

  private convertToApiFunction(
    operationType: "query" | "mutation",
    field: GraphQLField<any, any>,
    schemaDefinition: string,
  ): APIFunction<TApiQuery> {
    const functionDef = createFunctionDefinition(
      field.name,
      field.description?.trim(),
    );
    const operationName = combineOperationNameStrings(
      operationType.toLowerCase(),
      field.name,
    );
    const queryHeader = `${operationType.toLowerCase()} ${field.name}(`;

    const { queryParams, queryBody } = this.visit(
      field,
      functionDef.parameters,
      new VisitContext(schemaDefinition, operationName, "", 0, []),
    );

    const query = `${queryHeader}${queryParams}) {\n${queryBody}\n}`;
    return this.functionFactory.create(functionDef, { query });
  }

  // TODO: rewrite with graphql.visit?
  // can be moved to a separate function
  // since it is pure
  public visit(
    field: GraphQLField<any, any>,
    params: FunctionDefinitionParameters,
    context: VisitContext,
  ) {
    let queryParams = "";
    let queryBody = "";
    const type = typeConverter.unwrapType(field.type);

    if (type instanceof GraphQLObjectType) {
      // Don't recurse in a cycle or if depth limit is exceeded
      if (context.path.includes(type)) {
        console.info(
          `Detected cycle on operation '${context.operationName}'. Aborting traversal.`,
        );
        return { success: false, queryParams, queryBody };
      } else if (context.path.length + 1 > this.config.maxDepth) {
        console.info(
          `Aborting traversal because depth limit exceeded on operation '${context.operationName}'`,
        );
        return { success: false, queryParams, queryBody };
      }
    }

    queryBody += field.name;
    let numArgs = 0;

    if (field.args.length > 0) {
      queryBody += "(";

      for (let i = 0; i < field.args.length; i++) {
        const arg = field.args[i];
        let unwrappedType = typeConverter.unwrapRequiredType(arg.type);

        if (unwrappedType.type instanceof GraphQLInputObjectType) {
          const inputType = unwrappedType.type;
          const isFirstArg = i === 0;
          queryBody += `${isFirstArg ? "" : ", "}${arg.name}: { `;

          const nestedFields = Object.values(inputType.getFields());
          for (let j = 0; j < nestedFields.length; j++) {
            const isFirstNestedField = j === 0;
            const nestedField = nestedFields[j];
            unwrappedType = typeConverter.unwrapRequiredType(nestedField.type);

            const precessedData = processField(
              params,
              context,
              numArgs,
              unwrappedType,
              combineArgNameStrings(context.prefix, nestedField.name),
              nestedField.name,
              nestedField.description?.trim() ??
                getNodeDescriptionByLocation(
                  context.schemaDefinition,
                  nestedField.astNode?.loc?.start,
                  inputType.astNode?.loc?.start,
                ),
            );
            queryParams += precessedData.queryHeader;
            if (
              isFirstNestedField &&
              precessedData.queryBody.startsWith(", ")
            ) {
              precessedData.queryBody = precessedData.queryBody.substring(2);
            }
            queryBody += precessedData.queryBody;

            const typeString = printFieldType(nestedField);
            queryParams += `${precessedData.argName}: ${typeString}`;
            numArgs++;
          }

          queryBody += " }";
        } else {
          const precessedData = processField(
            params,
            context,
            numArgs,
            unwrappedType,
            combineArgNameStrings(context.prefix, arg.name),
            arg.name,
            arg.description?.trim() ??
              getNodeDescriptionByLocation(
                context.schemaDefinition,
                arg.astNode?.loc?.start,
                field.astNode?.loc?.start,
              ),
          );
          queryParams += precessedData.queryHeader;
          queryBody += precessedData.queryBody;

          const typeString = printArgumentType(arg);
          queryParams += `${precessedData.argName}: ${typeString}`;
          numArgs++;
        }
      }

      queryBody += ")";
    }

    if (type instanceof GraphQLObjectType) {
      const objectType = type;

      queryBody += " {\n";
      let atLeastOneField = false;

      for (const nestedField of Object.values(objectType.getFields())) {
        const {
          success,
          queryParams: queryParamsNested,
          queryBody: queryBodyNested,
        } = this.visit(
          nestedField,
          params,
          context.nested(
            context.schemaDefinition,
            nestedField.name,
            objectType,
            numArgs,
          ),
        );
        queryParams += queryParamsNested;
        queryBody += queryBodyNested;
        atLeastOneField ||= success;
      }

      if (!atLeastOneField) {
        throw new Error(
          `Expected at least one field on path: ${context.operationName}`,
        );
      }

      queryBody += "}";
    }

    queryBody += "\n";
    return {
      success: true,
      queryParams,
      queryBody,
    };
  }
}
