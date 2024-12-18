import {
  Kind,
  OperationDefinitionNode,
  OperationTypeNode,
  parse,
  TypeNode,
  VariableDefinitionNode,
  Location,
} from "graphql/language";
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLField,
  GraphQLInputType,
  GraphQLScalarType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  buildSchema,
  GraphQLOutputType,
  GraphQLEnumType,
  GraphQLInputField,
  printType,
  GraphQLArgument,
  GraphQLString,
} from "graphql";
import { GraphQLSchemaConverterConfig } from "./graphql-schema-converter-config";
import { APIFunctionFactory } from "./api-function-factory";
import { APIFunction } from "../tool/api-function";
import {
  FunctionDefinition,
  FunctionDefinitionArgument,
  FunctionDefinitionParameters,
} from "../tool/function-definition";
import { GraphQLQuery } from "../api/graphql-api-query";
import { Maybe } from "graphql/jsutils/Maybe";

export interface UnwrappedType {
  type: GraphQLInputType;
  required: boolean;
}

const combineStrings = (prefix: string, suffix: string) => {
  return `${prefix}${prefix ? "_" : ""}${suffix}`;
};

export class VisitContext {
  constructor(
    public operationName: string,
    public prefix: string,
    public numArgs: number,
    public path: GraphQLObjectType[]
  ) {}

  public nested(
    fieldName: string,
    type: GraphQLObjectType,
    additionalArgs: number
  ) {
    return new VisitContext(
      this.operationName + "." + fieldName,
      combineStrings(this.prefix, fieldName),
      this.numArgs + additionalArgs,
      [...this.path, type]
    );
  }
}

export class GraphQLSchemaConverter {
  private schema: GraphQLSchema;

  constructor(
    private schemaString: string,
    private functionFactory: APIFunctionFactory,
    private config: GraphQLSchemaConverterConfig = GraphQLSchemaConverterConfig.DEFAULT
  ) {
    this.schema = buildSchema(schemaString);
  }
  private static extractOperation(text: string, location?: Location): string {
    const queryString = text.substring(
      location?.start || 0,
      location?.end || text.length
    );

    // remove comments
    const lines = queryString
      .split("\n")
      .map((line) => {
        const commentPosition = line.indexOf("#");
        return commentPosition === -1
          ? line
          : line.substring(0, commentPosition).trim();
      })
      .filter(Boolean);

    return lines.join("\n");
  }

  // TODO: move to a separate OperationConverter class
  public convertOperations(operationDefinition: string): APIFunction[] {
    const document = parse(operationDefinition);

    if (!document.definitions || document.definitions.length === 0) {
      throw new Error("Operation definition contains no definitions");
    }

    const functions: APIFunction[] = [];
    document.definitions.forEach((definition, idx) => {
      if (definition.kind !== Kind.OPERATION_DEFINITION) {
        throw new Error(
          `Expected definition to be an operation, but got: ${definition.kind}`
        );
      }

      const funcDef = this.convertOperationDefinition(
        definition,
        operationDefinition,
        document.definitions[idx - 1]?.loc?.end
      );
      const queryString = GraphQLSchemaConverter.extractOperation(
        operationDefinition,
        definition.loc
      );
      const query = new GraphQLQuery(queryString);
      functions.push(this.functionFactory.create(funcDef, query));
    });

    return functions;
  }

  private convertOperationDefinition(
    node: OperationDefinitionNode,
    operationDefinition: string,
    prevNodeLocationEnd: number = 0
  ): FunctionDefinition {
    const op = node.operation;
    if (op !== OperationTypeNode.QUERY && op !== OperationTypeNode.MUTATION) {
      throw new Error(`Do not support subscriptions: ${node.name}`);
    }

    const functionComment = GraphQLSchemaConverter.parseNodeDescription(
      operationDefinition,
      node.loc?.start,
      prevNodeLocationEnd
    );
    const functionName = node.name?.value || "";

    const functionDef: FunctionDefinition = {
      name: functionName,
      description: functionComment,
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    };

    node.variableDefinitions?.forEach((varDef: VariableDefinitionNode) => {
      const description = GraphQLSchemaConverter.parseNodeDescription(
        operationDefinition,
        varDef.loc?.start,
        node.loc?.start
      );
      const argumentName = varDef.variable.name.value;
      let type = varDef.type;
      const required = type.kind === Kind.NON_NULL_TYPE;

      if (type.kind === Kind.NON_NULL_TYPE) {
        type = type.type;
      }

      const argumentDef = this.convertType(type);
      argumentDef.description = description;

      if (required) {
        functionDef.parameters.required.push(argumentName);
      }

      functionDef.parameters.properties[argumentName] = argumentDef;
    });

    return functionDef;
  }

