import { functions, inngest } from '@app/workflows';
import { serve } from 'inngest/next';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
