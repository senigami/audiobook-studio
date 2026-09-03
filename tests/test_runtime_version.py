import pathlib
import sys
import tomllib

def test_python_runtime_version():
    """Verify that the codebase runs under Python 3.11+ as expected."""
    assert sys.version_info >= (3, 11), f"Python 3.11+ required, got {sys.version} instead."


def test_metadata_declares_target_python():
    """Ensure pyproject.toml explicitly specifies target python >=3.11."""
    from packaging.specifiers import SpecifierSet
    from packaging.version import Version

    pyproject_path = pathlib.Path(__file__).parent.parent / "pyproject.toml"
    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)

    requires_python = data.get("project", {}).get("requires-python", "")
    assert requires_python, "requires-python is missing from project metadata"

    spec = SpecifierSet(requires_python)
    # Verify that Python 3.10 is NOT allowed, but Python 3.11 IS allowed.
    assert Version("3.10.0") not in spec, f"Python 3.10 should not be allowed under specifier: {requires_python}"
    assert Version("3.11.0") in spec, f"Python 3.11 should be allowed under specifier: {requires_python}"

