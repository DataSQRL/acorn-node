export class GraphQLSchemaConverterConfig {
  static readonly DEFAULT = new GraphQLSchemaConverterConfig();

  constructor(
    public operationFilter: (operation: string, name: string) => boolean = () =>
      true,
    public maxDepth: number = 3
  ) {}

  static ignorePrefix<TOperation = string>(...prefixes: string[]) {
    const prefixesLower = prefixes.map((prefix) => prefix.trim().toLowerCase());
    return (_operation: TOperation, name: string) =>
      !prefixesLower.some((prefixLower) =>
        name.trim().toLowerCase().startsWith(prefixLower)
      );
  }
}
