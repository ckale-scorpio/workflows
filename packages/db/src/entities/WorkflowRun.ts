import { EntitySchema } from '@mikro-orm/core';

export type WorkflowRunStatus = 'running' | 'succeeded' | 'failed' | 'paused';

export interface WorkflowRun {
  id: string;
  inngestRunId: string;
  workflowName: string;
  subjectType: string | null;
  subjectId: string | null;
  status: WorkflowRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  output: Record<string, unknown> | null;
}

export const WorkflowRunSchema = new EntitySchema<WorkflowRun>({
  name: 'WorkflowRun',
  tableName: 'workflow_runs',
  properties: {
    id: { type: 'uuid', primary: true, defaultRaw: 'gen_random_uuid()' },
    inngestRunId: { type: 'string', fieldName: 'inngest_run_id', unique: true },
    workflowName: { type: 'string', fieldName: 'workflow_name', index: true },
    subjectType: { type: 'string', fieldName: 'subject_type', nullable: true },
    subjectId: { type: 'uuid', fieldName: 'subject_id', nullable: true },
    status: {
      type: 'string',
      enum: true,
      items: () => ['running', 'succeeded', 'failed', 'paused'],
      default: 'running',
    },
    startedAt: { type: Date, fieldName: 'started_at', defaultRaw: 'now()' },
    completedAt: { type: Date, fieldName: 'completed_at', nullable: true },
    output: { type: 'jsonb', nullable: true },
  },
});
