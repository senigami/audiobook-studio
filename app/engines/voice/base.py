"""Base voice engine contract.

The long-term goal is for every engine implementation to conform to this
interface so the queue and UI never need engine-specific branches.
"""


class BaseVoiceEngine:
    """Placeholder base voice engine contract."""

    def validate_environment(self):
        raise NotImplementedError

    def validate_request(self, request):
        raise NotImplementedError

    def synthesize(self, request):
        raise NotImplementedError

    def build_voice_asset(self, request):
        raise NotImplementedError

