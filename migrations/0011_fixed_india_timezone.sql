-- The account timezone preference has been removed. Keep historical report metadata
-- and observation keys intact, while resetting the obsolete preference for all accounts.
UPDATE tracking.accounts SET timezone = 'Asia/Kolkata' WHERE timezone <> 'Asia/Kolkata';
