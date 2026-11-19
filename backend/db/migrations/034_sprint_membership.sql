UPDATE projects AS project
SET sprints = COALESCE((
    SELECT jsonb_agg(
        (
            sprint.value
                - 'member_firebase_uids'
                - 'assigneeFirebaseUid'
                - 'assignee_firebase_uid'
                - 'assigneeName'
                - 'assignee_name'
                - 'assigneeProfileImage'
                - 'assignee_profile_image'
        ) || jsonb_build_object(
            'memberFirebaseUids',
            CASE
                WHEN jsonb_typeof(sprint.value->'memberFirebaseUids') = 'array'
                    THEN sprint.value->'memberFirebaseUids'
                WHEN jsonb_typeof(sprint.value->'member_firebase_uids') = 'array'
                    THEN sprint.value->'member_firebase_uids'
                WHEN COALESCE(
                    NULLIF(sprint.value->>'assigneeFirebaseUid', ''),
                    NULLIF(sprint.value->>'assignee_firebase_uid', '')
                ) IS NOT NULL
                    THEN jsonb_build_array(COALESCE(
                        NULLIF(sprint.value->>'assigneeFirebaseUid', ''),
                        NULLIF(sprint.value->>'assignee_firebase_uid', '')
                    ))
                ELSE '[]'::jsonb
            END
        )
        ORDER BY sprint.ordinality
    )
    FROM jsonb_array_elements(project.sprints)
        WITH ORDINALITY AS sprint(value, ordinality)
), '[]'::jsonb)
WHERE jsonb_typeof(project.sprints) = 'array';