  private defaultScalarType = "string";
  private scalarTypeMap: Record<string, string> = {
    Int: "integer",
    Float: "number",
    String: "string",
    Boolean: "boolean",
    ID: "string",
  };
  private convertType(type: TypeNode): FunctionDefinitionArgument {
    if (type.kind === Kind.LIST_TYPE) {
      return {
        type: "array",
        items: this.convertType(type.type),
      };
    } else if (type.kind === Kind.NAMED_TYPE) {
      return {
        type: this.scalarTypeMap[type.name.value] || this.defaultScalarType,
      };
    } else {
      throw new Error(`Unexpected type: ${type.kind}`);
    }
  }

  private createApiFunctionFromGraphQLOperation =
    (operationName: "query" | "mutation") =>
    (field: GraphQLField<any, any>) => {
      try {
        if (this.config.operationFilter(operationName, field.name)) {
          return this.convertToApiFunction(operationName, field);
        }
      } catch (e) {
        console.error(`Error converting query: ${field.name}`, e);
      }
      return null;
    };

  public convertSchema(): APIFunction[] {
    const queryType = this.schema.getQueryType();
    const mutationType = this.schema.getMutationType();

    const queries = queryType?.getFields() || {};
    const mutations = mutationType?.getFields() || {};

    const functionsFromQueries = Object.values(queries)
      .map(this.createApiFunctionFromGraphQLOperation("query"))
      .filter(Boolean);
    const functionsFromMutations = Object.values(mutations)
      .map(this.createApiFunctionFromGraphQLOperation("mutation"))
      .filter(Boolean);

    return [
      ...functionsFromQueries,
      ...functionsFromMutations,
    ] as APIFunction[];
  }

  private convertToApiFunction(
    operationType: "query" | "mutation",
    field: GraphQLField<any, any>
  ): APIFunction {
    const functionDef = GraphQLSchemaConverter.initializeFunctionDefinition(
      field.name,
      field.description?.trim()
    );
    const params = functionDef.parameters;
    const operationName = `${operationType.toLowerCase()}.${field.name}`;
    const queryHeader = `${operationType.toLowerCase()} ${field.name}(`;

    const { queryParams, queryBody } = this.visit(
      field,
      params,
      new VisitContext(operationName, "", 0, [])
    );

    const query = `${queryHeader}${queryParams}) {\n${queryBody}\n}`;
    return this.functionFactory.create(functionDef, new GraphQLQuery(query));
  }

  private convertToArgument(
    type: GraphQLInputType
  ): FunctionDefinitionArgument {
    if (type instanceof GraphQLScalarType) {
      return {
        type: this.scalarTypeMap[type.name] || this.defaultScalarType,
      };
    }
    if (type instanceof GraphQLEnumType) {
      return {
        type: "string",
        enum: new Set(type.getValues().map((val) => val.name)),
      };
    }
    if (type instanceof GraphQLList) {
      return {
        type: "array",
        items: this.convertToArgument(this.convertRequired(type.ofType).type),
      };
    }
    throw new Error(`Unsupported type: ${type}`);
  }

  private static initializeFunctionDefinition(
    name: string,
    description: Maybe<string>
  ): FunctionDefinition {
    const funcDef = new FunctionDefinition(name, description, {
      type: "object",
      properties: {},
      required: [],
    });
    return funcDef;
  }

  private convertRequired(type: GraphQLInputType): UnwrappedType {
    if (!(type instanceof GraphQLNonNull)) {
      return {
        type: type,
        required: false,
      };
    }

    return {
      type: type.ofType,
      required: true,
    };
  }

