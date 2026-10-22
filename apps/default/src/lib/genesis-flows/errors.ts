/**
 * Thrown by `runFlow` when the automation started and one of its steps failed.
 * Nothing in the flow after that step ran. `message` reads "The automation
 * failed: <reason>", so a page can show it in a toast as is. `reason` is the
 * step error with links, addresses and keys removed, and never a stack trace.
 *
 * @example
 * ```typescript
 * try {
 *   const { output } = await runFlow(chargeFlowId, { orderId: order.id }, {
 *     idempotencyKey: `charge-${order.id}`,
 *   });
 *   setReceipt(output?.receiptUrl);
 * } catch (err) {
 *   if (err instanceof FlowRunFailedError) {
 *     setError(err.message); // "The automation failed: ..."
 *     return;
 *   }
 *   throw err;
 * }
 * ```
 */
export class FlowRunFailedError extends Error {
  /** The failed step's error, without the "The automation failed:" prefix. */
  readonly reason: string;
  /** The id of the failed run, when the gateway sent it. */
  readonly flowRunId: string | undefined;

  constructor(reason: string, flowRunId?: string, options?: { cause?: unknown }) {
    super(`The automation failed: ${reason}`, options);
    this.name = 'FlowRunFailedError';
    this.reason = reason;
    this.flowRunId = flowRunId;
  }
}
