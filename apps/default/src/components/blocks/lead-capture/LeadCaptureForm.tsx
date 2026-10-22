'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { useForm, type DefaultValues, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Field types the form can render. Each maps to a `@/components/ui/*` control and a
 * zod schema fragment. Adding a type means extending both `fieldToControl` and
 * `buildSchema` below - there is no runtime/string-keyed control lookup.
 */
export type LeadFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';

export interface LeadField {
  /** Form value key (also the key in the values object passed to `onSubmit`). */
  name: string;
  label: string;
  type: LeadFieldType;
  required?: boolean;
  placeholder?: string;
  /** Options for `type: 'select'`. */
  options?: { label: string; value: string }[];
}

export type LeadVariant = 'lead' | 'contact' | 'newsletter';

/**
 * One step in the optional multi-step mode. `fields` lists the form value keys
 * (matching `LeadField.name`) rendered on that step, in order. Only the current
 * step's fields are validated before advancing; the final step submits the
 * whole form. See `scoreLead.ts` `REAL_ESTATE_LEAD_STEPS` for the EV-05 config.
 */
export interface LeadFormStep {
  title: string;
  fields: string[];
}

export interface LeadCaptureFormProps {
  /** Selects the default field set when `fields` is not supplied. Default `'lead'`. */
  variant?: LeadVariant;
  /** Explicit field set; overrides the `variant` default entirely. */
  fields?: LeadField[];
  /**
   * OPTIONAL multi-step mode. When provided, the form renders as ordered steps
   * with Back/Next and a token-only progress indicator, validating only the
   * current step's fields (a subset of the existing zod schema) before
   * advancing; the final step submits exactly as the single-page form does.
   *
   * When ABSENT, the form renders identically to its single-page default -
   * the default examples and call shape are unchanged.
   *
   * Steps reference fields by `LeadField.name`. Names not present in the
   * resolved field set are ignored; fields not covered by any step still
   * render on the last step so nothing is silently dropped.
   */
  steps?: LeadFormStep[];
  title?: string;
  description?: string;
  /** Submit button label. Default `'Submit'`. */
  submitLabel?: string;
  /**
   * Host-supplied submit handler - e.g.
   * `(v) => createNode(projectId, { Name: String(v.name ?? ''), Status: 'New' })`.
   * The block awaits this, then shows the inline success state. It NEVER calls the
   * network itself. A rejection keeps the form mounted and surfaces an error message.
   *
   * Persist with `createNode` alone. Handing the same values to `submitForm` as well
   * writes the row twice when the flow behind that form has an Add Task step. Map the
   * value keys onto the project's exact field names rather than forwarding `v` as-is:
   * the gateway matches keys exactly and silently drops unknown ones, so an unmapped
   * forward saves an empty row.
   */
  onSubmit: (values: Record<string, string | boolean>) => void | Promise<void>;
  /** Heading for the inline success (`ThankYou`) state. */
  successTitle?: string;
  successMessage?: string;
  /** Forces the submitting/disabled state from the host (in addition to internal await). */
  submitting?: boolean;
  /** Forces the success state from the host (e.g. after an external mutation resolves). */
  success?: boolean;
  className?: string;
}

export interface ThankYouProps {
  title?: string;
  message?: string;
  /** Optional "submit another" affordance. */
  onReset?: () => void;
}

/**
 * Literal accent classes kept verbatim so the Tailwind JIT content scan (`.tsx`
 * only) emits them even when applied conditionally. Never string-concatenated.
 */
const FORM_ACCENT = {
  success: 'text-primary',
  badge: 'bg-accent text-accent-foreground',
  submit: 'bg-primary text-primary-foreground hover:bg-primary/90',
} as const;

/**
 * Literal step-progress classes (multi-step mode only). Kept verbatim so the
 * Tailwind JIT content scan (`.tsx` only) emits them - a computed `bg-${state}`
 * would resolve to nothing in a built app. All values are semantic tokens.
 */
const STEP_STATE = {
  done: 'bg-primary text-primary-foreground border-primary',
  current: 'bg-primary text-primary-foreground border-primary',
  upcoming: 'bg-muted text-muted-foreground border-border',
} as const;

