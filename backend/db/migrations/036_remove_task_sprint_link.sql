ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS sprint_name;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submission_status TO task_submission_status;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submission_note TO task_submission_note;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submission_attachments TO task_submission_attachments;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submission_links TO task_submission_links;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submitted_by_firebase_uid TO task_submitted_by_firebase_uid;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_submitted_at TO task_submitted_at;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_review_comment TO task_review_comment;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_reviewed_by_firebase_uid TO task_reviewed_by_firebase_uid;

ALTER TABLE project_tasks
    RENAME COLUMN sprint_reviewed_at TO task_reviewed_at;

ALTER TABLE project_tasks
    RENAME CONSTRAINT project_tasks_sprint_submission_status_check
    TO project_tasks_task_submission_status_check;
