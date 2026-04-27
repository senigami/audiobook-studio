# Facade for global application state and job management.
# Original monolithic state.py has been decomposed into specialized sub-modules.

from .models import Job
from .state_helpers import (
    STATE_FILE,
    SAFE_OUTPUT_FILE_RE,
    _STATE_LOCK,
    add_job_listener,
    load_state,
    save_state,
)
from .state_settings import (
    _default_state,
    get_settings,
    update_settings,
)
from .state_performance import (
    _default_performance_metrics,
    get_performance_metrics,
    update_performance_metrics,
)
from .state_jobs import (
    get_jobs,
    put_job,
    update_job,
    prune_completed_jobs,
    delete_jobs,
    clear_all_jobs,
    purge_jobs_for_chapter,
)

# Re-exporting for backward compatibility and centralized access
__all__ = [
    "STATE_FILE",
    "SAFE_OUTPUT_FILE_RE",
    "Job",
    "add_job_listener",
    "load_state",
    "save_state",
    "_default_state",
    "get_settings",
    "update_settings",
    "_default_performance_metrics",
    "get_performance_metrics",
    "update_performance_metrics",
    "get_jobs",
    "put_job",
    "update_job",
    "prune_completed_jobs",
    "delete_jobs",
    "clear_all_jobs",
    "purge_jobs_for_chapter",
]
