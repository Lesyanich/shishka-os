import { z } from 'zod'

/**
 * Order + cart shapes shared by apps/web, the cashier surface, and the
 * create-order edge function.
 *
 * MVP: pay at the cashier (no online payment), pickup. Guest checkout — the
 * short order code is the primary handle; name/phone are optional.
 */

export const fulfillmentTypeSchema = z.enum(['pickup', 'dine_in'])
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>

export const orderChannelSchema = z.enum(['own_web', 'own_app'])
export type OrderChannel = z.infer<typeof orderChannelSchema>

export const orderStatusSchema = z.enum([
  'new',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
])
export type OrderStatus = z.infer<typeof orderStatusSchema>

/** Mirrors the payment_status enum in migration 221 (cashier model). */
export const paymentStatusSchema = z.enum(['unpaid', 'paid', 'refunded'])
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

/** One chosen item inside a bundle (a manakish or a sauce). Prices are NOT
 *  trusted from the client — create-order re-reads them and recomputes the
 *  bundle total server-side. See packages/contracts/src/bundles.ts. */
export const bundleChildSchema = z.object({
  nomenclatureId: z.string().uuid(),
  quantity: z.number().int().positive(),
  role: z.enum(['manakish', 'sauce']),
})
export type BundleChild = z.infer<typeof bundleChildSchema>

/** A single line the client wants to order. Price is NOT trusted from the client —
 *  create-order re-reads the authoritative price from nomenclature server-side.
 *
 *  When `bundle` is present, `nomenclatureId` is the bundle dish (SALE-BUNDLE_*)
 *  and `bundle.children` are the chosen manakish + sauces; the server validates
 *  the counts/pools and computes the discounted bundle price. */
export const cartItemSchema = z.object({
  nomenclatureId: z.string().uuid(),
  quantity: z.number().int().positive(),
  /** Selected modifier slugs (MOD-* options). Empty in v1 (ready dishes only). */
  modifierSlugs: z.array(z.string()).default([]),
  /** Present only for bundle lines. */
  bundle: z
    .object({
      children: z.array(bundleChildSchema).min(1),
    })
    .optional(),
})
export type CartItem = z.infer<typeof cartItemSchema>

/** Contact + fulfillment details collected at checkout. Guest checkout:
 *  name/phone optional — the order code is the link to the cashier. */
export const checkoutDetailsSchema = z
  .object({
    customerName: z.string().max(120).nullish(),
    customerPhone: z.string().max(32).nullish(),
    fulfillmentType: fulfillmentTypeSchema.default('pickup'),
    /** Required when fulfillmentType === 'dine_in'. */
    tableNumber: z.string().max(16).nullish(),
    notes: z.string().max(500).nullish(),
  })
  .refine((d) => d.fulfillmentType !== 'dine_in' || !!d.tableNumber, {
    message: 'tableNumber is required for dine-in orders',
    path: ['tableNumber'],
  })
export type CheckoutDetails = z.infer<typeof checkoutDetailsSchema>

/** Request body the client POSTs to the create-order edge function. */
export const createOrderRequestSchema = z.object({
  channel: orderChannelSchema.default('own_web'),
  items: z.array(cartItemSchema).min(1),
  checkout: checkoutDetailsSchema,
})
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>

/** Response from create-order: the persisted order id, the human-friendly code
 *  the customer shows at the cashier, and the server-computed total. */
export const createOrderResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderCode: z.string(),
  totalAmount: z.number(),
  status: orderStatusSchema,
})
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>
