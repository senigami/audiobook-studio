import pathlib
import sys
import tomllib

def test_python_runtime_version():
    """Verify that the codebase runs under Python 3.11+ as expected."""
    assert sys.version_info >= (3, 11), f"Python 3.11+ required, got {sys.version} instead."


def test_metadata_declares_target_python():
    """Ensure pyproject.toml explicitly specifies target python >=3.11."""
    pyproject_path = pathlib.Path(__file__).parent.parent / "pyproject.toml"
    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)

    requires_python = data.get("project", {}).get("requires-python", "")
    assert requires_python == ">=3.11", f"requires-python expected '>=3.11', got {requires_python}"