const STEP_CONNECTOR = {
  done: 'bg-primary',
  upcoming: 'bg-border',
} as const;

/**
 * ICP-grounded default field sets (service-pro / real-estate intake + contact +
 * newsletter consent). Drawn from David Acevedo's service intake and Andrew's
 * verified real-estate buyer funnel - not lorem ipsum.
 */
const SERVICE_PRO_FIELDS: LeadField[] = [
  { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'Jane Smith' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com' },
  { name: 'phone', label: 'Phone', type: 'tel', required: true, placeholder: '(555) 123-4567' },
  {
    name: 'serviceType',
    label: 'Service Needed',
    type: 'select',
    required: true,
    placeholder: 'Choose a service',
    options: [
      { label: 'HVAC', value: 'HVAC' },
      { label: 'Plumbing', value: 'Plumbing' },
      { label: 'Electrical', value: 'Electrical' },
      { label: 'General Repair', value: 'General Repair' },
      { label: 'Maintenance Plan', value: 'Maintenance Plan' },
      { label: 'Other', value: 'Other' },
    ],
  },
  {
    name: 'budget',
    label: 'Estimated Budget',
    type: 'select',
    required: false,
    placeholder: 'Select a range',
    options: [
      { label: 'Under $500', value: 'Under $500' },
      { label: '$500-$2,000', value: '$500-$2,000' },
      { label: '$2,000-$10,000', value: '$2,000-$10,000' },
      { label: '$10,000+', value: '$10,000+' },
      { label: 'Not sure', value: 'Not sure' },
    ],
  },
  {
    name: 'message',
    label: 'Describe the job',
    type: 'textarea',
    required: false,
    placeholder: 'What needs doing?',
  },
];

const CONTACT_FIELDS: LeadField[] = [
  { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'Jane Smith' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com' },
  { name: 'phone', label: 'Phone', type: 'tel', required: false, placeholder: '(555) 123-4567' },
  {
    name: 'message',
    label: 'How can we help?',
    type: 'textarea',
    required: true,
    placeholder: 'Tell us a bit about what you need…',
  },
];

const NEWSLETTER_FIELDS: LeadField[] = [
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com' },
  {
    name: 'consent',
    label: 'I agree to receive occasional updates and tips.',
    type: 'checkbox',
    required: true,
  },
];

const VARIANT_FIELDS: Record<LeadVariant, LeadField[]> = {
  lead: SERVICE_PRO_FIELDS,
  contact: CONTACT_FIELDS,
  newsletter: NEWSLETTER_FIELDS,
};

const VARIANT_DEFAULTS: Record<
  LeadVariant,
  {
    title: string;
    description: string;
    submitLabel: string;
    successTitle: string;
    successMessage: string;
  }
> = {
  lead: {
    title: 'Request a Quote',
    description: "Tell us what you need - we'll get back to you within one business day.",
    submitLabel: 'Get My Quote',
    successTitle: "Thanks - you're all set!",
    successMessage: 'Our team will reach out shortly to confirm the details.',
  },
  contact: {
    title: 'Contact Us',
    description: "Send us a message and we'll reply as soon as we can.",
    submitLabel: 'Send Message',
    successTitle: 'Message sent',
    successMessage: "Thanks for reaching out - we'll be in touch soon.",
  },
  newsletter: {
    title: 'Stay in the loop',
    description: 'Get occasional updates, tips, and offers in your inbox.',
    submitLabel: 'Subscribe',
    successTitle: "You're subscribed",
    successMessage: 'Check your inbox to confirm your subscription.',
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Builds a zod object schema dynamically from the field config. Checkboxes become
 * booleans (a required checkbox must be `true`); every other field is a string with
 * `.min(1)` when required and an email regex for `type: 'email'`.
 */
function buildSchema(fields: LeadField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    if (field.type === 'checkbox') {
      shape[field.name] = field.required
        ? z.boolean().refine((v) => v === true, { message: 'Required' })
        : z.boolean();
      continue;
    }

    let str = z.string();
    if (field.required) {
      str = str.min(1, { message: 'Required' });
    }
    if (field.type === 'email') {
      str = field.required
        ? str.regex(EMAIL_RE, { message: 'Enter a valid email' })
        : str.refine((v) => v === '' || EMAIL_RE.test(v), { message: 'Enter a valid email' });
    }
    shape[field.name] = str;
  }

  return z.object(shape);
}

function defaultValuesFor(fields: LeadField[]): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    values[field.name] = field.type === 'checkbox' ? false : '';
  }
  return values;
}

/**
 * Resolves the `steps` config into concrete `LeadField[]` groups against the
 * actual field set. Unknown step field names are skipped; any resolved fields
 * not referenced by a step are appended to the final step so nothing is
 * silently dropped. Pure - derives only from its inputs.
 */
function resolveSteps(
  fields: LeadField[],
  steps: LeadFormStep[],
): { title: string; fields: LeadField[] }[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const used = new Set<string>();

  const groups = steps.map((step) => {
    const stepFields: LeadField[] = [];
    for (const name of step.fields) {
      const field = byName.get(name);
      if (field && !used.has(name)) {
        used.add(name);
        stepFields.push(field);
      }
    }
    return { title: step.title, fields: stepFields };
  });

  const leftovers = fields.filter((f) => !used.has(f.name));
  if (leftovers.length > 0) {
    if (groups.length === 0) {
      groups.push({ title: '', fields: leftovers });
    } else {
      groups[groups.length - 1].fields.push(...leftovers);
    }
  }

  // Drop any empty steps so the progress indicator never shows a dead step.
  return groups.filter((g) => g.fields.length > 0);
}

/**
 * Inline success surface shown after a resolved submit. A small exported
 * subcomponent so the host can reuse it or render it standalone. The success
 * icon is `text-primary` (token-only) - never a literal palette color.
 */
export function ThankYou({ title, message, onReset }: ThankYouProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle2 className={cn('size-12', FORM_ACCENT.success)} aria-hidden />
      <h3 className="text-foreground text-lg font-semibold">{title ?? 'Thanks!'}</h3>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
      {onReset ? (
        <Button variant="outline" className="mt-2" onClick={onReset}>
          Submit another
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Renders a single field's `FormField`. Shared by BOTH the single-page and
 * multi-step layouts so validation markup exists exactly once. Takes the RHF
 * `control` so either layout can adopt it.
 *
 * Per the shadcn form convention, `FormControl` wraps the focusable control
 * itself. For selects that is the `SelectTrigger` - the Radix `Select` root
 * renders no DOM node, so wrapping the root would silently drop the `id` /
 * `aria-invalid` / `aria-describedby` wiring (and the trigger's invalid ring
 * would never light up). Inputs/textareas pass `rhfField.ref` so RHF focuses
 * the first invalid field on a failed submit.
 */
function LeadFieldControl({
  field,
  control,
}: {
  field: LeadField;
  control: ReturnType<typeof useForm<Record<string, string | boolean>>>['control'];
}) {
  return (
    <FormField
      key={field.name}
      control={control}
      name={field.name}
      render={({ field: rhfField }) =>
        field.type === 'checkbox' ? (
          <FormItem
            data-genesis-field={field.name}
            className="flex flex-row items-start gap-3 space-y-0"
          >
            <FormControl>
              <Checkbox
                checked={rhfField.value === true}
                onCheckedChange={(checked) => rhfField.onChange(checked === true)}
                ref={rhfField.ref}
              />
            </FormControl>
            <div className="grid gap-1.5 leading-none">
              <FormLabel className="text-sm font-normal">
                {field.label}
                {field.required ? <span className="text-destructive"> *</span> : null}
              </FormLabel>
              <FormMessage />
            </div>
          </FormItem>
        ) : (
          <FormItem data-genesis-field={field.name}>
            <FormLabel>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>
            {field.type === 'select' ? (
              <Select value={String(rhfField.value ?? '')} onValueChange={rhfField.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full" onBlur={rhfField.onBlur}>
                    <SelectValue placeholder={field.placeholder ?? 'Select…'} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <FormControl>
                {field.type === 'textarea' ? (
                  <Textarea
                    placeholder={field.placeholder}
                    value={String(rhfField.value ?? '')}
                    onChange={rhfField.onChange}
                    onBlur={rhfField.onBlur}
                    name={rhfField.name}
                    ref={rhfField.ref}
                  />
                ) : (
                  <Input
                    type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                    inputMode={field.type === 'tel' ? 'tel' : undefined}
                    placeholder={field.placeholder}
                    value={String(rhfField.value ?? '')}
                    onChange={rhfField.onChange}
                    onBlur={rhfField.onBlur}
                    name={rhfField.name}
                    ref={rhfField.ref}
                  />
                )}
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )
      }
    />
  );
}

/**
 * Token-only step progress indicator (multi-step mode only). Numbered circles
 * with connectors; colors come from the literal `STEP_STATE` / `STEP_CONNECTOR`
 * Records so the JIT scan emits them. Purely presentational.
 */
function StepProgress({
  steps,
  current,
}: {
  steps: { title: string; fields: LeadField[] }[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2" aria-label="Form progress">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        const isLast = index === steps.length - 1;
        return (
          <li key={step.title || index} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                STEP_STATE[state],
              )}
              aria-current={index === current ? 'step' : undefined}
            >
              {index + 1}
            </span>
            {step.title ? (
              <span
                className={cn(
                  'truncate text-sm',
                  index === current ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {step.title}
              </span>
            ) : null}
            {!isLast ? (
              <span
                aria-hidden
                className={cn('h-px flex-1', STEP_CONNECTOR[index < current ? 'done' : 'upcoming'])}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Presentational lead-capture form. It does NOT fetch, persist, or score -
 * the HOST owns all of that and passes `onSubmit`.
 *
 * Single-page by default. Pass the optional `steps` prop to render the EV-05
 * multi-step funnel (Back/Next + token-only progress); when `steps` is absent
 * the form is byte-identical to its single-page form.
 *
 * Scoring is a separate pure helper - see `./scoreLead`. The host calls
 * `scoreLead` inside its `onSubmit` and maps the result onto a leads list /
 * `RecordsTable` row:
 *
 * @example
 * import {
 *   scoreLead,
 *   REAL_ESTATE_LEAD_RULES,
 *   REAL_ESTATE_LEAD_FIELDS,
 *   REAL_ESTATE_LEAD_STEPS,
 * } from './scoreLead';
 *
 * function handleSubmit(values: Record<string, string | boolean>) {
 *   const { bucket, score } = scoreLead(values, REAL_ESTATE_LEAD_RULES);
 *   return saveLead({
 *     id: crypto.randomUUID(),
 *     name: String(values.name ?? ''),
 *     email: String(values.email ?? ''),
 *     score,            // numeric column
 *     status: bucket,   // Hot | Warm | Cold
 *   });
 * }
 *
 * <LeadCaptureForm
 *   fields={[...REAL_ESTATE_LEAD_FIELDS]}
 *   steps={REAL_ESTATE_LEAD_STEPS}
 *   onSubmit={handleSubmit}
 * />
 *
 * // Render the saved rows; map bucket -> RecordsTable StatusBucket:
 * <RecordsTable
 *   rows={leads}
 *   statusField="status"
 *   statusColors={{ Hot: 'danger', Warm: 'warning', Cold: 'neutral' }}
 *   columns={[ ... ]}
 * />
 *
 * Per-user "my leads" filtering in the UI is DISPLAY ONLY and is NOT access
 * control - real per-user privacy requires gateway row scoping: the owner turns
 * on Private per-user data in the Publish menu, or asks Taskade EVE. Never
 * present client-side filtering as security.
 */
export function LeadCaptureForm({
  variant = 'lead',
  fields,
  steps,
  title,
  description,
  submitLabel,
  onSubmit,
  successTitle,
  successMessage,
  submitting,
  success,
  className,
}: LeadCaptureFormProps) {
  const variantDefaults = VARIANT_DEFAULTS[variant];
  const resolvedFields = React.useMemo(() => fields ?? VARIANT_FIELDS[variant], [fields, variant]);
  const schema = React.useMemo(() => buildSchema(resolvedFields), [resolvedFields]);
  const defaults = React.useMemo(() => defaultValuesFor(resolvedFields), [resolvedFields]);

  const form = useForm<Record<string, string | boolean>>({
    resolver: zodResolver(schema) as Resolver<Record<string, string | boolean>>,
    defaultValues: defaults as DefaultValues<Record<string, string | boolean>>,
    mode: 'onTouched',
  });

  const [submitted, setSubmitted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);

  // Multi-step is active only when a non-empty `steps` prop resolves to >= 2
  // concrete step groups. A single resolved step collapses to single-page so the
  // Back/Next chrome never appears for a degenerate config.
  const stepGroups = React.useMemo(
    () => (steps && steps.length > 0 ? resolveSteps(resolvedFields, steps) : []),
    [resolvedFields, steps],
  );
  const isMultiStep = stepGroups.length > 1;
  const currentStep = Math.min(stepIndex, Math.max(0, stepGroups.length - 1));
  const isLastStep = currentStep >= stepGroups.length - 1;

  const isSubmitting = submitting || form.formState.isSubmitting;
  const isSuccess = success || submitted;

  async function handleSubmit(values: Record<string, string | boolean>) {
    setSubmitError(null);
    try {
      await onSubmit(values);
      setSubmitted(true);
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    }
  }

  function handleReset() {
    form.reset(defaults);
    setSubmitted(false);
    setSubmitError(null);
    setStepIndex(0);
  }

  /**
   * Validates only the current step's fields against the existing zod schema
   * (via RHF's `trigger`, which uses the same resolver) and advances on
   * success. Errors stay visible on the current step; we never jump ahead.
   */
  async function handleNext() {
    const names = stepGroups[currentStep]?.fields.map((f) => f.name) ?? [];
    const valid = await form.trigger(names, { shouldFocus: true });
    if (valid) {
      setSubmitError(null);
      setStepIndex((i) => Math.min(i + 1, stepGroups.length - 1));
    }
  }

  function handleBack() {
    setSubmitError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <Card
      data-genesis-block="lead-capture-form"
      className={cn('bg-card text-card-foreground', className)}
    >
      <CardHeader>
        <CardTitle>{title ?? variantDefaults.title}</CardTitle>
        <CardDescription>{description ?? variantDefaults.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isSuccess ? (
          <ThankYou
            title={successTitle ?? variantDefaults.successTitle}
            message={successMessage ?? variantDefaults.successMessage}
            onReset={handleReset}
          />
        ) : isMultiStep ? (
          <Form {...form}>
            <form
              data-genesis-form
              className="grid gap-4"
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
            >
              <StepProgress steps={stepGroups} current={currentStep} />

              {stepGroups[currentStep].fields.map((field) => (
                <LeadFieldControl key={field.name} field={field} control={form.control} />
              ))}

              {submitError ? (
                <p role="alert" className="text-destructive text-sm">
                  {submitError}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  data-genesis-back
                  onClick={handleBack}
                  disabled={currentStep === 0 || isSubmitting}
                >
                  Back
                </Button>
                {isLastStep ? (
                  <Button type="submit" data-genesis-submit disabled={isSubmitting}>
                    {isSubmitting ? <Spinner className="mr-2" /> : null}
                    {submitLabel ?? variantDefaults.submitLabel}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    data-genesis-next
                    onClick={handleNext}
                    disabled={isSubmitting}
                  >
                    Next
                  </Button>
                )}
              </div>
            </form>
          </Form>
        ) : (
          <Form {...form}>
            <form
              data-genesis-form
              className="grid gap-4"
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
            >
              {resolvedFields.map((field) => (
                <LeadFieldControl key={field.name} field={field} control={form.control} />
              ))}

              {submitError ? (
                <p role="alert" className="text-destructive text-sm">
                  {submitError}
                </p>
              ) : null}

              <Button type="submit" data-genesis-submit disabled={isSubmitting} className="w-full">
                {isSubmitting ? <Spinner className="mr-2" /> : null}
                {submitLabel ?? variantDefaults.submitLabel}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
