from .core import get_connection, init_db, DB_PATH
from .projects import create_project, get_project, list_projects, update_project, delete_project
from .chapters import create_chapter, get_chapter, list_chapters, update_chapter, delete_chapter, reorder_chapters, reset_chapter_audio
from .characters import create_character, get_characters, update_character, delete_character
from .segments import update_segments_status_bulk, get_chapter_segments, update_segment, update_segments_bulk, sync_chapter_segments
from .speakers import create_speaker, get_speaker, list_speakers, update_speaker, delete_speaker, update_voice_profile_references, normalize_base_profiles
from .queue import upsert_queue_row, add_to_queue, get_queue, clear_queue, update_queue_item, reconcile_queue_status, reorder_queue, clear_completed_queue, remove_from_queue
from .reconcile import reconcile_project_audio
from .migration import migrate_state_json_to_db

# Run migration on import if needed
migrate_state_json_to_db()
