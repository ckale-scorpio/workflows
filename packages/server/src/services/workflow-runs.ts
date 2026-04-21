import { type WorkflowRun, WorkflowRunSchema, type WorkflowRunStatus } from '@app/db';
import type { ServerContext } from '../context';

export interface RecordWorkflowRunInput {
  inngestRunId: string;
  workflowName: string;
  subjectType?: string | null;
  subjectId?: string | null;
}

export async function recordWorkflowRun(
  ctx: ServerContext,
  input: RecordWorkflowRunInput,
): Promise<WorkflowRun> {
  return ctx.em.create(WorkflowRunSchema, {
    inngestRunId: input.inngestRunId,
    workflowName: input.workflowName,
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId ?? null,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    output: null,
  });
}

export interface UpdateWorkflowRunInput {
  status?: WorkflowRunStatus;
  completedAt?: Date | null;
  output?: Record<string, unknown> | null;
}

export async function updateWorkflowRun(
  ctx: ServerContext,
  id: string,
  patch: UpdateWorkflowRunInput,
): Promise<void> {
  const run = await ctx.em.findOneOrFail(WorkflowRunSchema, { id });
  ctx.em.assign(run, patch);
}
