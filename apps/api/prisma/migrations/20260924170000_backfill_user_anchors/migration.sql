INSERT INTO "UserAnchor" ("id", "userId", "type", "tripId", "occurredAt")
SELECT 'legacy_' || md5("User"."id" || ':' || anchor."type"), "User"."id", anchor."type", NULL, "User"."createdAt"
FROM "User"
CROSS JOIN (VALUES ('FIRST_USED'), ('FIRST_LOGIN')) AS anchor("type")
ON CONFLICT ("userId", "type") DO NOTHING;

WITH first_trip AS (
    SELECT DISTINCT ON ("userId") "userId", "id", "createdAt"
    FROM "Trip"
    ORDER BY "userId", "createdAt", "id"
)
INSERT INTO "UserAnchor" ("id", "userId", "type", "tripId", "occurredAt")
SELECT 'legacy_' || md5("userId" || ':FIRST_TRIP_CREATED'), "userId", 'FIRST_TRIP_CREATED', "id", "createdAt"
FROM first_trip
ON CONFLICT ("userId", "type") DO NOTHING;

WITH team_events AS (
    SELECT member."userId", member."tripId", member."createdAt" AS "occurredAt"
    FROM "TripMember" AS member
    WHERE member."role" = 'MEMBER'
    UNION ALL
    SELECT owner."userId", member."tripId", member."createdAt" AS "occurredAt"
    FROM "TripMember" AS owner
    JOIN "TripMember" AS member ON member."tripId" = owner."tripId"
    WHERE owner."role" = 'OWNER' AND member."role" = 'MEMBER'
), first_team_event AS (
    SELECT DISTINCT ON ("userId") "userId", "tripId", "occurredAt"
    FROM team_events
    ORDER BY "userId", "occurredAt", "tripId"
)
INSERT INTO "UserAnchor" ("id", "userId", "type", "tripId", "occurredAt")
SELECT 'legacy_' || md5("userId" || ':FIRST_TEAMED_UP'), "userId", 'FIRST_TEAMED_UP', "tripId", "occurredAt"
FROM first_team_event
ON CONFLICT ("userId", "type") DO NOTHING;
