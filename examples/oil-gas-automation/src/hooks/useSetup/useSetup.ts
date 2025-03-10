import { useEffect, useMemo, useState } from 'react';
import OpenAI from 'openai';
import {
  APIFunction,
  ApiQuery,
  createToolsFromApiUri,
} from '@datasqrl/acorn-node';
import { gql, useSubscription } from '@apollo/client';
import { UseSetupResult } from './types.ts';

export default function useSetup(): UseSetupResult {
  const openAI = useMemo(() => new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  }), []);

  const [apiTools, setApiTools] = useState<APIFunction<ApiQuery>[]>();

  useEffect(() => {
    let active = true;

    void load();

    return () => {
      active = false;
    };

    async function load() {
      const result = await createToolsFromApiUri({
        graphqlUri: import.meta.env.VITE_API_URL,
        enableValidation: true,
      });

      if (!active) {
        return;
      }

      setApiTools(result);
    }
  }, []);

  const { data } = useSubscription(gql`
    subscription {
      LowFlowRate {
        assetId
        flowrate
        asset_number
        asset_name
        description
      }
    }
  `);

  return { openAI, apiTools, data };
}
