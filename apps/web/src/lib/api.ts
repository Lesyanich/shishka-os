import { supabase } from './supabase.ts'
import {
  createOrderResponseSchema,
  type CreateOrderRequest,
  type CreateOrderResponse,
} from '@shishka/contracts'

/** Place an order via the create-order edge function (server validates prices). */
export async function createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
  const { data, error } = await supabase.functions.invoke('create-order', { body: req })
  if (error) throw new Error(error.message)
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error))
  }
  // Validate the shape we got back against the shared contract.
  return createOrderResponseSchema.parse(data)
}