  public static parseNodeDescription(
    definitionString: string,
    nodeLocationStart?: number,
    parentLocationStart?: number
  ) {
    if (nodeLocationStart == null || parentLocationStart == null) {
      return undefined;
    }
    const contentToSearchForComments = definitionString
      .substring(parentLocationStart, nodeLocationStart)
      .trim();

    const multilineCommentRegex = /"""((?!""")[\s\S])*"""$/g;
    const singlelineCommentRegex = /#(.*)$/g;
    const matchers = [
      {
        regex: singlelineCommentRegex,
        // remove # symbol from the start
        clean: (match: string) => match.substring(1).trim(),
      },
      {
        regex: multilineCommentRegex,
        // remove """ symbols around the text
        clean: (match: string) => match.substring(3, match.length - 3).trim(),
      },
    ];

    for (const matcher of matchers) {
      const res = contentToSearchForComments.match(matcher.regex);
      const match = res?.[0];
      if (!match) {
        continue;
      }
      return matcher.clean(match) || undefined;
    }

    // there was no comment
    return undefined;
  }

  public visit(
    field: GraphQLField<any, any>,
    params: FunctionDefinitionParameters,
    context: VisitContext
  ) {
    let queryParams = "";
    let queryBody = "";
    const type = GraphQLSchemaConverter.unwrapType(field.type);

    if (type instanceof GraphQLObjectType) {
      // Don't recurse in a cycle or if depth limit is exceeded
      if (context.path.includes(type)) {
        console.info(
          `Detected cycle on operation '${context.operationName}'. Aborting traversal.`
        );
        return { success: false, queryParams, queryBody };
      } else if (context.path.length + 1 > this.config.maxDepth) {
        console.info(
          `Aborting traversal because depth limit exceeded on operation '${context.operationName}'`
        );
        return { success: false, queryParams, queryBody };
      }
    }

    queryBody += field.name;
    let numArgs = 0;

    if (field.args.length > 0) {
      queryBody += "(";

      for (const arg of field.args) {
        let unwrappedType = this.convertRequired(arg.type);

        if (unwrappedType.type instanceof GraphQLInputObjectType) {
          const inputType = unwrappedType.type;
          queryBody += `${arg.name}: { `;

          for (const nestedField of Object.values(inputType.getFields())) {
            unwrappedType = this.convertRequired(nestedField.type);

            const precessedData = this.processField(
              params,
              context,
              numArgs,
              unwrappedType,
              combineStrings(context.prefix, nestedField.name),
              nestedField.name,
              nestedField.description?.trim() ??
                GraphQLSchemaConverter.parseNodeDescription(
                  this.schemaString,
                  nestedField.astNode?.loc?.start,
                  inputType.astNode?.loc?.start
                )
            );
            queryParams += precessedData.queryHeader;
            queryBody += precessedData.queryBody;

            const typeString = this.printFieldType(nestedField);
            queryParams += `${precessedData.argName}: ${typeString}`;
            numArgs++;
          }

          queryBody += " }";
        } else {
          const precessedData = this.processField(
            params,
            context,
            numArgs,
            unwrappedType,
            combineStrings(context.prefix, arg.name),
            arg.name,
            arg.description?.trim() ??
              GraphQLSchemaConverter.parseNodeDescription(
                this.schemaString,
                arg.astNode?.loc?.start,
                field.astNode?.loc?.start
              )
          );
          queryParams += precessedData.queryHeader;
          queryBody += precessedData.queryBody;

          const typeString = this.printArgumentType(arg);
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
          context.nested(nestedField.name, objectType, numArgs)
        );
        queryParams += queryParamsNested;
        queryBody += queryBodyNested;
        atLeastOneField ||= success;
      }

      if (!atLeastOneField) {
        throw new Error(
          `Expected at least one field on path: ${context.operationName}`
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

  private processField(
    params: FunctionDefinitionParameters,
    ctx: VisitContext,
    numArgs: number,
    unwrappedType: UnwrappedType,
    argName: string,
    originalName: string,
    description: Maybe<string>
  ) {
    let queryBody = "";
    let queryHeader = "";
    const argDef = this.convertToArgument(unwrappedType.type);
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
  }

  private printFieldType(field: GraphQLInputField) {
    const type = new GraphQLInputObjectType({
      name: "DummyType",
      fields: {
        [field.name]: field,
      },
    });
    const output = printType(type);
    // TODO: do it in a more elegant way
    return this.extractTypeFromDummy(output, field.name);
  }

  private printArgumentType(argument: GraphQLArgument): string {
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
    return this.extractTypeFromDummy(output, argument.name);
  }

  private extractTypeFromDummy(output: string, fieldName: string): string {
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
  }

  private static unwrapType(type: GraphQLOutputType): GraphQLOutputType {
    if (type instanceof GraphQLList) {
      return GraphQLSchemaConverter.unwrapType(type.ofType);
    } else if (type instanceof GraphQLNonNull) {
      return GraphQLSchemaConverter.unwrapType(type.ofType);
    } else {
      return type;
    }
  }
}
