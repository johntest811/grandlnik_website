# Cart Restructuring Implementation Summary

## Overview
Restructured the cart system to use a separate `cart` table in Supabase instead of storing temporary cart items in `user_items`. After successful payment, cart items are converted to reservations in `user_items`.

## Changes Made

### 1. Database Schema
**File:** `cart_table_schema.sql`

Created a new `cart` table with:
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to auth.users)
- `product_id` (UUID, foreign key to products)
- `quantity` (integer)
- `meta` (jsonb for storing metadata)
- `created_at`, `updated_at` (timestamps)
- Unique constraint on `user_id + product_id` (prevents duplicate products per user)
- Row Level Security (RLS) policies
- Automatic `updated_at` trigger

**Action Required:** Run this SQL in your Supabase SQL Editor to create the table.

### 2. Cart API Routes
**File:** `src/app/api/cart-new/route.ts`

New REST API for cart operations:
- `GET` - Fetch user's cart items
- `POST` - Add item to cart (or update quantity if exists)
- `PATCH` - Update cart item (quantity, metadata)
- `DELETE` - Remove item from cart

### 3. Cart Page Updates
**File:** `src/app/profile/cart/page.tsx`

- Changed from `user_items` table to `cart` table
- Updated `loadCart()` to query `cart` table
- Updated `updateQuantity()`, `removeItem()`, `clearCart()` to use Supabase directly

### 4. Checkout Page Updates  
**File:** `src/app/profile/cart/checkout/page.tsx`

- Changed to load items from `cart` table
- Updated metadata storage to use `cart` table
- Changed payment session request to include `cart_item_ids` and `payment_type: 'cart_checkout'`

### 5. Payment Session API Updates
**File:** `src/app/api/create-payment-session/route.ts`

- Added support for `cart_checkout` payment type
- Handles both `cart_item_ids` (new flow) and `user_item_ids` (existing reservation flow)
- Loads data from appropriate table based on payment type
- Updates metadata in correct table (cart vs user_items)
- Adds `is_cart_checkout` and `cart_item_ids` to payment metadata

### 6. PayMongo Webhook Updates
**File:** `src/app/api/webhooks/paymongo/route_new.ts` (needs to replace route.ts)

Complete rewrite with two flow paths:

**Cart Checkout Flow (`is_cart_checkout === true`):**
1. Reads items from `cart` table
2. Creates NEW rows in `user_items` with:
   - `item_type = 'reservation'`
   - `status = 'pending_payment'`
   - `payment_status = 'completed'`
   - All metadata from cart
3. Deducts inventory from products
4. **Deletes processed items from cart table**
5. Sends admin notification

**Direct Reservation Flow:**
1. Updates existing rows in `user_items`
2. Sets `status = 'pending_payment'`
3. Deducts inventory
4. Sends admin notification

### 7. PayPal Webhook Updates (TODO)
**File:** `src/app/api/webhooks/paypal/route.ts`

Needs similar updates as PayMongo webhook to:
- Detect `is_cart_checkout` from metadata
- Create user_items from cart table
- Delete cart items after successful payment

### 8. Product Details Page Updates (TODO)
**Files:** 
- `src/app/Product/details/page.tsx`
- Other pages that add to cart

Need to update "Add to Cart" functionality to use new `cart` table instead of `user_items`.

## Flow Diagram

### Old Flow:
```
Product → Add to Cart → user_items (item_type='cart')
                    ↓
              Checkout → Payment
                    ↓
              Webhook → Updates same row (item_type='reservation')
```

### New Flow:
```
Product → Add to Cart → cart table
                    ↓
              Checkout → Payment
                    ↓
              Webhook → Creates NEW row in user_items (item_type='reservation')
                       + Deletes from cart table
```

## Benefits

1. **Cleaner Data Model:** Cart items are separate from orders/reservations
2. **No Status Confusion:** Cart items don't have statuses; only reservations do
3. **Easier Cart Management:** Can clear/modify cart without affecting order history
4. **Better Success Page:** Loads from `user_items` with `item_type='reservation'` after payment
5. **Proper Item Tracking:** Each successful payment creates a distinct reservation record

## Testing Checklist

- [ ] Run `cart_table_schema.sql` in Supabase
- [ ] Replace old PayMongo webhook with new version
- [ ] Update PayPal webhook similarly
- [ ] Test adding items to cart
- [ ] Test updating cart quantities
- [ ] Test removing cart items
- [ ] Test cart checkout with PayMongo
- [ ] Test cart checkout with PayPal
- [ ] Verify cart is cleared after payment
- [ ] Verify items appear in reserve page after payment
- [ ] Verify success/receipt page shows correct data
- [ ] Verify inventory is deducted
- [ ] Test direct reservation flow (Reserve Now button)

## Next Steps

1. **Run the SQL schema** to create the cart table
2. **Replace the PayMongo webhook:**
   ```powershell
   cd c:\Users\Ezra\Music\GrandLink\website\grandlink_website\src\app\api\webhooks\paymongo
   del route.ts
   ren route_new.ts route.ts
   ```
3. **Update PayPal webhook** with similar logic
4. **Update Product Details** "Add to Cart" to use cart table
5. **Test thoroughly** with sandbox payments

## Important Notes

- The `cart` table has a **unique constraint** on `(user_id, product_id)`, so adding the same product again will update the quantity
- Cart items are **automatically deleted** when payment is successful
- The success page now loads from `user_items` where `item_type='reservation'` (created by webhook)
- All existing reservation flows continue to work unchanged

