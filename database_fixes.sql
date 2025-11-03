-- GrandLink Database Verification and Fix Script
-- Run this in your Supabase SQL Editor to verify and fix any issues

-- ==========================================
-- 1. CHECK CURRENT STATE OF USER_ITEMS
-- ==========================================

-- View all cart items that might be stuck
SELECT 
    id,
    user_id,
    product_id,
    item_type,
    status,
    payment_status,
    payment_method,
    quantity,
    price,
    total_amount,
    total_paid,
    created_at,
    updated_at,
    meta->>'payment_confirmed_at' as payment_confirmed_at,
    meta->>'payment_type' as payment_type
FROM user_items
WHERE item_type = 'cart' OR (item_type = 'reservation' AND payment_status = 'completed')
ORDER BY updated_at DESC
LIMIT 50;

-- ==========================================
-- 2. FIX ANY STUCK CART ITEMS (if needed)
-- ==========================================

-- If you have cart items that were paid but not converted to reservations,
-- run this to manually convert them (uncomment to use):

/*
UPDATE user_items
SET 
    item_type = 'reservation',
    status = 'pending_payment',
    order_status = 'pending_payment',
    updated_at = NOW()
WHERE 
    item_type = 'cart' 
    AND payment_status = 'completed'
    AND meta->>'payment_confirmed_at' IS NOT NULL;
*/

-- ==========================================
-- 3. VERIFY WEBHOOK UPDATES ARE WORKING
-- ==========================================

-- Check recent reservations (last 24 hours)
SELECT 
    id,
    user_id,
    item_type,
    status,
    payment_status,
    payment_method,
    total_paid,
    created_at,
    updated_at,
    meta->>'payment_confirmed_at' as payment_confirmed_at
FROM user_items
WHERE 
    item_type = 'reservation'
    AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;

-- ==========================================
-- 4. CHECK INVENTORY DEDUCTIONS
-- ==========================================

-- View recent inventory changes (check if products.inventory is being deducted)
SELECT 
    p.id,
    p.name,
    p.inventory,
    COUNT(ui.id) as reserved_count,
    SUM(ui.quantity) as total_reserved_quantity
FROM products p
LEFT JOIN user_items ui ON ui.product_id = p.id 
    AND ui.item_type = 'reservation' 
    AND ui.status IN ('pending_payment', 'reserved')
    AND ui.updated_at > NOW() - INTERVAL '7 days'
GROUP BY p.id, p.name, p.inventory
HAVING COUNT(ui.id) > 0
ORDER BY total_reserved_quantity DESC;

-- ==========================================
-- 5. VERIFY CART CLEARING IS WORKING
-- ==========================================

-- Check if users still have cart items after successful payment
SELECT 
    u.email,
    ui.id as cart_item_id,
    ui.product_id,
    ui.quantity,
    ui.created_at,
    ui.payment_status,
    ui.meta->>'payment_confirmed_at' as payment_confirmed_at
FROM user_items ui
JOIN auth.users u ON u.id = ui.user_id
WHERE 
    ui.item_type = 'cart'
    AND ui.payment_status = 'completed'
ORDER BY ui.updated_at DESC;

-- ==========================================
-- 6. DATA QUALITY CHECKS
-- ==========================================

-- Check for any reservations missing required fields
SELECT 
    id,
    user_id,
    item_type,
    status,
    payment_status,
    CASE 
        WHEN price IS NULL THEN 'Missing price'
        WHEN total_amount IS NULL THEN 'Missing total_amount'
        WHEN total_paid IS NULL THEN 'Missing total_paid'
        WHEN payment_method IS NULL AND payment_status = 'completed' THEN 'Missing payment_method'
        ELSE 'OK'
    END as data_issue
FROM user_items
WHERE item_type = 'reservation'
    AND status IN ('pending_payment', 'reserved')
    AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;

-- ==========================================
-- 7. SUMMARY STATISTICS
-- ==========================================

-- Get overview of order statuses
SELECT 
    item_type,
    status,
    payment_status,
    COUNT(*) as count,
    SUM(total_paid) as total_revenue
FROM user_items
WHERE updated_at > NOW() - INTERVAL '30 days'
GROUP BY item_type, status, payment_status
ORDER BY item_type, status;

-- ==========================================
-- NOTES FOR TROUBLESHOOTING:
-- ==========================================

/*
Expected Flow After Payment:
1. User pays via PayMongo/PayPal
2. Webhook receives payment confirmation
3. Items updated:
   - item_type: 'cart' → 'reservation'
   - status: 'active' → 'pending_payment'
   - payment_status: 'pending' → 'completed'
   - payment_method: set to 'paymongo' or 'paypal'
   - total_paid: set to amount paid
   - total_amount: set to line total
   - meta: updated with payment details
4. Cart items cleared (deleted)
5. Inventory deducted from products table

If items are stuck:
- Check webhook logs in Vercel/hosting platform
- Verify SUPABASE_SERVICE_ROLE_KEY is set correctly
- Ensure webhooks are registered with PayMongo/PayPal
- Check that success_url redirects properly
*/
