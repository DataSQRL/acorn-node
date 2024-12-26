import { ApiQuery, APIQueryExecutor } from "../api";
import { addOrOverrideFromContext } from "../utils";
import { Context, DefaultContext } from "./context";
import {
  FunctionDefinition,
  FunctionDefinitionParameters,
} from "./function-definition";
import { ValidationResult } from "./validation-result";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export class APIFunction<TApiQuery extends ApiQuery = ApiQuery> {
  public static readonly createInvalidCallMessage = (
    functionName: string,
    errorMessage?: string,
  ) =>
    `It looks like you tried to call function \`${functionName}\`, ` +
    `but this has failed with the following error: ${errorMessage}. ` +
    "Please retry to call the function again. Send ONLY the JSON as a response.";

  public static async executeTools(
    toolsToCall: ToolCall,
    toolDefinitions: APIFunction[],
  ): Promise<string>;
  public static async executeTools(
    toolsToCall: ToolCall[],
    toolDefinitions: APIFunction[],
  ): Promise<string[]>;
  public static async executeTools(
    toolsToCall: ToolCall[] | ToolCall,
    toolDefinitions: APIFunction[],
  ) {
    const toolsMap = new Map(toolDefinitions.map((t) => [t.getName(), t]));

    if (!Array.isArray(toolsToCall)) {
      // execute single tool
      const apiFunction = toolsMap.get(toolsToCall.name);
      const res = await apiFunction?.validateAndExecute(
        toolsToCall.arguments,
        new DefaultContext(),
      );
      return res || "";
    }

    return Promise.all(
      toolsToCall.map((toolCall) => {
        return APIFunction.executeTools(toolCall, toolDefinitions);
      }) || [],
    );
  }

  readonly function: FunctionDefinition;

  constructor(
    func: FunctionDefinition,
    public readonly contextKeys: Set<string>,
    public readonly apiQuery: TApiQuery,
    public readonly apiExecutor: APIQueryExecutor<TApiQuery>,
  ) {
    // function is reserved word and cannot be used inc constructor
    this.function = func;
    const validationResult = apiExecutor.validate(func);
    if (!validationResult.isValid()) {
      throw new Error(
        `Function [${func.name}] invalid for API [${apiExecutor}]: ${validationResult.errorMessage}`,
      );
    }
  }

  getName(): string {
    return this.function.name;
  }

  getModelFunction(): FunctionDefinition {
    const fieldFilter = APIFunction.getFieldFilter(this.contextKeys);

    const newParams: FunctionDefinitionParameters = {
      type: this.function.parameters.type,
      required: this.function.parameters.required?.filter?.(fieldFilter),
      properties: APIFunction.filterObjectKeys(
        fieldFilter,
        this.function.parameters.properties,
      ),
    };

    return {
      name: this.function.name,
      description: this.function.description,
      parameters: newParams,
    };
  }

  validate(argumentsNode: Record<string, unknown>): ValidationResult {
    return this.apiExecutor.validate(this.getModelFunction(), argumentsNode);
  }

  async execute<T extends {}>(
    argumentsNode: Record<string, unknown> = {},
    context: Context<T> = new DefaultContext(),
  ): Promise<string> {
    const variables = addOrOverrideFromContext(
      argumentsNode,
      this.contextKeys,
      context,
    );

    return this.apiExecutor.executeQuery(this.apiQuery, variables);
  }

  async validateAndExecute<T extends {}>(
    argumentsNode: any,
    context: Context<T> = new DefaultContext(),
  ): Promise<string> {
    const validationResult = this.validate(argumentsNode);

    if (validationResult.isValid()) {
      return this.execute(argumentsNode, context);
    }
    return APIFunction.createInvalidCallMessage(
      this.function.name,
      validationResult.errorMessage,
    );
  }

  async validateAndExecuteFromString<T extends {}>(
    argsJson: string,
    context: Context<T>,
  ): Promise<string> {
    try {
      const parsedArguments = JSON.parse(argsJson);
      return this.validateAndExecute(parsedArguments, context);
    } catch (error) {
      return APIFunction.createInvalidCallMessage(
        this.function.name,
        `Malformed JSON: ${typeof error === "object" && error && "message" in error ? error.message : error}`,
      );
    }
  }

  private static getFieldFilter(
    fieldList: Set<string>,
  ): (field: string) => boolean {
    const contextFilter = new Set(
      [...fieldList].map((field) => field.toLowerCase()),
    );
    return (field: string) => !contextFilter.has(field.toLowerCase());
  }

  private static filterObjectKeys<T extends {}>(
    filter: (field: string) => boolean,
    data: T,
  ) {
    const filteredKeys = Object.keys(data).filter(filter);
    const filteredObject = filteredKeys.reduce<T>((acc, fieldKey) => {
      const key = fieldKey as keyof T;
      acc[key] = data[key];
      return acc;
    }, {} as T);
    return filteredObject;
  }

  public toJSON() {
    return {
      function: this.function,
      contextKeys: Array.from(this.contextKeys),
      apiQuery: this.apiQuery,
    };
  }
}
