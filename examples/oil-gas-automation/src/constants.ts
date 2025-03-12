import OpenAI from 'openai';

export const ACTION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Action',
    description: 'Takes necessary action',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'shut_off',
            'hot_wax_treatment',
            'full_inspection',
            'ignore',
          ],
          description: 'Type of action to take',
        },
        description: {
          type: 'string',
          description: 'Explanation of why this action should be taken',
        },
      },
      required: ['type', 'description'],
      additionalProperties: false,
    },
    strict: true,
  },
};
