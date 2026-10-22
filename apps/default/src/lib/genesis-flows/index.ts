/**
 * Genesis Flows SDK
 *
 * Trigger Taskade automations from a Genesis app - fire a form/webhook/manual flow for a
 * side effect the app cannot do itself. No iframe, no widget.
 *
 * An intake form does NOT save its row here: use `createNode` from `@/lib/genesis-data`,
 * and never call both for one submit (that writes the row twice).
 *
 * @example
 * ```typescript
 * import { submitForm, runFlow, FlowRunFailedError } from '@/lib/genesis-flows';
 *
 * // Fire an automation now -> WEBHOOK/MANUAL-trigger flow. `output` is the body of
 * // the flow's "HTTP response" step. A key built from the order makes a double click
 * // or a retry run the refund once.
 * const { output } = await runFlow(refundFlowId, { orderId, amount }, {
 *   idempotencyKey: `refund-${orderId}`,
 * });
 * // A failed run throws FlowRunFailedError ("The automation failed: <reason>").
 *
 * // Upload a document/photo for the flow to read: pass the raw File (NOT a base64
 * // data: URL). It becomes a https://files.taskade.com URL a `Convert File to Text`
 * // step can OCR.
 * await submitForm(processDocFlowId, { file, title: file.name });
 *
 * // Read recent runs (id, status, timestamps) for a status widget. Always through
 * // this typed helper, never a hand-built gateway URL.
 * const { runs } = await getFlowRuns(syncFlowId, { limit: 1 });
 * ```
 */
export { submitForm, runFlow, getFlowRuns } from './client';
export { FlowRunFailedError } from './errors';
export type {
  FlowOutput,
  FlowRunOptions,
  FlowRunStatus,
  FlowRunSummary,
  FlowRunsPage,
} from './client';
export type { ClientOptions } from '../genesis-gateway';
