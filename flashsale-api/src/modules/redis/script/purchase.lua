-- Redis Lua Script for Atomic Purchase Operation
-- This script ensures atomic stock decrement and user idempotency check
-- 
-- KEYS[1]: sale:{saleId}:stock (stock counter)
-- KEYS[2]: sale:{saleId}:users (set of users who purchased)
-- ARGV[1]: userId (user attempting purchase)
--
-- Returns:
--   0 = SOLD_OUT (stock exhausted)
--   1 = SUCCESS (purchase reserved)
--   2 = ALREADY_PURCHASED (user already bought)

local stockKey = KEYS[1]
local usersKey = KEYS[2]
local userId = ARGV[1]

-- Check if user already purchased (idempotency)
local alreadyPurchased = redis.call('SISMEMBER', usersKey, userId)
if alreadyPurchased == 1 then
    return 2  -- ALREADY_PURCHASED
end

-- Get current stock
local stock = redis.call('GET', stockKey)

-- If stock key doesn't exist or is nil, treat as 0
if not stock then
    return 0  -- SOLD_OUT
end

-- Convert to number
stock = tonumber(stock)

-- Check if stock is available
if stock <= 0 then
    return 0  -- SOLD_OUT
end

-- Atomically decrement stock and add user
redis.call('DECR', stockKey)
redis.call('SADD', usersKey, userId)

return 1  -- SUCCESS
