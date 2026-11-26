CREATE TABLE IF NOT EXISTS project_sprints (
    sprint_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    start_date DATE,
    due_date DATE,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(attachments) = 'array'),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(details) = 'object'),
    created_by_firebase_uid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_project_sprints_project_created
    ON project_sprints (project_id, created_at, sprint_id);

INSERT INTO project_sprints (
    sprint_id,
    project_id,
    name,
    description,
    status,
    start_date,
    due_date,
    attachments,
    details,
    created_by_firebase_uid
)
SELECT
    md5(project.project_id || ':' || COALESCE(
        NULLIF(sprint.value->>'id', ''),
        NULLIF(sprint.value->>'name', ''),
        ''
    ) || ':' || sprint.ordinality::text)::uuid,
    project.project_id,
    left(btrim(sprint.value->>'name'), 255),
    COALESCE(sprint.value->>'description', ''),
    COALESCE(NULLIF(sprint.value->>'status', ''), 'Active'),
    CASE
        WHEN sprint.value->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'startDate')::date
        WHEN sprint.value->>'start_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'start_date')::date
        ELSE NULL
    END,
    CASE
        WHEN sprint.value->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'dueDate')::date
        WHEN sprint.value->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'due_date')::date
        WHEN sprint.value->>'endDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'endDate')::date
        WHEN sprint.value->>'end_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'end_date')::date
        ELSE NULL
    END,
    CASE
        WHEN jsonb_typeof(sprint.value->'attachments') = 'array'
            THEN sprint.value->'attachments'
        ELSE '[]'::jsonb
    END,
    sprint.value,
    project.creator_firebase_uid
FROM projects AS project
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(project.sprints) = 'array' THEN project.sprints
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS sprint(value, ordinality)
WHERE NULLIF(btrim(sprint.value->>'name'), '') IS NOT NULL
ON CONFLICT (sprint_id) DO NOTHING;

UPDATE projects
SET sprints = '[]'::jsonb
WHERE jsonb_typeof(sprints) = 'array'
  AND jsonb_array_length(sprints) > 0;
