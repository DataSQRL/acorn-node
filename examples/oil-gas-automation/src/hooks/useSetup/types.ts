import OpenAI from 'openai';
import { APIFunction, ApiQuery } from '@datasqrl/acorn-node';

export interface UseSetupResult {
  openAI: OpenAI;
  apiTools: APIFunction<ApiQuery>[] | undefined;
  data: { LowFlowRate: { assetId: number } } | null;
}
