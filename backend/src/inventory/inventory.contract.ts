export interface InventoryProduct {
  product_id: string;
  sku: string | null;
  product_name: string | null;
  category: string | null;
  unit_of_measure: string | null;
  location_id: string | null;
  quantity_on_hand: number | null;
  reserved_quantity: number | null;
  available_quantity: number | null;
  reorder_point: number | null;
  is_active: boolean | null;
  last_inventory_update: string | null;
}
export interface InventoryPage {
  response_timestamp: string;
  products: InventoryProduct[];
  batches: [];
  batches_supported: false;
  pagination: { limit: number; has_more: boolean; next_after: string | null };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isInventoryId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);
function timestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Invalid PetHub inventory timestamp.');
  return new Date(value).toISOString();
}
function text(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2000)
    throw new Error('Invalid PetHub product field.');
  return value;
}
function quantity(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid PetHub stock quantity.');
  return value;
}
export function parseInventoryPage(
  value: unknown,
  after?: string,
): InventoryPage {
  const body = value as InventoryPage;
  if (
    !body ||
    !Array.isArray(body.products) ||
    body.products.length > 200 ||
    body.batches_supported !== false ||
    !Array.isArray(body.batches) ||
    body.batches.length
  )
    throw new Error('Unsupported PetHub inventory response.');
  const pagination = body.pagination;
  if (
    !pagination ||
    !Number.isInteger(pagination.limit) ||
    pagination.limit < 1 ||
    pagination.limit > 200 ||
    typeof pagination.has_more !== 'boolean' ||
    (pagination.next_after !== null && !isInventoryId(pagination.next_after))
  )
    throw new Error('Invalid PetHub inventory pagination.');
  if (body.products.length > pagination.limit)
    throw new Error('PetHub inventory page exceeds its limit.');
  let previous = after?.toLowerCase() || '';
  const products = body.products.map((row) => {
    if (!row || !isInventoryId(row.product_id))
      throw new Error('Missing stable PetHub product identity.');
    const id = row.product_id.toLowerCase();
    if (id <= previous)
      throw new Error('PetHub inventory cursor is not strictly increasing.');
    previous = id;
    if (row.is_active !== null && typeof row.is_active !== 'boolean')
      throw new Error('Invalid PetHub product active status.');
    return {
      product_id: id,
      sku: text(row.sku),
      product_name: text(row.product_name),
      category: text(row.category),
      unit_of_measure: text(row.unit_of_measure),
      location_id: text(row.location_id),
      quantity_on_hand: quantity(row.quantity_on_hand),
      reserved_quantity: quantity(row.reserved_quantity),
      // Authoritative stored stock: do not subtract reservations again.
      available_quantity: quantity(row.available_quantity),
      reorder_point: quantity(row.reorder_point),
      is_active: row.is_active,
      last_inventory_update: timestamp(row.last_inventory_update, true),
    };
  });
  if (
    pagination.has_more &&
    (!products.length || pagination.next_after?.toLowerCase() !== previous)
  )
    throw new Error(
      'PetHub pagination cursor does not match its final product.',
    );
  if (!pagination.has_more && pagination.next_after !== null)
    throw new Error('Unexpected final-page inventory cursor.');
  return {
    response_timestamp: timestamp(body.response_timestamp)!,
    products,
    batches: [],
    batches_supported: false,
    pagination: {
      ...pagination,
      next_after: pagination.next_after?.toLowerCase() || null,
    },
  };
}
