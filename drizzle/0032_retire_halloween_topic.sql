UPDATE events SET category = 'uncategorized', revision = revision + 1
WHERE category = 'halloween';
--> statement-breakpoint
UPDATE user_profiles
SET interests = (
  SELECT json_group_array(value)
  FROM (SELECT value FROM json_each(user_profiles.interests) WHERE value <> 'halloween' ORDER BY key)
)
WHERE CASE WHEN json_valid(interests) THEN
  json_type(interests) = 'array' AND EXISTS (SELECT 1 FROM json_each(interests) WHERE value = 'halloween')
END;
