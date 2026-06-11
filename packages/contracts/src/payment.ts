import { z } from 'zod'

/**
 * Provider-agnostic payment layer. The concrete provider (Omise/Opn, Stripe, 2C2P)
 * is not chosen yet, so everything is expressed behind this interface and only ever
 * runs inside Supabase edge functions — provider secret keys never reach the client.
 *
 * PromptPay QR is a first-class output because it is the dominant payment method in
 * Thailand; both Omise and Stripe can produce it.
 */

export const paymentMethodSchema = z.enum(['card', 'promptpay', 'internet_banking', 'truemoney'])
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

/** Normalized charge status across providers. */
export const chargeStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded', 'expired'])
export type ChargeStatus = z.infer<typeof chargeStatusSchema>

export const createChargeInputSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.literal('THB').default('THB'),
  method: paymentMethodSchema,
  /** Where the provider should send the customer back after a hosted flow. */
  returnUrl: z.string().url().nullish(),
})
export type CreateChargeInput = z.infer<typeof createChargeInputSchema>

export const createChargeResultSchema = z.object({
  chargeId: z.string(),
  status: chargeStatusSchema,
  redirectUrl: z.string().url().nullish(),
  promptPayQr: z.string().nullish(),
})
export type CreateChargeResult = z.infer<typeof createChargeResultSchema>

export const webhookResultSchema = z.object({
  chargeId: z.string(),
  status: chargeStatusSchema,
})
export type WebhookResult = z.infer<typeof webhookResultSchema>

/**
 * Implemented once per provider inside services/supabase/functions.
 * `verifyWebhook` MUST validate the provider signature before trusting the payload.
 */
export interface PaymentProvider {
  readonly name: string
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>
}
