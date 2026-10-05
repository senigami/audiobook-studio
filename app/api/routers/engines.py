"""Engines API facade — assembles registry/plugin-management/dev-test routes.

Split (Task 003 — API router split) out of a single 704-line module into:
- ``engines_shared.py``   — non-route helpers (engine-id validation, plugin-dir resolution)
- ``engines_registry.py`` — list/describe/concurrency/settings/requirements/logs/calibration routes
- ``engines_plugins.py``  — refresh/install/import/preview/confirm/staging routes
- ``engines_test.py``     — verify/self-test/dev-scenario/asset routes

Names below are re-exported for backward compatibility with callers that
import directly from ``app.api.routers.engines``.
"""
import logging
from fastapi import APIRouter

from . import engines_registry, engines_plugins, engines_test
from .engines_shared import (
    GithubPreviewRequest,
    ConcurrencyUpdateRequest,
    _check_engine_id,
    _safe_resolve_plugin_dir,
    _is_generated_sample_name,
    _resolve_plugin_dir,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["engines"])
router.include_router(engines_registry.router)
router.include_router(engines_plugins.router)
router.include_router(engines_test.router)

# Backward-compatible aliases for route handlers moved into sub-modules.
list_engines = engines_registry.list_engines
get_official_registry_list = engines_registry.get_official_registry_list
get_engine_concurrency = engines_registry.get_engine_concurrency
update_engine_concurrency = engines_registry.update_engine_concurrency
update_engine_settings = engines_registry.update_engine_settings
clear_engine_setting = engines_registry.clear_engine_setting
get_engine_requirements = engines_registry.get_engine_requirements
remove_engine_plugin = engines_registry.remove_engine_plugin
get_engine_logs = engines_registry.get_engine_logs
reset_engine_calibration = engines_registry.reset_engine_calibration

refresh_plugins = engines_plugins.refresh_plugins
install_engine_dependencies = engines_plugins.install_engine_dependencies
import_engine_plugin = engines_plugins.import_engine_plugin
preview_engine_plugin = engines_plugins.preview_engine_plugin
preview_github_plugin = engines_plugins.preview_github_plugin
confirm_engine_plugin = engines_plugins.confirm_engine_plugin
cancel_engine_plugin_staging = engines_plugins.cancel_engine_plugin_staging

verify_engine = engines_test.verify_engine
get_test_audio = engines_test.get_test_audio
test_engine = engines_test.test_engine
get_engine_scenarios = engines_test.get_engine_scenarios
get_engine_asset = engines_test.get_engine_asset
