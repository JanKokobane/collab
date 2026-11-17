ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS due_date DATE;

WITH extracted_dates AS (
    SELECT
        project_id,
        regexp_match(
            time_span,
            '\(about [^;]+; ([A-Za-z]{3} [0-9]{1,2}, [0-9]{4}) – ([A-Za-z]{3} [0-9]{1,2}, [0-9]{4})\)'
        ) AS dates
    FROM projects
    WHERE start_date IS NULL
      AND due_date IS NULL
)
UPDATE projects
SET start_date = to_date(extracted_dates.dates[1], 'Mon DD, YYYY'),
    due_date = to_date(extracted_dates.dates[2], 'Mon DD, YYYY')
FROM extracted_dates
WHERE extracted_dates.project_id = projects.project_id
  AND extracted_dates.dates IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_timeline_dates_ordered'
          AND conrelid = 'projects'::regclass
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_timeline_dates_ordered
                CHECK (
                    (start_date IS NULL AND due_date IS NULL) OR
                    (start_date IS NOT NULL AND due_date IS NOT NULL AND due_date >= start_date)
                );
    END IF;
END
$$;
