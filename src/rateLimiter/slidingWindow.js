-- KEYS[1] = Redis key
-- ARGV[1] = current timestamp (ms)
-- ARGV[2] = window size (ms)
-- ARGV[3] = limit

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove expired entries
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)

local count = redis.call("ZCARD", key)

if count >= limit then
    return {0, limit - count}
end

-- Unique member to avoid collision
local member = ARGV[1] .. "-" .. redis.call("INCR", key .. ":seq")

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window)

local newCount = redis.call("ZCARD", key)
return {1, limit - newCount}
