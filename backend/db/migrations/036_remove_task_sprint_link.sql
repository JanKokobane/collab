ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS sprint_name;

DO $$
DECLARE
    column_migration RECORD;
    old_column_exists BOOLEAN;
    new_column_exists BOOLEAN;
BEGIN
    FOR column_migration IN
        SELECT *
        FROM (VALUES
            (
                'sprint_submission_status',
                'task_submission_status',
                'TEXT NOT NULL DEFAULT ''Not submitted'''
            ),
            (
                'sprint_submission_note',
                'task_submission_note',
                'TEXT NOT NULL DEFAULT '''''
            ),
            (
                'sprint_submission_attachments',
                'task_submission_attachments',
                'JSONB NOT NULL DEFAULT ''[]''::jsonb'
            ),
            (
                'sprint_submission_links',
                'task_submission_links',
                'JSONB NOT NULL DEFAULT ''[]''::jsonb'
            ),
            (
                'sprint_submitted_by_firebase_uid',
                'task_submitted_by_firebase_uid',
                'TEXT'
            ),
            (
                'sprint_submitted_at',
                'task_submitted_at',
                'TIMESTAMPTZ'
            ),
            (
                'sprint_review_comment',
                'task_review_comment',
                'TEXT NOT NULL DEFAULT '''''
            ),
            (
                'sprint_reviewed_by_firebase_uid',
                'task_reviewed_by_firebase_uid',
                'TEXT'
            ),
            (
                'sprint_reviewed_at',
                'task_reviewed_at',
                'TIMESTAMPTZ'
            )
        ) AS columns_to_migrate(old_name, new_name, definition)
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'project_tasks'
              AND column_name = column_migration.old_name
        ) INTO old_column_exists;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'project_tasks'
              AND column_name = column_migration.new_name
        ) INTO new_column_exists;

        IF old_column_exists AND new_column_exists THEN
            RAISE EXCEPTION
                'Both project_tasks columns "%" and "%" exist; resolve their data before retrying migration 036',
                column_migration.old_name,
                column_migration.new_name;
        ELSIF old_column_exists THEN
            EXECUTE format(
                'ALTER TABLE project_tasks RENAME COLUMN %I TO %I',
                column_migration.old_name,
                column_migration.new_name
            );
        ELSIF NOT new_column_exists THEN
            EXECUTE format(
                'ALTER TABLE project_tasks ADD COLUMN %I %s',
                column_migration.new_name,
                column_migration.definition
            );
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_sprint_submission_status_check'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_task_submission_status_check'
    ) THEN
        ALTER TABLE project_tasks
            RENAME CONSTRAINT project_tasks_sprint_submission_status_check
            TO project_tasks_task_submission_status_check;
    ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_task_submission_status_check'
    ) THEN
        ALTER TABLE project_tasks
            ADD CONSTRAINT project_tasks_task_submission_status_check
            CHECK (task_submission_status IN (
                'Not submitted',
                'Pending Review',
                'Changes Requested',
                'Completed'
            ));
    END IF;
END
$$;
