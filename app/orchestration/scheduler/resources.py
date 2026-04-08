"""Scheduler resource-claim helpers.

This module will describe the normalized resource model that replaces ad-hoc
worker locks and engine-specific scheduling branches.
"""


def reserve_task_resources(*, task_type: str, resource_claims: dict[str, object]) -> dict[str, object]:
    """Describe resource reservation for a scheduled task.

    Args:
        task_type: Queue task type requesting resources.
        resource_claims: Normalized resource claims needed by the task.

    Returns:
        dict[str, object]: Placeholder reservation record.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (task_type, resource_claims)
    raise NotImplementedError
